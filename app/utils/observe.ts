import fs from "node:fs";
import { api } from "./electron.js";

export function observeDir(dirPath: string) {
  fs.watch(
    dirPath,
    {
      recursive: true,
    },
    (eventType, filename) => {
      // console.log("File changed:", filename);
      api.send("$refresh", true);
    }
  );
}
