import {
  app,
  clipboard,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import _ from "lodash";
import {
  close as closeNSD,
  getChapter,
  getMetadata,
  IChapter,
  IMeta,
  parseURL,
  PROVIDER,
  setCacheDir,
} from "node-syosetu-downloader";
import { Cookies } from "./utils/cookie.js";
import { isArray, isNumber, isObject, isString } from "utils-js";
import { DateTime } from "luxon";
import filenamify from "filenamify";
import { Syosetu, SyosetuFile, SyosetuMeta } from "./models/syosetu.js";
import { createTray, updateTray as udptTray } from "./utils/tray.js";
import { showAlert, showNoti, showOpenDir } from "./utils/message.js";
import {
  createDir,
  readJSON,
  removeDir,
  writeJSON,
  writeText,
} from "./utils/file.js";
import { Update } from "./utils/update.js";

const HOME_DIR = path.join(app.getPath("home"), ".syosetuvm");
const MAX_LABEL_LENGTH = 20;
const PROVIDER_NAMES: Record<string, string> = {
  narou: "小説家になろう",
  kakuyomu: "カクヨム",
  alphapolis: "アルファポリス",
  hameln: "ハーメルン",
};

let cookies = new Cookies(),
  inProgress = false,
  execSync = false,
  execUpdate = false,
  clipboardObserver: NodeJS.Timeout | null = null,
  prevClipboard = "";

// change node-syosetu-downloader cache directory
setCacheDir(path.join(app.getPath("sessionData"), ".puppeteer"));

// hide doc icon
if (process.platform === "darwin") {
  app.dock.hide();
}

// create observer
createClipboardObserver();

setInterval(
  () => {
    updateSyosetuAll().then(() => syncSyosetuAll());
  },
  // 3 hours
  1000 * 60 * 60 * 3
);

// validate cookies
(() => {
  let isUpdated = false;
  if (!isArray(cookies.syosetus)) {
    cookies.syosetus = [];
    isUpdated = true;
  }
  if (!isString(cookies.outputDir)) {
    cookies.outputDir = path.join(app.getPath("home"), "Syosetu Library");
    isUpdated = true;
  }
  if (!isNumber(cookies.updatedAt)) {
    cookies.updatedAt = 0;
    isUpdated = true;
  }
  if (!isNumber(cookies.syncedAt)) {
    cookies.syncedAt = 0;
    isUpdated = true;
  }
  if (isUpdated) {
    cookies.write();
  }
})();

// update every 6 hours
// setInterval(
//   () => {
//     updateItems();
//   },
//   1000 * 60 * 60 * 6
// );

function updateTray() {
  udptTray(createTrayMenu());
}

function convertFileName(str: string) {
  return filenamify(str, { replacement: "_" });
}

function getLabelFromTitle(str: string) {
  if (str.length > MAX_LABEL_LENGTH) {
    return str.substring(0, MAX_LABEL_LENGTH - 2) + "...";
  } else {
    return str;
  }
}

function toDate(d: number) {
  return DateTime.fromMillis(d).toFormat("yyyy-MM-dd") || "Unknown";
}

function toTime(d: number) {
  return DateTime.fromMillis(d).toFormat("yyyy-MM-dd HH:mm:ss") || "Unknown";
}

function getLibPath() {
  return cookies.outputDir;
}

function getLibSyosetuPath(provider: string, bookId: string) {
  return path.join(getLibPath(), provider, convertFileName(bookId));
}

function getLibSyosetuMetaPath(provider: string, bookId: string) {
  return path.join(getLibPath(), provider, convertFileName(bookId), "0.txt");
}

function getLibSyosetuFilePath(
  provider: string,
  syosetuTitle: string,
  seq: number
) {
  return path.join(
    getLibPath(),
    provider,
    convertFileName(syosetuTitle),
    seq + ".txt"
  );
}

function getSyosetuPath(provider: string, bookId: string) {
  return path.join(HOME_DIR, provider, convertFileName(bookId));
}

function getSyosetuMetaPath(provider: string, bookId: string, metaId: string) {
  return path.join(
    HOME_DIR,
    provider,
    convertFileName(bookId),
    metaId + ".json"
  );
}

function getSyosetuFilePath(
  provider: string,
  bookId: string,
  chapterId: string
) {
  // narou short
  if (chapterId === "") {
    chapterId = "0";
  }
  return path.join(
    HOME_DIR,
    provider,
    convertFileName(bookId),
    convertFileName(chapterId) + ".json"
  );
}

function getCurrentMetaIndex(syosetu: Syosetu) {
  return syosetu.metaIndex < 0
    ? syosetu.metas.length - 1
    : Math.min(syosetu.metas.length - 1, syosetu.metaIndex);
}

function getCurrentMeta(syosetu: Syosetu) {
  const currMetaIndex = getCurrentMetaIndex(syosetu);
  const currMeta = syosetu.metas[currMetaIndex];
  return currMeta;
}

function getCurrentMetaRange(syosetu: Syosetu, halfSize: number) {
  const currMetaIndex = getCurrentMetaIndex(syosetu);

  const minIndex = 0;
  const maxIndex = syosetu.metas.length;
  const startIndex = Math.max(minIndex, currMetaIndex - halfSize);
  const endIndex = Math.min(maxIndex, currMetaIndex + halfSize);

  return [startIndex, endIndex];
}

function saveCookies() {
  if (!inProgress) {
    cookies.write();
  }
}

function createClipboardObserver() {
  removeClipboardObserver();
  clipboardObserver = setInterval(() => {
    const currClipboard = clipboard.readText();
    if (prevClipboard !== currClipboard) {
      prevClipboard = currClipboard;
      parseClipboard(currClipboard);
      updateSyosetuAll().then(() => syncSyosetuAll());
    }
  }, 512);
}

function removeClipboardObserver() {
  if (clipboardObserver) {
    clearInterval(clipboardObserver);
    clipboardObserver = null;
  }
}

function parseClipboard(text: string) {
  let addedCount = 0,
    cancelledCount = 0;

  for (const { provider, id, url } of parseURL(text.trim())) {
    const isDupe = cookies.syosetus.find((item) => {
      return item.provider === provider && item.id === id;
    });
    if (isDupe) {
      cancelledCount++;
      continue;
    }

    const newSyosetu: Syosetu = {
      url: url,
      provider: provider,
      id: id,
      metas: [],
      metaIndex: -1, // latest
      files: [],
      createdAt: Date.now(),
      updatedAt: 0,
      removedAt: 0,
      syncedAt: 0,
    };

    cookies.syosetus.push(newSyosetu);
    addedCount++;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`${addedCount} url(s) added.`);
  } else if (addedCount > 0) {
    showNoti(`${addedCount} url(s) added.`);
  }

  updateTray();
}

async function updateSyosetu(syosetu: Syosetu) {
  let isUpdated = false;

  const { url, provider, metas, files } = syosetu;
  const bookId = syosetu.id;
  const lastMeta = metas[metas.length - 1];

  if (syosetu.removedAt) {
    console.error(`Removed syosetu will not be updated: ${provider}/${bookId}`);
    return isUpdated;
  }

  try {
    // download latest meta and compare it to previous meta
    const latestMeta = await getMetadata(provider, bookId);
    if (!lastMeta || lastMeta.updatedAt !== latestMeta.updatedAt) {
      const metaId = "_" + latestMeta.updatedAt;
      const metaPath = getSyosetuMetaPath(provider, bookId, metaId);
      writeJSON(metaPath, latestMeta);

      const prevMeta = syosetu.metas.find((meta) => meta.id === metaId);
      if (!prevMeta) {
        const newMeta: SyosetuMeta = {
          id: metaId,
          path: metaPath,
          title: latestMeta.title,
          updatedAt: latestMeta.updatedAt,
        };

        metas.push(newMeta);
      }

      // create new files from latest meta chapter ids
      for (const chapterId of latestMeta.chapterIds) {
        const prevFile = files.find((item) => item.id === chapterId);
        if (prevFile) {
          continue;
        }

        try {
          const filePath = getSyosetuFilePath(provider, bookId, chapterId);
          const newFile: SyosetuFile = {
            id: chapterId,
            path: filePath,
            updatedAt: Date.now(),
            removedAt: 0,
          };

          files.push(newFile);

          syosetu.updatedAt = Date.now();
          isUpdated = true;
        } catch (err) {
          console.error(
            `Chapter Creation Error: ${provider}/${bookId}/${chapterId}`
          );
        }
      }

      syosetu.updatedAt = Date.now();
      isUpdated = true;
    }
  } catch (err) {
    if (isObject(err) && err.status === 404) {
      console.error(`Syosetu has been removed: ${provider}/${bookId}`);
      syosetu.removedAt = Date.now();
      isUpdated = true;
    } else {
      console.error(`Metadata Fetch Error: ${provider}/${bookId}`);
    }
    return isUpdated;
  }

  // download and write chapters
  for (const file of files) {
    const chapterId = file.id;

    if (file.removedAt) {
      console.error(
        `Removed chapters will not be download: ${provider}/${bookId}/${chapterId}`
      );
      continue;
    }

    try {
      const filePath = getSyosetuFilePath(provider, bookId, chapterId);
      if (fs.existsSync(filePath)) {
        continue;
      }

      const fileData = await getChapter(provider, bookId, chapterId);
      writeJSON(filePath, fileData);

      file.updatedAt = Date.now();
      syosetu.updatedAt = Date.now();
      isUpdated = true;
    } catch (err) {
      if (isObject(err) && err.status === 404) {
        console.error(
          `Chapter has been removed: ${provider}/${bookId}/${chapterId}`
        );
        file.removedAt = Date.now();
        isUpdated = true;
      } else {
        console.error(
          `Chapter Fetch Error: ${provider}/${bookId}/${chapterId}`
        );
      }
    }
  }

  return isUpdated;
}

async function updateSyosetuAll() {
  if (inProgress) {
    execUpdate = true;
    return;
  }

  inProgress = true;
  execUpdate = false;

  updateTray();

  let i = 0,
    updatedCount = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    const isUpdated = await updateSyosetu(syosetu);
    if (isUpdated) {
      updatedCount++;
      cookies.updatedAt = Date.now();
    }
    cookies.write();
    i++;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`${updatedCount} syosetu updated.`);
  } else if (updatedCount > 0) {
    showNoti(`${updatedCount} syosetu updated.`);
  }

  inProgress = false;
  updateTray();

  if (execUpdate) {
    await updateSyosetuAll();
  } else {
    // close browser
    await closeNSD();
  }
}

async function forceUpdateChapters(syosetu: Syosetu) {
  if (inProgress) {
    showAlert(
      "Another process is running. Wait until it completes and try again.",
      null,
      null,
      { type: "warning" }
    );
    return;
  }
  if (syosetu.removedAt) {
    showAlert("Removed syosetu cannot be downloaded.", null, null, {
      type: "warning",
    });
    return;
  }

  inProgress = true;
  updateTray();

  const { provider } = syosetu;
  const bookId = syosetu.id;

  // download and write chapters
  let isUpdated = false;
  for (const file of syosetu.files) {
    const chapterId = file.id;

    if (file.removedAt) {
      console.error(
        `Removed chapters will not be download: ${provider}/${bookId}/${chapterId}`
      );
      continue;
    }

    try {
      const filePath = getSyosetuFilePath(provider, bookId, chapterId);
      const fileData = await getChapter(provider, bookId, chapterId);

      // overwrite chapter file
      writeJSON(filePath, fileData);

      file.updatedAt = Date.now();
      syosetu.updatedAt = Date.now();
      isUpdated = true;
    } catch (err) {
      if (isObject(err) && err.status === 404) {
        console.error(
          `Chapter has been removed: ${provider}/${bookId}/${chapterId}`
        );
        file.removedAt = Date.now();
        isUpdated = true;
      } else {
        console.error(
          `Chapter Fetch Error: ${provider}/${bookId}/${chapterId}`
        );
      }
    }
  }

  inProgress = false;
  updateTray();

  if (isUpdated) {
    cookies.write();
  }
}

function syncSyosetu(syosetu: Syosetu) {
  let isSynced = false;

  const provider = syosetu.provider;
  const bookId = syosetu.id;
  const currMeta = getCurrentMeta(syosetu);
  const meta = currMeta
    ? (readJSON(currMeta.path) as IMeta | undefined)
    : undefined;

  if (!meta) {
    return isSynced;
  }

  const libPath = getLibSyosetuPath(provider, bookId);
  // 1 min
  const isUpdated =
    !fs.existsSync(libPath) || syosetu.syncedAt + 1000 * 60 < syosetu.updatedAt;

  if (!isUpdated) {
    return isSynced;
  }

  syosetu.syncedAt = Date.now();
  isSynced = true;

  // clear directory
  removeDir(libPath);

  // create info file
  (() => {
    const filePath = getLibSyosetuMetaPath(provider, bookId);
    let info = "";
    info += `URL=${syosetu.url}\n`;
    info += `TITLE=${meta.title}\n`;
    info += `AUTHOR=${meta.author}\n`;
    info += `IS_COMPLETED=${!meta.onGoing ? "Yes" : "No"}\n`;
    info += `NUMBER_OF_CHAPTERS=${meta.chapterIds.length}\n`;
    info += `CREATED_AT=${toTime(meta.createdAt)}\n`;
    info += `UPDATED_AT=${toTime(meta.updatedAt)}\n`;
    info += `OUTLINE=\n${meta.outline}\n`;
    writeText(filePath, info);
  })();

  // create txt files
  for (let i = 0; i < meta.chapterIds.length; i++) {
    const chapterId = meta.chapterIds[i];
    const chapterFile = syosetu.files.find((file) => file.id === chapterId);
    const txtPath = getLibSyosetuFilePath(provider, bookId, i + 1);
    const chapter = chapterFile
      ? (readJSON(chapterFile.path) as IChapter | undefined)
      : undefined;

    let txtData = "";
    if (!chapter) {
      txtData = "FILE NOT FOUND";
    } else {
      txtData = `${chapter.title}\n\n${chapter.content}`;
    }

    writeText(txtPath, txtData);
  }

  return isSynced;
}

async function syncSyosetuAll() {
  if (inProgress) {
    execSync = true;
    return;
  }

  inProgress = true;
  execSync = false;

  updateTray();

  let i = 0,
    synchronizedCount = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    try {
      const isSynced = syncSyosetu(syosetu);
      if (isSynced) {
        synchronizedCount++;
        cookies.syncedAt = Date.now();
      }
      cookies.write();
    } catch (err) {
      console.error(err);
    }
    i++;
  }

  inProgress = false;
  updateTray();

  if (execUpdate) {
    await updateSyosetuAll();
    await syncSyosetuAll();
  } else if (execSync) {
    await syncSyosetuAll();
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`${synchronizedCount} syosetu synchronized.`);
  }
}

function createTrayMenu() {
  const syncMenuItems: MenuItemConstructorOptions[] = [];
  for (const provider of Object.keys(PROVIDER_NAMES)) {
    const syosetus = cookies.syosetus.filter(
      (item) => item.provider === provider
    );

    const syosetusMenuItems: MenuItemConstructorOptions[] = [];
    for (const syosetu of syosetus) {
      const currMeta = getCurrentMeta(syosetu);
      const [startIndex, endIndex] = getCurrentMetaRange(syosetu, 5);

      const versionMenuItems: MenuItemConstructorOptions[] = [
        {
          enabled: false,
          label: syosetu.syncedAt
            ? toTime(syosetu.syncedAt)
            : "Never sychronized",
        },
        {
          enabled: false,
          label: `${syosetu.metas.length} versions`,
        },
        ...(syosetu.removedAt
          ? [
              {
                enabled: false,
                label: `Removed from the web`,
              },
            ]
          : []),
        { type: "separator" },
      ];

      for (let i = startIndex; i < endIndex; i++) {
        const meta = syosetu.metas[i];
        const index =
          i === syosetu.metas.length - 1
            ? -1 // latest
            : i;

        versionMenuItems.push({
          enabled: meta.id !== currMeta.id,
          label: toTime(meta.updatedAt),
          click: () => {
            syosetu.metaIndex = index;
            syosetu.syncedAt = 0;
            saveCookies();
            syncSyosetuAll();
          },
        });
      }

      versionMenuItems.push(
        { type: "separator" },
        {
          label:
            process.platform === "darwin"
              ? "Open in Finder"
              : `Open in File Explorer`,
          click: () => {
            const dirPath = getLibSyosetuPath(provider, syosetu.id);
            if (fs.existsSync(dirPath)) {
              shell.openPath(dirPath);
            }
          },
        },
        {
          label:
            process.platform === "darwin"
              ? "Open in Browser"
              : `Open in Browser`,
          click: () => {
            shell.openExternal(syosetu.url);
          },
        },
        { type: "separator" },
        {
          label: `Force Update`,
          click: () => {
            forceUpdateChapters(syosetu).then(() => syncSyosetuAll());
          },
        },
        {
          label: `Remove`,
          click: () => {
            const index = cookies.syosetus.findIndex(
              (item) => item.id === syosetu.id
            );
            if (index > -1) {
              const rms = cookies.syosetus.splice(index, 1)[0];
              const p1 = getSyosetuPath(rms.provider, rms.id);
              const p2 = getLibSyosetuPath(rms.provider, rms.id);
              removeDir(p1);
              removeDir(p2);
              saveCookies();
            }
            updateTray();
          },
        }
      );

      syosetusMenuItems.push({
        label: currMeta ? getLabelFromTitle(currMeta.title) : "ERROR",
        submenu: versionMenuItems,
      });
    }

    syncMenuItems.push({
      label: PROVIDER_NAMES[provider],
      submenu: syosetusMenuItems,
    });
  }

  return Menu.buildFromTemplate([
    ...(inProgress
      ? ([
          { enabled: false, label: "Updating..." },
          { type: "separator" },
        ] as MenuItemConstructorOptions[])
      : []),
    ...syncMenuItems,
    { type: "separator" },
    {
      label: "Help",
      submenu: [
        {
          visible: false,
          enabled: false,
          label: cookies.updatedAt
            ? toTime(cookies.updatedAt)
            : "Never updated",
        },
        {
          enabled: false,
          label: cookies.syncedAt
            ? toTime(cookies.syncedAt)
            : "Never synchronized",
        },
        {
          enabled: false,
          label: `${cookies.syosetus.length} syosetu`,
        },
        {
          type: "separator",
        },
        {
          visible: false,
          label:
            process.platform === "darwin"
              ? "Open in Finder"
              : `Open in File Explorer`,
          click: async (menuItem, baseWindow, event) => {
            const dirPath = getLibPath();
            createDir(dirPath);
            shell.openPath(dirPath);
          },
        },
        {
          visible: false,
          type: "separator",
        },
        {
          visible: false,
          label: "Change Directory",
          click: async (menuItem, baseWindow, event) => {
            const dirPath = await showOpenDir({
              title: "Select an export directory",
              defaultPath: getLibPath(),
            });
            if (!dirPath) {
              return;
            }
            if (cookies.outputDir === dirPath) {
              return;
            }

            if (process.env.NODE_ENV === "development") {
              console.log("Change export directory:", cookies.outputDir);
            }

            cookies.outputDir = dirPath;
            for (const syosetu of cookies.syosetus) {
              syosetu.syncedAt = 0;
            }

            saveCookies();
            syncSyosetuAll();
          },
        },
        {
          label: "Open Github",
          // accelerator: "Ctrl + H",
          click: async () => {
            await shell.openExternal(
              "https://github.com/shinich39/syosetu-version-manager"
            );
          },
        },
      ],
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
}

app.whenReady().then(() => {
  createTray(createTrayMenu());
  // app.on("activate", () => {});

  Update.github("shinich39", "syosetu-version-manager");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
