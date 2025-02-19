import fs from "node:fs";
import path from "node:path";
import { getLatestRelease, downloadAsset, getAsset } from "node-github-sync";
import { parse as parseYaml } from "yaml";
import { spawn } from "node:child_process";
import { app } from "electron";
import { compareVersions, isError, isVersion } from "utils-js";
import { showConfirm } from "./message.js";
import { getWindow, getWindows } from "./window.js";

function validateOS() {
  switch (process.platform) {
    case "darwin":
    case "win32":
    case "linux":
      return true;
  }
  return false;
}

function getLatestFileName() {
  switch (process.platform) {
    case "win32":
      return "latest.yml";
    case "darwin":
      return "latest-mac.yml";
    case "linux":
      return "latest-linux.yml";
  }
}

function runAfterQuit(filePath: string) {
  let command;
  let args = [filePath];

  switch (process.platform) {
    case "darwin":
      command = "open";
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", '""', filePath];
      break;
    case "linux":
      command = "xdg-open";
      break;
    default:
      throw new Error(`OS not supported: ${process.platform}`);
  }

  const p = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  // ensures the process is independent
  p.unref();
}

export class Update {
  constructor() {}

  static async github(owner: string, repo: string, token?: string) {
    try {
      if (!validateOS()) {
        throw new Error(`OS not supported: ${process.platform}`);
      }

      const currentVersion = app.getVersion();
      if (!currentVersion) {
        throw new Error(`Version not found`);
      }

      const release = await getLatestRelease(owner, repo, token);
      if (!release) {
        throw new Error(`No releases in https://github.com/${owner}/${repo}`);
      }

      const assets = release.assets;

      // "latest.yml" | "latest-mac.yml" | "latest-linux.yml"
      const latestInfoName = getLatestFileName();
      if (!latestInfoName) {
        throw new Error(`OS not supported: ${process.platform}`);
      }

      const latestInfoAsset = assets.find(
        (item) => item.name === latestInfoName
      );
      if (!latestInfoAsset) {
        throw new Error(`No ${latestInfoName} in latest release`);
      }

      // download latest.yml
      const infoBuffer = Buffer.from(
        await getAsset(owner, repo, latestInfoAsset.id, token)
      );

      // parse latest.yml
      const info = parseYaml(infoBuffer.toString("utf8"));

      const latestVersion = info.version;
      if (!isVersion(latestVersion)) {
        throw new Error(`No version in ${latestInfoName}`);
      }
      if (compareVersions(currentVersion, latestVersion) !== -1) {
        throw new Error(
          `No updates found: ${currentVersion} <= ${latestVersion}`
        );
      }

      const asset = assets.find((item) => item.name === info.path);
      if (!asset) {
        throw new Error(`No asset file: ${info.path}`);
      }

      const filePath = path.join(app.getPath("downloads"), asset.name);

      // confirm download
      const ok = await showConfirm(
        `Updates Available`,
        `An update is available to ${latestVersion}.\nDo you want to download and install it now?`,
        getWindow(),
        { buttons: ["Update Later", "Download and Install"] }
      );
      if (!ok) {
        throw new Error(`Update has been cancelled`);
      }

      // download installation file
      if (!fs.existsSync(filePath)) {
        const tmpPath = filePath + ".download";

        await downloadAsset(
          owner,
          repo,
          asset.id,
          token,
          tmpPath,
          (downloadedBytes, totlalBytes) => {
            const progress = downloadedBytes / totlalBytes;
            const n = progress >= 1 ? -1 : progress;
            for (const win of getWindows()) {
              win.setProgressBar(n);
            }
          }
        );

        fs.renameSync(tmpPath, filePath);
      }

      // set update after quit event
      app.on("before-quit", async (e) => {
        if (fs.existsSync(filePath)) {
          runAfterQuit(filePath);
        }
      });

      // quit electron app
      app.quit();
    } catch (err) {
      if (isError(err)) {
        console.error(err.message);
      }
    }
  }
}
