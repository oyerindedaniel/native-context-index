
use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::constants::DEFAULT_MAX_DEPTH;
use crate::parser;
use crate::resolver::{normalize_path, resolve_module_specifier};
use crate::types::{
    CrawlResult, ParsedExport, ParsedImport, ResolvedSymbol, SymbolKind,
};

pub struct CrawlOptions {
    pub max_depth: usize,
}

impl Default for CrawlOptions {
    fn default() -> Self {
        Self {
            max_depth: DEFAULT_MAX_DEPTH,
        }
    }
}

/// Crawl one or more `.d.ts` files, following all re-exports recursively.
///
/// Returns a `CrawlResult` containing all resolved symbols, visited files,
/// and circular reference information.
///
/// # Arguments
/// * `entry_file_paths` - Absolute paths to the starting `.d.ts` file(s).
/// * `options` - Optional crawl configuration.
pub fn crawl(entry_file_paths: &[String], options: Option<CrawlOptions>) -> CrawlResult {
    let crawl_options = options.unwrap_or_default();
    let mut session = CrawlSession::new(crawl_options.max_depth);

    let primary_entry = entry_file_paths.first().cloned().unwrap_or_default();

    for entry_path in entry_file_paths {
        session.discover_files(entry_path, 0);
    }

    let mut resolved_symbols: Vec<ResolvedSymbol> = Vec::new();
    let mut public_symbols: HashSet<String> = HashSet::new();
    let mut all_seen_keys: HashSet<String> = HashSet::new();

    // Deduplicate entry paths (e.g., exports + typesVersions resolving to the same file)
    let mut seen_entries: HashSet<String> = HashSet::new();
    let unique_entries: Vec<&String> = entry_file_paths
        .iter()
        .filter(|p| {
            let norm = crate::resolver::normalize_path(Path::new(p));
            seen_entries.insert(norm)
        })
        .collect();

    for entry_path in &unique_entries {
        let resolved = session.resolve_file(entry_path, 0, "");
        for resolved_symbol in resolved {
            let name_key = format!("{}::{}", resolved_symbol.defined_in, resolved_symbol.name);
            public_symbols.insert(name_key);

            // Public symbols are NOT deduped here — the graph layer handles
            // duplicate IDs with #2/#3 suffixes, matching the TS oracle behavior.
            resolved_symbols.push(resolved_symbol);
        }
    }

    let visited_files: Vec<String> = session.visited.iter().cloned().collect();
    for file in &visited_files {
        let exports = match session.raw_exports.get(file) {
            Some(exports) => exports.clone(),
            None => continue,
        };

        for export_entry in exports {
            if export_entry.is_global_augmentation || export_entry.is_wildcard || export_entry.name.is_empty() {
                continue;
            }

            if matches!(export_entry.kind, SymbolKind::ExportDeclaration) {
                continue;
            }

            let key = format!("{}::{}", file, export_entry.name);
            if !public_symbols.contains(&key) {
                let internal_results = session.resolve_name_in_file(&export_entry.name, file);
                for mut internal_sym in internal_results {
                    let int_sig = if matches!(internal_sym.kind, crate::types::SymbolKind::MethodDeclaration | crate::types::SymbolKind::MethodSignature) {
                        internal_sym.signature.as_deref().unwrap_or("")
                    } else {
                        ""
                    };
                    let definition_key = format!("{}::{}::{:?}::{}", internal_sym.defined_in, internal_sym.name, internal_sym.kind, int_sig);
                    if !all_seen_keys.contains(&definition_key) {
                        internal_sym.is_internal = true;
                        resolved_symbols.push(internal_sym);
                        all_seen_keys.insert(definition_key);
                    }
                }
                public_symbols.insert(key);
            }
        }
    }

    CrawlResult {
        file_path: primary_entry,
        exports: resolved_symbols,
        imports: session.raw_imports,
        visited_files,
        type_reference_packages: session.type_ref_packages.into_iter().collect(),
        circular_refs: session.circular_refs,
    }
}

/// All mutable state for a crawl session, grouped in a struct to avoid
/// borrow-checker conflicts with closures. This replaces the TS pattern
/// of closure-captured variables.
struct CrawlSession {
    /// Files we've already visited (prevents re-parsing).
    visited: HashSet<String>,

    /// Circular reference chains detected during discovery.
    circular_refs: Vec<String>,

    /// Package names from `/// <reference types="..." />` directives.
    type_ref_packages: HashSet<String>,

    /// Parsed exports per file.
    raw_exports: HashMap<String, Vec<ParsedExport>>,

    /// Parsed imports per file.
    raw_imports: HashMap<String, Vec<ParsedImport>>,

    /// Parsed triple-slash references per file.
    raw_references: HashMap<String, Vec<String>>,

    /// Path set for circular detection during discovery (DFS ancestry).
    discovery_path_set: HashSet<String>,

    /// Path stack for circular detection during discovery.
    discovery_path_stack: Vec<String>,

    /// Path set for circular detection during resolution.
    resolution_path: HashSet<String>,

    /// Cache of resolved symbols per file.
    resolution_cache: HashMap<String, Vec<ResolvedSymbol>>,

    /// Cached name→exports index per file (built lazily, avoids repeated HashMap rebuilds).
    local_index_cache: HashMap<String, HashMap<String, Vec<ParsedExport>>>,

    /// Maximum depth for re-export following.
    max_depth: usize,
}

impl CrawlSession {
    fn new(max_depth: usize) -> Self {
        Self {
            visited: HashSet::new(),
            circular_refs: Vec::new(),
            type_ref_packages: HashSet::new(),
            raw_exports: HashMap::new(),
            raw_imports: HashMap::new(),
            raw_references: HashMap::new(),
            discovery_path_set: HashSet::new(),
            discovery_path_stack: Vec::new(),
            resolution_path: HashSet::new(),
            resolution_cache: HashMap::new(),
            local_index_cache: HashMap::new(),
            max_depth,
        }
    }

    /// Recursively discovers all files reachable from an entry point.
    /// Scans re-exports, imports, and triple-slash references.
    fn discover_files(&mut self, file_path: &str, depth: usize) {
        let normalized_path = normalize_path(Path::new(file_path));

        if depth > self.max_depth {
            return;
        }

        if !Path::new(&normalized_path).exists() {
            return;
        }

        // Circular detection during discovery (DFS ancestry)
        if self.discovery_path_set.contains(&normalized_path) {
            self.circular_refs.push(
                format!("{} -> {}", self.discovery_path_stack.join(" -> "), normalized_path)
            );
            return;
        }

        if self.visited.contains(&normalized_path) {
            return;
        }
        self.visited.insert(normalized_path.clone());

        self.discovery_path_set.insert(normalized_path.clone());
        self.discovery_path_stack.push(normalized_path.clone());

        let parse_result = match parser::parse_file(&normalized_path) {
            Some(result) => result,
            None => {
                self.discovery_path_stack.pop();
                self.discovery_path_set.remove(&normalized_path);
                return;
            }
        };

        for package in &parse_result.type_references {
            self.type_ref_packages.insert(package.clone());
        }

        self.raw_exports
            .insert(normalized_path.clone(), parse_result.exports.clone());
        self.raw_imports
            .insert(normalized_path.clone(), parse_result.imports.clone());
        self.raw_references
            .insert(normalized_path.clone(), parse_result.references.clone());

        let references = parse_result.references.clone();
        for reference in &references {
            let resolved_paths = resolve_module_specifier(reference, &normalized_path);
            if !resolved_paths.is_empty() {
                for ref_path in &resolved_paths {
                    self.discover_files(ref_path, depth + 1);
                }
            } else {
                let ref_path = resolve_triple_slash_ref(reference, &normalized_path);
                if let Some(ref_path) = ref_path {
                    self.discover_files(&ref_path, depth + 1);
                }
            }
        }

        let exports = parse_result.exports.clone();
        for export_entry in &exports {
            if let Some(source) = &export_entry.source {
                let source_paths = resolve_module_specifier(source, &normalized_path);
                for source_path in &source_paths {
                    self.discover_files(source_path, depth + 1);
                }
            }
        }

        let imports = parse_result.imports.clone();
        for import_entry in &imports {
            let imported_paths = resolve_module_specifier(&import_entry.source, &normalized_path);
            for imported_path in &imported_paths {
                self.discover_files(imported_path, depth + 1);
            }
        }

        self.discovery_path_stack.pop();
        self.discovery_path_set.remove(&normalized_path);
    }

    /// Resolves all public symbols from a file by following its export chain.
    fn resolve_file(
        &mut self,
        file_path: &str,
        depth: usize,
        name_prefix: &str,
    ) -> Vec<ResolvedSymbol> {
        let normalized_path = normalize_path(Path::new(file_path));

        if depth > self.max_depth || self.resolution_path.contains(&normalized_path) {
            return Vec::new();
        }

        if name_prefix.is_empty() {
            if let Some(cached) = self.resolution_cache.get(&normalized_path) {
                return cached.clone();
            }
        }

        let mut actual_exports = match self.raw_exports.get(&normalized_path) {
            Some(exports) => exports.clone(),
            None => return Vec::new(),
        };

        self.resolution_path.insert(normalized_path.clone());

        let mut known_names: HashSet<String> =
            actual_exports.iter().map(|entry| entry.name.clone()).collect();

        let triple_slash_refs = self
            .raw_references
            .get(&normalized_path)
            .cloned()
            .unwrap_or_default();

        for reference in &triple_slash_refs {
            let resolved_paths = resolve_module_specifier(reference, &normalized_path);
            let ref_paths: Vec<String> = if !resolved_paths.is_empty() {
                resolved_paths
            } else {
                resolve_triple_slash_ref(reference, &normalized_path)
                    .into_iter()
                    .collect()
            };

            for ref_path in &ref_paths {
                let nested_symbols = self.resolve_file(ref_path, depth + 1, "");
                for symbol_node in nested_symbols {
                    if !known_names.contains(&symbol_node.name) {
                        known_names.insert(symbol_node.name.clone());
                        actual_exports.push(ParsedExport {
                            name: symbol_node.name.clone(),
                            kind: symbol_node.kind,
                            is_type_only: symbol_node.is_type_only,
                            is_explicit_export: true,
                            signature: symbol_node.signature.clone(),
                            js_doc: symbol_node.js_doc.clone(),
                            dependencies: symbol_node.dependencies.clone(),
                            deprecated: symbol_node.deprecated.clone(),
                            visibility: symbol_node.visibility.clone(),
                            since: symbol_node.since.clone(),
                            decorators: symbol_node.decorators.clone(),
                            heritage: symbol_node.heritage.clone(),
                            modifiers: symbol_node.modifiers.clone(),
                            ..ParsedExport::new("", SymbolKind::Unknown)
                        });
                    }
                }
            }
        }

        let mut local_index: HashMap<String, Vec<ParsedExport>> = HashMap::new();
        for export_entry in &actual_exports {
            local_index
                .entry(export_entry.name.clone())
                .or_default()
                .push(export_entry.clone());
        }

        let mut results: Vec<ResolvedSymbol> = Vec::new();

        for export_entry in &actual_exports {
            if export_entry.is_global_augmentation {
                continue;
            }
            // Skip non-exported declarations — captured as internal symbols later
            if !export_entry.is_explicit_export {
                continue;
            }

            // Symbols from bare wildcard re-exports (export * from './foo') are handled within resolve_re_export
            // and do not produce a placeholder symbol themselves.

            if export_entry.source.is_some() {
                let re_export_results = self.resolve_re_export(
                    export_entry,
                    &normalized_path,
                    depth,
                    name_prefix,
                );
                results.extend(re_export_results);
            } else if matches!(
                export_entry.kind,
                SymbolKind::ExportAssignment
                    | SymbolKind::ExportDeclaration
                    | SymbolKind::ImportEquals
            ) {
                let assignment_results = resolve_local_assignment(
                    export_entry,
                    &local_index,
                    &normalized_path,
                    name_prefix,
                );
                results.extend(assignment_results);
            } else {
                let full_name = if name_prefix.is_empty() {
                    export_entry.name.clone()
                } else {
                    format!("{}.{}", name_prefix, export_entry.name)
                };

                let is_internal = export_entry.kind == SymbolKind::ExportAssignment && export_entry.name == "default";
                results.push(ResolvedSymbol {
                    name: full_name,
                    is_internal,
                    ..ResolvedSymbol::from_export(export_entry, &normalized_path)
                });
            }
        }

        self.resolution_path.remove(&normalized_path);

        if name_prefix.is_empty() {
            self.resolution_cache
                .insert(normalized_path, results.clone());
        }

        results
    }

    /// Resolves symbols that are re-exported from another module.
    fn resolve_re_export(
        &mut self,
        export_entry: &ParsedExport,
        current_file: &str,
        depth: usize,
        name_prefix: &str,
    ) -> Vec<ResolvedSymbol> {
        let mut results: Vec<ResolvedSymbol> = Vec::new();
        let full_name = if name_prefix.is_empty() {
            export_entry.name.clone()
        } else {
            format!("{}.{}", name_prefix, export_entry.name)
        };

        let source = match &export_entry.source {
            Some(source) => source.clone(),
            None => return results,
        };

        let source_paths = resolve_module_specifier(&source, current_file);

        if source_paths.is_empty() {
            // Unresolvable source — create a stub symbol if not wildcard
            if !export_entry.is_wildcard {
                results.push(ResolvedSymbol {
                    name: full_name,
                    re_export_chain: vec![current_file.to_string()],
                    dependencies: Vec::new(),
                    ..ResolvedSymbol::from_export(export_entry, current_file)
                });
            }
            return results;
        }

        let mut all_nested_symbols: Vec<ResolvedSymbol> = Vec::new();
        for source_path in &source_paths {
            let nested = self.resolve_file(source_path, depth + 1, "");
            all_nested_symbols.extend(nested);
        }

        if export_entry.is_wildcard {
            // export * from "..." — transparent pass-through
            return all_nested_symbols;
        } else if export_entry.is_namespace_export {
            // export * as ns from "..." — wrap in namespace
            let namespace_sig = export_entry.signature.clone().unwrap_or_else(|| {
                format!(
                    "namespace {} {{ {} symbols }}",
                    export_entry.name,
                    all_nested_symbols.len()
                )
            });

            results.push(ResolvedSymbol {
                name: full_name.clone(),
                signature: Some(namespace_sig),
                re_export_chain: vec![current_file.to_string()],
                dependencies: Vec::new(),
                ..ResolvedSymbol::from_export(export_entry, current_file)
            });

            // Nest each symbol under the namespace prefix
            for symbol_node in all_nested_symbols {
                let nested_name = if name_prefix.is_empty() {
                    format!("{}.{}", export_entry.name, symbol_node.name)
                } else {
                    format!("{}.{}.{}", name_prefix, export_entry.name, symbol_node.name)
                };

                let mut chain = vec![current_file.to_string()];
                chain.extend(symbol_node.re_export_chain.clone());

                results.push(ResolvedSymbol {
                    name: nested_name,
                    re_export_chain: chain,
                    ..symbol_node
                });
            }
        } else {
            // Named re-export: export { Foo } from "..." or export { Foo as Bar } from "..."
            let target_name = export_entry
                .original_name
                .as_deref()
                .unwrap_or(&export_entry.name);

            let matches: Vec<&ResolvedSymbol> = all_nested_symbols
                .iter()
                .filter(|symbol_node| symbol_node.name == target_name)
                .collect();

            if !matches.is_empty() {
                for matched in matches {
                    let mut chain = vec![current_file.to_string()];
                    chain.extend(matched.re_export_chain.clone());

                    results.push(ResolvedSymbol {
                        name: full_name.clone(),
                        re_export_chain: chain,
                        ..matched.clone()
                    });
                }
            } else {
                // Target not found in nested — create a stub from the first source
                let defined_in = normalize_path(Path::new(&source_paths[0]));
                results.push(ResolvedSymbol {
                    name: full_name,
                    defined_in,
                    re_export_chain: vec![current_file.to_string()],
                    dependencies: Vec::new(),
                    ..ResolvedSymbol::from_export(export_entry, current_file)
                });
            }
        }

        results
    }

    /// Resolves a specific name within a file, regardless of whether it is exported.
    /// Useful for following internal type references during reachability analysis.
    fn resolve_name_in_file(&mut self, name: &str, file_path: &str) -> Vec<ResolvedSymbol> {
        let normalized_path = normalize_path(Path::new(file_path));

        // Build and cache the local index for this file (once per file, not per call)
        if !self.local_index_cache.contains_key(&normalized_path) {
            let exports = match self.raw_exports.get(&normalized_path) {
                Some(exports) => exports,
                None => return Vec::new(),
            };
            let mut index: HashMap<String, Vec<ParsedExport>> = HashMap::new();
            for export in exports {
                index
                    .entry(export.name.clone())
                    .or_default()
                    .push(export.clone());
            }
            self.local_index_cache.insert(normalized_path.clone(), index);
        }

        // Clone just the matching targets (not the whole index) to satisfy borrow checker
        let targets = match self.local_index_cache.get(&normalized_path) {
            Some(index) => match index.get(name) {
                Some(targets) => targets.clone(),
                None => return Vec::new(),
            },
            None => return Vec::new(),
        };

        // Also clone the full local_index for resolve_local_assignment (needs it for member lookup)
        let local_index = self.local_index_cache.get(&normalized_path).cloned().unwrap_or_default();

        let mut results = Vec::new();
        for target in &targets {
            if target.source.is_some() {
                // Re-export: follow it
                results.extend(self.resolve_re_export(target, &normalized_path, 0, ""));
            } else if matches!(
                target.kind,
                SymbolKind::ExportAssignment | SymbolKind::ExportDeclaration | SymbolKind::ImportEquals
            ) {
                // Assignment: resolve local targets
                results.extend(resolve_local_assignment(
                    target,
                    &local_index,
                    &normalized_path,
                    "",
                ));
            } else {
                // Direct definition
                results.push(ResolvedSymbol {
                    is_internal: true,
                    ..ResolvedSymbol::from_export(target, &normalized_path)
                });
            }
        }
        results
    }
}

/// Resolves symbols that are locally assigned (e.g., `export { x as y }`
/// or `export default x`).
fn resolve_local_assignment(
    export_entry: &ParsedExport,
    local_index: &HashMap<String, Vec<ParsedExport>>,
    current_file: &str,
    name_prefix: &str,
) -> Vec<ResolvedSymbol> {
    let target_name = export_entry
        .original_name
        .as_deref()
        .unwrap_or(&export_entry.name);

    let targets = match local_index.get(target_name) {
        Some(targets) => targets,
        None => return Vec::new(),
    };

    // Only resolve to actual definitions, not other forwarding entries.
    let mut actual_targets: Vec<&ParsedExport> = targets
        .iter()
        .filter(|target| {
            !matches!(
                target.kind,
                SymbolKind::ExportDeclaration
                    | SymbolKind::ExportAssignment
                    | SymbolKind::ImportEquals
                    | SymbolKind::NamespaceExportDeclaration
            )
        })
        .collect();

    if actual_targets.is_empty() {
        // If it's an ExportAssignment with no local definition (e.g. export default 123),
        // we should still return the original export entry itself as the target.
        if export_entry.kind == SymbolKind::ExportAssignment {
            actual_targets.push(export_entry);
        } else {
            return Vec::new();
        }
    }

    let mut results: Vec<ResolvedSymbol> = Vec::new();
    let full_name = if name_prefix.is_empty() {
        export_entry.name.clone()
    } else {
        format!("{}.{}", name_prefix, export_entry.name)
    };

    for target in &actual_targets {
        let is_internal = target.kind == SymbolKind::ExportAssignment && full_name == "default";
        results.push(ResolvedSymbol {
            name: full_name.clone(),
            is_internal,
            ..ResolvedSymbol::from_export(target, current_file)
        });
    }

    for target in &actual_targets {
        let member_prefix = format!("{}.", target.name);
        let mut matching_members: Vec<&ParsedExport> = Vec::new();

        for (member_name, members) in local_index {
            if member_name.starts_with(&member_prefix) {
                matching_members.extend(members.iter());
            }
        }

        for member in &matching_members {
            let local_member_name = &member.name[member_prefix.len()..];
            let new_name = if name_prefix.is_empty() {
                format!("{}.{}", export_entry.name, local_member_name)
            } else {
                format!("{}.{}.{}", name_prefix, export_entry.name, local_member_name)
            };

            results.push(ResolvedSymbol {
                name: new_name,
                ..ResolvedSymbol::from_export(member, current_file)
            });
        }
    }

    results
}

/// Resolves a triple-slash reference path relative to the current file.
fn resolve_triple_slash_ref(ref_path: &str, current_file: &str) -> Option<String> {
    let dir = Path::new(current_file).parent()?;
    let resolved = dir.join(ref_path);
    if resolved.exists() {
        Some(normalize_path(&resolved))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: creates a .d.ts file in the temp directory.
    fn write_dts(dir: &Path, name: &str, content: &str) -> String {
        let file_path = dir.join(name);
        fs::write(&file_path, content).unwrap();
        normalize_path(&file_path)
    }

    #[test]
    fn crawl_single_file_extracts_exports() {
        let temp_dir = TempDir::new().unwrap();
        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export declare function greet(name: string): string;\nexport declare const VERSION: string;",
        );

        let result = crawl(&[entry], None);

        assert_eq!(result.exports.len(), 2);
        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "greet" && symbol.kind == SymbolKind::Function));
        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "VERSION" && symbol.kind == SymbolKind::Variable));
    }

    #[test]
    fn crawl_follows_re_exports() {
        let temp_dir = TempDir::new().unwrap();

        write_dts(
            temp_dir.path(),
            "lib.d.ts",
            "export declare function helper(): void;",
        );

        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export { helper } from './lib';",
        );

        let result = crawl(&[entry], None);

        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "helper" && symbol.kind == SymbolKind::Function));
        assert!(result.visited_files.len() >= 2);
    }

    #[test]
    fn crawl_detects_circular_refs() {
        let temp_dir = TempDir::new().unwrap();

        let file_a = write_dts(
            temp_dir.path(),
            "a.d.ts",
            "export { b } from './b';",
        );

        write_dts(
            temp_dir.path(),
            "b.d.ts",
            "export { a } from './a';",
        );

        let result = crawl(&[file_a], None);

        // Circular reference should be detected
        assert!(
            !result.circular_refs.is_empty(),
            "Expected circular reference detection"
        );
    }

    #[test]
    fn crawl_respects_depth_limit() {
        let temp_dir = TempDir::new().unwrap();

        write_dts(
            temp_dir.path(),
            "deep.d.ts",
            "export declare function deepFunc(): void;",
        );

        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export { deepFunc } from './deep';",
        );

        let result = crawl(
            &[entry],
            Some(CrawlOptions { max_depth: 0 }),
        );

        // With max_depth=0, we should only parse the entry file, not follow re-exports
        // The deepFunc should not be fully resolved
        assert!(result.visited_files.len() <= 1);
    }

    #[test]
    fn crawl_wildcard_re_export() {
        let temp_dir = TempDir::new().unwrap();

        write_dts(
            temp_dir.path(),
            "types.d.ts",
            "export interface Config { key: string; }\nexport type Mode = 'dark' | 'light';",
        );

        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export * from './types';",
        );

        let result = crawl(&[entry], None);

        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "Config" && symbol.kind == SymbolKind::Interface));
        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "Mode" && symbol.kind == SymbolKind::TypeAlias));
    }

    #[test]
    fn crawl_namespace_re_export() {
        let temp_dir = TempDir::new().unwrap();

        write_dts(
            temp_dir.path(),
            "utils.d.ts",
            "export declare function format(): string;",
        );

        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export * as utils from './utils';",
        );

        let result = crawl(&[entry], None);

        // Should have the namespace symbol and the nested one
        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "utils"));
        assert!(result
            .exports
            .iter()
            .any(|symbol| symbol.name == "utils.format"));
    }

    #[test]
    fn crawl_marks_internal_symbols() {
        let temp_dir = TempDir::new().unwrap();

        write_dts(
            temp_dir.path(),
            "internal.d.ts",
            "export declare function internalHelper(): void;\nexport declare function publicHelper(): void;",
        );

        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "export { publicHelper } from './internal';",
        );

        let result = crawl(&[entry], None);

        let public_sym = result
            .exports
            .iter()
            .find(|symbol| symbol.name == "publicHelper");
        assert!(public_sym.is_some());
        assert!(!public_sym.unwrap().is_internal);

        let internal_sym = result
            .exports
            .iter()
            .find(|symbol| symbol.name == "internalHelper");
        assert!(internal_sym.is_some());
        assert!(internal_sym.unwrap().is_internal);
    }
}
