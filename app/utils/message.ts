import {
  app,
  BrowserWindow,
  dialog,
  MessageBoxOptions,
  Notification,
  OpenDialogOptions,
  SaveDialogOptions,
} from "electron";

// fix mac os focus
function focusOnApp() {
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

  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: app.getPath("downloads"),
    properties: ["openFile"],
    ...(options || {}),
  });

  if (canceled) {
    return;
  }

  return filePaths[0];
}

export async function showOpenFiles(options?: OpenDialogOptions) {
  focusOnApp();

  if (
    options &&
    options.properties &&
    options.properties.indexOf("multiSelections") === -1
  ) {
    options.properties.push("multiSelections");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: app.getPath("downloads"),
    properties: ["openFile", "multiSelections"],
    ...(options || {}),
  });

  if (canceled) {
    return;
  }

  return filePaths;
}

export async function showOpenDir(options?: OpenDialogOptions) {
  focusOnApp();

  if (
    options &&
    options.properties &&
    options.properties.indexOf("openDirectory") === -1
  ) {
    options.properties.push("openDirectory");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: app.getPath("downloads"),
    properties: ["openDirectory"],
    ...(options || {}),
  });

  if (canceled) {
    return;
  }

  return filePaths[0];
}

export async function showSaveFile(options?: SaveDialogOptions | null) {
  focusOnApp();

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: app.getPath("downloads"),
    ...(options || {}),
  });

  if (canceled) {
    return;
  }

  return filePath;
}

export function showNoti(title?: string, body?: string) {
  new Notification({ title, body }).show();
}
