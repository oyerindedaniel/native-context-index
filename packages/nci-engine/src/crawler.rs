use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use rayon::prelude::*;

use crate::constants::DEFAULT_MAX_HOPS;
use crate::dedupe::symbol_dedupe_key;
use crate::parser;
use crate::parser::ParseResult;
use crate::profile;
use crate::resolver::{normalize_path, normalize_path_with_dashmap, resolve_module_specifier};
use crate::types::{
    CrawlResult, ParsedExport, ParsedImport, ResolvedSymbol, SharedString, SharedVec, SymbolKind,
};

#[derive(Debug, Clone)]
pub struct CrawlOptions {
    /// Upper bound on unweighted discovery edges from each package entry (`0` = entry files only).
    pub max_hops: usize,
    /// When built with `--features phase-profile` and `NCI_PROFILE=1`, prepends this label to crawl phase timings for this run.
    pub profile_as: Option<SharedString>,
    /// When true, resolve `SymbolNode` dependency ids in parallel during graph build (Rayon + DashMap).
    pub parallel_resolve_deps: bool,
}

impl Default for CrawlOptions {
    fn default() -> Self {
        Self {
            max_hops: DEFAULT_MAX_HOPS,
            profile_as: None,
            parallel_resolve_deps: true,
        }
    }
}

pub fn crawl(entry_file_paths: &[SharedString], options: Option<CrawlOptions>) -> CrawlResult {
    let crawl_options = options.unwrap_or_default();
    let profile_label = |phase: &str| {
        if let Some(ref pkg) = crawl_options.profile_as {
            format!("[{}] {}", pkg.as_ref(), phase)
        } else {
            phase.to_string()
        }
    };

    let mut session = CrawlSession::new(crawl_options.max_hops);

    let primary_entry = entry_file_paths.first().cloned().unwrap_or_default();

    let discover_start = Instant::now();
    session.discover_linked_files(entry_file_paths);
    profile::profile_log(
        &profile_label("crawl.discover"),
        discover_start.elapsed().as_secs_f64() * 1000.0,
    );

    let mut resolved_symbols: Vec<ResolvedSymbol> = Vec::new();
    let mut public_symbols: HashSet<SharedString> = HashSet::new();
    let mut all_seen_keys: HashSet<SharedString> = HashSet::new();

    // Deduplicate entry paths (e.g., exports + typesVersions resolving to the same file)
    let mut seen_entries: HashSet<SharedString> = HashSet::new();
    let unique_entries: Vec<&SharedString> = entry_file_paths
        .iter()
        .filter(|path| {
            let norm = session.norm_path(Path::new(path.as_ref()));
            seen_entries.insert(norm)
        })
        .collect();

    let resolve_exports_start = Instant::now();
    for entry_path in &unique_entries {
        let resolved = session.resolve_file(entry_path, 0, "");
        for mut resolved_symbol in resolved.iter().cloned() {
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
            resolved_symbol.is_internal = false;
            resolved_symbols.push(resolved_symbol);
            all_seen_keys.insert(dedup_key.clone());
            public_symbols.insert(dedup_key);
        }
    }
    profile::profile_log(
        &profile_label("crawl.resolve_exports"),
        resolve_exports_start.elapsed().as_secs_f64() * 1000.0,
    );

    let mut visited_files: Vec<SharedString> = session.visited.iter().cloned().collect();
    visited_files.sort();
    let internal_start = Instant::now();
    for file in &visited_files {
        let Some(exports_slice) = session.raw_exports.get(file) else {
            continue;
        };
        let preferred_indices = preferred_inner_export_indices(exports_slice.as_slice());

        for export_idx in preferred_indices {
            let export_entry = &exports_slice[export_idx];
            if export_entry.is_wildcard || export_entry.name.is_empty() {
                continue;
            }
            if export_entry.is_global_augmentation
                && export_entry.kind == SymbolKind::Namespace
                && export_entry.name.as_ref() == "global"
            {
                continue;
            }

            if matches!(export_entry.kind, SymbolKind::ExportDeclaration) {
                continue;
            }

            let definition_key = SharedString::from(
                symbol_dedupe_key(
                    file.as_ref(),
                    export_entry.name.as_ref(),
                    export_entry.kind,
                    export_entry.signature.as_deref(),
                )
                .as_str(),
            );
            if public_symbols.contains(&definition_key) {
                continue;
            }

            if all_seen_keys.contains(&definition_key) {
                continue;
            }

            let mut internal_sym = ResolvedSymbol::from_export(export_entry, file.clone());
            internal_sym.is_internal = true;
            resolved_symbols.push(internal_sym);
            all_seen_keys.insert(definition_key.clone());
            public_symbols.insert(definition_key);
        }
    }
    profile::profile_log(
        &profile_label("crawl.internal_symbols"),
        internal_start.elapsed().as_secs_f64() * 1000.0,
    );
    profile::profile_stat(&profile_label("crawl.files_visited"), visited_files.len());

    let mut triple_rows: Vec<(SharedString, HashSet<SharedString>)> =
        session.triple_slash_ref_targets.into_iter().collect();
    triple_rows.sort_by(|(from_a, _), (from_b, _)| from_a.cmp(from_b));
    let triple_slash_reference_targets: HashMap<SharedString, Vec<SharedString>> = triple_rows
        .into_iter()
        .map(|(from, set)| {
            let mut targets: Vec<SharedString> = set.into_iter().collect();
            targets.sort();
            (from, targets)
        })
        .collect();

    let mut type_ref_packages: Vec<SharedString> = session.type_ref_packages.into_iter().collect();
    type_ref_packages.sort();

    CrawlResult {
        file_path: SharedString::from(primary_entry.as_ref()),
        exports: resolved_symbols,
        imports: session.raw_imports,
        visited_files,
        type_reference_packages: type_ref_packages,
        circular_refs: session.circular_refs,
        triple_slash_reference_targets,
    }
}

/// Returns export indices in the same merge order as the previous implementation that preferred
/// inner declarations over `export default` wrappers for class/function/interface/type/enum/alias
/// symbols when both explicit and non-explicit exports exist in a group—without cloning the full
/// export list for every file.
fn preferred_inner_export_indices(exports: &[ParsedExport]) -> Vec<usize> {
    let mut grouped: HashMap<String, Vec<usize>> = HashMap::with_capacity(exports.len().min(256));
    for (export_index, export) in exports.iter().enumerate() {
        let key = format!("{}::{}", export.name.as_ref(), export.kind.numeric_kind());
        grouped.entry(key).or_default().push(export_index);
    }

    let mut sorted_group_keys: Vec<String> = grouped.keys().cloned().collect();
    sorted_group_keys.sort();

    let mut out = Vec::with_capacity(exports.len());
    for group_key in sorted_group_keys {
        let mut indices = grouped
            .remove(&group_key)
            .expect("group key was collected from the same map");
        let kind = exports[indices[0]].kind;
        let has_non_explicit = indices
            .iter()
            .any(|&export_index| !exports[export_index].is_explicit_export);
        let has_explicit = indices
            .iter()
            .any(|&export_index| exports[export_index].is_explicit_export);
        let keep_non_explicit_only = has_non_explicit
            && has_explicit
            && matches!(
                kind,
                SymbolKind::Class
                    | SymbolKind::Function
                    | SymbolKind::Interface
                    | SymbolKind::TypeAlias
                    | SymbolKind::Enum
            );

        if keep_non_explicit_only {
            indices.retain(|&export_index| !exports[export_index].is_explicit_export);
        }
        out.extend(indices);
    }
    out
}

struct CrawlSession {
    /// Files we've already visited (prevents re-parsing).
    visited: HashSet<SharedString>,

    /// Skipped discovery edges `from -> to` where `to` was already discovered (sorted).
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

    /// Whether each parsed file is an external module.
    file_is_external_module: HashMap<SharedString, bool>,

    /// Path set for circular detection during resolution.
    resolution_path: HashSet<SharedString>,

    /// Cache of resolved symbols per file.
    resolution_cache: HashMap<SharedString, Arc<Vec<ResolvedSymbol>>>,

    /// Canonical `PathBuf` → normalized absolute path string.
    path_norm_cache: DashMap<PathBuf, SharedString>,

    /// `(specifier, from_file)` → candidate absolute declaration paths from `resolve_module_specifier`.
    module_specifier_cache: DashMap<(SharedString, SharedString), Vec<SharedString>>,

    /// Same bound as [`CrawlOptions::max_hops`] for this session.
    max_hops: usize,
}

impl CrawlSession {
    fn new(max_hops: usize) -> Self {
        Self {
            visited: HashSet::new(),
            circular_refs: Vec::new(),
            type_ref_packages: HashSet::new(),
            triple_slash_ref_targets: HashMap::new(),
            raw_exports: HashMap::new(),
            raw_imports: HashMap::new(),
            raw_references: HashMap::new(),
            file_is_external_module: HashMap::new(),
            resolution_path: HashSet::new(),
            resolution_cache: HashMap::new(),
            path_norm_cache: DashMap::new(),
            module_specifier_cache: DashMap::new(),
            max_hops,
        }
    }

    #[inline]
    fn norm_path(&self, file_path: &Path) -> SharedString {
        normalize_path_with_dashmap(&self.path_norm_cache, file_path)
    }

    /// Cached wrapper around [`resolve_module_specifier`].
    fn cached_resolve(&self, specifier: &str, from_file: &str) -> Vec<SharedString> {
        let key = (SharedString::from(specifier), SharedString::from(from_file));
        if let Some(cached) = self.module_specifier_cache.get(&key) {
            return cached.clone();
        }
        let result = resolve_module_specifier(specifier, from_file);
        self.module_specifier_cache.insert(key, result.clone());
        result
    }

    /// Walks re-export / import / triple-slash / dependency edges from entries up to `max_hops`.
    fn discover_linked_files(&mut self, entry_paths: &[SharedString]) {
        let mut hop: HashMap<SharedString, usize> = HashMap::new();
        let mut circular_acc: BTreeSet<String> = BTreeSet::new();
        let mut current_layer: Vec<SharedString> = Vec::new();

        for entry_path in entry_paths {
            let normalized_entry = self.norm_path(Path::new(entry_path.as_ref()));
            if !Path::new(normalized_entry.as_ref()).exists() {
                continue;
            }
            if hop.insert(normalized_entry.clone(), 0).is_none() {
                self.visited.insert(normalized_entry.clone());
                current_layer.push(normalized_entry);
            }
        }
        current_layer.sort();
        current_layer.dedup();

        while !current_layer.is_empty() {
            let parsed: Vec<(SharedString, Option<ParseResult>)> = current_layer
                .par_iter()
                .map(|declaration_path| {
                    let parse_result = parser::parse_file(declaration_path.as_ref());
                    (declaration_path.clone(), parse_result)
                })
                .collect();

            let mut parsed_sorted = parsed;
            parsed_sorted.sort_by(|pair_left, pair_right| pair_left.0.cmp(&pair_right.0));

            let mut next_layer: Vec<SharedString> = Vec::new();

            for (normalized_path, maybe_pr) in parsed_sorted {
                let from_hop = hop[&normalized_path];
                let Some(parse_result) = maybe_pr else {
                    continue;
                };

                for package in parse_result.type_references.iter() {
                    self.type_ref_packages.insert(package.clone());
                }
                self.raw_exports.insert(
                    normalized_path.clone(),
                    parse_result.exports.iter().cloned().collect(),
                );
                self.raw_imports.insert(
                    normalized_path.clone(),
                    parse_result.imports.iter().cloned().collect(),
                );
                self.raw_references.insert(
                    normalized_path.clone(),
                    parse_result.references.iter().cloned().collect(),
                );
                self.file_is_external_module
                    .insert(normalized_path.clone(), parse_result.is_external_module);

                let (triple_edges, mut targets) =
                    self.enumerate_discovery_edges(&normalized_path, &parse_result);
                for (referrer_path, referenced_path) in triple_edges {
                    self.triple_slash_ref_targets
                        .entry(referrer_path)
                        .or_default()
                        .insert(referenced_path);
                }

                targets.sort();
                targets.dedup();
                let candidate_hop = from_hop + 1;
                if candidate_hop > self.max_hops {
                    continue;
                }
                for target_path in targets {
                    if !Path::new(target_path.as_ref()).exists() {
                        continue;
                    }
                    if hop.contains_key(&target_path) {
                        circular_acc.insert(format!(
                            "{} -> {}",
                            normalized_path.as_ref(),
                            target_path.as_ref()
                        ));
                        continue;
                    }
                    hop.insert(target_path.clone(), candidate_hop);
                    self.visited.insert(target_path.clone());
                    next_layer.push(target_path);
                }
            }

            next_layer.sort();
            next_layer.dedup();
            current_layer = next_layer;
        }

        self.circular_refs = circular_acc.into_iter().collect();
    }

    /// Triple-slash reference edges plus targets from export `source`, imports, and dependency specifiers.
    fn enumerate_discovery_edges(
        &self,
        normalized_path: &SharedString,
        parse_result: &ParseResult,
    ) -> (Vec<(SharedString, SharedString)>, Vec<SharedString>) {
        let mut triple_edges = Vec::new();
        let mut targets = Vec::new();

        for reference in parse_result.references.iter() {
            let resolved_paths = self.cached_resolve(reference.as_ref(), normalized_path.as_ref());
            if !resolved_paths.is_empty() {
                for ref_path in &resolved_paths {
                    let referenced = self.norm_path(Path::new(ref_path.as_ref()));
                    triple_edges.push((normalized_path.clone(), referenced.clone()));
                    targets.push(referenced);
                }
            } else if let Some(ref_path) =
                resolve_triple_slash_ref(reference.as_ref(), normalized_path)
            {
                let referenced = self.norm_path(Path::new(ref_path.as_ref()));
                triple_edges.push((normalized_path.clone(), referenced.clone()));
                targets.push(referenced);
            }
        }

        for export_entry in parse_result.exports.iter() {
            if let Some(source) = &export_entry.source {
                let source_paths = self.cached_resolve(source.as_ref(), normalized_path.as_ref());
                for source_path in &source_paths {
                    targets.push(self.norm_path(Path::new(source_path.as_ref())));
                }
            }
        }

        for import_entry in parse_result.imports.iter() {
            let imported_paths =
                self.cached_resolve(import_entry.source.as_ref(), normalized_path.as_ref());
            for imported_path in &imported_paths {
                targets.push(self.norm_path(Path::new(imported_path.as_ref())));
            }
        }

        for export_entry in parse_result.exports.iter() {
            for dependency in export_entry.dependencies.iter() {
                if let Some(import_specifier) = dependency.import_path.as_ref() {
                    let dep_paths =
                        self.cached_resolve(import_specifier.as_ref(), normalized_path.as_ref());
                    for dep_path in &dep_paths {
                        if dep_path.as_ref() != import_specifier.as_ref() {
                            targets.push(self.norm_path(Path::new(dep_path.as_ref())));
                        }
                    }
                }
            }
        }

        triple_edges.sort_by(|(from_left, to_left), (from_right, to_right)| {
            from_left
                .cmp(from_right)
                .then_with(|| to_left.cmp(to_right))
        });
        targets.sort();
        targets.dedup();
        (triple_edges, targets)
    }

    /// Resolves all public symbols from a file by following its export chain.
    fn resolve_file(
        &mut self,
        file_path: &SharedString,
        depth: usize,
        name_prefix: &str,
    ) -> Arc<Vec<ResolvedSymbol>> {
        let normalized_path = self.norm_path(Path::new(file_path.as_ref()));

        if depth > self.max_hops || self.resolution_path.contains(&normalized_path) {
            return Arc::new(Vec::new());
        }

        if name_prefix.is_empty()
            && let Some(cached) = self.resolution_cache.get(&normalized_path)
        {
            return Arc::clone(cached);
        }

        let mut actual_exports = match self.raw_exports.get(&normalized_path) {
            Some(exports) => exports.clone(),
            None => return Arc::new(Vec::new()),
        };

        self.resolution_path.insert(normalized_path.clone());

        let mut known_export_keys: HashSet<SharedString> =
            HashSet::with_capacity(actual_exports.len());
        known_export_keys.extend(actual_exports.iter().map(|entry| {
            SharedString::from(
                format!(
                    "{}::{}::{}",
                    entry.name.as_ref(),
                    entry.kind.numeric_kind(),
                    crate::dedupe::normalize_signature(entry.signature.as_deref())
                )
                .as_ref(),
            )
        }));

        let triple_slash_refs = self
            .raw_references
            .get(&normalized_path)
            .cloned()
            .unwrap_or_default();

        for reference in &triple_slash_refs {
            let resolved_paths = self.cached_resolve(reference.as_ref(), normalized_path.as_ref());
            let ref_paths: Vec<SharedString> = if !resolved_paths.is_empty() {
                resolved_paths
            } else {
                resolve_triple_slash_ref(reference.as_ref(), &normalized_path)
                    .into_iter()
                    .collect()
            };

            for ref_path in &ref_paths {
                let ref_is_module = self
                    .file_is_external_module
                    .get(ref_path)
                    .copied()
                    .unwrap_or(true);
                let nested_symbols: Vec<ResolvedSymbol> = self
                    .resolve_file(ref_path, depth + 1, "")
                    .iter()
                    .filter(|symbol_node| !ref_is_module || symbol_node.is_global_augmentation)
                    .cloned()
                    .collect();
                for symbol_node in nested_symbols {
                    let export_key = SharedString::from(
                        format!(
                            "{}::{}::{}",
                            symbol_node.name.as_ref(),
                            symbol_node.kind.numeric_kind(),
                            crate::dedupe::normalize_signature(symbol_node.signature.as_deref())
                        )
                        .as_ref(),
                    );
                    if !known_export_keys.contains(&export_key) {
                        known_export_keys.insert(export_key);
                        actual_exports.push(ParsedExport {
                            name: symbol_node.name.clone(),
                            kind: symbol_node.kind,
                            is_type_only: symbol_node.is_type_only,
                            symbol_space: symbol_node.symbol_space,
                            is_explicit_export: true,
                            is_global_augmentation: symbol_node.is_global_augmentation,
                            declared_in_file: Some(ref_path.clone()),
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

        let mut local_index: HashMap<SharedString, Vec<ParsedExport>> =
            HashMap::with_capacity(actual_exports.len().min(512));
        for export_entry in &actual_exports {
            local_index
                .entry(export_entry.name.clone())
                .or_default()
                .push(export_entry.clone());
        }

        let mut local_keys_sorted: Vec<SharedString> = local_index.keys().cloned().collect();
        local_keys_sorted.sort();

        let mut results: Vec<ResolvedSymbol> = Vec::new();

        let resolving_as_script = !self
            .file_is_external_module
            .get(&normalized_path)
            .copied()
            .unwrap_or(true);

        for export_entry in &actual_exports {
            if export_entry.is_global_augmentation
                && export_entry.kind == SymbolKind::Namespace
                && export_entry.name.as_ref() == "global"
            {
                continue;
            }
            // Skip non-exported declarations — captured as internal symbols later
            if !export_entry.is_explicit_export
                && !resolving_as_script
                && !export_entry.is_global_augmentation
            {
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
                    local_keys_sorted.as_slice(),
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
                let defined_in_path = export_entry
                    .declared_in_file
                    .clone()
                    .unwrap_or_else(|| normalized_path.clone());
                results.push(ResolvedSymbol {
                    name: full_name,
                    is_internal,
                    ..ResolvedSymbol::from_export(export_entry, defined_in_path)
                });
            }
        }

        self.resolution_path.remove(&normalized_path);

        let arc = Arc::new(results);
        if name_prefix.is_empty() {
            self.resolution_cache
                .insert(normalized_path, Arc::clone(&arc));
        }

        arc
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

        let source_paths = self.cached_resolve(source.as_ref(), current_file.as_ref());

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
            all_nested_symbols.extend(nested.iter().cloned());
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
                let defined_in = self.norm_path(Path::new(source_paths[0].as_ref()));
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
}

/// Whether `target` is the same export-clause element as `export_entry`.
/// The index stores clones, so identity uses these fields instead of pointer equality.
fn is_same_export_clause_row(target: &ParsedExport, export_entry: &ParsedExport) -> bool {
    target.name == export_entry.name
        && target.kind == export_entry.kind
        && target.source == export_entry.source
        && target.original_name == export_entry.original_name
        && target.is_wildcard == export_entry.is_wildcard
        && target.is_namespace_export == export_entry.is_namespace_export
        && target.signature == export_entry.signature
}

/// Resolves symbols that are locally assigned (e.g., `export { x as y }`
/// or `export default x`).
fn resolve_local_assignment(
    export_entry: &ParsedExport,
    local_index: &HashMap<SharedString, Vec<ParsedExport>>,
    local_keys_sorted: &[SharedString],
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

    // One statement can list the same local binding twice (e.g. `Foo as Bar` and `Foo`). Resolving
    // `Bar` looks up `Foo` and finds both the declaration and any other export rows for `Foo`;
    // forwarding rows stay in play—only the clause currently being resolved is skipped.
    let actual_targets: Vec<&ParsedExport> = targets
        .iter()
        .filter(|target| !is_same_export_clause_row(target, export_entry))
        .collect();

    if actual_targets.is_empty() {
        return Vec::new();
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

        for member_name in local_keys_sorted {
            if member_name.as_ref().starts_with(&member_prefix) {
                matching_members.extend(local_index[member_name].iter());
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

    /// `import x = require("...")` should pull the target `.d.ts` into the crawl like a normal import.
    #[test]
    fn crawl_follows_ts_import_equals_require() {
        let temp_dir = TempDir::new().unwrap();
        write_dts(
            temp_dir.path(),
            "impl.d.ts",
            "export declare function fromImpl(): void;",
        );
        let entry = write_dts(
            temp_dir.path(),
            "entry.d.ts",
            "import bundle = require(\"./impl.js\");\nexport = bundle;",
        );
        let result = crawl(&[entry], None);
        assert!(
            result.visited_files.len() >= 2,
            "expected impl pulled in via import equals, visited {:?}",
            result.visited_files
        );
        assert!(
            result.visited_files.iter().any(|visited_path| {
                visited_path
                    .as_ref()
                    .to_ascii_lowercase()
                    .contains("impl.d.ts")
            }),
            "visited {:?}",
            result.visited_files
        );
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
    fn crawl_respects_max_hops_zero() {
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
            Some(CrawlOptions {
                max_hops: 0,
                ..Default::default()
            }),
        );

        // max_hops = 0: only the entry file is read; re-export target is not visited.
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

    /// Crawl must retain the inner `global` namespace row (not only `global.*` members).
    #[test]
    fn crawl_keeps_global_namespace_inside_ambient_module_file() {
        let temp_dir = TempDir::new().unwrap();
        let entry = write_dts(
            temp_dir.path(),
            "buffer.buffer.d.ts",
            r#"declare module "buffer" {
    global {
        interface BufferCtor { x: number; }
    }
}"#,
        );
        let result = crawl(&[entry], None);
        assert!(
            result.exports.iter().any(|symbol| {
                symbol.name.as_ref() == "global" && symbol.kind == SymbolKind::Namespace
            }),
            "missing nested global module row; got {:?}",
            result
                .exports
                .iter()
                .map(|symbol| (symbol.name.as_ref(), symbol.kind))
                .collect::<Vec<_>>()
        );
    }

    /// Duplicate local names in one export list (`X as Alias` and `X`) yield `Alias` as both the
    /// resolved declaration and an `ExportDeclaration` forwarder.
    #[test]
    fn crawl_duplicate_export_list_binding_yields_export_declaration_alias_row() {
        let temp_dir = TempDir::new().unwrap();
        let entry = write_dts(
            temp_dir.path(),
            "index.d.ts",
            "declare class Agent {}\nexport { Agent as Experimental_Agent, Agent };",
        );

        let result = crawl(&[entry], None);

        let alias_class = result.exports.iter().find(|symbol| {
            symbol.name.as_ref() == "Experimental_Agent" && symbol.kind == SymbolKind::Class
        });
        let alias_forward = result.exports.iter().find(|symbol| {
            symbol.name.as_ref() == "Experimental_Agent"
                && symbol.kind == SymbolKind::ExportDeclaration
        });
        assert!(
            alias_class.is_some() && alias_forward.is_some(),
            "expected Class + ExportDeclaration for Experimental_Agent, got {:?}",
            result
                .exports
                .iter()
                .filter(|export_symbol| export_symbol.name.as_ref() == "Experimental_Agent")
                .map(|export_symbol| { (export_symbol.kind, export_symbol.signature.as_deref(),) })
                .collect::<Vec<_>>()
        );
    }
}
