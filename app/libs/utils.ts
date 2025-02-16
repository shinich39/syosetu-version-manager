import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  session,
  OpenDialogOptions,
  SaveDialogOptions,
  nativeImage,
  Notification,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "development") {
  fs.watch(
    "src",
    {
      recursive: true,
    },
    (eventType, filename) => {
      // console.log("File changed:", filename);
      for (const win of BrowserWindow.getAllWindows()) {
        electron.send("refresh", true, win);
      }
    }
  );
}

export const __dirname = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// fix osx focus
export function focusOnApp() {
  app.focus({ steal: true });
}

export async function showAlert(title: string, message?: string) {
  focusOnApp();

  await dialog.showMessageBox({
    title: message ? title : undefined,
    message: message ? message : title,
  });
}

export async function showConfirm(title: string, message?: string) {
  focusOnApp();

  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Yes", "No"],
    cancelId: 1,
    defaultId: 0,
    title: message ? title : undefined,
    message: message ? message : title,
  });

  return response === 0;
}

export async function showOpenFile(options?: OpenDialogOptions) {
  focusOnApp();

  const { canceled, filePaths } = await dialog.showOpenDialog(
    Object.assign(
      {
        defaultPath: app.getPath("downloads"),
        properties: ["openFile"],
      },
      options || {}
    )
  );

  if (canceled) {
    return;
  }

  return filePaths[0];
}

export async function showOpenFiles(options?: OpenDialogOptions) {
  focusOnApp();

  if (
    options?.properties &&
    options.properties.indexOf("multiSelections") === -1
  ) {
    options.properties.push("multiSelections");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(
    Object.assign(
      {
        defaultPath: app.getPath("downloads"),
        properties: ["openFile", "multiSelections"],
      },
      options || {}
    )
  );

  if (canceled) {
    return;
  }

  return filePaths;
}

export async function showOpenDir(options?: OpenDialogOptions) {
  focusOnApp();

  if (
    options?.properties &&
    options.properties.indexOf("openDirectory") === -1
  ) {
    options.properties.push("openDirectory");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(
    Object.assign(
      {
        defaultPath: app.getPath("downloads"),
        properties: ["openDirectory"],
      },
      options || {}
    )
  );

  if (canceled) {
    return;
  }

  return filePaths[0];
}

export async function showSaveFile(options?: SaveDialogOptions) {
  focusOnApp();

  const { canceled, filePath } = await dialog.showSaveDialog(
    Object.assign(
      {
        defaultPath: app.getPath("downloads"),
      },
      options || {}
    )
  );

  if (canceled) {
    return;
  }

  return filePath;
}

export function showNoti(title?: string, body?: string) {
  new Notification({ title, body }).show();
}

export function readText(filePath: string) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
}

export function readJSON(filePath: string) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
}

export function createDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeText(filePath: string, data: string) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, "utf8");
}

export function writeJSON(filePath: string, data: any) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function removeFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function removeDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

export function createImage(filePath: string, resize?: Electron.ResizeOptions) {
  const image = nativeImage.createFromPath(filePath);

  if (resize) {
    return image.resize(resize);
  } else {
    return image;
  }
}

export function getAssetPath(...paths: string[]) {
  return path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, "assets")
      : path.join(__dirname, "../assets"),
    ...paths
  );
}

export function getDisplay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  // { x, y, width, height }
  return primaryDisplay.workArea;
}

// export async function clearCache() {
//   await session.defaultSession.clearCache();
// }

export const isError = function (e: any) {
  return typeof e === "object" && e.stack && e.message;
};

export const electron: {
  send: (channel: string, message: any, window?: BrowserWindow) => void;
  on: (
    channel: string,
    listener: (error: Error, message: any, event: Electron.IpcMainEvent) => void
  ) => void;
  once: (
    channel: string,
    listener: (error: Error, message: any, event: Electron.IpcMainEvent) => void
  ) => void;
} = {
  send: function (channel, message, win) {
    if (!win) {
      win = BrowserWindow.getAllWindows()[0];
    }
    if (!win) {
      throw new Error("Window not found");
    }
    if (isError(message)) {
      win.webContents.send(channel, message, null);
    } else {
      win.webContents.send(channel, null, message);
    }
  },
  on: function (channel, listener) {
    ipcMain.on(channel, function (event, err, message) {
      return listener(err, message, event);
    });
  },
  once: function (channel, listener) {
    ipcMain.once(channel, function (event, err, message) {
      return listener(err, message, event);
    });
  },
};
