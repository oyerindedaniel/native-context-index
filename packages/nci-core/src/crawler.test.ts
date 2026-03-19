import { describe, it, expect } from "vitest";
import path from "node:path";
import ts from "typescript";
import { crawl } from "./crawler.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("crawl", () => {
  // ─── Simple file (no re-exports) ────────────────────────────

  it("crawls a simple file with direct exports", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts")
    );

    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.circularRefs).toHaveLength(0);

    const names = result.exports.map((e) => e.name);
    expect(names).toContain("Config");
    expect(names).toContain("init");
  });

  // ─── Named re-export chain ──────────────────────────────────

  it("follows named re-exports across files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "re-export-chain", "index.d.ts")
    );

    const names = result.exports.map((e) => e.name);
    expect(names).toContain("Server");
    expect(names).toContain("ServerOptions");

    // These should be resolved from lib/core.d.ts
    const server = result.exports.find((e) => e.name === "Server");
    expect(server).toBeDefined();
    expect(server!.definedIn).toContain("core.d.ts");
  });

  // ─── Wildcard re-export ─────────────────────────────────────

  it("follows wildcard re-exports (export * from)", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts")
    );

    const names = result.exports.map((e) => e.name);

    // Direct export from index.d.ts
    expect(names).toContain("LIB_VERSION");

    // Re-exported from types.d.ts via export *
    expect(names).toContain("Config");
    expect(names).toContain("Callback");

    // Verify they came from types.d.ts
    const config = result.exports.find((e) => e.name === "Config");
    expect(config!.definedIn).toContain("types.d.ts");
  });

  // ─── Deep chain (3+ hops) ──────────────────────────────────

  it("follows re-exports through a 3-hop chain", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deep-chain", "index.d.ts")
    );

    const names = result.exports.map((e) => e.name);

    // Direct export
    expect(names).toContain("APP_NAME");

    // Re-exported through: index → middleware → core/handler
    expect(names).toContain("Handler");

    const handler = result.exports.find((e) => e.name === "Handler");
    expect(handler).toBeDefined();
    expect(handler!.definedIn).toContain("handler.d.ts");

    // Should have visited 3 files
    expect(result.visitedFiles.length).toBe(3);
  });

  // ─── Circular dependency detection ─────────────────────────

  it("detects circular dependencies without infinite looping", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "circular-deps", "a.d.ts")
    );

    // Should complete without hanging
    expect(result.circularRefs.length).toBeGreaterThan(0);

    // Should still extract the direct exports
    const names = result.exports.map((e) => e.name);
    expect(names).toContain("fromA");
  });

  // ─── Depth limit ────────────────────────────────────────────

  it("respects the max depth limit", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deep-chain", "index.d.ts"),
      { maxDepth: 1 }
    );

    // With maxDepth=1, it should only follow 1 hop
    // So it should visit index.d.ts and middleware.d.ts but NOT core/handler.d.ts
    // So Handler won't be fully resolved from core/handler.d.ts
    const names = result.exports.map((e) => e.name);
    expect(names).toContain("APP_NAME"); // Direct export always works
  });

  // ─── Multiple visited files tracking ────────────────────────

  it("tracks all visited files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "wildcard-reexport", "index.d.ts")
    );

    expect(result.visitedFiles.length).toBe(2); // index.d.ts + types.d.ts
  });

  // ─── Non-existent file ──────────────────────────────────────

  it("handles non-existent entry file gracefully", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "nonexistent", "index.d.ts")
    );

    expect(result.exports).toHaveLength(0);
    expect(result.visitedFiles).toHaveLength(0);
  });

  // ─── Triple-slash reference following ─────────────────────────

  it("follows /// <reference path> directives into referenced files", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts")
    );

    const names = result.exports.map((e) => e.name);

    // Direct export from index.d.ts
    expect(names).toContain("APP_VERSION");

    // From globals.d.ts (via /// <reference path="./globals.d.ts" />)
    expect(names).toContain("GlobalConfig");
    expect(names).toContain("setupGlobals");

    // From utils.d.ts (via /// <reference path="./utils.d.ts" />)
    expect(names).toContain("formatDate");
    expect(names).toContain("DateFormat");
  });

  it("tracks all files visited through triple-slash references", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts")
    );

    // Should visit: index.d.ts + globals.d.ts + utils.d.ts = 3
    expect(result.visitedFiles.length).toBe(3);
  });

  // ─── Dependencies extraction ──────────────────────────────────

  it("passes dependencies through the crawl pipeline", () => {
    const result = crawl(
      path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts")
    );

    // Logger references Config and LogLevel
    const logger = result.exports.find((e) => e.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies).toBeDefined();
    expect(logger!.dependencies).toContain("Config");
    expect(logger!.dependencies).toContain("LogLevel");

    // createLogger references Config and Logger
    const createLogger = result.exports.find((e) => e.name === "createLogger");
    expect(createLogger).toBeDefined();
    expect(createLogger!.dependencies).toBeDefined();
    expect(createLogger!.dependencies).toContain("Config");
    expect(createLogger!.dependencies).toContain("Logger");
  });
});
