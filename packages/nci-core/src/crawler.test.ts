import { describe, it, expect } from "vitest";
import path from "node:path";
import { crawl } from "./crawler.js";
import { buildPackageGraph } from "./graph.js";
import type { PackageInfo } from "./types.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("crawl", () => {
  it("crawls a simple file with direct exports", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts")
    );

    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.circularRefs).toHaveLength(0);

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("Config");
    expect(names).toContain("init");
  });

  it("follows named re-exports across files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "re-export-chain", "index.d.ts")
    );

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("Server");
    expect(names).toContain("ServerOptions");

    const server = result.exports.find((exportItem) => exportItem.name === "Server");
    expect(server).toBeDefined();
    expect(server!.definedIn).toContain("core.d.ts");
  });

  it("follows wildcard re-exports (export * from)", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts")
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("LIB_VERSION");

    expect(names).toContain("Config");
    expect(names).toContain("Callback");

    const config = result.exports.find((exportItem) => exportItem.name === "Config");
    expect(config!.definedIn).toContain("types.d.ts");
  });

  it("follows re-exports through a 3-hop chain", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deep-chain", "index.d.ts")
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("APP_NAME");

    expect(names).toContain("Handler");

    const handler = result.exports.find((exportItem) => exportItem.name === "Handler");
    expect(handler).toBeDefined();
    expect(handler!.definedIn).toContain("handler.d.ts");

    expect(result.visitedFiles.length).toBe(3);
  });


  it("detects circular dependencies without infinite looping", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "circular-deps", "a.d.ts")
    );

    expect(result.circularRefs.length).toBeGreaterThan(0);

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("fromA");
  });

  it("respects the max depth limit", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deep-chain", "index.d.ts"),
      { maxDepth: 1 }
    );

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("APP_NAME");
  });

  it("tracks all visited files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts")
    );

    expect(result.visitedFiles.length).toBe(2);
  });

  it("handles non-existent entry file gracefully", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "nonexistent", "index.d.ts")
    );

    expect(result.exports).toHaveLength(0);
    expect(result.visitedFiles).toHaveLength(0);
  });

  it("follows /// <reference path> directives into referenced files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts")
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
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts")
    );

    expect(result.visitedFiles.length).toBe(3);
  });

  it("passes dependencies through the crawl pipeline", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts")
    );

    const logger = result.exports.find((exportItem) => exportItem.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies).toBeDefined();
    const loggerDeps = logger!.dependencies!.map(ref => ref.name);
    expect(loggerDeps).toContain("Config");
    expect(loggerDeps).toContain("LogLevel");

    const createLogger = result.exports.find((exportItem) => exportItem.name === "createLogger");
    expect(createLogger).toBeDefined();
    expect(createLogger!.dependencies).toBeDefined();
    const createLoggerDeps = createLogger!.dependencies!.map(ref => ref.name);
    expect(createLoggerDeps).toContain("Config");
    expect(createLoggerDeps).toContain("Logger");
  });


  it("handles merged variable and namespace exports", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "merged-symbols", "index.d.ts")
    );

    const names = result.exports.map((exportItem) => exportItem.name);

    expect(names).toContain("merged");

    expect(names).toContain("merged.Config");

    expect(names).toContain("merged.version");
    expect(names).toContain("merged.options");
    expect(names).toContain("merged.options.verbose");
  });

  it("extracts dependencies from inline import() types", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "inline-import-type", "index.d.ts")
    );

    const visitorKeys = result.exports.find((exportItem) => exportItem.name === "VisitorKeys");
    expect(visitorKeys).toBeDefined();
    expect(visitorKeys!.dependencies).toBeDefined();
    const visitorKeysDeps = visitorKeys!.dependencies!.map(ref => ref.name);
    expect(visitorKeysDeps).toContain("VisitorKeys");

    const otherKey = result.exports.find((exportItem) => exportItem.name === "OtherKey");
    expect(otherKey).toBeDefined();
    expect(otherKey!.dependencies).toBeDefined();
    const otherKeyDeps = otherKey!.dependencies!.map(ref => ref.name);
    expect(otherKeyDeps).toContain("OtherKey");
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

    const publicInterface = packageGraph.symbols.find((symbol) => symbol.name === "PublicInterface");
    expect(publicInterface).toBeDefined();
    expect(publicInterface?.dependencies).toContain("complex-resolution@1.0.0::internal.d.ts::InternalType");

    const aliasSymbol = packageGraph.symbols.find((symbol) => symbol.name === "Alias");
    expect(aliasSymbol).toBeDefined();
    expect(aliasSymbol?.dependencies).toContain("complex-resolution@1.0.0::internal.d.ts::InternalType");

    const usesPrivateLocal = packageGraph.symbols.find((symbol) => symbol.name === "UsesPrivateLocal");
    expect(usesPrivateLocal).toBeDefined();
    expect(usesPrivateLocal?.dependencies).toContain("complex-resolution@1.0.0::index.d.ts::PrivateLocal");

    const privateLocal = packageGraph.symbols.find((symbol) => symbol.name === "PrivateLocal");
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

    expect(packageGraph.totalSymbols).toBe(2);

    const internalSymbols = packageGraph.symbols.filter((symbol) => symbol.isInternal);
    expect(internalSymbols).toHaveLength(0);

    const exportDeclarations = packageGraph.symbols.filter(
      (symbol) => symbol.kindName === "ExportDeclaration"
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

    const server = result.exports.find((exportItem) => exportItem.name === "Server");
    expect(server).toBeDefined();
    expect(server!.signature).toContain("class Server");

    const serverOptions = result.exports.find((exportItem) => exportItem.name === "ServerOptions");
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

    // Should have 3 types: RunnerTask, RunnerFile, and Local
    expect(packageGraph.totalSymbols).toBe(3);

    const task = packageGraph.symbols.find(symbol => symbol.name === "RunnerTask");
    expect(task).toBeDefined();
    expect(task!.signature).toBe("export { Task as RunnerTask } from '@vitest/runner'");
    expect(task!.reExportedFrom).toBeUndefined(); // filePath is index.d.ts, so reExportedFrom should be undefined

    const file = packageGraph.symbols.find(symbol => symbol.name === "RunnerFile");
    expect(file).toBeDefined();
    expect(file!.signature).toBe("export { File as RunnerFile } from '@vitest/runner'");

    const internalSymbols = packageGraph.symbols.filter(symbol => symbol.isInternal);
    expect(internalSymbols).toHaveLength(0);
  });

  it("handles broken triple-slash references gracefully", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "broken-triple-slash", "index.d.ts")
    );

    const names = result.exports.map((exportItem) => exportItem.name);
    expect(names).toContain("x");
    expect(result.visitedFiles.length).toBe(1); // Should only visit the entry file
  });
});
