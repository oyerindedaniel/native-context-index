import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveTypesEntry } from "./resolver.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("resolveTypesEntry", () => {
  // ─── Priority 5: types field ─────────────────────────────────

  it("resolves a package with a direct 'types' field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "simple-export")
    );

    expect(result.name).toBe("simple-export");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!.endsWith("index.d.ts")).toBe(true);
  });

  // ─── Priority 7: index.d.ts fallback ─────────────────────────

  it("resolves a package with re-exports via index.d.ts fallback", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "re-export-chain")
    );

    expect(result.name).toBe("re-export-chain");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!.endsWith("index.d.ts")).toBe(true);
  });

  // ─── Priority 1: exports["."].types ──────────────────────────

  it("resolves conditional exports with types condition", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports")
    );

    expect(result.name).toBe("conditional-exports-pkg");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(path.join("dist", "index.d.ts"));
  });

  // ─── Priority 2: exports["."].import.types (nested) ──────────

  it("resolves nested conditional exports (import.types)", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "nested-conditional-exports")
    );

    expect(result.name).toBe("nested-conditional-pkg");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(
      path.join("dist", "esm", "index.d.ts")
    );
  });

  // ─── Priority 3: exports as direct string ────────────────────

  it("resolves string exports field pointing to .d.ts", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "string-exports")
    );

    expect(result.name).toBe("string-exports-pkg");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(path.join("lib", "index.d.ts"));
  });

  // ─── No types found ──────────────────────────────────────────

  it("returns empty typesEntries for a package with no types", () => {
    const tmpDir = path.join(FIXTURES_DIR, "__no-types-tmp");
    const fs = require("node:fs");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "no-types-pkg", version: "1.0.0" })
    );

    try {
      const result = resolveTypesEntry(tmpDir);
      expect(result.name).toBe("no-types-pkg");
      expect(result.typesEntries).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  // ─── Error cases ─────────────────────────────────────────────

  it("throws for a missing package.json", () => {
    expect(() =>
      resolveTypesEntry(path.join(FIXTURES_DIR, "nonexistent"))
    ).toThrow("No package.json found");
  });

  // ─── Resolution priority ─────────────────────────────────────

  it("prefers exports.types over top-level types field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("dist");
  });

  // ─── typesVersions support ────────────────────────────────────

  it("resolves typesVersions for current TS version (>=5.0)", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "types-versions")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("ts5");
    expect(result.typesEntries[0]!).not.toContain("legacy");
  });

  it("typesVersions takes priority over types field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "types-versions")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("ts5");
  });

  // ─── Subpath exports ─────────────────────────────────────────

  it("resolves ALL subpath exports entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports")
    );

    expect(result.name).toBe("subpath-exports");
    // Should find 3 entries: ".", "./utils", "./server"
    expect(result.typesEntries).toHaveLength(3);

    const paths = result.typesEntries.map((p) => path.basename(p));
    expect(paths).toContain("index.d.ts");
    expect(paths).toContain("utils.d.ts");
    expect(paths).toContain("server.d.ts");
  });

  it("skips ./package.json in subpath exports", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports")
    );

    // ./package.json should NOT be in the entries
    for (const entry of result.typesEntries) {
      expect(entry).not.toContain("package.json");
    }
  });
});
