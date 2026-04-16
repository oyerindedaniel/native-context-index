import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  resolveTypesEntry,
  resolveModuleSpecifier,
  normalizePath,
} from "./resolver.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures");

describe("resolveTypesEntry", () => {
  it("resolves simple types field", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "simple-export"));

    expect(result.name).toBe("simple-export");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("index.d.ts");
  });

  it("resolves exports with types condition", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "re-export-chain"),
    );

    expect(result.name).toBe("re-export-chain");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith("index.d.ts")),
    ).toBe(true);
  });

  it("resolves conditional exports", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports"),
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith(".d.ts")),
    ).toBe(true);
  });

  it("resolves nested conditional exports", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "nested-conditional-exports"),
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.endsWith(".d.ts")),
    ).toBe(true);
  });

  it("resolves string exports field pointing to .d.ts", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "string-exports"));

    expect(result.name).toBe("string-exports-pkg");
    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain("lib/index.d.ts");
  });

  it("returns empty typesEntries for a package with no types", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "no-types-pkg"));
    expect(result.name).toBe("no-types-pkg");
    expect(result.typesEntries).toHaveLength(0);
  });

  it("handles a missing package.json gracefully", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "nonexistent"));
    expect(result.typesEntries).toHaveLength(0);
  });

  it("prefers exports.types over top-level types field", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "conditional-exports"),
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(result.typesEntries[0]!).toContain(".d.ts");
  });

  it("resolves typesVersions with matching TypeScript version", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "types-versions"));

    expect(result.typesEntries.length).toBeGreaterThan(0);
    expect(
      result.typesEntries.some((entryPath) => entryPath.includes("ts5")),
    ).toBe(true);
  });

  it("falls back when typesVersions does not match", () => {
    const result = resolveTypesEntry(path.join(FIXTURES_DIR, "types-versions"));

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("handles exports with fallback arrays", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "export-fallback-cases"),
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("falls back to types key when conditions array has no types", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "export-fallback-cases"),
    );

    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("resolves multiple subpath exports into separate entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports"),
    );

    expect(result.typesEntries.length).toBe(3);
  });

  it("deduplicates overlapping types entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "subpath-exports"),
    );

    const uniqueEntries = new Set(result.typesEntries);
    expect(result.typesEntries.length).toBe(uniqueEntries.size);
  });

  it("resolves complex-exports fixture", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "complex-exports"),
    );
    for (const entryPath of result.typesEntries) {
      const relative = path
        .relative(path.join(FIXTURES_DIR, "complex-exports"), entryPath)
        .replace(/\\/g, "/");
      expect(relative).toMatch(/\.d\.(ts|mts|cts)$/);
    }
  });

  it("resolves .d.mts and .d.cts extensions", () => {
    const specResFix = path.join(FIXTURES_DIR, "specifier-resolution");
    const result = resolveTypesEntry(specResFix);
    const relatives = result.typesEntries.map((entryPath) =>
      path.relative(specResFix, entryPath).replace(/\\/g, "/"),
    );
    expect(relatives.some((relative) => relative.endsWith(".d.mts"))).toBe(
      true,
    );
    expect(relatives.some((relative) => relative.endsWith(".d.cts"))).toBe(
      true,
    );
  });

  const RESOLUTION_FIXTURE = path.join(FIXTURES_DIR, "specifier-resolution");
  const RESOLUTION_INDEX = path.join(RESOLUTION_FIXTURE, "index.d.ts");

  it("resolves bare specifiers to node_modules types", () => {
    const resolved = resolveModuleSpecifier(
      "@nci-test/bridge",
      path.join(
        FIXTURES_DIR,
        "cross-package-resolution",
        "meta-package",
        "index.d.ts",
      ),
    );
    expect(resolved.length).toBeGreaterThan(0);
    const normalized = resolved[0]!.replace(/\\/g, "/");
    expect(normalized).toContain("@nci-test/bridge");
    expect(normalized).toContain("index.d.ts");
  });

  it("resolves relative specifiers to .d.ts files", () => {
    const resolved = resolveModuleSpecifier("./mod", RESOLUTION_INDEX);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved[0]!).toMatch(/mod\.d\.ts$/);
  });

  it("returns null for unresolvable specifiers", () => {
    const resolved = resolveModuleSpecifier(
      "nonexistent-xyz-abc",
      RESOLUTION_INDEX,
    );
    expect(resolved).toHaveLength(0);
  });

  it("resolves .js specifier to .d.ts", () => {
    const resolved = resolveModuleSpecifier("./mod.js", RESOLUTION_INDEX);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved[0]!).toMatch(/mod\.d\.ts$/);
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
      path.join(FIXTURES_DIR, "malformed-versions"),
    );
    expect(result.typesEntries).toHaveLength(0);
  });

  it("handles nested exports without wildcard patterns", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "no-wildcard-exports"),
    );
    const subpathEntry = result.typesEntries.find((entry) =>
      entry.includes("dist/no-star.d.ts"),
    );
    expect(subpathEntry).toBeUndefined();
  });

  it("resolves array-based exports and handles null conditional entries", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "array-exports-null-fallback"),
    );
    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("returns empty entries when exports wildcard pattern is invalid", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "invalid-wildcard-exports"),
    );
    expect(result.typesEntries).toHaveLength(0);
  });

  it("handles bare array exports at root level", () => {
    const result = resolveTypesEntry(
      path.join(FIXTURES_DIR, "bare-array-exports"),
    );
    expect(result.typesEntries.length).toBeGreaterThan(0);
  });

  it("handles subpath-string exports and invalid file extensions", () => {
    const fixtureDir = path.join(FIXTURES_DIR, "subpath-string-exports");
    const result = resolveTypesEntry(fixtureDir);
    expect(result.typesEntries.length).toBeGreaterThan(0);
    const normalizedFixtureDir = fixtureDir.replace(/\\/g, "/");
    expect(result.typesEntries).toContain(normalizedFixtureDir + "/foo.d.ts");
    expect(result.typesEntries).not.toContain(normalizedFixtureDir + "/bar.js");
  });

  describe("Relative Module Specifier Resolution", () => {
    const EXTRA_FIXTURE = path.join(FIXTURES_DIR, "resolution-extra");
    const EXTRA_INDEX = path.join(EXTRA_FIXTURE, "index.d.ts"); // doesn't need to exist for resolution dir logic

    it("resolves .mjs specifier to .d.mts file", () => {
      const resolved = resolveModuleSpecifier("./esm.mjs", EXTRA_INDEX);
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved[0]!).toMatch(/esm\.d\.mts$/);
    });

    it("resolves .cjs specifier to .d.cts file", () => {
      const resolved = resolveModuleSpecifier("./cjs.cjs", EXTRA_INDEX);
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved[0]!).toMatch(/cjs\.d\.cts$/);
    });

    it("resolves .js specifier to index.d.ts in a directory", () => {
      const resolved = resolveModuleSpecifier("./dir-index.js", EXTRA_INDEX);
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved[0]!).toMatch(/dir-index\/index\.d\.ts$/);
    });

    it("continues to the next resolution rule if a candidate file does not exist", () => {
      // This triggers the !isFileSafe branch for a .js specifier
      // that doesn't have a matching .d.ts but does have a directory/index.d.ts
      const resolved = resolveModuleSpecifier("./nonexistent.js", EXTRA_INDEX);
      expect(resolved).toHaveLength(0);
    });
  });

  describe("Conditional Export Wildcard Scanning", () => {
    it("handles non-string/non-object conditional values gracefully", () => {
      // Verifies that the resolver ignores non-string primitives and nulls in condition maps
      const result = resolveTypesEntry(
        path.join(FIXTURES_DIR, "conditional-export-priorities"),
      );
      expect(result.typesEntries.length).toBeGreaterThan(0);
      expect(result.typesEntries[0]).toMatch(/index\.d\.ts$/);
    });

    it("handles wildcard patterns for root-level files", () => {
      const result = resolveTypesEntry(
        path.join(FIXTURES_DIR, "conditional-exports"),
      );
      expect(result.typesEntries.some((e) => e.includes("index.d.ts"))).toBe(
        true,
      );
    });

    it("gracefully continues when an extension mapping file is missing", () => {
      // Verifies fallbacks for missing .d.mts and .d.cts files during extension mapping
      const EXTRA_FIXTURE = path.join(FIXTURES_DIR, "resolution-extra");
      const EXTRA_INDEX = path.join(EXTRA_FIXTURE, "index.d.ts");

      const mjsResult = resolveModuleSpecifier("./missing.mjs", EXTRA_INDEX);
      expect(mjsResult).toHaveLength(0);

      const cjsResult = resolveModuleSpecifier("./missing.cjs", EXTRA_INDEX);
      expect(cjsResult).toHaveLength(0);
    });

    it("resolves nested root conditional exports correctly", () => {
      // Resolves complex nested export structures at the root specifer
      const result = resolveTypesEntry(
        path.join(FIXTURES_DIR, "complex-wildcard-subpaths"),
      );
      expect(result.typesEntries.length).toBeGreaterThan(0);
      expect(result.typesEntries[0]).toMatch(/index\.d\.ts$/);
    });

    it("resolves typesVersions dot-mappings correctly", () => {
      // Resolves explicit '.' mappings within typesVersions blocks
      const result = resolveTypesEntry(
        path.join(FIXTURES_DIR, "conditional-exports"),
      );
      expect(result.typesEntries.length).toBeGreaterThan(0);
    });

    it("handles multi-star patterns successfully", () => {
      const fixtureDir = path.join(FIXTURES_DIR, "multi-star-exports");
      const result = resolveTypesEntry(fixtureDir);

      const relatives = result.typesEntries.map((e) =>
        path.relative(fixtureDir, e).replace(/\\/g, "/"),
      );
      expect(relatives).toContain("dist/a/b/index.d.ts");
      expect(relatives).toContain("dist/x/y/index.d.ts");
      expect(result.typesEntries.length).toBe(2);
    });

    it("handles root-level wildcard patterns without directory slashes", () => {
      // Verifies expansion for patterns like '*.d.ts' in the package root
      const result = resolveModuleSpecifier(
        "./root/foo",
        path.join(FIXTURES_DIR, "complex-wildcard-subpaths", "index.d.ts"),
      );
      expect(result).toBeDefined();
    });

    it("resolves deeply nested wildcard conditional exports", () => {
      // Verifies recursive success paths for wildcards within nested objects
      const result = resolveModuleSpecifier(
        "./nest/foo",
        path.join(FIXTURES_DIR, "complex-wildcard-subpaths", "index.d.ts"),
      );
      expect(result).toBeDefined();
    });
    it("resolves targeted subpaths against wildcard exports map", () => {
      const fixtureDir = path.resolve(
        __dirname,
        "../fixtures/wildcard-subpath-resolution",
      );
      const rootFile = path.join(fixtureDir, "index.d.ts");

      // Should resolve "dep-with-wildcards/utils/formatter" to "dist/typings/formatter.d.ts"
      // NOT the decoy at "utils/formatter.d.ts"
      const resolved = resolveModuleSpecifier(
        "dep-with-wildcards/utils/formatter",
        rootFile,
      );

      expect(resolved.length).toBeGreaterThan(0);
      expect(normalizePath(resolved[0]!)).toContain(
        "node_modules/dep-with-wildcards/dist/typings/formatter.d.ts",
      );
      expect(normalizePath(resolved[0]!)).not.toContain(
        "node_modules/dep-with-wildcards/utils/formatter.d.ts",
      );
    });

    it("ingests the full surface area of a bare package re-export", () => {
      const fixtureDir = path.resolve(
        __dirname,
        "../fixtures/bare-package-surface-expansion",
      );
      const rootFile = path.join(fixtureDir, "index.d.ts");

      // "@sibling/core" should expand to both index and internal entries
      const resolved = resolveModuleSpecifier("@sibling/core", rootFile);

      expect(resolved).toHaveLength(2);
      const relatives = resolved.map((p) =>
        path.relative(fixtureDir, p).replace(/\\/g, "/"),
      );
      expect(relatives).toContain("node_modules/@sibling/core/dist/index.d.ts");
      expect(relatives).toContain(
        "node_modules/@sibling/core/dist/internal.d.ts",
      );
    });
  });
});
