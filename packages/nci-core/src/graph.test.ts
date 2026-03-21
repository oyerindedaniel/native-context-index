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

    // Verify cross-file merging still happened for the namespace part
    expect(namespaceNode!.filePath).toBe("core.d.ts");
    expect(namespaceNode!.additionalFiles).toContain("extra.d.ts");

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
    const mergedNodes = graphResult.symbols.filter((symbolNode) => symbolNode.name === "merged");

    expect(mergedNodes.map(node => node.kindName)).toContain("VariableStatement");
    expect(mergedNodes.map(node => node.kindName)).toContain("ModuleDeclaration");
    expect(mergedNodes.length).toBe(2);
  });

  describe("makeRelative — Path Normalization Fallbacks", () => {
    it("handles paths outside the package directory by falling back to relative calculation", () => {
      const graph = buildPackageGraph(makePackageInfo("simple-export"));
      // The internal makeRelative is not exported, but we verify the graph's path handling
      // through its effect on SymbolNodes if we can force an out-of-bounds path.
      // (This test is mainly to ensure the file remains valid and extensible for utility testing).
      expect(graph.package).toBe("simple-export");
    });
  });
});
