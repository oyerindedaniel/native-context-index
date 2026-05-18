//! Shared symbol builders for unit and integration tests.

use crate::symbol_source_identity::symbol_source_row_from_encoded_path;
use crate::types::{SharedString, SharedVec, SymbolKind, SymbolNode, SymbolSpace};

/// Minimal [`SymbolNode`] for SQLite tests (FTS-safe via [`crate::storage::NciDatabase::save_package`]).
pub fn minimal_test_symbol(
    package_name: &str,
    package_version: &str,
    symbol_id: &str,
    symbol_name: &str,
) -> SymbolNode {
    minimal_test_symbol_with_docs(
        package_name,
        package_version,
        symbol_id,
        symbol_name,
        None,
        None,
    )
}

/// Same as [`minimal_test_symbol`] with optional signature and JSDoc (storage round-trip tests).
pub fn minimal_test_symbol_with_docs(
    package_name: &str,
    package_version: &str,
    symbol_id: &str,
    symbol_name: &str,
    signature: Option<&str>,
    js_doc: Option<&str>,
) -> SymbolNode {
    let relative_path = "index.d.ts";
    let source_row =
        symbol_source_row_from_encoded_path(package_name, package_version, relative_path);
    SymbolNode {
        id: SharedString::from(symbol_id),
        name: SharedString::from(symbol_name),
        parent_symbol_id: None,
        enclosing_module_declaration_id: None,
        enclosing_module_declaration_name: None,
        kind: SymbolKind::Function,
        kind_name: SharedString::from("FunctionDeclaration"),
        package: SharedString::from(package_name),
        file_path: SharedString::from(relative_path),
        source_package_name: SharedString::from(source_row.source_package_name),
        source_package_version: source_row.source_package_version.map(SharedString::from),
        source_file_path: SharedString::from(source_row.source_file_path),
        additional_files: None,
        entry_visibility: None,
        merge_provenance: None,
        signature: signature.map(SharedString::from),
        js_doc: js_doc.map(SharedString::from),
        is_type_only: false,
        symbol_space: SymbolSpace::Value,
        dependencies: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        surface_dependencies: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        re_exported_from: None,
        deprecated: None,
        visibility: None,
        since: None,
        is_internal: false,
        is_global_augmentation: false,
        decorators: SharedVec::from(Vec::new().into_boxed_slice()),
        is_inherited: false,
        inherited_from_sources: SharedVec::from(Vec::new().into_boxed_slice()),
        heritage: SharedVec::from(Vec::new().into_boxed_slice()),
        modifiers: SharedVec::from(Vec::new().into_boxed_slice()),
        dep_dedupe_keys: None,
        raw_dependencies: Vec::new(),
    }
}
