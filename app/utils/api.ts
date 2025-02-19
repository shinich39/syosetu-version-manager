import { isError } from "utils-js";
import { BrowserWindow, ipcMain } from "electron";
import { getWindows } from "./window.js";

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
