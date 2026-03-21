/**
 * NCI Core — Parser
 *
 * Parses a single .d.ts file and classifies every export statement.
 * Uses the TypeScript Compiler API for AST generation.
 */
import ts from "typescript";
import fs from "node:fs";
import type {
  ParsedExport,
  ParsedImport,
  TypeReference,
  VisibilityLevel,
  CompositionNode,
  DecoratorMetadata,
} from "./types.js";
import { BUILTIN_TYPES, VISIBILITY_TAGS, DECLARATION_KINDS, MAX_RECURSION_DEPTH } from "./constants.js";

const sourceFileCache = new Map<string, ts.SourceFile>();
const declarationCache = new Map<string, Map<string, CompositionNode>>();
const printer = ts.createPrinter();

interface JSDocInfo {
  jsDoc?: string;
  deprecated?: string | boolean;
  visibility?: VisibilityLevel;
  since?: string;
}

/**
 * Parses a .d.ts file and extracts its exports, imports, and cross-file references.
 */
export function parseFile(filePath: string): {
  exports: ParsedExport[];
  imports: ParsedImport[];
  references: string[];
  typeReferences: string[];
} {
  const sourceFile = getOrCreateSourceFile(filePath);
  return parseFileFromSource(sourceFile);
}

/**
 * Core parsing logic that traverses the AST to collect all symbol and import metadata.
 */
export function parseFileFromSource(sourceFile: ts.SourceFile): {
  exports: ParsedExport[];
  imports: ParsedImport[];
  references: string[];
  typeReferences: string[];
} {
  const exports: ParsedExport[] = [];
  const imports: ParsedImport[] = [];
  const references = sourceFile.referencedFiles.map((ref) => ref.fileName);
  const typeReferences = sourceFile.typeReferenceDirectives.map((ref) => ref.fileName);

  const isScript = !ts.isExternalModule(sourceFile);

  for (const statement of sourceFile.statements) {
    // ─── Imports ──────────────────────────────────────────────
    if (ts.isImportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const source = statement.moduleSpecifier.text;
        const importClause = statement.importClause;

        if (importClause) {
          if (importClause.name) {
            imports.push({ name: importClause.name.text, source, isDefault: true });
          }

          if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
              imports.push({ name: importClause.namedBindings.name.text, source, isNamespace: true });
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
      continue;
    }

    // ─── Import Equals (Legacy / CJS) ─────────────────────────
    if (ts.isImportEqualsDeclaration(statement)) {
      const isExported = isExportedDeclaration(statement);
      let source: string | undefined;
      let originalName: string | undefined;
      if (
        ts.isExternalModuleReference(statement.moduleReference) &&
        ts.isStringLiteral(statement.moduleReference.expression)
      ) {
        source = statement.moduleReference.expression.text;
      } else {
        originalName = statement.moduleReference.getText(sourceFile).trim();
      }

      if (source) {
        imports.push({ name: statement.name.text, source });
      }

      if (isExported) {
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: statement.name.text,
          kind: ts.SyntaxKind.ImportEqualsDeclaration,
          kindName: "ImportEqualsDeclaration",
          isTypeOnly: false,
          isExplicitExport: true,
          isNamespaceExport: true,
          source,
          originalName,
          signature: statement.getText(sourceFile).trim(),
          ...jsdoc,
        });
      }
      continue;
    }

    // ─── UMD Namespace ─────────────────────────────────────────
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

    // ─── Modules / Namespaces ───────────────────────────────────
    if (ts.isModuleDeclaration(statement)) {
      if (statement.name.kind === ts.SyntaxKind.Identifier && statement.name.text === "global") {
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

      if (ts.isStringLiteral(statement.name)) {
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: statement.name.text,
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: false,
          isExplicitExport: false,
          signature: statement.getText(sourceFile).split("{")[0]!.trim() + " { ... }",
          ...jsdoc,
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

    // ─── Export Declarations ────────────────────────────────────
    if (ts.isExportDeclaration(statement)) {
      const reExports = extractExportDeclaration(statement, sourceFile);
      for (const exp of reExports) {
        exp.isExplicitExport = true;
        exports.push(exp);
      }
      continue;
    }

    // ─── Export Assignments ─────────────────────────────────────
    if (ts.isExportAssignment(statement)) {
      const exp = extractExportAssignment(statement, sourceFile);
      exp.isExplicitExport = true;
      exports.push(exp);
      continue;
    }

    // ─── Expression Statements (Ad-hoc Prototypes) ─────────────
    if (ts.isExpressionStatement(statement)) {
      const expression = statement.expression;
      if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = expression.left;
        if (ts.isPropertyAccessExpression(left)) {
          const leftText = left.getText(sourceFile);
          if (leftText.includes(".prototype.")) {
            const parts = leftText.split(".prototype.");
            const parentName = parts[0]!;
            const memberName = parts[1]!;
            const jsdoc = extractJSDocInfo(statement);
            
            exports.push({
              name: `${parentName}.prototype.${memberName}`,
              kind: statement.kind,
              kindName: "ExpressionStatement",
              isTypeOnly: false,
              isExplicitExport: false,
              ...(isScript ? { isGlobalAugmentation: true } : {}),
              signature: statement.getText(sourceFile).trim(),
              ...jsdoc,
            });
          }
        }
      }
      continue;
    }

    // ─── Direct Declarations ────────────────────────────────────
    if (DECLARATION_KINDS.has(statement.kind)) {
      const isExported = isExportedDeclaration(statement);
      const directExports = extractDirectExport(statement, sourceFile, isExported);
      for (const exp of directExports) {
        if (!isExported && isScript) {
          exp.isGlobalAugmentation = true;
        }
        exports.push(exp);
      }
      continue;
    }
  }

  return { exports, imports, references, typeReferences };
}

function getOrCreateSourceFile(filePath: string): ts.SourceFile {
  const cached = sourceFileCache.get(filePath);
  if (cached) return cached;
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  sourceFileCache.set(filePath, sourceFile);
  return sourceFile;
}

export function clearParserCache(): void {
  sourceFileCache.clear();
  declarationCache.clear();
}

/** Helper to expose source file retrieval for crawler/graph */
export function getFileSource(filePath: string): ts.SourceFile {
  return getOrCreateSourceFile(filePath);
}

function extractDirectExport(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  isExplicitExport: boolean,
  parentName?: string
): ParsedExport[] {
  const exports: ParsedExport[] = [];

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
          modifiers: extractModifiers(statement),
        });

        if (decl.type) {
          exports.push(...extractComplexTypeMembers(decl.type, sourceFile, name, isExplicitExport, jsdoc, 0, new Set()));
        }
      }
    }
    return exports;
  }

  if (isNamedDeclaration(statement)) {
    const namedNode = statement as ts.DeclarationStatement & { name?: ts.Node };
    const rawName = namedNode.name && ts.isIdentifier(namedNode.name) ? namedNode.name.text : "<unnamed>";
    const name = parentName && rawName !== "<unnamed>" ? `${parentName}.${rawName}` : rawName;
    const deps = extractTypeReferences(statement);
    const jsdoc = extractJSDocInfo(statement);

    exports.push({
      name,
      kind: statement.kind,
      kindName: ts.SyntaxKind[statement.kind]!,
      isTypeOnly: isTypeDeclaration(statement),
      isExplicitExport,
      signature: statement.getText(sourceFile).trim(),
      dependencies: deps,
      ...jsdoc,
      decorators: extractDecorators(statement, sourceFile),
      modifiers: extractModifiers(statement),
      heritage: (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement))
        ? extractHeritage(statement, sourceFile)
        : undefined,
    });

    if (ts.isModuleDeclaration(statement) && statement.body && ts.isModuleBlock(statement.body)) {
      for (const subStatement of statement.body.statements) {
        const isSubExported = isExportedDeclaration(subStatement);
        exports.push(...extractDirectExport(subStatement, sourceFile, isSubExported, name));
      }
    }

    if (ts.isClassDeclaration(statement)) {
      exports.push(...extractClassMembers(statement, sourceFile, name, isExplicitExport, jsdoc));
    }

    if (ts.isInterfaceDeclaration(statement)) {
      exports.push(...extractComplexTypeMembers(statement, sourceFile, name, isExplicitExport, jsdoc, 0, new Set()));
    }
  }

  return exports;
}

function extractClassMembers(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  parentName: string,
  isExplicitExport: boolean,
  parentJsDoc: JSDocInfo
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  for (const member of classNode.members) {
    if (!member.name) continue;
    const memberName = getMemberName(member.name, sourceFile);
    if (!memberName) continue;

    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const isStatic = modifiers?.some((mod: ts.Modifier) => mod.kind === ts.SyntaxKind.StaticKeyword);
    if (!isStatic && ts.isConstructorDeclaration(member)) continue;

    const baseName = isStatic ? `${parentName}.${memberName}` : `${parentName}.prototype.${memberName}`;
    const fullName = baseName;
    const memberJsDoc = extractJSDocInfo(member);

    if (memberName.startsWith("_") && !memberJsDoc.visibility) {
      memberJsDoc.visibility = "internal";
    }
    let signature = member.getText(sourceFile).trim();
    signature = signature.replace(/^(public|private|protected)\s+/, "");

    const dependencies = extractTypeReferences(member);

    exports.push({
      name: fullName,
      kind: member.kind,
      kindName: ts.SyntaxKind[member.kind]!,
      isTypeOnly: false,
      isExplicitExport,
      signature,
      dependencies: dependencies.length > 0 ? dependencies : undefined,
      jsDoc: memberJsDoc.jsDoc || parentJsDoc.jsDoc,
      since: memberJsDoc.since || parentJsDoc.since,
      deprecated: memberJsDoc.deprecated || parentJsDoc.deprecated,
      visibility: memberJsDoc.visibility || parentJsDoc.visibility,
      decorators: extractDecorators(member, sourceFile),
      modifiers: extractModifiers(member),
    });
  }

  return exports;
}

function extractComplexTypeMembers(
  node: CompositionNode,
  sourceFile: ts.SourceFile,
  parentName: string,
  isExplicitExport: boolean,
  parentJSDoc?: JSDocInfo,
  depth = 0,
  visitedNames = new Set<string>()
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  if (depth > MAX_RECURSION_DEPTH) {
    return exports;
  }

  let members: ts.NodeArray<ts.TypeElement | ts.ClassElement> | undefined;
  if (ts.isTypeLiteralNode(node)) {
    members = node.members;
  } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    members = node.members as ts.NodeArray<ts.TypeElement | ts.ClassElement>;
  }

  if (members) {

    for (const member of members) {
      if (ts.isPropertySignature(member) || ts.isMethodSignature(member) || ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) {
        const memberName = member.name ? getMemberName(member.name, sourceFile) : undefined;
        if (!memberName) continue;
        const name = `${parentName}.${memberName}`;
        const deps = extractTypeReferences(member);
        const jsdoc = extractJSDocInfo(member);
        const signature = member.pos >= 0
          ? member.getText(sourceFile).trim()
          : printer.printNode(ts.EmitHint.Unspecified, member, sourceFile).trim();

        exports.push({
          name,
          kind: member.kind,
          kindName: ts.SyntaxKind[member.kind]!,
          isTypeOnly: false,
          isExplicitExport,
          signature,
          dependencies: deps,
          ...jsdoc,
          since: jsdoc.since || parentJSDoc?.since,
          visibility: jsdoc.visibility || parentJSDoc?.visibility,
          deprecated: jsdoc.deprecated || parentJSDoc?.deprecated,
          decorators: extractDecorators(member, sourceFile),
          modifiers: extractModifiers(member),
        });

        const memberType = (member as ts.PropertySignature | ts.PropertyDeclaration).type;
        if ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && memberType) {
          exports.push(...extractComplexTypeMembers(memberType, sourceFile, name, isExplicitExport, jsdoc, depth + 1, visitedNames));
        }
      }
    }
  } else if (ts.isIntersectionTypeNode(node as ts.Node)) {
    const intersection = node as ts.IntersectionTypeNode;
    for (const type of intersection.types) {
      exports.push(...extractComplexTypeMembers(type, sourceFile, parentName, isExplicitExport, parentJSDoc, depth + 1, visitedNames));
    }
  } else if (ts.isTypeQueryNode(node as ts.Node) || ts.isTypeReferenceNode(node as ts.Node)) {
    const typeNode = node as ts.TypeNode;
    // Tracing typeof or direct reference to local declarations
    const searchName = getSearchName(typeNode);
    if (searchName && !visitedNames.has(searchName)) {
      const newVisited = new Set(visitedNames).add(searchName);
      const resolved = resolveLocalType(typeNode, sourceFile);
      if (resolved) {
        exports.push(...extractComplexTypeMembers(resolved, sourceFile, parentName, isExplicitExport, parentJSDoc, depth + 1, newVisited));
      }
    }
  }

  return exports;
}

/** Internal helper to extract search name from TypeQuery or TypeReference */
function getSearchName(node: ts.TypeNode): string | undefined {
  if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) return node.exprName.text;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) return node.typeName.text;
  return undefined;
}

/** Resolves a TypeQuery (typeof) or TypeReference to its underlying declaration in the same file. */
function resolveLocalType(node: ts.TypeNode, sourceFile: ts.SourceFile): CompositionNode | undefined {
  let searchName: string | undefined;
  if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) {
    searchName = node.exprName.text;
  } else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    searchName = node.typeName.text;
  }

  if (!searchName) return undefined;

  let fileCache = declarationCache.get(sourceFile.fileName);
  if (!fileCache) {
    fileCache = new Map();
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.type) {
            fileCache.set(decl.name.text, decl.type);
          }
        }
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        fileCache.set(statement.name.text, statement);
      } else if (ts.isInterfaceDeclaration(statement) && statement.name) {
        fileCache.set(statement.name.text, statement);
      } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
        fileCache.set(statement.name.text, statement.type);
      }
    }
    declarationCache.set(sourceFile.fileName, fileCache);
  }

  return fileCache.get(searchName);
}



/**
 * Extracts a stable string representation for a property name (including well-known symbols).
 */
function getMemberName(name: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const expr = name.expression;

    // Handle String/Numeric Literals (["foo"] or [1])
    if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) {
      return expr.text;
    }

    // Handle Symbol-based keys (Symbol.iterator, etc.)
    try {
      const text = expr.getText(sourceFile).trim();
      if (text) return `[${text}]`;
    } catch { }

    // Structural check fallback for Symbol members
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "Symbol") {
      return `[Symbol.${expr.name.text}]`;
    }

    // Generic fallback using printer
    const printed = printer.printNode(ts.EmitHint.Unspecified, expr, sourceFile).trim();
    if (printed) return `[${printed}]`;
  }
  return undefined;
}

/** Extracts structured modifiers (abstract, readonly, static, etc.) */
function extractModifiers(node: ts.Node): string[] | undefined {
  if (!ts.canHaveModifiers(node)) return undefined;
  const modifiers = ts.getModifiers(node);
  if (!modifiers || modifiers.length === 0) return undefined;

  return modifiers.map(modifier => modifier.getText());
}

/** Extracts decorator metadata in a type-safe manner using modern TS Compiler API (4.8+) */
function extractDecorators(node: ts.Node, sourceFile: ts.SourceFile): DecoratorMetadata[] | undefined {
  if (!ts.canHaveDecorators(node)) return undefined;

  const decorators = ts.getDecorators(node);
  if (!decorators || decorators.length === 0) return undefined;

  return (decorators as ts.Decorator[]).map((decorator: ts.Decorator): DecoratorMetadata => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      return {
        name: expression.expression.getText(sourceFile),
        arguments: expression.arguments.map((arg) => arg.getText(sourceFile).replace(/['"`]/g, "")),
      };
    }
    return { name: expression.getText(sourceFile) };
  });
}

/** Extracts names of classes or interfaces this node extends or implements */
function extractHeritage(node: ts.ClassDeclaration | ts.InterfaceDeclaration, sourceFile: ts.SourceFile): string[] | undefined {
  if (!node.heritageClauses) return undefined;
  const heritage: string[] = [];
  for (const clause of node.heritageClauses) {
    for (const type of clause.types) {
      const text = type.expression.getText(sourceFile).trim();
      if (text) heritage.push(text);
    }
  }
  return heritage.length > 0 ? heritage : undefined;
}

function isExportedDeclaration(node: ts.Node): boolean {
  if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) return true;
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return true;
  if (ts.isVariableStatement(node)) {
    const listModifiers = ts.canHaveModifiers(node.declarationList) ? ts.getModifiers(node.declarationList) : undefined;
    if (listModifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return true;
  }
  return false;
}

function extractExportDeclaration(node: ts.ExportDeclaration, sourceFile: ts.SourceFile): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const isTypeOnly = node.isTypeOnly;
  const source = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
  const jsdoc = extractJSDocInfo(node);

  if (!node.exportClause && source) {
    exports.push({
      name: "*",
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isWildcard: true,
      isExplicitExport: true,
      signature: isTypeOnly ? `export type * from '${source}'` : `export * from '${source}'`,
      ...jsdoc,
    });
    return exports;
  }

  if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
    exports.push({
      name: node.exportClause.name.text,
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      source,
      isNamespaceExport: true,
      isExplicitExport: true,
      signature: isTypeOnly ? `export type * as ${node.exportClause.name.text} from '${source}'` : `export * as ${node.exportClause.name.text} from '${source}'`,
      ...jsdoc,
    });
    return exports;
  }

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      const exportedName = specifier.name.text;
      const originalName = specifier.propertyName ? specifier.propertyName.text : undefined;
      const specifierIsTypeOnly = isTypeOnly || specifier.isTypeOnly;
      const specifierText = originalName ? `${originalName} as ${exportedName}` : exportedName;
      const typePrefix = specifierIsTypeOnly ? "export type" : "export";
      const sourceClause = source ? ` from '${source}'` : "";

      exports.push({
        name: exportedName,
        kind: ts.SyntaxKind.ExportDeclaration,
        kindName: "ExportDeclaration",
        isTypeOnly: specifierIsTypeOnly,
        source,
        originalName: originalName !== exportedName ? originalName : undefined,
        isExplicitExport: true,
        signature: `${typePrefix} { ${specifierText} }${sourceClause}`,
        ...jsdoc,
      });
    }
  }
  return exports;
}

function extractExportAssignment(node: ts.ExportAssignment, sourceFile: ts.SourceFile): ParsedExport {
  const isDefault = !node.isExportEquals;
  const expression = node.expression;
  const name = ts.isIdentifier(expression) ? expression.text : (isDefault ? "default" : "module.exports");
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

function isNamedDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node);
}

function isTypeDeclaration(node: ts.Node): boolean {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

function extractJSDocInfo(node: ts.Node): JSDocInfo {
  const result: JSDocInfo = {};
  const jsDocs = ts.getJSDocCommentsAndTags(node);

  for (const doc of jsDocs) {
    if (!ts.isJSDoc(doc)) continue;
    if (!result.jsDoc && doc.comment) {
      result.jsDoc = typeof doc.comment === "string" ? doc.comment : ts.getTextOfJSDocComment(doc.comment);
    }
    if (doc.tags) {
      for (const tag of doc.tags) {
        const tagName = tag.tagName.text;
        if (tagName === "deprecated" && result.deprecated === undefined) {
          result.deprecated = tag.comment ? (typeof tag.comment === "string" ? tag.comment : ts.getTextOfJSDocComment(tag.comment)) || true : true;
        }
        if (!result.visibility && VISIBILITY_TAGS.has(tagName)) {
          result.visibility = tagName as VisibilityLevel;
        }
        if (tagName === "since" && !result.since && tag.comment) {
          result.since = typeof tag.comment === "string" ? tag.comment : ts.getTextOfJSDocComment(tag.comment);
        }
      }
    }
  }
  return result;
}

export function extractTypeReferences(node: ts.Node): TypeReference[] {
  const refs = new Map<string, TypeReference>();
  function visit(child: ts.Node): void {
    if (ts.isTypeParameterDeclaration(child)) return;
    if (ts.isTypeReferenceNode(child)) {
      const typeName = child.typeName;
      let name: string;
      if (ts.isIdentifier(typeName)) name = typeName.text;
      else if (ts.isQualifiedName(typeName)) name = typeName.right.text;
      else return;

      if (!BUILTIN_TYPES.has(name)) refs.set(name, { name });
    } else if (ts.isImportTypeNode(child) && child.qualifier) {
      let name: string;
      if (ts.isIdentifier(child.qualifier)) name = child.qualifier.text;
      else if (ts.isQualifiedName(child.qualifier)) name = child.qualifier.right.text;
      else return;

      let importPath: string | undefined;
      if (ts.isLiteralTypeNode(child.argument) && ts.isStringLiteral(child.argument.literal)) importPath = child.argument.literal.text;
      if (!BUILTIN_TYPES.has(name)) refs.set(name, { name, importPath });
    } else if (ts.isExpressionWithTypeArguments(child)) {
      let name: string;
      if (ts.isIdentifier(child.expression)) name = child.expression.text;
      else if (ts.isPropertyAccessExpression(child.expression)) name = child.expression.name.text;
      else { ts.forEachChild(child, visit); return; }

      if (!BUILTIN_TYPES.has(name)) refs.set(name, { name });
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return Array.from(refs.values());
}
