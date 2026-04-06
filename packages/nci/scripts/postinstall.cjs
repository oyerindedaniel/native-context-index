"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

function readPackageJson() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function platformSuffix(platform, arch) {
  if (platform === "win32" && arch === "x64") return "win32-x64";
  if (platform === "win32" && arch === "arm64") return "win32-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  throw new Error(`nci postinstall: no prebuilt binary for ${platform}-${arch}`);
}

function releaseAssetFileName(platform, arch) {
  const suffix = platformSuffix(platform, arch);
  if (platform === "win32") {
    return `nci-${suffix}.exe.gz`;
  }
  return `nci-${suffix}.gz`;
}

function parseGithubOwnerRepo(pkg) {
  let url = pkg.repository;
  if (url && typeof url === "object") {
    url = url.url;
  }
  if (!url) {
    return null;
  }
  const match = String(url).match(/github\.com[/:]([^/]+\/[^/.]+)/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/\.git$/i, "");
}

function releaseAssetUrl(pkg, version, assetName) {
  const base = process.env.NCI_DOWNLOAD_BASE_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/v${version}/${assetName}`;
  }
  const ownerRepo = parseGithubOwnerRepo(pkg);
  if (!ownerRepo) {
    throw new Error(
      "nci postinstall: set package.json repository.url to a github.com URL, or set NCI_DOWNLOAD_BASE_URL " +
        "(e.g. https://github.com/ORG/REPO/releases/download)",
    );
  }
  return `https://github.com/${ownerRepo}/releases/download/v${version}/${assetName}`;
}

async function download(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "nci-postinstall" },
  });
  if (!response.ok) {
    throw new Error(`nci postinstall: GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
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

  const pkg = readPackageJson();
  const version = pkg.version;
  if (!version) {
    throw new Error("nci postinstall: package.json missing version");
  }

  const vendorDir = path.join(__dirname, "..", "vendor");
  const win = process.platform === "win32";
  const destName = win ? "nci.exe" : "nci";
  const dest = path.join(vendorDir, destName);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return;
  }

  const assetName = releaseAssetFileName(process.platform, process.arch);
  const url = releaseAssetUrl(pkg, version, assetName);
  const compressed = await download(url);
  const body = gunzipSync(compressed);

  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(dest, body);
  if (!win) {
    fs.chmodSync(dest, 0o755);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
