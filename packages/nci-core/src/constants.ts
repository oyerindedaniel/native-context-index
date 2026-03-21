import ts from "typescript";

/** The default maximum recursion depth for crawling re-exports. */
export const DEFAULT_MAX_DEPTH = 10;

/** Built-in type names that should NOT be treated as dependencies */
export const BUILTIN_TYPES = new Set([
  "string", "number", "boolean", "void", "any", "unknown", "never",
  "null", "undefined", "object", "Object", "symbol", "bigint",
  "Array", "ReadonlyArray", "Promise", "Map", "Set", "WeakMap", "WeakSet",
  "ReadonlyMap", "ReadonlySet",
  "Record", "Partial", "Required", "Readonly", "Pick", "Omit",
  "Exclude", "Extract", "NonNullable", "ReturnType", "Parameters",
  "InstanceType", "ConstructorParameters", "ThisParameterType", "ThisType",
  "Awaited", "NoInfer",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize",
  "TemplateStringsArray",
  "Iterator", "IterableIterator", "AsyncIterableIterator",
  "Generator", "AsyncGenerator",
  "Date", "RegExp", "Error", "Function",
]);

/** Visibility tag names used in JSDoc */
export const VISIBILITY_TAGS = new Set(["public", "internal", "alpha", "beta"]);

/**
 * The set of SyntaxKind values that represent direct declarations we extract.
 */
export const DECLARATION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.VariableStatement,
]);

/** The maximum recursion depth for complex type expansion (Object Spreads & Mixins) */
export const MAX_RECURSION_DEPTH = 10;
