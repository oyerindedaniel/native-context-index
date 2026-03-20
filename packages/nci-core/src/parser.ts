/**
 * NCI Core — Parser
 *
 * Parses a single .d.ts file and classifies every export statement.
 * Uses the TypeScript Compiler API for AST generation.
 *
 * Handles all 17 export forms:
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
import type {
  ParsedExport,
  ParsedImport,
  TypeReference,
  VisibilityLevel,
} from "./types.js";
import { BUILTIN_TYPES, VISIBILITY_TAGS, DECLARATION_KINDS } from "./constants.js";

const sourceFileCache = new Map<string, ts.SourceFile>();

interface JSDocInfo {
  jsDoc?: string;
  deprecated?: string | boolean;
  visibility?: VisibilityLevel;
}

/**
 * Parse a .d.ts file and return all export statements, classified.
 *
 * @param filePath - Absolute path to the .d.ts file
 * @returns Array of parsed exports
 */
export function parseExports(filePath: string): ParsedExport[] {
  const sourceFile = getOrCreateSourceFile(filePath);
  return parseExportsFromSource(sourceFile);
}

/**
 * Internal helper to parse exports from a SourceFile.
 */
function parseExportsFromSource(sourceFile: ts.SourceFile): ParsedExport[] {
  const exports: ParsedExport[] = [];

  for (const statement of sourceFile.statements) {
    // ─── Pattern 17: export import X = ... (CommonJS re-export) ─────
    if (ts.isImportEqualsDeclaration(statement)) {
      if (isExportedDeclaration(statement)) {
        let source: string | undefined;
        if (
          ts.isExternalModuleReference(statement.moduleReference) &&
          ts.isStringLiteral(statement.moduleReference.expression)
        ) {
          source = statement.moduleReference.expression.text;
        }

        const jsdoc = extractJSDocInfo(statement);
        const exp: ParsedExport = {
          name: statement.name.text,
          kind: ts.SyntaxKind.ImportEqualsDeclaration,
          kindName: "ImportEqualsDeclaration",
          isTypeOnly: false,
          isExplicitExport: true,
          isNamespaceExport: true,
          source,
          signature: statement.getText(sourceFile).trim(),
          ...jsdoc,
        };
        exports.push(exp);
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
        isExplicitExport: true,
        signature: `export as namespace ${statement.name.text}`,
        ...jsdoc,
      });
      continue;
    }

    // ─── Ambient module / declare global ────────────────────────
    // Must come BEFORE generic ModuleDeclaration handling because
    // these are special forms that require specific metadata.
    if (ts.isModuleDeclaration(statement)) {
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
          isExplicitExport: false,
          signature: statement.getText(sourceFile).split("{")[0]!.trim() + " { ... }",
          ...jsdoc,
        });
        continue;
      }

      // ─── Pattern 15: declare module "name" { ... } (Ambient module) ──
      if (ts.isStringLiteral(statement.name)) {
        const jsdoc2 = extractJSDocInfo(statement);
        exports.push({
          name: statement.name.text,
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: false,
          isExplicitExport: false,
          signature: statement.getText(sourceFile).split("{")[0]!.trim() + " { ... }",
          ...jsdoc2,
        });

        if (statement.body && ts.isModuleBlock(statement.body)) {
          for (const sub of statement.body.statements) {
            const isSubExported = isExportedDeclaration(sub);
            const subExports = extractDirectExport(sub, sourceFile, isSubExported);
            for (const subExp of subExports) {
              exports.push(subExp);
            }
          }
        }
        continue;
      }
    }

    // ─── Patterns 7-12: Export declarations (named, wildcard, namespace re-exports)
    if (ts.isExportDeclaration(statement)) {
      const reExports = extractExportDeclaration(statement, sourceFile);
      for (const exp of reExports) {
        exp.isExplicitExport = true;
        exports.push(exp);
      }
      continue;
    }

    // ─── Patterns 13-14: Export assignment / Default export ────────
    if (ts.isExportAssignment(statement)) {
      const exp = extractExportAssignment(statement, sourceFile);
      exp.isExplicitExport = true;
      exports.push(exp);
      continue;
    }

    // ─── Patterns 1-6: Direct declarations (interface, type, function, class, const, enum)
    if (DECLARATION_KINDS.has(statement.kind)) {
      const isExported = isExportedDeclaration(statement);
      const directExports = extractDirectExport(statement, sourceFile, isExported);
      for (const exp of directExports) {
        exports.push(exp);
      }
      continue;
    }
  }

  return exports;
}

function getOrCreateSourceFile(filePath: string): ts.SourceFile {
  const cached = sourceFileCache.get(filePath);
  if (cached) return cached;
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  sourceFileCache.set(filePath, sourceFile);
  return sourceFile;
}

export function clearSourceFileCache(): void {
  sourceFileCache.clear();
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

/**
 * Extract symbols from a direct declaration (Patterns 1–6).
 * @returns Array of parsed symbols
 */
function extractDirectExport(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  isExplicitExport: boolean,
  parentName?: string
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  // ─── Pattern 5: VariableStatement (declare const/let/var) ──────
  if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const dependencies = decl.type ? extractTypeReferences(decl.type) : [];
        const jsdoc = extractJSDocInfo(statement);
        const name = parentName ? `${parentName}.${decl.name.text}` : decl.name.text;

        exports.push({
          name,
          kind: ts.SyntaxKind.VariableStatement,
          kindName: "VariableStatement",
          isTypeOnly: false,
          isExplicitExport,
          signature: `declare const ${decl.name.text}: ${decl.type?.getText(sourceFile) ?? "any"}`,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
          ...jsdoc,
        });

        // If the variable has a type literal, extract its members as sub-symbols
        if (decl.type && ts.isTypeLiteralNode(decl.type)) {
          exports.push(...extractTypeLiteralMembers(decl.type, sourceFile, name, isExplicitExport));
        }
      }
    }
    return exports;
  }

  // ─── Patterns 1-4, 6: Named declarations (interface, type, class, enum)
  if (isNamedDeclaration(statement)) {
    const namedNode = statement as ts.DeclarationStatement & { name?: ts.Node };
    const rawName =
      namedNode.name && ts.isIdentifier(namedNode.name)
        ? namedNode.name.text
        : "<unnamed>";

    const name = parentName && rawName !== "<unnamed>" ? `${parentName}.${rawName}` : rawName;

    const deps = extractTypeReferences(statement);
    const jsdoc = extractJSDocInfo(statement);

    exports.push({
      name,
      kind: statement.kind,
      kindName: ts.SyntaxKind[statement.kind]!,
      isTypeOnly: isTypeDeclaration(statement),
      isExplicitExport,
      signature: getSignature(statement, sourceFile),
      dependencies: deps,
      ...jsdoc,
    });

    // If it's a namespace, recursively extract its members
    if (ts.isModuleDeclaration(statement) && statement.body && ts.isModuleBlock(statement.body)) {
      for (const subStatement of statement.body.statements) {
        // In a namespace, members are exported if they have the 'export' keyword
        const isSubExported = isExportedDeclaration(subStatement);
        const subExports = extractDirectExport(subStatement, sourceFile, isSubExported, name);
        for (const subExp of subExports) {
          exports.push(subExp);
        }
      }
    }
  }

  return exports;
}

/**
 * Recursively extract members from a type literal.
 * @returns Array of sub-symbols
 */
function extractTypeLiteralMembers(
  node: ts.TypeLiteralNode,
  sourceFile: ts.SourceFile,
  parentName: string,
  isExplicitExport: boolean
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  for (const member of node.members) {
    if (
      (ts.isPropertySignature(member) || ts.isMethodSignature(member)) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const name = `${parentName}.${member.name.text}`;
      const deps = extractTypeReferences(member);
      const jsdoc = extractJSDocInfo(member);

      exports.push({
        name,
        kind: member.kind,
        kindName: ts.SyntaxKind[member.kind]!,
        isTypeOnly: false,
        isExplicitExport,
        signature: member.getText(sourceFile).trim(),
        dependencies: deps,
        ...jsdoc,
      });

      // Recurse if the property type is also a TypeLiteral
      if (
        ts.isPropertySignature(member) &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        exports.push(...extractTypeLiteralMembers(member.type, sourceFile, name, isExplicitExport));
      }
    }
  }

  return exports;
}

/**
 * Check if a node is explicitly exported via 'export' or index assignment.
 * @returns boolean
 */
function isExportedDeclaration(node: ts.Node): boolean {
  if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) return true;

  // Check for 'export' keyword in modifiers
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const hasExport = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  if (hasExport) return true;

  // For VariableStatement, we also need to check its declarationList for modifiers
  if (ts.isVariableStatement(node)) {
    const listModifiers = ts.canHaveModifiers(node.declarationList) ? ts.getModifiers(node.declarationList) : undefined;
    if (listModifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return true;
  }

  return false;
}

/**
 * Extract symbols from an export { ... } or export * declaration (Patterns 7–12).
 * @returns Array of parsed symbols
 */
function extractExportDeclaration(
  node: ts.ExportDeclaration,
  sourceFile: ts.SourceFile
): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const isTypeOnly = node.isTypeOnly;
  const source = node.moduleSpecifier
    ? (node.moduleSpecifier as ts.StringLiteral).text
    : undefined;
  const signature = node.getText(sourceFile).trim();

  // ─── Pattern 10: export * from "..." (Wildcard re-export) ─────
  if (!node.exportClause) {
    exports.push({
      name: "*",
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isWildcard: true,
      isExplicitExport: true,
      signature,
    });
    return exports;
  }

  // ─── Pattern 11: export * as ns from "..." (Namespace re-export)
  if (ts.isNamespaceExport(node.exportClause)) {
    exports.push({
      name: node.exportClause.name.text,
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isNamespaceExport: true,
      isExplicitExport: true,
      signature,
    });
    return exports;
  }

  // ─── Patterns 7, 8, 9, 12: Named / Aliased / Type-only re-exports
  if (ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      const exportedName = specifier.name.text;
      const originalName = specifier.propertyName
        ? specifier.propertyName.text
        : undefined;

      const specifierIsTypeOnly = isTypeOnly || specifier.isTypeOnly;
      const specifierText = originalName
        ? `${originalName} as ${exportedName}`
        : exportedName;
      const typePrefix = specifierIsTypeOnly ? "export type" : "export";
      const sourceClause = source ? ` from '${source}'` : "";
      const perSpecifierSignature = `${typePrefix} { ${specifierText} }${sourceClause}`;

      exports.push({
        name: exportedName,
        kind: ts.SyntaxKind.ExportDeclaration,
        kindName: "ExportDeclaration",
        isTypeOnly: specifierIsTypeOnly,
        source,
        originalName: originalName !== exportedName ? originalName : undefined,
        isExplicitExport: true,
        signature: perSpecifierSignature,
      });
    }
  }

  return exports;
}

/**
 * Extract symbols from an export = or export default assignment (Patterns 13–14).
 * @returns Parsed symbol
 */
function extractExportAssignment(
  node: ts.ExportAssignment,
  sourceFile: ts.SourceFile
): ParsedExport {
  // ─── Pattern 13 (Default) or 14 (CJS-style) ───────────────────
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
    isExplicitExport: true,
    ...jsdoc,
  };
}

/**
 * Check if a node is a named declaration (function, class, etc.).
 * @returns boolean
 */
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

/**
 * Check if a node is a type-only declaration (interface, type alias).
 * @returns boolean
 */
function isTypeDeclaration(node: ts.Node): boolean {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  );
}

/**
 * Get the full text signature of a declaration.
 */
function getSignature(node: ts.Statement, sourceFile: ts.SourceFile): string {
  const text = node.getText(sourceFile);

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

    if (!result.jsDoc && doc.comment) {
      result.jsDoc = typeof doc.comment === "string"
        ? doc.comment
        : ts.getTextOfJSDocComment(doc.comment);
    }

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
          result.visibility = tagName as VisibilityLevel;
        }
      }
    }
  }

  return result;
}

/**
 * Extract type references from a declaration node.
 * Walks the AST to find all TypeReference nodes and returns unique type references
 * that are not built-in types.
 */
export function extractTypeReferences(node: ts.Node): TypeReference[] {
  const refs = new Map<string, TypeReference>();

  function visit(child: ts.Node): void {
    if (ts.isTypeParameterDeclaration(child)) {
      // Skip type parameters to avoid treating them as package dependencies
      return;
    }

    if (ts.isTypeReferenceNode(child)) {
      const typeName = child.typeName;
      let referenceName: string;
      if (ts.isIdentifier(typeName)) {
        referenceName = typeName.text;
      } else if (ts.isQualifiedName(typeName)) {
        referenceName = typeName.right.text;
      } else {
        return;
      }

      if (!BUILTIN_TYPES.has(referenceName)) {
        refs.set(referenceName, { name: referenceName });
      }
    } else if (ts.isImportTypeNode(child) && child.qualifier) {
      const qualifier = child.qualifier;
      let referenceName: string;
      if (ts.isIdentifier(qualifier)) {
        referenceName = qualifier.text;
      } else if (ts.isQualifiedName(qualifier)) {
        referenceName = qualifier.right.text;
      } else {
        return;
      }

      const argument = child.argument;
      let importPath: string | undefined;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        importPath = argument.literal.text;
      }

      if (!BUILTIN_TYPES.has(referenceName)) {
        refs.set(referenceName, { name: referenceName, importPath });
      }
    } else if (ts.isExpressionWithTypeArguments(child)) {
      const expression = child.expression;
      let referenceName: string;
      if (ts.isIdentifier(expression)) {
        referenceName = expression.text;
      } else if (ts.isPropertyAccessExpression(expression)) {
        referenceName = expression.name.text;
      } else {
        ts.forEachChild(child, visit);
        return;
      }

      if (!BUILTIN_TYPES.has(referenceName)) {
        refs.set(referenceName, { name: referenceName });
      }
    }
    ts.forEachChild(child, visit);
  }

  visit(node);
  return Array.from(refs.values());
}

/**
 * Parse a .d.ts file and return all import statements.
 *
 * @param filePath - Absolute path to the .d.ts file
 * @returns Array of parsed imports
 */
export function parseImports(filePath: string): ParsedImport[] {
  const sourceFile = getOrCreateSourceFile(filePath);
  return parseImportsFromSource(sourceFile);
}

/**
 * Internal helper to parse imports from a SourceFile.
 */
function parseImportsFromSource(sourceFile: ts.SourceFile): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const source = statement.moduleSpecifier.text;
        const importClause = statement.importClause;

        if (importClause) {
          if (importClause.name) {
            imports.push({
              name: importClause.name.text,
              source,
              isDefault: true,
            });
          }

          if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
              imports.push({
                name: importClause.namedBindings.name.text,
                source,
                isNamespace: true,
              });
            } else if (ts.isNamedImports(importClause.namedBindings)) {
              for (const element of importClause.namedBindings.elements) {
                imports.push({
                  name: element.name.text,
                  source,
                  originalName: element.propertyName ? element.propertyName.text : undefined,
                });
              }
            }
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(statement)) {
      if (
        ts.isExternalModuleReference(statement.moduleReference) &&
        ts.isStringLiteral(statement.moduleReference.expression)
      ) {
        imports.push({
          name: statement.name.text,
          source: statement.moduleReference.expression.text,
        });
      }
    }
  }

  return imports;
}

/**
 * Combined parser that returns both exports and imports.
 */
export function parseFile(filePath: string): { exports: ParsedExport[]; imports: ParsedImport[] } {
  const sourceFile = getOrCreateSourceFile(filePath);
  return {
    exports: parseExportsFromSource(sourceFile),
    imports: parseImportsFromSource(sourceFile),
  };
}

/** Helper to expose source file retrieval for crawler/graph */
export function getFileSource(filePath: string): ts.SourceFile {
  return getOrCreateSourceFile(filePath);
}
