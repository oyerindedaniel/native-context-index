import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cargoPath = join(root, "packages", "nci-engine", "Cargo.toml");
const cargoText = readFileSync(cargoPath, "utf8");
const versionLine = cargoText.split(/\r?\n/).find((line) => line.startsWith("version = "));
if (!versionLine) {
  throw new Error(`no version = in ${cargoPath}`);
}
const match = versionLine.match(/^version = "([^"]+)"$/);
if (!match) {
  throw new Error(`unexpected version line: ${versionLine}`);
}
const version = match[1];
const metaDir = join(root, "packages", "nci");
const metaPkg = join(metaDir, "package.json");
const meta = JSON.parse(readFileSync(metaPkg, "utf8")) as { version: string };
meta.version = version;
writeFileSync(metaPkg, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

console.log(`synced packages/nci version to ${version} (from nci-engine Cargo.toml)`);
