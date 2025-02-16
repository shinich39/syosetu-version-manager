import { app, Menu, shell, MenuItemConstructorOptions } from "electron";

const template: Record<string, MenuItemConstructorOptions[]> =
  process.platform === "darwin"
    ? {
        // mac
        [app.name]: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
        File: [{ role: "close" }],
        Edit: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" },
          { type: "separator" },
          {
            label: "Speech",
            submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
          },
        ],
        View: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
        Window: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" },
        ],
        Help: [
          {
            label: "Learn More",
            accelerator: "Cmd + H",
            click: async () => {
              await shell.openExternal("https://electronjs.org");
            },
          },
        ],
      }
    : {
        // windows
        File: [{ role: "quit" }],
        Edit: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" },
        ],
        View: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
        Window: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
        Help: [
          {
            label: "Learn More",
            accelerator: "Ctrl + H",
            click: async () => {
              await shell.openExternal("https://electronjs.org");
            },
          },
        ],
      };

const options: MenuItemConstructorOptions[] = [];
for (const label of Object.keys(template)) {
  options.push({
    label: label,
    submenu: template[label],
  });
}

const menu = Menu.buildFromTemplate(options);

Menu.setApplicationMenu(menu);
