"use strict"

import path from "node:path";
import fs from "node:fs";
import { build, Platform } from "electron-builder";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

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

/**
* @see https://www.electron.build/configuration
*/
build({
  targets: targets,
  config: {
    appId: "com.shinich39.syosetuversionmanager",
    // productName: Change "productName" value in package.json
    artifactName: pkg.productName.replace(/\s/g, "-") + "-${version}-${arch}.${ext}",
    publish: {
      "provider": "github",
      "owner": "shinich39",
      "repo": "syosetu-version-manager"
    },

    // compress app directory to app.asar
    asar: true,
 
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
  
    extraResources: [
      "assets/**"
    ],
  
    win: {
      target: [
        {
          target: "nsis",
          arch: [
            "ia32", // x86
            "x64",
            "arm64",
          ]
        },
      ]
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
    },
  
    mac: {
      target: [
        {
          target: "dmg",
          arch: [
            "x64", // intel
            "arm64", // apple silicon
          ]
        }
      ],
      hardenedRuntime: true,
      gatekeeperAssess: false,
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
      target: [
        {
          target: "AppImage",
          arch: [
            "arm64",
            "x64"
          ]
        }
      ],
    },
  },
})
.then((result) => {
  // console.log(JSON.stringify(result))
})
.catch((err) => {
  console.error(err);
});