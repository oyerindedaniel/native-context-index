import { describe, it, expect } from "vitest";
import path from "node:path";
import ts from "typescript";
import {
  parseFile,
  parseFileFromSource,
  extractTypeReferences,
  getFileSource,
} from "./parser.js";
import type { ParsedExport } from "./types.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("parseExports — Patterns 1-17", () => {
  const allExportFormsPath = path.join(
    FIXTURES_DIR,
    "all-export-forms",
    "index.d.ts",
  );
  const { exports: allExports } = parseFile(allExportFormsPath);
  const findExport = (name: string) =>
    allExports.find((exportItem) => exportItem.name === name);

  // ─── Pattern 1: export interface ─────────────────────────────
  it("Pattern 1: parses exported interface", () => {
    const configExport = findExport("Config");
    expect(configExport).toBeDefined();
    expect(configExport!.kind).toBe(ts.SyntaxKind.InterfaceDeclaration);
    expect(configExport!.kindName).toBe("InterfaceDeclaration");
    expect(configExport!.isTypeOnly).toBe(true);
    expect(configExport!.source).toBeUndefined();
  });

  // ─── Pattern 2: export type alias ────────────────────────────
  it("Pattern 2: parses exported type alias", () => {
    const statusExport = findExport("Status");
    expect(statusExport).toBeDefined();
    expect(statusExport!.kind).toBe(ts.SyntaxKind.TypeAliasDeclaration);
    expect(statusExport!.kindName).toBe("TypeAliasDeclaration");
    expect(statusExport!.isTypeOnly).toBe(true);
  });

  // ─── Pattern 3: export function ──────────────────────────────
  it("Pattern 3: parses exported function with JSDoc", () => {
    const initFn = findExport("init");
    expect(initFn).toBeDefined();
    expect(initFn!.kind).toBe(ts.SyntaxKind.FunctionDeclaration);
    expect(initFn!.kindName).toBe("FunctionDeclaration");
    expect(initFn!.isTypeOnly).toBe(false);
    expect(initFn!.jsDoc).toContain("Initialize the application");
  });

  // ─── Pattern 4: export class ─────────────────────────────────
  it("Pattern 4: parses exported class", () => {
    const classExports = allExports.filter(
      (exportItem) =>
        exportItem.name === "Server" &&
        exportItem.kind === ts.SyntaxKind.ClassDeclaration,
    );
    expect(classExports.length).toBeGreaterThanOrEqual(1);
    expect(classExports[0]!.kindName).toBe("ClassDeclaration");
    expect(classExports[0]!.isTypeOnly).toBe(false);
  });

  // ─── Pattern 5: export const ─────────────────────────────────
  it("Pattern 5: parses exported variable/const", () => {
    const versionConst = findExport("VERSION");
    expect(versionConst).toBeDefined();
    expect(versionConst!.kind).toBe(ts.SyntaxKind.VariableStatement);
    expect(versionConst!.kindName).toBe("VariableStatement");
    expect(versionConst!.signature).toContain("string");
  });

  // ─── Pattern 6: export enum ──────────────────────────────────
  it("Pattern 6: parses exported enum", () => {
    const logEnum = findExport("LogLevel");
    expect(logEnum).toBeDefined();
    expect(logEnum!.kind).toBe(ts.SyntaxKind.EnumDeclaration);
    expect(logEnum!.kindName).toBe("EnumDeclaration");
    expect(logEnum!.isTypeOnly).toBe(false);
  });

  // ─── Pattern 7: export { X } (Local Named Export) ───────────
  it("Pattern 7: parses local named export", () => {
    const localExportPath = path.join(
      FIXTURES_DIR,
      "local-export",
      "index.d.ts",
    );
    const { exports: localExports } = parseFile(localExportPath);
    const localItem = localExports.find(
      (exportItem) => exportItem.name === "Local",
    );
    expect(localItem).toBeDefined();
    expect(localItem!.source).toBeUndefined(); // Local
  });

  // ─── Pattern 8: export { X } from "./other" ──────────────────
  it("Pattern 8: parses named re-export", () => {
    const handlerExport = findExport("Handler");
    expect(handlerExport).toBeDefined();
    expect(handlerExport!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(handlerExport!.source).toBe("./handlers.js");
    expect(handlerExport!.isWildcard).toBeFalsy();
    expect(handlerExport!.originalName).toBeUndefined();
    expect(handlerExport!.signature).toBe(
      "export { Handler } from './handlers.js'",
    );
  });

  // ─── Pattern 9: export { X as Y } from "./other" ─────────────
  it("Pattern 9: parses aliased re-export", () => {
    const routerExport = findExport("Router");
    expect(routerExport).toBeDefined();
    expect(routerExport!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(routerExport!.source).toBe("./internal.js");
    expect(routerExport!.originalName).toBe("InternalRouter");
    expect(routerExport!.signature).toBe(
      "export { InternalRouter as Router } from './internal.js'",
    );
  });

  // ─── Pattern 10: export * from "./barrel" ────────────────────
  it("Pattern 10: parses wildcard re-export", () => {
    const wildcards = allExports.filter((exportItem) => exportItem.isWildcard);
    expect(wildcards.length).toBeGreaterThanOrEqual(1);

    const utilsWildcard = wildcards.find(
      (exportItem) => exportItem.source === "./utils.js",
    );
    expect(utilsWildcard).toBeDefined();
    expect(utilsWildcard!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
  });

  // ─── Pattern 11: export * as ns from "./mod" ──────────────────
  it("Pattern 11: parses namespace re-export", () => {
    const helpersExport = findExport("helpers");
    expect(helpersExport).toBeDefined();
    expect(helpersExport!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(helpersExport!.source).toBe("./helpers.js");
    expect(helpersExport!.isNamespaceExport).toBe(true);
  });

  // ─── Pattern 12: export type { Foo } from "./other" ──────────
  it("Pattern 12: parses type-only re-export", () => {
    const optionsExport = findExport("RequestOptions");
    expect(optionsExport).toBeDefined();
    expect(optionsExport!.kind).toBe(ts.SyntaxKind.ExportDeclaration);
    expect(optionsExport!.source).toBe("./options.js");
    expect(optionsExport!.isTypeOnly).toBe(true);
    expect(optionsExport!.signature).toBe(
      "export type { RequestOptions } from './options.js'",
    );
  });

  // ─── Pattern 13: export default ──────────────────────────────
  it("Pattern 13: parses default export", () => {
    const defaultExport = allExports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.ExportAssignment,
    );
    expect(defaultExport).toBeDefined();
    expect(defaultExport!.name).toBe("Server");
    expect(defaultExport!.kindName).toBe("ExportAssignment");
  });

  // ─── Pattern 14: export = (CJS) ─────────────────────────────
  it("Pattern 14: parses CJS-style export =", () => {
    const cjsExports = parseFile(
      path.join(FIXTURES_DIR, "cjs-export", "index.d.ts"),
    ).exports;
    const assignment = cjsExports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.ExportAssignment,
    );
    expect(assignment).toBeDefined();
    expect(assignment!.name).toBe("MyLib");
    expect(assignment!.signature).toContain("export =");
  });

  describe("Structured Modifiers", () => {
    it("extracts abstract, readonly, and static modifiers from classes", () => {
      const source = `
        export abstract class Service {
          public static readonly VERSION = "1.0";
          protected abstract init(): void;
        }
      `;
      const sourceFile = ts.createSourceFile(
        "a.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const result = parseFileFromSource(sourceFile);

      const serviceClass = result.exports.find(
        (exportEntry) => exportEntry.name === "Service",
      )!;
      expect(serviceClass.modifiers).toContain("abstract");
      expect(serviceClass.modifiers).toContain("export");

      const versionProp = result.exports.find(
        (exportEntry) => exportEntry.name === "Service.VERSION",
      )!;
      expect(versionProp.modifiers).toContain("public");
      expect(versionProp.modifiers).toContain("static");
      expect(versionProp.modifiers).toContain("readonly");

      const initMethod = result.exports.find(
        (exportEntry) => exportEntry.name === "Service.prototype.init",
      )!;
      expect(initMethod.modifiers).toContain("protected");
      expect(initMethod.modifiers).toContain("abstract");
    });

    it("extracts readonly and optional from interfaces", () => {
      const source = `
        export interface Config {
          readonly endpoint: string;
          apiKey?: string;
        }
      `;
      const sourceFile = ts.createSourceFile(
        "a.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const result = parseFileFromSource(sourceFile);

      const endpointProp = result.exports.find(
        (exportEntry) => exportEntry.name === "Config.endpoint",
      )!;
      expect(endpointProp.modifiers).toContain("readonly");
    });

    it("extracts getters and setters from interfaces", () => {
      const source = `
        export interface AccessorTest {
          get prop(): string;
          set prop(value: string);
        }
      `;
      const sourceFile = ts.createSourceFile(
        "a.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const result = parseFileFromSource(sourceFile);

      const getter = result.exports.find(
        (exportEntry) =>
          exportEntry.name === "AccessorTest.prop" &&
          exportEntry.kind === ts.SyntaxKind.GetAccessor,
      );
      const setter = result.exports.find(
        (exportEntry) =>
          exportEntry.name === "AccessorTest.prop" &&
          exportEntry.kind === ts.SyntaxKind.SetAccessor,
      );

      expect(getter).toBeDefined();
      expect(setter).toBeDefined();
      expect(getter!.signature).toBe("get prop(): string;");
      expect(setter!.signature).toBe("set prop(value: string);");
    });
  });
  // ─── Pattern 15: declare module "name" ────────────────────────
  it("Pattern 15: parses ambient module declaration", () => {
    const pluginModule = findExport("my-plugin");
    expect(pluginModule).toBeDefined();
    expect(pluginModule!.kind).toBe(ts.SyntaxKind.ModuleDeclaration);
    expect(pluginModule!.kindName).toBe("ModuleDeclaration");
    expect(pluginModule!.signature).toContain("declare module");
  });

  it("extracts all expected exports from the large all-patterns fixture", () => {
    const exportNames = allExports.map((exportItem) => exportItem.name);

    expect(exportNames).toContain("Config");
    expect(exportNames).toContain("Status");
    expect(exportNames).toContain("init");
    expect(exportNames).toContain("VERSION");
    expect(exportNames).toContain("LogLevel");
    expect(exportNames).toContain("Handler");
    expect(exportNames).toContain("Router");
    expect(exportNames).toContain("helpers");
    expect(exportNames).toContain("RequestOptions");
    expect(allExports.some((exportItem) => exportItem.isWildcard)).toBe(true);
  });
});

describe("parseTripleSlashReferences & parseTypeReferenceDirectives", () => {
  it("parseTripleSlashReferences: extracts reference paths accurately", () => {
    const { references: referencePaths } = parseFile(
      path.join(FIXTURES_DIR, "triple-slash-refs", "index.d.ts"),
    );
    expect(referencePaths).toHaveLength(2);
    expect(referencePaths).toContain("./globals.d.ts");
    expect(referencePaths).toContain("./utils.d.ts");
  });

  it("parseTripleSlashReferences: returns empty array for a file with no references", () => {
    const { references: referencePaths } = parseFile(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts"),
    );
    expect(referencePaths).toHaveLength(0);
  });

  it("parseTypeReferenceDirectives: extracts directives accurately", () => {
    const { typeReferences: directives } = parseFile(
      path.join(FIXTURES_DIR, "type-ref-directives", "index.d.ts"),
    );
    expect(directives).toHaveLength(2);
    expect(directives).toContain("node");
    expect(directives).toContain("express");
  });

  it("parseTypeReferenceDirectives: returns empty for files without directives", () => {
    const { typeReferences: directives } = parseFile(
      path.join(FIXTURES_DIR, "simple-export", "index.d.ts"),
    );
    expect(directives).toHaveLength(0);
  });
});

describe("parseImports — Integration Verification", () => {
  it("extracts all import patterns correctly", () => {
    const { imports: allImports } = parseFile(
      path.join(FIXTURES_DIR, "import-cases", "index.d.ts"),
    );

    const importSources = allImports.map((importItem) => importItem.source);
    expect(importSources).toContain("./handlers");
    expect(importSources).toContain("./utils");
    expect(importSources).toContain("./default");

    const hasDefault = allImports.some((importItem) => importItem.isDefault);
    expect(hasDefault).toBe(true);

    const hasNamespace = allImports.some(
      (importItem) => importItem.isNamespace,
    );
    expect(hasNamespace).toBe(true);
  });
});

describe("extractTypeReferences — Detailed Extraction Logic", () => {
  it("extracts custom type references from interfaces", () => {
    const typeSource = `
      interface Logger {
        config: Config;
        level: LogLevel;
      }
    `;
    const sourceFile = ts.createSourceFile(
      "test.d.ts",
      typeSource,
      ts.ScriptTarget.Latest,
      true,
    );
    const interfaceNode = sourceFile.statements[0]!;
    const referenceNames = extractTypeReferences(interfaceNode).map(
      (reference) => reference.name,
    );

    expect(referenceNames).toContain("Config");
    expect(referenceNames).toContain("LogLevel");
  });

  it("filters out built-in primitive types and generic containers", () => {
    const primitivesSource = `
      interface Foo {
        name: string;
        count: number;
        ok: boolean;
        data: Array<CustomType>;
        cb: Promise<Result>;
      }
    `;
    const sourceFile = ts.createSourceFile(
      "test.d.ts",
      primitivesSource,
      ts.ScriptTarget.Latest,
      true,
    );
    const interfaceNode = sourceFile.statements[0]!;
    const referenceNames = extractTypeReferences(interfaceNode).map(
      (reference) => reference.name,
    );

    expect(referenceNames).not.toContain("string");
    expect(referenceNames).not.toContain("number");
    expect(referenceNames).not.toContain("boolean");
    expect(referenceNames).not.toContain("Array");
    expect(referenceNames).not.toContain("Promise");

    expect(referenceNames).toContain("CustomType");
    expect(referenceNames).toContain("Result");
  });

  it("returns empty array for declarations without any custom references", () => {
    const emptySource = `interface Empty { name: string; }`;
    const sourceFile = ts.createSourceFile(
      "test.d.ts",
      emptySource,
      ts.ScriptTarget.Latest,
      true,
    );
    const interfaceNode = sourceFile.statements[0]!;
    const referenceNames = extractTypeReferences(interfaceNode).map(
      (reference) => reference.name,
    );

    expect(referenceNames).toHaveLength(0);
  });

  it("keeps qualified names for typeof namespace member queries", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "qualified-type-query-namespace-member",
        "index.d.ts",
      ),
    );
    const readConfig = parsed.exports.find(
      (exportItem) => exportItem.name === "readConfig",
    );
    expect(readConfig).toBeDefined();
    const dependencyNames =
      readConfig?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("provider.readConfig");
  });

  it("extracts generic default type parameter references", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "generic-default-type-parameter-deps",
        "index.d.ts",
      ),
    );
    const handler = parsed.exports.find(
      (exportItem) => exportItem.name === "RequestHandler",
    );
    expect(handler).toBeDefined();
    const dependencyNames =
      handler?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("ParamsShape");
    expect(dependencyNames).toContain("QueryShape");
  });

  it("extracts function generic default type parameter references", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "function-generic-default-type-parameter-deps",
        "index.d.ts",
      ),
    );
    const usePagedQuery = parsed.exports.find(
      (exportItem) => exportItem.name === "usePagedQuery",
    );
    expect(usePagedQuery).toBeDefined();
    const dependencyNames =
      usePagedQuery?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("core.DefaultError");
    expect(dependencyNames).toContain("core.InfiniteData");
    expect(dependencyNames).toContain("core.QueryKey");
    expect(dependencyNames).toContain("core.RequestOptions");
    expect(dependencyNames).toContain("core.Client");
    expect(dependencyNames).toContain("core.RequestResult");
    expect(dependencyNames).not.toContain("TData");
    expect(dependencyNames).not.toContain("TError");
    expect(dependencyNames).not.toContain("TResult");
    expect(dependencyNames).not.toContain("TKey");
  });

  it("tracks interface generic defaults and excludes generic placeholders", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "interface-wrapper-generic-default-deps",
        "index.d.ts",
      ),
    );
    const handler = parsed.exports.find(
      (exportItem) => exportItem.name === "wrapper.Handler",
    );
    expect(handler).toBeDefined();
    const dependencyNames =
      handler?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("core.Handler");
    expect(dependencyNames).toContain("core.ParamsShape");
    expect(dependencyNames).toContain("core.QueryShape");
    expect(dependencyNames).not.toContain("Params");
    expect(dependencyNames).not.toContain("Query");
    expect(dependencyNames).not.toContain("LocalsType");
  });

  it("filters placeholder-derived refs while preserving concrete intersections", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "generic-intersection-placeholder-filtering",
        "index.d.ts",
      ),
    );
    const carrier = parsed.exports.find(
      (exportItem) => exportItem.name === "Carrier",
    );
    expect(carrier).toBeDefined();
    const dependencyNames =
      carrier?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("ConcreteLeft");
    expect(dependencyNames).toContain("ConcreteRight");
    expect(dependencyNames).toContain("Slot");
    expect(dependencyNames).not.toContain("GenericParam");
    expect(dependencyNames).not.toContain("GenericParam.field");
  });

  it("extracts ambient qualified generic constraints from method signatures", () => {
    const parsed = parseFile(
      path.join(
        FIXTURES_DIR,
        "ambient-qualified-constraint-deps",
        "index.d.ts",
      ),
    );
    const streamBridge = parsed.exports.find(
      (exportItem) => exportItem.name === "StreamBridge",
    );
    expect(streamBridge).toBeDefined();
    const dependencyNames =
      streamBridge?.dependencies?.map((reference) => reference.name) ?? [];
    expect(dependencyNames).toContain("NodeJS.WritableStream");
    expect(dependencyNames).toContain("LocalSink");
  });
});

describe("parseExports dependencies — Relationship Tracking", () => {
  it("populates structured dependencies from the deps-pkg fixture", () => {
    const { exports: depsExports } = parseFile(
      path.join(FIXTURES_DIR, "deps-pkg", "index.d.ts"),
    );

    const loggerExport = depsExports.find(
      (exportItem) => exportItem.name === "Logger",
    );
    expect(loggerExport).toBeDefined();
    expect(loggerExport!.dependencies).toBeDefined();
    const loggerDepNames = loggerExport!.dependencies!.map(
      (reference) => reference.name,
    );
    expect(loggerDepNames).toContain("Config");
    expect(loggerDepNames).toContain("LogLevel");

    const createFnExport = depsExports.find(
      (exportItem) => exportItem.name === "createLogger",
    );
    expect(createFnExport).toBeDefined();
    expect(createFnExport!.dependencies).toBeDefined();
    const createFnDepNames = createFnExport!.dependencies!.map(
      (reference) => reference.name,
    );
    expect(createFnDepNames).toContain("Config");
    expect(createFnDepNames).toContain("Logger");

    const configExport = depsExports.find(
      (exportItem) => exportItem.name === "Config",
    );
    expect(configExport).toBeDefined();
    expect(configExport!.dependencies).toEqual([]);
  });
});

describe("deprecation detection — Reliability", () => {
  it("detects @deprecated with a custom message", () => {
    const { exports: depExports } = parseFile(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts"),
    );

    const oldInitExport = depExports.find(
      (exportItem) => exportItem.name === "oldInit",
    );
    expect(oldInitExport).toBeDefined();
    expect(oldInitExport!.deprecated).toBe("Use newInit instead");
  });

  it("detects @deprecated in boolean mode when no message exists", () => {
    const { exports: depExports } = parseFile(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts"),
    );

    const legacyExport = depExports.find(
      (exportItem) => exportItem.name === "LegacyConfig",
    );
    expect(legacyExport).toBeDefined();
    expect(legacyExport!.deprecated).toBe(true);
  });

  it("ensures modern symbols correctly omit the deprecated field", () => {
    const { exports: depExports } = parseFile(
      path.join(FIXTURES_DIR, "deprecated-exports", "index.d.ts"),
    );

    const newInitExport = depExports.find(
      (exportItem) => exportItem.name === "newInit",
    );
    expect(newInitExport).toBeDefined();
    expect(newInitExport!.deprecated).toBeUndefined();

    const modernConfigExport = depExports.find(
      (exportItem) => exportItem.name === "ModernConfig",
    );
    expect(modernConfigExport).toBeDefined();
    expect(modernConfigExport!.deprecated).toBeUndefined();
  });
});

describe("Namespace handling — UMD, Recursive & Visibility", () => {
  it("Pattern 16: parses 'export as namespace MyLib' (UMD style)", () => {
    const { exports: nsExports } = parseFile(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts"),
    );

    const umdExport = nsExports.find(
      (exportItem) =>
        exportItem.kind === ts.SyntaxKind.NamespaceExportDeclaration,
    );
    expect(umdExport).toBeDefined();
    expect(umdExport!.name).toBe("MyLib");
    expect(umdExport!.kindName).toBe("NamespaceExportDeclaration");
    expect(umdExport!.signature).toBe("export as namespace MyLib");
  });

  it("captures top-level exports in files containing UMD namespaces", () => {
    const { exports: nsExports } = parseFile(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts"),
    );

    const topLevelNames = nsExports.map((exportItem) => exportItem.name);
    expect(topLevelNames).toContain("Widget");
    expect(topLevelNames).toContain("createWidget");
    expect(topLevelNames).toContain("MyLib");
  });

  it("Recursively explores nested namespace members with qualified names", () => {
    const { exports: nsExports } = parseFile(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts"),
    );

    const apiConfig = nsExports.find(
      (exportItem) => exportItem.name === "API.Config",
    );
    expect(apiConfig).toBeDefined();
    expect(apiConfig!.kindName).toBe("InterfaceDeclaration");

    const apiFetch = nsExports.find(
      (exportItem) => exportItem.name === "API.fetch",
    );
    expect(apiFetch).toBeDefined();
    expect(apiFetch!.kindName).toBe("FunctionDeclaration");
  });

  it("accuately detects visibility tags within recursive namespace walks", () => {
    const { exports: nsExports } = parseFile(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts"),
    );
    const apiSecret = nsExports.find(
      (exportItem) => exportItem.name === "API.secret",
    );
    expect(apiSecret).toBeDefined();
    expect(apiSecret!.visibility).toBe("internal");
  });

  it("properly flags unexported namespace members as implicit exports", () => {
    const { exports: nsExports } = parseFile(
      path.join(FIXTURES_DIR, "namespace-cases", "index.d.ts"),
    );
    const apiHidden = nsExports.find(
      (exportItem) => exportItem.name === "API.hidden",
    );
    expect(apiHidden).toBeDefined();
    expect(apiHidden!.isExplicitExport).toBe(false);
  });
});

describe("declare global integration — Augmentation Detection", () => {
  it("Pattern 15+: marks 'declare global' as a global augmentation", () => {
    const { exports: globalExports } = parseFile(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts"),
    );

    const globalNode = globalExports.find(
      (exportItem) => exportItem.isGlobalAugmentation,
    );
    expect(globalNode).toBeDefined();
    expect(globalNode!.name).toBe("global");
    expect(globalNode!.kind).toBe(ts.SyntaxKind.ModuleDeclaration);
  });

  it("captures non-augmentation exports from files with 'declare global'", () => {
    const { exports: globalExports } = parseFile(
      path.join(FIXTURES_DIR, "global-augmentation", "index.d.ts"),
    );

    const siblingNames = globalExports
      .filter((exportItem) => !exportItem.isGlobalAugmentation)
      .map((exportItem) => exportItem.name);
    expect(siblingNames).toContain("AppState");
    expect(siblingNames).toContain("initApp");
  });

  it("extracts members from module-scoped declare global blocks for downstream linking", () => {
    const { exports: globalExports, isExternalModule } = parseFile(
      path.join(
        FIXTURES_DIR,
        "module-global-augmentation-ref",
        "global-types.d.ts",
      ),
    );

    expect(isExternalModule).toBe(true);

    const pickType = globalExports.find(
      (exportItem) => exportItem.name === "PICK_TYPE",
    );
    expect(pickType).toBeDefined();
    expect(pickType!.isGlobalAugmentation).toBe(true);
    expect(pickType!.symbolSpace).toBe("value");

    const globalInterface = globalExports.find(
      (exportItem) => exportItem.name === "MyGlobalType",
    );
    expect(globalInterface).toBeDefined();
    expect(globalInterface!.isGlobalAugmentation).toBe(true);
    expect(globalInterface!.symbolSpace).toBe("type");

    const namespaced = globalExports.find(
      (exportItem) => exportItem.name === "MyNamespace.VERSION",
    );
    expect(namespaced).toBeDefined();
    expect(namespaced!.isGlobalAugmentation).toBe(true);
  });
});

describe("export import = require() — Pattern 17 Implementation", () => {
  it("Pattern 17: parses 'export import X = require(\"path\")'", () => {
    const { exports: equalsExports } = parseFile(
      path.join(FIXTURES_DIR, "export-import-equals", "index.d.ts"),
    );

    const equalsImport = equalsExports.find(
      (exportItem) => exportItem.kind === ts.SyntaxKind.ImportEqualsDeclaration,
    );
    expect(equalsImport).toBeDefined();
    expect(equalsImport!.name).toBe("util");
    expect(equalsImport!.kindName).toBe("ImportEqualsDeclaration");
    expect(equalsImport!.source).toBe("./util");
  });

  it("captures siblingExports alongside export import equals statements", () => {
    const { exports: equalsExports } = parseFile(
      path.join(FIXTURES_DIR, "export-import-equals", "index.d.ts"),
    );

    const exportNames = equalsExports.map((exportItem) => exportItem.name);
    expect(exportNames).toContain("util");
    expect(exportNames).toContain("mainFn");
    expect(exportNames).toContain("MainConfig");
  });
});

describe("Visibility Tag Resolution", () => {
  const { exports: tagsExports } = parseFile(
    path.join(FIXTURES_DIR, "visibility-tags", "index.d.ts"),
  );

  it("detects @public visibility accurately", () => {
    const publicExport = tagsExports.find(
      (exportItem) => exportItem.name === "PublicAPI",
    );
    expect(publicExport).toBeDefined();
    expect(publicExport!.visibility).toBe("public");
  });

  it("detects @internal visibility from JSDoc tags", () => {
    const internalExport = tagsExports.find(
      (exportItem) => exportItem.name === "_internalHelper",
    );
    expect(internalExport).toBeDefined();
    expect(internalExport!.visibility).toBe("internal");
  });

  it("detects @alpha visibility accurately", () => {
    const alphaExport = tagsExports.find(
      (exportItem) => exportItem.name === "AlphaFeature",
    );
    expect(alphaExport).toBeDefined();
    expect(alphaExport!.visibility).toBe("alpha");
  });

  it("detects @beta visibility accurately", () => {
    const betaExport = tagsExports.find(
      (exportItem) => exportItem.name === "betaFunction",
    );
    expect(betaExport).toBeDefined();
    expect(betaExport!.visibility).toBe("beta");
  });

  it("defaults to undefined visibility for untagged declarations", () => {
    const vanillaExport = tagsExports.find(
      (exportItem) => exportItem.name === "DEFAULT_VALUE",
    );
    expect(vanillaExport).toBeDefined();
    expect(vanillaExport!.visibility).toBeUndefined();
  });
});

describe("Structural Stability & Resource Parsing", () => {
  it("getFileSource: returns valid SourceFile for existing path", () => {
    const testPath = path.join(FIXTURES_DIR, "import-cases", "index.d.ts");
    const testSourceFile = getFileSource(testPath);
    expect(testSourceFile).toBeDefined();
    expect(testSourceFile.fileName).toContain("index.d.ts");
  });

  it("handles default export literal values (Corner case)", () => {
    const literalPath = path.join(FIXTURES_DIR, "literal-export", "index.d.ts");
    const { exports: literalExports } = parseFile(literalPath);
    const defaultLiteral = literalExports.find(
      (exportItem) => exportItem.name === "default",
    );
    expect(defaultLiteral).toBeDefined();
    expect(defaultLiteral?.kindName).toBe("ExportAssignment");
  });

  it("handles export specifier type reference extraction correctly", () => {
    const specifierPath = path.join(
      FIXTURES_DIR,
      "export-specifier-refs",
      "index.d.ts",
    );
    const { exports: specifierExports } = parseFile(specifierPath);
    const fooExport = specifierExports.find(
      (exportItem) => exportItem.name === "Foo",
    );
    expect(fooExport).toBeDefined();
  });

  it("detects multiple JSDoc @deprecated formats across declaration types", () => {
    const formatsPath = path.join(
      FIXTURES_DIR,
      "jsdoc-deprecated",
      "index.d.ts",
    );
    const { exports: formatsExports } = parseFile(formatsPath);
    expect(
      formatsExports.some(
        (exportItem) =>
          exportItem.name === "DepImplicit" && exportItem.deprecated === true,
      ),
    ).toBe(true);
    expect(
      formatsExports.some(
        (exportItem) =>
          exportItem.name === "DepWithMessage" &&
          exportItem.deprecated === "With a message",
      ),
    ).toBe(true);
  });

  it("verifies anonymous and identifier-based default exports with complex lookups", () => {
    const complexityPath = path.join(
      FIXTURES_DIR,
      "parser-edge-case",
      "index.d.ts",
    );
    const { exports: complexExports, imports: complexImports } =
      parseFile(complexityPath);

    expect(
      complexExports.some((exportItem) => exportItem.name === "localRef"),
    ).toBe(true);
    expect(
      complexExports.some(
        (exportItem) => exportItem.name === "namespacedImport",
      ),
    ).toBe(true);
    expect(
      complexExports.some((exportItem) => exportItem.name === "default"),
    ).toBe(true);
    expect(
      complexImports.some((importItem) => importItem.name === "Equal"),
    ).toBe(true);

    const typeRefNames = extractTypeReferences(
      getFileSource(complexityPath),
    ).map((reference) => reference.name);
    expect(typeRefNames).toContain("Type");
    expect(typeRefNames).toContain("External.Base");
  });

  it("verifies @since tag propagation across various export syntax forms", () => {
    const fixturePath = path.join(
      FIXTURES_DIR,
      "visibility-tags",
      "index.d.ts",
    );
    const { exports: taggedExports } = parseFile(fixturePath);

    const publicNode = taggedExports.find(
      (exportItem) => exportItem.name === "PublicAPI",
    );
    expect(publicNode?.since).toBe("1.0.0");

    const betaNode = taggedExports.find(
      (exportItem) => exportItem.name === "betaFunction",
    );
    expect(betaNode?.since).toBe("2.1.0");

    const nestingPath = path.join(FIXTURES_DIR, "since-nesting", "index.d.ts");
    const { exports: nestExports } = parseFile(nestingPath);
    expect(
      nestExports.find((exportItem) => exportItem.name === "NS")?.since,
    ).toBe("3.10.0");

    const reexportPath = path.join(
      FIXTURES_DIR,
      "since-reexport",
      "index.d.ts",
    );
    const { exports: reExports } = parseFile(reexportPath);
    expect(
      reExports.find((exportItem) => exportItem.name === "val")?.since,
    ).toBe("4.0.0");
  });

  it("extracts @since from interface and variable declarations accurately", () => {
    const declPath = path.join(FIXTURES_DIR, "since-decl", "index.d.ts");
    const { exports: declExports } = parseFile(declPath);
    expect(
      declExports.find((exportItem) => exportItem.name === "I")?.since,
    ).toBe("2.0.0");
    expect(
      declExports.find((exportItem) => exportItem.name === "V")?.since,
    ).toBe("2.1.0");
  });

  it("verifies JSDoc @since inheritance for complex object member extraction", () => {
    const inheritancePath = path.join(
      FIXTURES_DIR,
      "since-inheritance",
      "index.d.ts",
    );
    const { exports: inheritExports } = parseFile(inheritancePath);
    const poolNode = inheritExports.find(
      (exportItem) => exportItem.name === "Database.pool",
    );
    expect(poolNode).toBeDefined();
    expect(poolNode!.since).toBe("1.5.0");
  });

  it("Static Member Extraction: extracts static members with correct metadata from class declarations", () => {
    const staticsPath = path.join(FIXTURES_DIR, "class-statics", "index.d.ts");
    const { exports: staticExports } = parseFile(staticsPath);

    const maxSizeItem = staticExports.find(
      (exportItem) => exportItem.name === "Cache.maxSize",
    );
    expect(maxSizeItem).toBeDefined();
    expect(maxSizeItem!.since).toBe("1.1.0");
    expect(maxSizeItem!.visibility).toBe("public");

    const clearMethod = staticExports.find(
      (exportItem) => exportItem.name === "Cache.clear",
    );
    expect(clearMethod?.since).toBe("1.0.0"); // Class-level inheritance

    const internalField = staticExports.find(
      (exportItem) => exportItem.name === "Cache._internalHelper",
    );
    expect(internalField?.visibility).toBe("internal");

    const instanceGet = staticExports.find(
      (exportItem) => exportItem.name === "Cache.get",
    );
    expect(instanceGet).toBeUndefined(); // Instance members are filtered out here
  });

  it("Prototype Member Extraction: extracts prototype members with correct metadata as expected by the crawling engine", () => {
    const instancesPath = path.join(
      FIXTURES_DIR,
      "class-instance",
      "index.d.ts",
    );
    const { exports: instanceExports } = parseFile(instancesPath);

    const nameProp = instanceExports.find(
      (exportItem) => exportItem.name === "User.prototype.name",
    );
    expect(nameProp?.since).toBe("1.1.0");

    const greetMethod = instanceExports.find(
      (exportItem) => exportItem.name === "User.prototype.greet",
    );
    expect(greetMethod?.since).toBe("1.2.0");

    const internalMethod = instanceExports.find(
      (exportItem) => exportItem.name === "User.prototype._internalMethod",
    );
    expect(internalMethod?.visibility).toBe("internal");

    const factoryMethod = instanceExports.find(
      (exportItem) => exportItem.name === "User.create",
    );
    expect(factoryMethod).toBeDefined(); // Statics are still collected

    const explicitConstructor = instanceExports.find(
      (exportItem) => exportItem.name === "User.prototype.constructor",
    );
    expect(explicitConstructor).toBeUndefined(); // Constructors are explicitly omitted
  });

  describe("Type Reference Extraction Architecture", () => {
    it("handles complex extension expressions gracefully (non-identifier/non-property access)", () => {
      const complexInheritance = `
        class Base { static x = 1; }
        class Sub extends (Base) {}
      `;
      const sourceFile = ts.createSourceFile(
        "test.d.ts",
        complexInheritance,
        ts.ScriptTarget.Latest,
        true,
      );
      const subClass = sourceFile.statements[1] as ts.ClassDeclaration;
      const heritageClause = subClass.heritageClauses![0]!;
      const extensionExpr = heritageClause.types[0]!;

      const refs = extractTypeReferences(extensionExpr);
      // Even if we can't extract a name from (Base), we should traverse children or return gracefully
      expect(refs).toBeDefined();
    });

    it("continues traversal when encountering an expression with type arguments that isn't a simple name", () => {
      // else { ts.forEachChild(child, visit); return; }
      const nestedRef = `
        interface Foo extends Bar<T> {}
      `;
      const sourceFile = ts.createSourceFile(
        "test.d.ts",
        nestedRef,
        ts.ScriptTarget.Latest,
        true,
      );
      const interfaceNode = sourceFile.statements[0]!;
      const refs = extractTypeReferences(interfaceNode);
      expect(refs.some((reference) => reference.name === "Bar")).toBe(true);
    });
  });

  describe("Advanced Composition — Object Spreads & Mixins", () => {
    it("resolves members from object spreads using typeof and intersections", () => {
      const { exports: spreadExports } = parseFile(
        path.join(FIXTURES_DIR, "object-spread", "index.d.ts"),
      );

      // Check Utils.base (inherited from Base via typeof)
      const baseProperty = spreadExports.find(
        (exportItem) => exportItem.name === "Utils.base",
      );
      expect(baseProperty).toBeDefined();
      expect(baseProperty!.since).toBe("1.1.0");

      // Check Utils.extra (added via intersection)
      const extraProperty = spreadExports.find(
        (exportItem) => exportItem.name === "Utils.extra",
      );
      expect(extraProperty).toBeDefined();
      expect(extraProperty!.since).toBe("2.1.0");
    });

    it("recursively resolves deeply nested composition spreads", () => {
      const { exports: spreadExports } = parseFile(
        path.join(FIXTURES_DIR, "object-spread", "index.d.ts"),
      );

      const leafProperty = spreadExports.find(
        (exportItem) => exportItem.name === "Deep.level1.level2.leaf",
      );
      expect(leafProperty).toBeDefined();

      const nestedBase = spreadExports.find(
        (exportItem) => exportItem.name === "Deep.level1.level2.base",
      );
      expect(nestedBase).toBeDefined();
      expect(nestedBase!.since).toBe("1.1.0");
    });

    it("extracts members from synthetic class-level mixin intersections", () => {
      const { exports: mixinExports } = parseFile(
        path.join(FIXTURES_DIR, "mixin-composition", "index.d.ts"),
      );

      // Check Mixed.staticExtra
      const staticExtra = mixinExports.find(
        (exportItem) => exportItem.name === "Mixed.staticExtra",
      );
      expect(staticExtra).toBeDefined();
      expect(staticExtra!.since).toBe("2.1.0");

      // Check Mixed.prototype.mixinMethod (merged from synthetic prototype property)
      const mixinMethod = mixinExports.find(
        (exportItem) => exportItem.name === "Mixed.prototype.mixinMethod",
      );
      expect(mixinMethod).toBeDefined();
      expect(mixinMethod!.since).toBe("2.2.0");

      // Check Mixed.baseMethod (inherited from Base via typeof)
      const baseMethod = mixinExports.find(
        (exportItem) => exportItem.name === "Mixed.baseMethod",
      );
      expect(baseMethod).toBeDefined();
      expect(baseMethod!.since).toBe("1.0.0");
    });
  });

  describe("Computed Property Resolution", () => {
    it("extracts members with Symbol-based and literal computed keys accurately", () => {
      const { exports } = parseFile(
        path.join(FIXTURES_DIR, "computed-properties", "index.d.ts"),
      );

      const iterator = exports.find(
        (exportItem) => exportItem.name === "Iterable.[Symbol.iterator]",
      );
      expect(iterator).toBeDefined();
      expect(iterator?.since).toBe("1.1.0");

      // Interface members are NOT extracted as standalone symbols — only class and variable type members are
      const toStringTag = exports.find(
        (exportItem) =>
          exportItem.name === "Tagged.prototype.[Symbol.toStringTag]",
      );
      expect(toStringTag).toBeDefined();
      expect(toStringTag?.since).toBe("2.1.0");

      const literalKey = exports.find(
        (exportItem) => exportItem.name === "Literals.literal-key",
      );
      expect(literalKey).toBeDefined();
      expect(literalKey?.since).toBe("3.1.0");
    });

    it("handles overloads and duplicate computed keys with unique IDs", () => {
      const { exports } = parseFile(
        path.join(FIXTURES_DIR, "computed-properties", "index.d.ts"),
      );

      // Both overloads share the same name — the graph layer handles uniqueness
      const iteratorOverloads = exports.filter(
        (exportItem) =>
          exportItem.name === "Overloaded.prototype.[Symbol.iterator]",
      );

      expect(iteratorOverloads).toHaveLength(2);
      expect(iteratorOverloads[1]?.signature).toContain("arg: number");
    });
  });
});

describe("Parser Expansion (Synthetic Members)", () => {
  it("names export-default anonymous function as default (zod locale .d.ts shape)", () => {
    const source = "export default function (): { localeError: unknown; };\n";
    const sf = ts.createSourceFile(
      "locale.d.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const { exports } = parseFileFromSource(sf);
    const fn = exports.find(
      (exportItem) => exportItem.kindName === "FunctionDeclaration",
    );
    expect(fn?.name).toBe("default");
  });

  it("unwraps parenthesized intersection so (typeof C) & { … } expands members", () => {
    const source = `
      declare class InnerParen { fromClass(): void; }
      export declare const ParenBox: (typeof InnerParen) & { merged(): void };
    `;
    const sf = ts.createSourceFile(
      "paren.d.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const { exports } = parseFileFromSource(sf);
    expect(
      exports.some((exportItem) => exportItem.name === "ParenBox.fromClass"),
    ).toBe(true);
    expect(
      exports.some((exportItem) => exportItem.name === "ParenBox.merged"),
    ).toBe(true);
  });

  it("nested declare module string name uses literal text (not <unnamed>)", () => {
    const source = `
      export declare namespace Outer {
        declare module "inner-mod" {
          export interface InnerFace { x: number; }
        }
      }
    `;
    const sf = ts.createSourceFile(
      "nested-mod.d.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const { exports } = parseFileFromSource(sf);
    const modDecl = exports.find(
      (exportItem) =>
        exportItem.kindName === "ModuleDeclaration" &&
        exportItem.name === "Outer.inner-mod",
    );
    expect(modDecl).toBeDefined();
    expect(exports.some((exportItem) => exportItem.name === "<unnamed>")).toBe(
      false,
    );
  });

  it("Prototype Member Assignment: captures ad-hoc assignments via ExpressionStatement", () => {
    const fixturePath = path.join(
      FIXTURES_DIR,
      "prototype-member-assignment",
      "index.d.ts",
    );
    const { exports } = parseFile(fixturePath);

    const upgradeMethod = exports.find(
      (exportItem) => exportItem.name === "BaseNode.prototype.upgrade",
    );
    expect(upgradeMethod).toBeDefined();
    expect(upgradeMethod?.since).toBe("1.2.0");

    const legacyProp = exports.find(
      (exportItem) => exportItem.name === "BaseNode.prototype.isLegacy",
    );
    expect(legacyProp).toBeDefined();
    expect(legacyProp?.since).toBe("1.1.0");
  });

  it("Decorator Metadata: extracts metadata from class declarations and members", () => {
    const fixturePath = path.join(
      FIXTURES_DIR,
      "decorator-metadata-extraction",
      "index.d.ts",
    );
    const { exports } = parseFile(fixturePath);

    const serviceNode = exports.find(
      (exportItem) => exportItem.name === "ServiceNode",
    );
    expect(serviceNode).toBeDefined();
    expect(serviceNode!.decorators).toBeDefined();
    expect(serviceNode!.decorators).toContainEqual(
      expect.objectContaining({ name: "injectable" }),
    );

    const executeMethod = exports.find(
      (exportItem) => exportItem.name === "ServiceNode.prototype.execute",
    );
    expect(executeMethod).toBeDefined();
    expect(executeMethod!.decorators).toBeDefined();
    expect(executeMethod!.decorators).toContainEqual(
      expect.objectContaining({ name: "authenticated" }),
    );
  });

  describe("Implicit Script Globals", () => {
    it("parses non-module .d.ts declarations without tagging declare-global augmentation", () => {
      const fixtureDir = path.resolve(
        __dirname,
        "../fixtures/implicit-script-globals",
      );
      const filePath = path.join(fixtureDir, "index.d.ts");
      const { exports, isExternalModule } = parseFile(filePath);

      expect(isExternalModule).toBe(false);
      expect(exports.length).toBe(3);

      const strInterface = exports.find(
        (exportEntry) => exportEntry.name === "String",
      );
      expect(strInterface).toBeDefined();
      expect(strInterface!.kindName).toBe("InterfaceDeclaration");
      expect(strInterface!.isGlobalAugmentation).toBeUndefined();
      expect(strInterface!.since).toBe("1.0.0");

      const strMethod = exports.find(
        (exportEntry) => exportEntry.name === "String.toCustomFormat",
      );
      expect(strMethod).toBeDefined();
      expect(strMethod!.kindName).toBe("MethodSignature");
      expect(strMethod!.isGlobalAugmentation).toBeUndefined();

      const varDecl = exports.find(
        (exportEntry) => exportEntry.name === "AppVersion",
      );
      expect(varDecl).toBeDefined();
      expect(varDecl!.kindName).toBe("VariableStatement");
      expect(varDecl!.isGlobalAugmentation).toBeUndefined();
    });
  });
});
