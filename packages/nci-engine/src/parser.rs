use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, LazyLock};

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use regex::Regex;

static TRIPLE_SLASH_PATH_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"///\s*<reference\s+path\s*=\s*"([^"]+)"\s*/>"#).unwrap());

static TRIPLE_SLASH_TYPES_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"///\s*<reference\s+types\s*=\s*"([^"]+)"\s*/>"#).unwrap());

use crate::constants::{
    BUILTIN_TYPES, MAX_RECURSION_DEPTH, SIGNATURE_MODIFIER_PREFIX_TOKENS, VISIBILITY_TAGS,
};
use crate::resolver::{normalize_path, resolve_module_specifier};
use crate::types::{
    Deprecation, ParsedExport, ParsedImport, SharedString, SharedVec, SymbolKind, SymbolSpace,
    TypeReference, Visibility,
};

/// The complete output of parsing a single `.d.ts` file.
#[derive(Debug)]
pub struct ParseResult {
    /// All classified export statements found in the file.
    pub exports: SharedVec<ParsedExport>,

    /// All import statements found in the file.
    pub imports: SharedVec<ParsedImport>,

    /// File references from `/// <reference path="..." />` directives.
    pub references: SharedVec<SharedString>,

    /// Type references from `/// <reference types="..." />` directives.
    pub type_references: SharedVec<SharedString>,

    /// Whether this file is an external module (`import`/`export` at top level).
    pub is_external_module: bool,
}

#[derive(Debug, Default, Clone)]
struct JsDocInfo {
    js_doc: Option<SharedString>,
    deprecated: Option<Deprecation>,
    visibility: Option<Visibility>,
    since: Option<SharedString>,
}

/// A reference to a local declaration for recursive resolution.
/// Uses zero-copy references into the oxc AST, tied to the allocator's lifetime.
enum LocalDecl<'a> {
    /// Type alias body or variable type annotation (e.g., `type Foo = { x: number }`)
    Type(&'a TSType<'a>),
    /// Interface body (e.g., `interface Config { name: string; }`)
    Interface(&'a TSInterfaceBody<'a>),
    /// Class declaration (e.g., `class Foo { ... }`)
    Class(&'a Class<'a>),
}

pub fn parse_file(file_path: &str) -> Option<ParseResult> {
    let source_text = match fs::read_to_string(file_path) {
        Ok(text) => text,
        Err(err) => {
            eprintln!("[nci-engine] Failed to read {}: {}", file_path, err);
            return None;
        }
    };
    Some(parse_file_from_source(file_path, &source_text))
}

pub fn parse_file_by_path(file_path: &std::path::Path) -> Result<ParseResult, std::io::Error> {
    let source_text = fs::read_to_string(file_path)?;
    let path_str = file_path.to_string_lossy();
    Ok(parse_file_from_source(&path_str, &source_text))
}

pub fn parse_file_from_source(_file_path: &str, source_text: &str) -> ParseResult {
    let allocator = Allocator::default();
    let source_type = SourceType::d_ts();
    let parser_return = Parser::new(&allocator, source_text, source_type).parse();

    if !parser_return.errors.is_empty() {
        eprintln!(
            "[nci-engine] {} parse error(s) in {}: {}",
            parser_return.errors.len(),
            _file_path,
            parser_return
                .errors
                .first()
                .map(|err| err.to_string())
                .unwrap_or_default()
        );
    }

    let program = parser_return.program;
    let current_file_owned = normalize_path(Path::new(_file_path));
    let current_file = current_file_owned.as_ref();

    let mut exports: Vec<ParsedExport> = Vec::new();
    let mut imports: Vec<ParsedImport> = Vec::new();
    let (references, type_references) = extract_triple_slash_directives(source_text);

    let is_external_module = is_external_module_program(&program);
    let is_script = !is_external_module;

    // ── Local declaration registry ────────────────────────────────────────
    // Build a lookup table of local declarations to resolve type references.
    let mut local_decls: HashMap<SharedString, LocalDecl<'_>> =
        HashMap::with_capacity(program.body.len().min(4096));
    for statement in &program.body {
        match statement {
            Statement::TSInterfaceDeclaration(iface) => {
                local_decls.insert(
                    iface.id.name.as_ref().into(),
                    LocalDecl::Interface(&iface.body),
                );
            }
            Statement::TSTypeAliasDeclaration(alias) => {
                local_decls.insert(
                    alias.id.name.as_ref().into(),
                    LocalDecl::Type(&alias.type_annotation),
                );
            }
            Statement::ClassDeclaration(class) => {
                if let Some(id) = &class.id {
                    local_decls.insert(id.name.as_ref().into(), LocalDecl::Class(class));
                }
            }
            Statement::VariableDeclaration(var_decl) => {
                for decl in &var_decl.declarations {
                    if let BindingPattern::BindingIdentifier(ident) = &decl.id
                        && let Some(anno) = &decl.type_annotation
                    {
                        local_decls.insert(
                            ident.name.as_ref().into(),
                            LocalDecl::Type(&anno.type_annotation),
                        );
                    }
                }
            }
            Statement::ExportNamedDeclaration(named) => {
                if let Some(decl) = &named.declaration {
                    match decl {
                        Declaration::TSInterfaceDeclaration(iface) => {
                            local_decls.insert(
                                iface.id.name.as_ref().into(),
                                LocalDecl::Interface(&iface.body),
                            );
                        }
                        Declaration::TSTypeAliasDeclaration(alias) => {
                            local_decls.insert(
                                alias.id.name.as_ref().into(),
                                LocalDecl::Type(&alias.type_annotation),
                            );
                        }
                        Declaration::ClassDeclaration(class) => {
                            if let Some(id) = &class.id {
                                local_decls
                                    .insert(id.name.as_ref().into(), LocalDecl::Class(class));
                            }
                        }
                        Declaration::VariableDeclaration(var_decl) => {
                            for decl in &var_decl.declarations {
                                if let BindingPattern::BindingIdentifier(ident) = &decl.id
                                    && let Some(anno) = &decl.type_annotation
                                {
                                    local_decls.insert(
                                        ident.name.as_ref().into(),
                                        LocalDecl::Type(&anno.type_annotation),
                                    );
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    // ── Symbol extraction ────────────────────────────────────────────────
    for statement in &program.body {
        match statement {
            Statement::ImportDeclaration(import_decl) => {
                extract_imports(import_decl, &mut imports);
            }

            Statement::TSImportEqualsDeclaration(import_eq) => {
                register_ts_import_equals_require(import_eq, &mut imports);
            }

            Statement::ExportNamedDeclaration(export_named) => {
                extract_export_named(
                    export_named,
                    source_text,
                    current_file,
                    &mut exports,
                    &local_decls,
                );
            }

            Statement::ExportDefaultDeclaration(export_default) => {
                extract_export_default(
                    export_default,
                    source_text,
                    current_file,
                    &mut exports,
                    &local_decls,
                );
            }

            Statement::ExportAllDeclaration(export_all) => {
                extract_export_all(export_all, source_text, &mut exports);
            }

            Statement::TSModuleDeclaration(module_decl) => {
                extract_module_declaration(
                    module_decl,
                    source_text,
                    current_file,
                    &mut exports,
                    is_script,
                    module_decl.span,
                    &local_decls,
                    false,
                    None,
                    None,
                );
            }

            Statement::TSGlobalDeclaration(global_decl) => {
                extract_global_declaration(
                    global_decl,
                    source_text,
                    current_file,
                    &mut exports,
                    &local_decls,
                    None,
                    None,
                );
            }

            // `export = expr` (CommonJS-style export assignment)
            Statement::TSExportAssignment(export_assign) => {
                let signature = get_span_text(source_text, export_assign.span);
                // Extract the identifier name from the expression if it's an IdentifierReference
                let name = match &export_assign.expression {
                    Expression::Identifier(ident) => ident.name.to_string(),
                    _ => "default".to_string(),
                };
                exports.push(ParsedExport {
                    name: name.into(),
                    kind: SymbolKind::ExportAssignment,
                    is_explicit_export: true,
                    signature: Some(signature),
                    ..Default::default()
                });
            }

            // `export as namespace X` (UMD-style namespace export)
            Statement::TSNamespaceExportDeclaration(ns_export) => {
                let name = ns_export.id.name.to_string();
                let signature = get_span_text(source_text, ns_export.span);
                let jsdoc = extract_jsdoc_from_leading_comments(source_text, ns_export.span);
                exports.push(ParsedExport {
                    name: name.into(),
                    kind: SymbolKind::NamespaceExportDeclaration,
                    is_namespace_export: true,
                    is_explicit_export: true,
                    signature: Some(signature),
                    js_doc: jsdoc.js_doc,
                    deprecated: jsdoc.deprecated,
                    visibility: jsdoc.visibility,
                    since: jsdoc.since,
                    ..Default::default()
                });
            }

            _ => {
                if let Some(direct_exports) = extract_direct_statement(
                    statement,
                    source_text,
                    is_script,
                    current_file,
                    &local_decls,
                    None,
                    None,
                ) {
                    exports.extend(direct_exports);
                }
            }
        }
    }

    ParseResult {
        exports: exports.into(),
        imports: imports.into(),
        references: references.into(),
        type_references: type_references.into(),
        is_external_module,
    }
}

fn is_external_module_program(program: &Program<'_>) -> bool {
    program.body.iter().any(|statement| {
        matches!(
            statement,
            Statement::ImportDeclaration(_)
                | Statement::ExportAllDeclaration(_)
                | Statement::ExportDefaultDeclaration(_)
                | Statement::ExportNamedDeclaration(_)
                | Statement::TSExportAssignment(_)
                | Statement::TSNamespaceExportDeclaration(_)
                | Statement::TSImportEqualsDeclaration(_)
        )
    })
}

/// Build the same-file declaration index as `parse_file` (for resolving `import("./x").Type` targets).
fn extend_local_decl_map_from_body<'a>(
    body: &'a [Statement<'a>],
    out: &mut HashMap<SharedString, LocalDecl<'a>>,
) {
    for statement in body {
        match statement {
            Statement::TSInterfaceDeclaration(iface) => {
                out.insert(
                    iface.id.name.as_ref().into(),
                    LocalDecl::Interface(&iface.body),
                );
            }
            Statement::TSTypeAliasDeclaration(alias) => {
                out.insert(
                    alias.id.name.as_ref().into(),
                    LocalDecl::Type(&alias.type_annotation),
                );
            }
            Statement::ClassDeclaration(class) => {
                if let Some(id) = &class.id {
                    out.insert(id.name.as_ref().into(), LocalDecl::Class(class));
                }
            }
            Statement::VariableDeclaration(var_decl) => {
                for decl in &var_decl.declarations {
                    if let BindingPattern::BindingIdentifier(ident) = &decl.id
                        && let Some(anno) = &decl.type_annotation
                    {
                        out.insert(
                            ident.name.as_ref().into(),
                            LocalDecl::Type(&anno.type_annotation),
                        );
                    }
                }
            }
            Statement::ExportNamedDeclaration(named) => {
                if let Some(decl) = &named.declaration {
                    match decl {
                        Declaration::TSInterfaceDeclaration(iface) => {
                            out.insert(
                                iface.id.name.as_ref().into(),
                                LocalDecl::Interface(&iface.body),
                            );
                        }
                        Declaration::TSTypeAliasDeclaration(alias) => {
                            out.insert(
                                alias.id.name.as_ref().into(),
                                LocalDecl::Type(&alias.type_annotation),
                            );
                        }
                        Declaration::ClassDeclaration(class) => {
                            if let Some(id) = &class.id {
                                out.insert(id.name.as_ref().into(), LocalDecl::Class(class));
                            }
                        }
                        Declaration::VariableDeclaration(var_decl) => {
                            for decl in &var_decl.declarations {
                                if let BindingPattern::BindingIdentifier(ident) = &decl.id
                                    && let Some(anno) = &decl.type_annotation
                                {
                                    out.insert(
                                        ident.name.as_ref().into(),
                                        LocalDecl::Type(&anno.type_annotation),
                                    );
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

/// Matches TypeScript’s “file prolog”: triple-slash directives may follow whitespace,
/// `//` comments, shebangs, and `/* … */` block comments (e.g. long license banners before refs).
fn extract_triple_slash_directives(source_text: &str) -> (Vec<SharedString>, Vec<SharedString>) {
    let mut references = Vec::new();
    let mut type_references = Vec::new();

    let path_regex = &*TRIPLE_SLASH_PATH_RE;
    let types_regex = &*TRIPLE_SLASH_TYPES_RE;
    let mut in_block_comment = false;

    for line in source_text.lines() {
        let trimmed = line.trim();

        if in_block_comment {
            if trimmed.contains("*/") {
                in_block_comment = false;
            }
            continue;
        }

        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("#!") {
            continue;
        }

        // Single-line // comments (not /// directives)
        if trimmed.starts_with("//") && !trimmed.starts_with("///") {
            continue;
        }

        if trimmed.starts_with("/*") {
            if !trimmed.contains("*/") {
                in_block_comment = true;
            }
            continue;
        }

        if !trimmed.starts_with("///") {
            break;
        }

        if let Some(caps) = path_regex.captures(trimmed) {
            if let Some(path) = caps.get(1) {
                references.push(SharedString::from(path.as_str()));
            }
        } else if let Some(caps) = types_regex.captures(trimmed)
            && let Some(types) = caps.get(1)
        {
            type_references.push(SharedString::from(types.as_str()));
        }
    }

    (references, type_references)
}

fn register_ts_import_equals_require(
    decl: &TSImportEqualsDeclaration<'_>,
    imports: &mut Vec<ParsedImport>,
) {
    let TSModuleReference::ExternalModuleReference(ext) = &decl.module_reference else {
        return;
    };
    let source = SharedString::from(ext.expression.value.as_str());
    imports.push(ParsedImport {
        name: SharedString::from(decl.id.name.as_ref()),
        source,
        original_name: None,
        is_default: false,
        is_namespace: false,
    });
}

fn extract_imports(import_decl: &ImportDeclaration<'_>, imports: &mut Vec<ParsedImport>) {
    let source = SharedString::from(import_decl.source.value.as_ref());

    if let Some(specifiers) = &import_decl.specifiers {
        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) => {
                    imports.push(ParsedImport {
                        name: SharedString::from(default_spec.local.name.as_ref()),
                        source: source.clone(),
                        original_name: None,
                        is_default: true,
                        is_namespace: false,
                    });
                }

                ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace_spec) => {
                    imports.push(ParsedImport {
                        name: SharedString::from(namespace_spec.local.name.as_ref()),
                        source: source.clone(),
                        original_name: None,
                        is_default: false,
                        is_namespace: true,
                    });
                }

                ImportDeclarationSpecifier::ImportSpecifier(named_spec) => {
                    let imported_name = module_export_name_to_string(&named_spec.imported);
                    let local_name = SharedString::from(named_spec.local.name.as_ref());
                    let original_name = if imported_name != local_name {
                        Some(imported_name)
                    } else {
                        None
                    };

                    imports.push(ParsedImport {
                        name: local_name,
                        source: source.clone(),
                        original_name,
                        is_default: false,
                        is_namespace: false,
                    });
                }
            }
        }
    }
}

/// Handles `export { ... }`, `export { ... } from '...'`, and `export <declaration>`.
fn extract_export_named<'a>(
    export_named: &ExportNamedDeclaration<'a>,
    source_text: &str,
    current_file: &str,
    exports: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
) {
    let source_module = export_named
        .source
        .as_ref()
        .map(|source_lit| SharedString::from(source_lit.value.as_ref()));

    // Re-export specifiers (export { A, B } from '...')
    if !export_named.specifiers.is_empty() {
        let is_type_only = export_named.export_kind.is_type();

        for specifier in &export_named.specifiers {
            let exported_name = module_export_name_to_string(&specifier.exported);
            let local_name = module_export_name_to_string(&specifier.local);
            let specifier_is_type_only = is_type_only || specifier.export_kind.is_type();

            let original_name = if local_name != exported_name {
                Some(local_name.clone())
            } else {
                None
            };

            let type_prefix = if specifier_is_type_only {
                "export type"
            } else {
                "export"
            };
            let specifier_text = match &original_name {
                Some(orig) => format!("{} as {}", orig, exported_name),
                None => exported_name.to_string(),
            };
            let source_clause = match &source_module {
                Some(src) => format!(" from '{}'", src),
                None => String::new(),
            };

            exports.push(ParsedExport {
                name: exported_name.clone(),
                kind: SymbolKind::ExportDeclaration,
                is_type_only: specifier_is_type_only,
                symbol_space: if specifier_is_type_only {
                    SymbolSpace::Type
                } else {
                    SymbolSpace::Value
                },
                source: source_module.clone(),
                original_name,
                is_explicit_export: true,
                signature: Some(SharedString::from(
                    format!("{} {{ {} }}{}", type_prefix, specifier_text, source_clause).as_ref(),
                )),
                ..Default::default()
            });
        }
        return;
    }

    // Exported declaration (export function foo() {}, export class Bar {}, etc.)
    if let Some(declaration) = &export_named.declaration {
        let decl_exports = extract_declaration(
            declaration,
            source_text,
            current_file,
            true,
            export_named.span,
            local_decls,
            None,
        );
        exports.extend(decl_exports);
    }
}

fn extract_export_default<'a>(
    export_default: &ExportDefaultDeclaration<'a>,
    source_text: &str,
    current_file: &str,
    exports: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
) {
    let name = match &export_default.declaration {
        ExportDefaultDeclarationKind::FunctionDeclaration(func_decl) => func_decl
            .id
            .as_ref()
            .map(|ident| SharedString::from(ident.name.as_ref()))
            .unwrap_or_else(|| SharedString::from("default")),

        ExportDefaultDeclarationKind::ClassDeclaration(class_decl) => class_decl
            .id
            .as_ref()
            .map(|ident| SharedString::from(ident.name.as_ref()))
            .unwrap_or_else(|| SharedString::from("default")),

        ExportDefaultDeclarationKind::TSInterfaceDeclaration(iface_decl) => {
            SharedString::from(iface_decl.id.name.as_ref())
        }

        kind if kind.is_expression() => match kind.as_expression() {
            Some(Expression::Identifier(ident)) => SharedString::from(ident.name.as_ref()),
            _ => SharedString::from("default"),
        },

        _ => SharedString::from("default"),
    };

    let signature = get_span_text(source_text, export_default.span);

    let kind = match &export_default.declaration {
        ExportDefaultDeclarationKind::ClassDeclaration(_) => SymbolKind::Class,
        ExportDefaultDeclarationKind::FunctionDeclaration(_) => SymbolKind::Function,
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => SymbolKind::Interface,
        _ => SymbolKind::ExportAssignment,
    };

    let is_default_interface = matches!(
        &export_default.declaration,
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_)
    );

    exports.push(ParsedExport {
        name: name.clone(),
        kind,
        is_type_only: is_default_interface,
        symbol_space: if is_default_interface {
            SymbolSpace::Type
        } else {
            SymbolSpace::Value
        },
        is_explicit_export: true,
        signature: Some(signature),
        modifiers: SharedVec::from([SharedString::from("default")]),
        ..Default::default()
    });

    // Also extract the underlying declaration as a non-exported local symbol.
    // This allows resolveLocalAssignment to resolve the ExportAssignment to
    // the actual declaration type (e.g., ClassDeclaration).
    //
    // We directly extract from the inner boxed types rather than constructing
    // a Declaration enum (which would require unsafe pointer casts).
    match &export_default.declaration {
        ExportDefaultDeclarationKind::FunctionDeclaration(func_decl) => {
            if let Some(id) = &func_decl.id {
                let func_name = id.name.to_string();
                let signature = get_span_text(source_text, func_decl.span);
                let jsdoc = extract_jsdoc_from_leading_comments(source_text, func_decl.span);
                let dependencies = extract_type_refs_from_function(func_decl);
                exports.push(ParsedExport {
                    name: func_name.into(),
                    kind: SymbolKind::Function,
                    signature: Some(signature),
                    js_doc: jsdoc.js_doc,
                    dependencies: dependencies.into(),
                    deprecated: jsdoc.deprecated,
                    visibility: jsdoc.visibility,
                    since: jsdoc.since,
                    ..Default::default()
                });
            }
        }
        ExportDefaultDeclarationKind::ClassDeclaration(class_decl) => {
            let class_name = class_decl
                .id
                .as_ref()
                .map(|ident| SharedString::from(ident.name.to_string()))
                .unwrap_or_else(|| name.clone());
            let signature = get_span_text(source_text, class_decl.span);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, class_decl.span);
            let dependencies = extract_type_refs_from_class(class_decl);
            let heritage = extract_heritage_from_class(source_text, class_decl);
            if class_decl.id.is_some() {
                exports.push(ParsedExport {
                    name: class_name.clone(),
                    kind: SymbolKind::Class,
                    signature: Some(signature),
                    js_doc: jsdoc.js_doc.clone(),
                    dependencies: dependencies.into(),
                    deprecated: jsdoc.deprecated.clone(),
                    visibility: jsdoc.visibility.clone(),
                    since: jsdoc.since.clone(),
                    heritage: heritage.into(),
                    ..Default::default()
                });
            }
            extract_class_members(
                class_decl,
                source_text,
                current_file,
                class_name.as_ref(),
                true,
                &jsdoc,
                exports,
                local_decls,
            );
        }
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(iface_decl) => {
            let iface_name = SharedString::from(iface_decl.id.name.to_string());
            let signature = get_span_text(source_text, iface_decl.span);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, iface_decl.span);
            let dependencies = extract_type_refs_from_interface(iface_decl);
            let heritage = extract_heritage_from_interface(source_text, iface_decl);
            exports.push(ParsedExport {
                name: iface_name.clone(),
                kind: SymbolKind::Interface,
                is_type_only: true,
                symbol_space: SymbolSpace::Type,
                signature: Some(signature),
                js_doc: jsdoc.js_doc.clone(),
                dependencies: dependencies.into(),
                deprecated: jsdoc.deprecated.clone(),
                visibility: jsdoc.visibility.clone(),
                since: jsdoc.since.clone(),
                heritage: heritage.into(),
                ..Default::default()
            });
            extract_interface_members(
                iface_decl,
                source_text,
                current_file,
                iface_name.as_ref(),
                false,
                &jsdoc,
                exports,
                local_decls,
            );
        }
        _ => {}
    }
}

/// Handles `export * from '...'` and `export * as ns from '...'`.
fn extract_export_all(
    export_all: &ExportAllDeclaration<'_>,
    source_text: &str,
    exports: &mut Vec<ParsedExport>,
) {
    let source = export_all.source.value.to_string();
    let is_type_only = export_all.export_kind.is_type();

    if let Some(exported_name) = &export_all.exported {
        // export * as ns from '...'
        let namespace_name = SharedString::from(module_export_name_to_string(exported_name));
        let type_prefix = if is_type_only {
            "export type"
        } else {
            "export"
        };
        let source_shared = SharedString::from(source);

        exports.push(ParsedExport {
            name: namespace_name.clone(),
            kind: SymbolKind::ExportDeclaration,
            is_type_only,
            symbol_space: if is_type_only {
                SymbolSpace::Type
            } else {
                SymbolSpace::Value
            },
            source: Some(source_shared.clone()),
            is_namespace_export: true,
            is_explicit_export: true,
            signature: Some(SharedString::from(
                format!(
                    "{} * as {} from '{}'",
                    type_prefix, namespace_name, source_shared
                )
                .as_ref(),
            )),
            ..Default::default()
        });
    } else {
        // export * from '...'
        let type_prefix = if is_type_only {
            "export type"
        } else {
            "export"
        };

        exports.push(ParsedExport {
            name: SharedString::from("*"),
            kind: SymbolKind::ExportDeclaration,
            is_type_only,
            symbol_space: if is_type_only {
                SymbolSpace::Type
            } else {
                SymbolSpace::Value
            },
            source: Some(source.clone().into()),
            is_wildcard: true,
            is_explicit_export: true,
            signature: Some(SharedString::from(
                format!("{} * from '{}'", type_prefix, source).as_ref(),
            )),
            ..Default::default()
        });
    }

    // Also record as an import for the crawler to follow
    let _ = source_text; // Used for consistency; export_all is self-contained
}

fn type_ref_dedupe_key(d: &TypeReference) -> String {
    format!(
        "{}|{}",
        d.name.as_ref(),
        d.import_path.as_deref().unwrap_or("")
    )
}

/// Rolls up `dependencies` from declarations nested under a namespace/module so the container
/// row reflects every type edge reachable inside its subtree (not only the headline signature).
fn merge_nested_dependencies_into_namespace(
    exports: &mut [ParsedExport],
    ns_idx: usize,
    nested_start: usize,
) {
    if nested_start >= exports.len() || ns_idx >= nested_start {
        return;
    }
    let (head, nested_slice) = exports.split_at_mut(nested_start);
    let Some(ns) = head.get_mut(ns_idx) else {
        return;
    };
    let mut seen: HashSet<String> = ns.dependencies.iter().map(type_ref_dedupe_key).collect();
    let mut extra: Vec<TypeReference> = Vec::new();
    for nested in nested_slice.iter() {
        for type_ref in nested.dependencies.iter() {
            let dedupe_key = type_ref_dedupe_key(type_ref);
            if seen.insert(dedupe_key) {
                extra.push(type_ref.clone());
            }
        }
    }
    if extra.is_empty() {
        return;
    }
    let mut merged = ns.dependencies.to_vec();
    merged.extend(extra);
    ns.dependencies = merged.into();
}

/// Stamps `enclosing_module_declaration_name` for rows lexically inside an ambient module block.
/// Skips the `ModuleDeclaration` row whose `name` equals the innermost ambient name (no self-edge).
fn apply_ambient_module_enclosure(exports: &mut [ParsedExport], ambient: Option<&SharedString>) {
    let Some(ambient_name) = ambient else {
        return;
    };
    for export_row in exports.iter_mut() {
        if export_row.kind == SymbolKind::Namespace
            && export_row.name.as_ref() == ambient_name.as_ref()
        {
            continue;
        }
        if export_row
            .enclosing_module_declaration_name
            .as_ref()
            .is_some_and(|existing| Arc::ptr_eq(existing, ambient_name))
        {
            continue;
        }
        export_row.enclosing_module_declaration_name = Some(ambient_name.clone());
    }
}

#[allow(clippy::too_many_arguments)]
fn extract_module_declaration<'a>(
    module_decl: &TSModuleDeclaration<'a>,
    source_text: &str,
    current_file: &str,
    exports: &mut Vec<ParsedExport>,
    is_script: bool,
    outer_span: oxc_span::Span,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    // True when `export` wraps this namespace (or `export namespace` / `export declare namespace`).
    namespace_is_explicit_export: bool,
    // `global_enclosing_qualifier` drives how names inside a `global`-named block get prefixed:
    // None → top-level `global` (members unprefixed); Some("") → under `declare module "…"`
    // (inner names become `global.*`); Some("Ns") → under `namespace Ns` (`Ns.global.*`).
    global_enclosing_qualifier: Option<&str>,
    // When nested in another ambient module: outer module row `name` (resolved to graph id later).
    lexical_parent_module: Option<SharedString>,
) {
    let module_name = match &module_decl.id {
        TSModuleDeclarationName::Identifier(ident) => SharedString::from(ident.name.as_str()),
        TSModuleDeclarationName::StringLiteral(string_lit) => {
            SharedString::from(string_lit.value.as_str())
        }
    };

    let is_global = module_name.as_ref() == "global";
    let is_string_module = matches!(&module_decl.id, TSModuleDeclarationName::StringLiteral(_));

    let signature = SharedString::from(get_span_text(source_text, outer_span).trim());

    let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);

    let mut modifiers: Vec<SharedString> = Vec::new();
    if module_decl.declare {
        modifiers.push(SharedString::from("declare"));
    }
    if namespace_is_explicit_export && !is_global && !is_string_module {
        modifiers.push(SharedString::from("export"));
    }
    modifiers.sort();

    // Only file-top `global` is treated as an augmentation wrapper (flagged for downstream).
    // A `global { }` nested only under `declare module "…"` is ordinary ambient structure; if we
    // flag it the same way, the crawler drops the namespace row as a duplicate “global” shell.
    let global_wrap_is_augmentation = is_global && global_enclosing_qualifier.is_none();

    let mut module_row = ParsedExport {
        name: module_name.clone(),
        kind: SymbolKind::Namespace,
        is_explicit_export: namespace_is_explicit_export && !is_global && !is_string_module,
        is_global_augmentation: global_wrap_is_augmentation,
        signature: Some(signature),
        js_doc: jsdoc.js_doc,
        deprecated: jsdoc.deprecated,
        visibility: jsdoc.visibility,
        since: jsdoc.since,
        modifiers: SharedVec::from(modifiers),
        ..Default::default()
    };
    if let Some(ref parent_mod) = lexical_parent_module
        && parent_mod.as_ref() != module_name.as_ref()
    {
        module_row.enclosing_module_declaration_name = Some(parent_mod.clone());
    }
    exports.push(module_row);
    let module_row_idx = exports.len() - 1;

    // Recurse into module body to extract nested exports.
    // Ambient string modules (`declare module "m"`) use an empty `parent_name` for children so
    // exports surface as `Foo`, not `"m".Foo`. Nested `global` blocks still need a `global.*`
    // (or `Ns.global.*`) prefix so nested members don’t collide with the enclosing scope.
    let child_parent_name: Cow<'_, str> = if is_global {
        match global_enclosing_qualifier {
            None => Cow::Borrowed(""),
            Some("") => Cow::Borrowed("global"),
            Some(ns) => Cow::Owned(format!("{ns}.global")),
        }
    } else if is_string_module {
        // Top-level `declare module "m"` keeps children unqualified (`Foo`, not `"m".Foo`).
        // Nested `declare module "Inner"` (inside another module) matches TS: qualify as
        // `Inner.member` (see ambient-module-block-nesting fixture).
        if lexical_parent_module.is_some() {
            Cow::Borrowed(module_name.as_ref())
        } else {
            Cow::Borrowed("")
        }
    } else {
        Cow::Borrowed(module_name.as_ref())
    };
    let before_len = exports.len();

    if let Some(body) = &module_decl.body {
        extract_module_body(
            body,
            source_text,
            current_file,
            exports,
            child_parent_name.as_ref(),
            is_script,
            local_decls,
            Some(module_name.clone()),
        );
    }

    if exports.len() > before_len {
        merge_nested_dependencies_into_namespace(exports, module_row_idx, before_len);
    }

    // Tag rows with the effective enclosing namespace simple name. Nested identifier namespaces
    // use the outermost name (`lexical_parent_module` when set, else this declaration's name).
    // `declare global { }` keeps stamping with `global`. String `declare module "…"` omits this.
    if !is_string_module {
        let stamp = if is_global {
            module_name.clone()
        } else {
            lexical_parent_module
                .clone()
                .unwrap_or_else(|| module_name.clone())
        };
        apply_ambient_module_enclosure(&mut exports[module_row_idx..], Some(&stamp));
    }

    // Propagate the augmentation flag only for true file-top `global` wrappers (see above).
    if global_wrap_is_augmentation {
        for nested in exports.iter_mut().skip(before_len) {
            nested.is_global_augmentation = true;
        }
    }
}

fn extract_global_declaration<'a>(
    global_decl: &TSGlobalDeclaration<'a>,
    source_text: &str,
    current_file: &str,
    exports: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    // Same semantics as `extract_module_declaration`'s `global_enclosing_qualifier`.
    global_enclosing_qualifier: Option<&str>,
    // When `declare global` sits inside `declare module "…"`, stamp the synthetic `global` row.
    ambient_enclosing_for_global_row: Option<SharedString>,
) {
    let signature_text = get_span_text(source_text, global_decl.span);
    let signature = SharedString::from(
        (signature_text
            .split('{')
            .next()
            .unwrap_or(&signature_text)
            .trim()
            .to_string()
            + " { ... }")
            .as_ref(),
    );
    let jsdoc = extract_jsdoc_from_leading_comments(source_text, global_decl.span);

    // `Some("")` means “only inside a string module”, not under a real namespace: that `global`
    // block is lexical scoping, not the file-top augment pattern, so skip augmentation metadata.
    let global_decl_is_augmentation = !matches!(global_enclosing_qualifier, Some(""));

    let mut global_row = ParsedExport {
        name: SharedString::from("global"),
        kind: SymbolKind::Namespace,
        is_explicit_export: false,
        is_global_augmentation: global_decl_is_augmentation,
        signature: Some(signature),
        js_doc: jsdoc.js_doc,
        deprecated: jsdoc.deprecated,
        visibility: jsdoc.visibility,
        since: jsdoc.since,
        ..Default::default()
    };
    if let Some(ref outer) = ambient_enclosing_for_global_row {
        global_row.enclosing_module_declaration_name = Some(outer.clone());
    }
    exports.push(global_row);

    let member_prefix: Cow<'_, str> = match global_enclosing_qualifier {
        None => Cow::Borrowed(""),
        Some("") => Cow::Borrowed("global"),
        Some(ns) => Cow::Owned(format!("{ns}.global")),
    };

    // `export interface Foo {}` inside `declare global` is `ExportNamedDeclaration`, not a bare
    // `TSInterfaceDeclaration`. Mirror `extract_module_body`: unwrap declaration first.
    for statement in &global_decl.body.body {
        let is_exported = statement_has_export_keyword(statement);
        if let Statement::ExportNamedDeclaration(export_named) = statement
            && let Some(declaration) = &export_named.declaration
        {
            let mut decl_exports = extract_declaration(
                declaration,
                source_text,
                current_file,
                true,
                export_named.span,
                local_decls,
                Some(SharedString::from("global")),
            );
            for export_item in &mut decl_exports {
                export_item.is_explicit_export = true;
                export_item.is_global_augmentation = global_decl_is_augmentation;
            }
            apply_namespace_qualifier_to_exports(member_prefix.as_ref(), &mut decl_exports);
            exports.extend(decl_exports);
            continue;
        }
        if let Some(mut decl_exports) = extract_direct_statement(
            statement,
            source_text,
            false,
            current_file,
            local_decls,
            None,
            Some(SharedString::from("global")),
        ) {
            for export_item in &mut decl_exports {
                export_item.is_explicit_export = is_exported;
                export_item.is_global_augmentation = global_decl_is_augmentation;
            }
            apply_namespace_qualifier_to_exports(member_prefix.as_ref(), &mut decl_exports);
            exports.extend(decl_exports);
        }
    }
}

/// True if `name` should be prefixed with `parent.` inside a namespace block.
/// Uses a dotted boundary so `Brand` + `BrandErrors` still becomes `Brand.BrandErrors`
/// (plain `starts_with(parent)` would wrongly treat `BrandErrors` as already qualified).
fn needs_namespace_qualifier(name: &str, parent: &str) -> bool {
    // Same simple name as the parent namespace still needs `Parent.Child` (e.g. `Scope` inside
    // `namespace Scope`); skipping when `name == parent` would merge two different declarations.
    if parent.is_empty() {
        return false;
    }
    match name.strip_prefix(parent) {
        Some(rest) if rest.starts_with('.') => false,
        Some(_) => true,
        None => true,
    }
}

/// Applies `parent.` to declaration roots inside a namespace block, then extends that prefix to
/// member rows that still use the **pre-qualification** root (`Foo.bar` → `Ns.Foo.bar`).
///
/// Without the second step, `namespace Scope { interface Scope { x } }` leaves members as
/// `Scope.x` (because `needs_namespace_qualifier` treats them as already under `Scope`) while the
/// interface row becomes `Scope.Scope`, diverging from TS merge naming (`Scope.Scope.x`).
fn apply_namespace_qualifier_to_exports(parent_name: &str, exports: &mut [ParsedExport]) {
    let mut qualified_roots: Vec<(SharedString, SharedString)> = Vec::new();
    for export_item in exports.iter_mut() {
        if !needs_namespace_qualifier(export_item.name.as_ref(), parent_name) {
            continue;
        }
        let old_root_name = export_item.name.clone();
        let new_root_name: SharedString =
            format!("{}.{}", parent_name, old_root_name.as_ref()).into();
        if matches!(
            export_item.kind,
            SymbolKind::Interface | SymbolKind::Class | SymbolKind::TypeAlias | SymbolKind::Enum
        ) {
            qualified_roots.push((old_root_name, new_root_name.clone()));
        }
        export_item.name = new_root_name;
    }
    for (old_prefix, new_prefix) in qualified_roots {
        let old_prefix_dot = format!("{}.", old_prefix.as_ref());
        let new_prefix_dot = format!("{}.", new_prefix.as_ref());
        for export_item in exports.iter_mut() {
            let full_name = export_item.name.as_ref();
            if full_name == new_prefix.as_ref() {
                continue;
            }
            if full_name.starts_with(&old_prefix_dot) && !full_name.starts_with(&new_prefix_dot) {
                let suffix = &full_name[old_prefix_dot.len()..];
                export_item.name = format!("{}{}", new_prefix_dot, suffix).into();
            }
        }
    }
}

/// Recursively extracts exports from module/namespace bodies.
#[allow(clippy::too_many_arguments)]
fn extract_module_body<'a>(
    body: &TSModuleDeclarationBody<'a>,
    source_text: &str,
    current_file: &str,
    exports: &mut Vec<ParsedExport>,
    parent_name: &str,
    is_script: bool,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    // Innermost ambient module `name` for symbols in this block (resolved to graph ids later).
    ambient_innermost: Option<SharedString>,
) {
    match body {
        TSModuleDeclarationBody::TSModuleBlock(block) => {
            for statement in &block.body {
                // Inside namespace blocks, exported declarations appear as
                // ExportNamedDeclaration wrapping the actual declaration.
                // Handle these explicitly before falling through to extract_direct_statement.
                if let Statement::ExportNamedDeclaration(export_named) = statement
                    && let Some(declaration) = &export_named.declaration
                {
                    let mut decl_exports = extract_declaration(
                        declaration,
                        source_text,
                        current_file,
                        true,
                        export_named.span,
                        local_decls,
                        ambient_innermost.clone(),
                    );
                    apply_namespace_qualifier_to_exports(parent_name, &mut decl_exports);
                    exports.extend(decl_exports);
                    continue;
                }

                let is_exported = statement_has_export_keyword(statement);
                if let Some(mut decl_exports) = extract_direct_statement(
                    statement,
                    source_text,
                    is_script,
                    current_file,
                    local_decls,
                    Some(parent_name),
                    ambient_innermost.clone(),
                ) {
                    for export_item in &mut decl_exports {
                        export_item.is_explicit_export = is_exported;
                    }
                    apply_namespace_qualifier_to_exports(parent_name, &mut decl_exports);
                    exports.extend(decl_exports);
                }
                // `TSGlobalDeclaration` is handled inside `extract_direct_statement` — do not duplicate here.
            }
        }
        TSModuleDeclarationBody::TSModuleDeclaration(nested_module) => {
            extract_module_declaration(
                nested_module,
                source_text,
                current_file,
                exports,
                is_script,
                nested_module.span,
                local_decls,
                false,
                Some(parent_name),
                ambient_innermost.clone(),
            );
        }
    }
}

/// Extracts parsed exports from a declaration node (function, class, interface, etc.).
fn extract_declaration<'a>(
    declaration: &Declaration<'a>,
    source_text: &str,
    current_file: &str,
    is_explicit_export: bool,
    outer_span: oxc_span::Span,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    ambient_apply: Option<SharedString>,
) -> Vec<ParsedExport> {
    let mut results: Vec<ParsedExport> = Vec::new();

    match declaration {
        Declaration::FunctionDeclaration(func_decl) => {
            let name = func_decl
                .id
                .as_ref()
                .map(|ident| SharedString::from(ident.name.as_ref()))
                .unwrap_or_else(|| SharedString::from("<unnamed>"));
            let signature = get_span_text(
                source_text,
                if is_explicit_export {
                    outer_span
                } else {
                    func_decl.span
                },
            );
            let dependencies = extract_type_refs_from_function(func_decl);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);

            let mut modifiers = extract_declaration_modifiers(declaration);
            if is_explicit_export {
                modifiers.push(SharedString::from("export"));
                modifiers.sort();
            }

            let export_item = ParsedExport {
                name,
                kind: SymbolKind::Function,
                is_explicit_export,
                signature: Some(signature),
                js_doc: jsdoc.js_doc,
                dependencies: dependencies.into(),
                deprecated: jsdoc.deprecated,
                visibility: jsdoc.visibility,
                since: jsdoc.since,
                modifiers: SharedVec::from(modifiers),
                ..Default::default()
            };
            results.push(export_item);
        }

        Declaration::ClassDeclaration(class_decl) => {
            let name = class_decl
                .id
                .as_ref()
                .map(|ident| SharedString::from(ident.name.as_ref()))
                .unwrap_or_else(|| SharedString::from("<unnamed>"));
            let signature = get_span_text(
                source_text,
                if is_explicit_export {
                    outer_span
                } else {
                    class_decl.span
                },
            );
            let dependencies = extract_type_refs_from_class(class_decl);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);
            let heritage = extract_heritage_from_class(source_text, class_decl);

            let mut modifiers = extract_declaration_modifiers(declaration);
            if is_explicit_export {
                modifiers.push(SharedString::from("export"));
                modifiers.sort();
            }

            let export_item = ParsedExport {
                name: name.clone(),
                kind: SymbolKind::Class,
                is_explicit_export,
                signature: Some(signature),
                js_doc: jsdoc.js_doc.clone(),
                dependencies: dependencies.into(),
                deprecated: jsdoc.deprecated.clone(),
                visibility: jsdoc.visibility.clone(),
                since: jsdoc.since.clone(),
                heritage: heritage.into(),
                modifiers: SharedVec::from(modifiers),
                ..Default::default()
            };
            results.push(export_item);

            extract_class_members(
                class_decl,
                source_text,
                current_file,
                &name,
                is_explicit_export,
                &jsdoc,
                &mut results,
                local_decls,
            );
        }

        Declaration::TSInterfaceDeclaration(iface_decl) => {
            let name = SharedString::from(iface_decl.id.name.as_ref());
            let signature = get_span_text(
                source_text,
                if is_explicit_export {
                    outer_span
                } else {
                    iface_decl.span
                },
            );
            let dependencies = extract_type_refs_from_interface(iface_decl);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);
            let heritage = extract_heritage_from_interface(source_text, iface_decl);

            let mut modifiers = extract_declaration_modifiers(declaration);
            if is_explicit_export {
                modifiers.push(SharedString::from("export"));
                modifiers.sort();
            }

            let export_item = ParsedExport {
                name: name.clone(),
                kind: SymbolKind::Interface,
                is_type_only: true,
                symbol_space: SymbolSpace::Type,
                is_explicit_export,
                signature: Some(signature),
                js_doc: jsdoc.js_doc.clone(),
                dependencies: dependencies.into(),
                deprecated: jsdoc.deprecated.clone(),
                visibility: jsdoc.visibility.clone(),
                since: jsdoc.since.clone(),
                heritage: heritage.into(),
                modifiers: SharedVec::from(modifiers),
                ..Default::default()
            };
            results.push(export_item);

            extract_interface_members(
                iface_decl,
                source_text,
                current_file,
                &name,
                is_explicit_export,
                &jsdoc,
                &mut results,
                local_decls,
            );
        }

        Declaration::TSTypeAliasDeclaration(type_alias) => {
            let name = SharedString::from(type_alias.id.name.as_ref());
            let signature = get_span_text(
                source_text,
                if is_explicit_export {
                    outer_span
                } else {
                    type_alias.span
                },
            );
            let dependencies = extract_type_refs_from_ts_type(&type_alias.type_annotation);
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);

            let mut modifiers = extract_declaration_modifiers(declaration);
            if is_explicit_export {
                modifiers.push(SharedString::from("export"));
                modifiers.sort();
            }

            results.push(ParsedExport {
                name: name.clone(),
                kind: SymbolKind::TypeAlias,
                is_type_only: true,
                symbol_space: SymbolSpace::Type,
                is_explicit_export,
                signature: Some(signature),
                js_doc: jsdoc.js_doc.clone(),
                dependencies: dependencies.into(),
                deprecated: jsdoc.deprecated.clone(),
                visibility: jsdoc.visibility.clone(),
                since: jsdoc.since.clone(),
                modifiers: SharedVec::from(modifiers),
                ..Default::default()
            });
            extract_complex_type_members(
                &type_alias.type_annotation,
                source_text,
                current_file,
                name.as_ref(),
                is_explicit_export,
                &jsdoc,
                &mut results,
                local_decls,
                &mut HashSet::new(),
                0,
                None,
            );
        }

        Declaration::TSEnumDeclaration(enum_decl) => {
            let name = SharedString::from(enum_decl.id.name.as_ref());
            let signature = get_span_text(
                source_text,
                if is_explicit_export {
                    outer_span
                } else {
                    enum_decl.span
                },
            );
            let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);

            let mut modifiers = extract_declaration_modifiers(declaration);
            if is_explicit_export {
                modifiers.push(SharedString::from("export"));
                modifiers.sort();
            }

            results.push(ParsedExport {
                name,
                kind: SymbolKind::Enum,
                is_explicit_export,
                signature: Some(signature),
                js_doc: jsdoc.js_doc,
                deprecated: jsdoc.deprecated,
                visibility: jsdoc.visibility,
                since: jsdoc.since,
                modifiers: SharedVec::from(modifiers),
                ..Default::default()
            });
        }

        Declaration::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(binding_ident) = &declarator.id {
                    let name = SharedString::from(binding_ident.name.as_ref());
                    let type_text = declarator
                        .type_annotation
                        .as_ref()
                        .map(|annotation| {
                            get_span_text(source_text, annotation.type_annotation.span())
                        })
                        .unwrap_or_else(|| SharedString::from("any"));
                    let signature = SharedString::from(
                        format!("declare const {}: {}", name, type_text).as_ref(),
                    );
                    let dependencies = declarator
                        .type_annotation
                        .as_ref()
                        .map(|annotation| {
                            extract_type_refs_from_ts_type(&annotation.type_annotation)
                        })
                        .unwrap_or_default();
                    let jsdoc = extract_jsdoc_from_leading_comments(source_text, outer_span);

                    let mut modifiers = extract_declaration_modifiers(declaration);
                    if is_explicit_export {
                        modifiers.push(SharedString::from("export"));
                        modifiers.sort();
                    }

                    results.push(ParsedExport {
                        name: name.clone(),
                        kind: SymbolKind::Variable,
                        is_explicit_export,
                        signature: Some(signature),
                        js_doc: jsdoc.js_doc.clone(),
                        dependencies: dependencies.into(),
                        deprecated: jsdoc.deprecated.clone(),
                        visibility: jsdoc.visibility.clone(),
                        since: jsdoc.since.clone(),
                        modifiers: SharedVec::from(modifiers),
                        ..Default::default()
                    });

                    // Extract members from complex type annotations (type literals, intersections)
                    if let Some(annotation) = &declarator.type_annotation {
                        extract_complex_type_members(
                            &annotation.type_annotation,
                            source_text,
                            current_file,
                            &name,
                            is_explicit_export,
                            &jsdoc,
                            &mut results,
                            local_decls,
                            &mut HashSet::new(),
                            0,
                            None,
                        );
                    }
                }
            }
        }

        Declaration::TSModuleDeclaration(module_decl) => {
            extract_module_declaration(
                module_decl,
                source_text,
                current_file,
                &mut results,
                false,
                outer_span,
                local_decls,
                is_explicit_export,
                None,
                ambient_apply.clone(),
            );
            return results;
        }

        _ => {}
    }

    apply_ambient_module_enclosure(&mut results, ambient_apply.as_ref());
    results
}

/// Attempts to extract exports from non-export-wrapped top-level statements.
///
/// In `.d.ts` files, ambient declarations (`declare function`, `declare class`, etc.)
/// can appear at the top level without an explicit `export` keyword.
fn extract_direct_statement<'a>(
    statement: &'a Statement<'a>,
    source_text: &str,
    is_script: bool,
    current_file: &str,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    // In a namespace or module body, `Some(prefix)` is the qualifier applied before member names.
    global_enclosing_qualifier: Option<&str>,
    // Innermost ambient module name for symbols from this statement (`declare global` body uses "global").
    ambient_apply: Option<SharedString>,
) -> Option<Vec<ParsedExport>> {
    let is_exported = statement_has_export_keyword(statement);

    match statement {
        // `export interface` / `export type` / `export declare function` in ambient bodies are often
        // `ExportNamedDeclaration` wrapping a declaration, not a bare declaration statement.
        Statement::ExportNamedDeclaration(export_named) => {
            let declaration = export_named.declaration.as_ref()?;
            let results = extract_declaration(
                declaration,
                source_text,
                current_file,
                true,
                export_named.span,
                local_decls,
                ambient_apply.clone(),
            );
            Some(results)
        }
        Statement::VariableDeclaration(var_decl) => {
            let mut results = Vec::new();
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(binding_ident) = &declarator.id {
                    let name = SharedString::from(binding_ident.name.to_string());
                    let type_text = declarator
                        .type_annotation
                        .as_ref()
                        .map(|annotation| {
                            get_span_text(source_text, annotation.type_annotation.span())
                        })
                        .unwrap_or_else(|| SharedString::from("any"));
                    let signature = format!("declare const {}: {}", name, type_text);
                    let dependencies = declarator
                        .type_annotation
                        .as_ref()
                        .map(|annotation| {
                            extract_type_refs_from_ts_type(&annotation.type_annotation)
                        })
                        .unwrap_or_default();
                    let jsdoc = extract_jsdoc_from_leading_comments(source_text, var_decl.span);

                    let mut modifiers = if var_decl.declare {
                        vec![SharedString::from("declare")]
                    } else {
                        Vec::new()
                    };
                    if is_exported {
                        modifiers.push(SharedString::from("export"));
                    }
                    modifiers.sort();

                    let export_item = ParsedExport {
                        name: name.clone(),
                        kind: SymbolKind::Variable,
                        is_explicit_export: is_exported,
                        is_global_augmentation: false,
                        signature: Some(signature.into()),
                        js_doc: jsdoc.js_doc.clone(),
                        dependencies: dependencies.into(),
                        deprecated: jsdoc.deprecated.clone(),
                        visibility: jsdoc.visibility.clone(),
                        since: jsdoc.since.clone(),
                        modifiers: SharedVec::from(modifiers),
                        ..Default::default()
                    };
                    results.push(export_item);

                    // Extract members from complex type annotations (type literals, intersections)
                    if let Some(annotation) = &declarator.type_annotation {
                        extract_complex_type_members(
                            &annotation.type_annotation,
                            source_text,
                            current_file,
                            &name,
                            is_exported,
                            &jsdoc,
                            &mut results,
                            local_decls,
                            &mut HashSet::new(),
                            0,
                            None,
                        );
                    }
                }
            }
            apply_ambient_module_enclosure(&mut results, ambient_apply.as_ref());
            if results.is_empty() {
                None
            } else {
                Some(results)
            }
        }

        // Use the Declaration extraction for known declaration types
        Statement::FunctionDeclaration(_)
        | Statement::ClassDeclaration(_)
        | Statement::TSInterfaceDeclaration(_)
        | Statement::TSTypeAliasDeclaration(_)
        | Statement::TSEnumDeclaration(_) => {
            // Convert statement to declaration for reuse
            let declaration = statement_to_declaration(statement)?;
            let results = extract_declaration(
                declaration,
                source_text,
                current_file,
                is_exported,
                statement.span(),
                local_decls,
                ambient_apply.clone(),
            );
            Some(results)
        }

        Statement::TSModuleDeclaration(module_decl) => {
            let mut results = Vec::new();
            extract_module_declaration(
                module_decl,
                source_text,
                current_file,
                &mut results,
                is_script,
                module_decl.span,
                local_decls,
                is_exported,
                global_enclosing_qualifier,
                ambient_apply.clone(),
            );
            Some(results)
        }
        Statement::TSGlobalDeclaration(global_decl) => {
            let mut results = Vec::new();
            extract_global_declaration(
                global_decl,
                source_text,
                current_file,
                &mut results,
                local_decls,
                global_enclosing_qualifier,
                ambient_apply.clone(),
            );
            Some(results)
        }

        _ => None,
    }
}

/// Converts a statement reference to a declaration reference for reuse.
fn statement_to_declaration<'a>(statement: &'a Statement<'a>) -> Option<&'a Declaration<'a>> {
    match statement {
        Statement::FunctionDeclaration(_)
        | Statement::ClassDeclaration(_)
        | Statement::TSInterfaceDeclaration(_)
        | Statement::TSTypeAliasDeclaration(_)
        | Statement::TSEnumDeclaration(_)
        | Statement::VariableDeclaration(_)
        | Statement::TSModuleDeclaration(_) => {
            // Safety: these Statement variants are layout-identical to their Declaration counterparts
            // in oxc's AST. We use the to_declaration method.
            statement.as_declaration()
        }
        _ => None,
    }
}

/// Extracts instance and static members from a class declaration.
#[allow(clippy::too_many_arguments)]
fn extract_class_members<'a>(
    class_decl: &Class<'a>,
    source_text: &str,
    _current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    _local_decls: &HashMap<SharedString, LocalDecl<'a>>,
) {
    for member in &class_decl.body.body {
        let (member_name_opt, member_span, is_static, _member_kind) = match member {
            ClassElement::PropertyDefinition(prop) => {
                let name = property_key_to_string(&prop.key, source_text);
                let is_static = prop.r#static;
                (name, prop.span, is_static, SymbolKind::PropertyDeclaration)
            }
            ClassElement::MethodDefinition(method) => {
                if method.kind == MethodDefinitionKind::Constructor {
                    continue;
                }
                let name = property_key_to_string(&method.key, source_text);
                let is_static = method.r#static;
                let kind = match method.kind {
                    MethodDefinitionKind::Get => SymbolKind::GetAccessor,
                    MethodDefinitionKind::Set => SymbolKind::SetAccessor,
                    _ => SymbolKind::MethodDeclaration,
                };
                (name, method.span, is_static, kind)
            }
            ClassElement::TSIndexSignature(_) => continue,
            ClassElement::AccessorProperty(accessor) => {
                let name = property_key_to_string(&accessor.key, source_text);
                let is_static = accessor.r#static;
                (
                    name,
                    accessor.span,
                    is_static,
                    SymbolKind::PropertyDeclaration,
                )
            }
            _ => continue,
        };

        let member_name = match member_name_opt {
            Some(name_str) => name_str,
            None => continue,
        };
        let member_kind = _member_kind;

        let qualified_name = if is_static {
            SharedString::from(format!("{}.{}", parent_name, member_name).as_ref())
        } else {
            SharedString::from(format!("{}.prototype.{}", parent_name, member_name).as_ref())
        };

        let signature = get_span_text(source_text, member_span);
        let member_jsdoc = extract_jsdoc_from_leading_comments(source_text, member_span);

        let visibility = member_jsdoc.visibility.clone().or_else(|| {
            if member_name.starts_with('_') {
                Some(Visibility::Internal)
            } else {
                parent_jsdoc.visibility.clone()
            }
        });

        let mut deps_map = HashMap::new();
        match member {
            ClassElement::PropertyDefinition(prop) => {
                if let Some(anno) = &prop.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            ClassElement::MethodDefinition(method) => {
                if let Some(return_type) = &method.value.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut deps_map);
                }
                for param in &method.value.params.items {
                    if let Some(anno) = &param.type_annotation {
                        collect_type_refs(&anno.type_annotation, &mut deps_map);
                    }
                }
            }
            ClassElement::AccessorProperty(accessor) => {
                if let Some(anno) = &accessor.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            _ => {}
        }
        let dependencies: Vec<TypeReference> = deps_map.into_values().collect();

        let member_modifiers = extract_signature_modifiers(signature.as_ref());
        results.push(ParsedExport {
            name: qualified_name,
            kind: member_kind,
            symbol_space: SymbolSpace::Value,
            is_explicit_export,
            signature: Some(signature),
            js_doc: member_jsdoc.js_doc.or_else(|| parent_jsdoc.js_doc.clone()),
            dependencies: dependencies.into(),
            deprecated: member_jsdoc
                .deprecated
                .or_else(|| parent_jsdoc.deprecated.clone()),
            visibility,
            since: member_jsdoc.since.or_else(|| parent_jsdoc.since.clone()),
            modifiers: member_modifiers,
            ..Default::default()
        });
    }
}

/// Extracts class members as flat type members (no `prototype.` prefix).
///
/// Used when resolving `typeof ClassName` or type references to classes through
/// the local declaration registry. Here instance members flatten as `Parent.member`
/// (not `Parent.prototype.member`) so `typeof`-driven expansion stays type-shaped.
#[allow(clippy::too_many_arguments)]
fn extract_class_body_as_type_members<'a>(
    class_decl: &Class<'a>,
    source_text: &str,
    current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    visited: &mut HashSet<SharedString>,
    depth: usize,
    definition_site: Option<SharedString>,
) {
    for member in &class_decl.body.body {
        let (member_name_opt, member_span, member_kind, _is_static) = match member {
            ClassElement::PropertyDefinition(prop_def) => {
                let name = property_key_to_string(&prop_def.key, source_text);
                (
                    name,
                    prop_def.span,
                    SymbolKind::PropertyDeclaration,
                    prop_def.r#static,
                )
            }
            ClassElement::MethodDefinition(method_def) => {
                if method_def.kind == MethodDefinitionKind::Constructor {
                    continue;
                }
                let name = property_key_to_string(&method_def.key, source_text);
                let kind = match method_def.kind {
                    MethodDefinitionKind::Get => SymbolKind::GetAccessor,
                    MethodDefinitionKind::Set => SymbolKind::SetAccessor,
                    _ => SymbolKind::MethodDeclaration,
                };
                (name, method_def.span, kind, method_def.r#static)
            }
            ClassElement::AccessorProperty(accessor) => {
                let name = property_key_to_string(&accessor.key, source_text);
                (
                    name,
                    accessor.span,
                    SymbolKind::PropertyDeclaration,
                    accessor.r#static,
                )
            }
            ClassElement::TSIndexSignature(_) => continue,
            _ => continue,
        };

        let member_name = match member_name_opt {
            Some(name_str) => name_str,
            None => continue,
        };

        // Flat naming — no prototype. prefix
        let qualified_name =
            SharedString::from(format!("{}.{}", parent_name, member_name).as_ref());
        let signature = get_span_text(source_text, member_span);
        let member_modifiers = extract_signature_modifiers(signature.as_ref());
        let member_jsdoc = extract_jsdoc_from_leading_comments(source_text, member_span);

        let visibility = member_jsdoc.visibility.clone().or_else(|| {
            if member_name.starts_with('_') {
                Some(Visibility::Internal)
            } else {
                parent_jsdoc.visibility.clone()
            }
        });

        let mut deps_map = HashMap::new();
        match member {
            ClassElement::PropertyDefinition(prop_def) => {
                if let Some(anno) = &prop_def.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            ClassElement::MethodDefinition(method_def) => {
                if let Some(func) = method_def.value.return_type.as_ref() {
                    collect_type_refs(&func.type_annotation, &mut deps_map);
                }
                for param in &method_def.value.params.items {
                    if let Some(anno) = &param.type_annotation {
                        collect_type_refs(&anno.type_annotation, &mut deps_map);
                    }
                }
            }
            ClassElement::AccessorProperty(accessor) => {
                if let Some(anno) = &accessor.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            _ => {}
        }
        let dependencies: Vec<TypeReference> = deps_map.into_values().collect();

        results.push(ParsedExport {
            name: qualified_name.clone(),
            kind: member_kind,
            symbol_space: SymbolSpace::Value,
            is_explicit_export,
            signature: Some(signature),
            js_doc: member_jsdoc.js_doc.clone(),
            dependencies: dependencies.into(),
            deprecated: member_jsdoc
                .deprecated
                .clone()
                .or_else(|| parent_jsdoc.deprecated.clone()),
            visibility,
            since: member_jsdoc
                .since
                .clone()
                .or_else(|| parent_jsdoc.since.clone()),
            modifiers: member_modifiers,
            declared_in_file: definition_site.clone(),
            ..Default::default()
        });

        // Recursively extract nested type members from property type annotations
        if let ClassElement::PropertyDefinition(prop_def) = member
            && let Some(anno) = &prop_def.type_annotation
        {
            extract_complex_type_members(
                &anno.type_annotation,
                source_text,
                current_file,
                qualified_name.as_ref(),
                is_explicit_export,
                &member_jsdoc,
                results,
                local_decls,
                visited,
                depth + 1,
                definition_site.clone(),
            );
        }
    }
}

/// Extracts property and method signatures from an interface declaration.
#[allow(clippy::too_many_arguments)]
fn extract_interface_members<'a>(
    iface_decl: &TSInterfaceDeclaration<'a>,
    source_text: &str,
    current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
) {
    for member in &iface_decl.body.body {
        let (member_name_opt, member_span, member_kind) = match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                let name = property_key_to_string(&prop_sig.key, source_text);
                (name, prop_sig.span, SymbolKind::PropertySignature)
            }
            TSSignature::TSMethodSignature(method_sig) => {
                let name = property_key_to_string(&method_sig.key, source_text);
                let kind = match method_sig.kind {
                    TSMethodSignatureKind::Get => SymbolKind::GetAccessor,
                    TSMethodSignatureKind::Set => SymbolKind::SetAccessor,
                    _ => SymbolKind::MethodSignature,
                };
                (name, method_sig.span, kind)
            }
            // Call signatures on interfaces are not emitted as separate symbol rows.
            TSSignature::TSCallSignatureDeclaration(_) => continue,
            _ => continue,
        };

        let member_name = match member_name_opt {
            Some(name_str) => name_str,
            None => continue,
        };

        let qualified_name =
            SharedString::from(format!("{}.{}", parent_name, member_name).as_ref());
        let signature = get_span_text(source_text, member_span);
        let member_modifiers = extract_signature_modifiers(signature.as_ref());
        let member_jsdoc = extract_jsdoc_from_leading_comments(source_text, member_span);

        let mut deps_map = HashMap::new();
        match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                if let Some(anno) = &prop_sig.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            TSSignature::TSMethodSignature(method_sig) => {
                if let Some(return_type) = &method_sig.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut deps_map);
                }
                for param in &method_sig.params.items {
                    if let Some(anno) = &param.type_annotation {
                        collect_type_refs(&anno.type_annotation, &mut deps_map);
                    }
                }
            }
            _ => {}
        }
        let dependencies: Vec<TypeReference> = deps_map.into_values().collect();

        let visibility = member_jsdoc
            .visibility
            .clone()
            .or_else(|| parent_jsdoc.visibility.clone());

        results.push(ParsedExport {
            name: qualified_name.clone(),
            kind: member_kind,
            symbol_space: SymbolSpace::Type,
            is_explicit_export,
            signature: Some(signature),
            js_doc: member_jsdoc.js_doc.clone(),
            dependencies: dependencies.into(),
            deprecated: member_jsdoc
                .deprecated
                .clone()
                .or_else(|| parent_jsdoc.deprecated.clone()),
            visibility,
            since: member_jsdoc
                .since
                .clone()
                .or_else(|| parent_jsdoc.since.clone()),
            modifiers: member_modifiers,
            ..Default::default()
        });

        // Recursively extract nested type members from property type annotations.
        // When a property has a type annotation (e.g., `config: Config`),
        // resolve it through the local declaration registry to flatten members.
        if let TSSignature::TSPropertySignature(prop_sig) = member
            && let Some(anno) = &prop_sig.type_annotation
        {
            extract_complex_type_members(
                &anno.type_annotation,
                source_text,
                current_file,
                qualified_name.as_ref(),
                is_explicit_export,
                &member_jsdoc,
                results,
                local_decls,
                &mut HashSet::new(),
                0,
                None,
            );
        }
    }
}

fn import_type_qualifier_segments<'a>(qualifier: &'a TSImportTypeQualifier<'a>) -> Vec<&'a str> {
    match qualifier {
        TSImportTypeQualifier::Identifier(identifier) => vec![identifier.name.as_ref()],
        TSImportTypeQualifier::QualifiedName(qualified_name) => {
            let mut segments = import_type_qualifier_segments(&qualified_name.left);
            segments.push(qualified_name.right.name.as_ref());
            segments
        }
    }
}

/// `import('./m').X` / `typeof import('./m').X` — resolve the module and flatten the exported type/class.
#[allow(clippy::too_many_arguments)]
fn expand_ts_import_type_members<'a>(
    import_type: &TSImportType<'a>,
    _source_file_text: &str,
    current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    visited: &mut HashSet<SharedString>,
    depth: usize,
    _definition_site: Option<SharedString>,
) {
    let Some(qualifier) = import_type.qualifier.as_ref() else {
        return;
    };
    let module_specifier = import_type.source.value.as_str();
    let qualifier_segments = import_type_qualifier_segments(qualifier);
    let lookup_name = *qualifier_segments.last().unwrap_or(&"");
    let key = SharedString::from(
        format!(
            "import:{module_specifier}::{}",
            qualifier_segments.join(".")
        )
        .as_ref(),
    );
    let was_new = visited.insert(key.clone());
    if !was_new {
        return;
    }
    let paths = resolve_module_specifier(module_specifier, current_file);
    let Some(target_path) = paths.first() else {
        visited.remove(&key);
        return;
    };
    if target_path.as_ref() == module_specifier {
        visited.remove(&key);
        return;
    }
    let Ok(target_text) = fs::read_to_string(target_path.as_ref()) else {
        visited.remove(&key);
        return;
    };
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &target_text, SourceType::d_ts()).parse();
    let mut target_decls: HashMap<SharedString, LocalDecl<'_>> = HashMap::new();
    extend_local_decl_map_from_body(parsed.program.body.as_slice(), &mut target_decls);
    let site = normalize_path(Path::new(target_path.as_ref()));
    let qname: SharedString = lookup_name.into();
    if let Some(local_decl) = target_decls.get(qname.as_ref()) {
        match local_decl {
            LocalDecl::Type(resolved_type) => {
                extract_complex_type_members(
                    resolved_type,
                    &target_text,
                    target_path.as_ref(),
                    parent_name,
                    is_explicit_export,
                    parent_jsdoc,
                    results,
                    &target_decls,
                    visited,
                    depth + 1,
                    Some(site.clone()),
                );
            }
            LocalDecl::Interface(iface_body) => {
                extract_type_literal_members(
                    &iface_body.body,
                    &target_text,
                    target_path.as_ref(),
                    parent_name,
                    is_explicit_export,
                    parent_jsdoc,
                    results,
                    &target_decls,
                    visited,
                    depth + 1,
                    Some(site.clone()),
                );
            }
            LocalDecl::Class(class) => {
                extract_class_body_as_type_members(
                    class,
                    &target_text,
                    target_path.as_ref(),
                    parent_name,
                    is_explicit_export,
                    parent_jsdoc,
                    results,
                    &target_decls,
                    visited,
                    depth + 1,
                    Some(site.clone()),
                );
            }
        }
    }
    visited.remove(&key);
}

/// Walks type shapes rooted at a value’s annotation: object literals, intersections, `typeof`,
/// imports, and local type aliases—mirroring how nested properties are flattened onto the parent
/// symbol path (`x.version`, intersection members, `prototype` expansion, etc.).
#[allow(clippy::too_many_arguments)]
fn extract_complex_type_members<'a>(
    ts_type: &TSType<'a>,
    source_text: &str,
    current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    visited: &mut HashSet<SharedString>,
    depth: usize,
    definition_site: Option<SharedString>,
) {
    if depth > MAX_RECURSION_DEPTH {
        return;
    }
    match ts_type {
        TSType::TSParenthesizedType(paren) => {
            extract_complex_type_members(
                &paren.type_annotation,
                source_text,
                current_file,
                parent_name,
                is_explicit_export,
                parent_jsdoc,
                results,
                local_decls,
                visited,
                depth,
                definition_site.clone(),
            );
        }
        // Depth counts property nesting (`a.b.c`), not the `{ … }` wrapper—bumping here made deep
        // anonymous configs hit `MAX_RECURSION_DEPTH` one level too early.
        TSType::TSTypeLiteral(type_lit) => {
            extract_type_literal_members(
                &type_lit.members,
                source_text,
                current_file,
                parent_name,
                is_explicit_export,
                parent_jsdoc,
                results,
                local_decls,
                visited,
                depth,
                definition_site.clone(),
            );
        }
        TSType::TSIntersectionType(intersection) => {
            for constituent in &intersection.types {
                extract_complex_type_members(
                    constituent,
                    source_text,
                    current_file,
                    parent_name,
                    is_explicit_export,
                    parent_jsdoc,
                    results,
                    local_decls,
                    visited,
                    depth + 1,
                    definition_site.clone(),
                );
            }
        }
        TSType::TSTypeReference(type_ref) => {
            let ref_name = ts_type_name_to_string(&type_ref.type_name);
            let was_inserted = visited.insert(ref_name.clone());
            if was_inserted {
                if let Some(local_decl) = local_decls.get(ref_name.as_ref()) {
                    match local_decl {
                        LocalDecl::Type(resolved_type) => {
                            extract_complex_type_members(
                                resolved_type,
                                source_text,
                                current_file,
                                parent_name,
                                is_explicit_export,
                                parent_jsdoc,
                                results,
                                local_decls,
                                visited,
                                depth + 1,
                                definition_site.clone(),
                            );
                        }
                        LocalDecl::Interface(iface_body) => {
                            extract_type_literal_members(
                                &iface_body.body,
                                source_text,
                                current_file,
                                parent_name,
                                is_explicit_export,
                                parent_jsdoc,
                                results,
                                local_decls,
                                visited,
                                depth + 1,
                                definition_site.clone(),
                            );
                        }
                        LocalDecl::Class(class) => {
                            extract_class_body_as_type_members(
                                class,
                                source_text,
                                current_file,
                                parent_name,
                                is_explicit_export,
                                parent_jsdoc,
                                results,
                                local_decls,
                                visited,
                                depth + 1,
                                definition_site.clone(),
                            );
                        }
                    }
                }
                visited.remove(&ref_name);
            }
        }
        TSType::TSTypeQuery(type_query) => match &type_query.expr_name {
            TSTypeQueryExprName::TSImportType(import_box) => {
                expand_ts_import_type_members(
                    import_box.as_ref(),
                    source_text,
                    current_file,
                    parent_name,
                    is_explicit_export,
                    parent_jsdoc,
                    results,
                    visited,
                    depth,
                    definition_site.clone(),
                );
            }
            TSTypeQueryExprName::IdentifierReference(ident) => {
                let ref_name = SharedString::from(ident.name.as_ref());
                let was_inserted = visited.insert(ref_name.clone());
                if was_inserted {
                    if let Some(local_decl) = local_decls.get(ref_name.as_ref()) {
                        match local_decl {
                            LocalDecl::Type(resolved_type) => {
                                extract_complex_type_members(
                                    resolved_type,
                                    source_text,
                                    current_file,
                                    parent_name,
                                    is_explicit_export,
                                    parent_jsdoc,
                                    results,
                                    local_decls,
                                    visited,
                                    depth + 1,
                                    definition_site.clone(),
                                );
                            }
                            LocalDecl::Interface(iface_body) => {
                                extract_type_literal_members(
                                    &iface_body.body,
                                    source_text,
                                    current_file,
                                    parent_name,
                                    is_explicit_export,
                                    parent_jsdoc,
                                    results,
                                    local_decls,
                                    visited,
                                    depth + 1,
                                    definition_site.clone(),
                                );
                            }
                            LocalDecl::Class(class) => {
                                extract_class_body_as_type_members(
                                    class,
                                    source_text,
                                    current_file,
                                    parent_name,
                                    is_explicit_export,
                                    parent_jsdoc,
                                    results,
                                    local_decls,
                                    visited,
                                    depth + 1,
                                    definition_site.clone(),
                                );
                            }
                        }
                    }
                    visited.remove(&ref_name);
                }
            }
            TSTypeQueryExprName::QualifiedName(_) | TSTypeQueryExprName::ThisExpression(_) => {}
        },
        TSType::TSImportType(import_type) => {
            expand_ts_import_type_members(
                import_type,
                source_text,
                current_file,
                parent_name,
                is_explicit_export,
                parent_jsdoc,
                results,
                visited,
                depth,
                definition_site.clone(),
            );
        }
        _ => {}
    }
}

/// Extracts PropertySignature/MethodSignature members from a TSTypeLiteral's members list.
#[allow(clippy::too_many_arguments)]
fn extract_type_literal_members<'a>(
    members: &[TSSignature<'a>],
    source_text: &str,
    current_file: &str,
    parent_name: &str,
    is_explicit_export: bool,
    parent_jsdoc: &JsDocInfo,
    results: &mut Vec<ParsedExport>,
    local_decls: &HashMap<SharedString, LocalDecl<'a>>,
    visited: &mut HashSet<SharedString>,
    depth: usize,
    definition_site: Option<SharedString>,
) {
    if depth > MAX_RECURSION_DEPTH {
        return;
    }
    for member in members {
        let (member_name_opt, member_span, member_kind) = match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                let name = property_key_to_string(&prop_sig.key, source_text);
                (name, prop_sig.span, SymbolKind::PropertySignature)
            }
            TSSignature::TSMethodSignature(method_sig) => {
                let name = property_key_to_string(&method_sig.key, source_text);
                let kind = match method_sig.kind {
                    TSMethodSignatureKind::Get => SymbolKind::GetAccessor,
                    TSMethodSignatureKind::Set => SymbolKind::SetAccessor,
                    _ => SymbolKind::MethodSignature,
                };
                (name, method_sig.span, kind)
            }
            _ => continue,
        };

        let member_name = match member_name_opt {
            Some(name_str) => name_str,
            None => continue,
        };

        let qualified_name = SharedString::from(format!("{}.{}", parent_name, member_name));
        let signature = get_span_text(source_text, member_span);
        let member_modifiers = extract_signature_modifiers(signature.as_ref());
        let member_jsdoc = extract_jsdoc_from_leading_comments(source_text, member_span);

        let mut deps_map = HashMap::new();
        match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                if let Some(anno) = &prop_sig.type_annotation {
                    collect_type_refs(&anno.type_annotation, &mut deps_map);
                }
            }
            TSSignature::TSMethodSignature(method_sig) => {
                if let Some(return_type) = &method_sig.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut deps_map);
                }
                for param in &method_sig.params.items {
                    if let Some(anno) = &param.type_annotation {
                        collect_type_refs(&anno.type_annotation, &mut deps_map);
                    }
                }
            }
            _ => {}
        }
        let dependencies: Vec<TypeReference> = deps_map.into_values().collect();

        results.push(ParsedExport {
            name: qualified_name.clone(),
            kind: member_kind,
            symbol_space: SymbolSpace::Type,
            is_explicit_export,
            signature: Some(signature),
            js_doc: member_jsdoc.js_doc.clone(),
            dependencies: dependencies.into(),
            deprecated: member_jsdoc
                .deprecated
                .clone()
                .or_else(|| parent_jsdoc.deprecated.clone()),
            visibility: member_jsdoc
                .visibility
                .clone()
                .or_else(|| parent_jsdoc.visibility.clone()),
            since: member_jsdoc
                .since
                .clone()
                .or_else(|| parent_jsdoc.since.clone()),
            modifiers: member_modifiers,
            declared_in_file: definition_site.clone(),
            ..Default::default()
        });

        // Recursively extract nested type literal members (e.g., `prototype: { ... }`)
        match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                if let Some(type_annotation) = &prop_sig.type_annotation {
                    extract_complex_type_members(
                        &type_annotation.type_annotation,
                        source_text,
                        current_file,
                        qualified_name.as_ref(),
                        is_explicit_export,
                        &member_jsdoc,
                        results,
                        local_decls,
                        visited,
                        depth + 1,
                        definition_site.clone(),
                    );
                }
            }
            TSSignature::TSMethodSignature(sig) => match sig.kind {
                TSMethodSignatureKind::Get => {
                    if let Some(return_type) = &sig.return_type {
                        extract_complex_type_members(
                            &return_type.type_annotation,
                            source_text,
                            current_file,
                            qualified_name.as_ref(),
                            is_explicit_export,
                            &member_jsdoc,
                            results,
                            local_decls,
                            visited,
                            depth + 1,
                            definition_site.clone(),
                        );
                    }
                }
                TSMethodSignatureKind::Set => {
                    for param in &sig.params.items {
                        if let Some(type_annotation) = &param.type_annotation {
                            extract_complex_type_members(
                                &type_annotation.type_annotation,
                                source_text,
                                current_file,
                                qualified_name.as_ref(),
                                is_explicit_export,
                                &member_jsdoc,
                                results,
                                local_decls,
                                visited,
                                depth + 1,
                                definition_site.clone(),
                            );
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
}

/// Extracts type references from a function declaration (params + return type).
fn extract_type_refs_from_function(func_decl: &Function<'_>) -> Vec<TypeReference> {
    let mut refs: HashMap<SharedString, TypeReference> = HashMap::new();

    for param in &func_decl.params.items {
        if let Some(type_annotation) = &param.type_annotation {
            collect_type_refs(&type_annotation.type_annotation, &mut refs);
        }
    }

    if let Some(return_type) = &func_decl.return_type {
        collect_type_refs(&return_type.type_annotation, &mut refs);
    }

    refs.into_values().collect()
}

/// Extracts type references from a class declaration (heritage + members).
fn extract_type_refs_from_class(class_decl: &Class<'_>) -> Vec<TypeReference> {
    let mut refs: HashMap<SharedString, TypeReference> = HashMap::new();

    if let Some(super_class) = &class_decl.super_class {
        if let Some(type_args) = &class_decl.super_type_arguments {
            for param in &type_args.params {
                collect_type_refs(param, &mut refs);
            }
        }
        if let Some(name) = expression_to_string(super_class)
            && !BUILTIN_TYPES.contains(name.as_ref())
        {
            refs.insert(
                name.clone(),
                TypeReference {
                    name,
                    import_path: None,
                },
            );
        }
    }

    for implement in &class_decl.implements {
        if let Some(type_args) = &implement.type_arguments {
            for param in &type_args.params {
                collect_type_refs(param, &mut refs);
            }
        }
        let name = ts_type_name_to_string(&implement.expression);
        if !BUILTIN_TYPES.contains(name.as_ref()) {
            refs.insert(
                name.clone(),
                TypeReference {
                    name,
                    import_path: None,
                },
            );
        }
    }

    // Scan member method signatures and property types for dependencies
    for member in &class_decl.body.body {
        match member {
            ClassElement::MethodDefinition(method) => {
                if let Some(return_type) = &method.value.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut refs);
                }
                for param in &method.value.params.items {
                    if let Some(type_annotation) = &param.type_annotation {
                        collect_type_refs(&type_annotation.type_annotation, &mut refs);
                    }
                }
            }
            ClassElement::PropertyDefinition(prop) => {
                if let Some(type_annotation) = &prop.type_annotation {
                    collect_type_refs(&type_annotation.type_annotation, &mut refs);
                }
            }
            ClassElement::AccessorProperty(accessor) => {
                if let Some(type_annotation) = &accessor.type_annotation {
                    collect_type_refs(&type_annotation.type_annotation, &mut refs);
                }
            }
            _ => {}
        }
    }

    refs.into_values().collect()
}

/// Extracts type references from an interface declaration (heritage + members).
fn extract_type_refs_from_interface(iface_decl: &TSInterfaceDeclaration<'_>) -> Vec<TypeReference> {
    let mut refs: HashMap<SharedString, TypeReference> = HashMap::new();

    // Heritage clause refs (extends)
    for heritage in &iface_decl.extends {
        if let Some(type_args) = &heritage.type_arguments {
            for param in &type_args.params {
                collect_type_refs(param, &mut refs);
            }
        }
        if let Expression::Identifier(ident) = &heritage.expression {
            let name = SharedString::from(ident.name.as_ref());
            if !BUILTIN_TYPES.contains(name.as_ref()) {
                refs.insert(
                    name.clone(),
                    TypeReference {
                        name,
                        import_path: None,
                    },
                );
            }
        }
    }

    // Member type annotation refs (property types, method params/returns)
    for member in &iface_decl.body.body {
        match member {
            TSSignature::TSPropertySignature(prop_sig) => {
                if let Some(type_annotation) = &prop_sig.type_annotation {
                    collect_type_refs(&type_annotation.type_annotation, &mut refs);
                }
            }
            TSSignature::TSMethodSignature(method_sig) => {
                if let Some(return_type) = &method_sig.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut refs);
                }
                for param in &method_sig.params.items {
                    if let Some(type_annotation) = &param.type_annotation {
                        collect_type_refs(&type_annotation.type_annotation, &mut refs);
                    }
                }
            }
            TSSignature::TSCallSignatureDeclaration(call_sig) => {
                if let Some(return_type) = &call_sig.return_type {
                    collect_type_refs(&return_type.type_annotation, &mut refs);
                }
                for param in &call_sig.params.items {
                    if let Some(type_annotation) = &param.type_annotation {
                        collect_type_refs(&type_annotation.type_annotation, &mut refs);
                    }
                }
            }
            _ => {}
        }
    }

    refs.into_values().collect()
}

fn extract_type_refs_from_ts_type(ts_type: &TSType<'_>) -> Vec<TypeReference> {
    let mut refs: HashMap<SharedString, TypeReference> = HashMap::new();
    collect_type_refs(ts_type, &mut refs);
    refs.into_values().collect()
}

fn import_type_qualifier_leaf_name<'a>(qualifier: &'a TSImportTypeQualifier<'a>) -> &'a str {
    match qualifier {
        TSImportTypeQualifier::Identifier(ident) => ident.name.as_ref(),
        TSImportTypeQualifier::QualifiedName(qn) => qn.right.name.as_ref(),
    }
}

/// Recursive visitor that collects type references from any TSType.
fn collect_type_refs(ts_type: &TSType<'_>, refs: &mut HashMap<SharedString, TypeReference>) {
    match ts_type {
        TSType::TSTypeReference(type_ref) => {
            let name = ts_type_name_to_string(&type_ref.type_name);
            if !BUILTIN_TYPES.contains(name.as_ref()) {
                refs.insert(
                    name.clone(),
                    TypeReference {
                        name: name.clone(),
                        import_path: None,
                    },
                );
            }

            // Recurse into type parameters
            if let Some(type_params) = &type_ref.type_arguments {
                for param in &type_params.params {
                    collect_type_refs(param, refs);
                }
            }
        }

        TSType::TSUnionType(union_type) => {
            for member in &union_type.types {
                collect_type_refs(member, refs);
            }
        }

        TSType::TSIntersectionType(intersection_type) => {
            for member in &intersection_type.types {
                collect_type_refs(member, refs);
            }
        }

        TSType::TSArrayType(array_type) => {
            collect_type_refs(&array_type.element_type, refs);
        }

        TSType::TSTupleType(tuple_type) => {
            for element in &tuple_type.element_types {
                match element {
                    TSTupleElement::TSOptionalType(opt) => {
                        collect_type_refs(&opt.type_annotation, refs)
                    }
                    TSTupleElement::TSRestType(rest) => {
                        collect_type_refs(&rest.type_annotation, refs)
                    }
                    TSTupleElement::TSNamedTupleMember(named) => {
                        // element_type is TSTupleElement, not TSType — recurse via as_ts_type()
                        if let Some(inner_type) = named.element_type.as_ts_type() {
                            collect_type_refs(inner_type, refs);
                        }
                    }
                    _ => {
                        if let Some(ts_type) = element.as_ts_type() {
                            collect_type_refs(ts_type, refs);
                        }
                    }
                }
            }
        }

        TSType::TSTypeLiteral(type_literal) => {
            for member in &type_literal.members {
                match member {
                    TSSignature::TSPropertySignature(prop_sig) => {
                        if let Some(type_annotation) = &prop_sig.type_annotation {
                            collect_type_refs(&type_annotation.type_annotation, refs);
                        }
                    }
                    TSSignature::TSMethodSignature(method_sig) => {
                        if let Some(return_type) = &method_sig.return_type {
                            collect_type_refs(&return_type.type_annotation, refs);
                        }
                        for param in &method_sig.params.items {
                            if let Some(type_annotation) = &param.type_annotation {
                                collect_type_refs(&type_annotation.type_annotation, refs);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        TSType::TSFunctionType(func_type) => {
            collect_type_refs(&func_type.return_type.type_annotation, refs);
            for param in &func_type.params.items {
                if let Some(type_annotation) = &param.type_annotation {
                    collect_type_refs(&type_annotation.type_annotation, refs);
                }
            }
        }

        TSType::TSConditionalType(cond_type) => {
            collect_type_refs(&cond_type.check_type, refs);
            collect_type_refs(&cond_type.extends_type, refs);
            collect_type_refs(&cond_type.true_type, refs);
            collect_type_refs(&cond_type.false_type, refs);
        }

        TSType::TSMappedType(mapped_type) => {
            if let Some(type_annotation) = &mapped_type.type_annotation {
                collect_type_refs(type_annotation, refs);
            }
        }

        TSType::TSIndexedAccessType(indexed) => {
            collect_type_refs(&indexed.object_type, refs);
            collect_type_refs(&indexed.index_type, refs);
        }

        TSType::TSTypeQuery(type_query) => match &type_query.expr_name {
            TSTypeQueryExprName::IdentifierReference(ident) => {
                let name = SharedString::from(ident.name.as_ref());
                if !BUILTIN_TYPES.contains(name.as_ref()) {
                    refs.insert(
                        name.clone(),
                        TypeReference {
                            name,
                            import_path: None,
                        },
                    );
                }
            }
            TSTypeQueryExprName::TSImportType(import_box) => {
                let import_type = import_box.as_ref();
                if let Some(qualifier) = &import_type.qualifier {
                    let leaf = import_type_qualifier_leaf_name(qualifier);
                    let name = SharedString::from(leaf);
                    let import_path = Some(SharedString::from(import_type.source.value.as_ref()));
                    if !BUILTIN_TYPES.contains(name.as_ref()) {
                        refs.insert(name.clone(), TypeReference { name, import_path });
                    }
                }
            }
            TSTypeQueryExprName::QualifiedName(_) | TSTypeQueryExprName::ThisExpression(_) => {}
        },

        TSType::TSImportType(import_type) => {
            if let Some(qualifier) = &import_type.qualifier {
                let leaf = import_type_qualifier_leaf_name(qualifier);
                let name = SharedString::from(leaf);
                let import_path = Some(SharedString::from(import_type.source.value.as_ref()));
                if !BUILTIN_TYPES.contains(name.as_ref()) {
                    refs.insert(name.clone(), TypeReference { name, import_path });
                }
            }
        }

        TSType::TSParenthesizedType(paren) => {
            collect_type_refs(&paren.type_annotation, refs);
        }

        TSType::TSTypeOperatorType(type_op) => {
            collect_type_refs(&type_op.type_annotation, refs);
        }

        _ => {}
    }
}

/// Extracts heritage clauses from a class declaration using source spans (parity with TS `getText`).
fn extract_heritage_from_class(source_text: &str, class_decl: &Class<'_>) -> Vec<SharedString> {
    let mut heritage: Vec<SharedString> = Vec::new();

    if let Some(super_class) = &class_decl.super_class {
        let span = match &class_decl.super_type_arguments {
            Some(type_args) => super_class.span().merge(type_args.span()),
            None => super_class.span(),
        };
        let fragment = get_span_text(source_text, span);
        if !fragment.is_empty() {
            heritage.push(fragment);
        }
    }

    for implement in &class_decl.implements {
        let fragment = get_span_text(source_text, implement.span);
        if !fragment.is_empty() {
            heritage.push(fragment);
        }
    }

    dedupe_shared_strings_preserve_order(heritage)
}

/// Extracts heritage clauses from an interface declaration using source spans (parity with TS `getText`).
fn extract_heritage_from_interface(
    source_text: &str,
    iface_decl: &TSInterfaceDeclaration<'_>,
) -> Vec<SharedString> {
    let mut heritage: Vec<SharedString> = Vec::new();

    for extend in &iface_decl.extends {
        let fragment = get_span_text(source_text, extend.span);
        if !fragment.is_empty() {
            heritage.push(fragment);
        }
    }

    dedupe_shared_strings_preserve_order(heritage)
}

fn dedupe_shared_strings_preserve_order(values: Vec<SharedString>) -> Vec<SharedString> {
    let mut seen: HashSet<SharedString> = HashSet::new();
    let mut result: Vec<SharedString> = Vec::with_capacity(values.len());
    for value in values {
        if seen.insert(value.clone()) {
            result.push(value);
        }
    }
    result
}

fn expression_to_string(expr: &Expression<'_>) -> Option<SharedString> {
    match expr {
        Expression::Identifier(ident) => Some(SharedString::from(ident.name.as_ref())),
        Expression::StaticMemberExpression(member) => {
            if let Some(obj) = expression_to_string(&member.object) {
                return Some(SharedString::from(
                    format!("{}.{}", obj, member.property.name).as_ref(),
                ));
            }
            None
        }
        _ => None,
    }
}

fn ts_type_name_to_string(type_name: &TSTypeName<'_>) -> SharedString {
    let mut segments_right_to_left: Vec<&str> = Vec::new();
    let mut walker: &TSTypeName<'_> = type_name;
    loop {
        match walker {
            TSTypeName::IdentifierReference(ident) => {
                segments_right_to_left.push(ident.name.as_ref());
                break;
            }
            TSTypeName::QualifiedName(qualified) => {
                segments_right_to_left.push(qualified.right.name.as_ref());
                walker = &qualified.left;
            }
            TSTypeName::ThisExpression(_) => {
                segments_right_to_left.push("this");
                break;
            }
        }
    }
    segments_right_to_left.reverse();
    let estimated_capacity: usize = segments_right_to_left
        .iter()
        .map(|segment| segment.len())
        .sum::<usize>()
        + segments_right_to_left.len().saturating_sub(1);
    let mut qualified_name = String::with_capacity(estimated_capacity);
    for segment in segments_right_to_left {
        if !qualified_name.is_empty() {
            qualified_name.push('.');
        }
        qualified_name.push_str(segment);
    }
    SharedString::from(qualified_name)
}

fn extract_jsdoc_from_leading_comments(source_text: &str, span: oxc_span::Span) -> JsDocInfo {
    let mut result = JsDocInfo::default();

    let start = span.start as usize;
    if start == 0 || start > source_text.len() {
        return result;
    }

    let before_span = &source_text[..start];
    let trimmed_before = before_span.trim_end();

    if !trimmed_before.ends_with("*/") {
        return result;
    }

    if let Some(comment_start) = trimmed_before.rfind("/**") {
        let comment_text = &trimmed_before[comment_start..];

        let body = comment_text
            .trim_start_matches("/**")
            .trim_end_matches("*/")
            .trim();

        let mut description_lines = String::with_capacity(body.len());

        for line in body.lines() {
            let cleaned_line = line.trim().trim_start_matches('*').trim();

            if cleaned_line.starts_with("@deprecated") {
                if result.deprecated.is_none() {
                    let message = cleaned_line
                        .strip_prefix("@deprecated")
                        .unwrap_or("")
                        .trim();
                    result.deprecated = Some(if message.is_empty() {
                        Deprecation::Flag(true)
                    } else {
                        Deprecation::Message(SharedString::from(message))
                    });
                }
            } else if cleaned_line.starts_with("@since") {
                if result.since.is_none() {
                    let version = cleaned_line.strip_prefix("@since").unwrap_or("").trim();
                    if !version.is_empty() {
                        result.since = Some(SharedString::from(version));
                    }
                }
            } else if cleaned_line.starts_with('@') {
                let tag_name = cleaned_line
                    .strip_prefix('@')
                    .unwrap_or("")
                    .split_whitespace()
                    .next()
                    .unwrap_or("");
                if VISIBILITY_TAGS.contains(tag_name) && result.visibility.is_none() {
                    result.visibility = match tag_name {
                        "public" => Some(Visibility::Public),
                        "internal" => Some(Visibility::Internal),
                        "alpha" => Some(Visibility::Alpha),
                        "beta" => Some(Visibility::Beta),
                        _ => None,
                    };
                }
            } else if !cleaned_line.is_empty() {
                if !description_lines.is_empty() {
                    description_lines.push('\n');
                }
                description_lines.push_str(cleaned_line);
            }
        }

        if !description_lines.is_empty() {
            result.js_doc = Some(SharedString::from(description_lines.as_str()));
        }
    }

    result
}

fn get_span_text(source_text: &str, span: oxc_span::Span) -> SharedString {
    let start = span.start as usize;
    let end = span.end as usize;

    if start < source_text.len() && end <= source_text.len() {
        SharedString::from(source_text[start..end].trim())
    } else {
        SharedString::from("")
    }
}

fn module_export_name_to_string(name: &ModuleExportName<'_>) -> SharedString {
    match name {
        ModuleExportName::IdentifierName(ident) => SharedString::from(ident.name.as_ref()),
        ModuleExportName::IdentifierReference(ident) => SharedString::from(ident.name.as_ref()),
        ModuleExportName::StringLiteral(string_lit) => {
            SharedString::from(string_lit.value.as_ref())
        }
    }
}

fn property_key_to_string(key: &PropertyKey<'_>, source_text: &str) -> Option<SharedString> {
    match key {
        // Private fields aren’t stable export surface in .d.ts graphs; skip rather than inventing a
        // string form that doesn’t correspond to a public property name.
        PropertyKey::PrivateIdentifier(_) => None,
        PropertyKey::StaticIdentifier(ident) => Some(SharedString::from(ident.name.as_ref())),
        PropertyKey::StringLiteral(string_lit) => {
            Some(SharedString::from(string_lit.value.as_ref()))
        }
        PropertyKey::NumericLiteral(num_lit) => num_lit
            .raw
            .as_ref()
            .map(|raw_val| SharedString::from(raw_val.as_ref())),
        key if key.is_expression() => {
            let expr = key.as_expression().unwrap();
            match expr {
                Expression::StringLiteral(str_lit) => {
                    Some(SharedString::from(str_lit.value.as_ref()))
                }
                Expression::NumericLiteral(num_lit) => num_lit
                    .raw
                    .as_ref()
                    .map(|raw_text| SharedString::from(raw_text.as_ref()))
                    .or_else(|| Some(SharedString::from(num_lit.value.to_string().as_ref()))),
                _ => {
                    let span_text = get_span_text(source_text, expr.span());
                    if span_text.is_empty() {
                        None
                    } else {
                        Some(SharedString::from(format!("[{}]", span_text).as_ref()))
                    }
                }
            }
        }
        _ => {
            let span_text = get_span_text(source_text, key.span());
            if span_text.is_empty() {
                None
            } else {
                Some(SharedString::from(format!("[{}]", span_text).as_ref()))
            }
        }
    }
}

fn extract_declaration_modifiers(declaration: &Declaration<'_>) -> Vec<SharedString> {
    let mut modifiers = Vec::new();

    match declaration {
        Declaration::VariableDeclaration(var) => {
            if var.declare {
                modifiers.push(SharedString::from("declare"));
            }
            // Variable declarations in .d.ts often use 'const', 'let', 'var'
            // but we usually only care about 'declare' and 'export'
        }
        Declaration::FunctionDeclaration(func) => {
            if func.declare {
                modifiers.push(SharedString::from("declare"));
            }
            if func.r#async {
                modifiers.push(SharedString::from("async"));
            }
        }
        Declaration::ClassDeclaration(class) => {
            if class.declare {
                modifiers.push(SharedString::from("declare"));
            }
            if class.r#abstract {
                modifiers.push(SharedString::from("abstract"));
            }
        }
        Declaration::TSInterfaceDeclaration(_) => {
            // Interfaces are implicitly 'declare' in .d.ts if not exported
        }
        Declaration::TSEnumDeclaration(enum_decl) => {
            if enum_decl.declare {
                modifiers.push(SharedString::from("declare"));
            }
            if enum_decl.r#const {
                modifiers.push(SharedString::from("const"));
            }
        }
        Declaration::TSModuleDeclaration(module_decl) => {
            if module_decl.declare {
                modifiers.push(SharedString::from("declare"));
            }
        }
        _ => {}
    }

    modifiers
}

fn extract_signature_modifiers(signature: &str) -> SharedVec<SharedString> {
    let mut parsed: Vec<SharedString> = Vec::new();
    for token in signature.split_whitespace() {
        if SIGNATURE_MODIFIER_PREFIX_TOKENS.contains(&token) {
            parsed.push(SharedString::from(token));
            continue;
        }
        break;
    }
    SharedVec::from(parsed)
}

fn statement_has_export_keyword(statement: &Statement<'_>) -> bool {
    matches!(
        statement,
        Statement::ExportNamedDeclaration(_)
            | Statement::ExportDefaultDeclaration(_)
            | Statement::ExportAllDeclaration(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_function_export() {
        let source = "export declare function greet(name: string): void;";
        let result = parse_file_from_source("test.d.ts", source);
        assert_eq!(result.exports.len(), 1);
        assert_eq!(result.exports[0].name, "greet".into());
        assert_eq!(result.exports[0].kind, SymbolKind::Function);
        assert!(result.exports[0].is_explicit_export);
    }

    #[test]
    fn parse_interface_export() {
        let source = r#"
            export interface Config {
                host: string;
                port: number;
            }
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Config".into()
                    && export_item.kind == SymbolKind::Interface)
        );
    }

    #[test]
    fn parse_class_with_members() {
        let source = r#"
            export declare class Logger {
                info(message: string): void;
                static create(): Logger;
            }
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Logger".into())
        );
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Logger.prototype.info".into())
        );
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Logger.create".into())
        );
    }

    #[test]
    fn parse_reexport_wildcard() {
        let source = r#"export * from './core';"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert_eq!(result.exports.len(), 1);
        assert_eq!(result.exports[0].name, "*".into());
        assert!(result.exports[0].is_wildcard);
        assert_eq!(result.exports[0].source, Some(SharedString::from("./core")));
    }

    #[test]
    fn parse_namespace_reexport() {
        let source = r#"export * as utils from './utils';"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert_eq!(result.exports.len(), 1);
        assert_eq!(result.exports[0].name, "utils".into());
        assert!(result.exports[0].is_namespace_export);
    }

    #[test]
    fn parse_named_reexports() {
        let source = r#"export { Foo, Bar as Baz } from './types';"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert_eq!(result.exports.len(), 2);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Foo".into())
        );
        let baz = result
            .exports
            .iter()
            .find(|export_item| export_item.name == "Baz".into())
            .unwrap();
        assert_eq!(baz.original_name, Some(SharedString::from("Bar")));
    }

    #[test]
    fn parse_type_alias() {
        let source =
            r#"export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Result".into()
                    && export_item.kind == SymbolKind::TypeAlias
                    && export_item.is_type_only)
        );
    }

    #[test]
    fn parse_enum_declaration() {
        let source = r#"export declare enum Color { Red, Green, Blue }"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "Color".into()
                    && export_item.kind == SymbolKind::Enum)
        );
    }

    #[test]
    fn parse_variable_declaration() {
        let source = r#"export declare const VERSION: string;"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "VERSION".into()
                    && export_item.kind == SymbolKind::Variable)
        );
    }

    #[test]
    fn parse_imports() {
        let source = r#"
            import { Foo } from './foo';
            import type { Bar } from './bar';
            import * as utils from './utils';
            import defaultExport from './default';
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        assert_eq!(result.imports.len(), 4);
        assert!(
            result
                .imports
                .iter()
                .any(|import_item| import_item.name == "Foo".into() && !import_item.is_namespace)
        );
        assert!(
            result
                .imports
                .iter()
                .any(|import_item| import_item.name == "utils".into() && import_item.is_namespace)
        );
        assert!(result.imports.iter().any(|import_item| import_item.name
            == "defaultExport".into()
            && import_item.is_default));
    }

    #[test]
    fn parse_jsdoc_deprecated() {
        let source = r#"
            /** @deprecated Use newFunction instead */
            export declare function oldFunction(): void;
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        let old_func = result
            .exports
            .iter()
            .find(|export_item| export_item.name == "oldFunction".into())
            .unwrap();
        assert!(old_func.deprecated.is_some());
    }

    #[test]
    fn parse_declare_module() {
        let source = r#"
            declare module "my-module" {
                export function doStuff(): void;
            }
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .exports
                .iter()
                .any(|export_item| export_item.name == "my-module".into()
                    && export_item.kind == SymbolKind::Namespace)
        );
    }

    #[test]
    fn parse_type_references_basic() {
        let source = r#"export declare function process(input: CustomType): OutputType;"#;
        let result = parse_file_from_source("test.d.ts", source);
        let func = result
            .exports
            .iter()
            .find(|export_item| export_item.name == "process".into())
            .unwrap();
        let dep_names: Vec<&str> = func
            .dependencies
            .iter()
            .map(|dep| dep.name.as_ref())
            .collect();
        assert!(dep_names.contains(&"CustomType"));
        assert!(dep_names.contains(&"OutputType"));
    }

    #[test]
    fn parse_type_references_skips_builtins() {
        let source = r#"export declare function foo(): Promise<string>;"#;
        let result = parse_file_from_source("test.d.ts", source);
        let func = result
            .exports
            .iter()
            .find(|export_item| export_item.name == "foo".into())
            .unwrap();
        // Promise and string are builtins — should not appear in dependencies
        assert!(func.dependencies.is_empty());
    }

    #[test]
    fn parse_ts_import_equals_require_records_module_specifier() {
        let source = "import ts = require(\"./typescript.js\");\nexport = ts;\n";
        let result = parse_file_from_source("shim.d.ts", source);
        assert!(
            result.imports.iter().any(|import_row| {
                import_row.name.as_ref() == "ts" && import_row.source.as_ref() == "./typescript.js"
            }),
            "imports: {:?}",
            result.imports
        );
    }

    #[test]
    fn qualified_import_type_uses_leaf_qualifier_and_specifier() {
        let source = r#"export type T = import("./dep").Inner.Type;"#;
        let result = parse_file_from_source("test.d.ts", source);
        let alias = result
            .exports
            .iter()
            .find(|export_item| export_item.name == "T".into())
            .unwrap();
        let dep = alias
            .dependencies
            .iter()
            .find(|dep| dep.name.as_ref() == "Type")
            .expect("leaf name Type");
        assert_eq!(
            dep.import_path
                .as_ref()
                .map(|import_path| import_path.as_ref()),
            Some("./dep")
        );
    }

    #[test]
    fn triple_slash_after_block_comment_prolog() {
        let source = r#"/**
 * Long license banner must not hide following reference directives.
 */
// NOTE: prolog comment
/// <reference path="./lib.d.ts" />

export declare const ROOT: string;
"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result
                .references
                .iter()
                .any(|reference| reference.as_ref() == "./lib.d.ts"),
            "expected path reference after JSDoc banner, got {:?}",
            result.references
        );
    }

    #[test]
    fn parse_module_declare_global_members() {
        let source = r#"
            export interface AppState { initialized: boolean; }
            export declare function initApp(): AppState;
            declare global {
              interface Window {
                __APP_STATE__: AppState;
              }
            }
        "#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(result.is_external_module);
        assert!(result.exports.iter().any(|export_row| {
            export_row.name.as_ref() == "Window" && export_row.is_global_augmentation
        }));
        assert!(result.exports.iter().any(|export_row| {
            export_row.name.as_ref() == "Window.__APP_STATE__" && export_row.is_global_augmentation
        }));
    }

    /// Nested `global { }` under `declare module "…"` keeps a namespace row without setting
    /// global-augmentation (otherwise the crawler filters it as a duplicate global shell).
    #[test]
    fn parse_global_block_inside_ambient_string_module() {
        let source = r#"declare module "buffer" {
    global {
        interface BufferCtor {
            alloc(size: number): ArrayBuffer;
        }
    }
}"#;
        let result = parse_file_from_source("buffer.buffer.d.ts", source);
        let global_ns = result
            .exports
            .iter()
            .find(|export_item| {
                export_item.name.as_ref() == "global" && export_item.kind == SymbolKind::Namespace
            })
            .expect("expected `global` namespace row from nested global block");
        assert!(
            !global_ns.is_global_augmentation,
            "nested global under string module must not set is_global_augmentation on the wrapper"
        );
    }

    /// `export interface X { m: T }` inside `declare global` is an `ExportNamedDeclaration` in the
    /// AST; we must extract interface members (same as ambient module bodies).
    #[test]
    fn declare_global_export_interface_extracts_property_signatures() {
        let source = r#"
declare global {
  export interface AugRow {
    readonly fromBlock: true;
  }
}
"#;
        let result = parse_file_from_source("test.d.ts", source);
        assert!(
            result.exports.iter().any(|export_item| {
                export_item.name.as_ref() == "AugRow.fromBlock"
                    && export_item.kind == SymbolKind::PropertySignature
            }),
            "expected AugRow.fromBlock property row, got {:?}",
            result
                .exports
                .iter()
                .map(|export_item| export_item.name.as_ref())
                .collect::<Vec<_>>()
        );
    }
}
