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
        "qualified-namespace-deps@1.0.0::node_modules/@peer/core/index.d.ts::PeerOpts",
        "qualified-namespace-deps@1.0.0::node_modules/@peer/core/index.d.ts::PeerOut",
      ])
    );
    expect(unresolvedExt?.dependencies).toContain("npm::@external/types::InvokeOutputOptions");
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

  it("merges the same namespace across different files in the same package", () => {
    const graphResult = buildPackageGraph(makePackageInfo("namespace-merging"));

    const mergedEntries = graphResult.symbols.filter((symbolNode) => symbolNode.name === "MergedNS");
    
    // We expect 2 nodes: 1 for the Namespace (merged across files) and 1 for the Function.
    expect(mergedEntries.length).toBe(2);

    const namespaceNode = mergedEntries.find(node => node.kindName === "ModuleDeclaration");
    const functionNode = mergedEntries.find(node => node.kindName === "FunctionDeclaration");

    expect(namespaceNode).toBeDefined();
    expect(functionNode).toBeDefined();

    // Verify cross-file merging still happened for the namespace part:
    // one canonical filePath, the other contributing file recorded in additionalFiles.
    const nsFiles = [namespaceNode!.filePath, ...(namespaceNode!.additionalFiles ?? [])];
    const uniqueNsFiles = Array.from(new Set(nsFiles)).sort();
    expect(uniqueNsFiles).toEqual(["core.d.ts", "extra.d.ts"].sort());

    const symbolNames = graphResult.symbols.map((symbolNode) => symbolNode.name);
    expect(symbolNames).toContain("MergedNS.original");
    expect(symbolNames).toContain("MergedNS.extra");

    expect(namespaceNode!.since).toBe("1.0.0");
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
      expect(leafMiddle!.inheritedFrom).toContain("MiddleNode");
    });

    it("resolves heritage on the interface when a const shares the same name (value listed after interface)", () => {
      const graph = buildPackageGraph(makePackageInfo("dual-name-interface-const"));
      expect(graph.symbols.some(symbolNode => symbolNode.name === "Dual.onlyOnDual")).toBe(true);
      const inherited = graph.symbols.find(symbolNode => symbolNode.name === "Dual.fromRoot");
      expect(inherited).toBeDefined();
      expect(inherited!.isInherited).toBe(true);
    });
  });
});
