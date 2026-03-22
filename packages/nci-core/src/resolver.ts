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
import { NODE_BUILTINS } from "./constants.js";

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
  const typesEntries: string[] = [];
  const subpaths: Record<string, string> = {};

  // 1. Exports field (Modern Node.js resolution)
  if (pkg.exports) {
    const resolved = resolveAllExports(packageDir, pkg.exports, subpaths);
    typesEntries.push(...resolved);
  }

  // 2. typesVersions (TypeScript version-specific mappings)

  if (typesEntries.length === 0 && pkg.typesVersions) {
    const resolved = resolveTypesVersions(packageDir, pkg.typesVersions);
    if (resolved) {
      typesEntries.push(resolved);
      subpaths["."] = resolved;
    }
  }

  // 3. types field (Standard TS field)
  if (typesEntries.length === 0 && pkg.types) {
    const resolved = resolveFile(packageDir, pkg.types);
    if (resolved) {
      typesEntries.push(resolved);
      subpaths["."] = resolved;
    }
  }

  // 4. typings field (Legacy TS field)
  if (typesEntries.length === 0 && pkg.typings) {
    const resolved = resolveFile(packageDir, pkg.typings);
    if (resolved) {
      typesEntries.push(resolved);
      subpaths["."] = resolved;
    }
  }

  // 5. index.d.ts fallback
  if (typesEntries.length === 0) {
    const fallback = path.join(packageDir, "index.d.ts");
    if (fs.existsSync(fallback)) {
      typesEntries.push(fallback);
      subpaths["."] = fallback;
    }
  }

  return { name, dirPath: packageDir, typesEntries, subpaths };
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
  exports: unknown,
  subpaths: Record<string, string>
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  if (typeof exports === "string") {
    if (exports.endsWith(".d.ts") || exports.endsWith(".d.mts") || exports.endsWith(".d.cts")) {
      const resolved = resolveFile(packageDir, exports);
      if (resolved) {
        entries.push(resolved);
        if (!subpaths["."]) subpaths["."] = resolved;
      }
    }
    return entries;
  }

  if (typeof exports === "object" && exports !== null) {
    const obj = exports as Record<string, unknown>;

    const hasSubpaths = Object.keys(obj).some((key) => key.startsWith("."));

    if (hasSubpaths) {
      for (const [subpath, value] of Object.entries(obj)) {
        if (!subpath.startsWith(".")) continue;
        if (subpath === "./package.json") continue;

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
        if (resolved) {
          subpaths[subpath] = resolved;
          if (!seen.has(resolved)) {
            seen.add(resolved);
            entries.push(resolved);
          }
        }
      }
    } else {
      const resolved = resolveExportCondition(packageDir, obj);
      if (resolved) {
        entries.push(resolved);
        if (!subpaths["."]) subpaths["."] = resolved;
      }
    }
  }

  if (Array.isArray(exports)) {
    for (const item of exports) {
      const resolved = resolveAllExports(packageDir, item, subpaths);
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
  if (obj.types !== undefined) {
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

  if (obj.node) {
    const resolved = resolveExportCondition(packageDir, obj.node);
    if (resolved) return resolved;
  }

  if (obj.default !== undefined) {
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
 */
function expandWildcardSubpath(
  packageDir: string,
  value: unknown
): string[] {
  const matchingEntries: string[] = [];

  const pattern = extractWildcardPattern(value);
  if (!pattern || !pattern.includes("*")) return matchingEntries;

  const firstStarIndex = pattern.indexOf("*");
  const beforeFirstStar = pattern.slice(0, firstStarIndex);
  const lastSlashBeforeStar = beforeFirstStar.lastIndexOf("/");

  const dirPart = lastSlashBeforeStar >= 0 ? beforeFirstStar.slice(0, lastSlashBeforeStar) : ".";
  const scanDirectory = path.resolve(packageDir, dirPart);

  if (!fs.existsSync(scanDirectory)) return matchingEntries;

  const globRegex = globToRegExp(pattern);
  const fileCandidates = scanDirectoryRecursive(scanDirectory);

  for (const candidatePath of fileCandidates) {
    const relativeToPackage = path.relative(packageDir, candidatePath).replace(/\\/g, "/");
    const normalizedRelative = relativeToPackage.startsWith("./") ? relativeToPackage : `./${relativeToPackage}`;

    if (globRegex.test(normalizedRelative) || globRegex.test(relativeToPackage)) {
      if (
        candidatePath.endsWith(".d.ts") ||
        candidatePath.endsWith(".d.mts") ||
        candidatePath.endsWith(".d.cts")
      ) {
        matchingEntries.push(candidatePath);
      }
    }
  }

  return matchingEntries;
}

/**
 * Converts a glob pattern (with multiple *) into a RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // Escape regex chars except *
  const regexStr = escaped.replace(/\*/g, "([^/]+)"); // * matches anything except /
  return new RegExp(`^${regexStr}$`);
}

/**
 * Recursively scans a directory for all files.
 */
function scanDirectoryRecursive(dir: string): string[] {
  const results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of list) {
    const resolvedPath = path.resolve(dir, file.name);
    if (file.isDirectory()) {
      results.push(...scanDirectoryRecursive(resolvedPath));
    } else {
      results.push(resolvedPath);
    }
  }

  return results;
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
    if (obj[key] !== undefined) {
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
): string[] {
  if ((specifier.includes(":") || NODE_BUILTINS.has(specifier)) && !specifier.startsWith(".")) {
    return [specifier];
  }

  if (specifier.startsWith(".")) {
    const dir = path.dirname(currentFile);
    let resolved: string;

    const JS_EXT_RE = /\.(js|mjs|cjs)$/;

    const extMatch = specifier.match(JS_EXT_RE);
    if (extMatch) {
      const base = specifier.slice(0, -extMatch[0].length);
      resolved = path.resolve(dir, base + ".d.ts");
      if (isFileSafe(resolved)) return [normalizePath(resolved)];

      if (extMatch[1] === "mjs") {
        resolved = path.resolve(dir, base + ".d.mts");
        if (isFileSafe(resolved)) return [normalizePath(resolved)];
      }
      if (extMatch[1] === "cjs") {
        resolved = path.resolve(dir, base + ".d.cts");
        if (isFileSafe(resolved)) return [normalizePath(resolved)];
      }

      resolved = path.resolve(dir, base, "index.d.ts");
      if (isFileSafe(resolved)) return [normalizePath(resolved)];
    }

    resolved = path.resolve(dir, specifier + ".d.ts");
    if (isFileSafe(resolved)) return [normalizePath(resolved)];

    resolved = path.resolve(dir, specifier);
    if (isFileSafe(resolved)) return [normalizePath(resolved)];

    resolved = path.resolve(dir, specifier, "index.d.ts");
    if (isFileSafe(resolved)) return [normalizePath(resolved)];

    return [];
  }

  return resolvePackageEntry(specifier, currentFile);
}

/**
 * Resolve a package-level entry point by searching node_modules.
 */
function resolvePackageEntry(specifier: string, currentFile: string): string[] {
  const parts = specifier.split("/");
  let packageName = parts[0]!;
  let subpath = ".";

  if (packageName.startsWith("@") && parts.length >= 2) {
    packageName = `${parts[0]}/${parts[1]}`;
    subpath = parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".";
  } else {
    subpath = parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".";
  }

  const pkgDir = findPackageDir(packageName, path.dirname(currentFile));
  if (!pkgDir) return [];

  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return [];
  }

  const pkgEntry = resolveTypesEntry(pkgDir);

  if (subpath === ".") {
    return pkgEntry.typesEntries;
  }

  const mappedSubpath = pkgEntry.subpaths[subpath];
  if (mappedSubpath) {
    return [mappedSubpath];
  }

  // Resolve targeted subpath against wildcard patterns in exports
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  if (pkg.exports) {
    const wildcardMatched = matchWildcardSubpath(subpath, pkg.exports);
    if (wildcardMatched) {
      const resolved = resolveExportCondition(pkgDir, wildcardMatched);
      if (resolved) return [resolved];
    }
  }

  const subpathParsed = subpath.startsWith("./") ? subpath : `./${subpath}`;
  const resolvedSub = resolveFile(pkgDir, subpathParsed);
  if (resolvedSub) return [normalizePath(resolvedSub)];

  const resolvedSubWithExt = resolveFile(pkgDir, subpathParsed + ".d.ts");
  if (resolvedSubWithExt) return [normalizePath(resolvedSubWithExt)];

  // Directory-to-index fallback
  const indexFallback = path.join(pkgDir, subpathParsed, "index.d.ts");
  if (fs.existsSync(indexFallback)) return [normalizePath(indexFallback)];

  return [];
}

/**
 * Matches a targeted subpath (e.g. "./utils/formatter") against an exports map
 * that might contain wildcards (e.g. "./utils/*").
 *
 * Returns the mapped value with the wildcard replaced.
 */
function matchWildcardSubpath(subpath: string, exports: unknown): unknown | null {
  if (typeof exports !== "object" || exports === null) return null;

  const exportsMap = exports as Record<string, unknown>;

  for (const [key, value] of Object.entries(exportsMap)) {
    if (!key.includes("*") || !key.startsWith(".")) continue;

    const keyParts = key.split("*");
    if (keyParts.length !== 2) continue; // Spec limit: Node.js and TypeScript only support a single wildcard per pattern

    const prefix = keyParts[0]!;
    const suffix = keyParts[1]!;

    if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      const captured = subpath.slice(prefix.length, subpath.length - suffix.length);

      if (typeof value === "string") {
        return value.replace("*", captured);
      }

      if (typeof value === "object" && value !== null) {
        return replaceWildcardInValue(value, captured);
      }
    }
  }

  return null;
}

/** Helper to recursively replace wildcards in nested condition objects. */
function replaceWildcardInValue(value: unknown, replacement: string): unknown {
  if (typeof value === "string") {
    return value.replace("*", replacement);
  }
  if (Array.isArray(value)) {
    return value.map(item => replaceWildcardInValue(item, replacement));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = replaceWildcardInValue(nestedValue, replacement);
    }
    return result;
  }
  return value;
}

/**
 * Find the package directory by walking up node_modules.
 */
function findPackageDir(packageName: string, startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const potential = path.join(current, "node_modules", packageName);
    if (fs.existsSync(potential) && fs.statSync(potential).isDirectory()) {
      return potential;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
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
