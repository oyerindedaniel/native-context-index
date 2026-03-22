/**
 * NCI Core — Scanner
 *
 * Discovers all installed packages in a node_modules directory.
 * Handles scoped packages (@scope/name), pnpm symlinks, and
 * skips non-package entries.
 */
import fs from "node:fs";
import path from "node:path";
import type { PackageInfo } from "./types.js";

/**
 * Determines if a directory entry is a directory or a symbolic link pointing to a directory.
 * Essential for pnpm support where node_modules contains extensive symlinks.
 *
 * @param entry The dirent from readdirSync.
 * @param parentDir Absolute path to the directory containing the entry.
 * @returns True if the target is a directory.
 */
function isDirectoryOrSymlink(entry: fs.Dirent, parentDir: string): boolean {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      const realPath = fs.realpathSync(path.join(parentDir, entry.name));
      return fs.statSync(realPath).isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Scan a node_modules directory and discover all installed packages.
 *
 * Skips any entry starting with "." — the npm registry forbids package names
 * with a leading dot, so these are always package manager artifacts:
 *   npm (.package-lock.json, .cache), pnpm (.pnpm, .modules.yaml),
 *   yarn (.yarn-integrity, .yarn-state.yml, .yarn), bun (.bun, .bun-tag),
 *   and common entries (.bin, .DS_Store).
 *
 * @param nodeModulesPath - Absolute path to the node_modules directory
 * @returns Array of discovered packages with metadata
 */
export function scanPackages(nodeModulesPath: string): PackageInfo[] {
  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error(`node_modules not found at: ${nodeModulesPath}`);
  }

  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
  const packages: PackageInfo[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (!isDirectoryOrSymlink(entry, nodeModulesPath)) {
      continue;
    }

    // Scoped packages: @scope/package-name
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesPath, entry.name);
      const realScopeDir = fs.realpathSync(scopeDir);
      const scopedEntries = fs.readdirSync(realScopeDir, {
        withFileTypes: true,
      });

      for (const scopedEntry of scopedEntries) {
        if (!isDirectoryOrSymlink(scopedEntry, realScopeDir)) continue;

        const symlinkPath = path.join(scopeDir, scopedEntry.name);
        const pkgDir = fs.realpathSync(symlinkPath);
        const info = readPackageInfo(
          pkgDir,
          `${entry.name}/${scopedEntry.name}`
        );
        if (info) {
          packages.push(info);
        }
      }
    } else {
      // Regular packages
      const symlinkPath = path.join(nodeModulesPath, entry.name);
      const pkgDir = fs.realpathSync(symlinkPath);
      const info = readPackageInfo(pkgDir, entry.name);
      if (info) {
        packages.push(info);
      }
    }
  }

  return packages;
}

/**
 * Reads and parses package.json from a directory to extract core metadata.
 *
 * @param pkgDir Absolute path to the package directory.
 * @param fallbackName Name to use if the package.json does not specify one.
 * @returns Discovered package metadata or null if invalid.
 */
function readPackageInfo(
  pkgDir: string,
  fallbackName: string
): PackageInfo | null {
  const pkgJsonPath = path.join(pkgDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(raw);
    const name = pkg.name ?? fallbackName;

    return {
      name,
      version: pkg.version ?? "0.0.0",
      dir: pkgDir,
      isScoped: name.startsWith("@"),
    };
  } catch {
    return null;
  }
}
