import { describe, it, expect } from "vitest";
import path from "node:path";
import ts from "typescript";
import { parseExports, parseTripleSlashReferences, parseTypeReferenceDirectives, extractTypeReferences } from "./parser.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("parseExports", () => {
  const allExports = parseExports(
    path.join(FIXTURES_DIR, "all-export-forms", "index.d.ts")
  );

  // Helper to find an export by name
  const find = (name: string) => allExports.find((e) => e.name === name);

  // ─── Pattern 1: export interface ─────────────────────────────

  it("parses exported interface (Pattern 1)", () => {
    const exp = find("Config");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.InterfaceDeclaration);
    expect(exp!.kindName).toBe("InterfaceDeclaration");
    expect(exp!.isTypeOnly).toBe(true);
    expect(exp!.source).toBeUndefined();
  });

  // ─── Pattern 2: export type alias ────────────────────────────

  it("parses exported type alias (Pattern 2)", () => {
    const exp = find("Status");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.TypeAliasDeclaration);
    expect(exp!.kindName).toBe("TypeAliasDeclaration");
    expect(exp!.isTypeOnly).toBe(true);
  });

  // ─── Pattern 3: export function ──────────────────────────────

  it("parses exported function with JSDoc (Pattern 3)", () => {
    const exp = find("init");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.FunctionDeclaration);
    expect(exp!.kindName).toBe("FunctionDeclaration");
    expect(exp!.isTypeOnly).toBe(false);
    expect(exp!.jsDoc).toContain("Initialize the application");
  });

  // ─── Pattern 4: export class ─────────────────────────────────

  it("parses exported class (Pattern 4)", () => {
    const exp = find("Server");
    // Server is both a direct export AND used in `export default Server`
    // The direct declaration should be found
    const directExport = allExports.filter(
      (e) => e.name === "Server" && e.kind === ts.SyntaxKind.ClassDeclaration
    );
    expect(directExport.length).toBeGreaterThanOrEqual(1);
    expect(directExport[0]!.kindName).toBe("ClassDeclaration");
    expect(directExport[0]!.isTypeOnly).toBe(false);
  });

  // ─── Pattern 5: export const ─────────────────────────────────

  it("parses exported variable/const (Pattern 5)", () => {
    const exp = find("VERSION");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.VariableStatement);
    expect(exp!.kindName).toBe("VariableStatement");
    expect(exp!.signature).toContain("string");
  });

  // ─── Pattern 6: export enum ──────────────────────────────────

  it("parses exported enum (Pattern 6)", () => {
    const exp = find("LogLevel");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.EnumDeclaration);
    expect(exp!.kindName).toBe("EnumDeclaration");
    expect(exp!.isTypeOnly).toBe(false);
  });

  // ─── Pattern 8: export { X } from "./other" ──────────────────

  it("parses named re-export (Pattern 8)", () => {
    const exp = find("Handler");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(exp!.source).toBe("./handlers.js");
    expect(exp!.isWildcard).toBeFalsy();
    expect(exp!.originalName).toBeUndefined();
  });

  // ─── Pattern 9: export { X as Y } from "./other" ─────────────

  it("parses aliased re-export (Pattern 9)", () => {
    const exp = find("Router");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(exp!.source).toBe("./internal.js");
    expect(exp!.originalName).toBe("InternalRouter");
  });

  // ─── Pattern 10: export * from "./barrel" ────────────────────

  it("parses wildcard re-export (Pattern 10)", () => {
    const exp = find("*");
    // There might be multiple wildcard exports, find the one from utils
    const wildcards = allExports.filter((e) => e.isWildcard);
    expect(wildcards.length).toBeGreaterThanOrEqual(1);

    const utilsWildcard = wildcards.find((e) => e.source === "./utils.js");
    expect(utilsWildcard).toBeDefined();
    expect(utilsWildcard!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
  });

  // ─── Pattern 11: export * as ns from "./mod" ──────────────────

  it("parses namespace re-export (Pattern 11)", () => {
    const exp = find("helpers");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(exp!.source).toBe("./helpers.js");
    expect(exp!.isNamespaceExport).toBe(true);
  });

  // ─── Pattern 12: export type { Foo } from "./other" ──────────

  it("parses type-only re-export (Pattern 12)", () => {
    const exp = find("RequestOptions");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(exp!.source).toBe("./options.js");
    expect(exp!.isTypeOnly).toBe(true);
  });

  // ─── Pattern 13: export default ──────────────────────────────

  it("parses default export (Pattern 13)", () => {
    const defaultExport = allExports.find(
      (e) => e.kind === ts.SyntaxKind.ExportAssignment
    );
    expect(defaultExport).toBeDefined();
    expect(defaultExport!.name).toBe("Server");
    expect(defaultExport!.kindName).toBe("ExportAssignment");
  });

  // ─── Pattern 14: export = (CJS) ─────────────────────────────

  it("parses CJS-style export = (Pattern 14)", () => {
    const cjsExports = parseExports(
      path.join(FIXTURES_DIR, "cjs-export", "index.d.ts")
    );

    const assignment = cjsExports.find(
      (e) => e.kind === ts.SyntaxKind.ExportAssignment
    );
    expect(assignment).toBeDefined();
    expect(assignment!.name).toBe("MyLib");
    expect(assignment!.signature).toContain("export =");
  });

  // ─── Pattern 15: declare module "name" ────────────────────────

  it("parses ambient module declaration (Pattern 15)", () => {
    const exp = find("my-plugin");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ModuleDeclaration);
    expect(exp!.kindName).toBe("ModuleDeclaration");
    expect(exp!.signature).toContain("declare module");
  });

  // ─── Aggregate check ─────────────────────────────────────────

  it("extracts all expected exports from the fixture", () => {
    const names = allExports.map((e) => e.name);

    // Direct declarations
    expect(names).toContain("Config");
    expect(names).toContain("Status");
    expect(names).toContain("init");
    expect(names).toContain("VERSION");
    expect(names).toContain("LogLevel");

    // Re-exports
    expect(names).toContain("Handler");
    expect(names).toContain("Router");
    expect(names).toContain("helpers");
    expect(names).toContain("RequestOptions");

    // Should have wildcard
    expect(allExports.some((e) => e.isWildcard)).toBe(true);
  });
});

describe("parseTripleSlashReferences", () => {
  it("extracts reference paths from a file with triple-slash directives", () => {
    const refs = parseTripleSlashReferences(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts")
    );

    expect(refs).toHaveLength(2);
    expect(refs).toContain("./globals.d.ts");
    expect(refs).toContain("./utils.d.ts");
  });

  it("returns empty array for a file with no references", () => {
    const refs = parseTripleSlashReferences(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts")
    );

    expect(refs).toHaveLength(0);
  });
});

describe("extractTypeReferences", () => {
  it("extracts custom type references from an interface", () => {
    const sourceCode = `
      interface Logger {
        config: Config;
        level: LogLevel;
      }
    `;
    const sf = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sf.statements[0]!;
    const refs = extractTypeReferences(iface);

    expect(refs).toContain("Config");
    expect(refs).toContain("LogLevel");
  });

  it("filters out built-in types", () => {
    const sourceCode = `
      interface Foo {
        name: string;
        count: number;
        ok: boolean;
        data: Array<CustomType>;
        cb: Promise<Result>;
      }
    `;
    const sf = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sf.statements[0]!;
    const refs = extractTypeReferences(iface);

    // Should NOT contain builtins
    expect(refs).not.toContain("string");
    expect(refs).not.toContain("number");
    expect(refs).not.toContain("boolean");
    expect(refs).not.toContain("Array");
    expect(refs).not.toContain("Promise");

    // Should contain custom types
    expect(refs).toContain("CustomType");
    expect(refs).toContain("Result");
  });

  it("returns empty array for declarations with no type references", () => {
    const sourceCode = `
      interface Empty {
        name: string;
      }
    `;
    const sf = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sf.statements[0]!;
    const refs = extractTypeReferences(iface);

    expect(refs).toHaveLength(0);
  });
});

describe("parseExports dependencies", () => {
  it("populates dependencies on parsed exports from deps-pkg fixture", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts")
    );

    // Logger should reference Config and LogLevel
    const logger = exports.find((e) => e.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies).toBeDefined();
    expect(logger!.dependencies).toContain("Config");
    expect(logger!.dependencies).toContain("LogLevel");

    // createLogger should reference Config and Logger
    const fn = exports.find((e) => e.name === "createLogger");
    expect(fn).toBeDefined();
    expect(fn!.dependencies).toBeDefined();
    expect(fn!.dependencies).toContain("Config");
    expect(fn!.dependencies).toContain("Logger");

    // Config should have NO dependencies (only uses builtins)
    const config = exports.find((e) => e.name === "Config");
    expect(config).toBeDefined();
    expect(config!.dependencies).toBeUndefined();
  });
});

// ─── Deprecation Detection ──────────────────────────────────────

describe("deprecation detection", () => {
  it("detects @deprecated with message", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const oldInit = exports.find((e) => e.name === "oldInit");
    expect(oldInit).toBeDefined();
    expect(oldInit!.deprecated).toBe("Use newInit instead");
  });

  it("detects @deprecated without message", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const legacy = exports.find((e) => e.name === "LegacyConfig");
    expect(legacy).toBeDefined();
    expect(legacy!.deprecated).toBe(true);
  });

  it("non-deprecated symbols have no deprecated field", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const newInit = exports.find((e) => e.name === "newInit");
    expect(newInit).toBeDefined();
    expect(newInit!.deprecated).toBeUndefined();

    const modern = exports.find((e) => e.name === "ModernConfig");
    expect(modern).toBeDefined();
    expect(modern!.deprecated).toBeUndefined();
  });
});

// ─── NamespaceExportDeclaration ─────────────────────────────────

describe("NamespaceExportDeclaration", () => {
  it("parses 'export as namespace X' (Pattern 16)", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "umd-namespace", "index.d.ts")
    );

    const nsExport = exports.find(
      (e) => e.kind === ts.SyntaxKind.NamespaceExportDeclaration
    );
    expect(nsExport).toBeDefined();
    expect(nsExport!.name).toBe("MyLib");
    expect(nsExport!.kindName).toBe("NamespaceExportDeclaration");
    expect(nsExport!.signature).toBe("export as namespace MyLib");
  });

  it("captures regular exports alongside namespace export", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "umd-namespace", "index.d.ts")
    );

    const names = exports.map((e) => e.name);
    expect(names).toContain("Widget");
    expect(names).toContain("createWidget");
    expect(names).toContain("MyLib");
  });
});

// ─── Declare Global Handling ────────────────────────────────────

describe("declare global handling", () => {
  it("marks declare global as isGlobalAugmentation", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts")
    );

    const globalAug = exports.find((e) => e.isGlobalAugmentation);
    expect(globalAug).toBeDefined();
    expect(globalAug!.name).toBe("global");
    expect(globalAug!.kind).toBe(ts.SyntaxKind.ModuleDeclaration);
  });

  it("still captures regular exports in same file", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts")
    );

    const names = exports.filter((e) => !e.isGlobalAugmentation).map((e) => e.name);
    expect(names).toContain("AppState");
    expect(names).toContain("initApp");
  });
});

// ─── Reference Types Directives ─────────────────────────────────

describe("parseTypeReferenceDirectives", () => {
  it("extracts type reference directives", () => {
    // Create a temp file with /// <reference types="node" />
    const fs = require("node:fs");
    const tmpDir = path.join(FIXTURES_DIR, "__type-ref-tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "index.d.ts"),
      '/// <reference types="node" />\n/// <reference types="express" />\nexport interface Foo {}'
    );

    try {
      const refs = parseTypeReferenceDirectives(
        path.join(tmpDir, "index.d.ts")
      );
      expect(refs).toHaveLength(2);
      expect(refs).toContain("node");
      expect(refs).toContain("express");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns empty for files without type reference directives", () => {
    const refs = parseTypeReferenceDirectives(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts")
    );
    expect(refs).toHaveLength(0);
  });
});

// ─── Export Import Equals ───────────────────────────────────────

describe("export import = require() (Pattern 17)", () => {
  it("parses export import X = require(...)", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "export-import-equals", "index.d.ts")
    );

    const importEquals = exports.find(
      (e) => e.kind === ts.SyntaxKind.ImportEqualsDeclaration
    );
    expect(importEquals).toBeDefined();
    expect(importEquals!.name).toBe("util");
    expect(importEquals!.kindName).toBe("ImportEqualsDeclaration");
    expect(importEquals!.source).toBe("./util");
  });

  it("captures regular exports alongside export import =", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "export-import-equals", "index.d.ts")
    );

    const names = exports.map((e) => e.name);
    expect(names).toContain("util");
    expect(names).toContain("mainFn");
    expect(names).toContain("MainConfig");
  });
});

// ─── Visibility Tags ────────────────────────────────────────────

describe("visibility tags (@public, @internal, @alpha, @beta)", () => {
  it("detects @public tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const pub = exports.find((e) => e.name === "PublicAPI");
    expect(pub).toBeDefined();
    expect(pub!.visibility).toBe("public");
  });

  it("detects @internal tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const internal = exports.find((e) => e.name === "_internalHelper");
    expect(internal).toBeDefined();
    expect(internal!.visibility).toBe("internal");
  });

  it("detects @alpha tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const alpha = exports.find((e) => e.name === "AlphaFeature");
    expect(alpha).toBeDefined();
    expect(alpha!.visibility).toBe("alpha");
  });

  it("detects @beta tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const beta = exports.find((e) => e.name === "betaFunction");
    expect(beta).toBeDefined();
    expect(beta!.visibility).toBe("beta");
  });

  it("has no visibility for untagged symbols", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const defaultVal = exports.find((e) => e.name === "DEFAULT_VALUE");
    expect(defaultVal).toBeDefined();
    expect(defaultVal!.visibility).toBeUndefined();
  });
});
