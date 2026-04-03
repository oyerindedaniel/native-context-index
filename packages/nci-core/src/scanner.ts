import fs from "node:fs";
import path from "node:path";
import type { PackageInfo } from "./types.js";

/** Determine if a directory entry is a directory or a symbolic link pointing to a directory. */
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

/** Scan a node_modules directory and discover all installed packages. */
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

/** Read and parse package.json from a directory to extract core metadata. */
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
