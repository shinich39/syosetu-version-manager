"use strict"

import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

if (fs.existsSync("bin")) {
  fs.rmSync("bin", { recursive: true });
}

try {
  execSync("tsc --project tsconfig.json");
} catch(err) {
  console.error(err.output.toString());
  process.exit(1);
}