"use strict"

import path from "node:path";
import fs from "node:fs";
import { build, Platform } from "electron-builder";

const pkg = JSON.parse(fs.readFileSync("package.json"));

const APP_ID = "com.shinich39.syosetuversionmanager";
const PROD_NAME = "Syosetu Version Manager";
const SCHEME_NAME = "syosetuversionmanager";
const AUTHOR = "shinich39";
const GITHUB_OWNER = "shinich39";
const GITHUB_REPO = "syosetu-version-manager";
const YEAR = new Date().getFullYear();

const config = {
  appId: APP_ID,
  productName: PROD_NAME,
  // artifactName: "${productName} ${version}.${ext}",
  copyright: `Copyright © ${YEAR} ${AUTHOR}`,

  publish: {
    provider: "github",
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  },

  // Compress app directory to app.asar
  asar: true,

  protocols: {
    name: PROD_NAME,
    schemes: [
      SCHEME_NAME,
    ]
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
      "zip",
      // "dmg",
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
    // background: "assets/background.png",
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
    // window: {
    //   width: 800,
    //   height: 600
    // }
  },

  linux: {
    desktop: {
      StartupNotify: "false",
      Encoding: "UTF-8",
      MimeType: `x-scheme-handler/${SCHEME_NAME}`
    },
    target: [
      "AppImage",
      "rpm",
      "deb"
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
}

const targets = process.platform === "darwin" 
  ? Platform.MAC.createTarget()
  : process.platform === "win32"
  ? Platform.WINDOWS.createTarget()
  : process.platform === "linux"
  ? Platform.LINUX.createTarget()
  : null;

if (!targets) {
  throw new Error(`Operating System not supported: ${process.platform}`);
}

build({
  targets: targets,
  config: config,
})
.then((result) => {
  // console.log(JSON.stringify(result))
})
.catch((err) => {
  // handle error
  console.error(err);
});