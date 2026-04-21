import path from "node:path";
import { makePackageRelativePath } from "./relative-path-encoding.js";
import ts from "typescript";
import type {
  PackageGraph,
  SymbolNode,
  PackageInfo,
  ResolvedSymbol,
  MergeProvenanceKind,
  ContributionMergePath,
} from "./types.js";
import { CONTRIBUTION_MERGE_PATH, MERGE_PROVENANCE_KIND } from "./types.js";
import { NODE_BUILTINS } from "./constants.js";
import {
  resolveTypesEntry,
  resolveModuleSpecifier,
  normalizePath,
} from "./resolver.js";
import { npmPackageRoot } from "./npm-package-root.js";
import { crawl, type CrawlOptions } from "./crawler.js";
import { clearParserCache } from "./parser.js";
import { normalizeSignature } from "./dedupe.js";
import {
  assignEnclosingModuleDeclarationIds,
  assignParentSymbolIds,
} from "./parent-symbol.js";
import { profileLog, profileStat, nciProfileEnabled } from "./nci-log-flags.js";

function specifierMatchesDependencyStubRoots(
  specifier: string,
  stubRoots: ReadonlySet<string>,
  selfStubExemptRoot: string | null,
): boolean {
  const root = npmPackageRoot(specifier);
  if (root === null) {
    return false;
  }
  if (selfStubExemptRoot !== null && root === selfStubExemptRoot) {
    return false;
  }
  return stubRoots.has(root);
}

function ufFind(parent: number[], index: number): number {
  while (parent[index] !== index) {
    parent[index] = parent[parent[index]!]!;
    index = parent[index]!;
  }
  return index;
}

function ufUnion(parent: number[], indexA: number, indexB: number): void {
  const rootA = ufFind(parent, indexA);
  const rootB = ufFind(parent, indexB);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function fuseMergedSignatures(
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined {
  if (incoming === undefined) return existing;
  if (existing === undefined) return incoming;
  if (existing === incoming) return existing;
  if (incoming.trim() === "") return existing;
  if (existing.trim() === "") return incoming;
  return `${existing}\n${incoming}`;
}

/** Per package-relative path: module scope is `m:<rel>` or `mcc:<rep>` (triple-slash-connected modules), scripts use `s:<rep>`. */
function computeMergeScopeIds(
  visitedFiles: string[],
  tripleSlash: Record<string, string[]>,
  fileIsExternalModule: Record<string, boolean>,
  packageDir: string,
  absoluteToPackageRelativeFromCrawl: Record<string, string>,
): [Map<string, string>, Map<string, string>] {
  const absToRel = new Map<string, string>();
  const scriptAbs: string[] = [];
  const moduleAbs: string[] = [];
  const scriptIndex = new Map<string, number>();
  const moduleIndex = new Map<string, number>();
  for (const abs of visitedFiles) {
    const rel =
      absoluteToPackageRelativeFromCrawl[abs] ??
      makePackageRelativePath(abs, packageDir);
    absToRel.set(abs, rel);
    const isExternalModule = fileIsExternalModule[abs] ?? true;
    if (isExternalModule) {
      moduleIndex.set(abs, moduleAbs.length);
      moduleAbs.push(abs);
    } else {
      scriptIndex.set(abs, scriptAbs.length);
      scriptAbs.push(abs);
    }
  }
  const scriptCount = scriptAbs.length;
  const moduleCount = moduleAbs.length;
  const parent =
    scriptCount > 0 ? Array.from({ length: scriptCount }, (_, idx) => idx) : [];
  const moduleParent =
    moduleCount > 0 ? Array.from({ length: moduleCount }, (_, idx) => idx) : [];
  for (const [fromAbs, targets] of Object.entries(tripleSlash)) {
    const fromScriptIdx = scriptIndex.get(fromAbs);
    const fromModuleIdx = moduleIndex.get(fromAbs);
    for (const toAbs of targets) {
      if (fromScriptIdx !== undefined) {
        const toScriptIdx = scriptIndex.get(toAbs);
        if (toScriptIdx !== undefined) {
          ufUnion(parent, fromScriptIdx, toScriptIdx);
        }
      }
      if (fromModuleIdx !== undefined) {
        const toModuleIdx = moduleIndex.get(toAbs);
        if (toModuleIdx !== undefined) {
          ufUnion(moduleParent, fromModuleIdx, toModuleIdx);
        }
      }
    }
  }
  const rootMinRel = new Map<number, string>();
  const moduleRootMinRel = new Map<number, string>();
  const moduleRootSize = new Map<number, number>();
  if (scriptCount > 0) {
    for (let scriptIdx = 0; scriptIdx < scriptCount; scriptIdx++) {
      const root = ufFind(parent, scriptIdx);
      const rel = absToRel.get(scriptAbs[scriptIdx]!) ?? ".";
      const cur = rootMinRel.get(root);
      if (cur === undefined || rel < cur) rootMinRel.set(root, rel);
    }
  }
  if (moduleCount > 0) {
    for (let moduleIdx = 0; moduleIdx < moduleCount; moduleIdx++) {
      const root = ufFind(moduleParent, moduleIdx);
      const rel = absToRel.get(moduleAbs[moduleIdx]!) ?? ".";
      const cur = moduleRootMinRel.get(root);
      if (cur === undefined || rel < cur) moduleRootMinRel.set(root, rel);
      moduleRootSize.set(root, (moduleRootSize.get(root) ?? 0) + 1);
    }
  }
  const mergeScopeByRel = new Map<string, string>();
  for (const abs of visitedFiles) {
    const rel = absToRel.get(abs)!;
    let scopeId: string;
    const scriptIdx = scriptIndex.get(abs);
    if (scriptIdx !== undefined) {
      const root = ufFind(parent, scriptIdx);
      const rep = rootMinRel.get(root) ?? rel;
      scopeId = `s:${rep}`;
    } else {
      const moduleIdx = moduleIndex.get(abs);
      if (moduleIdx === undefined) {
        scopeId = `m:${rel}`;
      } else {
        const root = ufFind(moduleParent, moduleIdx);
        const componentSize = moduleRootSize.get(root) ?? 1;
        if (componentSize > 1) {
          const representativeRel = moduleRootMinRel.get(root) ?? rel;
          scopeId = `mcc:${representativeRel}`;
        } else {
          scopeId = `m:${rel}`;
        }
      }
    }
    mergeScopeByRel.set(rel, scopeId);
  }
  return [mergeScopeByRel, absToRel];
}

/** Build a symbol graph for a single package. */
export function buildPackageGraph(
  packageInfo: PackageInfo,
  crawlOptions?: CrawlOptions,
): PackageGraph {
  const profiling = nciProfileEnabled();
  const startTime = performance.now();
  let phaseStart = startTime;

  const entryStart = performance.now();
  const entry = resolveTypesEntry(packageInfo.dir);
  const entryResolutionMs = performance.now() - entryStart;

  if (profiling) {
    profileLog("resolveTypesEntry", entryResolutionMs);
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
      crawlDurationMs: 0,
      buildDurationMs: entryResolutionMs,
    };
  }

  const stubSelfExemptRoot = npmPackageRoot(packageInfo.name);
  const mergedCrawlOptions: CrawlOptions = {
    ...(crawlOptions ?? {}),
    dependencyStubSelfExemptRoot: stubSelfExemptRoot ?? undefined,
    packageRootForRelativePaths: packageInfo.dir,
  };

  const crawlPhaseStart = performance.now();
  const crawlResult = crawl(entry.typesEntries, mergedCrawlOptions);
  const crawlDurationMs = performance.now() - crawlPhaseStart;

  if (profiling) {
    profileLog("crawl", crawlDurationMs);
    profileStat("resolvedSymbols (from crawl)", crawlResult.exports.length);
    profileStat("visitedFiles", crawlResult.visitedFiles.length);
    phaseStart = performance.now();
  }

  const graphAssemblyStart = performance.now();

  const allSymbols = crawlResult.exports;
  const allImportsPerFile = crawlResult.imports;
  const visited = new Set(crawlResult.visitedFiles);

  const entryFiles = new Set(
    entry.typesEntries.map((entryFilePath) =>
      makePackageRelativePath(entryFilePath, packageInfo.dir),
    ),
  );

  const merged = new Map<string, SymbolNode>();
  /** Per merged row (`mergeKey`): normalized signatures already represented in `signature` (avoids fusing whitespace-only duplicates). */
  const signatureNormsByMergeRow = new Map<string, Set<string>>();

  const absoluteToPackageRelative = crawlResult.absoluteToPackageRelative ?? {};
  const [mergeScopeByRel, absToRel] = computeMergeScopeIds(
    crawlResult.visitedFiles,
    crawlResult.tripleSlashReferenceTargets,
    crawlResult.fileIsExternalModule,
    packageInfo.dir,
    absoluteToPackageRelative,
  );
  const relToAbsRecord = crawlResult.relToAbs ?? {};
  const moduleIdenticalFold = new Map<string, string>();

  function storedFilePathToCrawlAbs(relFilePath: string): string {
    const absolutePath = relToAbsRecord[relFilePath];
    if (absolutePath !== undefined) {
      return normalizePath(absolutePath);
    }
    return normalizePath(path.resolve(packageInfo.dir, relFilePath));
  }

  const isInterfaceOrTypeAliasMergeScoped = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.InterfaceDeclaration ||
    kind === ts.SyntaxKind.TypeAliasDeclaration;

  const isNamespaceOrEnumCrossFileMergeable = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.ModuleDeclaration ||
    kind === ts.SyntaxKind.EnumDeclaration;

  const isOverloadMergeable = (kind: ts.SyntaxKind): boolean =>
    kind === ts.SyntaxKind.MethodSignature ||
    kind === ts.SyntaxKind.PropertySignature ||
    kind === ts.SyntaxKind.CallSignature ||
    kind === ts.SyntaxKind.IndexSignature;

  function upsertMergeProvenance(
    existing: SymbolNode,
    contributionPath: ContributionMergePath,
    resolved: ResolvedSymbol,
  ): void {
    if (!existing.mergeProvenance) {
      existing.mergeProvenance = { kinds: [] };
    }
    const { kinds } = existing.mergeProvenance;
    if (!kinds.includes(contributionPath)) {
      kinds.push(contributionPath);
    }
    if (
      isOverloadMergeable(resolved.kind) &&
      !kinds.includes(MERGE_PROVENANCE_KIND.overloadKey)
    ) {
      kinds.push(MERGE_PROVENANCE_KIND.overloadKey);
    }
    kinds.sort();
  }

  const entryVisibilityContributions = (
    resolved: ResolvedSymbol,
    symbolFilePath: string,
  ): string[] => {
    const visibility: string[] = [];
    if (entryFiles.has(symbolFilePath)) {
      visibility.push(symbolFilePath);
    }
    if (resolved.resolvedFromPackageEntry) {
      const rel = makePackageRelativePath(
        resolved.resolvedFromPackageEntry,
        packageInfo.dir,
      );
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

  function mergeContribution(
    mergeRowKey: string,
    existing: SymbolNode,
    resolved: ResolvedSymbol,
    symbolFilePath: string,
    isEntryFile: boolean,
    contributionPath: ContributionMergePath,
  ): void {
    upsertMergeProvenance(existing, contributionPath, resolved);

    if (symbolFilePath !== existing.filePath) {
      existing.additionalFiles = existing.additionalFiles || [];
      if (!existing.additionalFiles.includes(symbolFilePath)) {
        existing.additionalFiles.push(symbolFilePath);
      }

      const existingIsEntry = entryFiles.has(existing.filePath);
      if (
        existingIsEntry &&
        !isEntryFile &&
        (isOverloadMergeable(resolved.kind) ||
          isNamespaceOrEnumCrossFileMergeable(resolved.kind) ||
          isInterfaceOrTypeAliasMergeScoped(resolved.kind))
      ) {
        const prev = existing.filePath;
        existing.filePath = symbolFilePath;
        if (!existing.additionalFiles.includes(prev)) {
          existing.additionalFiles.push(prev);
        }
      }
    }

    const normalizedIncomingSignature = normalizeSignature(resolved.signature);
    const normalizedSignaturesSeen = signatureNormsByMergeRow.get(mergeRowKey);
    let shouldSkipRedundantSignatureFusion = false;
    if (normalizedIncomingSignature && normalizedSignaturesSeen) {
      if (normalizedSignaturesSeen.has(normalizedIncomingSignature)) {
        shouldSkipRedundantSignatureFusion = true;
      } else {
        normalizedSignaturesSeen.add(normalizedIncomingSignature);
      }
    }
    if (!shouldSkipRedundantSignatureFusion) {
      existing.signature = fuseMergedSignatures(
        existing.signature,
        resolved.signature,
      );
    }

    for (const visPath of entryVisibilityContributions(
      resolved,
      symbolFilePath,
    )) {
      existing.entryVisibility = existing.entryVisibility || [];
      if (!existing.entryVisibility.includes(visPath)) {
        existing.entryVisibility.push(visPath);
      }
    }

    if (resolved.dependencies && resolved.dependencies.length > 0) {
      existing.rawDependencies = existing.rawDependencies || [];
      const existingDeps = new Set(
        existing.rawDependencies.map(
          (dep) => `${dep.name}::${dep.importPath || ""}`,
        ),
      );
      for (const rawDep of resolved.dependencies) {
        const depKey = `${rawDep.name}::${rawDep.importPath || ""}`;
        if (!existingDeps.has(depKey)) {
          existingDeps.add(depKey);
          existing.rawDependencies.push(rawDep);
        }
      }
    }

    if (resolved.deprecated && !existing.deprecated)
      existing.deprecated = resolved.deprecated;
    if (resolved.visibility && !existing.visibility)
      existing.visibility = resolved.visibility;
    if (resolved.since && !existing.since) existing.since = resolved.since;
    if (resolved.modifiers && !existing.modifiers)
      existing.modifiers = resolved.modifiers;
    if (resolved.isGlobalAugmentation) existing.isGlobalAugmentation = true;
    if (
      resolved.enclosingModuleDeclarationName &&
      !existing.enclosingModuleDeclarationName
    ) {
      existing.enclosingModuleDeclarationName =
        resolved.enclosingModuleDeclarationName;
    }
  }

  for (const resolved of allSymbols) {
    const symbolFilePath =
      absToRel.get(resolved.definedIn) ??
      makePackageRelativePath(resolved.definedIn, packageInfo.dir);
    const isEntryFile = entryFiles.has(symbolFilePath);
    const isExt = crawlResult.fileIsExternalModule[resolved.definedIn] ?? true;
    const normSig = normalizeSignature(resolved.signature);

    let mergeKey: string;
    if (isInterfaceOrTypeAliasMergeScoped(resolved.kind)) {
      const scopeKey =
        mergeScopeByRel.get(symbolFilePath) ?? `m:${symbolFilePath}`;
      mergeKey = `${scopeKey}::${resolved.name}::${resolved.kind}`;
    } else if (isNamespaceOrEnumCrossFileMergeable(resolved.kind)) {
      const scopeKey =
        mergeScopeByRel.get(symbolFilePath) ?? `m:${symbolFilePath}`;
      mergeKey = `${scopeKey}::${resolved.name}::${resolved.kind}`;
    } else if (isOverloadMergeable(resolved.kind)) {
      mergeKey = `${resolved.name}::${resolved.kind}::${normSig}`;
    } else {
      mergeKey = `${resolved.name}::${resolved.kind}::${symbolFilePath}::${normSig}`;
    }

    const canIdenticalFoldAcrossModules =
      isExt &&
      (isInterfaceOrTypeAliasMergeScoped(resolved.kind) ||
        isNamespaceOrEnumCrossFileMergeable(resolved.kind));
    if (canIdenticalFoldAcrossModules) {
      const foldKey = `${resolved.name}::${resolved.kind}::${normSig}`;
      const canonKey = moduleIdenticalFold.get(foldKey);
      if (canonKey !== undefined) {
        const foldExisting = merged.get(canonKey);
        if (
          foldExisting !== undefined &&
          foldExisting.filePath !== symbolFilePath
        ) {
          mergeContribution(
            canonKey,
            foldExisting,
            resolved,
            symbolFilePath,
            isEntryFile,
            CONTRIBUTION_MERGE_PATH.identicalFold,
          );
          continue;
        }
      }
    }

    const existing = merged.get(mergeKey);
    if (existing) {
      mergeContribution(
        mergeKey,
        existing,
        resolved,
        symbolFilePath,
        isEntryFile,
        CONTRIBUTION_MERGE_PATH.mergeScope,
      );
    } else {
      const reExportSource = resolved.reExportChain?.[0]
        ? makePackageRelativePath(resolved.reExportChain[0], packageInfo.dir)
        : undefined;
      const visContrib = entryVisibilityContributions(resolved, symbolFilePath);

      const normalizedSignatureForNewRow = normalizeSignature(
        resolved.signature,
      );
      const initialNormalizedSignatures = new Set<string>();
      if (normalizedSignatureForNewRow) {
        initialNormalizedSignatures.add(normalizedSignatureForNewRow);
      }
      signatureNormsByMergeRow.set(mergeKey, initialNormalizedSignatures);

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
        enclosingModuleDeclarationName: resolved.enclosingModuleDeclarationName,
        reExportedFrom:
          reExportSource !== symbolFilePath ? reExportSource : undefined,
        deprecated: resolved.deprecated,
        visibility: resolved.visibility,
        since: resolved.since,
        heritage: resolved.heritage,
        modifiers: resolved.modifiers,
        entryVisibility: visContrib.length > 0 ? visContrib : undefined,
      });
      if (canIdenticalFoldAcrossModules) {
        const foldKey = `${resolved.name}::${resolved.kind}::${normSig}`;
        moduleIdenticalFold.set(foldKey, mergeKey);
      }
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
  /** `filePath::.<memberTail>` → ids (e.g. `ns.Member` maps under `.<memberTail>`). */
  const fileLocalMemberTailToIds = new Map<string, string[]>();
  const nameCount = new Map<string, number>();
  const internalFileNameCount = new Map<string, number>();

  for (const symbolNode of symbols) {
    const baseId = `${packageInfo.name}@${packageInfo.version}::${symbolNode.name}`;

    if (symbolNode.isInternal) {
      const internalFileNameKey = `${symbolNode.filePath}::${symbolNode.name}`;
      const internalOccurrenceCount =
        (internalFileNameCount.get(internalFileNameKey) ?? 0) + 1;
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
    const tailSeparator = symbolNode.name.lastIndexOf(".");
    if (tailSeparator > 0 && tailSeparator < symbolNode.name.length - 1) {
      const memberTail = symbolNode.name.slice(tailSeparator + 1);
      const memberTailKey = `${symbolNode.filePath}::.${memberTail}`;
      const existingMemberTail =
        fileLocalMemberTailToIds.get(memberTailKey) || [];
      existingMemberTail.push(symbolNode.id);
      fileLocalMemberTailToIds.set(memberTailKey, existingMemberTail);
    }

    const existingByName = nameToIds.get(symbolNode.name) || [];
    existingByName.push(symbolNode.id);
    nameToIds.set(symbolNode.name, existingByName);
  }

  // Same-name value + type (e.g. zod schemas): inheritance flattening must follow the interface/class.
  // Package-level `name → id`: prefer Interface/TypeAlias, then Class, then Namespace, then backfill.
  nameToId.clear();
  for (const symbolNode of symbols) {
    if (
      symbolNode.kind === ts.SyntaxKind.InterfaceDeclaration ||
      symbolNode.kind === ts.SyntaxKind.TypeAliasDeclaration
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (const symbolNode of symbols) {
    if (
      symbolNode.kind === ts.SyntaxKind.ClassDeclaration &&
      !nameToId.has(symbolNode.name)
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (const symbolNode of symbols) {
    if (
      symbolNode.kind === ts.SyntaxKind.ModuleDeclaration &&
      !nameToId.has(symbolNode.name)
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (const symbolNode of symbols) {
    if (!nameToId.has(symbolNode.name)) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }

  const idToFilePath = new Map<string, string>();
  for (const symbolNode of symbols) {
    idToFilePath.set(symbolNode.id, symbolNode.filePath);
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
      cached = storedFilePathToCrawlAbs(relFilePath);
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
  const dependencyStubRootsRef = mergedCrawlOptions.dependencyStubRoots;
  const stubSelfExemptForResolve = stubSelfExemptRoot;
  const moduleSpecifierCache = new Map<string, string[]>();
  const absPathCache = new Map<string, string>();
  const importsByNameCache = new Map<
    string,
    Map<string, { source: string; originalName?: string }>
  >();

  function getCachedAbsPath(relFilePath: string): string {
    let cached = absPathCache.get(relFilePath);
    if (cached === undefined) {
      cached = storedFilePathToCrawlAbs(relFilePath);
      absPathCache.set(relFilePath, cached);
    }
    return cached;
  }

  function getCachedModuleSpecifier(
    specifier: string,
    fromRelFile: string,
  ): string[] {
    const cacheKey = `${fromRelFile}\0${specifier}`;
    let cached = moduleSpecifierCache.get(cacheKey);
    if (cached === undefined) {
      cached = resolveModuleSpecifier(
        specifier,
        storedFilePathToCrawlAbs(fromRelFile),
      );
      moduleSpecifierCache.set(cacheKey, cached);
    }
    return cached;
  }

  function getImportsByName(
    absFilePath: string,
  ): Map<string, { source: string; originalName?: string }> {
    let cached = importsByNameCache.get(absFilePath);
    if (cached === undefined) {
      cached = new Map();
      const fileImports = allImportsPerFile[absFilePath] || [];
      for (const imp of fileImports) {
        if (!cached.has(imp.name)) {
          cached.set(imp.name, {
            source: imp.source,
            originalName: imp.originalName,
          });
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
    const protocol = isBuiltin ? "node" : match ? match[1] : "unknown";
    const source = isBuiltin
      ? importPath
      : match && match[2]
        ? match[2].startsWith("//")
          ? match[2].slice(2)
          : match[2]
        : "unknown";
    return `${protocol}::${source}::${depName}`;
  }

  /** `Foo.Bar.Baz` with `import * as Foo` → qualifier `Foo`, member path `Bar.Baz`. */
  function splitImportNamespaceMember(
    qualifiedName: string,
  ): { qualifier: string; memberPath: string } | null {
    const dot = qualifiedName.indexOf(".");
    if (dot <= 0 || dot === qualifiedName.length - 1) return null;
    return {
      qualifier: qualifiedName.slice(0, dot),
      memberPath: qualifiedName.slice(dot + 1),
    };
  }

  /**
   * Edge id for a dependency that is not indexed in this package graph: `npm::specifier::memberPath`.
   * Relative specifiers return null (caller resolves via visited files / imports only).
   */
  function resolveExternalModuleStubId(
    specifier: string,
    memberName: string,
  ): string | null {
    const proto = resolveProtocol(specifier, memberName);
    if (proto) return proto;
    if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
    if (/^[a-zA-Z]:[\\/]/.test(specifier)) return null;
    return `npm::${specifier}::${memberName}`;
  }

  function isExternalDependencyStub(symbolId: string): boolean {
    return symbolId.startsWith("npm::") || symbolId.startsWith("node::");
  }

  for (const symbolNode of symbols) {
    if (symbolNode.rawDependencies && symbolNode.rawDependencies.length > 0) {
      const resolvedIds = new Set<string>();
      const symAbsPath = getCachedAbsPath(symbolNode.filePath);
      const importPathIdDedup = new Set<string>();
      const importPathTargetScratch: string[] = [];

      for (const rawDep of symbolNode.rawDependencies) {
        const namespaceQual = !rawDep.importPath
          ? splitImportNamespaceMember(rawDep.name)
          : null;
        let targetIds: string[] = [];
        const namespaceFallbackRoots: string[] = [];

        if (dependencyStubRootsRef && dependencyStubRootsRef.size > 0) {
          if (rawDep.importPath) {
            if (
              specifierMatchesDependencyStubRoots(
                rawDep.importPath,
                dependencyStubRootsRef,
                stubSelfExemptForResolve,
              )
            ) {
              const stubOnly = resolveExternalModuleStubId(
                rawDep.importPath,
                rawDep.name,
              );
              if (stubOnly) {
                resolvedIds.add(stubOnly);
                continue;
              }
            }
          } else {
            const importMapForStub = getImportsByName(symAbsPath);
            const stubMatchingImport = importMapForStub.get(rawDep.name);
            if (stubMatchingImport) {
              if (
                specifierMatchesDependencyStubRoots(
                  stubMatchingImport.source,
                  dependencyStubRootsRef,
                  stubSelfExemptForResolve,
                )
              ) {
                const originalStubName =
                  stubMatchingImport.originalName || rawDep.name;
                const stubOnly = resolveExternalModuleStubId(
                  stubMatchingImport.source,
                  originalStubName,
                );
                if (stubOnly) {
                  resolvedIds.add(stubOnly);
                  continue;
                }
              }
            }
            if (namespaceQual) {
              const stubNsImport = importMapForStub.get(
                namespaceQual.qualifier,
              );
              if (
                stubNsImport &&
                specifierMatchesDependencyStubRoots(
                  stubNsImport.source,
                  dependencyStubRootsRef,
                  stubSelfExemptForResolve,
                )
              ) {
                const stubOnly = resolveExternalModuleStubId(
                  stubNsImport.source,
                  namespaceQual.memberPath,
                );
                if (stubOnly) {
                  resolvedIds.add(stubOnly);
                  continue;
                }
              }
            }
          }
        }

        // import()-style deps: try every resolved path for the specifier, then
        // fall back to package-wide name→id lookup when the entry module has no
        // local row (typical barrel re-export to a definition file).
        if (rawDep.importPath) {
          const absPaths = getCachedModuleSpecifier(
            rawDep.importPath,
            symbolNode.filePath,
          );
          importPathIdDedup.clear();
          for (const absPath of absPaths) {
            const relPath = makePackageRelativePath(absPath, packageInfo.dir);
            const exactIds =
              fileLocalToIds.get(`${relPath}::${rawDep.name}`) || [];
            const memberTailIds =
              fileLocalMemberTailToIds.get(`${relPath}::.${rawDep.name}`) || [];
            for (const symbolId of [...exactIds, ...memberTailIds]) {
              importPathIdDedup.add(symbolId);
            }
          }
          if (importPathIdDedup.size > 0) {
            importPathTargetScratch.length = 0;
            for (const symbolId of importPathIdDedup) {
              importPathTargetScratch.push(symbolId);
            }
            targetIds = importPathTargetScratch;
          } else {
            targetIds = nameToIds.get(rawDep.name) || [];
          }
        } else {
          let namespaceTargetFilesResolved = false;
          targetIds =
            fileLocalToIds.get(`${symbolNode.filePath}::${rawDep.name}`) || [];

          if (targetIds.length === 0) {
            const importMap = getImportsByName(symAbsPath);
            const matchingImport = importMap.get(rawDep.name);

            if (matchingImport) {
              const absSourcePaths = getCachedModuleSpecifier(
                matchingImport.source,
                symbolNode.filePath,
              );
              if (absSourcePaths.length > 0) {
                const relSourcePath = makePackageRelativePath(
                  absSourcePaths[0]!,
                  packageInfo.dir,
                );
                const originalName = matchingImport.originalName || rawDep.name;
                targetIds =
                  fileLocalToIds.get(`${relSourcePath}::${originalName}`) ||
                  fileLocalMemberTailToIds.get(
                    `${relSourcePath}::.${originalName}`,
                  ) ||
                  [];
              }
            }
          }
          if (targetIds.length === 0 && namespaceQual) {
            const importMap = getImportsByName(symAbsPath);
            const nsImport = importMap.get(namespaceQual.qualifier);
            if (nsImport) {
              const absSourcePaths = getCachedModuleSpecifier(
                nsImport.source,
                symbolNode.filePath,
              );
              namespaceTargetFilesResolved = absSourcePaths.length > 0;
              for (const resolvedAbsPath of absSourcePaths) {
                const relativeForRoot = makePackageRelativePath(
                  resolvedAbsPath,
                  packageInfo.dir,
                );
                namespaceFallbackRoots.push(
                  path.posix.dirname(relativeForRoot),
                );
              }
              for (const resolvedAbsPath of absSourcePaths) {
                const relSourcePath = makePackageRelativePath(
                  resolvedAbsPath,
                  packageInfo.dir,
                );
                for (const symbolId of fileLocalToIds.get(
                  `${relSourcePath}::${namespaceQual.memberPath}`,
                ) || []) {
                  targetIds.push(symbolId);
                }
              }
            }
          }
          if (targetIds.length === 0 && hasRefEdges) {
            const closure = getCachedClosure(symbolNode.filePath);
            const fromClosure = new Set<string>();
            for (const reachableFileAbs of closure) {
              const rel = makePackageRelativePath(
                reachableFileAbs,
                packageInfo.dir,
              );
              if (rel === symbolNode.filePath) continue;
              for (const symbolId of fileLocalToIds.get(
                `${rel}::${rawDep.name}`,
              ) || []) {
                fromClosure.add(symbolId);
              }
              if (namespaceQual) {
                for (const symbolId of fileLocalToIds.get(
                  `${rel}::${namespaceQual.memberPath}`,
                ) || []) {
                  fromClosure.add(symbolId);
                }
              }
            }
            targetIds = [...fromClosure];
          }
          if (targetIds.length === 0) {
            targetIds = nameToIds.get(rawDep.name) || [];
          }
          if (
            targetIds.length === 0 &&
            namespaceQual &&
            namespaceTargetFilesResolved
          ) {
            let candidates = nameToIds.get(namespaceQual.memberPath) || [];
            const skipNamespaceRootFilter =
              namespaceFallbackRoots.length === 0 ||
              namespaceFallbackRoots.some(
                (namespaceRootDir) =>
                  namespaceRootDir === "." || namespaceRootDir === "",
              );
            if (!skipNamespaceRootFilter) {
              const distinctNamespaceRoots = [
                ...new Set(namespaceFallbackRoots),
              ];
              candidates = candidates.filter((candidateId) => {
                const definingFilePath = idToFilePath.get(candidateId);
                if (!definingFilePath) return false;
                return distinctNamespaceRoots.some(
                  (namespaceRootDir) =>
                    definingFilePath === namespaceRootDir ||
                    definingFilePath.startsWith(`${namespaceRootDir}/`),
                );
              });
            }
            targetIds = candidates;
          }
        }
        if (targetIds.length > 0) {
          targetIds = targetIds.filter(
            (symbolId) =>
              isExternalDependencyStub(symbolId) ||
              kindMatchesResolutionHint(
                idToKind.get(symbolId) ?? ts.SyntaxKind.Unknown,
                rawDep.resolutionHint,
              ),
          );
        }

        if (targetIds.length > 0) {
          targetIds = targetIds.filter(
            (symbolId) => symbolId !== symbolNode.id,
          );
        }

        if (targetIds.length > 0) {
          for (const symbolId of targetIds) {
            resolvedIds.add(symbolId);
          }
        } else {
          if (rawDep.importPath) {
            const resolved = resolveProtocol(rawDep.importPath, rawDep.name);
            if (resolved) resolvedIds.add(resolved);
            else {
              const stub = resolveExternalModuleStubId(
                rawDep.importPath,
                rawDep.name,
              );
              if (stub) resolvedIds.add(stub);
            }
          } else {
            const importMap = getImportsByName(symAbsPath);
            const matchingImport = importMap.get(rawDep.name);
            if (matchingImport) {
              const resolved = resolveProtocol(
                matchingImport.source,
                matchingImport.originalName || rawDep.name,
              );
              if (resolved) resolvedIds.add(resolved);
              else {
                const stub = resolveExternalModuleStubId(
                  matchingImport.source,
                  matchingImport.originalName || rawDep.name,
                );
                if (stub) resolvedIds.add(stub);
              }
            }
            if (namespaceQual) {
              const nsImport = importMap.get(namespaceQual.qualifier);
              if (nsImport) {
                const stub = resolveExternalModuleStubId(
                  nsImport.source,
                  namespaceQual.memberPath,
                );
                if (stub) resolvedIds.add(stub);
              }
            }
          }
        }
      }
      symbolNode.dependencies = Array.from(resolvedIds).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
    }
    delete symbolNode.rawDependencies;
  }

  if (profiling) {
    profileLog("resolveDeps", performance.now() - phaseStart);
    phaseStart = performance.now();
  }

  const preFlattenLen = symbols.length;
  flattenInheritedMembers(
    symbols,
    nameToId,
    packageInfo.name,
    packageInfo.version,
  );

  if (profiling) {
    profileLog("flattenInherited", performance.now() - phaseStart);
  }

  for (let i = preFlattenLen; i < symbols.length; i++) {
    const symbolNode = symbols[i]!;
    idToKind.set(symbolNode.id, symbolNode.kind);
    const shortKey = `${symbolNode.filePath}::${symbolNode.name}`;
    const existingShort = fileLocalToIds.get(shortKey) || [];
    existingShort.push(symbolNode.id);
    fileLocalToIds.set(shortKey, existingShort);
  }
  for (let i = preFlattenLen; i < symbols.length; i++) {
    const symbolNode = symbols[i]!;
    if (
      symbolNode.kind === ts.SyntaxKind.InterfaceDeclaration ||
      symbolNode.kind === ts.SyntaxKind.TypeAliasDeclaration
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (let i = preFlattenLen; i < symbols.length; i++) {
    const symbolNode = symbols[i]!;
    if (
      symbolNode.kind === ts.SyntaxKind.ClassDeclaration &&
      !nameToId.has(symbolNode.name)
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (let i = preFlattenLen; i < symbols.length; i++) {
    const symbolNode = symbols[i]!;
    if (
      symbolNode.kind === ts.SyntaxKind.ModuleDeclaration &&
      !nameToId.has(symbolNode.name)
    ) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (let i = preFlattenLen; i < symbols.length; i++) {
    const symbolNode = symbols[i]!;
    if (!nameToId.has(symbolNode.name)) {
      nameToId.set(symbolNode.name, symbolNode.id);
    }
  }
  for (const ids of fileLocalToIds.values()) {
    ids.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }
  assignParentSymbolIds(symbols, fileLocalToIds, nameToId, idToKind);
  assignEnclosingModuleDeclarationIds(symbols, fileLocalToIds, idToKind);

  const afterFlatten = performance.now();
  clearParserCache();

  if (profiling) {
    profileLog("clearParserCache", performance.now() - afterFlatten);
    profileLog("buildPackageGraph total", performance.now() - startTime);
  }

  const graphAssemblyMs = performance.now() - graphAssemblyStart;
  const buildDurationMs = entryResolutionMs + graphAssemblyMs;

  const result: PackageGraph = {
    package: packageInfo.name,
    version: packageInfo.version,
    symbols,
    totalSymbols: symbols.length,
    totalFiles: visited.size,
    crawlDurationMs,
    buildDurationMs,
  };

  return result;
}

/** Map full heritage clause text to a declared parent name (e.g. `Omit<Foo, 'k'>` → `Omit`). */
function heritageLookupKey(heritage: string): string {
  const trimmed = heritage.trim();
  const angle = trimmed.indexOf("<");
  return angle === -1 ? trimmed : trimmed.slice(0, angle).trim();
}

/** Flatten inherited members. */
function flattenInheritedMembers(
  symbols: SymbolNode[],
  nameToId: Map<string, string>,
  pkgName: string,
  pkgVersion: string,
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

  const mergedHeritage = new Map<string, string[]>();
  for (const symbolNode of symbols) {
    if (
      (symbolNode.kind === ts.SyntaxKind.ClassDeclaration ||
        symbolNode.kind === ts.SyntaxKind.InterfaceDeclaration) &&
      symbolNode.heritage &&
      symbolNode.heritage.length > 0
    ) {
      let entry = mergedHeritage.get(symbolNode.name);
      if (!entry) {
        entry = [];
        mergedHeritage.set(symbolNode.name, entry);
      }
      for (const parent of symbolNode.heritage) {
        if (!entry.includes(parent)) {
          entry.push(parent);
        }
      }
    }
  }

  const syntheticSymbols: SymbolNode[] = [];

  for (const [nodeName, heritage] of mergedHeritage) {
    const childMembers = membersByParentName.get(nodeName) || [];
    const directChildShortNames = new Set(
      childMembers.map((member) => member.name.split(".").pop()!),
    );
    const inheritedByLeaf = new Map<string, SymbolNode>();

    const visitedParents = new Set<string>();
    const parentsToVisit = heritage.map(heritageLookupKey);

    while (parentsToVisit.length > 0) {
      const parentKey = parentsToVisit.shift()!;
      if (visitedParents.has(parentKey)) continue;
      visitedParents.add(parentKey);

      const parentId = nameToId.get(parentKey);
      if (!parentId) continue;

      const parentNode = idToNode.get(parentId);
      if (parentNode && parentNode.heritage) {
        for (const grandparent of parentNode.heritage) {
          parentsToVisit.push(heritageLookupKey(grandparent));
        }
      }

      const parentMembers = membersByParentName.get(parentKey) || [];
      for (const parentMember of parentMembers) {
        const shortName = parentMember.name.split(".").pop()!;

        if (directChildShortNames.has(shortName)) continue;

        if (parentMember.visibility === "internal") continue;

        const isPrototype = parentMember.name.includes(".prototype.");
        const newMemberName = isPrototype
          ? `${nodeName}.prototype.${shortName}`
          : `${nodeName}.${shortName}`;

        const synthId = `${pkgName}@${pkgVersion}::${newMemberName}`;
        const leafKey = `${nodeName}::${shortName}`;

        const existingSynth = inheritedByLeaf.get(leafKey);
        if (!existingSynth) {
          inheritedByLeaf.set(leafKey, {
            ...parentMember,
            id: synthId,
            name: newMemberName,
            isInherited: true,
            inheritedFromSources: [parentMember.id],
            additionalFiles: undefined,
          });
        } else {
          const sources = existingSynth.inheritedFromSources!;
          if (!sources.includes(parentMember.id)) {
            sources.push(parentMember.id);
          }
        }
      }
    }

    for (const sym of inheritedByLeaf.values()) {
      sym.inheritedFromSources!.sort();
      syntheticSymbols.push(sym);
    }
  }

  for (const synth of syntheticSymbols) {
    symbols.push(synth);
  }
}

/** All declaration files reachable from `startAbs` by following only `/// <reference path` edges. */
function tripleSlashReferenceClosure(
  startAbs: string,
  edges: Record<string, string[]>,
): string[] {
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

function kindMatchesResolutionHint(
  kind: ts.SyntaxKind,
  hint: "type" | "value" | undefined,
): boolean {
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
