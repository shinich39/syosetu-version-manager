import fs from "node:fs";
import path from "node:path";
import { getLatestRelease, downloadAsset, getAsset } from "node-git-sync";
import { parse as parseYaml } from "yaml";
import {
  __dirname,
  api,
  getWindow,
  getWindows,
  showConfirm,
} from "./electron.js";
import { spawn } from "node:child_process";
import { app } from "electron";

function validateOS() {
  switch (process.platform) {
    case "darwin":
    case "win32":
    case "linux":
      break;
    default:
      throw new Error(`Operating System not supported: ${process.platform}`);
  }
}

function getLatestFileName() {
  switch (process.platform) {
    case "win32":
      return "latest.yml";
    case "darwin":
      return "latest-mac.yml";
    case "linux":
      return "latest-linux.yml";
    default:
      throw new Error(`Operating System not supported: ${process.platform}`);
  }
}

// a - b
export function compareVersion(a: string, b: string) {
  const aa = a.split(".").map((item) => parseInt(item));
  const bb = b.split(".").map((item) => parseInt(item));
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (aa[i] > bb[i]) {
      return 1;
    }
    if (aa[i] < bb[i]) {
      return -1;
    }
  }
  if (aa.length > bb.length) {
    return 1;
  }
  if (aa.length < bb.length) {
    return -1;
  }
  return 0;
}

function runAfterQuit(filePath: string) {
  let command;
  let args = [filePath];

  switch (process.platform) {
    case "darwin":
      command = "open";
      break;
    case "win32":
      command = "start";
      // empty string prevents issues with `start`
      args = ["", filePath];
      break;
    case "linux":
      command = "xdg-open";
      break;
    default:
      throw new Error(`Operating System not supported: ${process.platform}`);
  }

  const p = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  // ensures the process is independent
  p.unref();
}

export async function checkForUpdates() {
  try {
    validateOS();

    const appPath = path.join(__dirname, "../app.json");
    const pkgPath = path.join(__dirname, "../package.json");

    if (!fs.existsSync(appPath)) {
      throw new Error("app.json not found");
    }
    if (!fs.existsSync(pkgPath)) {
      throw new Error("package.json not found");
    }

    const appJson = JSON.parse(fs.readFileSync(appPath, "utf8"));
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    const publish = appJson.publish as
      | {
          provider: string;
          owner: string;
          repo: string;
          token?: string;
        }
      | undefined;
    const currentVersion = pkgJson.version as string;
    // console.log(`Current Application Version: ${currentVersion}`);

    if (!publish?.provider) {
      throw new Error("Could not find publish property in app.json");
    }
    if (publish?.provider !== "github") {
      throw new Error("Provider must be github for update");
    }

    const { owner, repo, token } = publish;

    const release = await getLatestRelease(owner, repo, token);
    if (!release) {
      throw new Error("No releases in repository");
    }

    const assets = release.assets;

    // electron-builder info file
    const latestInfoName = getLatestFileName();
    const latestInfoAsset = assets.find((item) => item.name === latestInfoName);
    if (!latestInfoAsset) {
      throw new Error(`${latestInfoName} not found in latest release`);
    }

    const infoBuffer = Buffer.from(
      await getAsset(owner, repo, latestInfoAsset.id, token)
    );
    const info = parseYaml(infoBuffer.toString("utf8"));

    const latestVersion: string = info.version;
    if (compareVersion(latestVersion, currentVersion) < 1) {
      throw new Error(
        `No updates found: ${latestVersion} <= ${currentVersion}`
      );
    }

    const asset = assets.find((item) => item.name === info.path);
    if (!asset) {
      throw new Error(`Asset file not found in ${info.path}`);
    }

    const filePath = path.join(app.getPath("downloads"), asset.name);

    // confirm download
    const download = await showConfirm(
      `Updates Available`,
      `An update is available to ${latestVersion}.\nDo you want to download and install it now?`,
      getWindow(),
      { buttons: ["Update Later", "Download and Install"] }
    );
    if (!download) {
      return;
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
    app.on("before-quit", () => {
      if (fs.existsSync(filePath)) {
        runAfterQuit(filePath);
      }
    });

    // quit electron app
    app.quit();
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
    }
  }
}
