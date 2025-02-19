import { BrowserWindow, screen } from "electron";

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
