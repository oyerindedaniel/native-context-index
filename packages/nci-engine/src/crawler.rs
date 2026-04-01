use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::constants::DEFAULT_MAX_DEPTH;
use crate::dedupe::symbol_dedupe_key;
use crate::parser;
use crate::resolver::{normalize_path, resolve_module_specifier};
use crate::types::{
    CrawlResult, ParsedExport, ParsedImport, ResolvedSymbol, SharedString, SharedVec, SymbolKind,
};

#[derive(Debug, Clone)]
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

pub fn crawl(entry_file_paths: &[SharedString], options: Option<CrawlOptions>) -> CrawlResult {
    let crawl_options = options.unwrap_or_default();
    let mut session = CrawlSession::new(crawl_options.max_depth);

    let primary_entry = entry_file_paths.first().cloned().unwrap_or_default();

    for entry_path in entry_file_paths {
        session.discover_files(entry_path, 0);
    }

    let mut resolved_symbols: Vec<ResolvedSymbol> = Vec::new();
    let mut public_symbols: HashSet<SharedString> = HashSet::new();
    let mut all_seen_keys: HashSet<SharedString> = HashSet::new();

    // Deduplicate entry paths (e.g., exports + typesVersions resolving to the same file)
    let mut seen_entries: HashSet<SharedString> = HashSet::new();
    let unique_entries: Vec<&SharedString> = entry_file_paths
        .iter()
        .filter(|path| {
            let norm = normalize_path(Path::new(path.as_ref()));
            seen_entries.insert(norm)
        })
        .collect();

    for entry_path in &unique_entries {
        let resolved = session.resolve_file(entry_path, 0, "");
        for mut resolved_symbol in resolved {
            let dedup_key = SharedString::from(
                symbol_dedupe_key(
                    resolved_symbol.defined_in.as_ref(),
                    resolved_symbol.name.as_ref(),
                    resolved_symbol.kind,
                    resolved_symbol.signature.as_deref(),
                )
                .as_str(),
            );
            if all_seen_keys.contains(&dedup_key) {
                continue;
            }
            let pub_key = SharedString::from(
                format!(
                    "{}::{}",
                    resolved_symbol.defined_in.as_ref(),
                    resolved_symbol.name.as_ref()
                )
                .as_ref(),
            );
            resolved_symbol.is_internal = false;
            resolved_symbols.push(resolved_symbol);
            all_seen_keys.insert(dedup_key);
            public_symbols.insert(pub_key);
        }
    }

    let visited_files: Vec<SharedString> = session.visited.iter().cloned().collect();
    for file in &visited_files {
        let exports = match session.raw_exports.get(file) {
            Some(exports) => exports.clone(),
            None => continue,
        };

        for export_entry in &exports {
            if export_entry.is_global_augmentation
                || export_entry.is_wildcard
                || export_entry.name.is_empty()
            {
                continue;
            }

            if matches!(export_entry.kind, SymbolKind::ExportDeclaration) {
                continue;
            }

            let name_key = SharedString::from(
                format!("{}::{}", file.as_ref(), export_entry.name.as_ref()).as_ref(),
            );
            if public_symbols.contains(&name_key) {
                continue;
            }

            let internal_results =
                session.resolve_name_in_file(export_entry.name.as_ref(), file);
            for mut internal_sym in internal_results {
                let dedup_key = SharedString::from(
                    symbol_dedupe_key(
                        internal_sym.defined_in.as_ref(),
                        internal_sym.name.as_ref(),
                        internal_sym.kind,
                        internal_sym.signature.as_deref(),
                    )
                    .as_str(),
                );
                if all_seen_keys.contains(&dedup_key) {
                    continue;
                }
                internal_sym.is_internal = true;
                resolved_symbols.push(internal_sym);
                all_seen_keys.insert(dedup_key);
            }
            public_symbols.insert(name_key);
        }
    }

    let triple_slash_reference_targets: HashMap<SharedString, Vec<SharedString>> = session
        .triple_slash_ref_targets
        .into_iter()
        .map(|(from, set)| {
            let mut v: Vec<SharedString> = set.into_iter().collect();
            v.sort_by(|a, b| a.cmp(b));
            (from, v)
        })
        .collect();

    CrawlResult {
        file_path: SharedString::from(primary_entry.as_ref()),
        exports: resolved_symbols,
        imports: session.raw_imports,
        visited_files,
        type_reference_packages: session.type_ref_packages.into_iter().collect(),
        circular_refs: session.circular_refs,
        triple_slash_reference_targets,
    }
}

struct CrawlSession {
    /// Files we've already visited (prevents re-parsing).
    visited: HashSet<SharedString>,

    /// Circular reference chains detected during discovery.
    circular_refs: Vec<String>,

    /// Package names from `/// <reference types="..." />` directives.
    type_ref_packages: HashSet<SharedString>,

    /// Direct triple-slash reference targets per file.
    triple_slash_ref_targets: HashMap<SharedString, HashSet<SharedString>>,

    /// Parsed exports per file.
    raw_exports: HashMap<SharedString, Vec<ParsedExport>>,

    /// Parsed imports per file.
    raw_imports: HashMap<SharedString, Vec<ParsedImport>>,

    /// Parsed triple-slash references per file.
    raw_references: HashMap<SharedString, Vec<SharedString>>,

    /// Path set for circular detection during discovery (DFS ancestry).
    discovery_path_set: HashSet<SharedString>,

    /// Path stack for circular detection during discovery.
    discovery_path_stack: Vec<SharedString>,

    /// Path set for circular detection during resolution.
    resolution_path: HashSet<SharedString>,

    /// Cache of resolved symbols per file.
    resolution_cache: HashMap<SharedString, Vec<ResolvedSymbol>>,

    /// Cached name→exports index per file (built lazily, avoids repeated HashMap rebuilds).
    local_index_cache: HashMap<SharedString, HashMap<SharedString, Vec<ParsedExport>>>,

    /// Maximum depth for re-export following.
    max_depth: usize,
}

impl CrawlSession {
    fn new(max_depth: usize) -> Self {
        Self {
            visited: HashSet::new(),
            circular_refs: Vec::new(),
            type_ref_packages: HashSet::new(),
            triple_slash_ref_targets: HashMap::new(),
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
    fn discover_files(&mut self, file_path: &SharedString, depth: usize) {
        let normalized_path_str = normalize_path(Path::new(file_path.as_ref()));
        let normalized_path = SharedString::from(normalized_path_str.as_ref());

        if depth > self.max_depth {
            return;
        }

        if !Path::new(normalized_path.as_ref()).exists() {
            return;
        }

        // Circular detection during discovery (DFS ancestry)
        if self.discovery_path_set.contains(&normalized_path) {
            let stack: Vec<&str> = self
                .discovery_path_stack
                .iter()
                .map(|s| s.as_ref())
                .collect();
            self.circular_refs.push(format!(
                "{} -> {}",
                stack.join(" -> "),
                normalized_path.as_ref()
            ));
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

        for package in parse_result.type_references.iter() {
            self.type_ref_packages.insert(package.clone());
        }

        self.raw_exports
            .insert(normalized_path.clone(), parse_result.exports.to_vec());
        self.raw_imports
            .insert(normalized_path.clone(), parse_result.imports.to_vec());
        self.raw_references
            .insert(normalized_path.clone(), parse_result.references.to_vec());

        let references = parse_result.references.clone();
        for reference in references.iter() {
            let resolved_paths = resolve_module_specifier(reference.as_ref(), &normalized_path);
            if !resolved_paths.is_empty() {
                for ref_path in &resolved_paths {
                    let from_k = normalize_path(Path::new(normalized_path.as_ref()));
                    let to_k = normalize_path(Path::new(ref_path.as_ref()));
                    self.triple_slash_ref_targets
                        .entry(from_k)
                        .or_default()
                        .insert(to_k);
                    self.discover_files(ref_path, depth + 1);
                }
            } else {
                let ref_path = resolve_triple_slash_ref(reference.as_ref(), &normalized_path);
                if let Some(ref_path) = ref_path {
                    let from_k = normalize_path(Path::new(normalized_path.as_ref()));
                    let to_k = normalize_path(Path::new(ref_path.as_ref()));
                    self.triple_slash_ref_targets
                        .entry(from_k)
                        .or_default()
                        .insert(to_k);
                    self.discover_files(&ref_path, depth + 1);
                }
            }
        }

        let exports = parse_result.exports.clone();
        for export_entry in exports.iter() {
            if let Some(source) = &export_entry.source {
                let source_paths = resolve_module_specifier(source.as_ref(), &normalized_path);
                for source_path in &source_paths {
                    self.discover_files(source_path, depth + 1);
                }
            }
        }

        let imports = parse_result.imports.clone();
        for import_entry in imports.iter() {
            let imported_paths =
                resolve_module_specifier(import_entry.source.as_ref(), &normalized_path);
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
        file_path: &SharedString,
        depth: usize,
        name_prefix: &str,
    ) -> Vec<ResolvedSymbol> {
        let normalized_path_str = normalize_path(Path::new(file_path.as_ref()));
        let normalized_path = SharedString::from(normalized_path_str.as_ref());

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

        let mut known_names: HashSet<SharedString> = actual_exports
            .iter()
            .map(|entry| entry.name.clone())
            .collect();

        let triple_slash_refs = self
            .raw_references
            .get(&normalized_path)
            .cloned()
            .unwrap_or_default();

        for reference in &triple_slash_refs {
            let resolved_paths = resolve_module_specifier(reference.as_ref(), &normalized_path);
            let ref_paths: Vec<SharedString> = if !resolved_paths.is_empty() {
                resolved_paths
            } else {
                resolve_triple_slash_ref(reference.as_ref(), &normalized_path)
                    .into_iter()
                    .map(SharedString::from)
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

        let mut local_index: HashMap<SharedString, Vec<ParsedExport>> = HashMap::new();
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
                let re_export_results =
                    self.resolve_re_export(export_entry, &normalized_path, depth, name_prefix);
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
                    SharedString::from(
                        format!("{}.{}", name_prefix, export_entry.name.as_ref()).as_ref(),
                    )
                };

                let is_internal = export_entry.kind == SymbolKind::ExportAssignment
                    && export_entry.name.as_ref() == "default";
                results.push(ResolvedSymbol {
                    name: full_name,
                    is_internal,
                    ..ResolvedSymbol::from_export(export_entry, normalized_path.clone())
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
        current_file: &SharedString,
        depth: usize,
        name_prefix: &str,
    ) -> Vec<ResolvedSymbol> {
        let mut results: Vec<ResolvedSymbol> = Vec::new();
        let full_name = if name_prefix.is_empty() {
            export_entry.name.clone()
        } else {
            SharedString::from(format!("{}.{}", name_prefix, export_entry.name.as_ref()).as_ref())
        };

        let source = match &export_entry.source {
            Some(source) => source.clone(),
            None => return results,
        };

        let source_paths = resolve_module_specifier(source.as_ref(), current_file);

        if source_paths.is_empty() {
            // Unresolvable source — create a stub symbol if not wildcard
            if !export_entry.is_wildcard {
                results.push(ResolvedSymbol {
                    name: full_name,
                    re_export_chain: vec![current_file.clone()],
                    dependencies: SharedVec::from([]),
                    ..ResolvedSymbol::from_export(export_entry, current_file.clone())
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
                SharedString::from(
                    format!(
                        "namespace {} {{ {} symbols }}",
                        export_entry.name.as_ref(),
                        all_nested_symbols.len()
                    )
                    .as_ref(),
                )
            });

            results.push(ResolvedSymbol {
                name: full_name.clone(),
                signature: Some(namespace_sig),
                re_export_chain: vec![current_file.clone()],
                dependencies: SharedVec::from([]),
                ..ResolvedSymbol::from_export(export_entry, current_file.clone())
            });

            // Nest each symbol under the namespace prefix
            for symbol_node in all_nested_symbols {
                let nested_name = if name_prefix.is_empty() {
                    format!(
                        "{}.{}",
                        export_entry.name.as_ref(),
                        symbol_node.name.as_ref()
                    )
                } else {
                    format!(
                        "{}.{}.{}",
                        name_prefix,
                        export_entry.name.as_ref(),
                        symbol_node.name.as_ref()
                    )
                };

                let mut chain = vec![current_file.clone()];
                chain.extend(symbol_node.re_export_chain.clone());

                results.push(ResolvedSymbol {
                    name: SharedString::from(nested_name.as_ref()),
                    re_export_chain: chain,
                    ..symbol_node
                });
            }
        } else {
            // Named re-export: export { Foo } from "..." or export { Foo as Bar } from "..."
            let target_name = export_entry
                .original_name
                .as_deref()
                .unwrap_or(export_entry.name.as_ref());

            let matches: Vec<&ResolvedSymbol> = all_nested_symbols
                .iter()
                .filter(|symbol_node| symbol_node.name.as_ref() == target_name)
                .collect();

            if !matches.is_empty() {
                for matched in matches {
                    let mut chain = vec![current_file.clone()];
                    chain.extend(matched.re_export_chain.clone());

                    results.push(ResolvedSymbol {
                        name: SharedString::from(full_name.as_ref()),
                        re_export_chain: chain,
                        ..matched.clone()
                    });
                }
            } else {
                // Target not found in nested — create a stub from the first source
                let defined_in = SharedString::from(
                    normalize_path(Path::new(source_paths[0].as_ref())).as_ref(),
                );
                results.push(ResolvedSymbol {
                    name: SharedString::from(full_name.as_ref()),
                    defined_in,
                    re_export_chain: vec![current_file.clone()],
                    dependencies: SharedVec::from([]),
                    ..ResolvedSymbol::from_export(export_entry, current_file.clone())
                });
            }
        }

        results
    }

    /// `extract_export_default` records both the `export default …` wrapper and the inner
    /// declaration (e.g. class body) as separate [`ParsedExport`]s with the same name.
    /// Resolving both yields duplicate [`ResolvedSymbol`]s that differ only by signature span;
    /// keep the inner declaration (`is_explicit_export == false`).
    fn prefer_inner_decl_over_export_default_wrapper(mut targets: Vec<ParsedExport>) -> Vec<ParsedExport> {
        if targets.len() <= 1 {
            return targets;
        }
        let has_non_explicit = targets.iter().any(|t| !t.is_explicit_export);
        let has_explicit = targets.iter().any(|t| t.is_explicit_export);
        if !has_non_explicit || !has_explicit {
            return targets;
        }
        let kind0 = targets[0].kind;
        if !targets.iter().all(|t| t.kind == kind0) {
            return targets;
        }
        if matches!(
            kind0,
            SymbolKind::Class
                | SymbolKind::Function
                | SymbolKind::Interface
                | SymbolKind::TypeAlias
                | SymbolKind::Enum
        ) {
            targets.retain(|t| !t.is_explicit_export);
        }
        targets
    }

    /// Resolves a specific name within a file, regardless of whether it is exported.
    /// Useful for following internal type references during reachability analysis.
    fn resolve_name_in_file(
        &mut self,
        name: &str,
        file_path: &SharedString,
    ) -> Vec<ResolvedSymbol> {
        // Build and cache the local index for this file (once per file, not per call)
        let normalized_path = normalize_path(Path::new(file_path.as_ref()));
        if !self.local_index_cache.contains_key(&normalized_path) {
            let exports = match self.raw_exports.get(&normalized_path) {
                Some(exports) => exports,
                None => return Vec::new(),
            };
            let mut index: HashMap<SharedString, Vec<ParsedExport>> = HashMap::new();
            for export in exports {
                index
                    .entry(export.name.clone())
                    .or_default()
                    .push(export.clone());
            }
            self.local_index_cache
                .insert(normalized_path.clone(), index);
        }

        // Clone just the matching targets (not the whole index) to satisfy borrow checker
        let targets = match self.local_index_cache.get(&normalized_path) {
            Some(index) => match index.get(name) {
                Some(targets) => Self::prefer_inner_decl_over_export_default_wrapper(targets.clone()),
                None => return Vec::new(),
            },
            None => return Vec::new(),
        };

        // Also clone the full local_index for resolve_local_assignment (needs it for member lookup)
        let local_index = self
            .local_index_cache
            .get(&normalized_path)
            .cloned()
            .unwrap_or_default();

        let mut results = Vec::new();
        for target in &targets {
            if target.source.is_some() {
                // Re-export: follow it
                results.extend(self.resolve_re_export(target, &normalized_path, 0, ""));
            } else if matches!(
                target.kind,
                SymbolKind::ExportAssignment
                    | SymbolKind::ExportDeclaration
                    | SymbolKind::ImportEquals
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
                    ..ResolvedSymbol::from_export(target, normalized_path.clone())
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
    local_index: &HashMap<SharedString, Vec<ParsedExport>>,
    current_file: &SharedString,
    name_prefix: &str,
) -> Vec<ResolvedSymbol> {
    let target_name = export_entry
        .original_name
        .as_deref()
        .unwrap_or(export_entry.name.as_ref());

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
        SharedString::from(format!("{}.{}", name_prefix, export_entry.name.as_ref()).as_ref())
    };

    for target in &actual_targets {
        let is_internal =
            target.kind == SymbolKind::ExportAssignment && full_name.as_ref() == "default";
        results.push(ResolvedSymbol {
            name: full_name.clone(),
            is_internal,
            ..ResolvedSymbol::from_export(target, current_file.clone())
        });
    }

    for target in &actual_targets {
        let member_prefix = format!("{}.", target.name.as_ref());
        let mut matching_members: Vec<&ParsedExport> = Vec::new();

        for (member_name, members) in local_index {
            if member_name.as_ref().starts_with(&member_prefix) {
                matching_members.extend(members.iter());
            }
        }

        for member in &matching_members {
            let local_member_name = &member.name.as_ref()[member_prefix.len()..];
            let new_name = if name_prefix.is_empty() {
                format!("{}.{}", export_entry.name.as_ref(), local_member_name)
            } else {
                format!(
                    "{}.{}.{}",
                    name_prefix,
                    export_entry.name.as_ref(),
                    local_member_name
                )
            };

            results.push(ResolvedSymbol {
                name: SharedString::from(new_name.as_ref()),
                ..ResolvedSymbol::from_export(member, current_file.clone())
            });
        }
    }

    results
}

/// Resolves a triple-slash reference path relative to the current file.
fn resolve_triple_slash_ref(ref_path: &str, current_file: &SharedString) -> Option<SharedString> {
    let dir = Path::new(current_file.as_ref()).parent()?;
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
    fn write_dts(dir: &Path, name: &str, content: &str) -> SharedString {
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
        assert!(
            result.exports.iter().any(
                |symbol| symbol.name.as_ref() == "greet" && symbol.kind == SymbolKind::Function
            )
        );
        assert!(
            result
                .exports
                .iter()
                .any(|symbol| symbol.name.as_ref() == "VERSION"
                    && symbol.kind == SymbolKind::Variable)
        );
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

        assert!(
            result
                .exports
                .iter()
                .any(|symbol| symbol.name.as_ref() == "helper"
                    && symbol.kind == SymbolKind::Function)
        );
        assert!(result.visited_files.len() >= 2);
    }

    #[test]
    fn crawl_detects_circular_refs() {
        let temp_dir = TempDir::new().unwrap();

        let file_a = write_dts(temp_dir.path(), "a.d.ts", "export { b } from './b';");

        write_dts(temp_dir.path(), "b.d.ts", "export { a } from './a';");

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

        let result = crawl(&[entry], Some(CrawlOptions { max_depth: 0 }));

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

        let entry = write_dts(temp_dir.path(), "index.d.ts", "export * from './types';");

        let result = crawl(&[entry], None);

        assert!(
            result
                .exports
                .iter()
                .any(|symbol| symbol.name.as_ref() == "Config"
                    && symbol.kind == SymbolKind::Interface)
        );
        assert!(
            result.exports.iter().any(
                |symbol| symbol.name.as_ref() == "Mode" && symbol.kind == SymbolKind::TypeAlias
            )
        );
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
        assert!(
            result
                .exports
                .iter()
                .any(|symbol| symbol.name.as_ref() == "utils")
        );
        assert!(
            result
                .exports
                .iter()
                .any(|symbol| symbol.name.as_ref() == "utils.format")
        );
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
            .find(|symbol| symbol.name.as_ref() == "publicHelper");
        assert!(public_sym.is_some());
        assert!(!public_sym.unwrap().is_internal);

        let internal_sym = result
            .exports
            .iter()
            .find(|symbol| symbol.name.as_ref() == "internalHelper");
        assert!(internal_sym.is_some());
        assert!(internal_sym.unwrap().is_internal);
    }
}
