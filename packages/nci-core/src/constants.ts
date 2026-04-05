import ts from "typescript";

/** Default cap on discovery edges from each package entry. */
export const DEFAULT_MAX_HOPS = 10;

/** The maximum recursion depth for complex type expansion (Object Spreads & Mixins) */
export const MAX_RECURSION_DEPTH = 10;


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

/** Standard Node.js built-in modules */
export const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events",
  "fs", "http", "http2", "https", "inspector", "module", "net", "os",
  "path", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "string_decoder", "sys", "test", "timers", "tls",
  "trace_events", "tty", "url", "util", "v8", "vm", "worker_threads", "zlib"
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

