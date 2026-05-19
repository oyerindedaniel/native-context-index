"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { installBinaryToVendor } = require("./download-binary.cjs");

function readPackageJson() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function isSiblingEngineInThisRepo() {
  const cargoToml = path.join(__dirname, "..", "..", "nci-engine", "Cargo.toml");
  return fs.existsSync(cargoToml);
}

async function main() {
  if (process.env.NCI_SKIP_DOWNLOAD === "1") {
    console.log("nci postinstall: NCI_SKIP_DOWNLOAD=1, skipping binary download");
    return;
  }

  if (isSiblingEngineInThisRepo()) {
    console.log(
      "nci postinstall: monorepo dev — skipping download (no GitHub Release required). " +
        "Use NCI_BINARY or copy the built binary to packages/nci/vendor/nci(.exe)",
    );
    return;
  }

  const packageRoot = path.join(__dirname, "..");
  const pkg = readPackageJson();
  const version = pkg.version;
  if (!version) {
    throw new Error("nci postinstall: package.json missing version");
  }

  const result = await installBinaryToVendor({ packageRoot, version });
  if (result.updated) {
    console.log(`nci postinstall: installed native binary v${version}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
