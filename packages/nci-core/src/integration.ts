import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { scanPackages } from "./scanner.js";
import { buildPackageGraph } from "./graph.js";
import { resolveTypesEntry } from "./resolver.js";
import type { PackageGraph } from "./types.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const REAL_NODE_MODULES = path.resolve(__dirname, "../../../node_modules");

describe("integration", () => {
  it("runs the full pipeline on re-export-chain fixture", () => {
    const graph = buildPackageGraph({
      name: "re-export-chain",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "re-export-chain"),
      isScoped: false,
    });

    expect(graph.totalSymbols).toBe(6);
    expect(graph.totalFiles).toBe(2);

    const ids = graph.symbols.map((symbol) => symbol.id);
    expect(ids).toContain("re-export-chain@1.0.0::Server");
    expect(ids).toContain("re-export-chain@1.0.0::ServerOptions");
  });

  it("runs the full pipeline on wildcard-reexport fixture", () => {
    const graph = buildPackageGraph({
      name: "wildcard-reexport",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "wildcard-reexport"),
      isScoped: false,
    });

    expect(graph.totalSymbols).toBe(5);
    expect(graph.totalFiles).toBe(2);

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("LIB_VERSION");
    expect(names).toContain("Config");
    expect(names).toContain("Callback");
  });

  it("runs the full pipeline on deep-chain fixture", () => {
    const graph = buildPackageGraph({
      name: "deep-chain",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "deep-chain"),
      isScoped: false,
    });

    expect(graph.totalSymbols).toBeGreaterThanOrEqual(2);
    expect(graph.totalFiles).toBe(3);

    const handler = graph.symbols.find((symbol) => symbol.name === "Handler");
    expect(handler).toBeDefined();
    expect(handler!.filePath).toContain("handler.d.ts");
  });

  it("produces valid .nci JSON output", () => {
    const graph = buildPackageGraph({
      name: "simple-export",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "simple-export"),
      isScoped: false,
    });

    const json = JSON.stringify(graph, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.package).toBe("simple-export");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.totalSymbols).toBe(5);
    expect(parsed.symbols).toHaveLength(5);

    expect(json).toContain('"simple-export@1.0.0::Config"');
    expect(json).toContain('"simple-export@1.0.0::init"');
  });

  it("scanner + graph pipeline works end-to-end", () => {
    const fakeModules = path.join(FIXTURES_DIR, "fake-node-modules");
    const packages = scanPackages(fakeModules);
    const graphs = packages.map((pkg) => buildPackageGraph(pkg));

    expect(graphs.length).toBeGreaterThan(0);
    expect(graphs.every((graphResult) => graphResult.package)).toBe(true);
    expect(graphs.every((graphResult) => graphResult.version)).toBe(true);
  });


  it("resolves all subpath exports into a single graph", () => {
    const graph = buildPackageGraph({
      name: "subpath-exports",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "subpath-exports"),
      isScoped: false,
    });

    // Should have symbols from ALL 3 entries: root + utils + server
    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("AppConfig");     // from root
    expect(names).toContain("createApp");     // from root
    expect(names).toContain("formatDate");    // from ./utils
    expect(names).toContain("parseQuery");    // from ./utils
    expect(names).toContain("QueryParams");   // from ./utils
    expect(names).toContain("createServer");  // from ./server
    expect(names).toContain("Server");        // from ./server

    expect(graph.totalSymbols).toBe(11);
    expect(graph.totalFiles).toBe(3);
  });

  it("captures NamespaceExportDeclaration in graph", () => {
    const graph = buildPackageGraph({
      name: "umd-namespace",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "umd-namespace"),
      isScoped: false,
    });

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("MyLib");
    expect(names).toContain("Widget");
    expect(names).toContain("createWidget");

    const myLib = graph.symbols.find((symbol) => symbol.name === "MyLib");
    expect(myLib!.kindName).toBe("NamespaceExportDeclaration");
  });

  it("filters out declare global augmentations from graph", () => {
    const graph = buildPackageGraph({
      name: "global-augmentation",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "global-augmentation"),
      isScoped: false,
    });

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("AppState");
    expect(names).toContain("initApp");
    expect(names).not.toContain("global");
  });

  it("carries deprecation info through the full pipeline", () => {
    const graph = buildPackageGraph({
      name: "deprecated-exports",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "deprecated-exports"),
      isScoped: false,
    });

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

  it("resolves wildcard subpath exports into a single graph", () => {
    const graph = buildPackageGraph({
      name: "wildcard-subpath-exports",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "wildcard-subpath-exports"),
      isScoped: false,
    });

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("RootConfig");
    expect(names).toContain("init");
    expect(names).toContain("helperA");
    expect(names).toContain("HelperAOptions");
    expect(names).toContain("helperB");
    expect(names).toContain("HelperBResult");

    expect(graph.totalSymbols).toBe(8);
    expect(graph.totalFiles).toBe(3);
  });

  it("parses export import = require() through full pipeline", () => {
    const graph = buildPackageGraph({
      name: "export-import-equals",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "export-import-equals"),
      isScoped: false,
    });

    const names = graph.symbols.map((symbol) => symbol.name);
    expect(names).toContain("util");
    expect(names).toContain("mainFn");
    expect(names).toContain("MainConfig");

    const util = graph.symbols.find((symbol) => symbol.name === "util");
    expect(util!.kindName).toBe("ImportEqualsDeclaration");
  });

  it("carries visibility tags through the full pipeline", () => {
    const graph = buildPackageGraph({
      name: "visibility-tags",
      version: "1.0.0",
      dir: path.join(FIXTURES_DIR, "visibility-tags"),
      isScoped: false,
    });

    const pub = graph.symbols.find((symbol) => symbol.name === "PublicAPI");
    expect(pub!.visibility).toBe("public");

    const internal = graph.symbols.find((symbol) => symbol.name === "_internalHelper");
    expect(internal!.visibility).toBe("internal");

    const alpha = graph.symbols.find((symbol) => symbol.name === "AlphaFeature");
    expect(alpha!.visibility).toBe("alpha");

    const beta = graph.symbols.find((symbol) => symbol.name === "betaFunction");
    expect(beta!.visibility).toBe("beta");

    const noTag = graph.symbols.find((symbol) => symbol.name === "DEFAULT_VALUE");
    expect(noTag!.visibility).toBeUndefined();
  });
});

describe("real-library pipeline (all packages)", () => {
  const hasNodeModules = fs.existsSync(REAL_NODE_MODULES);

  function validateGraph(graph: PackageGraph): void {
    expect(typeof graph.package).toBe("string");
    expect(typeof graph.version).toBe("string");
    expect(typeof graph.totalSymbols).toBe("number");
    expect(typeof graph.totalFiles).toBe("number");
    expect(typeof graph.crawlDurationMs).toBe("number");
    expect(graph.totalSymbols).toBe(graph.symbols.length);

    for (const symbolNode of graph.symbols) {
      expect(symbolNode.id).toContain(graph.package + "@" + graph.version + "::");
      expect(symbolNode.name).toBeTruthy();
      expect(typeof symbolNode.kind).toBe("number");
      expect(symbolNode.kindName).toBeTruthy();
      expect(symbolNode.package).toBe(graph.package);
      expect(symbolNode.filePath).toBeTruthy();
      expect(typeof symbolNode.isTypeOnly).toBe("boolean");
      expect(Array.isArray(symbolNode.dependencies)).toBe(true);

      for (const dependency of symbolNode.dependencies) {
        expect(typeof dependency).toBe("string");
        expect(dependency.length).toBeGreaterThan(0);
      }
    }

    const json = JSON.stringify(graph);
    expect(json.length).toBeGreaterThan(0);
    expect(JSON.parse(json).package).toBe(graph.package);
  }

  it("scans ALL packages from real node_modules without crashing", () => {
    if (!hasNodeModules) return;
    const allPackages = scanPackages(REAL_NODE_MODULES);
    expect(allPackages.length).toBeGreaterThan(0);
    console.log(`\n📦 Scanner found ${allPackages.length} packages`);
  });

  it("runs full pipeline on EVERY real package without crashing", { timeout: 60000 }, () => {
    if (!hasNodeModules) return;

    const allPackages = scanPackages(REAL_NODE_MODULES);
    const results: { name: string; symbols: number; files: number; ms: number; hasTypes: boolean }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const pkg of allPackages) {
      try {
        const graph = buildPackageGraph(pkg, { maxDepth: 3 });
        validateGraph(graph);
        results.push({
          name: pkg.name,
          symbols: graph.totalSymbols,
          files: graph.totalFiles,
          ms: Math.round(graph.crawlDurationMs),
          hasTypes: graph.totalSymbols > 0,
        });
      } catch (err) {
        errors.push({
          name: pkg.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(`\n📊 Pipeline results for ${results.length} packages:`);
    console.log(`   With types:    ${results.filter((result) => result.hasTypes).length}`);
    console.log(`   Without types: ${results.filter((result) => !result.hasTypes).length}`);
    console.log(`   Errors:        ${errors.length}\n`);

    console.log(
      "   " + "Package".padEnd(40) + "Symbols".padStart(8) + "Files".padStart(7) + "Time".padStart(8)
    );
    console.log("   " + "─".repeat(63));

    for (const result of results.sort(
      (leftPkg, rightPkg) => rightPkg.symbols - leftPkg.symbols
    )) {
      console.log(
        "   " + result.name.padEnd(40) + String(result.symbols).padStart(8) + String(result.files).padStart(7) + `${result.ms}ms`.padStart(8)
      );
    }

    if (errors.length > 0) {
      console.log(`\n   ❌ Errors:`);
      for (const errItem of errors) console.log(`   ${errItem.name}: ${errItem.error}`);
    }

    expect(errors).toHaveLength(0);
    expect(results.filter((result) => result.hasTypes).length).toBeGreaterThan(0);
  });

  it("@types/node: discovers symbols through triple-slash references", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@types/node");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 2 });
    validateGraph(graph);
    expect(graph.totalSymbols).toBeGreaterThan(0);
    expect(graph.totalFiles).toBeGreaterThan(1);
    console.log(`\n   @types/node: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("typescript: processes the TypeScript compiler package", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "typescript");
    if (!pkg) return;

    const entry = resolveTypesEntry(pkg.dir);
    console.log(`\n   typescript: entries=${entry.typesEntries.length}`);

    if (entry.typesEntries.length > 0) {
      const graph = buildPackageGraph(pkg, { maxDepth: 2 });
      validateGraph(graph);
      console.log(`   typescript: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("@typescript-eslint/types: parses AST type definitions", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@typescript-eslint/types");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`\n   @typescript-eslint/types: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("@typescript-eslint/utils: processes complex re-export chains", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@typescript-eslint/utils");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`\n   @typescript-eslint/utils: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("@typescript-eslint/scope-manager: processes scope-manager", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@typescript-eslint/scope-manager");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`\n   @typescript-eslint/scope-manager: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("eslint: processes the ESLint package", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "eslint");
    if (!pkg) return;

    const entry = resolveTypesEntry(pkg.dir);
    if (entry.typesEntries.length > 0) {
      const graph = buildPackageGraph(pkg, { maxDepth: 3 });
      validateGraph(graph);
      console.log(`\n   eslint: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("prettier: processes package with modern exports field", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "prettier");
    if (!pkg) return;

    const entry = resolveTypesEntry(pkg.dir);
    if (entry.typesEntries.length > 0) {
      const graph = buildPackageGraph(pkg, { maxDepth: 3 });
      validateGraph(graph);
      console.log(`\n   prettier: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("vitest: processes our own test framework", { timeout: 30000 }, () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "vitest");
    if (!pkg) return;

    const entry = resolveTypesEntry(pkg.dir);
    if (entry.typesEntries.length > 0) {
      const graph = buildPackageGraph(pkg, { maxDepth: 3 });
      validateGraph(graph);
      console.log(`\n   vitest: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("@typescript-eslint/parser: processes parser package", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@typescript-eslint/parser");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`\n   @typescript-eslint/parser: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("@typescript-eslint/typescript-estree: processes estree package", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const pkg = allPkgs.find((candidate) => candidate.name === "@typescript-eslint/typescript-estree");
    if (!pkg) return;

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`\n   @typescript-eslint/typescript-estree: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
  });

  it("@eslint/* packages: processes all ESLint scoped packages", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const eslintPkgs = allPkgs.filter((candidate) => candidate.name.startsWith("@eslint/"));

    console.log(`\n   Found ${eslintPkgs.length} @eslint/* packages`);
    for (const pkg of eslintPkgs) {
      const graph = buildPackageGraph(pkg, { maxDepth: 2 });
      validateGraph(graph);
      console.log(`   ${pkg.name}: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("eslint-plugin-*: processes all ESLint plugins", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const plugins = allPkgs.filter((candidate) => candidate.name.startsWith("eslint-plugin-"));

    console.log(`\n   Found ${plugins.length} eslint-plugin-* packages`);
    for (const pkg of plugins) {
      const graph = buildPackageGraph(pkg, { maxDepth: 2 });
      validateGraph(graph);
      console.log(`   ${pkg.name}: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);
    }
  });

  it("effect: processes the Effect library (complex type system)", { timeout: 30000 }, () => {
    if (!hasNodeModules) return;

    const allPkgs = scanPackages(REAL_NODE_MODULES);
    let pkg = allPkgs.find((candidate) => candidate.name === "effect");

    const localNodeModules = path.resolve(__dirname, "../node_modules");
    if (!pkg && fs.existsSync(localNodeModules)) {
      const localPkgs = scanPackages(localNodeModules);
      pkg = localPkgs.find((candidate) => candidate.name === "effect");
    }

    if (!pkg) { console.log("Skipping: effect not found"); return; }

    const entry = resolveTypesEntry(pkg.dir);
    console.log(`\n   effect: entries=${entry.typesEntries.length}`);

    const graph = buildPackageGraph(pkg, { maxDepth: 3 });
    validateGraph(graph);
    console.log(`   effect: ${graph.totalSymbols} symbols, ${graph.totalFiles} files`);

    expect(graph.totalSymbols).toBeGreaterThan(0);
    expect(graph.totalFiles).toBeGreaterThan(0);

    const names = graph.symbols.map((symbol) => symbol.name);
    console.log(`   effect: sample symbols: ${names.slice(0, 10).join(", ")}`);
  });

  it("all scoped packages resolve correctly through pnpm symlinks", () => {
    if (!hasNodeModules) return;
    const allPkgs = scanPackages(REAL_NODE_MODULES);
    const scopedPkgs = allPkgs.filter((candidate) => candidate.isScoped);

    console.log(`\n   Scoped packages: ${scopedPkgs.length}/${allPkgs.length}`);
    for (const pkg of scopedPkgs) {
      expect(pkg.name).toMatch(/^@/);
      expect(fs.existsSync(pkg.dir)).toBe(true);
    }
  });
});
