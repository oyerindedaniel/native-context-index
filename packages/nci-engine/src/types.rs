use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

pub type SharedString = Arc<str>;
pub type SharedVec<T> = Arc<[T]>;

// ─── Visibility ────────────────────────────────────────────────

/// API visibility level from JSDoc tags: @public, @internal, @alpha, @beta.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Public,
    Internal,
    Alpha,
    Beta,
}

// ─── Decorator Metadata ────────────────────────────────────────

/// Metadata for a TypeScript decorator: `@name(args)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecoratorMetadata {
    /// The name of the decorator (e.g., "injectable" or "route").
    pub name: SharedString,

    /// Optional string arguments passed to the decorator.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<SharedVec<SharedString>>,
}

// ─── Scanner Output ────────────────────────────────────────────

/// Metadata for a discovered package in `node_modules`.
#[derive(Debug, Clone)]
pub struct PackageInfo {
    /// Package name (e.g., "react" or "@types/react").
    pub name: SharedString,

    /// Package version from `package.json`.
    pub version: SharedString,

    /// Absolute path to the package directory.
    pub dir: SharedString,

    /// Whether this is a scoped package (`@scope/name`).
    pub is_scoped: bool,
}

// ─── Resolver Output ───────────────────────────────────────────

/// Result of resolving a package's types entry point.
#[derive(Debug, Clone)]
pub struct PackageEntry {
    /// Package name.
    pub name: SharedString,

    /// Absolute path to the package directory.
    pub dir_path: SharedString,

    /// Primary types entries (e.g., from "types" field or "." export).
    pub types_entries: Vec<SharedString>,

    /// Map of subpaths to their resolved `.d.ts` files.
    pub subpaths: HashMap<SharedString, SharedString>,
}

// ─── Type Reference ────────────────────────────────────────────

/// A reference to another type, potentially involving an inline `import()`.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeReference {
    /// The name of the referenced type.
    pub name: SharedString,

    /// The module specifier if it's an inline `import()`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_path: Option<SharedString>,
}

// ─── Symbol Kind ───────────────────────────────────────────────

/// The kind of a parsed symbol declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    TypeAlias,
    Enum,
    Namespace,
    Variable,
    ExportDeclaration,
    ExportAssignment,
    PropertyDeclaration,
    PropertySignature,
    MethodDeclaration,
    MethodSignature,
    GetAccessor,
    SetAccessor,
    ImportEquals,
    NamespaceExportDeclaration,
    #[default]
    Unknown,
}

impl Serialize for SymbolKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u32(self.numeric_kind())
    }
}

impl<'de> Deserialize<'de> for SymbolKind {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let code = u32::deserialize(deserializer)?;
        Ok(Self::from_numeric_kind(code))
    }
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Function => "FunctionDeclaration",
            Self::Class => "ClassDeclaration",
            Self::Interface => "InterfaceDeclaration",
            Self::TypeAlias => "TypeAliasDeclaration",
            Self::Enum => "EnumDeclaration",
            Self::Namespace => "ModuleDeclaration",
            Self::Variable => "VariableStatement",
            Self::ExportDeclaration => "ExportDeclaration",
            Self::ExportAssignment => "ExportAssignment",
            Self::PropertyDeclaration => "PropertyDeclaration",
            Self::PropertySignature => "PropertySignature",
            Self::MethodDeclaration => "MethodDeclaration",
            Self::MethodSignature => "MethodSignature",
            Self::GetAccessor => "GetAccessor",
            Self::SetAccessor => "SetAccessor",
            Self::ImportEquals => "ImportEqualsDeclaration",
            Self::NamespaceExportDeclaration => "NamespaceExportDeclaration",
            Self::Unknown => "Unknown",
        }
    }

    pub fn numeric_kind(&self) -> u32 {
        match self {
            Self::Function => 263,
            Self::Class => 264,
            Self::Interface => 265,
            Self::TypeAlias => 266,
            Self::Enum => 267,
            Self::Namespace => 268,
            Self::Variable => 244,
            Self::ExportDeclaration => 279,
            Self::ExportAssignment => 278,
            Self::PropertyDeclaration => 173,
            Self::PropertySignature => 172,
            Self::MethodDeclaration => 175,
            Self::MethodSignature => 174,
            Self::GetAccessor => 178,
            Self::SetAccessor => 179,
            Self::ImportEquals => 272,
            Self::NamespaceExportDeclaration => 271,
            Self::Unknown => 0,
        }
    }

    /// Reverse of [`Self::numeric_kind`] for JSON cache / round-trip.
    pub fn from_numeric_kind(code: u32) -> Self {
        match code {
            263 => Self::Function,
            264 => Self::Class,
            265 => Self::Interface,
            266 => Self::TypeAlias,
            267 => Self::Enum,
            268 => Self::Namespace,
            244 => Self::Variable,
            279 => Self::ExportDeclaration,
            278 => Self::ExportAssignment,
            173 => Self::PropertyDeclaration,
            172 => Self::PropertySignature,
            175 => Self::MethodDeclaration,
            174 => Self::MethodSignature,
            178 => Self::GetAccessor,
            179 => Self::SetAccessor,
            272 => Self::ImportEquals,
            271 => Self::NamespaceExportDeclaration,
            _ => Self::Unknown,
        }
    }
}

// ─── Deprecation ───────────────────────────────────────────────

/// Deprecation info: `true` if `@deprecated` with no message, or the message string.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Deprecation {
    /// `@deprecated` with no message → serializes as `true`.
    Flag(bool),

    /// `@deprecated Some reason` → serializes as `"Some reason"`.
    Message(SharedString),
}

// ─── Parser Output ─────────────────────────────────────────────

/// TypeScript type namespace vs value namespace for a declaration site (not re-export flags).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolSpace {
    #[default]
    Value,
    Type,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedExport {
    /// Symbol name.
    pub name: SharedString,

    /// AST node kind.
    pub kind: SymbolKind,

    /// Whether this is a type-only export.
    pub is_type_only: bool,

    /// Type vs value namespace for this declaration.
    pub symbol_space: SymbolSpace,

    /// Re-export source module specifier (e.g., `"./lib/core"`).
    pub source: Option<SharedString>,

    /// Original name if aliased (`export { X as Y }` → `original_name = "X"`).
    pub original_name: Option<SharedString>,

    /// Whether this is a wildcard re-export (`export * from "..."`).
    pub is_wildcard: bool,

    /// Whether this is a namespace re-export (`export * as ns from "..."`).
    pub is_namespace_export: bool,

    /// Whether the `export` keyword was explicitly used on the declaration.
    pub is_explicit_export: bool,

    /// Whether this is a global augmentation (`declare global { }`).
    pub is_global_augmentation: bool,

    /// Definition-site file when synthesized from referenced files.
    pub declared_in_file: Option<SharedString>,

    /// Full type signature text.
    pub signature: Option<SharedString>,

    /// JSDoc comment text.
    pub js_doc: Option<SharedString>,

    /// Type references found in the declaration.
    pub dependencies: SharedVec<TypeReference>,

    /// Deprecation info from `@deprecated` JSDoc tag.
    pub deprecated: Option<Deprecation>,

    /// API visibility from JSDoc tag.
    pub visibility: Option<Visibility>,

    /// Version when this symbol was introduced (from `@since` tag).
    pub since: Option<SharedString>,

    /// Metadata for decorators attached to the declaration.
    pub decorators: SharedVec<DecoratorMetadata>,

    /// Names of classes or interfaces this symbol extends/implements.
    pub heritage: SharedVec<SharedString>,

    /// Structured modifiers (readonly, abstract, static, etc.).
    pub modifiers: SharedVec<SharedString>,
}

impl ParsedExport {
    /// Creates a `ParsedExport` with the given `name` and `kind`, all other fields defaulted.
    pub fn new(name: impl Into<SharedString>, kind: SymbolKind) -> Self {
        Self {
            name: name.into(),
            kind,
            is_type_only: false,
            symbol_space: SymbolSpace::Value,
            source: None,
            original_name: None,
            is_wildcard: false,
            is_namespace_export: false,
            is_explicit_export: false,
            is_global_augmentation: false,
            declared_in_file: None,
            signature: None,
            js_doc: None,
            dependencies: Arc::from([]),
            deprecated: None,
            visibility: None,
            since: None,
            decorators: Arc::from([]),
            heritage: Arc::from([]),
            modifiers: Arc::from([]),
        }
    }
}

/// A single import statement parsed from a `.d.ts` file.
#[derive(Debug, Clone)]
pub struct ParsedImport {
    /// The name as used in the file.
    pub name: SharedString,

    /// The module specifier (e.g., `"./lib/core"`).
    pub source: SharedString,

    /// The original name if aliased (`import { X as Y }` → `original_name = "X"`).
    pub original_name: Option<SharedString>,

    /// Whether this is a default import.
    pub is_default: bool,

    /// Whether this is a namespace import (`import * as ns`).
    pub is_namespace: bool,
}

// ─── Crawler Output ────────────────────────────────────────────

#[derive(Debug)]
pub struct CrawlResult {
    /// Absolute path of the crawled entry file.
    pub file_path: SharedString,

    /// All resolved exports from this file.
    pub exports: Vec<ResolvedSymbol>,

    /// Imports found per file.
    pub imports: HashMap<SharedString, Vec<ParsedImport>>,

    /// Files that were visited during this crawl.
    pub visited_files: Vec<SharedString>,

    /// Package names referenced via `/// <reference types="..." />` directives.
    pub type_reference_packages: Vec<SharedString>,

    /// Any circular references detected during crawling.
    pub circular_refs: Vec<String>,

    /// Direct `/// <reference path` edges: normalized absolute path → referenced paths (one hop each).
    pub triple_slash_reference_targets: HashMap<SharedString, Vec<SharedString>>,
}

#[derive(Debug, Clone)]
pub struct ResolvedSymbol {
    /// Symbol name as exported.
    pub name: SharedString,

    /// AST node kind.
    pub kind: SymbolKind,

    /// Whether this is type-only.
    pub is_type_only: bool,

    /// Type vs value namespace for this declaration.
    pub symbol_space: SymbolSpace,

    /// Full type signature.
    pub signature: Option<SharedString>,

    /// JSDoc comment.
    pub js_doc: Option<SharedString>,

    /// File where this symbol is actually defined.
    pub defined_in: SharedString,

    /// If re-exported, the chain of files it passed through.
    pub re_export_chain: Vec<SharedString>,

    /// Type references found in the declaration.
    pub dependencies: SharedVec<TypeReference>,

    /// Deprecation info.
    pub deprecated: Option<Deprecation>,

    /// API visibility level.
    pub visibility: Option<Visibility>,

    /// Version when this symbol was introduced.
    pub since: Option<SharedString>,

    /// Whether this is an internal (non-exported) symbol.
    pub is_internal: bool,

    /// Whether this symbol originates from `declare global { ... }`.
    pub is_global_augmentation: bool,

    /// Metadata for decorators attached to the declaration.
    pub decorators: SharedVec<DecoratorMetadata>,

    /// Names of classes or interfaces this symbol extends/implements.
    pub heritage: SharedVec<SharedString>,

    /// Whether this is an inherited symbol synthesized from a parent.
    pub is_inherited: bool,

    /// Parent symbol ids this symbol is inherited from (sorted, unique).
    pub inherited_from_sources: SharedVec<SharedString>,

    /// Structured modifiers.
    pub modifiers: SharedVec<SharedString>,
}

impl ResolvedSymbol {
    pub fn from_export(export: &ParsedExport, defined_in: impl Into<SharedString>) -> Self {
        Self {
            name: export.name.clone(),
            kind: export.kind,
            is_type_only: export.is_type_only,
            symbol_space: export.symbol_space,
            signature: export.signature.clone(),
            js_doc: export.js_doc.clone(),
            defined_in: defined_in.into(),
            re_export_chain: Vec::new(),
            dependencies: export.dependencies.clone(),
            deprecated: export.deprecated.clone(),
            visibility: export.visibility.clone(),
            since: export.since.clone(),
            is_internal: false,
            is_global_augmentation: export.is_global_augmentation,
            decorators: export.decorators.clone(),
            heritage: export.heritage.clone(),
            is_inherited: false,
            inherited_from_sources: SharedVec::from(Vec::new()),
            modifiers: export.modifiers.clone(),
        }
    }
}

// ─── Graph Output ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolNode {
    /// Unique ID.
    pub id: SharedString,

    /// Symbol name.
    pub name: SharedString,

    /// AST node kind identifier.
    pub kind: SymbolKind,

    /// Human-readable kind name.
    pub kind_name: SharedString,

    /// Package this symbol belongs to.
    pub package: SharedString,

    /// File path relative to package root.
    pub file_path: SharedString,

    /// Additional files that contribute to this symbol.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_files: Option<SharedVec<SharedString>>,

    /// Full type signature.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<SharedString>,

    /// JSDoc comment.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub js_doc: Option<SharedString>,

    /// Whether this is type-only.
    pub is_type_only: bool,

    /// Type vs value namespace for this declaration.
    pub symbol_space: SymbolSpace,

    /// IDs of symbols this one references.
    pub dependencies: SharedVec<SharedString>,

    /// ID of the original source symbol if re-exported.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub re_exported_from: Option<SharedString>,

    /// Deprecation info.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecated: Option<Deprecation>,

    /// API visibility.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<Visibility>,

    /// Version when this symbol was introduced.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<SharedString>,

    /// Whether this is an internal (non-exported) symbol.
    pub is_internal: bool,

    /// Whether this symbol originates from `declare global { ... }`.
    #[serde(skip_serializing_if = "is_false")]
    pub is_global_augmentation: bool,

    /// Metadata for decorators.
    #[serde(skip_serializing_if = "is_shared_vec_empty")]
    pub decorators: SharedVec<DecoratorMetadata>,

    /// Whether this is an inherited symbol synthesized from a parent.
    #[serde(skip_serializing_if = "is_false")]
    pub is_inherited: bool,

    /// Parent symbol ids this synthesized member is inherited from (sorted, unique).
    #[serde(skip_serializing_if = "is_shared_vec_empty")]
    pub inherited_from_sources: SharedVec<SharedString>,

    /// Names of classes or interfaces this symbol extends/implements.
    #[serde(skip_serializing_if = "is_shared_vec_empty")]
    pub heritage: SharedVec<SharedString>,

    /// Structured modifiers.
    #[serde(skip_serializing_if = "is_shared_vec_empty")]
    pub modifiers: SharedVec<SharedString>,

    /// Dedupe keys when merging [`Self::raw_dependencies`] across merged symbol rows.
    #[serde(skip)]
    pub dep_dedupe_keys: Option<HashSet<(SharedString, SharedString)>>,

    /// Original type references for resolution.
    #[serde(skip)]
    pub raw_dependencies: Vec<TypeReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageGraph {
    /// Package name.
    pub package: SharedString,

    /// Package version.
    pub version: SharedString,

    /// All resolved symbols.
    pub symbols: Vec<SymbolNode>,

    /// Total symbol count.
    pub total_symbols: usize,

    /// Total files crawled.
    pub total_files: usize,

    /// Wall time for [`crate::crawler::crawl`] only (parse + discovery + export resolution).
    #[serde(
        serialize_with = "serialize_duration_as_int",
        deserialize_with = "deserialize_duration_from_int"
    )]
    pub crawl_duration_ms: f64,

    /// Wall time for everything else in [`crate::graph::build_package_graph`]: types entry
    /// resolution, merge → symbol nodes, dependency ID resolution, inheritance flatten.
    #[serde(
        default = "default_zero_f64",
        serialize_with = "serialize_duration_as_int",
        deserialize_with = "deserialize_duration_from_int"
    )]
    pub build_duration_ms: f64,
}

fn default_zero_f64() -> f64 {
    0.0
}

fn serialize_duration_as_int<S>(val: &f64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_u64(*val as u64)
}

fn deserialize_duration_from_int<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let unit = u64::deserialize(deserializer)?;
    Ok(unit as f64)
}

fn is_shared_vec_empty<T>(v: &SharedVec<T>) -> bool {
    v.is_empty()
}

fn is_false(b: &bool) -> bool {
    !*b
}
