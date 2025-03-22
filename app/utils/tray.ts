import { Menu, shell, Tray } from "electron";
import { createImage } from "./file.js";
import { getAssetPath } from "./path.js";

let tray: Tray | null = null;

export function getTray() {
  return tray;
}

// customize you are default menu template
export function createTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Item1", type: "radio" },
    { label: "Item2", type: "radio" },
    { label: "Item3", type: "radio", checked: true },
    { label: "Item4", type: "radio" },
    { type: "separator" },
    {
      label: "Help",
      submenu: [
        {
          label: "Learn More",
          accelerator: "Ctrl + H",
          click: async () => {
            await shell.openExternal("https://electronjs.org");
          },
        },
      ],
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
}

export function createTray(menu?: Electron.Menu) {
  if (tray) {
    removeTray();
  }

  const trayIcon = createImage(
    getAssetPath(process.platform === "darwin" ? "icon-white.png" : "icon.png"),
    { width: 16, height: 16 }
  );

  const newTray = new Tray(trayIcon);
  newTray.setToolTip("Syosetu Version Manager");
  newTray.setContextMenu(menu || createTrayMenu());

  tray = newTray;

  return newTray;
}

export function updateTray(menu?: Electron.Menu) {
  if (!tray) {
    return;
  }

  tray.setContextMenu(menu || createTrayMenu());
}

export function removeTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
