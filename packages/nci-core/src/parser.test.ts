import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import ts from "typescript";
import {
  parseExports,
  parseImports,
  parseTripleSlashReferences,
  parseTypeReferenceDirectives,
  extractTypeReferences,
  getFileSource,
} from "./parser.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

function makeTmpFile(label: string): string {
  return path.join(os.tmpdir(), `nci-test-${label}-${Date.now()}.d.ts`);
}

describe("parseExports", () => {
  const allExports = parseExports(
    path.join(FIXTURES_DIR, "all-export-forms", "index.d.ts")
  );

  const find = (name: string) => allExports.find((exportItem) => exportItem.name === name);

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
    // Server is both a direct export AND used in `export default Server`
    // The direct declaration should be found
    const directExport = allExports.filter(
      (exportItem) => exportItem.name === "Server" && exportItem.kind === ts.SyntaxKind.ClassDeclaration
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
    expect(exp!.signature).toBe("export { Handler } from './handlers.js'");
  });

  // ─── Pattern 9: export { X as Y } from "./other" ─────────────

  it("parses aliased re-export (Pattern 9)", () => {
    const exp = find("Router");
    expect(exp).toBeDefined();
    expect(exp!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(exp!.source).toBe("./internal.js");
    expect(exp!.originalName).toBe("InternalRouter");
    expect(exp!.signature).toBe("export { InternalRouter as Router } from './internal.js'");
  });

  // ─── Pattern 10: export * from "./barrel" ────────────────────

  it("parses wildcard re-export (Pattern 10)", () => {
    // There might be multiple wildcard exports, find the one from utils
    const wildcards = allExports.filter((exportItem) => exportItem.isWildcard);
    expect(wildcards.length).toBeGreaterThanOrEqual(1);

    const utilsWildcard = wildcards.find((exportItem) => exportItem.source === "./utils.js");
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
    expect(exp!.signature).toBe("export type { RequestOptions } from './options.js'");
  });

  // ─── Pattern 13: export default ──────────────────────────────

  it("parses default export (Pattern 13)", () => {
    const defaultExport = allExports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.ExportAssignment
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
      (exportItem) => exportItem.kind === ts.SyntaxKind.ExportAssignment
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

  it("extracts all expected exports from the fixture", () => {
    const names = allExports.map((exportItem) => exportItem.name);

    expect(names).toContain("Config");
    expect(names).toContain("Status");
    expect(names).toContain("init");
    expect(names).toContain("VERSION");
    expect(names).toContain("LogLevel");

    expect(names).toContain("Handler");
    expect(names).toContain("Router");
    expect(names).toContain("helpers");
    expect(names).toContain("RequestOptions");

    expect(allExports.some((exportItem) => exportItem.isWildcard)).toBe(true);
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
    const sourceFile = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sourceFile.statements[0]!;
    const refs = extractTypeReferences(iface).map(ref => ref.name);

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
    const sourceFile = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sourceFile.statements[0]!;
    const refs = extractTypeReferences(iface).map(ref => ref.name);

    expect(refs).not.toContain("string");
    expect(refs).not.toContain("number");
    expect(refs).not.toContain("boolean");
    expect(refs).not.toContain("Array");
    expect(refs).not.toContain("Promise");

    expect(refs).toContain("CustomType");
    expect(refs).toContain("Result");
  });

  it("returns empty array for declarations with no type references", () => {
    const sourceCode = `
      interface Empty {
        name: string;
      }
    `;
    const sourceFile = ts.createSourceFile("test.d.ts", sourceCode, ts.ScriptTarget.Latest, true);
    const iface = sourceFile.statements[0]!;
    const refs = extractTypeReferences(iface).map(ref => ref.name);

    expect(refs).toHaveLength(0);
  });
});

describe("parseExports dependencies", () => {
  it("populates dependencies on parsed exports from deps-pkg fixture", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts")
    );

    const logger = exports.find((exportItem) => exportItem.name === "Logger");
    expect(logger).toBeDefined();
    expect(logger!.dependencies).toBeDefined();
    const loggerDeps = logger!.dependencies!.map(ref => ref.name);
    expect(loggerDeps).toContain("Config");
    expect(loggerDeps).toContain("LogLevel");

    const fn = exports.find((exportItem) => exportItem.name === "createLogger");
    expect(fn).toBeDefined();
    expect(fn!.dependencies).toBeDefined();
    const fnDeps = fn!.dependencies!.map(ref => ref.name);
    expect(fnDeps).toContain("Config");
    expect(fnDeps).toContain("Logger");

    const config = exports.find((exportItem) => exportItem.name === "Config");
    expect(config).toBeDefined();
    expect(config!.dependencies).toEqual([]);
  });
});

describe("deprecation detection", () => {
  it("detects @deprecated with message", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const oldInit = exports.find((exportItem) => exportItem.name === "oldInit");
    expect(oldInit).toBeDefined();
    expect(oldInit!.deprecated).toBe("Use newInit instead");
  });

  it("detects @deprecated without message", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const legacy = exports.find((exportItem) => exportItem.name === "LegacyConfig");
    expect(legacy).toBeDefined();
    expect(legacy!.deprecated).toBe(true);
  });

  it("non-deprecated symbols have no deprecated field", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts")
    );

    const newInit = exports.find((exportItem) => exportItem.name === "newInit");
    expect(newInit).toBeDefined();
    expect(newInit!.deprecated).toBeUndefined();

    const modern = exports.find((exportItem) => exportItem.name === "ModernConfig");
    expect(modern).toBeDefined();
    expect(modern!.deprecated).toBeUndefined();
  });
});

describe("Namespace handling (UMD & Recursive)", () => {
  it("parses 'export as namespace X' (Pattern 16)", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts")
    );

    const nsExport = exports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.NamespaceExportDeclaration
    );
    expect(nsExport).toBeDefined();
    expect(nsExport!.name).toBe("MyLib");
    expect(nsExport!.kindName).toBe("NamespaceExportDeclaration");
    expect(nsExport!.signature).toBe("export as namespace MyLib");
  });

  it("captures regular exports alongside namespace export", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts")
    );

    const names = exports.map((exportItem) => exportItem.name);
    expect(names).toContain("Widget");
    expect(names).toContain("createWidget");
    expect(names).toContain("MyLib");
  });

  it("recursively extracts members from a namespace", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts")
    );

    const config = exports.find((exportItem) => exportItem.name === "API.Config");
    expect(config).toBeDefined();
    expect(config!.kindName).toBe("InterfaceDeclaration");

    const fetchFn = exports.find((exportItem) => exportItem.name === "API.fetch");
    expect(fetchFn).toBeDefined();
    expect(fetchFn!.kindName).toBe("FunctionDeclaration");
  });

  it("handles visibility tags inside namespaces", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts")
    );
    const secret = exports.find((exportItem) => exportItem.name === "API.secret");
    expect(secret).toBeDefined();
    expect(secret!.visibility).toBe("internal");
  });

  it("marks non-exported members as isExplicitExport: false", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts")
    );
    const hidden = exports.find((exportItem) => exportItem.name === "API.hidden");
    expect(hidden).toBeDefined();
    expect(hidden!.isExplicitExport).toBe(false);
  });
});

describe("declare global handling", () => {
  it("marks declare global as isGlobalAugmentation", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts")
    );

    const globalAug = exports.find((exportItem) => exportItem.isGlobalAugmentation);
    expect(globalAug).toBeDefined();
    expect(globalAug!.name).toBe("global");
    expect(globalAug!.kind).toBe(ts.SyntaxKind.ModuleDeclaration);
  });

  it("still captures regular exports in same file", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts")
    );

    const names = exports.filter((exportItem) => !exportItem.isGlobalAugmentation).map((exportItem) => exportItem.name);
    expect(names).toContain("AppState");
    expect(names).toContain("initApp");
  });
});

describe("parseTypeReferenceDirectives", () => {
  it("extracts type reference directives", () => {
    const refs = parseTypeReferenceDirectives(
      path.join(FIXTURES_DIR, "type-ref-directives", "index.d.ts")
    );
    expect(refs).toHaveLength(2);
    expect(refs).toContain("node");
    expect(refs).toContain("express");
  });

  it("returns empty for files without type reference directives", () => {
    const refs = parseTypeReferenceDirectives(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts")
    );
    expect(refs).toHaveLength(0);
  });
});

describe("export import = require() (Pattern 17)", () => {
  it("parses export import X = require(...)", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "export-import-equals", "index.d.ts")
    );

    const importEquals = exports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.ImportEqualsDeclaration
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

    const names = exports.map((exportItem) => exportItem.name);
    expect(names).toContain("util");
    expect(names).toContain("mainFn");
    expect(names).toContain("MainConfig");
  });
});

describe("visibility tags (@public, @internal, @alpha, @beta)", () => {
  it("detects @public tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const pub = exports.find((exportItem) => exportItem.name === "PublicAPI");
    expect(pub).toBeDefined();
    expect(pub!.visibility).toBe("public");
  });

  it("detects @internal tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const internal = exports.find((exportItem) => exportItem.name === "_internalHelper");
    expect(internal).toBeDefined();
    expect(internal!.visibility).toBe("internal");
  });

  it("detects @alpha tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const alpha = exports.find((exportItem) => exportItem.name === "AlphaFeature");
    expect(alpha).toBeDefined();
    expect(alpha!.visibility).toBe("alpha");
  });

  it("detects @beta tag", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const beta = exports.find((exportItem) => exportItem.name === "betaFunction");
    expect(beta).toBeDefined();
    expect(beta!.visibility).toBe("beta");
  });

  it("has no visibility for untagged symbols", () => {
    const exports = parseExports(
      path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts")
    );
    const defaultVal = exports.find((exportItem) => exportItem.name === "DEFAULT_VALUE");
    expect(defaultVal).toBeDefined();
    expect(defaultVal!.visibility).toBeUndefined();
  });
});

describe("parseImports", () => {
  it("extracts various import patterns from a file", () => {
    const imports = parseImports(
      path.join(FIXTURES_DIR, "import-cases", "index.d.ts")
    );

    const sources = imports.map((importItem) => importItem.source);
    expect(sources).toContain("./handlers");
    expect(sources).toContain("./utils");
    expect(sources).toContain("./default");

    const defaultImport = imports.find((importItem) => importItem.isDefault);
    expect(defaultImport).toBeDefined();

    const namespaceImport = imports.find((importItem) => importItem.isNamespace);
    expect(namespaceImport).toBeDefined();
  });

  it("getFileSource returns a valid ts.SourceFile for a given path", () => {
    const filePath = path.join(FIXTURES_DIR, "import-cases", "index.d.ts");
    const sourceFile = getFileSource(filePath);
    expect(sourceFile).toBeDefined();
    expect(sourceFile.fileName).toContain("index.d.ts");
  });

  it("handles default export of literal values and complex expressions", () => {
    const tmpFile = makeTmpFile("literal-export");
    fs.writeFileSync(tmpFile, "export default 123;");

    try {
      const exports = parseExports(tmpFile);
      const defaultExport = exports.find(exportItem => exportItem.name === "default");
      expect(defaultExport).toBeDefined();
      expect(defaultExport?.kindName).toBe("ExportAssignment");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("extracts type references from export specifiers", () => {
    const tmpFile = makeTmpFile("export-specifier-refs");
    fs.writeFileSync(tmpFile, "type Foo = string; export { Foo };");

    try {
      const exports = parseExports(tmpFile);
      const specifier = exports.find(exportItem => exportItem.name === "Foo");
      expect(specifier).toBeDefined();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("handles various JSDoc deprecated tag formats and complex type references", () => {
    const tmpFile = makeTmpFile("jsdoc-deprecated");
    fs.writeFileSync(tmpFile, `
      /** @deprecated */
      export interface DepImplicit {}
      
      /** @deprecated \t\n */
      export interface DepWhitespace {}
      
      export interface Complex extends Array<string | number> {}
    `);

    try {
      const exports = parseExports(tmpFile);
      expect(exports.some(exportItem => exportItem.name === "DepImplicit" && exportItem.deprecated === true)).toBe(true);
      expect(exports.some(exportItem => exportItem.name === "DepWhitespace" && exportItem.deprecated === true)).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });


  it("handles identifier-based and anonymous default exports, and complex references", () => {
    const tmpFile = makeTmpFile("parser-edge");
    fs.writeFileSync(tmpFile, `
      const myRef = "test";
      export default myRef;
      
      export default { key: 'value' };
      
      export type { MyType } from './mod';
      export * as ns from './mod';
      
      type T = import("pkg").Namespace.Type;
      
      interface I extends Namespace.Base {}
      
      import X = require("pkg");
    `);

    try {
      const exports = parseExports(tmpFile);
      const imports = parseImports(tmpFile);

      expect(exports.some(exportItem => exportItem.name === "myRef")).toBe(true);
      expect(exports.some(exportItem => exportItem.name === "ns")).toBe(true);
      expect(exports.some(exportItem => exportItem.name === "default")).toBe(true);
      expect(imports.some(importItem => importItem.name === "X")).toBe(true);

      const refs = extractTypeReferences(getFileSource(tmpFile));
      expect(refs.some(reference => reference.name === "Type")).toBe(true);
      expect(refs.some(reference => reference.name === "Base")).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
  it("extracts @since tags from various export forms", () => {
    const fixturePath = path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts");
    const exports = parseExports(fixturePath);

    // Direct declaration
    const publicAPI = exports.find(exportItem => exportItem.name === "PublicAPI");
    expect(publicAPI).toBeDefined();
    expect(publicAPI!.since).toBe("1.0.0");

    // Function declaration
    const betaFunction = exports.find(exportItem => exportItem.name === "betaFunction");
    expect(betaFunction).toBeDefined();
    expect(betaFunction!.since).toBe("2.1.0");

    const alphaFeature = exports.find(exportItem => exportItem.name === "AlphaFeature");
    expect(alphaFeature).toBeDefined();
    expect(alphaFeature!.since).toBeUndefined();

    // Namespace re-export (the Arbitrary case)
    const tmpFile = makeTmpFile("jsdoc-since-namespace");
    fs.writeFileSync(tmpFile, `
      /** @since 3.10.0 */
      export * as NS from './mod';
    `);

    try {
      const parsedExports = parseExports(tmpFile);
      const nsExport = parsedExports.find(exportItem => exportItem.name === "NS");
      expect(nsExport?.since).toBe("3.10.0");
    } finally {
      fs.unlinkSync(tmpFile);
    }

    // Named re-export
    const tmpFile2 = makeTmpFile("jsdoc-since-named");
    fs.writeFileSync(tmpFile2, `
      /** @since 4.0.0 */
      export { exportedVal } from './mod';
    `);

    try {
      const parsedExports = parseExports(tmpFile2);
      const valExport = parsedExports.find(exportItem => exportItem.name === "exportedVal");
      expect(valExport?.since).toBe("4.0.0");
    } finally {
      fs.unlinkSync(tmpFile2);
    }
  });

  it("extracts @since from interface declarations", () => {
    const tmpFile = makeTmpFile("jsdoc-since-interface");
    fs.writeFileSync(tmpFile, `
      /** @since 2.0.0 */
      export interface MyInterface {
        name: string;
      }
    `);

    try {
      const exports = parseExports(tmpFile);
      const myIntf = exports.find(exportItem => exportItem.name === "MyInterface");
      expect(myIntf?.since).toBe("2.0.0");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("extracts @since from variable exports", () => {
    const tmpFile = makeTmpFile("jsdoc-since-variable");
    fs.writeFileSync(tmpFile, `
      /** @since 2.0.0 */
      export declare const myVar: string;
    `);

    try {
      const exports = parseExports(tmpFile);
      const myVar = exports.find(exportItem => exportItem.name === "myVar");
      expect(myVar?.since).toBe("2.0.0");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("inherits @since from parent in TypeLiteral members", () => {
    const tmpFile = makeTmpFile("jsdoc-since-inheritance");
    fs.writeFileSync(tmpFile, `
      /** @since 1.5.0 */
      export declare const Parent: {
        /** Simple comment without the since tag anywhere */
        child: string;
      };
    `);

    try {
      const exports = parseExports(tmpFile);
      const child = exports.find(exportItem => exportItem.name === "Parent.child");
      expect(child).toBeDefined();
      expect(child!.since).toBe("1.5.0");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
