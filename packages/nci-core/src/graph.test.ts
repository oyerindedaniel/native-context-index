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
  // ─── Simple package ─────────────────────────────────────────

  it("builds a graph for a simple package with direct exports", () => {
    const graph = buildPackageGraph(
      makePackageInfo("simple-export")
    );

    expect(graph.package).toBe("simple-export");
    expect(graph.version).toBe("1.0.0");
    expect(graph.totalSymbols).toBeGreaterThan(0);
    expect(graph.totalFiles).toBe(1);
    expect(graph.crawlDurationMs).toBeGreaterThanOrEqual(0);

    // Check symbol IDs
    const ids = graph.symbols.map((s) => s.id);
    expect(ids).toContain("simple-export@1.0.0::Config");
    expect(ids).toContain("simple-export@1.0.0::init");
  });

  it("includes correct kind from ts.SyntaxKind", () => {
    const graph = buildPackageGraph(
      makePackageInfo("simple-export")
    );

    const configSymbol = graph.symbols.find((s) => s.name === "Config");
    expect(configSymbol).toBeDefined();
    expect(configSymbol!.kind).toBe(ts.SyntaxKind.InterfaceDeclaration);
    expect(configSymbol!.kindName).toBe("InterfaceDeclaration");
  });

  // ─── Re-export chain ───────────────────────────────────────

  it("builds a graph with re-exported symbols resolved to their source", () => {
    const graph = buildPackageGraph(
      makePackageInfo("re-export-chain")
    );

    const server = graph.symbols.find((s) => s.name === "Server");
    expect(server).toBeDefined();
    expect(server!.filePath).toContain("core.d.ts");

    // Should have visited index.d.ts and lib/core.d.ts
    expect(graph.totalFiles).toBe(2);
  });

  // ─── Wildcard re-export ─────────────────────────────────────

  it("includes symbols from wildcard re-exports in the graph", () => {
    const graph = buildPackageGraph(
      makePackageInfo("wildcard-reexport")
    );

    const names = graph.symbols.map((s) => s.name);
    expect(names).toContain("LIB_VERSION"); // direct
    expect(names).toContain("Config");      // from export *
    expect(names).toContain("Callback");    // from export *
  });

  // ─── Deep chain ────────────────────────────────────────────

  it("resolves symbols through deep re-export chains", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deep-chain")
    );

    const handler = graph.symbols.find((s) => s.name === "Handler");
    expect(handler).toBeDefined();
    expect(handler!.filePath).toContain("handler.d.ts");
    expect(graph.totalFiles).toBe(3);
  });

  // ─── No types ──────────────────────────────────────────────

  it("returns empty graph for a package with no types", () => {
    const fs = require("node:fs");
    const tmpDir = path.join(FIXTURES_DIR, "__no-types-graph-tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "no-types", version: "1.0.0" })
    );

    try {
      const graph = buildPackageGraph({
        name: "no-types",
        version: "1.0.0",
        dir: tmpDir,
        isScoped: false,
      });

      expect(graph.totalSymbols).toBe(0);
      expect(graph.symbols).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  // ─── Symbol structure ──────────────────────────────────────

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

  // ─── Dependencies ──────────────────────────────────────────

  it("populates dependencies with resolved symbol IDs", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deps-pkg")
    );

    // Logger references Config and LogLevel — these should be symbol IDs
    const logger = graph.symbols.find((s) => s.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies.length).toBeGreaterThan(0);

    // Dependencies should be resolved to "deps-pkg@1.0.0::Config" format
    expect(logger!.dependencies).toContain("deps-pkg@1.0.0::Config");
    expect(logger!.dependencies).toContain("deps-pkg@1.0.0::LogLevel");

    // createLogger references Config and Logger
    const createLogger = graph.symbols.find((s) => s.name === "createLogger");
    expect(createLogger).toBeDefined();
    expect(createLogger!.dependencies).toContain("deps-pkg@1.0.0::Config");
    expect(createLogger!.dependencies).toContain("deps-pkg@1.0.0::Logger");

    // Config uses only builtins — should have empty deps
    const config = graph.symbols.find((s) => s.name === "Config");
    expect(config).toBeDefined();
    expect(config!.dependencies).toHaveLength(0);
  });

  // ─── Triple-slash references in graph ──────────────────────

  it("builds graph including symbols from triple-slash referenced files", () => {
    const graph = buildPackageGraph(
      makePackageInfo("triple-slash-refs")
    );

    const names = graph.symbols.map((s) => s.name);

    // Direct + referenced file symbols
    expect(names).toContain("APP_VERSION");    // direct
    expect(names).toContain("GlobalConfig");   // from globals.d.ts
    expect(names).toContain("setupGlobals");   // from globals.d.ts
    expect(names).toContain("formatDate");     // from utils.d.ts
    expect(names).toContain("DateFormat");     // from utils.d.ts

    expect(graph.totalFiles).toBe(3);
  });

  // ─── typesVersions graph ────────────────────────────────────

  it("builds graph using typesVersions-resolved entry point", () => {
    const graph = buildPackageGraph(
      makePackageInfo("types-versions", "types-versions-pkg", "3.0.0")
    );

    // Should find ModernConfig from ts5/index.d.ts, NOT LegacyConfig
    const names = graph.symbols.map((s) => s.name);
    expect(names).toContain("ModernConfig");
    expect(names).not.toContain("LegacyConfig");
  });

  // ─── Subpath exports + Declaration merging ─────────────────

  it("merges symbols from all subpath exports without duplicates", () => {
    const graph = buildPackageGraph(
      makePackageInfo("subpath-exports")
    );

    // All 7 unique symbols from 3 entries
    expect(graph.totalSymbols).toBe(7);
    expect(graph.totalFiles).toBe(3);

    const names = graph.symbols.map((s) => s.name);
    expect(names).toContain("AppConfig");
    expect(names).toContain("createApp");
    expect(names).toContain("formatDate");
    expect(names).toContain("parseQuery");
    expect(names).toContain("QueryParams");
    expect(names).toContain("createServer");
    expect(names).toContain("Server");

    // No duplicates
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  // ─── Deprecation passthrough ───────────────────────────────

  it("passes deprecated flag through to SymbolNode", () => {
    const graph = buildPackageGraph(
      makePackageInfo("deprecated-exports")
    );

    const oldInit = graph.symbols.find((s) => s.name === "oldInit");
    expect(oldInit).toBeDefined();
    expect(oldInit!.deprecated).toBe("Use newInit instead");

    const legacy = graph.symbols.find((s) => s.name === "LegacyConfig");
    expect(legacy).toBeDefined();
    expect(legacy!.deprecated).toBe(true);

    const newInit = graph.symbols.find((s) => s.name === "newInit");
    expect(newInit).toBeDefined();
    expect(newInit!.deprecated).toBeUndefined();
  });
});
