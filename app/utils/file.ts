import path from "node:path";
import fs from "node:fs";
import { nativeImage, ResizeOptions } from "electron";

export function readText(filePath: string) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
}

export function readJSON(filePath: string) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
}

export function createDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeText(filePath: string, data: string) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, "utf8");
}

export function writeJSON(filePath: string, data: any) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function removeFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function removeDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
}

export function createImage(filePath: string, resize?: ResizeOptions) {
  const image = nativeImage.createFromPath(filePath);
  if (resize) {
    return image.resize(resize);
  } else {
    return image;
  }
}
