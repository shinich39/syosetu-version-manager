// @ts-nocheck

import { describe, test, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { electron } from "node:process";
const __abs = fileURLToPath(import.meta.url);
const __rel = path.relative(process.cwd(), __abs);
const __dirname = path.dirname(__abs);
const __filename = path.basename(__abs);

function createDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeText(filePath: string, data: string) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, "utf8");
}

function writeJSON(filePath: string, data: any) {
  createDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

const eq = (a, b, msg) =>
  typeof a === "object"
    ? assert.deepStrictEqual(a, b, msg)
    : assert.strictEqual(a, b, msg);

const log = (obj) => {
  fs.writeFileSync(
    path.join(__abs + ".json"),
    JSON.stringify(obj, null, 2),
    "utf8"
  );
};

// ### Narou
// Short: https://ncode.syosetu.com/n5338kc/
// Going: https://ncode.syosetu.com/n2236kb/
// Completed: https://ncode.syosetu.com/n3620kc/
// 18: https://novel18.syosetu.com/n3193jo/

// ### Kakuyomu
// Going: https://kakuyomu.jp/works/16818093093040916427
// Completed: https://kakuyomu.jp/works/16818093094170635844

// ### Hameln
// Short: https://syosetu.org/novel/365664/
// Going: https://syosetu.org/novel/367279/
// Completed: https://syosetu.org/novel/201750/

// ### Alphapolis
// Short Going: https://www.alphapolis.co.jp/novel/643190032/456940721
// Short Completed: https://www.alphapolis.co.jp/novel/501580631/997939367
// Going: https://www.alphapolis.co.jp/novel/76166291/213939438
// Completed: https://www.alphapolis.co.jp/novel/77586146/733940483

describe(__rel, () => {
  test("createDummies", () => {
    const cookies = {
      syosetus: [
        {
          url: "https://ncode.syosetu.com/dummy/",
          provider: "narou",
          id: "dummy",
          metas: [],
          metaIndex: -1,
          files: [
            {
              id: "1",
              createdAt: 1739692968095,
              path: "/Users/shinich39/.syosetuvm/narou/dummy/1.json",
            },
            {
              id: "2",
              createdAt: 1739692968095,
              path: "/Users/shinich39/.syosetuvm/narou/dummy/2.json",
            },
          ],
          createdAt: 1739692967491,
          updatedAt: 1739692967795,
          syncedAt: 1739692968103,
        },
      ],
      createdAt: 1739692966971,
      updatedAt: 0,
      syncedAt: 0,
      outputDir: "/Users/shinich39/Syosetu Library",
    };

    writeJSON(`/Users/shinich39/.syosetuvm/narou/dummy/1.json`, {
      id: "1",
      title: "TITLE 1",
      content: "DATA 1",
    });

    writeJSON(`/Users/shinich39/.syosetuvm/narou/dummy/2.json`, {
      id: "2",
      title: "TITLE 2",
      content: "DATA 2",
    });

    for (let i = 0; i < 10; i++) {
      const n = 1739672760000 + i;

      const metaData1 = {
        id: "" + n,
        title: "DUMMY",
        updatedAt: n,
        path: `/Users/shinich39/.syosetuvm/narou/dummy/${n}.json`,
      };

      const metaPath = `/Users/shinich39/.syosetuvm/narou/dummy/${n}.json`;
      const metaData2 = {
        onGoing: false,
        title: "DUMMY",
        outline: `TEST: ${i}`,
        author: `Tester ${i}`,
        chapterIds: i % 2 ? ["1"] : ["2"],
        createdAt: n,
        updatedAt: n,
      };

      writeJSON(metaPath, metaData2);

      cookies.syosetus[0].metas.push(metaData1);
    }

    writeJSON(
      `/Users/shinich39/Library/Application Support/syosetu-version-manager/POSCookies`,
      cookies
    );
  });
});
