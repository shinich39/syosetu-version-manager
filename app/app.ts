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
import {
  generateRandomNumber,
  isArray,
  isError,
  isNumber,
  isObject,
  isString,
  wait,
} from "utils-js";
import { DateTime } from "luxon";
import filenamify from "filenamify";
import { Syosetu, SyosetuFile, SyosetuMeta } from "./models/syosetu.js";
import { createTray, updateTray as udptTray } from "./utils/tray.js";
import {
  showAlert,
  showNoti,
  showOpenDir,
  showSaveFile,
} from "./utils/message.js";
import {
  createDir,
  readJSON,
  removeDir,
  writeJSON,
  writeText,
} from "./utils/file.js";
import { Update } from "./utils/update.js";
import { getBorderCharacters, table } from "table";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
const { createLogger, format, transports } = winston;

// fix windows app id
if (process.platform === "win32") {
  app.setAppUserModelId("com.shinich39.syosetuversionmanager");
}

const IS_DEV = process.env.NODE_ENV === "development";
const UPDATE_DELAY = 1000 * 60 * 60 * 3; // 3 hours
const ADJUSTED_UPDATE_DELAY = 1000 * 60 * 60 * 3 + 1000 * 60 * 3; // 3 hours 3 mins
const HOME_DIR = path.join(app.getPath("home"), ".syosetuvm");
const MAX_LABEL_LENGTH = 39;
const PROVIDER_NAMES: Record<string, string> = {
  narou: "小説家になろう",
  kakuyomu: "カクヨム",
  alphapolis: "アルファポリス",
  hameln: "ハーメルン",
};

const ENTITIES = {
  UPDATED: "(new)",
  COMPLETED: "(completed)",
  SELECTED: "(selected)",
  ERRORED: "(error)",
};

let cookies = new Cookies(),
  inProgress = false,
  execSync = false,
  execUpdate = false,
  clipboardObserver: NodeJS.Timeout | null = null,
  prevClipboard = clipboard.readText();

const logger = createLogger({
  format: format.combine(
    format.errors({ stack: true }),
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:SSS" })
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(HOME_DIR, "logs", "%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      level: "error",
      maxSize: "20m",
      maxFiles: "14d",
      format: format.combine(
        format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp}\n${stack || message}`;
        })
      ),
    }),
  ],
});

// change node-syosetu-downloader cache directory
setCacheDir(path.join(app.getPath("sessionData"), ".puppeteer"));

// hide doc icon
if (process.platform === "darwin" && app.dock) {
  app.dock.hide();
}

// create observer
createClipboardObserver();

(() => {
  // force update with run
  updateSyosetuAll(true).then(syncSyosetuAll);

  setInterval(
    () => {
      // warmup
      wait(1024 * 60)
        .then(() => {
          updateSyosetuAll(true);
        })
        .then(syncSyosetuAll);
    },
    // 3 hours
    UPDATE_DELAY
  );
})();

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

function toISOTime(d: number) {
  return DateTime.fromMillis(d).toISO({ includeOffset: false }) || "Unknown";
}

function getLibPath() {
  return cookies.outputDir;
}

function getLibSyosetuFilePath(provider: string, syosetuTitle: string) {
  return path.join(
    getLibPath(),
    provider,
    convertFileName(syosetuTitle) + ".txt"
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
    "(" + convertFileName(metaId) + ").json"
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
      const createdCount = parseClipboard(currClipboard);
      if (createdCount > 0) {
        updateSyosetuAll().then(syncSyosetuAll);
      }
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
      completedAt: 0,
      erroredAt: 0,
      syncedAt: 0,
    };

    cookies.syosetus.push(newSyosetu);
    addedCount++;
  }

  if (IS_DEV) {
    console.log(`${addedCount} syosetu added.`);
  } else if (addedCount > 0) {
    showNoti(`${addedCount} syosetu added.`);
  }

  updateTray();

  return addedCount;
}

async function updateSyosetu(syosetu: Syosetu, force?: boolean) {
  const { url, provider, metas, files } = syosetu;
  const bookId = syosetu.id;
  const lastMeta = metas[metas.length - 1];

  // reset erroredAt
  syosetu.erroredAt = 0;

  if (syosetu.completedAt) {
    if (IS_DEV) {
      console.log(
        `Completed syosetu will not be updated: ${provider}/${bookId}`
      );
    }
    return;
  }

  if (syosetu.removedAt) {
    if (IS_DEV) {
      console.log(`Removed syosetu will not be updated: ${provider}/${bookId}`);
    }
    return;
  }

  if (syosetu.updatedAt + ADJUSTED_UPDATE_DELAY > Date.now() && !force) {
    if (IS_DEV) {
      console.log(`Not time to update yet: ${provider}/${bookId}`);
    }
    return;
  }

  try {
    // download latest meta and compare it to previous meta
    const latestMeta = await getMetadata(provider, bookId);
    const metaId = "" + latestMeta.updatedAt;

    // save meta
    const metaPath = getSyosetuMetaPath(provider, bookId, metaId);
    if (!fs.existsSync(metaPath)) {
      writeJSON(metaPath, latestMeta);
    }

    // check completed
    if (!latestMeta.onGoing) {
      syosetu.completedAt = latestMeta.updatedAt;
    }

    // sync after update
    const isUpdated = !lastMeta || lastMeta.updatedAt !== latestMeta.updatedAt;
    if (isUpdated) {
      // set updatedAt
      syosetu.updatedAt = Date.now();

      // append new meta
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
        } catch (err) {
          console.error(`Chapter Error: ${provider}/${bookId}/${chapterId}`);
          logger.error(
            new Error(
              (isError(err) ? err.message : "ChapterError") +
                `: ${provider}/${bookId}/${chapterId}`
            )
          );
        }
      }
    }
  } catch (err) {
    if (isError(err) && err.status === 404) {
      console.error(`Syosetu has been removed: ${provider}/${bookId}`);
      syosetu.removedAt = Date.now();
    } else {
      console.error(`Metadata Fetch Error: ${provider}/${bookId}`);
      syosetu.erroredAt = Date.now();
      logger.error(
        new Error(
          (isError(err) ? err.message : "FetchError") +
            `: ${provider}/${bookId}`
        )
      );
    }
    // skip file update
    return;
  }

  // download and write chapters
  for (const file of files) {
    const chapterId = file.id;

    file.updatedAt = Date.now();

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
    } catch (err) {
      if (isError(err) && err.status === 404) {
        console.error(
          `Chapter has been removed: ${provider}/${bookId}/${chapterId}`
        );
        file.removedAt = Date.now();
      } else {
        console.error(
          `Chapter Fetch Error: ${provider}/${bookId}/${chapterId}`
        );
        syosetu.erroredAt = Date.now();
        logger.error(
          new Error(
            (isError(err) ? err.message : "FetchError") +
              `: ${provider}/${bookId}/${chapterId}`
          )
        );
      }
    }

    // delay
    await wait(512 * generateRandomNumber(2, 4));
  }
}

async function updateSyosetuAll(force?: boolean) {
  let updatedCount = 0;

  if (inProgress) {
    execUpdate = true;
    return updatedCount;
  }

  inProgress = true;
  execUpdate = false;
  updateTray();

  if (IS_DEV && force) {
    console.log("start forced update.");
  }

  let i = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    try {
      const prevUpdatedAt = syosetu.updatedAt;
      await updateSyosetu(syosetu, force);
      if (prevUpdatedAt !== syosetu.updatedAt) {
        updatedCount++;
      }
    } catch (err) {
      console.error(err);
    }

    cookies.updatedAt = Date.now();

    if (execUpdate) {
      execUpdate = false;
      i = 0;
    } else {
      i++;
    }

    // delay
    await wait(512 * generateRandomNumber(2, 4));
  }

  if (IS_DEV) {
    console.log(`${updatedCount} syosetu updated.`);
  } else if (updatedCount > 0) {
    showNoti(`${updatedCount} syosetu updated.`);
  }

  try {
    // close browser
    await closeNSD();
  } catch (err) {
    console.error(err);
  }

  execUpdate = false;
  inProgress = false;
  cookies.write();
  updateTray();

  return updatedCount;
}

function syncSyosetu(syosetu: Syosetu) {
  const provider = syosetu.provider;
  const bookId = syosetu.id;

  const currMeta = getCurrentMeta(syosetu);
  if (!currMeta) {
    return;
  }

  // read meta.json
  const currMetaData = readJSON(currMeta.path) as IMeta | undefined;
  if (!currMetaData) {
    return;
  }

  // check syosetu is updated
  const filePath = getLibSyosetuFilePath(provider, currMeta.title);
  const isUpdated =
    syosetu.updatedAt > syosetu.syncedAt || !fs.existsSync(filePath);
  if (!isUpdated) {
    return;
  }

  syosetu.syncedAt = Date.now();

  const texts = [];

  // create info
  texts.push(
    table(
      [
        ["URL", syosetu.url],
        ["TITLE", currMetaData.title],
        ["AUTHOR", currMetaData.author],
        ["COMPLETE", !currMetaData.onGoing ? "YES" : "NO"],
        ["NUMBER_OF_CHAPTERS", "" + currMetaData.chapterIds.length],
        ["CREATED", toISOTime(currMetaData.createdAt)],
        ["UPDATED", toISOTime(currMetaData.updatedAt)],
        ["OUTLINE", currMetaData.outline],
      ],
      {
        border: getBorderCharacters("void"),
        columns: [{}, { width: 100 }],
        // drawHorizontalLine: () => false,
        // drawVerticalLine: () => false,
      }
    )
  );

  // create chapters
  for (let i = 0; i < currMetaData.chapterIds.length; i++) {
    const chapterId = currMetaData.chapterIds[i];
    const chapterFile = syosetu.files.find((file) => file.id === chapterId);
    const chapter = chapterFile
      ? (readJSON(chapterFile.path) as IChapter | undefined)
      : undefined;

    if (!chapter) {
      texts.push(`${chapterId}\n\n\n\nFILE NOT FOUND`);
    } else {
      texts.push(`${chapter.title}\n\n\n\n${chapter.content}`);
    }
  }

  // create joined txt file
  writeText(filePath, texts.join("\n\n\n\n"));
}

async function syncSyosetuAll() {
  let synchronizedCount = 0;

  if (inProgress) {
    execSync = true;
    return synchronizedCount;
  }

  inProgress = true;
  execSync = false;
  updateTray();

  let i = 0;
  while (i < cookies.syosetus.length) {
    const syosetu = cookies.syosetus[i];
    try {
      const prevSyncedAt = syosetu.syncedAt;
      syncSyosetu(syosetu);
      if (prevSyncedAt !== syosetu.syncedAt) {
        synchronizedCount++;
      }
    } catch (err) {
      console.error(err);
    }

    cookies.syncedAt = Date.now();

    if (execUpdate) {
      execUpdate = false;
      execSync = false;
      try {
        await updateSyosetuAll();
      } catch (err) {
        console.error(err);
      }
      i = 0;
    } else if (execSync) {
      execSync = false;
      i = 0;
    } else {
      i++;
    }
  }

  execSync = false;
  inProgress = false;
  updateTray();
  cookies.write();

  if (IS_DEV) {
    console.log(`${synchronizedCount} syosetu synchronized.`);
  }

  return synchronizedCount;
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
      const lastMeta = syosetu.metas[syosetu.metas.length - 1];
      const isCompleted = syosetu.completedAt;
      const isErrored = syosetu.erroredAt;

      // updated within 24 hours
      const isUpdated =
        lastMeta && lastMeta.updatedAt + 1000 * 60 * 60 * 24 > Date.now();

      let syosutuLabel = "";
      if (!currMeta) {
        syosutuLabel = "Initializing...";
      } else if (!currMeta.title) {
        syosutuLabel = "Failed to initialize!";
      } else if (isErrored) {
        syosutuLabel =
          `${ENTITIES.ERRORED} ` + getLabelFromTitle(currMeta.title);
      } else if (isUpdated) {
        syosutuLabel =
          `${ENTITIES.UPDATED} ` + getLabelFromTitle(currMeta.title);
      } else if (isCompleted) {
        syosutuLabel =
          `${ENTITIES.COMPLETED} ` + getLabelFromTitle(currMeta.title);
      } else {
        syosutuLabel = getLabelFromTitle(currMeta.title);
      }

      const versionMenuItems: MenuItemConstructorOptions[] = [
        {
          enabled: false,
          label: "Last updated on",
        },
        {
          enabled: false,
          label: syosetu.updatedAt
            ? toTime(syosetu.updatedAt)
            : "Never updated",
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

        // change version
        versionMenuItems.push({
          // enabled: meta.id !== currMeta.id,
          label:
            toTime(meta.updatedAt) +
            (meta.id === currMeta.id ? ` ${ENTITIES.SELECTED}` : ""),
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

        // {
        //   label:
        //     process.platform === "darwin"
        //       ? "Open in Finder"
        //       : `Open in File Explorer`,
        //   click: () => {
        //     const dirPath = getLibSyosetuPath(provider, syosetu.id);
        //     if (fs.existsSync(dirPath)) {
        //       shell.openPath(dirPath);
        //     }
        //   },
        // },

        {
          label: process.platform === "darwin" ? "Read" : `Read`,
          click: () => {
            const currMeta = getCurrentMeta(syosetu);
            if (currMeta) {
              const filePath = getLibSyosetuFilePath(provider, currMeta.title);
              if (fs.existsSync(filePath)) {
                shell.openPath(filePath);
              }
            }
          },
        },
        { type: "separator" },
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
          label: `Remove`,
          click: () => {
            const index = cookies.syosetus.findIndex(
              (item) => item.id === syosetu.id
            );
            if (index > -1) {
              const rms = cookies.syosetus.splice(index, 1)[0];
              const p1 = getSyosetuPath(rms.provider, rms.id);
              removeDir(p1);
              saveCookies();
            }
            updateTray();
          },
        }
      );

      syosetusMenuItems.push({
        label: syosutuLabel,
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
          enabled: false,
          label: "Last updated on",
        },
        {
          // visible: false,
          enabled: false,
          label: cookies.updatedAt
            ? toTime(cookies.updatedAt)
            : "Never updated",
        },

        // {
        //   visible: false,
        //   enabled: false,
        //   label: cookies.syncedAt
        //     ? toTime(cookies.syncedAt)
        //     : "Never synchronized",
        // },

        {
          enabled: false,
          label: `${cookies.syosetus.length} syosetu`,
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
          label: "Change directory",
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
            if (IS_DEV) {
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
          type: "separator",
        },
        {
          label: "Export List",
          click: async () => {
            const filePath = await showSaveFile({
              title: "Export syosetu list as txt file",
              defaultPath: path.join(
                app.getPath("downloads"),
                "Syosetu List.txt"
              ),
            });

            if (!filePath) {
              return;
            }

            const data = cookies.syosetus
              .map((syosetu) => {
                const meta = getCurrentMeta(syosetu);
                const title = meta?.title || "Initializing...";
                return title + "\n" + syosetu.url;
              })
              .join("\n\n");

            writeText(filePath, data);
          },
        },
        {
          type: "separator",
        },
        {
          label: "About",
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
  const tray = createTray(createTrayMenu());
  tray.on("click", (e) => {
    setTimeout(() => {
      tray.popUpContextMenu();
    }, 39);
  });

  Update.github("shinich39", "syosetu-version-manager");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
