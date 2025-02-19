import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

// start at PROEJCT_DIR/app/
export function getPath(...paths: string[]) {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ...paths
  );
}

export function getAssetPath(...paths: string[]) {
  return path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, "assets")
      : getPath("../assets"),
    ...paths
  );
}
