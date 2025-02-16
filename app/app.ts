import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  Notification,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  __dirname,
  createDir,
  createImage,
  electron,
  getAssetPath,
  readJSON,
  removeDir,
  showNoti,
  showOpenDir,
  writeJSON,
  writeText,
} from "./libs/utils.js";
import "./libs/menu.js";
import _ from "lodash";
import {
  close as closeNSD,
  getChapter,
  getMetadata,
  IChapter,
  IMeta,
  parseURL,
  PROVIDER,
} from "node-syosetu-downloader";
import { Cookies } from "./models/cookie.js";
import { isArray, isNumber, isString } from "utils-js";
import { DateTime } from "luxon";
import filenamify from "filenamify";
import { updateElectronApp, UpdateSourceType } from "update-electron-app";
import { Syosetu, SyosetuFile, SyosetuMeta } from "./models/syosetu.js";

const isDev = process.env.NODE_ENV === "development";
const isMac = process.platform === "darwin";
const HOME_DIR = path.join(app.getPath("home"), ".syosetuvm");
const MAX_LABEL_LENGTH = 20;
const PROVIDER_NAMES: Record<string, string> = {
  narou: "小説家になろう",
  kakuyomu: "カクヨム",
  alphapolis: "アルファポリス",
  hameln: "ハーメルン",
};

let tray: Tray | null = null,
  cookies = new Cookies(),
  inProgress = false,
  execSync = false,
  execUpdate = false,
  clipboardObserver: NodeJS.Timeout | null = null,
  prevClipboard = "";

// hide doc icon
if (isMac) {
  app.dock.hide();
}

// create observer
createClipboardObserver();

setInterval(
  () => {
    updateSyosetuAll().then(() => syncSyosetuAll());
  },
  // 6 hours
  1000 * 60 * 60 * 6
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
      syncedAt: 0,
    };

    cookies.syosetus.push(newSyosetu);
    addedCount++;
  }

  if (isDev) {
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

  try {
    const latestMeta = await getMetadata(provider, bookId);
    if (!lastMeta || lastMeta.updatedAt !== latestMeta.updatedAt) {
      const metaId = "" + latestMeta.updatedAt;
      const metaPath = getSyosetuMetaPath(provider, bookId, metaId);
      const newMeta: SyosetuMeta = {
        id: metaId,
        title: latestMeta.title,
        updatedAt: latestMeta.updatedAt,
        path: metaPath,
      };

      metas.push(newMeta);
      syosetu.updatedAt = Date.now();
      isUpdated = true;

      writeJSON(metaPath, latestMeta);

      for (const chapterId of latestMeta.chapterIds) {
        try {
          const filePath = getSyosetuFilePath(provider, bookId, chapterId);
          if (fs.existsSync(filePath)) {
            continue;
          }

          const fileData = await getChapter(provider, bookId, chapterId);

          const newFile: SyosetuFile = {
            id: chapterId,
            createdAt: Date.now(),
            path: filePath,
          };

          files.push(newFile);

          writeJSON(filePath, fileData);
        } catch (err) {
          console.error(err);
        }
      }
    }
  } catch (err) {
    console.error(err);
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

  let i = 0,
    updatedCount = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    const isUpdated = await updateSyosetu(syosetu);
    if (isUpdated) {
      updatedCount++;
    }
    cookies.write();
    i++;
  }

  if (isDev) {
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

function syncSyosetu(syosetu: Syosetu) {
  let isSynced = false;

  const provider = syosetu.provider;
  const bookId = syosetu.id;
  const currMeta = getCurrentMeta(syosetu);
  const meta = readJSON(currMeta.path) as IMeta | undefined;
  if (!meta) {
    return isSynced;
  }

  const libPath = getLibSyosetuPath(provider, bookId);
  const isUpdated =
    !fs.existsSync(libPath) || syosetu.syncedAt < syosetu.updatedAt + 1000 * 60; // 1 min

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

  let i = 0,
    synchronizedCount = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    try {
      const isSynced = syncSyosetu(syosetu);
      if (isSynced) {
        synchronizedCount++;
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

  if (isDev) {
    console.log(`${synchronizedCount} syosetu synchronized.`);
  }
}

function createTrayMenu() {
  const exportMenuItems: MenuItemConstructorOptions[] = [
    {
      label: "Library",
      submenu: [
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
          label: isMac ? "Open in Finder" : `Open in File Explorer`,
          click: async (menuItem, baseWindow, event) => {
            const dirPath = getLibPath();
            createDir(dirPath);
            shell.openPath(dirPath);
          },
        },
        {
          type: "separator",
        },
        {
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

            if (isDev) {
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
      ],
    },
  ];

  const syncMenuItems: MenuItemConstructorOptions[] = [];
  for (const provider of Object.keys(PROVIDER_NAMES)) {
    const syosetus = cookies.syosetus.filter(
      (item) => item.provider === provider
    );

    const syosetusMenuItems: MenuItemConstructorOptions[] = [];
    for (const syosetu of syosetus) {
      const currMeta = getCurrentMeta(syosetu);

      // never initialized
      if (!currMeta) {
        continue;
      }

      const [startIndex, endIndex] = getCurrentMetaRange(syosetu, 5);

      const versionMenuItems: MenuItemConstructorOptions[] = [
        {
          enabled: false,
          label: syosetu.syncedAt
            ? toTime(syosetu.syncedAt)
            : "Never sychronized",
        },
        { type: "separator" },
        {
          label: isMac ? "Open in Finder" : `Open in File Explorer`,
          click: () => {
            const dirPath = getLibSyosetuPath(provider, syosetu.id);
            if (fs.existsSync(dirPath)) {
              shell.openPath(dirPath);
            }
          },
        },
        {
          label: isMac ? "Open in Browser" : `Open in Browser`,
          click: () => {
            shell.openExternal(syosetu.url);
          },
        },
        { type: "separator" },
        {
          enabled: false,
          label: `${syosetu.metas.length} versions`,
        },
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
        label: getLabelFromTitle(currMeta.title),
        submenu: versionMenuItems,
      });
    }

    syncMenuItems.push({
      label: PROVIDER_NAMES[provider],
      submenu: syosetusMenuItems,
    });
  }

  return Menu.buildFromTemplate([
    ...exportMenuItems,
    { type: "separator" },
    ...syncMenuItems,
    { type: "separator" },
    {
      label: "Help",
      click: () => {
        shell.openExternal(
          "https://github.com/shinich39/syosetu-version-manager"
        );
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
}

function createTray() {
  if (tray) {
    tray.destroy();
  }

  const trayIcon = createImage(
    getAssetPath(isMac ? "icon-white.png" : "icon.png"),
    { width: 16, height: 16 }
  );

  const newTray = new Tray(trayIcon);
  newTray.setToolTip("This is my application.");

  // newTray.on("click", function () {
  //   newTray.popUpContextMenu();
  // });

  tray = newTray;

  updateTray();

  return newTray;
}

function updateTray() {
  if (tray) {
    tray.setContextMenu(createTrayMenu());
  }
}

app.whenReady().then(() => {
  createTray();
  app.on("activate", () => {
    if (!isDev) {
      updateElectronApp({
        updateSource: {
          type: UpdateSourceType.ElectronPublicUpdateService,
          repo: "shinich39/syosetu-version-manager",
        },
        updateInterval: "1 hour",
        // logger: require('electron-log')
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});
