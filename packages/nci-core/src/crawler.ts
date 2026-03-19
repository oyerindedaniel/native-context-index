/**
 * NCI Core — Crawler
 *
 * The core recursive engine. Given a starting .d.ts file:
 * 1. Parse it for exports
 * 2. For each re-export, JUMP into the target file
 * 3. Resolve the actual symbol definitions
 * 4. Track visited files to detect circular dependencies
 * 5. Enforce a configurable depth limit
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseExports, parseTripleSlashReferences, parseTypeReferenceDirectives } from "./parser.js";
import type { CrawlResult, ParsedExport, ResolvedSymbol } from "./types.js";

const JS_EXT_RE = /\.(js|mjs|cjs)$/;

export interface CrawlOptions {
  /** Maximum depth for following re-exports (default: 10) */
  maxDepth?: number;
}

/**
 * Crawl a .d.ts file, following all re-exports recursively.
 *
 * @param entryFilePath - Absolute path to the starting .d.ts file
 * @param options - Crawl configuration
 * @returns CrawlResult with all resolved symbols
 */
export function crawl(
  entryFilePath: string,
  options: CrawlOptions = {}
): CrawlResult {
  const maxDepth = options.maxDepth ?? 10;
  const visited = new Set<string>();
  const circularRefs: string[] = [];
  const resolvedSymbols: ResolvedSymbol[] = [];
  const typeRefPackages = new Set<string>();

  const nestedCache = new Map<string, ResolvedSymbol[]>();
  const nestedIndexCache = new Map<string, Map<string, ResolvedSymbol>>();

  crawlFile(entryFilePath, 0);

  return {
    filePath: entryFilePath,
    exports: resolvedSymbols,
    visitedFiles: Array.from(visited),
    typeReferencePackages: Array.from(typeRefPackages),
    circularRefs,
  };

  function crawlFile(filePath: string, depth: number): void {
    const normalizedPath = normalizePath(filePath);

    // Cycle detection
    if (visited.has(normalizedPath)) {
      circularRefs.push(normalizedPath);
      return;
    }

    // Depth limit
    if (depth > maxDepth) return;

    // File must exist
    if (!fs.existsSync(normalizedPath)) return;

    visited.add(normalizedPath);

    // Follow triple-slash references first (e.g., @types/node/index.d.ts)
    // These reference other .d.ts files that should be crawled as part of this package
    const tripleSlashRefs = parseTripleSlashReferences(normalizedPath);
    for (const ref of tripleSlashRefs) {
      const refPath = resolveModuleSpecifier(ref, normalizedPath)
        ?? resolveTripleSlashRef(ref, normalizedPath);
      if (refPath) {
        crawlFile(refPath, depth + 1);
      }
    }

    // Collect /// <reference types="..." /> directives
    const typeRefDirectives = parseTypeReferenceDirectives(normalizedPath);
    for (const pkg of typeRefDirectives) {
      typeRefPackages.add(pkg);
    }

    // Then parse and process exports
    const exports = parseExports(normalizedPath);

    for (const exp of exports) {
      // Skip global augmentations (declare global { }) — they're not real exports
      if (exp.isGlobalAugmentation) continue;

      if (exp.source && exp.kind !== ts.SyntaxKind.ImportEqualsDeclaration) {
        handleReExport(exp, normalizedPath, depth);
      } else if (exp.kind !== ts.SyntaxKind.ExportDeclaration) {
        resolvedSymbols.push({
          name: exp.name,
          kind: exp.kind,
          kindName: exp.kindName,
          isTypeOnly: exp.isTypeOnly,
          signature: exp.signature,
          jsDoc: exp.jsDoc,
          definedIn: normalizedPath,
          dependencies: exp.dependencies,
          deprecated: exp.deprecated,
          visibility: exp.visibility,
        });
      }
    }
  }

  function handleReExport(
    exp: ParsedExport,
    currentFile: string,
    depth: number
  ): void {
    const sourceFile = resolveModuleSpecifier(exp.source!, currentFile);
    if (!sourceFile) return;

    if (exp.isWildcard) {
      // export * from "..." — crawl the source and add all its exports
      crawlFile(sourceFile, depth + 1);
    } else if (exp.isNamespaceExport) {
      // export * as ns from "..." — crawl but wrap in namespace
      const nestedResult = getNestedExports(sourceFile, depth + 1);
      if (nestedResult) {
        resolvedSymbols.push({
          name: exp.name,
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: exp.isTypeOnly,
          definedIn: normalizePath(sourceFile),
          signature: `namespace ${exp.name} { ${nestedResult.length} symbols }`,
        });
      }
    } else {
      // Named re-export: export { X } from "..." or export { X as Y } from "..."
      const targetName = exp.originalName ?? exp.name;
      const index = getNestedExportsIndex(sourceFile, depth + 1);

      if (index) {
        const found = index.get(targetName);
        if (found) {
          resolvedSymbols.push({
            ...found,
            name: exp.name,
            isTypeOnly: exp.isTypeOnly || found.isTypeOnly,
            reExportChain: [...(found.reExportChain ?? []), currentFile],
          });
        } else {
          // Symbol not found in the target — add as unresolved
          resolvedSymbols.push({
            name: exp.name,
            kind: ts.SyntaxKind.ExportDeclaration,
            kindName: "ExportDeclaration",
            isTypeOnly: exp.isTypeOnly,
            definedIn: normalizePath(sourceFile),
            reExportChain: [currentFile],
          });
        }
      }
    }
  }

  /**
   * Get all exports from a nested file, using cache to avoid
   * re-parsing and to allow multiple named re-exports from the
   * same source file.
   */
  function getNestedExports(
    filePath: string,
    depth: number
  ): ResolvedSymbol[] | null {
    const normalizedPath = normalizePath(filePath);

    // Return cached results if available
    if (nestedCache.has(normalizedPath)) {
      return nestedCache.get(normalizedPath)!;
    }

    const result = crawlNestedFile(normalizedPath, depth);
    if (result) {
      nestedCache.set(normalizedPath, result);
    }
    return result;
  }

  /**
   * Get a name-indexed map of exports from a nested file.
   */
  function getNestedExportsIndex(
    filePath: string,
    depth: number
  ): Map<string, ResolvedSymbol> | null {
    const normalizedPath = normalizePath(filePath);
    if (nestedIndexCache.has(normalizedPath)) {
      return nestedIndexCache.get(normalizedPath)!;
    }
    const exports = getNestedExports(filePath, depth);
    if (!exports) return null;
    const index = new Map<string, ResolvedSymbol>();
    for (const sym of exports) {
      if (!index.has(sym.name)) index.set(sym.name, sym);
    }
    nestedIndexCache.set(normalizedPath, index);
    return index;
  }

  /**
   * Crawl a file and return its exports without adding them to the
   * main results list. Used for resolving named and namespace re-exports.
   */
  function crawlNestedFile(
    filePath: string,
    depth: number
  ): ResolvedSymbol[] | null {
    if (depth > maxDepth) return null;
    if (!fs.existsSync(filePath)) return null;

    // Cycle detection against the main visited set
    if (visited.has(filePath)) {
      circularRefs.push(filePath);
      return null;
    }

    visited.add(filePath);

    const exports = parseExports(filePath);
    const results: ResolvedSymbol[] = [];

    for (const exp of exports) {
      if (exp.source && exp.kind !== ts.SyntaxKind.ImportEqualsDeclaration) {
        const sourceFile = resolveModuleSpecifier(exp.source, filePath);
        if (!sourceFile) continue;

        if (exp.isWildcard) {
          const nested = getNestedExports(sourceFile, depth + 1);
          if (nested) results.push(...nested);
        } else {
          const targetName = exp.originalName ?? exp.name;
          const nestedIndex = getNestedExportsIndex(sourceFile, depth + 1);
          if (nestedIndex) {
            const found = nestedIndex.get(targetName);
            if (found) {
              results.push({
                ...found,
                name: exp.name,
                isTypeOnly: exp.isTypeOnly || found.isTypeOnly,
              });
            }
          }
        }
      } else if (exp.kind !== ts.SyntaxKind.ExportDeclaration && !exp.isGlobalAugmentation) {
        results.push({
          name: exp.name,
          kind: exp.kind,
          kindName: exp.kindName,
          isTypeOnly: exp.isTypeOnly,
          signature: exp.signature,
          jsDoc: exp.jsDoc,
          definedIn: filePath,
          dependencies: exp.dependencies,
          deprecated: exp.deprecated,
          visibility: exp.visibility,
        });
      }
    }

    return results;
  }
}

/**
 * Resolve a module specifier relative to the current file.
 */
function resolveModuleSpecifier(
  specifier: string,
  currentFile: string
): string | null {
  if (!specifier.startsWith(".")) return null;

  const dir = path.dirname(currentFile);
  let resolved: string;

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
function isFileSafe(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a triple-slash reference path relative to the current file.
 *
 * Triple-slash references use direct paths like "globals.d.ts" or
 * "./buffer.d.ts" that are resolved relative to the containing file.
 */
function resolveTripleSlashRef(
  refPath: string,
  currentFile: string
): string | null {
  const dir = path.dirname(currentFile);
  const resolved = path.resolve(dir, refPath);
  if (fs.existsSync(resolved)) return normalizePath(resolved);
  return null;
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}
