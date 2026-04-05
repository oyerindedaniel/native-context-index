import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crawl } from "../src/crawler.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nci-symlink-dupe-"));

try {
  const realPkgDir = path.join(tempRoot, "real-pkg");
  fs.mkdirSync(realPkgDir);
  fs.writeFileSync(
    path.join(realPkgDir, "index.d.ts"),
    `export type SharedType = { value: string };\nexport type AnotherType = { count: number };\n`
  );
  fs.writeFileSync(
    path.join(realPkgDir, "package.json"),
    JSON.stringify({ name: "real-pkg", types: "index.d.ts" })
  );

  const mainPkgDir = path.join(tempRoot, "main-pkg");
  fs.mkdirSync(mainPkgDir);
  fs.writeFileSync(
    path.join(mainPkgDir, "package.json"),
    JSON.stringify({ name: "main-pkg", types: "index.d.ts" })
  );

  const nodeModulesDir = path.join(mainPkgDir, "node_modules");
  fs.mkdirSync(nodeModulesDir);
  fs.symlinkSync(realPkgDir, path.join(nodeModulesDir, "real-pkg"), "junction");

  fs.writeFileSync(
    path.join(mainPkgDir, "index.d.ts"),
    `export * from "../real-pkg/index";\nexport * from "real-pkg";\n`
  );

  const entryFile = path.join(mainPkgDir, "index.d.ts");
  const crawlResult = crawl(entryFile, { maxHops: 5 });

  const sharedTypeSymbols = crawlResult.exports.filter(
    (symbolEntry) => symbolEntry.name === "SharedType"
  );

  console.log(`Total symbols:      ${crawlResult.exports.length}`);
  console.log(`Visited files:      ${crawlResult.visitedFiles.length}`);
  console.log(`SharedType count:   ${sharedTypeSymbols.length}`);

  if (sharedTypeSymbols.length > 1) {
    console.error(`\n❌ BUG: Duplicate symbols found in visited files!`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: Crawler correctly deduplicated the physical file.`);
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
