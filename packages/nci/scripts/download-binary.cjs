"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const VERSION_FILE_NAME = ".nci-version";
const DEFAULT_GITHUB_REPO = "oyerindedaniel/native-context-index";

function readPackageJson(packageRoot) {
  const pkgPath = path.join(packageRoot, "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function platformSuffix(platform, arch) {
  if (platform === "win32" && arch === "x64") return "win32-x64";
  if (platform === "win32" && arch === "arm64") return "win32-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  throw new Error(`nci download: no prebuilt binary for ${platform}-${arch}`);
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

function resolveGithubOwnerRepo(ownerRepoOverride) {
  if (ownerRepoOverride) {
    return ownerRepoOverride;
  }
  const fromEnv = process.env.NCI_GITHUB_REPO;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return DEFAULT_GITHUB_REPO;
}

function releaseAssetUrl(ownerRepo, version, assetName) {
  const base = process.env.NCI_DOWNLOAD_BASE_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/v${version}/${assetName}`;
  }
  if (!ownerRepo) {
    throw new Error(
      "nci download: set NCI_GITHUB_REPO or NCI_DOWNLOAD_BASE_URL",
    );
  }
  return `https://github.com/${ownerRepo}/releases/download/v${version}/${assetName}`;
}

async function download(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "nci-download" },
  });
  if (!response.ok) {
    throw new Error(`nci download: GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function readInstalledVersion(metadataDir) {
  const versionPath = path.join(metadataDir, VERSION_FILE_NAME);
  if (!fs.existsSync(versionPath)) {
    return null;
  }
  return fs.readFileSync(versionPath, "utf8").trim() || null;
}

function writeInstalledVersion(metadataDir, version) {
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(path.join(metadataDir, VERSION_FILE_NAME), `${version}\n`, "utf8");
}

async function fetchLatestReleaseVersion(ownerRepo) {
  const url = `https://api.github.com/repos/${ownerRepo}/releases/latest`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "nci-download",
    },
  });
  if (!response.ok) {
    throw new Error(`nci download: GitHub releases API -> ${response.status}`);
  }
  const body = await response.json();
  const tag = body.tag_name;
  if (!tag || typeof tag !== "string") {
    throw new Error("nci download: releases API missing tag_name");
  }
  return tag.trim().replace(/^v/, "");
}

async function resolveVersionLabel(versionLabel, ownerRepo) {
  if (!versionLabel || versionLabel === "latest") {
    return fetchLatestReleaseVersion(ownerRepo);
  }
  return versionLabel.trim().replace(/^v/, "");
}

function binaryFileName() {
  return process.platform === "win32" ? "nci.exe" : "nci";
}

async function installBytesAtDestination(options) {
  const {
    dest,
    metadataDir,
    version,
    ownerRepo,
    force = false,
  } = options;
  const staging = `${dest}.new`;
  const win = process.platform === "win32";

  if (!force && readInstalledVersion(metadataDir) === version && fs.existsSync(dest)) {
    const stats = fs.statSync(dest);
    if (stats.size > 0) {
      return { updated: false, dest };
    }
  }

  const assetName = releaseAssetFileName(process.platform, process.arch);
  const url = releaseAssetUrl(ownerRepo, version, assetName);
  const compressed = await download(url);
  const body = gunzipSync(compressed);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(staging, body);
  if (!win) {
    fs.chmodSync(staging, 0o755);
  }

  try {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
  } catch {
    // Windows may lock the running binary.
  }

  try {
    fs.renameSync(staging, dest);
  } catch (error) {
    if (win && fs.existsSync(staging)) {
      throw new Error(
        `nci download: could not replace ${dest} (file in use). Close other nci processes and retry.`,
      );
    }
    throw error;
  }

  writeInstalledVersion(metadataDir, version);
  return { updated: true, dest };
}

/**
 * @param {object} options
 * @param {string} options.packageRoot - directory containing package.json
 * @param {string} options.version - semver without leading v
 * @param {boolean} [options.force]
 */
async function installBinaryToVendor(options) {
  const { packageRoot, version, force = false } = options;
  const pkg = readPackageJson(packageRoot);
  const ownerRepo = parseGithubOwnerRepo(pkg);
  const vendorDir = path.join(packageRoot, "vendor");
  const dest = path.join(vendorDir, binaryFileName());
  return installBytesAtDestination({
    dest,
    metadataDir: vendorDir,
    version,
    ownerRepo,
    force,
  });
}

/**
 * @param {object} options
 * @param {string} options.installDir - directory on PATH (e.g. ~/.local/bin)
 * @param {string} [options.metadataDir] - version stamp dir (default: ~/.local/share/nci)
 * @param {string} [options.version] - semver or "latest"
 * @param {string} [options.ownerRepo]
 * @param {boolean} [options.force]
 */
async function installBinaryToDir(options) {
  const {
    installDir,
    metadataDir = path.join(
      process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
      "nci",
    ),
    version: versionLabel = "latest",
    ownerRepo: ownerRepoOverride,
    force = false,
  } = options;
  const ownerRepo = resolveGithubOwnerRepo(ownerRepoOverride);
  const version = await resolveVersionLabel(versionLabel, ownerRepo);
  const dest = path.join(installDir, binaryFileName());
  return installBytesAtDestination({
    dest,
    metadataDir,
    version,
    ownerRepo,
    force,
  });
}

module.exports = {
  VERSION_FILE_NAME,
  DEFAULT_GITHUB_REPO,
  installBinaryToVendor,
  installBinaryToDir,
  fetchLatestReleaseVersion,
  readInstalledVersion,
  releaseAssetUrl,
  releaseAssetFileName,
  parseGithubOwnerRepo,
  resolveGithubOwnerRepo,
};
