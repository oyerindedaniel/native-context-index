import path from "node:path";
import ts from "typescript";
import type {
  PackageGraph,
  SymbolNode,
  PackageInfo,
  ResolvedSymbol,
} from "./types.js";
import { NODE_BUILTINS } from "./constants.js";
import { resolveTypesEntry, resolveModuleSpecifier, normalizePath } from "./resolver.js";
import { crawl, type CrawlOptions } from "./crawler.js";
import { clearParserCache } from "./parser.js";
import { normalizeSignature } from "./dedupe.js";
import { profileLog, profileStat, nciProfileEnabled } from "./nci-log-flags.js";

/** Build a symbol graph for a single package. */
export function buildPackageGraph(
  packageInfo: PackageInfo,
  crawlOptions?: CrawlOptions
): PackageGraph {
  const profiling = nciProfileEnabled();
  const startTime = performance.now();
  let phaseStart = startTime;

  const entry = resolveTypesEntry(packageInfo.dir);

  if (profiling) {
    profileLog("resolveTypesEntry", performance.now() - phaseStart);
    profileStat("typesEntries", entry.typesEntries.length);
    phaseStart = performance.now();
  }

  if (entry.typesEntries.length === 0) {
    return {
      package: packageInfo.name,
      version: packageInfo.version,
      symbols: [],
      totalSymbols: 0,
      totalFiles: 0,
      crawlDurationMs: performance.now() - startTime,
    };
  }

  const crawlResult = crawl(entry.typesEntries, crawlOptions);

  if (profiling) {
    profileLog("crawl", performance.now() - phaseStart);
    profileStat("resolvedSymbols (from crawl)", crawlResult.exports.length);
    profileStat("visitedFiles", crawlResult.visitedFiles.length);
    phaseStart = performance.now();
  }

  const allSymbols = crawlResult.exports;
  const allImportsPerFile = crawlResult.imports;
  const visited = new Set(crawlResult.visitedFiles);

  const entryFiles = new Set(
    entry.typesEntries.map((entryFilePath) => makeRelative(entryFilePath, packageInfo.dir))
  );

  const merged = new Map<string, SymbolNode>();

  const isCrossFileMergeable = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.ModuleDeclaration ||
    kind === ts.SyntaxKind.InterfaceDeclaration ||
    kind === ts.SyntaxKind.EnumDeclaration;

  const isOverloadMergeable = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.MethodSignature ||
    kind === ts.SyntaxKind.PropertySignature ||
    kind === ts.SyntaxKind.CallSignature ||
    kind === ts.SyntaxKind.IndexSignature;

  const entryVisibilityContributions = (
    resolved: ResolvedSymbol,
    symbolFilePath: string
  ): string[] => {
    const visibility: string[] = [];
    if (entryFiles.has(symbolFilePath)) {
      visibility.push(symbolFilePath);
    }
    if (resolved.resolvedFromPackageEntry) {
      const rel = makeRelative(resolved.resolvedFromPackageEntry, packageInfo.dir);
      if (entryFiles.has(rel) && !visibility.includes(rel)) {
        visibility.push(rel);
      }
    }
    return visibility;
  };

  const pruneRedundantEntryVisibility = (node: SymbolNode): void => {
    if (!node.entryVisibility || node.entryVisibility.length !== 1) return;
    if (node.entryVisibility[0] === node.filePath) {
      delete node.entryVisibility;
    }
  };

  for (const resolved of allSymbols) {
    const symbolFilePath = makeRelative(resolved.definedIn, packageInfo.dir);
    const isEntryFile = entryFiles.has(symbolFilePath);
    let mergeKey: string;

    if (isCrossFileMergeable(resolved.kind)) {
      // Mergeable types (Interfaces, Namespaces) merge by name package-wide.
      mergeKey = resolved.name;
    } else if (isOverloadMergeable(resolved.kind)) {
      // Overload-like members merge by (name, kind, signature) across files.
      mergeKey = `${resolved.name}::${resolved.kind}::${normalizeSignature(resolved.signature)}`;
    } else {
      mergeKey = `${resolved.name}::${resolved.kind}::${symbolFilePath}::${normalizeSignature(resolved.signature)}`;
    }

    const existing = merged.get(mergeKey);
    if (existing) {
      if (symbolFilePath !== existing.filePath) {
        existing.additionalFiles = existing.additionalFiles || [];
        if (!existing.additionalFiles.includes(symbolFilePath)) {
          existing.additionalFiles.push(symbolFilePath);
        }

        const existingIsEntry = entryFiles.has(existing.filePath);
        if (
          existingIsEntry &&
          !isEntryFile &&
          (isOverloadMergeable(resolved.kind) || isCrossFileMergeable(resolved.kind))
        ) {
          const prev = existing.filePath;
          existing.filePath = symbolFilePath;
          if (!existing.additionalFiles.includes(prev)) {
            existing.additionalFiles.push(prev);
          }
        }
      }

      for (const visPath of entryVisibilityContributions(resolved, symbolFilePath)) {
        existing.entryVisibility = existing.entryVisibility || [];
        if (!existing.entryVisibility.includes(visPath)) {
          existing.entryVisibility.push(visPath);
        }
      }

      if (resolved.dependencies && resolved.dependencies.length > 0) {
        existing.rawDependencies = existing.rawDependencies || [];
        const existingDeps = new Set(
          existing.rawDependencies.map((dep) => `${dep.name}::${dep.importPath || ""}`)
        );
        for (const rawDep of resolved.dependencies) {
          const depKey = `${rawDep.name}::${rawDep.importPath || ""}`;
          if (!existingDeps.has(depKey)) {
            existingDeps.add(depKey);
            existing.rawDependencies.push(rawDep);
          }
        }
      }

      if (resolved.deprecated && !existing.deprecated) existing.deprecated = resolved.deprecated;
      if (resolved.visibility && !existing.visibility) existing.visibility = resolved.visibility;
      if (resolved.since && !existing.since) existing.since = resolved.since;
      if (resolved.modifiers && !existing.modifiers) existing.modifiers = resolved.modifiers;
      if (resolved.isGlobalAugmentation) existing.isGlobalAugmentation = true;
    } else {
      const reExportSource = resolved.reExportChain?.[0]
        ? makeRelative(resolved.reExportChain[0], packageInfo.dir)
        : undefined;
      const visContrib = entryVisibilityContributions(resolved, symbolFilePath);

      merged.set(mergeKey, {
        id: "", // Assigned in next step
        name: resolved.name,
        kind: resolved.kind,
        kindName: resolved.kindName,
        package: packageInfo.name,
        filePath: symbolFilePath,
        signature: resolved.signature,
        jsDoc: resolved.jsDoc,
        isTypeOnly: resolved.isTypeOnly,
        symbolSpace: resolved.symbolSpace,
        dependencies: [],
        rawDependencies: resolved.dependencies,
        isInternal: resolved.isInternal,
        isGlobalAugmentation: resolved.isGlobalAugmentation,
        reExportedFrom: reExportSource !== symbolFilePath ? reExportSource : undefined,
        deprecated: resolved.deprecated,
        visibility: resolved.visibility,
        since: resolved.since,
        heritage: resolved.heritage,
        modifiers: resolved.modifiers,
        entryVisibility: visContrib.length > 0 ? visContrib : undefined,
      });
    }
  }

  if (profiling) {
    profileLog("graphMerge", performance.now() - phaseStart);
    profileStat("mergedSymbols", merged.size);
    phaseStart = performance.now();
  }

  const symbols = Array.from(merged.values());
  for (const symbol of symbols) {
    pruneRedundantEntryVisibility(symbol);
  }

  const idToKind = new Map<string, ts.SyntaxKind>();
  const nameToId = new Map<string, string>();
  const nameToIds = new Map<string, string[]>();
  /** `filePath::name` → ids (all overloads in that file-local scope). */
  const fileLocalToIds = new Map<string, string[]>();
  const nameCount = new Map<string, number>();
  const internalFileNameCount = new Map<string, number>();

  for (const symbolNode of symbols) {
    const baseId = `${packageInfo.name}@${packageInfo.version}::${symbolNode.name}`;

    if (symbolNode.isInternal) {
      const internalFileNameKey = `${symbolNode.filePath}::${symbolNode.name}`;
      const internalOccurrenceCount = (internalFileNameCount.get(internalFileNameKey) ?? 0) + 1;
      internalFileNameCount.set(internalFileNameKey, internalOccurrenceCount);
      symbolNode.id =
        internalOccurrenceCount === 1
          ? `${packageInfo.name}@${packageInfo.version}::${symbolNode.filePath}::${symbolNode.name}`
          : `${packageInfo.name}@${packageInfo.version}::${symbolNode.filePath}::${symbolNode.name}#${internalOccurrenceCount}`;
    } else {
      const count = (nameCount.get(symbolNode.name) ?? 0) + 1;
      nameCount.set(symbolNode.name, count);
      symbolNode.id = count === 1 ? baseId : `${baseId}#${count}`;
    }

    const shortKey = `${symbolNode.filePath}::${symbolNode.name}`;
    idToKind.set(symbolNode.id, symbolNode.kind);
    const existingShort = fileLocalToIds.get(shortKey) || [];
    existingShort.push(symbolNode.id);
    fileLocalToIds.set(shortKey, existingShort);

    const existingByName = nameToIds.get(symbolNode.name) || [];
    existingByName.push(symbolNode.id);
    nameToIds.set(symbolNode.name, existingByName);
  }

  // Same-name value + type (e.g. zod schemas): inheritance flattening must follow the interface/class.
  nameToId.clear();
  for (const symbolNode of symbols) {
    if (
      symbolNode.kind === ts.SyntaxKind.ClassDeclaration ||
      symbolNode.kind === ts.SyntaxKind.InterfaceDeclaration
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (const symbolNode of symbols) {
    if (!nameToId.has(symbolNode.name)) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }

  if (profiling) {
    profileLog("assignIds", performance.now() - phaseStart);
    phaseStart = performance.now();
  }

  const refEdges = crawlResult.tripleSlashReferenceTargets ?? {};
  const hasRefEdges = Object.keys(refEdges).length > 0;

  const normalizedAbsCache = new Map<string, string>();
  const closureCache = new Map<string, string[]>();

  function getCachedNormalizedAbs(relFilePath: string): string {
    let cached = normalizedAbsCache.get(relFilePath);
    if (cached === undefined) {
      cached = normalizePath(path.join(packageInfo.dir, relFilePath));
      normalizedAbsCache.set(relFilePath, cached);
    }
    return cached;
  }

  function getCachedClosure(relFilePath: string): string[] {
    let cached = closureCache.get(relFilePath);
    if (cached === undefined) {
      const abs = getCachedNormalizedAbs(relFilePath);
      cached = tripleSlashReferenceClosure(abs, refEdges);
      closureCache.set(relFilePath, cached);
    }
    return cached;
  }

  const protocolRegex = /^([a-z]+):(.*)$/;
  const moduleSpecifierCache = new Map<string, string[]>();
  const absPathCache = new Map<string, string>();
  const importsByNameCache = new Map<string, Map<string, { source: string; originalName?: string }>>();

  function getCachedAbsPath(relFilePath: string): string {
    let cached = absPathCache.get(relFilePath);
    if (cached === undefined) {
      cached = normalizePath(path.resolve(packageInfo.dir, relFilePath));
      absPathCache.set(relFilePath, cached);
    }
    return cached;
  }

  function getCachedModuleSpecifier(specifier: string, fromRelFile: string): string[] {
    const cacheKey = `${fromRelFile}\0${specifier}`;
    let cached = moduleSpecifierCache.get(cacheKey);
    if (cached === undefined) {
      cached = resolveModuleSpecifier(specifier, path.join(packageInfo.dir, fromRelFile));
      moduleSpecifierCache.set(cacheKey, cached);
    }
    return cached;
  }

  function getImportsByName(absFilePath: string): Map<string, { source: string; originalName?: string }> {
    let cached = importsByNameCache.get(absFilePath);
    if (cached === undefined) {
      cached = new Map();
      const fileImports = allImportsPerFile[absFilePath] || [];
      for (const imp of fileImports) {
        if (!cached.has(imp.name)) {
          cached.set(imp.name, { source: imp.source, originalName: imp.originalName });
        }
      }
      importsByNameCache.set(absFilePath, cached);
    }
    return cached;
  }

  function resolveProtocol(importPath: string, depName: string): string | null {
    const isBuiltin = NODE_BUILTINS.has(importPath);
    if (!isBuiltin && !protocolRegex.test(importPath)) return null;
    const match = importPath.match(protocolRegex);
    const protocol = isBuiltin ? "node" : (match ? match[1] : "unknown");
    const source = isBuiltin
      ? importPath
      : (match && match[2] ? (match[2].startsWith("//") ? match[2].slice(2) : match[2]) : "unknown");
    return `${protocol}::${source}::${depName}`;
  }

  for (const symbolNode of symbols) {
    if (symbolNode.rawDependencies && symbolNode.rawDependencies.length > 0) {
      const resolvedIds = new Set<string>();
      const symAbsPath = getCachedAbsPath(symbolNode.filePath);

      for (const rawDep of symbolNode.rawDependencies) {
        let targetIds: string[] = [];

        if (rawDep.importPath) {
          const absPaths = getCachedModuleSpecifier(rawDep.importPath, symbolNode.filePath);
          if (absPaths.length > 0) {
            const relPath = makeRelative(absPaths[0]!, packageInfo.dir);
            targetIds = fileLocalToIds.get(`${relPath}::${rawDep.name}`) || [];
          }
        } else {
          targetIds = fileLocalToIds.get(`${symbolNode.filePath}::${rawDep.name}`) || [];

          if (targetIds.length === 0) {
            const importMap = getImportsByName(symAbsPath);
            const matchingImport = importMap.get(rawDep.name);

            if (matchingImport) {
              const absSourcePaths = getCachedModuleSpecifier(matchingImport.source, symbolNode.filePath);
              if (absSourcePaths.length > 0) {
                const relSourcePath = makeRelative(absSourcePaths[0]!, packageInfo.dir);
                const originalName = matchingImport.originalName || rawDep.name;
                targetIds = fileLocalToIds.get(`${relSourcePath}::${originalName}`) || [];
              }
            }
          }
          if (targetIds.length === 0 && hasRefEdges) {
            const closure = getCachedClosure(symbolNode.filePath);
            const fromClosure = new Set<string>();
            for (const reachableFileAbs of closure) {
              const rel = makeRelative(reachableFileAbs, packageInfo.dir);
              if (rel === symbolNode.filePath) continue;
              for (const symbolId of fileLocalToIds.get(`${rel}::${rawDep.name}`) || []) {
                fromClosure.add(symbolId);
              }
            }
            targetIds = [...fromClosure];
          }
          if (targetIds.length === 0) {
            targetIds = nameToIds.get(rawDep.name) || [];
          }
        }
        if (targetIds.length > 0) {
          targetIds = targetIds.filter((symbolId) =>
            kindMatchesResolutionHint(
              idToKind.get(symbolId) ?? ts.SyntaxKind.Unknown,
              rawDep.resolutionHint
            )
          );
        }

        if (targetIds.length > 0) {
          targetIds = targetIds.filter((symbolId) => symbolId !== symbolNode.id);
        }

        if (targetIds.length > 0) {
          for (const symbolId of targetIds) {
            resolvedIds.add(symbolId);
          }
        } else {
          if (rawDep.importPath) {
            const resolved = resolveProtocol(rawDep.importPath, rawDep.name);
            if (resolved) resolvedIds.add(resolved);
          } else {
            const importMap = getImportsByName(symAbsPath);
            const matchingImport = importMap.get(rawDep.name);
            if (matchingImport) {
              const resolved = resolveProtocol(matchingImport.source, matchingImport.originalName || rawDep.name);
              if (resolved) resolvedIds.add(resolved);
            }
          }
        }
      }
      symbolNode.dependencies = Array.from(resolvedIds).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    delete symbolNode.rawDependencies;
  }

  if (profiling) {
    profileLog("resolveDeps", performance.now() - phaseStart);
    phaseStart = performance.now();
  }

  flattenInheritedMembers(symbols, nameToId, packageInfo.name, packageInfo.version);

  if (profiling) {
    profileLog("flattenInherited", performance.now() - phaseStart);
  }

  const afterFlatten = performance.now();
  clearParserCache();

  if (profiling) {
    profileLog("clearParserCache", performance.now() - afterFlatten);
    profileLog("buildPackageGraph total", performance.now() - startTime);
  }

  const result: PackageGraph = {
    package: packageInfo.name,
    version: packageInfo.version,
    symbols,
    totalSymbols: symbols.length,
    totalFiles: visited.size,
    crawlDurationMs: performance.now() - startTime,
  };

  return result;
}

/** Flatten inherited members. */
function flattenInheritedMembers(
  symbols: SymbolNode[],
  nameToId: Map<string, string>,
  pkgName: string,
  pkgVersion: string
): void {
  const idToNode = new Map<string, SymbolNode>();
  const membersByParentName = new Map<string, SymbolNode[]>();
  
  for (const symbolNode of symbols) {
    idToNode.set(symbolNode.id, symbolNode);
    const parts = symbolNode.name.split(".");
    if (parts.length > 1) {
      const isPrototype = parts.includes("prototype");
      const parentName = isPrototype 
        ? parts.slice(0, parts.indexOf("prototype")).join(".") 
        : parts.slice(0, -1).join(".");
      
      let list = membersByParentName.get(parentName);
      if (!list) {
        list = [];
        membersByParentName.set(parentName, list);
      }
      list.push(symbolNode);
    }
  }

  const classOrInterfaceNodes = symbols.filter(
    (symbolNode) => symbolNode.kind === ts.SyntaxKind.ClassDeclaration || symbolNode.kind === ts.SyntaxKind.InterfaceDeclaration
  );

  const syntheticSymbols: SymbolNode[] = [];

  for (const node of classOrInterfaceNodes) {
    if (!node.heritage || node.heritage.length === 0) continue;

    const childMembers = membersByParentName.get(node.name) || [];
    const childMemberNames = new Set(childMembers.map(member => member.name.split(".").pop()!));

    const visitedParents = new Set<string>();
    const parentsToVisit = [...node.heritage];

    while (parentsToVisit.length > 0) {
      const parentName = parentsToVisit.shift()!;
      if (visitedParents.has(parentName)) continue;
      visitedParents.add(parentName);

      const parentId = nameToId.get(parentName);
      if (!parentId) continue;

      const parentNode = idToNode.get(parentId);
      if (parentNode && parentNode.heritage) {
        parentsToVisit.push(...parentNode.heritage);
      }

      const parentMembers = membersByParentName.get(parentName) || [];
      for (const parentMember of parentMembers) {
        const shortName = parentMember.name.split(".").pop()!;

        // Shadowing Detection (Override)
        if (childMemberNames.has(shortName)) continue;
        childMemberNames.add(shortName);

        if (parentMember.visibility === "internal") continue;

        const isPrototype = parentMember.name.includes(".prototype.");
        const newMemberName = isPrototype 
          ? `${node.name}.prototype.${shortName}` 
          : `${node.name}.${shortName}`;

        const synthId = `${pkgName}@${pkgVersion}::${newMemberName}`;

        syntheticSymbols.push({
          ...parentMember,
          id: synthId,
          name: newMemberName,
          isInherited: true,
          inheritedFrom: parentMember.id,
          additionalFiles: undefined,
        });
      }
    }
  }

  for (const synth of syntheticSymbols) {
    symbols.push(synth);
  }
}

/** BFS closure of files reachable from `startAbs` via direct `/// <reference path` edges. */
function tripleSlashReferenceClosure(startAbs: string, edges: Record<string, string[]>): string[] {
  const visited = new Set<string>();
  const queue: string[] = [startAbs];
  visited.add(startAbs);
  while (queue.length > 0) {
    const currentFileAbs = queue.shift()!;
    for (const referencedPath of edges[currentFileAbs] ?? []) {
      if (!visited.has(referencedPath)) {
        visited.add(referencedPath);
        queue.push(referencedPath);
      }
    }
  }
  return [...visited].sort();
}

/** Make a path relative to the package root. */
function makeRelative(absPath: string, packageDir: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const normalizedDir = packageDir.replace(/\\/g, "/");

  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length + 1);
  }
  return path.relative(packageDir, absPath).replace(/\\/g, "/");
}

function kindMatchesResolutionHint(kind: ts.SyntaxKind, hint: "type" | "value" | undefined): boolean {
  if (!hint) return true;
  if (hint === "value") {
    return (
      kind === ts.SyntaxKind.VariableStatement ||
      kind === ts.SyntaxKind.FunctionDeclaration ||
      kind === ts.SyntaxKind.ClassDeclaration ||
      kind === ts.SyntaxKind.EnumDeclaration ||
      kind === ts.SyntaxKind.ModuleDeclaration
    );
  }
  return (
    kind === ts.SyntaxKind.InterfaceDeclaration ||
    kind === ts.SyntaxKind.TypeAliasDeclaration ||
    kind === ts.SyntaxKind.ClassDeclaration ||
    kind === ts.SyntaxKind.EnumDeclaration ||
    kind === ts.SyntaxKind.ModuleDeclaration ||
    kind === ts.SyntaxKind.MethodSignature ||
    kind === ts.SyntaxKind.PropertySignature ||
    kind === ts.SyntaxKind.CallSignature ||
    kind === ts.SyntaxKind.IndexSignature
  );
}
