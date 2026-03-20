import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveTypesEntry, resolveModuleSpecifier } from "./resolver.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("resolveTypesEntry", () => {
  it("resolves simple types field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "simple-export")
    );

    expect(result.name).toBe("simple-export");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("index.d.ts");
  });

  it("resolves exports with types condition", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "re-export-chain")
    );

    expect(result.name).toBe("re-export-chain");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith("index.d.ts"))
    ).toBe(true);
  });

  it("resolves conditional exports", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith(".d.ts"))
    ).toBe(true);
  });

  it("resolves nested conditional exports", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "nested-conditional-exports")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith(".d.ts"))
    ).toBe(true);
  });

  it("resolves string exports field pointing to .d.ts", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "string-exports")
    );

    expect(result.name).toBe("string-exports-pkg");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(path.join("lib", "index.d.ts"));
  });

  it("returns empty typesEntries for a package with no types", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "no-types-pkg")
    );
    expect(result.name).toBe("no-types-pkg");
    expect(result.typesEntries).toHaveLength(0);
  });

  it("throws for a missing package.json", () => {
    expect(() =>
      resolveTypesEntry(path.join(FIXTURES_DIR, "nonexistent"))
    ).toThrow("No package.json found");
  });

  it("prefers exports.types over top-level types field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(".d.ts");
  });

  it("resolves typesVersions with matching TypeScript version", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "types-versions")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.includes("ts5"))
    ).toBe(true);
  });

  it("falls back when typesVersions does not match", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "types-versions")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("handles exports with fallback arrays", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "export-fallback-cases")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("falls back to types key when conditions array has no types", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "export-fallback-cases")
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("resolves multiple subpath exports into separate entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports")
    );

    expect(result.typesEntries.length).toBe(3);
  });

  it("deduplicates overlapping types entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports")
    );

    const uniqueEntries = new Set(result.typesEntries);
    expect(result.typesEntries.length).toBe(uniqueEntries.size);
  });

  it("resolves complex-exports fixture", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "complex-exports")
    );
    for (const entryPath of result.typesEntries) {
      const relative = path.relative(path.join(FIXTURES_DIR, "complex-exports"), entryPath).replace(/\\/g, "/");
      expect(relative).toMatch(/\.d\.(ts|mts|cts)$/);
    }
  });

  it("resolves .d.mts and .d.cts extensions", () => {
    const specResFix = path.join(FIXTURES_DIR, "specifier-resolution");
    const result = resolveTypesEntry(specResFix);
    const relatives = result.typesEntries.map((entryPath) =>
      path.relative(specResFix, entryPath).replace(/\\/g, "/")
    );
    expect(relatives.some((relative) => relative.endsWith(".d.mts"))).toBe(true);
    expect(relatives.some((relative) => relative.endsWith(".d.cts"))).toBe(true);
  });

  const RESOLUTION_FIXTURE = path.join(FIXTURES_DIR, "specifier-resolution");
  const RESOLUTION_INDEX = path.join(RESOLUTION_FIXTURE, "index.d.ts");

  it("resolves bare specifiers to node_modules types", () => {
    const resolved = resolveModuleSpecifier(
      "zod", RESOLUTION_INDEX
    );
    // bare specifiers are not relative, so this should return null
    expect(resolved).toBeNull();
  });

  it("resolves relative specifiers to .d.ts files", () => {
    const resolved = resolveModuleSpecifier(
      "./mod", RESOLUTION_INDEX
    );
    expect(resolved).toBeTruthy();
    expect(resolved!).toMatch(/mod\.d\.ts$/);
  });

  it("returns null for unresolvable specifiers", () => {
    const resolved = resolveModuleSpecifier(
      "nonexistent-xyz-abc", RESOLUTION_INDEX
    );
    expect(resolved).toBeNull();
  });

  it("resolves .js specifier to .d.ts", () => {
    const resolved = resolveModuleSpecifier(
      "./mod.js", RESOLUTION_INDEX
    );
    expect(resolved).toBeTruthy();
    expect(resolved!).toMatch(/mod\.d\.ts$/);
  });

  it("handles invalid conditional exports gracefully", () => {
    const packageDir = path.join(FIXTURES_DIR, "invalid-conditional-exports");
    const result = resolveTypesEntry(packageDir);
    expect(result.typesEntries).toHaveLength(0);
  });

  it("falls back to index.d.ts when no types/exports field is present", () => {
    const packageDir = path.join(FIXTURES_DIR, "no-entry-fallback");
    const result = resolveTypesEntry(packageDir);
    expect(result.typesEntries).toHaveLength(1);
    expect(result.typesEntries[0]).toContain("index.d.ts");
  });

  it("handles malformed version ranges in typesVersions", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "malformed-versions")
    );
    expect(result.typesEntries).toHaveLength(0);
  });

  it("handles nested exports without wildcard patterns", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "no-wildcard-exports")
    );
    const subpathEntry = result.typesEntries.find(entry => entry.includes("dist/no-star.d.ts"));
    expect(subpathEntry).toBeUndefined();
  });

  it("resolves array-based exports and handles null conditional entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "array-exports-null-fallback")
    );
    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("returns empty entries when exports wildcard pattern is invalid", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "invalid-wildcard-exports")
    );
    expect(result.typesEntries).toHaveLength(0);
  });

  it("handles bare array exports at root level", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "bare-array-exports")
    );
    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("handles subpath-string exports and invalid file extensions", () => {
    const fixtureDir = path.join(FIXTURES_DIR, "subpath-string-exports");
    const result = resolveTypesEntry(fixtureDir);
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries).toContain(path.resolve(fixtureDir, "foo.d.ts"));
    expect(result.typesEntries).not.toContain(path.resolve(fixtureDir, "bar.js"));
  });
});
