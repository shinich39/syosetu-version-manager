import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

const maxNumbers = [Number.MAX_SAFE_INTEGER,9,9];

function updateVersion(str) {
  const numbers = str.split(".").map((item) => parseInt(item));
  let i = numbers.length - 1;
  while(i >= 0) {
    if (numbers[i] < maxNumbers[i]) {
      numbers[i] += 1;
      break;
    } else {
      numbers[i] = 0;
    }
    i--;
  }
  return numbers.join(".");
}

// update package.json
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = updateVersion(pkg.version);
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2), "utf8");

// update package-lock.json
try {
  execSync(`npm i --package-lock-only`);
} catch(err) {
  console.error(err);
  process.exit(1);
}

// commit & push
try {
  execSync(
    [
    "git add .", 
    `git commit -m "v${pkg.version}"`, 
    `git tag "v${pkg.version}"`, 
    "git push origin main --tags",
    ].join(" && ")
  );
} catch(err) {
  console.error(err);
  process.exit(1);
}