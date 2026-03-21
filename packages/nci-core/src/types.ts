/**
 * NCI Core — Shared Types
 *
 * All types used across the pipeline modules.
 * Uses ts.SyntaxKind from the TypeScript compiler API.
 */
import type ts from "typescript";

/** API visibility level from JSDoc tags: @public, @internal, @alpha, @beta */
export type VisibilityLevel = "public" | "internal" | "alpha" | "beta";

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
}

/** Union of AST nodes that can be expanded for member extraction (Spread, Mixin) */
export type CompositionNode = ts.TypeNode | ts.ClassDeclaration | ts.InterfaceDeclaration;

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
  /** Full type signature */
  signature?: string;
  /** JSDoc comment */
  jsDoc?: string;
  /** File where this symbol is actually defined */
  definedIn: string;
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
  /** Metadata for decorators attached to the declaration */
  decorators?: DecoratorMetadata[];
  /** Names of classes or interfaces this symbol extends/implements */
  heritage?: string[];
  /** Whether this is an inherited symbol synthesized from a parent */
  isInherited?: boolean;
  /** ID of the symbol this one was inherited from */
  inheritedFrom?: string;
  /** Structured modifiers (readonly, abstract, static, etc.) */
  modifiers?: string[];
  /** Temporary storage for raw dependencies during graph building (not in final report) */
  rawDependencies?: TypeReference[];
}

// ─── Graph Output ──────────────────────────────────────────────

/** A node in the symbol graph */
export interface SymbolNode {
  /** Unique ID: "package@version::symbolName" */
  id: string;
  /** Symbol name */
  name: string;
  /** AST node kind */
  kind: ts.SyntaxKind;
  /** Human-readable kind name */
  kindName: string;
  /** Package this symbol belongs to */
  package: string;
  /** File path relative to package root */
  filePath: string;
  /** Additional files that contribute to this symbol (for multi-file declarations) */
  additionalFiles?: string[];
  /** Full type signature */
  signature?: string;
  /** JSDoc comment */
  jsDoc?: string;
  /** Whether this is type-only */
  isTypeOnly: boolean;
  /** IDs of symbols this one references */
  dependencies: string[];
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
  /** Metadata for decorators attached to the declaration */
  decorators?: DecoratorMetadata[];
  /** Whether this is an inherited symbol synthesized from a parent */
  isInherited?: boolean;
  /** ID of the symbol this one was inherited from */
  inheritedFrom?: string;
  /** Names of classes or interfaces this symbol extends/implements */
  heritage?: string[];
  /** Structured modifiers (readonly, abstract, static, etc.) */
  modifiers?: string[];
  /** Original type references for resolution */
  rawDependencies?: TypeReference[];
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
  /** Time taken to crawl in milliseconds */
  crawlDurationMs: number;
}
