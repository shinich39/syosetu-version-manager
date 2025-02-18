import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  OpenDialogOptions,
  SaveDialogOptions,
  nativeImage,
  Notification,
  MessageBoxOptions,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const __dirname = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// fix mac os focus
export function focusOnApp() {
  app.focus({ steal: true });
}

export async function showAlert(
  title: string,
  message?: string | null,
  win?: BrowserWindow | null,
  options?: Partial<MessageBoxOptions> | null
) {
  focusOnApp();

  const opts: MessageBoxOptions = {
    ...options,
    title: message ? title : undefined,
    message: message ? message : title,
  };

  if (win) {
    await dialog.showMessageBox(win, opts);
  } else {
    await dialog.showMessageBox(opts);
  }
}

export async function showConfirm(
  title: string,
  message?: string | null,
  win?: BrowserWindow | null,
  options?: Partial<MessageBoxOptions> | null
) {
  focusOnApp();

  const opts: MessageBoxOptions = {
    cancelId: 0,
    defaultId: 1,
    buttons: ["Cancel", "Yes"],
    ...options,
    title: message ? title : undefined,
    message: message ? message : title,
  };

  const { response } = win
    ? await dialog.showMessageBox(win, opts)
    : await dialog.showMessageBox(opts);

  return response;
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

export async function showSaveFile(options?: SaveDialogOptions | null) {
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

export function getWindow() {
  return (
    BrowserWindow.getFocusedWindow() ||
    BrowserWindow.getAllWindows()[0] ||
    undefined
  );
}

export function getWindows() {
  return BrowserWindow.getAllWindows();
}

export function isError(e: any) {
  return typeof e === "object" && e !== null && e.stack && e.message;
}

export const api: {
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
    const wins = win ? [win] : getWindows();
    if (isError(message)) {
      for (const w of wins) {
        w.webContents.send(channel, message, null);
      }
    } else {
      for (const w of wins) {
        w.webContents.send(channel, null, message);
      }
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
