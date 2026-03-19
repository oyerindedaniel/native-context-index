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
 * Directories/files in node_modules that are NOT packages.
 * Covers all major package managers:
 *   - npm:  .package-lock.json, .cache
 *   - pnpm: .pnpm, .modules.yaml
 *   - yarn: .yarn-integrity, .yarn-state.yml, .yarn-metadata.json
 *   - bun:  .bun
 *   - common: .bin, .DS_Store
 */
const SKIP_ENTRIES = new Set([
  // ─── npm ────────────────────────────────
  ".package-lock.json",
  ".cache",
  // ─── pnpm ───────────────────────────────
  ".pnpm",
  ".modules.yaml",
  // ─── yarn ───────────────────────────────
  ".yarn-integrity",
  ".yarn-state.yml",
  ".yarn-metadata.json",
  // ─── bun ────────────────────────────────
  ".bun",
  // ─── common ─────────────────────────────
  ".bin",
  ".DS_Store",
]);

/**
 * Check if a dirent is a directory or a symlink pointing to a directory.
 * pnpm uses symlinks in node_modules, so we need to follow them.
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
    // Skip known non-package entries
    if (SKIP_ENTRIES.has(entry.name)) {
      continue;
    }

    // Skip non-directories (and non-symlinks-to-directories)
    if (!isDirectoryOrSymlink(entry, nodeModulesPath)) {
      continue;
    }

    // Scoped packages: @scope/package-name
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesPath, entry.name);
      // Resolve in case the scope dir itself is a symlink
      const realScopeDir = fs.realpathSync(scopeDir);
      const scopedEntries = fs.readdirSync(realScopeDir, {
        withFileTypes: true,
      });

      for (const scopedEntry of scopedEntries) {
        if (!isDirectoryOrSymlink(scopedEntry, realScopeDir)) continue;

        // Resolve the actual package directory (follow symlinks)
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
      // Regular packages — resolve symlinks
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
 * Read package.json from a directory and extract metadata.
 * Returns null if the directory doesn't contain a valid package.json.
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
    // Malformed package.json — skip
    return null;
  }
}
