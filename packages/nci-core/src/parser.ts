/**
 * NCI Core — Parser
 *
 * Parses a single .d.ts file and classifies every export statement.
 * Uses the TypeScript Compiler API for AST generation.
 *
 * Handles all 16 export forms:
 *  1.  export interface Foo {}
 *  2.  export type Bar = ...
 *  3.  export declare function fn()
 *  4.  export declare class Cls {}
 *  5.  export declare const x: T
 *  6.  export enum Direction {}
 *  7.  export { Foo, Bar }              (local re-export, no source)
 *  8.  export { Foo } from "./other"    (named re-export)
 *  9.  export { Foo as Bar } from "..."  (aliased re-export)
 *  10. export * from "./barrel"          (wildcard re-export)
 *  11. export * as ns from "./mod"       (namespace re-export)
 *  12. export type { Foo } from "..."    (type-only re-export)
 *  13. export default ...                (default export)
 *  14. export = something                (CJS-style export)
 *  15. declare module "name" {}          (ambient module)
 *  16. export as namespace X             (UMD namespace export)
 *  17. export import X = require(...)     (legacy CJS re-export)
 */
import ts from "typescript";
import fs from "node:fs";
import type { ParsedExport } from "./types.js";

const sourceFileCache = new Map<string, ts.SourceFile>();

function getOrCreateSourceFile(filePath: string): ts.SourceFile {
  const cached = sourceFileCache.get(filePath);
  if (cached) return cached;
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  sourceFileCache.set(filePath, sf);
  return sf;
}

/** Clear the SourceFile cache. */
export function clearSourceFileCache(): void {
  sourceFileCache.clear();
}

interface JSDocInfo {
  jsDoc?: string;
  deprecated?: string | boolean;
  visibility?: "public" | "internal" | "alpha" | "beta";
}

/** Built-in type names that should NOT be treated as dependencies */
const BUILTIN_TYPES = new Set([
  "string", "number", "boolean", "void", "any", "unknown", "never",
  "null", "undefined", "object", "symbol", "bigint",
  "Array", "Promise", "Map", "Set", "WeakMap", "WeakSet",
  "Record", "Partial", "Required", "Readonly", "Pick", "Omit",
  "Exclude", "Extract", "NonNullable", "ReturnType", "Parameters",
  "InstanceType", "ConstructorParameters", "ThisParameterType",
  "Date", "RegExp", "Error", "Function",
]);

/** Visibility tag names — hoisted to module level to avoid per-call allocation */
const VISIBILITY_TAGS = new Set(["public", "internal", "alpha", "beta"]);

/**
 * The set of SyntaxKind values that represent direct declarations we extract.
 */
const DECLARATION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.VariableStatement,
]);

/**
 * Parse a .d.ts file and return all export statements, classified.
 *
 * @param filePath - Absolute path to the .d.ts file
 * @returns Array of parsed exports
 */
export function parseExports(filePath: string): ParsedExport[] {
  const sourceFile = getOrCreateSourceFile(filePath);

  const exports: ParsedExport[] = [];

  for (const statement of sourceFile.statements) {
    // ─── Pattern 17: export import X = require(...) ────────────
    // Must be checked BEFORE isExportedDeclaration — the export keyword
    // on ImportEqualsDeclaration would otherwise route it through
    // extractDirectExport where it'd be silently dropped.
    if (ts.isImportEqualsDeclaration(statement)) {
      if (isExportedDeclaration(statement)) {
        const importName = statement.name.text;
        let source: string | undefined;
        if (
          ts.isExternalModuleReference(statement.moduleReference) &&
          ts.isStringLiteral(statement.moduleReference.expression)
        ) {
          source = statement.moduleReference.expression.text;
        }
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: importName,
          kind: ts.SyntaxKind.ImportEqualsDeclaration,
          kindName: "ImportEqualsDeclaration",
          isTypeOnly: false,
          source,
          signature: statement.getText(sourceFile),
          ...jsdoc,
        });
      }
      continue;
    }

    // ─── Pattern 16: export as namespace X (UMD) ───────────────
    if (ts.isNamespaceExportDeclaration(statement)) {
      const jsdoc = extractJSDocInfo(statement);
      exports.push({
        name: statement.name.text,
        kind: ts.SyntaxKind.NamespaceExportDeclaration,
        kindName: "NamespaceExportDeclaration",
        isTypeOnly: false,
        signature: `export as namespace ${statement.name.text}`,
        ...jsdoc,
      });
      continue;
    }

    // ─── Patterns 1-6: Direct exported declarations ────────────
    if (isExportedDeclaration(statement)) {
      const directExports = extractDirectExport(statement, sourceFile);
      exports.push(...directExports);
      continue;
    }

    // ─── Patterns 7-12: Export declarations (re-exports) ───────
    if (ts.isExportDeclaration(statement)) {
      const reExports = extractExportDeclaration(statement, sourceFile);
      exports.push(...reExports);
      continue;
    }

    // ─── Patterns 13-14: Export assignment ──────────────────────
    if (ts.isExportAssignment(statement)) {
      exports.push(extractExportAssignment(statement, sourceFile));
      continue;
    }

    // ─── Pattern 15: Ambient module / declare global ──────────
    if (
      ts.isModuleDeclaration(statement) &&
      !isExportedDeclaration(statement)
    ) {
      // declare global { ... } — global augmentation
      if (
        statement.name.kind === ts.SyntaxKind.Identifier &&
        statement.name.text === "global"
      ) {
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: "global",
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: false,
          isGlobalAugmentation: true,
          signature: statement.getText(sourceFile).split("{")[0]!.trim() + " { ... }",
          ...jsdoc,
        });
        continue;
      }

      // declare module "name" { ... } — ambient module
      if (ts.isStringLiteral(statement.name)) {
        const jsdoc2 = extractJSDocInfo(statement);
        exports.push({
          name: statement.name.text,
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: false,
          signature: statement.getText(sourceFile).split("{")[0]!.trim() + " { ... }",
          ...jsdoc2,
        });
        continue;
      }
    }
  }

  return exports;
}

/**
 * Extract all triple-slash reference path directives from a .d.ts file.
 *
 * These are `/// <reference path="..." />` directives at the top of files
 * like `@types/node/index.d.ts` that point to other .d.ts files to include.
 *
 * Uses the TypeScript compiler API's `sourceFile.referencedFiles` which
 * natively parses these directives.
 *
 * @param filePath - Absolute path to the .d.ts file
 * @returns Array of relative reference paths (e.g., ["./globals.d.ts", "./buffer.d.ts"])
 */
export function parseTripleSlashReferences(filePath: string): string[] {
  const sourceFile = getOrCreateSourceFile(filePath);
  return sourceFile.referencedFiles.map((ref) => ref.fileName);
}

/**
 * Extract all triple-slash reference types directives from a .d.ts file.
 * Uses `sourceFile.typeReferenceDirectives` (/// <reference types="..." />).
 *
 * @returns Array of package names (e.g., ["node", "qs", "serve-static"])
 */
export function parseTypeReferenceDirectives(filePath: string): string[] {
  const sourceFile = getOrCreateSourceFile(filePath);
  return sourceFile.typeReferenceDirectives.map((ref) => ref.fileName);
}

// ─── Direct Export Extraction ───────────────────────────────────

function isExportedDeclaration(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function extractDirectExport(
  statement: ts.Statement,
  sourceFile: ts.SourceFile
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  // Pattern 5: VariableStatement → may contain multiple declarations
  if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const deps = decl.type ? extractTypeReferences(decl.type) : [];
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: decl.name.text,
          kind: ts.SyntaxKind.VariableStatement,
          kindName: "VariableStatement",
          isTypeOnly: false,
          signature: `declare const ${decl.name.text}: ${decl.type?.getText(sourceFile) ?? "any"}`,
          dependencies: deps.length > 0 ? deps : undefined,
          ...jsdoc,
        });
      }
    }
    return exports;
  }

  // Patterns 1-4, 6: Named declarations
  if (isNamedDeclaration(statement)) {
    const namedNode = statement as ts.DeclarationStatement & { name?: ts.Node };
    const name =
      namedNode.name && ts.isIdentifier(namedNode.name)
        ? namedNode.name.text
        : "<unnamed>";

    const deps = extractTypeReferences(statement);
    const jsdoc = extractJSDocInfo(statement);
    exports.push({
      name,
      kind: statement.kind,
      kindName: ts.SyntaxKind[statement.kind]!,
      isTypeOnly: isTypeDeclaration(statement),
      signature: getSignature(statement, sourceFile),
      dependencies: deps.length > 0 ? deps : undefined,
      ...jsdoc,
    });
  }

  return exports;
}

// ─── Export Declaration Extraction (Re-exports) ─────────────────

function extractExportDeclaration(
  node: ts.ExportDeclaration,
  sourceFile: ts.SourceFile
): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const isTypeOnly = node.isTypeOnly;
  const source = node.moduleSpecifier
    ? (node.moduleSpecifier as ts.StringLiteral).text
    : undefined;

  // Pattern 10: export * from "..."
  if (!node.exportClause) {
    exports.push({
      name: "*",
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isWildcard: true,
    });
    return exports;
  }

  // Pattern 11: export * as ns from "..."
  if (ts.isNamespaceExport(node.exportClause)) {
    exports.push({
      name: node.exportClause.name.text,
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isNamespaceExport: true,
    });
    return exports;
  }

  // Patterns 7-9, 12: Named exports (with or without source)
  if (ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      const exportedName = specifier.name.text;
      const originalName = specifier.propertyName
        ? specifier.propertyName.text
        : undefined;

      exports.push({
        name: exportedName,
        kind: ts.SyntaxKind.ExportDeclaration,
        kindName: "ExportDeclaration",
        isTypeOnly: isTypeOnly || specifier.isTypeOnly,
        source,
        originalName: originalName !== exportedName ? originalName : undefined,
      });
    }
  }

  return exports;
}

// ─── Export Assignment Extraction ────────────────────────────────

function extractExportAssignment(
  node: ts.ExportAssignment,
  sourceFile: ts.SourceFile
): ParsedExport {
  const isDefault = !node.isExportEquals;
  const expression = node.expression;

  let name: string;
  if (ts.isIdentifier(expression)) {
    name = expression.text;
  } else {
    name = isDefault ? "default" : "module.exports";
  }

  const jsdoc = extractJSDocInfo(node);
  return {
    name,
    kind: ts.SyntaxKind.ExportAssignment,
    kindName: "ExportAssignment",
    isTypeOnly: false,
    signature: node.getText(sourceFile).trim(),
    ...jsdoc,
  };
}

// ─── Utilities ──────────────────────────────────────────────────

function isNamedDeclaration(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

function isTypeDeclaration(node: ts.Node): boolean {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  );
}

function getSignature(node: ts.Statement, sourceFile: ts.SourceFile): string {
  const text = node.getText(sourceFile);

  // For classes and interfaces, truncate at the first '{'
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const braceIndex = text.indexOf("{");
    if (braceIndex !== -1) {
      return text.substring(0, braceIndex).trim() + " { ... }";
    }
  }

  // For functions, truncate at the first '{'
  if (ts.isFunctionDeclaration(node)) {
    const braceIndex = text.indexOf("{");
    if (braceIndex !== -1) {
      return text.substring(0, braceIndex).trim();
    }
  }

  return text.trim();
}

/**
 * Extract jsDoc comment text, deprecation info, and visibility tags from a node.
 */
function extractJSDocInfo(node: ts.Node): JSDocInfo {
  const result: JSDocInfo = {};
  const jsDocs = ts.getJSDocCommentsAndTags(node);

  for (const doc of jsDocs) {
    if (!ts.isJSDoc(doc)) continue;

    // Extract comment text (first JSDoc block only)
    if (!result.jsDoc && doc.comment) {
      result.jsDoc = typeof doc.comment === "string"
        ? doc.comment
        : ts.getTextOfJSDocComment(doc.comment);
    }

    // Extract tags in the same pass
    if (doc.tags) {
      for (const tag of doc.tags) {
        const tagName = tag.tagName.text;

        if (tagName === "deprecated" && result.deprecated === undefined) {
          if (tag.comment) {
            if (typeof tag.comment === "string" && tag.comment.length > 0) {
              result.deprecated = tag.comment;
            } else {
              const text = ts.getTextOfJSDocComment(tag.comment);
              if (text && text.length > 0) {
                result.deprecated = text;
              } else {
                result.deprecated = true;
              }
            }
          } else {
            result.deprecated = true;
          }
        }

        if (!result.visibility && VISIBILITY_TAGS.has(tagName)) {
          result.visibility = tagName as "public" | "internal" | "alpha" | "beta";
        }
      }
    }
  }

  return result;
}

/**
 * Extract type references from a declaration node.
 * Walks the AST to find all TypeReference nodes and returns unique type names
 * that are not built-in types.
 */
export function extractTypeReferences(node: ts.Node): string[] {
  const refs = new Set<string>();

  function walk(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      const typeName = node.typeName;
      let name: string;
      if (ts.isIdentifier(typeName)) {
        name = typeName.text;
      } else if (ts.isQualifiedName(typeName)) {
        // e.g., Namespace.Type
        name = typeName.right.text;
      } else {
        return;
      }

      if (!BUILTIN_TYPES.has(name)) {
        refs.add(name);
      }
    }
    ts.forEachChild(node, walk);
  }

  walk(node);
  return Array.from(refs);
}
