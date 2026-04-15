import { describe, it, expect } from "vitest";
import path from "node:path";
import ts from "typescript";
import { buildPackageGraph } from "./graph.js";
import type { PackageInfo } from "./types.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

function makePackageInfo(
  fixtureName: string,
  name?: string,
  version?: string
): PackageInfo {
  return {
    name: name ?? fixtureName,
    version: version ?? "1.0.0",
    dir: path.join(FIXTURES_DIR, fixtureName),
    isScoped: (name ?? fixtureName).startsWith("@"),
  };
}

describe("buildPackageGraph", () => {
  it("builds a graph for a simple package with direct exports", () => {
    const graph = buildPackageGraph(
      makePackageInfo("simple-export")
    );

    expect(graph.package).toBe("simple-export");
    expect(graph.version).toBe("1.0.0");
    expect(graph.totalSymbols).toBeGreaterThan(0);
    expect(graph.totalFiles).toBe(1);
    expect(graph.crawlDurationMs).toBeGreaterThanOrEqual(0);
    expect(graph.buildDurationMs).toBeGreaterThanOrEqual(0);

    const ids = graph.symbols.map((symbol) => symbol.id);
    expect(ids).toContain("simple-export@1.0.0::Config");
    expect(ids).toContain("simple-export@1.0.0::init");
  });

  it("includes correct kind from ts.SyntaxKind", () => {
    const graph = buildPackageGraph(
      makePackageInfo("simple-export")
    );

    const configSymbol = graph.symbols.find((symbol) => symbol.name === "Config");
    expect(configSymbol).toBeDefined();
    expect(configSymbol!.kind).toBe(ts.SyntaxKind.InterfaceDeclaration);
    expect(configSymbol!.kindName).toBe("InterfaceDeclaration");
  });

  it("builds a graph with re-exported symbols resolved to their source", () => {
    const graph = buildPackageGraph(
      makePackageInfo("re-export-chain")
    );

    const server = graph.symbols.find((symbol) => symbol.name === "Server");
    expect(server).toBeDefined();
    expect(server!.filePath).toBe("lib/core.d.ts");
    expect(server!.reExportedFrom).toBe("index.d.ts");

    expect(graph.totalFiles).toBe(2);
  });

  it("sets reExportedFrom to undefined if it matches filePath (local re-export)", () => {
    const graph = buildPackageGraph(
      makePackageInfo("local-reexport")
    );

    const external = graph.symbols.find((symbol) => symbol.name === "External");
    expect(external).toBeDefined();
    expect(external!.filePath).toBe("index.d.ts");
    expect(external!.reExportedFrom).toBeUndefined();
  });

  it("merges visibility tags when merging nodes", () => {
    const graph = buildPackageGraph(
      makePackageInfo("visibility-merge")
    );

    const merged = graph.symbols.find((symbol) => symbol.name === "Merged");
    expect(merged).toBeDefined();
    expect(merged!.visibility).toBe("public");
  });

  it("includes symbols from wildcard re-exports in the graph", () => {
    const graph = buildPackageGraph(
      makePackageInfo("wildcard-reexport")
    );

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("LIB_VERSION");
    expect(names).toContain("Config");
    expect(names).toContain("Callback");
  });

  it("resolves symbols through deep re-export chains", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deep-chain")
    );

    const handler = graph.symbols.find((symbol) => symbol.name === "Handler");
    expect(handler).toBeDefined();
    expect(handler!.filePath).toContain("handler.d.ts");
    expect(graph.totalFiles).toBe(3);
  });

  it("returns empty graph for a package with no types", () => {
    const graph = buildPackageGraph({
      name: "no-types-pkg",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "no-types-pkg"),
      isScoped: false,
    });

    expect(graph.totalSymbols).toBe(0);
    expect(graph.symbols).toHaveLength(0);
  });

  it("produces SymbolNodes with all required fields", () => {
    const graph = buildPackageGraph(
      makePackageInfo("simple-export")
    );

    const symbol = graph.symbols[0];
    expect(symbol).toBeDefined();
    expect(symbol!.id).toBeTruthy();
    expect(symbol!.name).toBeTruthy();
    expect(typeof symbol!.kind).toBe("number");
    expect(symbol!.kindName).toBeTruthy();
    expect(symbol!.package).toBe("simple-export");
    expect(symbol!.filePath).toBeTruthy();
    expect(typeof symbol!.isTypeOnly).toBe("boolean");
    expect(Array.isArray(symbol!.dependencies)).toBe(true);
  });

  it("resolves import * as namespace qualified types (local, peer path, npm stub)", () => {
    const graph = buildPackageGraph(makePackageInfo("qualified-namespace-deps"));
    const localNs = graph.symbols.find((symbol) => symbol.name === "localNs");
    const peerNs = graph.symbols.find((symbol) => symbol.name === "peerNs");
    const unresolvedExt = graph.symbols.find((symbol) => symbol.name === "unresolvedExt");
    expect(localNs?.dependencies).toEqual(
      expect.arrayContaining([
        "qualified-namespace-deps@1.0.0::shim.d.ts::InvokeOutputOptions",
        "qualified-namespace-deps@1.0.0::shim.d.ts::Output",
        "qualified-namespace-deps@1.0.0::LocalResult",
      ])
    );
    expect(peerNs?.dependencies).toEqual(
      expect.arrayContaining([
        "qualified-namespace-deps@1.0.0::node_modules/@peer/core/peerCore.d.ts::PeerOpts",
        "qualified-namespace-deps@1.0.0::node_modules/@peer/core/peerCore.d.ts::PeerOut",
      ])
    );
    const peerBarrelType = graph.symbols.find((symbol) => symbol.name === "peerBarrelType");
    expect(peerBarrelType?.dependencies).toEqual(
      expect.arrayContaining([
        "qualified-namespace-deps@1.0.0::node_modules/@peer/core/peerCore.d.ts::Box",
      ])
    );
    expect(unresolvedExt?.dependencies).toContain("npm::@external/types::InvokeOutputOptions");
  });

  it("dependencyStubRoots short-circuits listed packages to npm:: stubs", () => {
    const info = makePackageInfo("dependency-stub-packages", "stub-root-pkg", "1.0.0");
    const plain = buildPackageGraph(info);
    const stubbed = buildPackageGraph(info, {
      dependencyStubRoots: new Set(["@stub-listed/core"]),
    });
    const combinedPlain = plain.symbols.find((symbol) => symbol.name === "combined");
    const combinedStubbed = stubbed.symbols.find((symbol) => symbol.name === "combined");
    expect(combinedPlain).toBeDefined();
    expect(combinedStubbed).toBeDefined();
    expect(
      combinedPlain!.dependencies.every((dependencyId) => !dependencyId.startsWith("npm::@stub-listed"))
    ).toBe(true);
    expect(combinedStubbed!.dependencies).toContain("npm::@stub-listed/core::ListedType");
    expect(
      combinedStubbed!.dependencies.some((dependencyId) => dependencyId.includes("other-dep"))
    ).toBe(true);
    expect(
      stubbed.symbols.some((symbolNode) => symbolNode.filePath.includes("other-dep"))
    ).toBe(true);
    for (const symbolNode of stubbed.symbols) {
      expect(symbolNode.filePath).not.toContain("@stub-listed");
    }
  });

  it("dependency stub self-exempt still crawls the package’s own bare specifier", () => {
    const graph = buildPackageGraph(
      makePackageInfo("dependency-stub-self-exempt-unscoped", "self-stub-pkg"),
      { dependencyStubRoots: new Set(["self-stub-pkg"]) }
    );
    const inner = graph.symbols.find((symbol) => symbol.name === "Inner");
    expect(inner).toBeDefined();
    expect(inner!.filePath).toContain("inner");
    expect(graph.totalFiles).toBeGreaterThanOrEqual(2);
  });

  it("dependency stub self-exempt applies to scoped package bare subpath imports", () => {
    const graph = buildPackageGraph(
      makePackageInfo("dependency-stub-self-exempt-scoped", "@acme/self-stub"),
      { dependencyStubRoots: new Set(["@acme/self-stub"]) }
    );
    const inner = graph.symbols.find((symbol) => symbol.name === "Inner");
    expect(inner).toBeDefined();
    expect(inner!.filePath).toContain("inner");
    expect(graph.totalFiles).toBeGreaterThanOrEqual(2);
  });

  it("populates dependencies with resolved symbol IDs", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deps-pkg")
    );

    const logger = graph.symbols.find((symbol) => symbol.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies.length).toBeGreaterThan(0);

    expect(logger!.dependencies).toContain("deps-pkg@1.0.0::Config");
    expect(logger!.dependencies).toContain("deps-pkg@1.0.0::LogLevel");

    const createLogger = graph.symbols.find((symbol) => symbol.name === "createLogger");
    expect(createLogger).toBeDefined();
    expect(createLogger!.dependencies).toContain("deps-pkg@1.0.0::Config");
    expect(createLogger!.dependencies).toContain("deps-pkg@1.0.0::Logger");

    const config = graph.symbols.find((symbol) => symbol.name === "Config");
    expect(config).toBeDefined();
    expect(config!.dependencies).toHaveLength(0);
  });

  it("tags declaration-site symbolSpace for imported types vs values (internal-overload-ref)", () => {
    const graph = buildPackageGraph(
      makePackageInfo("internal-overload-ref")
    );

    const iface = graph.symbols.find((symbol) => symbol.name === "ImportedShape");
    expect(iface).toBeDefined();
    expect(iface!.symbolSpace).toBe("type");

    const member = graph.symbols.find((symbol) => symbol.name === "ImportedShape.value");
    expect(member).toBeDefined();
    expect(member!.symbolSpace).toBe("type");

    const token = graph.symbols.find((symbol) => symbol.name === "IMPORTED_TOKEN");
    expect(token).toBeDefined();
    expect(token!.symbolSpace).toBe("value");
  });

  it("resolves qualified overload types across files linked by triple-slash reference paths", () => {
    const graph = buildPackageGraph(
      makePackageInfo("internal-overload-ref")
    );

    const usesPick = graph.symbols.find((symbol) => symbol.name === "usesPick");
    expect(usesPick).toBeDefined();

    const deps = usesPick!.dependencies.filter((dep) =>
      dep.includes("::ref.d.ts::RefLib.Dual.pick")
    );
    expect(deps.length).toBe(2);
  });

  it("keeps overload members from module-style ref files internal when not imported as a module", () => {
    const graph = buildPackageGraph(
      makePackageInfo("internal-overload-ref")
    );

    const overloads = graph.symbols.filter(
      (symbol) =>
        symbol.name === "RefLib.Dual.pick" &&
        symbol.kindName === "MethodSignature" &&
        symbol.isInternal === true
    );

    expect(overloads.length).toBe(2);
    for (const overload of overloads) {
      expect(overload.filePath).toBe("ref.d.ts");
    }
  });

  it("lifts script-style triple-slash ambient values and resolves typeof to public IDs", () => {
    const graph = buildPackageGraph(
      makePackageInfo("internal-overload-ref")
    );

    const ambient = graph.symbols.find(
      (symbol) => symbol.name === "AMBIENT_PICK" && symbol.isInternal === false
    );
    expect(ambient).toBeDefined();
    expect(ambient!.filePath).toBe("ambient-ref.d.ts");
    expect(ambient!.entryVisibility).toEqual(
      expect.arrayContaining(["index.d.ts", "extra-entry.d.ts"])
    );

    const usesAmbient = graph.symbols.find((symbol) => symbol.name === "usesAmbientPick");
    expect(usesAmbient).toBeDefined();
    expect(usesAmbient!.dependencies).toContain(
      "internal-overload-ref@1.0.0::AMBIENT_PICK"
    );

    const fromExtra = graph.symbols.find(
      (symbol) => symbol.name === "usesAmbientPickFromExtra"
    );
    expect(fromExtra).toBeDefined();
    expect(fromExtra!.dependencies).toContain(
      "internal-overload-ref@1.0.0::AMBIENT_PICK"
    );
  });

  it("links typeof to values declared in triple-slash-referenced files before package-wide fallback", () => {
    const graph = buildPackageGraph(
      makePackageInfo("internal-overload-ref")
    );

    const pickType = graph.symbols.find((symbol) => symbol.name === "pickType");
    expect(pickType).toBeDefined();
    expect(pickType!.dependencies.some((dep) => dep.includes("::ref.d.ts::PICK_TYPE"))).toBe(
      true
    );
  });

  it("merges declare global from module-shaped ref files into entry scope with entryVisibility", () => {
    const graph = buildPackageGraph(makePackageInfo("internal-overload-ref"));

    const globalFromRef = graph.symbols.find(
      (symbol) => symbol.name === "GLOBAL_FROM_REF" && symbol.filePath === "ref.d.ts"
    );
    expect(globalFromRef).toBeDefined();
    expect(globalFromRef!.isGlobalAugmentation).toBe(true);
    expect(globalFromRef!.isInternal).toBe(false);
    expect(globalFromRef!.entryVisibility).toEqual(
      expect.arrayContaining(["index.d.ts", "extra-entry.d.ts"])
    );

    const uses = graph.symbols.find((symbol) => symbol.name === "usesGlobalFromRef");
    expect(uses).toBeDefined();
    expect(uses!.dependencies).toContain("internal-overload-ref@1.0.0::GLOBAL_FROM_REF");

    const usesExtra = graph.symbols.find(
      (symbol) => symbol.name === "usesGlobalFromRefExtra"
    );
    expect(usesExtra).toBeDefined();
    expect(usesExtra!.dependencies).toContain("internal-overload-ref@1.0.0::GLOBAL_FROM_REF");
  });

  it("resolves module-scoped declare global members through triple-slash references", () => {
    const graph = buildPackageGraph(
      makePackageInfo("module-global-augmentation-ref")
    );

    const globalPick = graph.symbols.find(
      (symbol) => symbol.name === "PICK_TYPE" && symbol.filePath === "global-types.d.ts"
    );
    expect(globalPick).toBeDefined();
    expect(globalPick!.isGlobalAugmentation).toBe(true);
    expect(globalPick!.isInternal).toBe(false);
    expect(globalPick!.entryVisibility).toEqual(
      expect.arrayContaining(["index.d.ts", "extra-entry.d.ts"])
    );

    const usesPick = graph.symbols.find((symbol) => symbol.name === "usesPick");
    expect(usesPick).toBeDefined();
    expect(usesPick!.dependencies).toContain(
      "module-global-augmentation-ref@1.0.0::PICK_TYPE"
    );

    const usesPickFromExtra = graph.symbols.find(
      (symbol) => symbol.name === "usesPickFromExtra"
    );
    expect(usesPickFromExtra).toBeDefined();
    expect(usesPickFromExtra!.dependencies).toContain(
      "module-global-augmentation-ref@1.0.0::PICK_TYPE"
    );
  });

  it("resolves typeof dependencies to value space without self type-alias cycles", () => {
    const graph = buildPackageGraph(
      makePackageInfo("type-value-dependency-split")
    );

    const typeAlias = graph.symbols.find(
      (symbol) =>
        symbol.name === "TypeId" &&
        symbol.kindName === "TypeAliasDeclaration"
    );
    expect(typeAlias).toBeDefined();
    expect(typeAlias!.dependencies).toContain(
      "type-value-dependency-split@1.0.0::TypeId"
    );
    expect(typeAlias!.dependencies).not.toContain(typeAlias!.id);
  });

  it("builds graph including symbols from triple-slash referenced files", () => {
    const graph = buildPackageGraph(
      makePackageInfo("triple-slash-refs")
    );

    const names = graph.symbols.map((symbol) => symbol.name);

    expect(names).toContain("APP_VERSION");
    expect(names).toContain("GlobalConfig");
    expect(names).toContain("setupGlobals");
    expect(names).toContain("formatDate");
    expect(names).toContain("DateFormat");

    expect(graph.totalFiles).toBe(3);
  });

  it("builds graph using typesVersions-resolved entry point", () => {
    const graph = buildPackageGraph(
      makePackageInfo("types-versions", "types-versions-pkg", "3.0.0")
    );

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("ModernConfig");
    expect(names).not.toContain("LegacyConfig");
  });

  it("merges symbols from all subpath exports without duplicates", () => {
    const graph = buildPackageGraph(
      makePackageInfo("subpath-exports")
    );

    expect(graph.totalSymbols).toBe(11);
    expect(graph.totalFiles).toBe(3);

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("AppConfig");
    expect(names).toContain("createApp");
    expect(names).toContain("formatDate");
    expect(names).toContain("parseQuery");
    expect(names).toContain("QueryParams");
    expect(names).toContain("createServer");
    expect(names).toContain("Server");

    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("passes deprecated flag through to SymbolNode", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deprecated-exports")
    );

    const oldInit = graph.symbols.find((symbol) => symbol.name === "oldInit");
    expect(oldInit).toBeDefined();
    expect(oldInit!.deprecated).toBe("Use newInit instead");

    const legacy = graph.symbols.find((symbol) => symbol.name === "LegacyConfig");
    expect(legacy).toBeDefined();
    expect(legacy!.deprecated).toBe(true);

    const newInit = graph.symbols.find((symbol) => symbol.name === "newInit");
    expect(newInit).toBeDefined();
    expect(newInit!.deprecated).toBeUndefined();
  });

  it("filters out non-exported types and generic params from dependencies", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deps-unresolved")
    );

    const service = graph.symbols.find((symbol) => symbol.name === "Service");
    expect(service).toBeDefined();
    expect(service!.dependencies).toContain("deps-unresolved@1.0.0::Config");
    expect(service!.dependencies).not.toContain("InternalHelper");
    expect(service!.dependencies).not.toContain("Base");

    const create = graph.symbols.find((symbol) => symbol.name === "create");
    expect(create).toBeDefined();
    expect(create!.dependencies).toContain("deps-unresolved@1.0.0::Service");
    expect(create!.dependencies).not.toContain("T");

    for (const symbolNode of graph.symbols) {
      for (const dependency of symbolNode.dependencies) {
        expect(dependency).toContain("::");
      }
    }
  });

  it("expands members of a namespace exported via export =", () => {
    const graph = buildPackageGraph(
      makePackageInfo("cjs-namespace")
    );

    const names = graph.symbols.map((symbol) => symbol.name);

    expect(names).toContain("ts");
    expect(names).toContain("ts.Node");
    expect(names).toContain("ts.createNode");
    expect(names).toContain("ts.server");
    expect(names).toContain("ts.server.Project");

    const tsNode = graph.symbols.find((symbol) => symbol.name === "ts.Node");
    expect(tsNode?.signature).toContain("interface Node");
  });

  it("resolves local re-exports to their definitions", () => {
    const graph = buildPackageGraph(
      makePackageInfo("local-reexport")
    );

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("External");
    expect(names).toContain("x");

    const external = graph.symbols.find((symbol) => symbol.name === "External");
    expect(external?.signature).toContain("interface Internal");
  });

  it("keeps same-name symbols from different files separate", () => {
    const graph = buildPackageGraph(
      makePackageInfo("name-collision")
    );

    const identities = graph.symbols.filter((symbol) => symbol.name === "identity");
    expect(identities.length).toBe(3);

    const ids = identities.map((symbol) => symbol.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    expect(ids).toContain("name-collision@1.0.0::identity");
    expect(ids).toContain("name-collision@1.0.0::identity#2");
    expect(ids).toContain("name-collision@1.0.0::identity#3");
    const fromIndex = identities.find((symbol) =>
      symbol.filePath.includes("index.d.ts")
    );
    expect(fromIndex).toBeDefined();
    expect(fromIndex!.dependencies).not.toContain("name-collision@1.0.0::StreamConfig");
    expect(fromIndex!.dependencies).not.toContain("name-collision@1.0.0::ChannelConfig");

    const fromStream = identities.find((symbol) =>
      symbol.filePath.includes("stream.d.ts")
    );
    expect(fromStream).toBeDefined();
    expect(fromStream!.dependencies).toContain("name-collision@1.0.0::StreamConfig");
    expect(fromStream!.dependencies).not.toContain("name-collision@1.0.0::ChannelConfig");

    const fromChannel = identities.find((symbol) =>
      symbol.filePath.includes("channel.d.ts")
    );
    expect(fromChannel).toBeDefined();
    expect(fromChannel!.dependencies).toContain("name-collision@1.0.0::ChannelConfig");
    expect(fromChannel!.dependencies).not.toContain("name-collision@1.0.0::StreamConfig");
  });

  it("resolves homonym parents: namespace vs function, and interface vs namespace in one file", () => {
    const graph = buildPackageGraph(makePackageInfo("name-collision"));
    const widthMember = graph.symbols.find((symbolNode) => symbolNode.name === "MergedBox.width");
    const makeMember = graph.symbols.find((symbolNode) => symbolNode.name === "MergedBox.make");
    const interfaceContainer = graph.symbols.find(
      (symbolNode) =>
        symbolNode.name === "MergedBox" && symbolNode.kindName === "InterfaceDeclaration"
    );
    const namespaceContainer = graph.symbols.find(
      (symbolNode) =>
        symbolNode.name === "MergedBox" && symbolNode.kindName === "ModuleDeclaration"
    );
    expect(widthMember?.parentSymbolId).toBe(interfaceContainer?.id);
    expect(makeMember?.parentSymbolId).toBe(namespaceContainer?.id);
  });

  it("applies triple-slash script scope merges while keeping module files separate", () => {
    const graphResult = buildPackageGraph(makePackageInfo("triple-slash-scope-cases"));

    const moduleReachRows = graphResult.symbols.filter(
      (symbolNode) => symbolNode.name === "ModuleReachPair" && symbolNode.kindName === "ModuleDeclaration"
    );
    expect(moduleReachRows).toHaveLength(1);
    expect(moduleReachRows[0]?.filePath).toBe("module-reach-core.d.ts");
    expect(moduleReachRows[0]?.additionalFiles).toEqual(expect.arrayContaining(["module-reach-extra.d.ts"]));

    const moduleReachCore = graphResult.symbols.find(
      (symbolNode) => symbolNode.name === "ModuleReachPair.core"
    );
    const moduleReachExtra = graphResult.symbols.find(
      (symbolNode) => symbolNode.name === "ModuleReachPair.extra"
    );
    expect(moduleReachCore?.parentSymbolId).toBe(moduleReachRows[0]?.id);
    expect(moduleReachExtra?.parentSymbolId).toBe(moduleReachRows[0]?.id);

    const modulePairRows = graphResult.symbols.filter(
      (symbolNode) => symbolNode.name === "ModulePair" && symbolNode.kindName === "ModuleDeclaration"
    );
    expect(modulePairRows).toHaveLength(2);
    expect(modulePairRows.some((symbolNode) => symbolNode.filePath === "module-a.d.ts")).toBe(true);
    expect(modulePairRows.some((symbolNode) => symbolNode.filePath === "module-b.d.ts")).toBe(true);

    const mixedScopeRows = graphResult.symbols.filter(
      (symbolNode) => symbolNode.name === "MixedScope" && symbolNode.kindName === "ModuleDeclaration"
    );
    expect(mixedScopeRows).toHaveLength(2);
    const mixedIds = mixedScopeRows.map((symbolNode) => symbolNode.id).sort();
    expect(mixedIds[0]).toBe("triple-slash-scope-cases@1.0.0::MixedScope");
    expect(mixedIds[1]).toBe("triple-slash-scope-cases@1.0.0::MixedScope#2");

    const scriptPairRows = graphResult.symbols.filter(
      (symbolNode) => symbolNode.name === "ScriptPair" && symbolNode.kindName === "ModuleDeclaration"
    );
    expect(scriptPairRows).toHaveLength(1);
    expect(scriptPairRows[0]?.additionalFiles).toEqual(expect.arrayContaining(["script-peer.d.ts"]));

    const scriptPairAlpha = graphResult.symbols.find((symbolNode) => symbolNode.name === "ScriptPair.alpha");
    const scriptPairBeta = graphResult.symbols.find((symbolNode) => symbolNode.name === "ScriptPair.beta");
    expect(scriptPairAlpha?.parentSymbolId).toBe(scriptPairRows[0]?.id);
    expect(scriptPairBeta?.parentSymbolId).toBe(scriptPairRows[0]?.id);
  });

  it("keeps module+script namespaces separate in namespace-merging fixture", () => {
    const graphResult = buildPackageGraph(makePackageInfo("namespace-merging"));

    const mergedEntries = graphResult.symbols.filter((symbolNode) => symbolNode.name === "MergedNS");

    // `core.d.ts` is module scope while `extra.d.ts` is script scope, so they stay split.
    // The function homonym produces the third `MergedNS` row.
    expect(mergedEntries.length).toBe(3);

    const namespaceNodes = mergedEntries.filter((node) => node.kindName === "ModuleDeclaration");
    const functionNode = mergedEntries.find((node) => node.kindName === "FunctionDeclaration");

    expect(namespaceNodes).toHaveLength(2);
    expect(functionNode).toBeDefined();

    const nsFilePaths = namespaceNodes.map((node) => node.filePath).sort();
    expect(nsFilePaths).toEqual(["core.d.ts", "extra.d.ts"]);

    const originalMember = graphResult.symbols.find((symbolNode) => symbolNode.name === "MergedNS.original");
    const extraMember = graphResult.symbols.find((symbolNode) => symbolNode.name === "MergedNS.extra");
    expect(originalMember?.parentSymbolId).toMatch(/MergedNS$/);
    expect(originalMember?.parentSymbolId).not.toContain("#2");
    expect(extraMember?.parentSymbolId).toContain("MergedNS");
    expect(extraMember?.parentSymbolId).not.toBe(originalMember?.parentSymbolId);

    const symbolNames = graphResult.symbols.map((symbolNode) => symbolNode.name);
    expect(symbolNames).toContain("MergedNS.original");
    expect(symbolNames).toContain("MergedNS.extra");

    const nsWithSince = namespaceNodes.find((node) => node.since === "1.0.0");
    expect(nsWithSince).toBeDefined();
  });

  it("handles duplicate symbol names from the SAME file (e.g. overloads) and assigns unique IDs", () => {
    const graphResult = buildPackageGraph(makePackageInfo("computed-properties"));
    const overloads = graphResult.symbols.filter(
      (symbolNode) => symbolNode.name === "Overloaded.prototype.[Symbol.iterator]"
    );

    expect(overloads.length).toBe(2);

    const ids = overloads.map((symbolNode) => symbolNode.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("handles same-name symbols with DIFFERENT kinds in the same file (e.g. function and namespace)", () => {
    const graphResult = buildPackageGraph(makePackageInfo("merged-symbols"));
    const mergedKinds = graphResult.symbols
      .filter((symbolNode) => symbolNode.name === "merged")
      .map((symbolNode) => symbolNode.kindName);

    expect(mergedKinds).toContain("VariableStatement");
    expect(mergedKinds).toContain("ModuleDeclaration");
    expect(mergedKinds.filter((kindName) => kindName === "VariableStatement")).toHaveLength(1);
    expect(mergedKinds.filter((kindName) => kindName === "ModuleDeclaration")).toHaveLength(1);
  });

  it("sets parentSymbolId on dotted members: PropertySignature, MethodSignature, namespaces, prototypes", () => {
    const graph = buildPackageGraph(makePackageInfo("member-property-extraction"));
    const find = (name: string) => graph.symbols.find((s) => s.name === name);

    const parserServices = find("ParserServices");
    const esTreeMap = find("ParserServices.esTreeNodeToTSNodeMap");
    expect(esTreeMap?.kindName).toBe("PropertySignature");
    expect(esTreeMap?.parentSymbolId).toBe(parserServices?.id);

    const methodSigParent = find("MethodSigParent");
    const onFlush = find("MethodSigParent.onFlush");
    expect(onFlush?.kindName).toBe("MethodSignature");
    expect(onFlush?.parentSymbolId).toBe(methodSigParent?.id);

    const caliperNs = find("CaliperNS");
    const benchOpts = find("CaliperNS.BenchOpts");
    expect(benchOpts?.parentSymbolId).toBe(caliperNs?.id);
    const label = find("CaliperNS.BenchOpts.label");
    const refresh = find("CaliperNS.BenchOpts.refresh");
    const snapshotFn = find("CaliperNS.snapshot");
    expect(label?.kindName).toBe("PropertySignature");
    expect(refresh?.kindName).toBe("MethodSignature");
    expect(label?.parentSymbolId).toBe(benchOpts?.id);
    expect(refresh?.parentSymbolId).toBe(benchOpts?.id);
    expect(snapshotFn?.parentSymbolId).toBe(caliperNs?.id);

    const parserOptions = find("ParserOptions");
    const debugLevel = find("ParserOptions.prototype.debugLevel");
    const getParser = find("ParserOptions.prototype.getParser");
    expect(debugLevel?.parentSymbolId).toBe(parserOptions?.id);
    expect(getParser?.parentSymbolId).toBe(parserOptions?.id);

    const outerNs = find("OuterNS");
    const innerWidget = find("OuterNS.InnerWidget");
    expect(innerWidget?.parentSymbolId).toBe(outerNs?.id);
    const slot = find("OuterNS.InnerWidget.prototype.slot");
    const mount = find("OuterNS.InnerWidget.prototype.mount");
    expect(slot?.parentSymbolId).toBe(innerWidget?.id);
    expect(mount?.parentSymbolId).toBe(innerWidget?.id);

    const bridge = find("BRIDGE_METHODS");
    expect(find("BRIDGE_METHODS.SELECT")?.parentSymbolId).toBe(bridge?.id);
    expect(find("BRIDGE_METHODS.MEASURE")?.parentSymbolId).toBe(bridge?.id);
    expect(bridge?.parentSymbolId).toBeUndefined();
  });

  describe("makeRelative — Path Normalization Fallbacks", () => {
    it("handles paths outside the package directory by falling back to relative calculation", () => {
      const graph = buildPackageGraph(makePackageInfo("simple-export"));
      expect(graph.package).toBe("simple-export");
    });
  });

  describe("Inherited Member Flattening", () => {
    it("flattens inherited class and interface members into full symbol lists", () => {
      const graph = buildPackageGraph(makePackageInfo("inherited-member-flattening"));

      const leafProps = graph.symbols.filter(symbolNode => symbolNode.name.startsWith("LeafNode."));
      const leafPropNames = leafProps.map(symbolNode => symbolNode.name);

      // Direct property
      expect(leafPropNames).toContain("LeafNode.prototype.leafProp");
      
      // Inherited from MiddleNode
      expect(leafPropNames).toContain("LeafNode.prototype.middleProp");
      
      // Inherited from BaseNode (via MiddleNode)
      expect(leafPropNames).toContain("LeafNode.prototype.baseProp");

      // Method overrides: commonMethod is overridden in MiddleNode
      expect(leafPropNames).toContain("LeafNode.prototype.commonMethod");

      const derivedInterfaceMethods = graph.symbols.filter(symbolNode => symbolNode.name.startsWith("DerivedInterface."));
      const derivedInterfaceNames = derivedInterfaceMethods.map(symbolNode => symbolNode.name);
      
      expect(derivedInterfaceNames).toContain("DerivedInterface.derivedFunc");
      expect(derivedInterfaceNames).toContain("DerivedInterface.baseFunc");

      const leafMiddle = graph.symbols.find(symbolNode => symbolNode.name === "LeafNode.prototype.middleProp");
      expect(leafMiddle).toBeDefined();
      expect(leafMiddle!.since).toBe("2.0.0");
      expect(leafMiddle!.isInherited).toBe(true);
      expect(
        leafMiddle!.inheritedFromSources?.some(sourceId => sourceId.includes("MiddleNode")),
      ).toBe(true);
    });

    it("resolves heritage on the interface when a const shares the same name (value listed after interface)", () => {
      const graph = buildPackageGraph(makePackageInfo("dual-name-interface-const"));
      expect(graph.symbols.some(symbolNode => symbolNode.name === "Dual.onlyOnDual")).toBe(true);
      const inherited = graph.symbols.find(symbolNode => symbolNode.name === "Dual.fromRoot");
      expect(inherited).toBeDefined();
      expect(inherited!.isInherited).toBe(true);
    });

    it("produces unique IDs when a class and interface share the same name with different heritage", () => {
      const graph = buildPackageGraph(makePackageInfo("multi-declaration-heritage"));

      const allIds = graph.symbols.map(symbolNode => symbolNode.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);

      const sharedSynthetics = graph.symbols.filter(
        symbolNode => symbolNode.name === "Composite.shared"
      );
      expect(sharedSynthetics).toHaveLength(1);
      expect(sharedSynthetics[0].isInherited).toBe(true);
      const sharedSources = sharedSynthetics[0].inheritedFromSources ?? [];
      expect(sharedSources).toHaveLength(2);
      expect(sharedSources.some(id => id.includes("Trait.shared"))).toBe(true);
      expect(sharedSources.some(id => id.includes("Base.prototype.shared"))).toBe(true);

      const compositeNames = graph.symbols
        .filter(symbolNode => symbolNode.name.startsWith("Composite."))
        .map(symbolNode => symbolNode.name);
      expect(compositeNames).toContain("Composite.compositeFunc");
      expect(compositeNames).toContain("Composite.traitOnly");
      expect(compositeNames).toContain("Composite.shared");

      const mergedCompositeDeps = [
        "multi-declaration-heritage@1.0.0::Composite",
        "multi-declaration-heritage@1.0.0::Composite#2",
      ].sort();

      const bridge = graph.symbols.find(symbolNode => symbolNode.name === "bridgeComposite");
      expect(bridge).toBeDefined();
      expect(bridge!.dependencies?.sort()).toEqual(mergedCompositeDeps);

      const typeAlias = graph.symbols.find(symbolNode => symbolNode.name === "CompositeTypeAlias");
      expect(typeAlias).toBeDefined();
      expect(typeAlias!.dependencies?.sort()).toEqual(mergedCompositeDeps);
    });

    it("lists distinct heritage clauses for repeated type constructors with different type arguments", () => {
      const graph = buildPackageGraph(makePackageInfo("heritage-generic-multi-extends"));
      const merged = graph.symbols.find(symbolNode => symbolNode.name === "MergedRows");
      expect(merged).toBeDefined();
      const heritage = merged!.heritage ?? [];
      expect(heritage).toHaveLength(2);
      expect(new Set(heritage).size).toBe(2);
      expect(heritage.some(entry => entry.includes("HeritageRowA"))).toBe(true);
      expect(heritage.some(entry => entry.includes("HeritageRowB"))).toBe(true);
    });

    it("flattens inherited members through a local generic parent via lookup key", () => {
      const graph = buildPackageGraph(makePackageInfo("heritage-generic-multi-extends"));
      const names = graph.symbols.map(symbolNode => symbolNode.name);

      const genericChild = graph.symbols.find(symbolNode => symbolNode.name === "GenericChild");
      expect(genericChild).toBeDefined();
      expect(genericChild!.heritage).toEqual([expect.stringContaining("GenericParent")]);

      expect(names).toContain("GenericChild.parentValue");
      expect(names).toContain("GenericChild.parentFixed");
      expect(names).toContain("GenericChild.childOwn");

      const inheritedParentValue = graph.symbols.find(symbolNode => symbolNode.name === "GenericChild.parentValue");
      expect(inheritedParentValue).toBeDefined();
      expect(inheritedParentValue!.isInherited).toBe(true);
    });

    it("flattens inherited members through deeply nested generic type args", () => {
      const graph = buildPackageGraph(makePackageInfo("heritage-generic-multi-extends"));
      const names = graph.symbols.map(symbolNode => symbolNode.name);

      expect(names).toContain("DeepGenericChild.parentValue");
      expect(names).toContain("DeepGenericChild.parentFixed");
      expect(names).toContain("DeepGenericChild.deepOwn");

      const deepChild = graph.symbols.find(symbolNode => symbolNode.name === "DeepGenericChild");
      expect(deepChild).toBeDefined();
      expect(deepChild!.heritage).toEqual([expect.stringContaining("GenericParent<")]);
    });

    it("flattens transitively: GrandChild → GenericChild → GenericParent", () => {
      const graph = buildPackageGraph(makePackageInfo("heritage-generic-multi-extends"));
      const names = graph.symbols.map(symbolNode => symbolNode.name);

      expect(names).toContain("GrandChild.grandOwn");
      expect(names).toContain("GrandChild.childOwn");
      expect(names).toContain("GrandChild.parentValue");
      expect(names).toContain("GrandChild.parentFixed");

      const grandParentValue = graph.symbols.find(symbolNode => symbolNode.name === "GrandChild.parentValue");
      expect(grandParentValue).toBeDefined();
      expect(grandParentValue!.isInherited).toBe(true);
    });

    it("produces unique symbol IDs across all generic heritage cases", () => {
      const graph = buildPackageGraph(makePackageInfo("heritage-generic-multi-extends"));
      const ids = graph.symbols.map(symbolNode => symbolNode.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
