"use strict"

import path from "node:path";
import fs from "node:fs";
import { build, Platform } from "electron-builder";

const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

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
  config: {
    appId: app.appId,
    productName: app.productName,
    // artifactName: "${productName} ${version}.${ext}",
    copyright: `Copyright © ${new Date().getFullYear()} ${app.author}`,
    publish: app.publish,
  
    // Compress app directory to app.asar
    asar: true,
  
    protocols: {
      name: app.productName,
      schemes: [app.scheme],
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
      "app.json",
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
        MimeType: `x-scheme-handler/${app.scheme}`
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
  },
})
.then((result) => {
  // string[]
  // console.log(JSON.stringify(result))
})
.catch((err) => {
  // handle error
  console.error(err);
});