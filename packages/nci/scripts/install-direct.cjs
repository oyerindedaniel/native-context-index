"use strict";

const path = require("node:path");
const os = require("node:os");

const { installBinaryToDir } = require("./download-binary.cjs");

async function main() {
  const versionLabel = process.argv[2] || process.env.NCI_VERSION || "latest";
  const installDir =
    process.argv[3] ||
    process.env.NCI_INSTALL_DIR ||
    path.join(os.homedir(), ".local", "bin");
  const result = await installBinaryToDir({
    installDir,
    version: versionLabel,
    force: process.env.NCI_FORCE_INSTALL === "1",
  });
  const action = result.updated ? "installed" : "already up to date";
  process.stdout.write(`nci ${action}: ${result.dest}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
