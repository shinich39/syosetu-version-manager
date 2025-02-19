"use strict"

import path from "node:path";
import fs from "node:fs";
import { build, Platform } from "electron-builder";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const APP_ID = `com.shinich39.syosetuversionmanager`;
const PRODUCT_NAME = "Syosetu Version Manager";
const SCHEME = "syosetuversionmanager";
const AUTHOR = "shinich39";
const PUBLISH = {
  "provider": "github",
  "owner": "shinich39",
  "repo": "syosetu-version-manager"
}

const targets = process.platform === "darwin" 
  ? Platform.MAC.createTarget()
  : process.platform === "win32"
  ? Platform.WINDOWS.createTarget()
  : process.platform === "linux"
  ? Platform.LINUX.createTarget()
  : null;

if (!targets) {
  console.error(new Error(`OS not supported: ${process.platform}`));
  process.exit(1);
}

build({
  targets: targets,
  config: {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    // artifactName: "${productName} ${version}.${ext}",
    copyright: `Copyright © ${new Date().getFullYear()} ${AUTHOR}`,
    publish: PUBLISH,

    // compress app directory to app.asar
    asar: true,
  
    protocols: {
      name: PRODUCT_NAME,
      schemes: [SCHEME],
    },
  
    compression: "normal",
    removePackageScripts: true,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    
    directories: {
      output: "dist",
      buildResources: "assets"
    },
  
    files: [
      "bin/**/*",
      "src/**/*",
      "package.json",
      "node_modules/**/*",
      "LICENSE",
      "README.md",
    ],
  
    extraFiles: [
      // {
      //   from: "build/Release",
      //   to: nodeAddonDir,
      //   filter: "*.node"
      // }
    ],
  
    extraResources: [
      "assets/**"
    ],
  
    win: {
      target: [
        // "zip",
        "nsis",
        // "portable"
      ],
    },
    nsis: {
      // artifactName: "${productName} Setup ${version}.${ext}",
      oneClick: false,
      perMachine: true,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      // deleteAppDataOnUninstall: true,
    },
  
    mac: {
      target: [
        // "zip",
        "dmg",
      ],
      hardenedRuntime: true,
      gatekeeperAssess: true,
      // extendInfo: {
      //   NSAppleEventsUsageDescription: 'Let me use Apple Events.',
      //   NSCameraUsageDescription: 'Let me use the camera.',
      //   NSScreenCaptureDescription: 'Let me take screenshots.',
      // },
    },
    dmg: {
      // https://www.electron.build/dmg.html#configuration
      background: null,
      backgroundColor: "#ffffff",
      // iconSize: 100,
      // contents: [
      //   {
      //     x: 255,
      //     y: 85,
      //     type: "file"
      //   },
      //   {
      //     x: 253,
      //     y: 325,
      //     type: "link",
      //     path: "/Applications"
      //   }
      // ],
      window: {
        width: 540,
        height: 540
      }
    },
  
    linux: {
      desktop: {
        StartupNotify: "false",
        Encoding: "UTF-8",
        MimeType: `x-scheme-handler/${SCHEME}`
      },
      target: [
        "AppImage",
        // "rpm",
        // "deb",
      ],
    },
    // deb: {
    //   priority: "optional",
    //   afterInstall:"installer/linux/after-install.tpl",
    // },
    // rpm: {
    //   fpm: ["--before-install", "installer/linux/before-install.tpl"],
    //   afterInstall:"installer/linux/after-install.tpl",
    // }
  },
})
.then((result) => {
  // console.log(JSON.stringify(result))
})
.catch((err) => {
  console.error(err);
});