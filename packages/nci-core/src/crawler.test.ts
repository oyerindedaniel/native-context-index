import { describe, it, expect } from "vitest";
import path from "node:path";
import { crawl } from "./crawler.js";
import { buildPackageGraph } from "./graph.js";
import { MAX_HOPS_UNLIMITED } from "./constants.js";
import type { PackageInfo } from "./types.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("crawl", () => {
  it("crawls a simple file with direct exports", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts"),
    );

    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.circularRefs).toHaveLength(0);

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("Config");
    expect(names).toContain("init");
  });

  it("follows named re-exports across files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "re-export-chain", "index.d.ts"),
    );

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("Server");
    expect(names).toContain("ServerOptions");

    const server = result.exports.find(
      (exportItem) => exportItem.name === "Server",
    );
    expect(server).toBeDefined();
    expect(server!.definedIn).toContain("core.d.ts");
  });

  it("follows wildcard re-exports (export * from)", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts"),
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("LIB_VERSION");

    expect(names).toContain("Config");
    expect(names).toContain("Callback");

    const config = result.exports.find(
      (exportItem) => exportItem.name === "Config",
    );
    expect(config!.definedIn).toContain("types.d.ts");
  });

  it("follows re-exports through a 3-hop chain", () => {
    const result = crawl(path.join(FIXTURES_DIR, "deep-chain", "index.d.ts"));

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("APP_NAME");

    expect(names).toContain("Handler");

    const handler = result.exports.find(
      (exportItem) => exportItem.name === "Handler",
    );
    expect(handler).toBeDefined();
    expect(handler!.definedIn).toContain("handler.d.ts");

    expect(result.visitedFiles.length).toBe(3);
  });

  it("detects circular dependencies without infinite looping", () => {
    const result = crawl(path.join(FIXTURES_DIR, "circular-deps", "a.d.ts"));

    expect(result.circularRefs.length).toBeGreaterThan(0);

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("fromA");
  });

  it("respects the max depth limit", () => {
    const result = crawl(path.join(FIXTURES_DIR, "deep-chain", "index.d.ts"), {
      maxHops: 1,
    });

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("APP_NAME");
  });

  it("maxHops -1 (unlimited) reaches the full hop-limit-chain like default", () => {
    const entry = path.join(FIXTURES_DIR, "hop-limit-chain", "index.d.ts");
    const baseline = crawl(entry);
    const unlimited = crawl(entry, { maxHops: MAX_HOPS_UNLIMITED });
    expect(baseline.visitedFiles.length).toBe(5);
    expect(unlimited.visitedFiles.length).toBe(baseline.visitedFiles.length);
    expect(unlimited.exports.some((exp) => exp.name === "deepLeaf")).toBe(true);
  });

  it("maxHops 2 truncates hop-limit-chain before the leaf files", () => {
    const entry = path.join(FIXTURES_DIR, "hop-limit-chain", "index.d.ts");
    const limited = crawl(entry, { maxHops: 2 });
    expect(limited.visitedFiles.length).toBe(3);
    const full = crawl(entry);
    expect(full.visitedFiles.length).toBeGreaterThan(
      limited.visitedFiles.length,
    );
  });

  it("falls back to default when maxHops is below -1", () => {
    const entry = path.join(FIXTURES_DIR, "hop-limit-chain", "index.d.ts");
    const baseline = crawl(entry);
    const invalid = crawl(entry, { maxHops: -2 });
    expect(invalid.visitedFiles.length).toBe(baseline.visitedFiles.length);
    expect(invalid.exports.length).toBe(baseline.exports.length);
  });

  it("falls back to default when maxHops is not a finite integer", () => {
    const entry = path.join(FIXTURES_DIR, "hop-limit-chain", "index.d.ts");
    const baseline = crawl(entry);
    const nonInteger = crawl(entry, { maxHops: 2.5 });
    const nonFinite = crawl(entry, { maxHops: Number.POSITIVE_INFINITY });
    expect(nonInteger.visitedFiles.length).toBe(baseline.visitedFiles.length);
    expect(nonFinite.visitedFiles.length).toBe(baseline.visitedFiles.length);
  });

  it("tracks all visited files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts"),
    );

    expect(result.visitedFiles.length).toBe(2);
  });

  it("handles non-existent entry file gracefully", () => {
    const result = crawl(path.join(FIXTURES_DIR, "nonexistent", "index.d.ts"));

    expect(result.exports).toHaveLength(0);
    expect(result.visitedFiles).toHaveLength(0);
  });

  it("follows /// <reference path> directives into referenced files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts"),
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("APP_VERSION");

    expect(names).toContain("GlobalConfig");
    expect(names).toContain("setupGlobals");

    expect(names).toContain("formatDate");
    expect(names).toContain("DateFormat");
  });

  it("tracks all files visited through triple-slash references", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts"),
    );

    expect(result.visitedFiles.length).toBe(3);
  });

  it("discovers triple-slash path refs after a leading block comment banner", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-after-block-comment", "index.d.ts"),
    );
    expect(result.visitedFiles.length).toBeGreaterThanOrEqual(2);
    expect(
      result.exports.some((symbol) => symbol.name === "fromReferenced"),
    ).toBe(true);
  });

  it("passes dependencies through the crawl pipeline", () => {
    const result = crawl(path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts"));

    const logger = result.exports.find(
      (exportItem) => exportItem.name === "Logger",
    );
    expect(logger).toBeDefined();
    expect(logger!.dependencies).toBeDefined();
    const loggerDeps = logger!.dependencies!.map((ref) => ref.name);
    expect(loggerDeps).toContain("Config");
    expect(loggerDeps).toContain("LogLevel");

    const createLogger = result.exports.find(
      (exportItem) => exportItem.name === "createLogger",
    );
    expect(createLogger).toBeDefined();
    expect(createLogger!.dependencies).toBeDefined();
    const createLoggerDeps = createLogger!.dependencies!.map((ref) => ref.name);
    expect(createLoggerDeps).toContain("Config");
    expect(createLoggerDeps).toContain("Logger");
  });

  it("handles merged variable and namespace exports", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "merged-symbols", "index.d.ts"),
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("merged");
    expect(names).toContain("merged.Config");
    expect(names).toContain("merged.version");
    expect(names).toContain("merged.options");
    expect(names).toContain("merged.options.verbose");
  });

  it("correctly attributes definedIn for namespace re-exports (export * as)", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "namespace-reexport", "index.d.ts"),
    );

    const lib = result.exports.find(
      (exportEntry) => exportEntry.name === "Lib",
    );
    const version = result.exports.find(
      (exportEntry) => exportEntry.name === "Lib.VERSION",
    );

    expect(lib).toBeDefined();
    expect(version).toBeDefined();

    // The 'Lib' symbol name is defined in index.d.ts
    expect(lib!.definedIn).toContain("index.d.ts");
    expect(lib!.signature).toContain("export * as Lib from");

    // The 'VERSION' symbol name is defined in lib.d.ts
    expect(version!.definedIn).toContain("lib.d.ts");
    expect(version!.signature).toContain("const VERSION");
  });

  it("keeps every method overload when expanding export * as (no definedIn+name collapse)", () => {
    const result = crawl(
      path.join(
        FIXTURES_DIR,
        "namespace-export-method-overloads",
        "index.d.ts",
      ),
    );

    const useMembers = result.exports.filter(
      (entry) => entry.name === "Ns.Service.use",
    );
    expect(useMembers).toHaveLength(2);
    const signatures = new Set(
      useMembers.map((entry) => entry.signature ?? ""),
    );
    expect(signatures.size).toBe(2);
  });

  it("extracts dependencies from inline import() types", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "inline-import-type", "index.d.ts"),
    );

    const visitorKeys = result.exports.find(
      (exportItem) => exportItem.name === "VisitorKeys",
    );
    expect(visitorKeys).toBeDefined();
    expect(visitorKeys!.dependencies).toBeDefined();
    const visitorKeysDeps = visitorKeys!.dependencies!.map((ref) => ref.name);
    expect(visitorKeysDeps).toContain("VisitorKeys");

    const otherKey = result.exports.find(
      (exportItem) => exportItem.name === "OtherKey",
    );
    expect(otherKey).toBeDefined();
    expect(otherKey!.dependencies).toBeDefined();
    const otherKeyDeps = otherKey!.dependencies!.map((ref) => ref.name);
    expect(otherKeyDeps).toContain("OtherKey");
  });

  it("expands import() type aliases so member symbols use the dependency file as definedIn", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "inline-import-type", "index.d.ts"),
    );
    const member = result.exports.find(
      (exportItem) => exportItem.name === "ExpandedViaImport.n",
    );
    expect(member).toBeDefined();
    expect(member!.definedIn).toContain(
      "inline-import-type-remote-target.d.ts",
    );
  });

  it("records import() module specifier for qualified namespace chains", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "inline-import-type", "index.d.ts"),
    );
    const alias = result.exports.find(
      (exportItem) => exportItem.name === "QualifiedImportChain",
    );
    expect(alias).toBeDefined();
    const dep = alias!.dependencies!.find((ref) => ref.name === "Leaf");
    expect(dep).toBeDefined();
    expect(dep!.importPath).toBe("./chain.js");
  });

  it("should handle complex resolution (internal types and path normalization)", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "complex-resolution");
    const packageInfo: PackageInfo = {
      name: "complex-resolution",
      version: "1.0.0",
      dir: fixturePath,
      isScoped: false,
    };
    const packageGraph = buildPackageGraph(packageInfo);

    const publicInterface = packageGraph.symbols.find(
      (symbol) => symbol.name === "PublicInterface",
    );
    expect(publicInterface).toBeDefined();
    expect(publicInterface?.dependencies).toContain(
      "complex-resolution@1.0.0::internal.d.ts::InternalType",
    );

    const aliasSymbol = packageGraph.symbols.find(
      (symbol) => symbol.name === "Alias",
    );
    expect(aliasSymbol).toBeDefined();
    expect(aliasSymbol?.dependencies).toContain(
      "complex-resolution@1.0.0::internal.d.ts::InternalType",
    );

    const usesPrivateLocal = packageGraph.symbols.find(
      (symbol) => symbol.name === "UsesPrivateLocal",
    );
    expect(usesPrivateLocal).toBeDefined();
    expect(usesPrivateLocal?.dependencies).toContain(
      "complex-resolution@1.0.0::index.d.ts::PrivateLocal",
    );

    const privateLocal = packageGraph.symbols.find(
      (symbol) => symbol.name === "PrivateLocal",
    );
    expect(privateLocal).toBeDefined();
    expect(privateLocal?.isTypeOnly).toBe(true);
  });

  it("does not create ghost internal duplicates from re-export statements", () => {
    const fixturePath = path.join(FIXTURES_DIR, "re-export-chain");
    const packageInfo: PackageInfo = {
      name: "re-export-chain",
      version: "1.0.0",
      dir: fixturePath,
      isScoped: false,
    };
    const packageGraph = buildPackageGraph(packageInfo);

    // Total symbols: Server (class), ServerOptions (interface),
    // plus Server.prototype.listen, Server.prototype.close (class members)
    // plus ServerOptions.port, ServerOptions.host (interface members)
    expect(packageGraph.totalSymbols).toBe(6);

    const internalSymbols = packageGraph.symbols.filter(
      (symbol) => symbol.isInternal,
    );
    expect(internalSymbols).toHaveLength(4); // The 2 prototype members + 2 interface members

    const exportDeclarations = packageGraph.symbols.filter(
      (symbol) => symbol.kindName === "ExportDeclaration",
    );
    expect(exportDeclarations).toHaveLength(0);
  });

  it("generates per-specifier signatures for named re-exports", () => {
    const fixturePath = path.join(FIXTURES_DIR, "re-export-chain");
    const packageInfo: PackageInfo = {
      name: "re-export-chain",
      version: "1.0.0",
      dir: fixturePath,
      isScoped: false,
    };
    const result = crawl(path.join(fixturePath, "index.d.ts"));

    const server = result.exports.find(
      (exportItem) => exportItem.name === "Server",
    );
    expect(server).toBeDefined();
    expect(server!.signature).toContain("class Server");

    const serverOptions = result.exports.find(
      (exportItem) => exportItem.name === "ServerOptions",
    );
    expect(serverOptions).toBeDefined();
    expect(serverOptions!.signature).toContain("interface ServerOptions");
  });

  it("handles aliased re-exports from external packages without bloating signatures or creating ghosts", () => {
    const fixturePath = path.join(FIXTURES_DIR, "external-reexport");
    const packageInfo: PackageInfo = {
      name: "external-reexport",
      version: "1.0.0",
      dir: fixturePath,
      isScoped: false,
    };
    const packageGraph = buildPackageGraph(packageInfo);

    // Should have 4 types: RunnerTask, RunnerFile, Local, and Local.id
    expect(packageGraph.totalSymbols).toBe(4);

    const task = packageGraph.symbols.find(
      (symbol) => symbol.name === "RunnerTask",
    );
    expect(task).toBeDefined();
    expect(task!.signature).toBe(
      "export { Task as RunnerTask } from '@vitest/runner'",
    );
    expect(task!.reExportedFrom).toBeUndefined(); // filePath is index.d.ts, so reExportedFrom should be undefined

    const file = packageGraph.symbols.find(
      (symbol) => symbol.name === "RunnerFile",
    );
    expect(file).toBeDefined();
    expect(file!.signature).toBe(
      "export { File as RunnerFile } from '@vitest/runner'",
    );

    const internalSymbols = packageGraph.symbols.filter(
      (symbol) => symbol.isInternal,
    );
    expect(internalSymbols).toHaveLength(0);
  });

  it("handles broken triple-slash references gracefully", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "broken-triple-slash", "index.d.ts"),
    );

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("x");
    expect(result.visitedFiles.length).toBe(1); // Should only visit the entry file
  });

  it("skips private class fields (#) so Rust parity does not emit [#…] member rows", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "private-class-field-skip", "index.d.ts"),
    );
    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("WithPrivate");
    expect(names).toContain("WithPrivate.prototype.visible");
    expect(names.some((name) => name.includes("#"))).toBe(false);
  });
  describe("Name Prefixing & Symbol Resolution", () => {
    it("handles deeply nested namespace re-exports with dot-prefixing", () => {
      const result = crawl(
        path.join(FIXTURES_DIR, "nested-prefix", "index.d.ts"),
      );
      const names = result.exports.map((exportEntry) => exportEntry.name);
      expect(names).toContain("Mid");
      expect(names).toContain("Mid.Inner");
      expect(names).toContain("Mid.Inner.val");

      const val = result.exports.find(
        (exportEntry) => exportEntry.name === "Mid.Inner.val",
      );
      expect(val!.reExportChain).toHaveLength(2);
    });

    it("handles namespaced local assignments correctly", () => {
      const result = crawl(
        path.join(FIXTURES_DIR, "nested-locals", "index.d.ts"),
      );
      const names = result.exports.map((exportEntry) => exportEntry.name);
      expect(names).toContain("A");
      expect(names).toContain("A.x");
      expect(names).toContain("B");
      expect(names).toContain("B.x");
    });
  });

  describe("Deep Symbol Resolution (Cross-Package)", () => {
    it("resolves symbols through multiple external package re-exports", () => {
      const entryFile = path.join(
        FIXTURES_DIR,
        "cross-package-resolution",
        "meta-package",
        "index.d.ts",
      );
      const result = crawl(entryFile, { maxHops: 5 });

      expect(result.visitedFiles.length).toBe(3);

      const coreService = result.exports.find(
        (exportEntry) => exportEntry.name === "CoreService",
      );
      expect(coreService).toBeDefined();
      expect(coreService!.signature).toContain("interface CoreService");
      expect(coreService!.definedIn).toContain("@nci-test/core");

      // Verify recursive ingest of InternalConfig (which is not exported)
      const internalConfig = result.exports.find((exportEntry) =>
        exportEntry.name.includes("InternalConfig"),
      );
      expect(internalConfig).toBeDefined();
      expect(internalConfig!.signature).toContain("interface InternalConfig");
    });
  });

  describe("dependency stub roots + self-exempt", () => {
    const stubSelfExemptUnscopedEntry = path.join(
      FIXTURES_DIR,
      "dependency-stub-self-exempt-unscoped",
      "index.d.ts",
    );

    it("does not resolve bare self subpath when root is stub-listed and self-exempt is unset", () => {
      const blocked = crawl(stubSelfExemptUnscopedEntry, {
        dependencyStubRoots: new Set(["self-stub-pkg"]),
      });
      expect(
        blocked.visitedFiles.every(
          (f) => !f.replace(/\\/g, "/").includes("/inner"),
        ),
      ).toBe(true);
      const inner = blocked.exports.find((s) => s.name === "Inner");
      expect(inner).toBeDefined();
      expect(inner!.definedIn.replace(/\\/g, "/")).toContain("index.d.ts");
    });

    it("resolves bare self subpath when stub-listed root matches self-exempt", () => {
      const ok = crawl(stubSelfExemptUnscopedEntry, {
        dependencyStubRoots: new Set(["self-stub-pkg"]),
        dependencyStubSelfExemptRoot: "self-stub-pkg",
      });
      expect(
        ok.visitedFiles.some((f) => f.replace(/\\/g, "/").includes("inner")),
      ).toBe(true);
      const inner = ok.exports.find((s) => s.name === "Inner");
      expect(inner).toBeDefined();
      expect(inner!.definedIn.replace(/\\/g, "/")).toContain("inner");
    });
  });
});
