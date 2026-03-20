/**
 * NCI Core — Resolver
 *
 * Resolves a package directory to its .d.ts types entry point(s).
 *
 * Resolution priority (per entry):
 *  1. exports["."].types (conditional "types" condition)
 *  2. exports["."].import.types or exports["."].require.types (nested)
 *  3. exports["."] or exports (if string ending in .d.ts)
 *  4. typesVersions (version-gated type paths)
 *  5. types field
 *  6. typings field (legacy)
 *  7. index.d.ts fallback
 *
 * For subpath exports, ALL entries are resolved (not just ".").
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { PackageEntry } from "./types.js";

/**
 * Resolves the types entry point(s) for a package given its directory.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns PackageEntry with all resolved .d.ts paths
 */
export function resolveTypesEntry(packageDir: string): PackageEntry {
  const pkgJsonPath = path.join(packageDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`No package.json found at ${packageDir}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  const name: string = pkg.name ?? path.basename(packageDir);
  const entries: string[] = [];

  // Priority 1-3: exports field (all subpaths)
  if (pkg.exports) {
    const resolved = resolveAllExports(packageDir, pkg.exports);
    entries.push(...resolved);
  }

  // Priority 4: typesVersions field (only if no exports found)
  if (entries.length === 0 && pkg.typesVersions) {
    const resolved = resolveTypesVersions(packageDir, pkg.typesVersions);
    if (resolved) {
      entries.push(resolved);
    }
  }

  // Priority 5: types field (only if nothing found yet)
  if (entries.length === 0 && pkg.types) {
    const resolved = resolveFile(packageDir, pkg.types);
    if (resolved) {
      entries.push(resolved);
    }
  }

  // Priority 6: typings field (legacy)
  if (entries.length === 0 && pkg.typings) {
    const resolved = resolveFile(packageDir, pkg.typings);
    if (resolved) {
      entries.push(resolved);
    }
  }

  // Priority 7: index.d.ts fallback
  if (entries.length === 0) {
    const fallback = path.join(packageDir, "index.d.ts");
    if (fs.existsSync(fallback)) {
      entries.push(fallback);
    }
  }

  return { name, typesEntries: entries };
}

/**
 * Resolve ALL subpath entries from the `exports` field.
 *
 * Handles:
 * - String: "exports": "./dist/index.d.ts"
 * - Object with subpaths: "exports": { ".": {...}, "./utils": {...}, "./server": {...} }
 * - Nested conditions: { "types": "...", "import": { "types": "..." } }
 */
function resolveAllExports(
  packageDir: string,
  exports: unknown
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  // Case 1: exports is a direct string
  if (typeof exports === "string") {
    if (exports.endsWith(".d.ts") || exports.endsWith(".d.mts") || exports.endsWith(".d.cts")) {
      const resolved = resolveFile(packageDir, exports);
      if (resolved) entries.push(resolved);
    }
    return entries;
  }

  // Case 2: exports is an object
  if (typeof exports === "object" && exports !== null) {
    const obj = exports as Record<string, unknown>;

    // Check if keys are subpaths (start with ".") or conditions
    const hasSubpaths = Object.keys(obj).some((key) => key.startsWith("."));

    if (hasSubpaths) {
      // Iterate ALL subpath entries: ".", "./utils", "./server", etc.
      for (const [subpath, value] of Object.entries(obj)) {
        if (!subpath.startsWith(".")) continue;
        // Skip package.json subpath
        if (subpath === "./package.json") continue;

        // Wildcard subpath expansion: "./*" → scan filesystem
        if (subpath.includes("*")) {
          const wildcardEntries = expandWildcardSubpath(packageDir, value);
          for (const wEntry of wildcardEntries) {
            if (!seen.has(wEntry)) {
              seen.add(wEntry);
              entries.push(wEntry);
            }
          }
          continue;
        }

        const resolved = resolveExportCondition(packageDir, value);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          entries.push(resolved);
        }
      }
    } else {
      // No subpaths — the object is the condition map itself
      // e.g., { "types": "...", "import": "..." }
      const resolved = resolveExportCondition(packageDir, obj);
      if (resolved) entries.push(resolved);
    }
  }

  // Case 3: exports is an array
  if (Array.isArray(exports)) {
    for (const item of exports) {
      const resolved = resolveAllExports(packageDir, item);
      for (const resolvedPath of resolved) {
        if (!seen.has(resolvedPath)) {
          seen.add(resolvedPath);
          entries.push(resolvedPath);
        }
      }
    }
  }

  return entries;
}

/**
 * Resolve conditions within an export entry.
 * Recursively walks { types, import.types, require.types, default }.
 */
function resolveExportCondition(
  packageDir: string,
  entry: unknown
): string | null {
  if (typeof entry === "string") {
    if (entry.endsWith(".d.ts") || entry.endsWith(".d.mts") || entry.endsWith(".d.cts")) {
      return resolveFile(packageDir, entry);
    }
    return null;
  }

  if (Array.isArray(entry)) {
    for (const item of entry) {
      const resolved = resolveExportCondition(packageDir, item);
      if (resolved) return resolved;
    }
    return null;
  }

  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const obj = entry as Record<string, unknown>;

  // Priority order: types → import → require → default
  if (obj.types) {
    const resolved = resolveExportCondition(packageDir, obj.types);
    if (resolved) return resolved;
  }

  if (obj.import) {
    const resolved = resolveExportCondition(packageDir, obj.import);
    if (resolved) return resolved;
  }

  if (obj.require) {
    const resolved = resolveExportCondition(packageDir, obj.require);
    if (resolved) return resolved;
  }

  if (obj.default) {
    const resolved = resolveExportCondition(packageDir, obj.default);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Resolve typesVersions field.
 *
 * Format: { ">=5.0": { "*": ["ts5/*"] } }
 *
 * Compares the installed TypeScript version against version range keys.
 * If a match is found, redirects the wildcard "*" path to the mapped directory.
 */
function resolveTypesVersions(
  packageDir: string,
  typesVersions: Record<string, Record<string, string[]>>
): string | null {
  const currentVersion = ts.version;

  for (const [versionRange, pathMap] of Object.entries(typesVersions)) {
    if (matchesVersionRange(currentVersion, versionRange)) {
      const wildcardPaths = pathMap["*"];
      if (wildcardPaths && wildcardPaths.length > 0) {
        const redirectPattern = wildcardPaths[0]!;
        const redirectPath = redirectPattern.replace("*", "index.d.ts");
        const resolved = resolveFile(packageDir, redirectPath);
        if (resolved) return resolved;
      }

      const dotPaths = pathMap["."];
      if (dotPaths && dotPaths.length > 0) {
        const resolved = resolveFile(packageDir, dotPaths[0]!);
        if (resolved) return resolved;
      }
    }
  }

  return null;
}

/**
 * Check if a version string matches a range like ">=5.0", ">=4.7", etc.
 */
function matchesVersionRange(version: string, range: string): boolean {
  const match = range.match(/^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return false;

  const [, reqMajor, reqMinor] = match;
  const [curMajor, curMinor] = version.split(".");

  const rMajor = parseInt(reqMajor!, 10);
  const rMinor = parseInt(reqMinor!, 10);
  const cMajor = parseInt(curMajor!, 10);
  const cMinor = parseInt(curMinor!, 10);

  if (cMajor > rMajor) return true;
  if (cMajor === rMajor && cMinor >= rMinor) return true;
  return false;
}

/**
 * Resolve a relative file path and verify it exists.
 */
function resolveFile(packageDir: string, relativePath: string): string | null {
  const absPath = path.resolve(packageDir, relativePath);
  return isFileSafe(absPath) ? absPath : null;
}


/**
 * Expand wildcard subpath exports by scanning the filesystem.
 *
 * Handles patterns like:
 *   "./*": { "types": "./dist/*.d.ts" }
 *   "./*": "./dist/*.d.ts"
 *
 * Extracts the concrete path pattern from the condition value,
 * replaces * with a directory scan, and returns all matching .d.ts files.
 */
function expandWildcardSubpath(
  packageDir: string,
  value: unknown
): string[] {
  const entries: string[] = [];

  const pattern = extractWildcardPattern(value);
  if (!pattern || !pattern.includes("*")) return entries;

  // Convert "dist/*.d.ts" → dir="dist", prefix="", suffix=".d.ts"
  const parts = pattern.split("*");
  if (parts.length !== 2) return entries; // Only single * supported

  const [beforeStar, afterStar] = parts;
  const fileSuffix = afterStar!;

  // Split beforeStar at the last "/" to get directory and file prefix
  // For "./dist/*.d.ts": beforeStar="./dist/", we want scanDir="./dist", filePrefix=""
  // For "./dist/lib-*.d.ts": beforeStar="./dist/lib-", we want scanDir="./dist", filePrefix="lib-"
  const lastSlash = beforeStar!.lastIndexOf("/");
  const dirPart = lastSlash >= 0 ? beforeStar!.slice(0, lastSlash) : ".";
  const filePrefix = lastSlash >= 0 ? beforeStar!.slice(lastSlash + 1) : beforeStar!;

  const scanDir = path.resolve(packageDir, dirPart);
  if (!fs.existsSync(scanDir)) return entries;

  try {
    const dirents = fs.readdirSync(scanDir, { withFileTypes: true });
    for (const dirent of dirents) {
      const file = dirent.name;
      if (dirent.isFile() && file.startsWith(filePrefix) && file.endsWith(fileSuffix)) {
        if (file.endsWith(".d.ts") || file.endsWith(".d.mts") || file.endsWith(".d.cts")) {
          entries.push(path.join(scanDir, file));
        }
      }
    }
  } catch {
  }

  return entries;
}

/**
 * Extract the wildcard pattern string from a conditional export value.
 * Walks through conditions to find the first string containing *.
 */
function extractWildcardPattern(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return null;

  const obj = value as Record<string, unknown>;

  // Priority order: types → import → require → default
  for (const key of ["types", "import", "require", "default"]) {
    if (obj[key]) {
      const result = extractWildcardPattern(obj[key]);
      if (result) return result;
    }
  }
  return null;
}
/**
 * Resolve a module specifier relative to the current file.
 */
export function resolveModuleSpecifier(
  specifier: string,
  currentFile: string
): string | null {
  if (!specifier.startsWith(".")) return null;

  const dir = path.dirname(currentFile);
  let resolved: string;

  const JS_EXT_RE = /\.(js|mjs|cjs)$/;

  // Strip .js/.mjs/.cjs extension and try .d.ts (single regex match)
  const extMatch = specifier.match(JS_EXT_RE);
  if (extMatch) {
    const base = specifier.slice(0, -extMatch[0].length);
    resolved = path.resolve(dir, base + ".d.ts");
    if (isFileSafe(resolved)) return normalizePath(resolved);

    if (extMatch[1] === "mjs") {
      resolved = path.resolve(dir, base + ".d.mts");
      if (isFileSafe(resolved)) return normalizePath(resolved);
    }
    if (extMatch[1] === "cjs") {
      resolved = path.resolve(dir, base + ".d.cts");
      if (isFileSafe(resolved)) return normalizePath(resolved);
    }

    // Try as directory with index.d.ts (e.g., "./scope.js" → "./scope/index.d.ts")
    resolved = path.resolve(dir, base, "index.d.ts");
    if (isFileSafe(resolved)) return normalizePath(resolved);
  }

  // Try adding .d.ts directly
  resolved = path.resolve(dir, specifier + ".d.ts");
  if (isFileSafe(resolved)) return normalizePath(resolved);

  // Try as-is (already ends in .d.ts) — MUST be a file, not a directory
  resolved = path.resolve(dir, specifier);
  if (isFileSafe(resolved)) return normalizePath(resolved);

  // Try as a directory with index.d.ts (e.g., "./scope" → "./scope/index.d.ts")
  resolved = path.resolve(dir, specifier, "index.d.ts");
  if (isFileSafe(resolved)) return normalizePath(resolved);

  return null;
}

/** Check if a path exists and is a file. */
export function isFileSafe(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Normalize a path to use forward slashes. */
export function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}
