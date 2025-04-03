import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { getLatestRelease, downloadAsset, getAsset } from "node-github-sync";
import { parse as parseYaml } from "yaml";
import { spawn } from "node:child_process";
import { app } from "electron";
import { compareVersions, isError, isVersion } from "utils-js";
import { showConfirm } from "./message.js";
import { getWindow, getWindows } from "./window.js";

interface Latest {
  version: string;
  files: {
    url: string;
    sha512: string;
    size: number;
  }[];
  path: string;
  sha512: string;
  releaseDate: string;
}

function isSupportedOS() {
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

function getInfoFileSuffix() {
  let suffix = "";
  switch (process.platform) {
    case "win32":
      suffix = ".exe";
      break;
    case "darwin":
      suffix = ".dmg";
      break;
    case "linux":
      suffix = ".AppImage";
      break;
    default:
      throw new Error(`OS not supported: ${process.platform}`);
  }

  switch (process.arch) {
    case "ia32":
    case "x64":
    case "arm":
    case "arm64":
      suffix = process.arch + suffix;
      break;
    // default: throw new Error(`Architecture not supported: ${process.arch}`);
  }

  return suffix;
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
      if (!isSupportedOS()) {
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
      const info: Latest = parseYaml(infoBuffer.toString("utf8"));

      const latestVersion = info.version;
      if (!isVersion(latestVersion)) {
        throw new Error(`No version in ${latestInfoName}`);
      }
      if (compareVersions(currentVersion, latestVersion) !== -1) {
        throw new Error(
          `No updates found: ${currentVersion} <= ${latestVersion}`
        );
      }

      // find file from info.files
      const infoFileSuffix = getInfoFileSuffix();
      const infoFile = info.files.find(
        (file) => file.url.indexOf(infoFileSuffix) > -1
      );
      if (!infoFile) {
        throw new Error(`File not found: ${info.path}`);
      }

      const infoFileName = path.basename(infoFile.url);

      // find asset from released assets
      const asset = assets.find((item) => item.name === infoFileName);
      if (!asset) {
        throw new Error(`Released file not found: ${info.path}`);
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
