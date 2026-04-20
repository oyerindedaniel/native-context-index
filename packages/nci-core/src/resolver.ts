import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { PackageEntry } from "./types.js";
import { NODE_BUILTINS } from "./constants.js";

/**
 * Resolves the types entry point(s) for a package given its directory.

 */
export function resolveTypesEntry(packageDir: string): PackageEntry {
  const pkgJsonPath = path.join(packageDir, "package.json");
  const pkg = fs.existsSync(pkgJsonPath)
    ? JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"))
    : {};

  const name: string = pkg.name ?? path.basename(packageDir);
  const typesEntries: string[] = [];
  const subpaths: Record<string, string> = {};

  // 1. Exports field (Modern Node.js resolution)
  if (pkg.exports) {
    const resolved = resolveAllExports(packageDir, pkg.exports, subpaths);
    typesEntries.push(...resolved);
  }

  const shouldResolveRootFallbacks =
    typesEntries.length === 0 || subpaths["."] === undefined;

  // 2. typesVersions (TypeScript version-specific mappings)
  if (shouldResolveRootFallbacks && pkg.typesVersions) {
    const resolved = resolveTypesVersions(packageDir, pkg.typesVersions);
    if (resolved) {
      if (!typesEntries.includes(resolved)) {
        typesEntries.push(resolved);
      }
      subpaths["."] = resolved;
    }
  }

  // 3. types field (Standard TS field)
  if ((typesEntries.length === 0 || subpaths["."] === undefined) && pkg.types) {
    const resolved = resolveFile(packageDir, pkg.types);
    if (resolved) {
      if (!typesEntries.includes(resolved)) {
        typesEntries.push(resolved);
      }
      subpaths["."] = resolved;
    }
  }

  // 4. typings field (Legacy TS field)
  if (
    (typesEntries.length === 0 || subpaths["."] === undefined) &&
    pkg.typings
  ) {
    const resolved = resolveFile(packageDir, pkg.typings);
    if (resolved) {
      if (!typesEntries.includes(resolved)) {
        typesEntries.push(resolved);
      }
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

  typesEntries.sort();
  const deduped = [...new Set(typesEntries)];

  return { name, dirPath: packageDir, typesEntries: deduped, subpaths };
}

/**
 * Resolve ALL subpath entries from the modern Node.js `exports` field.
 * Handles string maps, nested conditional objects, and wildcard expansion.
 *
 * @param packageDir Absolute path to the package root.
 * @param exports The raw exports value from package.json.
 * @param subpaths Output map for populating discovered subpath-to-file entries.
 * @returns Array of all absolute .d.ts paths resolved from the field.
 */
function resolveAllExports(
  packageDir: string,
  exports: unknown,
  subpaths: Record<string, string>,
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  if (typeof exports === "string") {
    if (
      exports.endsWith(".d.ts") ||
      exports.endsWith(".d.mts") ||
      exports.endsWith(".d.cts")
    ) {
      const resolved = resolveFile(packageDir, exports);
      if (resolved) {
        entries.push(resolved);
        if (!subpaths["."]) subpaths["."] = resolved;
      }
    }
    return entries;
  }

  if (typeof exports === "object" && exports !== null) {
    const exportsMap = exports as Record<string, unknown>;

    const hasSubpaths = Object.keys(exportsMap).some((key) =>
      key.startsWith("."),
    );

    if (hasSubpaths) {
      for (const [subpath, value] of Object.entries(exportsMap)) {
        if (!subpath.startsWith(".")) continue;
        if (subpath === "./package.json") continue;

        if (subpath.includes("*")) {
          const wildcardEntries = expandWildcardSubpath(packageDir, value);
          for (const wildcardEntry of wildcardEntries) {
            if (!seen.has(wildcardEntry)) {
              seen.add(wildcardEntry);
              entries.push(wildcardEntry);
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
      const resolved = resolveExportCondition(packageDir, exportsMap);
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
 * Resolves nested conditions within an individual package export entry.
 * Prioritizes 'types' and follows 'import', 'require', or 'default' if present.
 *
 * @param packageDir Absolute path to the package directory.
 * @param entry The conditional export entry to resolve.
 * @returns Resolved absolute file path or null if no valid type entry is found.
 */
function resolveExportCondition(
  packageDir: string,
  entry: unknown,
): string | null {
  if (typeof entry === "string") {
    if (
      entry.endsWith(".d.ts") ||
      entry.endsWith(".d.mts") ||
      entry.endsWith(".d.cts")
    ) {
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

  const entryObj = entry as Record<string, unknown>;

  // Priority order: types → import → require → default
  if (entryObj.types !== undefined) {
    const resolved = resolveExportCondition(packageDir, entryObj.types);
    if (resolved) return resolved;
  }

  if (entryObj.import) {
    const resolved = resolveExportCondition(packageDir, entryObj.import);
    if (resolved) return resolved;
  }

  if (entryObj.require) {
    const resolved = resolveExportCondition(packageDir, entryObj.require);
    if (resolved) return resolved;
  }

  if (entryObj.node) {
    const resolved = resolveExportCondition(packageDir, entryObj.node);
    if (resolved) return resolved;
  }

  if (entryObj.default !== undefined) {
    const resolved = resolveExportCondition(packageDir, entryObj.default);
    if (resolved) return resolved;
  }

  return null;
}

/**
  /**
 * Resolves types from the legacy `typesVersions` field using the current TypeScript version.
 *
 * @param packageDir Absolute path to the package directory.
 * @param typesVersions The raw typesVersions mapping object.
 * @returns Resolved absolute .d.ts path or null if no version-matched entry is found.
 */
function resolveTypesVersions(
  packageDir: string,
  typesVersions: Record<string, Record<string, string[]>>,
): string | null {
  const currentVersion = ts.version;

  for (const [versionRange, pathMap] of Object.entries(typesVersions)) {
    if (matchesVersionRange(currentVersion, versionRange)) {
      const dotPaths = pathMap["."];
      if (dotPaths && dotPaths.length > 0) {
        for (const dotPath of dotPaths) {
          const resolved = resolveFile(packageDir, dotPath);
          if (resolved) return resolved;
        }
      }

      const wildcardPaths = pathMap["*"];
      if (wildcardPaths && wildcardPaths.length > 0) {
        for (const wildcardPath of wildcardPaths) {
          const redirectPath = wildcardPath.replace("*", "index");
          const resolved = resolveFile(packageDir, redirectPath);
          if (resolved) return resolved;
          const hasDeclarationExt =
            redirectPath.endsWith(".d.ts") ||
            redirectPath.endsWith(".d.mts") ||
            redirectPath.endsWith(".d.cts");
          if (!hasDeclarationExt) {
            const withDts = resolveFile(packageDir, `${redirectPath}.d.ts`);
            if (withDts) return withDts;
            const withDmts = resolveFile(packageDir, `${redirectPath}.d.mts`);
            if (withDmts) return withDmts;
            const withDcts = resolveFile(packageDir, `${redirectPath}.d.cts`);
            if (withDcts) return withDcts;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Evaluates a TypeScript version against a semver-like range (e.g., ">=5.0").
 * Used specifically for processing `typesVersions`.
 *
 * @param version The current TypeScript version string.
 * @param range The version range to test against.
 * @returns True if the version satisfies the range.
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
 * Resolves a relative file path against the package root and verifies its existence.
 *
 * @param packageDir Absolute path to the package root.
 * @param relativePath Relative path from the package.json.
 * @returns Fully qualified absolute path if valid, otherwise null.
 */
function resolveFile(packageDir: string, relativePath: string): string | null {
  const absPath = path.resolve(packageDir, relativePath);
  return isFileSafe(absPath) ? normalizePath(absPath) : null;
}

/**
 * Expands a wildcard export pattern (e.g., "./*") into a list of absolute .d.ts files.
 * Iterates through the filesystem based on the provided pattern template.
 *
 * @param packageDir Absolute path to the package root.
 * @param value The raw wildcard pattern or conditional object containing it.
 * @returns Array of absolute paths matching the expanded wildcard.
 */
function expandWildcardSubpath(packageDir: string, value: unknown): string[] {
  const matchingEntries: string[] = [];

  const pattern = extractWildcardPattern(value);
  if (!pattern || !pattern.includes("*")) return matchingEntries;

  const firstStarIndex = pattern.indexOf("*");
  const beforeFirstStar = pattern.slice(0, firstStarIndex);
  const lastSlashBeforeStar = beforeFirstStar.lastIndexOf("/");

  const dirPart =
    lastSlashBeforeStar >= 0
      ? beforeFirstStar.slice(0, lastSlashBeforeStar)
      : ".";
  const scanDirectory = path.resolve(packageDir, dirPart);

  if (!fs.existsSync(scanDirectory)) return matchingEntries;

  const globRegex = globToRegExp(pattern);
  const fileCandidates = scanDirectoryRecursive(scanDirectory);

  for (const candidatePath of fileCandidates) {
    const relativeToPackage = path
      .relative(packageDir, candidatePath)
      .replace(/\\/g, "/");
    const normalizedRelative = relativeToPackage.startsWith("./")
      ? relativeToPackage
      : `./${relativeToPackage}`;

    if (
      globRegex.test(normalizedRelative) ||
      globRegex.test(relativeToPackage)
    ) {
      if (
        candidatePath.endsWith(".d.ts") ||
        candidatePath.endsWith(".d.mts") ||
        candidatePath.endsWith(".d.cts")
      ) {
        matchingEntries.push(normalizePath(candidatePath));
      }
    }
  }

  matchingEntries.sort();
  return matchingEntries;
}

/**
 * Converts a glob-style pattern (e.g. "dist/*.d.ts") into a compiled RegExp for matching.
 * Handles subpath wildcards according to Node.js resolution specification.
 *
 * @param pattern The wildcard pattern to convert.
 * @returns Compiled RegExp instance.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // Escape regex chars except *
  const regexStr = escaped.replace(/\*/g, "([^/]+)"); // * matches anything except /
  return new RegExp(`^${regexStr}$`);
}

/**
 * Scans a directory recursively to identify all candidate files for pattern matching.
 *
 * @param dir The directory to scan.
 * @returns Array of absolute file paths.
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
 * Extracts a wildcard pattern string from a conditional entry by prioritizing type-specific fields.
 *
 * @param value The raw entry point value.
 * @returns The pattern string or null if not discovered.
 */
function extractWildcardPattern(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractWildcardPattern(item);
      if (found) return found;
    }
    return null;
  }
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
  currentFile: string,
): string[] {
  if (
    (specifier.includes(":") || NODE_BUILTINS.has(specifier)) &&
    !specifier.startsWith(".")
  ) {
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

/** Resolve a package-level entry point from node_modules. */
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

  let pkgDir = findPackageDir(packageName, path.dirname(currentFile));
  if (!pkgDir && !packageName.startsWith("@")) {
    pkgDir = findPackageDir(`@types/${packageName}`, path.dirname(currentFile));
  }
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
 * Matches a target subpath (e.g. "./utils/math") against a wildcard export map.
 * Performs replacement of capturing groups into the target path template.
 *
 * @param subpath The requested subpath.
 * @param exports The raw exports map.
 * @returns The resulting mapped value or null if no match is found.
 */
function matchWildcardSubpath(
  subpath: string,
  exports: unknown,
): unknown | null {
  if (typeof exports !== "object" || exports === null) return null;

  const exportsMap = exports as Record<string, unknown>;

  for (const [key, value] of Object.entries(exportsMap)) {
    if (!key.includes("*") || !key.startsWith(".")) continue;

    const keyParts = key.split("*");
    if (keyParts.length !== 2) continue; // Spec limit: Node.js and TypeScript only support a single wildcard per pattern

    const prefix = keyParts[0]!;
    const suffix = keyParts[1]!;

    if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      const captured = subpath.slice(
        prefix.length,
        subpath.length - suffix.length,
      );

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

/**
 * Recursively injects captured wildcard segments into template strings/objects.
 *
 * @param value The value template to transform.
 * @param replacement The string captured from the wildcard.
 * @returns The transformed value.
 */
function replaceWildcardInValue(value: unknown, replacement: string): unknown {
  if (typeof value === "string") {
    return value.replace("*", replacement);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceWildcardInValue(item, replacement));
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
 * Discovers a package's root directory by traversing upwards to the nearest node_modules.
 *
 * @param packageName Name of the package to find.
 * @param startDir Directory to begin the upward search.
 * @returns The absolute path to the package root or null.
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

/**
 * Safely verifies if a path is a regular file using synchronous filesystem statistics.
 *
 * @param filePath The path to check.
 * @returns True if the path is a file.
 */
export function isFileSafe(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Normalizes a file path by resolving it to an absolute format and standardizing separators.
 *
 * @param filePath The raw path string.
 * @returns Absolute path with normalized forward slash separators.
 */
export function normalizePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync(resolved).replace(/\\/g, "/");
  } catch {
    // If realpathSync fails (file doesn't exist yet), fall back to resolved path
    return resolved.replace(/\\/g, "/");
  }
}
