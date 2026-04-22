import ts from "typescript";
import fs from "node:fs";
import type {
  ParsedExport,
  ParsedImport,
  TypeReference,
  VisibilityLevel,
  CompositionNode,
  DecoratorMetadata,
  SymbolSpace,
} from "./types.js";
import {
  BUILTIN_TYPES,
  VISIBILITY_TAGS,
  DECLARATION_KINDS,
  MAX_RECURSION_DEPTH,
} from "./constants.js";
import { normalizePath, resolveModuleSpecifier } from "./resolver.js";

const sourceFileCache = new Map<string, ts.SourceFile>();
const declarationCache = new Map<string, Map<string, CompositionNode>>();
const printer = ts.createPrinter();

interface JSDocInfo {
  jsDoc?: string;
  deprecated?: string | boolean;
  visibility?: VisibilityLevel;
  since?: string;
}

/** Parse a .d.ts file and extract its exports, imports, and cross-file references. */
export function parseFile(filePath: string): {
  exports: ParsedExport[];
  imports: ParsedImport[];
  references: string[];
  typeReferences: string[];
  isExternalModule: boolean;
} {
  const sourceFile = getOrCreateSourceFile(filePath);
  return parseFileFromSource(sourceFile);
}

/** Core parsing logic that traverses the AST to collect all symbol and import metadata. */
export function parseFileFromSource(sourceFile: ts.SourceFile): {
  exports: ParsedExport[];
  imports: ParsedImport[];
  references: string[];
  typeReferences: string[];
  isExternalModule: boolean;
} {
  const exports: ParsedExport[] = [];
  const imports: ParsedImport[] = [];
  const references = sourceFile.referencedFiles.map((ref) => ref.fileName);
  const typeReferences = sourceFile.typeReferenceDirectives.map(
    (ref) => ref.fileName,
  );

  const isExternalModuleFile = ts.isExternalModule(sourceFile);

  for (const statement of sourceFile.statements) {
    // ─── Imports ──────────────────────────────────────────────
    if (ts.isImportDeclaration(statement)) {
      if (
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
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
                  originalName: element.propertyName
                    ? element.propertyName.text
                    : undefined,
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
          symbolSpace: "value",
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
        symbolSpace: "value",
        isExplicitExport: true,
        signature: `export as namespace ${statement.name.text}`,
        ...jsdoc,
      });
      continue;
    }

    // ─── Modules / Namespaces ───────────────────────────────────
    if (ts.isModuleDeclaration(statement)) {
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
          symbolSpace: "value",
          isGlobalAugmentation: true,
          isExplicitExport: false,
          signature: statement.getText(sourceFile).trim(),
          ...jsdoc,
        });
        if (statement.body && ts.isModuleBlock(statement.body)) {
          for (const sub of statement.body.statements) {
            const subExports = extractDirectExport(
              sub,
              sourceFile,
              false,
              undefined,
              "global",
            );
            for (const subExp of subExports) {
              subExp.isGlobalAugmentation = true;
              exports.push(subExp);
            }
          }
        }
        continue;
      }

      if (ts.isStringLiteral(statement.name)) {
        const jsdoc = extractJSDocInfo(statement);
        exports.push({
          name: statement.name.text,
          kind: ts.SyntaxKind.ModuleDeclaration,
          kindName: "ModuleDeclaration",
          isTypeOnly: false,
          symbolSpace: "value",
          isExplicitExport: false,
          signature: statement.getText(sourceFile).trim(),
          ...jsdoc,
        });

        if (statement.body && ts.isModuleBlock(statement.body)) {
          for (const sub of statement.body.statements) {
            const isSubExported = isExportedDeclaration(sub);
            const subExports = extractDirectExport(
              sub,
              sourceFile,
              isSubExported,
              undefined,
              statement.name.text,
            );
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
      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
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
              symbolSpace: "value",
              isExplicitExport: false,
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
      const directExports = extractDirectExport(
        statement,
        sourceFile,
        isExported,
      );
      for (const exp of directExports) {
        exports.push(exp);
      }
      continue;
    }
  }

  return {
    exports,
    imports,
    references,
    typeReferences,
    isExternalModule: isExternalModuleFile,
  };
}

/** Retrieve a cached source file or create a new one from the filesystem. */
function getOrCreateSourceFile(filePath: string): ts.SourceFile {
  const cached = sourceFileCache.get(filePath);
  if (cached) return cached;
  const sourceCode = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );
  sourceFileCache.set(filePath, sourceFile);
  return sourceFile;
}

/** Clear all internal caches (SourceFile and Declaration caches). */
export function clearParserCache(): void {
  sourceFileCache.clear();
  declarationCache.clear();
}

/** Expose source file retrieval for components like the crawler and graph builder. */
export function getFileSource(filePath: string): ts.SourceFile {
  return getOrCreateSourceFile(filePath);
}

/** Stamp symbols lexically inside `declare module` / `declare global` / nested module blocks. */
function applyAmbientModuleEnclosure(
  rows: ParsedExport[],
  ambientModuleContainerName: string | undefined,
): void {
  if (ambientModuleContainerName === undefined) return;
  for (const row of rows) {
    if (
      row.kind === ts.SyntaxKind.ModuleDeclaration &&
      row.name === ambientModuleContainerName
    ) {
      continue;
    }
    row.enclosingModuleDeclarationName = ambientModuleContainerName;
  }
}

/** Extract architectural metadata from a direct TypeScript declaration statement (class, interface, function, etc.). */
function extractDirectExport(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  isExplicitExport: boolean,
  parentName?: string,
  ambientModuleContainerName?: string,
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const dependencies = decl.type ? extractTypeReferences(decl.type) : [];
        const jsdoc = extractJSDocInfo(statement);
        const name = parentName
          ? `${parentName}.${decl.name.text}`
          : decl.name.text;

        exports.push({
          name,
          kind: ts.SyntaxKind.VariableStatement,
          kindName: "VariableStatement",
          isTypeOnly: false,
          symbolSpace: "value",
          isExplicitExport,
          signature: `declare const ${decl.name.text}: ${decl.type?.getText(sourceFile) ?? "any"}`,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
          ...jsdoc,
          modifiers: extractModifiers(statement),
        });

        if (decl.type) {
          exports.push(
            ...extractComplexTypeMembers(
              decl.type,
              sourceFile,
              name,
              isExplicitExport,
              jsdoc,
              0,
              new Set(),
              "type",
              undefined,
              ambientModuleContainerName,
            ),
          );
        }
      }
    }
    applyAmbientModuleEnclosure(exports, ambientModuleContainerName);
    return exports;
  }

  if (isNamedDeclaration(statement)) {
    const declarationScopeAmbient =
      ts.isModuleDeclaration(statement) &&
      statement.body &&
      ts.isModuleBlock(statement.body) &&
      (ts.isStringLiteral(statement.name) || ts.isIdentifier(statement.name))
        ? statement.name.text
        : ambientModuleContainerName;

    let rawName: string;
    if (
      ts.isModuleDeclaration(statement) &&
      ts.isStringLiteral(statement.name)
    ) {
      rawName = statement.name.text;
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      !statement.name &&
      isExplicitExport
    ) {
      const modifiers = ts.canHaveModifiers(statement)
        ? ts.getModifiers(statement)
        : undefined;
      const isDefaultExport =
        modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        ) ?? false;
      rawName = isDefaultExport ? "default" : "<unnamed>";
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      rawName = statement.name.text;
    } else {
      rawName = "<unnamed>";
    }
    const name =
      parentName && rawName !== "<unnamed>"
        ? `${parentName}.${rawName}`
        : rawName;
    const deps = ts.isModuleDeclaration(statement)
      ? []
      : extractTypeReferences(statement);
    const jsdoc = extractJSDocInfo(statement);

    const nestedLexicalEnclosing =
      ambientModuleContainerName !== undefined &&
      ts.isModuleDeclaration(statement) &&
      (ts.isStringLiteral(statement.name) || ts.isIdentifier(statement.name)) &&
      statement.name.text !== ambientModuleContainerName
        ? ambientModuleContainerName
        : undefined;

    exports.push({
      name,
      kind: statement.kind,
      kindName: ts.SyntaxKind[statement.kind]!,
      isTypeOnly: isTypeDeclaration(statement),
      symbolSpace: symbolSpaceForNamedDeclaration(statement),
      isExplicitExport,
      signature: statement.getText(sourceFile).trim(),
      dependencies: deps,
      ...jsdoc,
      decorators: extractDecorators(statement, sourceFile),
      modifiers: extractModifiers(statement),
      heritage:
        ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
          ? extractHeritage(statement, sourceFile)
          : undefined,
      ...(nestedLexicalEnclosing !== undefined
        ? { enclosingModuleDeclarationName: nestedLexicalEnclosing }
        : {}),
    });

    if (
      ts.isModuleDeclaration(statement) &&
      statement.body &&
      ts.isModuleBlock(statement.body)
    ) {
      for (const subStatement of statement.body.statements) {
        const isSubExported = isExportedDeclaration(subStatement);
        exports.push(
          ...extractDirectExport(
            subStatement,
            sourceFile,
            isSubExported,
            name,
            declarationScopeAmbient,
          ),
        );
      }
    }

    if (ts.isClassDeclaration(statement)) {
      exports.push(
        ...extractClassMembers(
          statement,
          sourceFile,
          name,
          isExplicitExport,
          jsdoc,
          declarationScopeAmbient,
        ),
      );
    }

    if (ts.isInterfaceDeclaration(statement)) {
      exports.push(
        ...extractComplexTypeMembers(
          statement,
          sourceFile,
          name,
          isExplicitExport,
          jsdoc,
          0,
          new Set(),
          "type",
          undefined,
          declarationScopeAmbient,
        ),
      );
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      exports.push(
        ...extractComplexTypeMembers(
          statement.type,
          sourceFile,
          name,
          isExplicitExport,
          jsdoc,
          0,
          new Set(),
          "type",
          undefined,
          declarationScopeAmbient,
        ),
      );
    }

    applyAmbientModuleEnclosure(exports, declarationScopeAmbient);
    return exports;
  }

  applyAmbientModuleEnclosure(exports, ambientModuleContainerName);
  return exports;
}

/** Extract instance and static members from a class declaration. */
function extractClassMembers(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  parentName: string,
  isExplicitExport: boolean,
  parentJsDoc: JSDocInfo,
  ambientModuleContainerName?: string,
): ParsedExport[] {
  const exports: ParsedExport[] = [];

  for (const member of classNode.members) {
    if (!member.name) continue;
    const memberName = getMemberName(member.name, sourceFile);
    if (!memberName) continue;

    const modifiers = ts.canHaveModifiers(member)
      ? ts.getModifiers(member)
      : undefined;
    const isStatic = modifiers?.some(
      (mod: ts.Modifier) => mod.kind === ts.SyntaxKind.StaticKeyword,
    );
    if (!isStatic && ts.isConstructorDeclaration(member)) continue;

    const baseName = isStatic
      ? `${parentName}.${memberName}`
      : `${parentName}.prototype.${memberName}`;
    const fullName = baseName;
    const memberJsDoc = extractJSDocInfo(member);

    if (memberName.startsWith("_") && !memberJsDoc.visibility) {
      memberJsDoc.visibility = "internal";
    }
    const signature = member.getText(sourceFile).trim();

    const dependencies = extractTypeReferences(member);

    exports.push({
      name: fullName,
      kind: member.kind,
      kindName: ts.SyntaxKind[member.kind]!,
      isTypeOnly: false,
      symbolSpace: "value",
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

  applyAmbientModuleEnclosure(exports, ambientModuleContainerName);
  return exports;
}

/** Extract members from complex types, including nested object literals and intersection types. */
function extractComplexTypeMembers(
  node: CompositionNode,
  sourceFile: ts.SourceFile,
  parentName: string,
  isExplicitExport: boolean,
  parentJSDoc: JSDocInfo | undefined,
  depth: number,
  visitedNames: Set<string>,
  memberSymbolSpace: SymbolSpace,
  definitionSitePath?: string,
  ambientModuleContainerName?: string,
): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const declSite = definitionSitePath
    ? { declaredInFile: definitionSitePath }
    : {};

  if (depth > MAX_RECURSION_DEPTH) {
    return exports;
  }

  if (ts.isTypeNode(node) && ts.isParenthesizedTypeNode(node)) {
    return extractComplexTypeMembers(
      node.type,
      sourceFile,
      parentName,
      isExplicitExport,
      parentJSDoc,
      depth,
      visitedNames,
      memberSymbolSpace,
      definitionSitePath,
      ambientModuleContainerName,
    );
  }

  let members: ts.NodeArray<ts.TypeElement | ts.ClassElement> | undefined;
  if (ts.isTypeLiteralNode(node)) {
    members = node.members;
  } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    members = node.members;
  }

  if (members) {
    for (const member of members) {
      if (
        ts.isPropertySignature(member) ||
        ts.isMethodSignature(member) ||
        ts.isPropertyDeclaration(member) ||
        ts.isMethodDeclaration(member) ||
        ts.isGetAccessorDeclaration(member) ||
        ts.isSetAccessorDeclaration(member)
      ) {
        const memberName = member.name
          ? getMemberName(member.name, sourceFile)
          : undefined;
        if (!memberName) continue;
        const name = `${parentName}.${memberName}`;
        const deps = extractTypeReferences(member);
        const jsdoc = extractJSDocInfo(member);
        const signature =
          member.pos >= 0
            ? member.getText(sourceFile).trim()
            : printer
                .printNode(ts.EmitHint.Unspecified, member, sourceFile)
                .trim();

        exports.push({
          name,
          kind: member.kind,
          kindName: ts.SyntaxKind[member.kind]!,
          isTypeOnly: false,
          symbolSpace: memberSymbolSpace,
          isExplicitExport,
          signature,
          dependencies: deps,
          ...jsdoc,
          since: jsdoc.since || parentJSDoc?.since,
          visibility: jsdoc.visibility || parentJSDoc?.visibility,
          deprecated: jsdoc.deprecated || parentJSDoc?.deprecated,
          decorators: extractDecorators(member, sourceFile),
          modifiers: extractModifiers(member),
          ...declSite,
        });

        if (
          (ts.isPropertySignature(member) ||
            ts.isPropertyDeclaration(member)) &&
          member.type
        ) {
          exports.push(
            ...extractComplexTypeMembers(
              member.type,
              sourceFile,
              name,
              isExplicitExport,
              jsdoc,
              depth + 1,
              visitedNames,
              "type",
              definitionSitePath,
              ambientModuleContainerName,
            ),
          );
        }
      }
    }
  } else if (ts.isIntersectionTypeNode(node)) {
    const intersection = node;
    for (const intersectionMember of intersection.types) {
      exports.push(
        ...extractComplexTypeMembers(
          intersectionMember,
          sourceFile,
          parentName,
          isExplicitExport,
          parentJSDoc,
          depth + 1,
          visitedNames,
          memberSymbolSpace,
          definitionSitePath,
          ambientModuleContainerName,
        ),
      );
    }
  } else if (ts.isImportTypeNode(node)) {
    const it = node;
    if (!it.qualifier || !ts.isIdentifier(it.qualifier)) {
      return exports;
    }
    const arg = it.argument;
    if (!ts.isLiteralTypeNode(arg) || !ts.isStringLiteralLike(arg.literal)) {
      return exports;
    }
    const specifier = arg.literal.text;
    const importKey = `import:${specifier}::${it.qualifier.text}`;
    if (visitedNames.has(importKey)) {
      return exports;
    }
    const newVisited = new Set(visitedNames).add(importKey);
    const resolvedPaths = resolveModuleSpecifier(
      specifier,
      sourceFile.fileName,
    );
    const targetPath = resolvedPaths[0];
    if (!targetPath || targetPath === specifier) {
      return exports;
    }
    const normalizedTarget = normalizePath(targetPath);
    const targetSf = getOrCreateSourceFile(normalizedTarget);
    const resolved = resolveLocalTypeByName(it.qualifier.text, targetSf);
    if (resolved) {
      const nextSpace: SymbolSpace = ts.isClassDeclaration(resolved)
        ? "value"
        : "type";
      exports.push(
        ...extractComplexTypeMembers(
          resolved,
          targetSf,
          parentName,
          isExplicitExport,
          parentJSDoc,
          depth + 1,
          newVisited,
          nextSpace,
          normalizedTarget,
        ),
      );
    }
  } else if (ts.isTypeQueryNode(node) || ts.isTypeReferenceNode(node)) {
    const typeNode = node;
    // Tracing typeof or direct reference to local declarations
    const searchName = getSearchName(typeNode);
    if (searchName && !visitedNames.has(searchName)) {
      const newVisited = new Set(visitedNames).add(searchName);
      const resolved = resolveLocalType(typeNode, sourceFile);
      if (resolved) {
        const nextSpace: SymbolSpace = ts.isClassDeclaration(resolved)
          ? "value"
          : "type";
        exports.push(
          ...extractComplexTypeMembers(
            resolved,
            sourceFile,
            parentName,
            isExplicitExport,
            parentJSDoc,
            depth + 1,
            newVisited,
            nextSpace,
            definitionSitePath,
            ambientModuleContainerName,
          ),
        );
      }
    }
  }

  applyAmbientModuleEnclosure(exports, ambientModuleContainerName);
  return exports;
}

/** Identify the search string for a TypeQuery or TypeReference node. Used for navigating local symbol graphs. */
function getSearchName(node: ts.TypeNode): string | undefined {
  if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName))
    return node.exprName.text;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName))
    return node.typeName.text;
  return undefined;
}

/** Resolve a named type/value declaration in a given source file (same-file index). */
function resolveLocalTypeByName(
  searchName: string,
  sourceFile: ts.SourceFile,
): CompositionNode | undefined {
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

/** Resolve a TypeQuery (typeof) or TypeReference to its underlying declaration in the same file. */
function resolveLocalType(
  node: ts.TypeNode,
  sourceFile: ts.SourceFile,
): CompositionNode | undefined {
  const searchName = getSearchName(node);
  if (!searchName) return undefined;
  return resolveLocalTypeByName(searchName, sourceFile);
}

/** Extract a stable string representation for a property name (including well-known symbols). */
function getMemberName(
  name: ts.PropertyName,
  sourceFile: ts.SourceFile,
): string | undefined {
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
    } catch {}

    // Structural check fallback for Symbol members
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "Symbol"
    ) {
      return `[Symbol.${expr.name.text}]`;
    }

    // Generic fallback using printer
    const printed = printer
      .printNode(ts.EmitHint.Unspecified, expr, sourceFile)
      .trim();
    if (printed) return `[${printed}]`;
  }
  return undefined;
}

/** Extract structured modifiers (abstract, readonly, static, etc.) */
function extractModifiers(node: ts.Node): string[] | undefined {
  if (!ts.canHaveModifiers(node)) return undefined;
  const modifiers = ts.getModifiers(node);
  if (!modifiers || modifiers.length === 0) return undefined;

  return modifiers.map((modifier) => modifier.getText());
}

/** Extract decorator metadata associated with the given AST node. */
function extractDecorators(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): DecoratorMetadata[] | undefined {
  if (!ts.canHaveDecorators(node)) return undefined;

  const decorators = ts.getDecorators(node);
  if (!decorators || decorators.length === 0) return undefined;

  return decorators.map((decorator: ts.Decorator): DecoratorMetadata => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      return {
        name: expression.expression.getText(sourceFile),
        arguments: expression.arguments.map((argument) =>
          argument.getText(sourceFile).replace(/['"`]/g, ""),
        ),
      };
    }
    return { name: expression.getText(sourceFile) };
  });
}

/** Extract names of classes or interfaces this node extends or implements. */
function extractHeritage(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
): string[] | undefined {
  if (!node.heritageClauses) return undefined;
  const heritage: string[] = [];
  for (const clause of node.heritageClauses) {
    for (const type of clause.types) {
      const text = type.getText(sourceFile).trim();
      if (text) heritage.push(text);
    }
  }
  if (heritage.length === 0) {
    return undefined;
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const entry of heritage) {
    if (!seen.has(entry)) {
      seen.add(entry);
      deduped.push(entry);
    }
  }
  return deduped;
}

/** Determine if a node is explicitly being exported from the current module. */
function isExportedDeclaration(node: ts.Node): boolean {
  if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) return true;
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  if (
    modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  )
    return true;
  if (ts.isVariableStatement(node)) {
    const listModifiers = ts.canHaveModifiers(node.declarationList)
      ? ts.getModifiers(node.declarationList)
      : undefined;
    if (
      listModifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    )
      return true;
  }
  return false;
}

/** Extract export declarations. */
function extractExportDeclaration(
  node: ts.ExportDeclaration,
  sourceFile: ts.SourceFile,
): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const isTypeOnly = node.isTypeOnly;
  const source =
    node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  const jsdoc = extractJSDocInfo(node);

  if (!node.exportClause && source) {
    exports.push({
      name: "*",
      kind: ts.SyntaxKind.ExportDeclaration,
      kindName: "ExportDeclaration",
      isTypeOnly,
      symbolSpace: symbolSpaceForReExport(isTypeOnly),
      source,
      isWildcard: true,
      isExplicitExport: true,
      signature: isTypeOnly
        ? `export type * from '${source}'`
        : `export * from '${source}'`,
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
      symbolSpace: symbolSpaceForReExport(isTypeOnly),
      source,
      isNamespaceExport: true,
      isExplicitExport: true,
      signature: isTypeOnly
        ? `export type * as ${node.exportClause.name.text} from '${source}'`
        : `export * as ${node.exportClause.name.text} from '${source}'`,
      ...jsdoc,
    });
    return exports;
  }

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
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

      exports.push({
        name: exportedName,
        kind: ts.SyntaxKind.ExportDeclaration,
        kindName: "ExportDeclaration",
        isTypeOnly: specifierIsTypeOnly,
        symbolSpace: symbolSpaceForReExport(specifierIsTypeOnly),
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

/** Extract export assignment. */
function extractExportAssignment(
  node: ts.ExportAssignment,
  sourceFile: ts.SourceFile,
): ParsedExport {
  const isDefault = !node.isExportEquals;
  const expression = node.expression;
  const name = ts.isIdentifier(expression)
    ? expression.text
    : isDefault
      ? "default"
      : "module.exports";
  const jsdoc = extractJSDocInfo(node);
  return {
    name,
    kind: ts.SyntaxKind.ExportAssignment,
    kindName: "ExportAssignment",
    isTypeOnly: false,
    symbolSpace: "value",
    signature: node.getText(sourceFile).trim(),
    isExplicitExport: true,
    ...jsdoc,
  };
}

/** Type guard to identify declarations that have a name identifier. */
function isNamedDeclaration(
  node: ts.Node,
): node is ts.DeclarationStatement & { name?: ts.DeclarationName } {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

/** Type guard to identify interface or type alias declarations. */
function isTypeDeclaration(node: ts.Node): boolean {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

/** Type vs value namespace for a named declaration (not re-export / `export type` flags). */
function symbolSpaceForNamedDeclaration(statement: ts.Statement): SymbolSpace {
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return "type";
  }
  return "value";
}

function symbolSpaceForReExport(isTypeOnlyExport: boolean): SymbolSpace {
  return isTypeOnlyExport ? "type" : "value";
}

/** Extract JSDoc info. */
function extractJSDocInfo(node: ts.Node): JSDocInfo {
  const result: JSDocInfo = {};
  const jsDocs = ts.getJSDocCommentsAndTags(node);

  for (const doc of jsDocs) {
    if (!ts.isJSDoc(doc)) continue;
    if (!result.jsDoc && doc.comment) {
      result.jsDoc =
        typeof doc.comment === "string"
          ? doc.comment
          : ts.getTextOfJSDocComment(doc.comment);
    }
    if (doc.tags) {
      for (const tag of doc.tags) {
        const tagName = tag.tagName.text;
        if (tagName === "deprecated" && result.deprecated === undefined) {
          result.deprecated = tag.comment
            ? (typeof tag.comment === "string"
                ? tag.comment
                : ts.getTextOfJSDocComment(tag.comment)) || true
            : true;
        }
        if (!result.visibility && VISIBILITY_TAGS.has(tagName)) {
          result.visibility = tagName as VisibilityLevel;
        }
        if (tagName === "since" && !result.since && tag.comment) {
          result.since =
            typeof tag.comment === "string"
              ? tag.comment
              : ts.getTextOfJSDocComment(tag.comment);
        }
      }
    }
  }
  return result;
}

/** Traverse a TypeScript AST node to extract all type-level dependencies. */
export function extractTypeReferences(node: ts.Node): TypeReference[] {
  const refs = new Map<string, TypeReference>();
  visitTypeNode(node, refs, new Set<string>());
  return Array.from(refs.values());
}

/** Add a type reference to the dependency map. */
function addTypeRef(
  refs: Map<string, TypeReference>,
  reference: TypeReference,
): void {
  const key = `${reference.name}::${reference.importPath || ""}::${reference.resolutionHint || "type"}`;
  refs.set(key, reference);
}

/** Full dotted name for `A` or `A.B.C` (used for dependency keys matching graph symbol names). */
function entityNameToDotted(name: ts.EntityName): string {
  if (ts.isIdentifier(name)) return name.text;
  return `${entityNameToDotted(name.left)}.${name.right.text}`;
}

function expressionToDotted(expressionNode: ts.Expression): string | null {
  if (ts.isIdentifier(expressionNode)) return expressionNode.text;
  if (ts.isPropertyAccessExpression(expressionNode)) {
    const left = expressionToDotted(expressionNode.expression);
    if (!left) return null;
    return `${left}.${expressionNode.name.text}`;
  }
  return null;
}

function getNodeTypeParameterNames(node: ts.Node): string[] {
  const maybeNode = node as {
    typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration>;
  };
  if (!maybeNode.typeParameters || maybeNode.typeParameters.length === 0) {
    return [];
  }
  return maybeNode.typeParameters
    .map((typeParameter) => typeParameter.name.text)
    .filter((name) => name.length > 0);
}

function isShadowedTypeParameter(
  referenceName: string,
  scopedTypeParameters: ReadonlySet<string>,
): boolean {
  if (scopedTypeParameters.has(referenceName)) return true;
  const firstDot = referenceName.indexOf(".");
  const firstSegment =
    firstDot === -1 ? referenceName : referenceName.slice(0, firstDot);
  return scopedTypeParameters.has(firstSegment);
}

/** Internal visitor that recursively populates the dependency map. */
function visitTypeNode(
  typeAstNode: ts.Node,
  refs: Map<string, TypeReference>,
  scopedTypeParameters: ReadonlySet<string>,
): void {
  const localTypeParameters = getNodeTypeParameterNames(typeAstNode);
  const activeTypeParameters =
    localTypeParameters.length === 0
      ? scopedTypeParameters
      : new Set([...scopedTypeParameters, ...localTypeParameters]);

  if (ts.isTypeParameterDeclaration(typeAstNode)) {
    if (typeAstNode.constraint)
      visitTypeNode(typeAstNode.constraint, refs, activeTypeParameters);
    if (typeAstNode.default)
      visitTypeNode(typeAstNode.default, refs, activeTypeParameters);
    return;
  }

  if (ts.isIndexedAccessTypeNode(typeAstNode)) {
    let indexedObjectName = "";
    if (
      ts.isTypeReferenceNode(typeAstNode.objectType) &&
      typeAstNode.objectType.typeName
    ) {
      const typeName = typeAstNode.objectType.typeName;
      if (ts.isIdentifier(typeName)) indexedObjectName = typeName.text;
      else if (ts.isQualifiedName(typeName))
        indexedObjectName = entityNameToDotted(typeName);
    }
    let indexPropertyName = "";
    if (
      ts.isLiteralTypeNode(typeAstNode.indexType) &&
      ts.isStringLiteralLike(typeAstNode.indexType.literal)
    ) {
      indexPropertyName = typeAstNode.indexType.literal.text;
    }
    if (indexedObjectName && indexPropertyName) {
      const name = `${indexedObjectName}.${indexPropertyName}`;
      if (!BUILTIN_TYPES.has(name)) refs.set(name, { name });
    }
  }

  if (ts.isTypeReferenceNode(typeAstNode)) {
    const typeName = typeAstNode.typeName;
    let name: string;
    if (ts.isIdentifier(typeName)) name = typeName.text;
    else if (ts.isQualifiedName(typeName)) name = entityNameToDotted(typeName);
    else return;

    if (
      !BUILTIN_TYPES.has(name) &&
      !isShadowedTypeParameter(name, activeTypeParameters)
    )
      addTypeRef(refs, { name, resolutionHint: "type" });
  } else if (ts.isImportTypeNode(typeAstNode) && typeAstNode.qualifier) {
    let name: string;
    if (ts.isIdentifier(typeAstNode.qualifier))
      name = typeAstNode.qualifier.text;
    else if (ts.isQualifiedName(typeAstNode.qualifier))
      name = typeAstNode.qualifier.right.text;
    else return;

    let importPath: string | undefined;
    if (
      ts.isLiteralTypeNode(typeAstNode.argument) &&
      ts.isStringLiteral(typeAstNode.argument.literal)
    ) {
      importPath = typeAstNode.argument.literal.text;
    }
    if (
      !BUILTIN_TYPES.has(name) &&
      !isShadowedTypeParameter(name, activeTypeParameters)
    )
      addTypeRef(refs, { name, importPath, resolutionHint: "type" });
  } else if (ts.isExpressionWithTypeArguments(typeAstNode)) {
    const name = expressionToDotted(typeAstNode.expression);
    if (!name) {
      ts.forEachChild(typeAstNode, (descendant) =>
        visitTypeNode(descendant, refs, activeTypeParameters),
      );
      return;
    }

    if (
      !BUILTIN_TYPES.has(name) &&
      !isShadowedTypeParameter(name, activeTypeParameters)
    )
      addTypeRef(refs, { name, resolutionHint: "type" });
  } else if (ts.isTypeQueryNode(typeAstNode)) {
    const exprName = typeAstNode.exprName;
    let name: string;
    if (ts.isIdentifier(exprName)) name = exprName.text;
    else if (ts.isQualifiedName(exprName)) name = entityNameToDotted(exprName);
    else {
      ts.forEachChild(typeAstNode, (descendant) =>
        visitTypeNode(descendant, refs, activeTypeParameters),
      );
      return;
    }

    if (
      !BUILTIN_TYPES.has(name) &&
      !isShadowedTypeParameter(name, activeTypeParameters)
    )
      addTypeRef(refs, { name, resolutionHint: "value" });
  }

  ts.forEachChild(typeAstNode, (descendant) =>
    visitTypeNode(descendant, refs, activeTypeParameters),
  );
}
