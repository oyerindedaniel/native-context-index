/**
 * Copies the repo-root install.sh into public/ for https://nativecontextindex.com/install.sh
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webRoot, "../..");
const source = path.join(repoRoot, "install.sh");
const dest = path.join(webRoot, "public", "install.sh");

if (!fs.existsSync(source)) {
  throw new Error(`missing source install.sh at ${source}`);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(source, dest);
process.stdout.write(`sync-install-sh: ${source} -> ${dest}\n`);
