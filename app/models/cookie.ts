import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { readJSON, writeJSON } from "../libs/utils.js";
import { Syosetu } from "./syosetu.js";

const COOKIE_PATH = path.join(app.getPath("sessionData"), "POSCookies");
// const COOKIE_PATH = path.join(app.getPath("home"), ".cache", "electron", "Cookies");

export interface ICookies {
  syosetus: Syosetu[];
  outputDir: string;
  [key: string]: any;
}

export class Cookies implements ICookies {
  syosetus: Syosetu[];
  outputDir: string;
  [key: string]: any;

  constructor() {
    this.syosetus = [];
    this.outputDir = path.join(app.getPath("home"), "Syosetu Library");
    this.read();
  }

  keys() {
    return Object.keys(this);
  }

  values() {
    return Object.values(this);
  }

  entries() {
    return Object.entries(this);
  }

  read() {
    if (!fs.existsSync(COOKIE_PATH)) {
      this.write();
    } else {
      Object.assign(this, readJSON(COOKIE_PATH));
    }
  }

  write() {
    writeJSON(COOKIE_PATH, this.toObject());
  }

  toObject() {
    return Object.assign({}, this);
  }

  toString() {
    return JSON.stringify(Object.assign({}, this));
  }
}
