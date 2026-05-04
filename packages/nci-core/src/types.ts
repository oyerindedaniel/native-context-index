import type ts from "typescript";

/** API visibility level from JSDoc tags: @public, @internal, @alpha, @beta */
export type VisibilityLevel = "public" | "internal" | "alpha" | "beta";

/**
 * TypeScript symbol namespace for the declaration site (not `export type` / re-export flags).
 * Interface and type-only shapes are `"type"`; runtime declarations are `"value"`.
 */
export type SymbolSpace = "type" | "value";

/** Metadata for a TypeScript decorator: @name(args) */
export interface DecoratorMetadata {
  /** The name of the decorator (e.g., "injectable" or "route") */
  name: string;
  /** Optional string arguments passed to the decorator */
  arguments?: string[];
}

// ─── Scanner Output ────────────────────────────────────────────

/** Metadata for a discovered package in node_modules */
export interface PackageInfo {
  /** Package name (e.g., "react" or "@types/react") */
  name: string;
  /** Package version from package.json */
  version: string;
  /** Absolute path to the package directory */
  dir: string;
  /** Whether this is a scoped package (@scope/name) */
  isScoped: boolean;
}

// ─── Resolver Output ───────────────────────────────────────────

/** Result of resolving a package's types entry point */
export interface PackageEntry {
  /** Package name */
  name: string;
  /** Absolute path to the package directory */
  dirPath: string;
  /** Primary types entries (e.g. from "types" field or "." export) */
  typesEntries: string[];
  /** Map of subpaths to their resolved .d.ts files (e.g. "./sub" -> "/abs/path/sub.d.ts") */
  subpaths: Record<string, string>;
}

// ─── Parser Output ─────────────────────────────────────────────

/** A reference to another type, potentially involving an inline import */
export interface TypeReference {
  /** The name of the referenced type */
  name: string;
  /** The module specifier if it's an inline import() */
  importPath?: string;
  /** Symbol space hint for dependency resolution */
  resolutionHint?: "type" | "value";
}

/** Union of AST nodes that can be expanded for member extraction (Spread, Mixin) */
export type CompositionNode =
  | ts.TypeNode
  | ts.ClassDeclaration
  | ts.InterfaceDeclaration;

/** A single export statement parsed from a .d.ts file */
export interface ParsedExport {
  /** Symbol name */
  name: string;
  /** AST node kind from ts.SyntaxKind */
  kind: ts.SyntaxKind;
  /** Human-readable kind name (derived from ts.SyntaxKind[kind]) */
  kindName: string;
  /** Whether this is a type-only export */
  isTypeOnly: boolean;
  /** Type vs value namespace for this declaration (see {@link SymbolSpace}). */
  symbolSpace: SymbolSpace;
  /** Re-export source module specifier (e.g., "./lib/core") */
  source?: string;
  /** Original name if aliased (export { X as Y } → originalName = "X") */
  originalName?: string;
  /** Whether this is a wildcard re-export (export * from "...") */
  isWildcard?: boolean;
  /** Whether this is a namespace re-export (export * as ns from "...") */
  isNamespaceExport?: boolean;
  /** Full type signature text */
  signature?: string;
  /** JSDoc comment text */
  jsDoc?: string;
  /** Type references found in the declaration (structured) */
  dependencies?: TypeReference[];
  /** Whether this is a global augmentation (declare global { }) */
  isGlobalAugmentation?: boolean;
  /** Absolute path of declaring file when folded from `/// <reference path />` (definition site). */
  declaredInFile?: string;
  /** Deprecation info: true if @deprecated with no message, or the message string */
  deprecated?: string | boolean;
  /** API visibility: @public, @internal, @alpha, @beta */
  visibility?: VisibilityLevel;
  /** Version when this symbol was introduced (from @since tag) */
  since?: string;
  /** Whether the 'export' keyword was explicitly used on the declaration */
  isExplicitExport?: boolean;
  /** Metadata for decorators attached to the declaration */
  decorators?: DecoratorMetadata[];
  /** Names of classes or interfaces this symbol extends/implements */
  heritage?: string[];
  /** Structured modifiers (readonly, abstract, static, etc.) */
  modifiers?: string[];
  /**
   * Lexical `declare module` / `declare global` / `declare namespace` container **name** (same as
   * the `ModuleDeclaration` row’s `name`, e.g. `./foo.js` or `global`). Resolved to
   * `enclosingModuleDeclarationId` on `SymbolNode` after graph id assignment.
   */
  enclosingModuleDeclarationName?: string;
}

/** Documentation for an import in a file */
export interface ParsedImport {
  /** The name as used in the file */
  name: string;
  /** The module specifier (e.g., "./lib/core") */
  source: string;
  /** The original name if aliased (import { X as Y } → originalName = "X") */
  originalName?: string;
  /** Whether this is a default import */
  isDefault?: boolean;
  /** Whether this is a namespace import (import * as ns) */
  isNamespace?: boolean;
}

// ─── Crawler Output ────────────────────────────────────────────

/** Result of crawling a single file */
export interface CrawlResult {
  /** Absolute path of the crawled file */
  filePath: string;
  /** All resolved exports from this file (including jumped re-exports) */
  exports: ResolvedSymbol[];
  /** Imports found in this file (used for internal dependency resolution) */
  imports: Record<string, ParsedImport[]>;
  /** Files that were visited during this crawl */
  visitedFiles: string[];
  /** Package names referenced via /// <reference types="..." /> directives */
  typeReferencePackages: string[];
  /** Any circular references detected */
  circularRefs: string[];
  /**
   * Direct edges from `/// <reference path="..." />` resolution.
   * Keys and values are absolute paths (forward slashes, `normalizePath`); each value is one hop from the key.
   */
  tripleSlashReferenceTargets: Record<string, string[]>;
  /** Absolute path → whether the file is a TS external module (has top-level import/export). */
  fileIsExternalModule: Record<string, boolean>;
  /**
   * When [`CrawlOptions.packageRootForRelativePaths`] was set: absolute → path relative to that root.
   * Omitted or empty when crawl was run without a package root (e.g. standalone tests).
   */
  absoluteToPackageRelative?: Record<string, string>;
  /** Stored package-relative path → absolute path for visited files. */
  relToAbs?: Record<string, string>;
}

/** A fully resolved symbol (after following all re-exports) */
export interface ResolvedSymbol {
  /** Symbol name as exported */
  name: string;
  /** AST node kind */
  kind: ts.SyntaxKind;
  /** Human-readable kind name */
  kindName: string;
  /** Whether this is type-only */
  isTypeOnly: boolean;
  /** Type vs value namespace for this declaration */
  symbolSpace: SymbolSpace;
  /** Full type signature */
  signature?: string;
  /** JSDoc comment */
  jsDoc?: string;
  /** File where this symbol is actually defined */
  definedIn: string;
  /** Package types entry (absolute path) through which this symbol was discovered in pass 1. */
  resolvedFromPackageEntry?: string;
  /** If re-exported, the chain of files it passed through */
  reExportChain?: string[];
  /** Type references found in the declaration */
  dependencies?: TypeReference[];
  /** Deprecation info */
  deprecated?: string | boolean;
  /** API visibility: @public, @internal, @alpha, @beta */
  visibility?: VisibilityLevel;
  /** Version when this symbol was introduced (from @since tag) */
  since?: string;
  /** Whether this is an internal (non-exported) symbol */
  isInternal?: boolean;
  /** Whether this symbol comes from a `declare global {}` augmentation context */
  isGlobalAugmentation?: boolean;
  /** Metadata for decorators attached to the declaration */
  decorators?: DecoratorMetadata[];
  /** Names of classes or interfaces this symbol extends/implements */
  heritage?: string[];
  /** Whether this is an inherited symbol synthesized from a parent */
  isInherited?: boolean;
  /** Parent symbol ids this synthesized member is inherited from (sorted, unique) */
  inheritedFromSources?: string[];
  /** Structured modifiers (readonly, abstract, static, etc.) */
  modifiers?: string[];
  /** Temporary storage for raw dependencies during graph building (not in final report) */
  rawDependencies?: TypeReference[];
  /**
   * Same as {@link ParsedExport.enclosingModuleDeclarationName}; carried through crawl/re-export
   * to graph merge, then cleared after resolving to {@link SymbolNode.enclosingModuleDeclarationId}.
   */
  enclosingModuleDeclarationName?: string;
}

// ─── Graph Output ──────────────────────────────────────────────

/** Labels for how a merged graph row was formed (see `graph-merge.md`). */
export type MergeProvenanceKind =
  | "merge_scope"
  | "identical_fold"
  | "overload_key";

export const MERGE_PROVENANCE_KIND = {
  mergeScope: "merge_scope",
  identicalFold: "identical_fold",
  overloadKey: "overload_key",
} as const;

/** Labels passed from merge-key vs identical-fold branches into `mergeContribution` (subset of keys). */
export const CONTRIBUTION_MERGE_PATH = {
  mergeScope: MERGE_PROVENANCE_KIND.mergeScope,
  identicalFold: MERGE_PROVENANCE_KIND.identicalFold,
} as const;

export type ContributionMergePath =
  (typeof CONTRIBUTION_MERGE_PATH)[keyof typeof CONTRIBUTION_MERGE_PATH];

/** Which merge mechanisms contributed to this symbol row (sorted, unique). */
export interface MergeProvenance {
  kinds: MergeProvenanceKind[];
}

/** A node in the symbol graph */
export interface SymbolNode {
  /**
   * Unique ID. Public symbols: `package@version::name` (or `#n` when the short name collides).
   * Internal symbols: `package@version::filePath::name` (declaration site). See `graph-merge.md`
   * (internal id vs `parentSymbolId`).
   */
  id: string;
  /** Symbol name */
  name: string;
  /**
   * Lexical container when `name` is dotted (e.g. `Foo.bar` → container for `Foo`). Kind-aware when
   * several symbols share the same short name in one file (namespace vs interface vs class). Not
   * `dependencies` or `inheritedFromSources`. For symbols inside `declare module "…"` /
   * `declare global` / `declare namespace` blocks, use {@link enclosingModuleDeclarationId} instead.
   */
  parentSymbolId?: string;
  /**
   * Graph id of the enclosing `ModuleDeclaration` row (`declare module`, `declare global` as
   * `global`, or identifier `declare namespace`). Set after merge/id assignment from crawl-time
   * `enclosingModuleDeclarationName`. Omitted when not inside such a block.
   */
  enclosingModuleDeclarationId?: string;
  /**
   * Pre-resolution container name (see {@link ParsedExport.enclosingModuleDeclarationName}). Removed
   * from the graph after `enclosingModuleDeclarationId` is assigned; not part of the stable report.
   */
  enclosingModuleDeclarationName?: string;
  /** AST node kind */
  kind: ts.SyntaxKind;
  /** Human-readable kind name */
  kindName: string;
  /** Package this symbol belongs to */
  package: string;
  /** File path relative to package root */
  filePath: string;
  /**
   * Npm package that owns {@link sourceFilePath} (indexed package name for in-tree symbols;
   * the dependency package id after the first `node_modules/<pkg>/` segment for `__nci_external__` paths).
   * Populated by `buildPackageGraph` via `symbol-source-identity.ts`.
   */
  sourcePackageName?: string;
  /**
   * Semver of the source package when it is the indexed package; `null` / omitted for external
   * dependency declarations (install-folder names are not treated as authoritative semver).
   */
  sourcePackageVersion?: string | null;
  /** Path relative to {@link sourcePackageName} (same as `filePath` for in-package symbols). */
  sourceFilePath?: string;
  /** Additional files that contribute to this symbol (for multi-file declarations) */
  additionalFiles?: string[];
  /** Full type signature */
  signature?: string;
  /** JSDoc comment */
  jsDoc?: string;
  /** Whether this is type-only */
  isTypeOnly: boolean;
  /** Type vs value namespace for this declaration */
  symbolSpace: SymbolSpace;
  /** IDs of symbols this one references */
  dependencies: string[];
  /**
   * For namespace/module containers only: semantic dependency rollup from direct members.
   * This excludes containment/member ids and keeps `dependencies` as direct symbol-owned refs.
   */
  surfaceDependencies?: string[];
  /** ID of the original source symbol if re-exported */
  reExportedFrom?: string;
  /** Deprecation info: true if @deprecated with no message, or the message string */
  deprecated?: string | boolean;
  /** API visibility: @public, @internal, @alpha, @beta */
  visibility?: VisibilityLevel;
  /** Version when this symbol was introduced (from @since tag) */
  since?: string;
  /** Whether this is an internal (non-exported) symbol */
  isInternal?: boolean;
  /** Whether this symbol comes from a `declare global {}` augmentation context */
  isGlobalAugmentation?: boolean;
  /** Metadata for decorators attached to the declaration */
  decorators?: DecoratorMetadata[];
  /** Whether this is an inherited symbol synthesized from a parent */
  isInherited?: boolean;
  /** Parent symbol ids this synthesized member is inherited from (sorted, unique) */
  inheritedFromSources?: string[];
  /** Names of classes or interfaces this symbol extends/implements */
  heritage?: string[];
  /** Structured modifiers (readonly, abstract, static, etc.) */
  modifiers?: string[];
  /** Original type references for resolution */
  rawDependencies?: TypeReference[];
  /** Entry files in which this symbol is visible (relative paths) */
  entryVisibility?: string[];
  /** Present when this row absorbed more than one declaration via graph merge */
  mergeProvenance?: MergeProvenance;
}

/** The complete graph for a single package */
export interface PackageGraph {
  /** Package name */
  package: string;
  /** Package version */
  version: string;
  /** All resolved symbols */
  symbols: SymbolNode[];
  /** Total symbol count */
  totalSymbols: number;
  /** Total files crawled */
  totalFiles: number;
  /** Wall time for `crawl()` only: parse, file discovery, export resolution (ms) */
  crawlDurationMs: number;
  /** Wall time for entry resolution + merge + dependency IDs + inheritance flatten (ms) */
  buildDurationMs: number;
}
