use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::sync::LazyLock;
use std::time::Instant;

use regex::Regex;

static PROTOCOL_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([a-z]+):(.*)$").unwrap());

use crate::constants::NODE_BUILTINS;
use crate::crawler::{CrawlOptions, crawl};
use crate::dedupe::normalize_signature;
use crate::resolver::{normalize_path, resolve_module_specifier, resolve_types_entry};
use crate::types::{
    PackageEntry, PackageGraph, PackageInfo, SharedString, SharedVec, SymbolKind, SymbolNode,
    Visibility,
};

/// Parent directory of a package-relative path (already forward-slash normalized by `make_relative`).
/// Returns `"."` for root-level files.
fn rel_parent_dir(relative_path: &str) -> SharedString {
    match relative_path.rfind('/') {
        Some(pos) if pos > 0 => SharedString::from(&relative_path[..pos]),
        _ => SharedString::from("."),
    }
}

fn file_path_under_namespace_root(file_path: &str, namespace_root: &str) -> bool {
    if file_path == namespace_root {
        return true;
    }
    if file_path.len() <= namespace_root.len() {
        return false;
    }
    file_path.as_bytes().get(namespace_root.len()) == Some(&b'/')
        && file_path.starts_with(namespace_root)
}

fn triple_slash_reachable(
    start: SharedString,
    edges: &HashMap<SharedString, Vec<SharedString>>,
) -> Vec<SharedString> {
    let mut visited: HashSet<SharedString> = HashSet::new();
    let mut queue: VecDeque<SharedString> = VecDeque::new();
    visited.insert(start.clone());
    queue.push_back(start);
    while let Some(current_file) = queue.pop_front() {
        if let Some(targets) = edges.get(&current_file) {
            for referenced_path in targets {
                if visited.insert(referenced_path.clone()) {
                    queue.push_back(referenced_path.clone());
                }
            }
        }
    }
    let mut out: Vec<_> = visited.into_iter().collect();
    out.sort();
    out
}

pub fn build_package_graph(
    package_info: &PackageInfo,
    crawl_options: Option<CrawlOptions>,
) -> PackageGraph {
    let entry_phase_start = Instant::now();
    let entry = resolve_types_entry(Path::new(package_info.dir.as_ref())).unwrap_or_else(|_| {
        PackageEntry {
            name: package_info.name.clone(),
            dir_path: package_info.dir.clone(),
            types_entries: Vec::new(),
            subpaths: HashMap::new(),
        }
    });
    let entry_resolution_ms = entry_phase_start.elapsed().as_secs_f64() * 1000.0;

    if entry.types_entries.is_empty() {
        return PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: Vec::new(),
            total_symbols: 0,
            total_files: 0,
            crawl_duration_ms: 0.0,
            build_duration_ms: entry_resolution_ms,
        };
    }

    let crawl_phase_start = Instant::now();
    let crawl_result = crawl(&entry.types_entries, crawl_options);
    let crawl_duration_ms = crawl_phase_start.elapsed().as_secs_f64() * 1000.0;

    let graph_assembly_phase_start = Instant::now();

    let all_symbols = crawl_result.exports;
    let all_imports_per_file = crawl_result.imports;
    let triple_slash_edges = crawl_result.triple_slash_reference_targets;
    let visited: HashSet<SharedString> = crawl_result.visited_files.into_iter().collect();

    let mut merged: Vec<(SharedString, SymbolNode)> = Vec::new();
    let mut merge_index: HashMap<SharedString, usize> =
        HashMap::with_capacity(all_symbols.len().min(65536));
    let package_dir_str = package_info.dir.as_ref();
    let normalized_pkg_dir = package_dir_str.replace('\\', "/");

    for resolved in &all_symbols {
        let symbol_file_path = SharedString::from(
            make_relative(
                &resolved.defined_in,
                package_dir_str,
                normalized_pkg_dir.as_str(),
            )
            .as_str(),
        );
        let norm_sig = normalize_signature(resolved.signature.as_deref());
        let merge_key: SharedString = if is_cross_file_mergeable(resolved.kind) {
            resolved.name.clone()
        } else if is_overload_mergeable(resolved.kind) {
            format!(
                "{}::{}::{}",
                resolved.name.as_ref(),
                resolved.kind.numeric_kind(),
                norm_sig
            )
            .into()
        } else {
            format!(
                "{}::{}::{}::{}",
                resolved.name.as_ref(),
                resolved.kind.numeric_kind(),
                symbol_file_path.as_ref(),
                norm_sig
            )
            .into()
        };

        if let Some(&index) = merge_index.get(&merge_key) {
            let existing = &mut merged[index].1;

            if symbol_file_path != existing.file_path {
                if let Some(mut additional) = existing
                    .additional_files
                    .as_ref()
                    .map(|files| files.to_vec())
                {
                    if !additional.contains(&symbol_file_path) {
                        additional.push(symbol_file_path.clone());
                        existing.additional_files = Some(SharedVec::from(additional));
                    }
                } else {
                    existing.additional_files = Some(SharedVec::from([symbol_file_path.clone()]));
                }
            }

            if !resolved.dependencies.is_empty() {
                let set = existing.dep_dedupe_keys.get_or_insert_with(|| {
                    existing
                        .raw_dependencies
                        .iter()
                        .map(|dep| {
                            (
                                dep.name.clone(),
                                dep.import_path.clone().unwrap_or_else(|| SharedString::from("")),
                            )
                        })
                        .collect()
                });
                for raw_dep in resolved.dependencies.iter() {
                    let key = (
                        raw_dep.name.clone(),
                        raw_dep
                            .import_path
                            .clone()
                            .unwrap_or_else(|| SharedString::from("")),
                    );
                    if set.insert(key) {
                        existing.raw_dependencies.push(raw_dep.clone());
                    }
                }
            }

            if resolved.deprecated.is_some() && existing.deprecated.is_none() {
                existing.deprecated = resolved.deprecated.clone();
            }
            if resolved.visibility.is_some() && existing.visibility.is_none() {
                existing.visibility = resolved.visibility.clone();
            }
            if resolved.since.is_some() && existing.since.is_none() {
                existing.since = resolved.since.clone();
            }
            if !resolved.modifiers.is_empty() && existing.modifiers.is_empty() {
                existing.modifiers = resolved.modifiers.clone();
            }
            if resolved.is_global_augmentation {
                existing.is_global_augmentation = true;
            }
        } else {
            let re_export_source = resolved.re_export_chain.first().map(|chain_start| {
                make_relative(chain_start, package_dir_str, normalized_pkg_dir.as_str())
            });

            let re_exported_from = match &re_export_source {
                Some(source) if &*source != &*symbol_file_path => Some(source.clone()),
                _ => None,
            };

            let node = SymbolNode {
                id: "".into(),
                name: resolved.name.clone(),
                kind: resolved.kind,
                kind_name: SharedString::from(resolved.kind.as_str()),
                package: package_info.name.clone(),
                file_path: symbol_file_path,
                additional_files: None,
                signature: resolved.signature.clone(),
                js_doc: resolved.js_doc.clone(),
                is_type_only: resolved.is_type_only,
                symbol_space: resolved.symbol_space,
                dependencies: SharedVec::from(Vec::new()), // Built later
                raw_dependencies: resolved.dependencies.to_vec(),
                re_exported_from: re_exported_from.map(Into::into),
                deprecated: resolved.deprecated.clone(),
                visibility: resolved.visibility.clone(),
                since: resolved.since.clone(),
                is_internal: resolved.is_internal,
                is_global_augmentation: resolved.is_global_augmentation,
                decorators: resolved.decorators.clone(),
                is_inherited: false,
                inherited_from: None,
                heritage: resolved.heritage.clone(),
                modifiers: resolved.modifiers.clone(),
                dep_dedupe_keys: None,
            };

            let index = merged.len();
            merge_index.insert(merge_key, index);
            merged.push((SharedString::from(""), node));
        }
    }

    // Insertion order = first occurrence of each merge key in crawl order (stable `#n` / name_to_id).
    let mut symbols: Vec<SymbolNode> = merged.into_iter().map(|(_unused_key, node)| node).collect();

    let sym_cap = symbols.len().min(65536);
    let mut name_to_id: HashMap<SharedString, SharedString> = HashMap::with_capacity(sym_cap);
    let mut name_to_ids: HashMap<SharedString, Vec<SharedString>> = HashMap::with_capacity(sym_cap);
    let mut file_local_to_ids: HashMap<SharedString, Vec<SharedString>> =
        HashMap::with_capacity(sym_cap);
    let mut name_count: HashMap<SharedString, usize> = HashMap::with_capacity(sym_cap);
    let mut internal_file_name_count: HashMap<SharedString, usize> =
        HashMap::with_capacity(sym_cap);

    for symbol_node in &mut symbols {
        let base_id = format!(
            "{}@{}::{}",
            package_info.name, package_info.version, symbol_node.name
        );

        if symbol_node.is_internal {
            let fk: SharedString = format!("{}::{}", symbol_node.file_path, symbol_node.name).into();
            let c = internal_file_name_count.entry(fk).or_insert(0);
            *c += 1;
            let ic = *c;
            symbol_node.id = if ic == 1 {
                format!(
                    "{}@{}::{}::{}",
                    package_info.name,
                    package_info.version,
                    symbol_node.file_path,
                    symbol_node.name
                )
                .into()
            } else {
                format!(
                    "{}@{}::{}::{}#{}",
                    package_info.name,
                    package_info.version,
                    symbol_node.file_path,
                    symbol_node.name,
                    ic
                )
                .into()
            };
        } else {
            let count = name_count.entry(symbol_node.name.clone()).or_insert(0);
            *count += 1;
            symbol_node.id = if *count == 1 {
                base_id.into()
            } else {
                format!(
                    "{}@{}::{}#{}",
                    package_info.name,
                    package_info.version,
                    symbol_node.name,
                    count
                )
                .into()
            };
        }

        let short_key: SharedString =
            format!("{}::{}", symbol_node.file_path, symbol_node.name).into();
        file_local_to_ids
            .entry(short_key)
            .or_default()
            .push(symbol_node.id.clone());

        name_to_ids
            .entry(symbol_node.name.clone())
            .or_default()
            .push(symbol_node.id.clone());
    }

    // must resolve heritage on the class/interface, not the value. Prefer type declarations, then backfill.
    name_to_id.clear();
    for symbol_node in &symbols {
        if matches!(symbol_node.kind, SymbolKind::Class | SymbolKind::Interface) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols {
        if !name_to_id.contains_key(symbol_node.name.as_ref()) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }

    let mut id_to_file_path: HashMap<SharedString, SharedString> =
        HashMap::with_capacity(symbols.len().min(65536));
    for symbol_node in &symbols {
        id_to_file_path.insert(symbol_node.id.clone(), symbol_node.file_path.clone());
    }

    let protocol_regex = &*PROTOCOL_REGEX;
    let has_ref_edges = !triple_slash_edges.is_empty();

    let mut normalized_abs_cache: HashMap<SharedString, SharedString> = HashMap::new();
    let mut closure_cache: HashMap<SharedString, Vec<SharedString>> = HashMap::new();
    let mut module_specifier_cache: HashMap<(SharedString, SharedString), Vec<SharedString>> =
        HashMap::new();

    for symbol_node in &mut symbols {
        if symbol_node.raw_dependencies.is_empty() {
            continue;
        }

        let mut resolved_ids: HashSet<SharedString> = HashSet::new();

        // Must match crawler import-map keys (canonical paths), not `dir + "/" + rel`.
        let abs_lookup = normalized_abs_cache
            .entry(symbol_node.file_path.clone())
            .or_insert_with(|| {
                normalize_path(
                    &Path::new(package_dir_str).join(symbol_node.file_path.as_ref()),
                )
            })
            .clone();
        let abs_lookup_str: &str = abs_lookup.as_ref();

        for raw_dep in symbol_node.raw_dependencies.iter() {
            let namespace_qual = raw_dep
                .import_path
                .is_none()
                .then(|| split_import_namespace_member(raw_dep.name.as_ref()))
                .flatten();

            let mut target_ids: Vec<SharedString> = Vec::new();
            let mut namespace_fallback_roots: Vec<SharedString> = Vec::new();

            if let Some(import_path) = &raw_dep.import_path {
                let cache_key = (symbol_node.file_path.clone(), import_path.clone());
                let abs_paths = module_specifier_cache
                    .entry(cache_key)
                    .or_insert_with_key(|k| resolve_module_specifier(&k.1, abs_lookup_str))
                    .clone();
                if !abs_paths.is_empty() {
                    let rel_path =
                        make_relative(&abs_paths[0], package_dir_str, normalized_pkg_dir.as_str());
                    let key: SharedString =
                        format!("{}::{}", rel_path, raw_dep.name.as_ref()).into();
                    if let Some(ids) = file_local_to_ids.get(&key) {
                        target_ids.extend(ids.iter().cloned());
                    }
                }
            } else {
                // `ns.Member`: set true when `import * as ns` resolved to at least one file.
                // Gates package-wide `name_to_ids.get(Member)` so a missing package cannot
                // collide with unrelated homonyms (e.g. local shim types).
                let mut namespace_target_files_resolved = false;

                let key: SharedString = format!(
                    "{}::{}",
                    symbol_node.file_path.as_ref(),
                    raw_dep.name.as_ref()
                )
                .into();
                if let Some(ids) = file_local_to_ids.get(&key) {
                    target_ids.extend(ids.iter().cloned());
                }

                if target_ids.is_empty() {
                    if let Some(file_imports) = all_imports_per_file.get(abs_lookup.as_ref()) {
                        if let Some(matching_import) = file_imports
                            .iter()
                            .find(|imported| imported.name == raw_dep.name)
                        {
                            let source_cache_key = (symbol_node.file_path.clone(), matching_import.source.clone());
                            let abs_source_paths = module_specifier_cache
                                .entry(source_cache_key)
                                .or_insert_with_key(|k| resolve_module_specifier(&k.1, abs_lookup_str))
                                .clone();
                            if !abs_source_paths.is_empty() {
                                let rel_source_path = make_relative(
                                    &abs_source_paths[0],
                                    package_dir_str,
                                    normalized_pkg_dir.as_str(),
                                );
                                let original_name = matching_import
                                    .original_name
                                    .as_deref()
                                    .unwrap_or(&matching_import.name);
                                let import_key: SharedString =
                                    format!("{}::{}", rel_source_path, original_name).into();
                                if let Some(ids) = file_local_to_ids.get(&import_key) {
                                    target_ids.extend(ids.iter().cloned());
                                }
                            }
                        }
                    }
                }

                if target_ids.is_empty() {
                    if let (Some(file_imports), Some((qualifier, member_path))) =
                        (all_imports_per_file.get(abs_lookup.as_ref()), namespace_qual)
                    {
                        if let Some(ns_import) = file_imports
                            .iter()
                            .find(|imported| imported.name.as_ref() == qualifier)
                        {
                            let ns_cache_key = (symbol_node.file_path.clone(), ns_import.source.clone());
                            let abs_source_paths = module_specifier_cache
                                .entry(ns_cache_key)
                                .or_insert_with_key(|k| resolve_module_specifier(&k.1, abs_lookup_str))
                                .clone();
                            namespace_target_files_resolved = !abs_source_paths.is_empty();
                            namespace_fallback_roots.clear();
                            for abs_sp in &abs_source_paths {
                                let rel_source_path = make_relative(
                                    abs_sp.as_ref(),
                                    package_dir_str,
                                    normalized_pkg_dir.as_str(),
                                );
                                namespace_fallback_roots
                                    .push(rel_parent_dir(rel_source_path.as_ref()));
                            }
                            for abs_sp in &abs_source_paths {
                                let rel_source_path = make_relative(
                                    abs_sp.as_ref(),
                                    package_dir_str,
                                    normalized_pkg_dir.as_str(),
                                );
                                let import_key: SharedString =
                                    format!("{}::{}", rel_source_path, member_path).into();
                                if let Some(ids) = file_local_to_ids.get(&import_key) {
                                    target_ids.extend(ids.iter().cloned());
                                }
                            }
                        }
                    }
                }

                if target_ids.is_empty() && has_ref_edges {
                    let closure = closure_cache
                        .entry(symbol_node.file_path.clone())
                        .or_insert_with(|| {
                            let symbol_abs = abs_lookup.clone();
                            triple_slash_reachable(symbol_abs, &triple_slash_edges)
                        })
                        .clone();
                    let mut from_closure: HashSet<SharedString> = HashSet::new();
                    for reachable_abs in closure {
                        let rel = make_relative(
                            reachable_abs.as_ref(),
                            package_dir_str,
                            normalized_pkg_dir.as_str(),
                        );
                        if rel == symbol_node.file_path.as_ref() {
                            continue;
                        }
                        let closure_lookup_key: SharedString =
                            format!("{}::{}", rel, raw_dep.name.as_ref()).into();
                        if let Some(ids) = file_local_to_ids.get(&closure_lookup_key) {
                            for symbol_id in ids {
                                from_closure.insert(symbol_id.clone());
                            }
                        }
                        if let Some((_qualifier, member_path)) = namespace_qual {
                            let member_key: SharedString =
                                format!("{}::{}", rel, member_path).into();
                            if let Some(ids) = file_local_to_ids.get(&member_key) {
                                for symbol_id in ids {
                                    from_closure.insert(symbol_id.clone());
                                }
                            }
                        }
                    }
                    target_ids.extend(from_closure.into_iter());
                }

                if target_ids.is_empty() {
                    if let Some(ids) = name_to_ids.get(&raw_dep.name) {
                        target_ids.extend(ids.iter().cloned());
                    }
                }
                // Qualified `ns.Member`: package index is keyed by `Member`, not `ns.Member`.
                // Barrel files (`index.d.ts`) also won't have `Member` rows when the symbol
                // lives in `./output.d.ts` etc., so file-local lookup may miss despite a crawl.
                if target_ids.is_empty() && namespace_target_files_resolved {
                    if let Some((_, member_path)) = namespace_qual {
                        let member_key: SharedString = SharedString::from(member_path);
                        if let Some(ids) = name_to_ids.get(&member_key) {
                            let skip_namespace_root_filter = namespace_fallback_roots.is_empty()
                                || namespace_fallback_roots.iter().any(|root_path| {
                                    root_path.as_ref() == "." || root_path.as_ref().is_empty()
                                });
                            if skip_namespace_root_filter {
                                target_ids.extend(ids.iter().cloned());
                            } else {
                                let distinct_namespace_roots: HashSet<&str> = namespace_fallback_roots
                                    .iter()
                                    .map(|root_path| root_path.as_ref())
                                    .collect();
                                for symbol_id in ids {
                                    if let Some(stored_path) = id_to_file_path.get(symbol_id) {
                                        let defining_path = stored_path.as_ref();
                                        if distinct_namespace_roots.iter().any(|&namespace_root| {
                                            file_path_under_namespace_root(defining_path, namespace_root)
                                        }) {
                                            target_ids.push(symbol_id.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            target_ids.retain(|symbol_id| symbol_id.as_ref() != symbol_node.id.as_ref());

            if !target_ids.is_empty() {
                for symbol_id in target_ids {
                    resolved_ids.insert(symbol_id);
                }
            } else {
                let import_path = raw_dep.import_path.as_deref();

                if let Some(path) = import_path {
                    if let Some(ext_id) = resolve_external_dep_id(path, raw_dep.name.as_ref(), protocol_regex)
                    {
                        resolved_ids.insert(ext_id.into());
                    } else if let Some(stub) = try_external_module_stub_id(
                        path,
                        raw_dep.name.as_ref(),
                        protocol_regex,
                    ) {
                        resolved_ids.insert(stub.into());
                    }
                } else if let Some(file_imports) = all_imports_per_file.get(abs_lookup.as_ref()) {
                    if let Some(matching_import) = file_imports
                        .iter()
                        .find(|imported| imported.name == raw_dep.name)
                    {
                        let original_name = matching_import
                            .original_name
                            .as_deref()
                            .unwrap_or(matching_import.name.as_ref());
                        if let Some(ext_id) = resolve_external_dep_id(
                            matching_import.source.as_ref(),
                            original_name,
                            protocol_regex,
                        ) {
                            resolved_ids.insert(ext_id.into());
                        } else if let Some(stub) = try_external_module_stub_id(
                            matching_import.source.as_ref(),
                            original_name,
                            protocol_regex,
                        ) {
                            resolved_ids.insert(stub.into());
                        }
                    }
                    if let Some((qualifier, member_path)) = namespace_qual {
                        if let Some(ns_import) = file_imports
                            .iter()
                            .find(|imported| imported.name.as_ref() == qualifier)
                        {
                            if let Some(stub) = try_external_module_stub_id(
                                ns_import.source.as_ref(),
                                member_path,
                                protocol_regex,
                            ) {
                                resolved_ids.insert(stub.into());
                            }
                        }
                    }
                }
            }
        }

        let mut resolved_ids_vec: Vec<SharedString> = resolved_ids.into_iter().collect();
        resolved_ids_vec.sort();

        symbol_node.dependencies = SharedVec::from(resolved_ids_vec);
        symbol_node.raw_dependencies.clear();
    }

    flatten_inherited_members(
        &mut symbols,
        &name_to_id,
        &package_info.name,
        &package_info.version,
    );

    let graph_assembly_ms = graph_assembly_phase_start.elapsed().as_secs_f64() * 1000.0;
    let build_duration_ms = entry_resolution_ms + graph_assembly_ms;

    let total_symbols = symbols.len();
    let total_files = visited.len();

    PackageGraph {
        package: package_info.name.clone(),
        version: package_info.version.clone(),
        symbols,
        total_symbols,
        total_files,
        crawl_duration_ms,
        build_duration_ms,
    }
}

fn is_cross_file_mergeable(kind: SymbolKind) -> bool {
    matches!(
        kind,
        SymbolKind::Namespace | SymbolKind::Interface | SymbolKind::Enum
    )
}

// Member/overload-shaped kinds: merge key omits file path so the same logical overload can coalesce across files.
fn is_overload_mergeable(kind: SymbolKind) -> bool {
    matches!(
        kind,
        SymbolKind::MethodSignature
            | SymbolKind::PropertySignature
            | SymbolKind::GetAccessor
            | SymbolKind::SetAccessor
    )
}

fn resolve_external_dep_id(source: &str, name: &str, protocol_regex: &Regex) -> Option<String> {
    if !protocol_regex.is_match(source) && !NODE_BUILTINS.contains(source) {
        return None;
    }

    let is_builtin = NODE_BUILTINS.contains(source);
    let (protocol, resolved_source) = if is_builtin {
        ("node".to_string(), source.to_string())
    } else if let Some(caps) = protocol_regex.captures(source) {
        let proto = caps
            .get(1)
            .map_or("unknown", |match_val| match_val.as_str())
            .to_string();
        let src = caps
            .get(2)
            .map(|match_val| {
                let raw = match_val.as_str();
                if raw.starts_with("//") {
                    &raw[2..]
                } else {
                    raw
                }
            })
            .unwrap_or("unknown")
            .to_string();
        (proto, src)
    } else {
        ("unknown".to_string(), "unknown".to_string())
    };

    Some(format!("{}::{}::{}", protocol, resolved_source, name))
}

/// `foo.bar` with `import * as foo` → `("foo", "bar")`; nested `foo.bar.baz` → `("foo", "bar.baz")`.
fn split_import_namespace_member(qualified_name: &str) -> Option<(&str, &str)> {
    let dot = qualified_name.find('.')?;
    if dot == 0 || dot + 1 >= qualified_name.len() {
        return None;
    }
    Some((&qualified_name[..dot], &qualified_name[dot + 1..]))
}

/// Stable edge when the target module is not part of this package graph (no extra crawl).
fn try_external_module_stub_id(
    specifier: &str,
    member: &str,
    protocol_regex: &Regex,
) -> Option<String> {
    if let Some(id) = resolve_external_dep_id(specifier, member, protocol_regex) {
        return Some(id);
    }
    if specifier.starts_with('.') || specifier.starts_with('/') {
        return None;
    }
    let bytes = specifier.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return None;
    }
    Some(format!("npm::{specifier}::{member}"))
}

fn parent_name_for_dotted_member(name: &str) -> Option<String> {
    if !name.contains('.') {
        return None;
    }
    if name.contains(".prototype.") {
        let segments: Vec<&str> = name.split('.').collect();
        if segments.iter().any(|segment| *segment == "prototype") {
            let prototype_index = segments
                .iter()
                .position(|segment| *segment == "prototype")?;
            let parent_prefix = segments[..prototype_index].join(".");
            return (!parent_prefix.is_empty()).then_some(parent_prefix);
        }
    }
    name.rfind('.')
        .map(|last_dot_index| name[..last_dot_index].to_string())
}

/// Resolves `extends` / `implements` text to a declared parent name for member lookup and `name_to_id`.
/// Full clause text (e.g. `Omit<Foo, 'k'>` → `Omit`) matches how references attach to named declarations.
fn heritage_lookup_key(heritage: &str) -> String {
    let trimmed = heritage.trim();
    match trimmed.find('<') {
        Some(angle_index) => trimmed[..angle_index].trim().to_string(),
        None => trimmed.to_string(),
    }
}

fn flatten_inherited_members(
    symbols: &mut Vec<SymbolNode>,
    name_to_id: &HashMap<SharedString, SharedString>,
    pkg_name: &SharedString,
    pkg_version: &SharedString,
) {
    let id_to_node: HashMap<SharedString, &SymbolNode> =
        symbols.iter().map(|node| (node.id.clone(), node)).collect();

    let mut members_by_parent_name: HashMap<SharedString, Vec<&SymbolNode>> =
        HashMap::with_capacity(symbols.len().min(8192));

    for symbol_node in symbols.iter() {
        if let Some(parent_name) = parent_name_for_dotted_member(symbol_node.name.as_ref()) {
            members_by_parent_name
                .entry(SharedString::from(parent_name.as_str()))
                .or_default()
                .push(symbol_node);
        }
    }

    let mut synthetic: Vec<SymbolNode> = Vec::new();

    let mut merged_heritage: HashMap<SharedString, Vec<SharedString>> = HashMap::new();
    for node in symbols.iter().filter(|node| {
        matches!(node.kind, SymbolKind::Class | SymbolKind::Interface)
            && !node.heritage.is_empty()
    }) {
        let entry = merged_heritage
            .entry(node.name.clone())
            .or_default();
        for parent in node.heritage.iter() {
            if !entry.contains(parent) {
                entry.push(parent.clone());
            }
        }
    }
    let heritage_work: Vec<(SharedString, Vec<SharedString>)> =
        merged_heritage.into_iter().collect();

    for (node_name, heritage) in &heritage_work {
        let child_members = members_by_parent_name
            .get(node_name.as_ref())
            .map(|members| members.as_slice())
            .unwrap_or(&[]);

        let mut child_member_names: HashSet<String> = child_members
            .iter()
            .map(|member| {
                member
                    .name
                    .rsplit('.')
                    .next()
                    .unwrap_or(&member.name)
                    .to_string()
            })
            .collect();

        let mut visited_parents: HashSet<String> = HashSet::new();
        let mut parents_to_visit: VecDeque<String> = heritage
            .iter()
            .map(|path| heritage_lookup_key(path.as_ref()))
            .collect();

        while let Some(parent_key) = parents_to_visit.pop_front() {
            if !visited_parents.insert(parent_key.clone()) {
                continue;
            }

            let parent_id = match name_to_id.get(parent_key.as_ref() as &str) {
                Some(id) => id,
                None => continue,
            };

            if let Some(parent_node) = id_to_node.get(parent_id) {
                for grandparent in parent_node.heritage.iter() {
                    parents_to_visit.push_back(heritage_lookup_key(grandparent.as_ref()));
                }
            }

            let parent_members = members_by_parent_name
                .get(parent_key.as_str())
                .map(|members| members.as_slice())
                .unwrap_or(&[]);

            for parent_member in parent_members {
                let short_name = parent_member
                    .name
                    .rsplit('.')
                    .next()
                    .unwrap_or(&parent_member.name);

                if child_member_names.contains(short_name) {
                    continue;
                }
                child_member_names.insert(short_name.to_string());

                if matches!(parent_member.visibility, Some(Visibility::Internal)) {
                    continue;
                }

                let is_prototype = parent_member.name.contains(".prototype.");
                let new_member_name = if is_prototype {
                    format!("{}.prototype.{}", node_name, short_name)
                } else {
                    format!("{}.{}", node_name, short_name)
                };

                let synth_id = format!("{}@{}::{}", pkg_name, pkg_version, new_member_name);

                let mut synth_node = (*parent_member).clone();
                synth_node.id = synth_id.into();
                synth_node.name = new_member_name.into();
                synth_node.package = pkg_name.clone();
                synth_node.is_inherited = true;
                synth_node.inherited_from = Some(parent_member.id.clone());
                synth_node.additional_files = None;

                synthetic.push(synth_node);
            }
        }
    }

    symbols.extend(synthetic);
}

/// `normalized_package_dir` must equal `package_dir.replace('\\', "/")` so prefix checks match `abs_path` normalization.
fn make_relative(abs_path: &str, package_dir: &str, normalized_package_dir: &str) -> String {
    let normalized = abs_path.replace('\\', "/");

    if normalized.starts_with(normalized_package_dir) {
        let rest = &normalized[normalized_package_dir.len()..];
        if rest.starts_with('/') {
            return rest[1..].to_string();
        }
        return rest.to_string();
    }

    let rel = pathdiff::diff_paths(abs_path, package_dir)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| normalized);
    rel
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resolver::normalize_path;

    #[test]
    fn make_relative_strips_prefix() {
        assert_eq!(
            make_relative("/pkg/src/index.d.ts", "/pkg", "/pkg"),
            "src/index.d.ts"
        );
    }

    #[test]
    fn make_relative_handles_windows_paths() {
        assert_eq!(
            make_relative("C:\\pkg\\src\\index.d.ts", "C:\\pkg", "C:/pkg"),
            "src/index.d.ts"
        );
    }

    #[test]
    fn is_cross_file_mergeable_correct() {
        assert!(is_cross_file_mergeable(SymbolKind::Interface));
        assert!(is_cross_file_mergeable(SymbolKind::Namespace));
        assert!(is_cross_file_mergeable(SymbolKind::Enum));
        assert!(!is_cross_file_mergeable(SymbolKind::Function));
        assert!(!is_cross_file_mergeable(SymbolKind::Class));
    }

    #[test]
    fn is_overload_mergeable_includes_member_signature_kinds() {
        assert!(is_overload_mergeable(SymbolKind::MethodSignature));
        assert!(is_overload_mergeable(SymbolKind::PropertySignature));
        assert!(is_overload_mergeable(SymbolKind::GetAccessor));
        assert!(is_overload_mergeable(SymbolKind::SetAccessor));
        assert!(!is_overload_mergeable(SymbolKind::Function));
        assert!(!is_overload_mergeable(SymbolKind::Variable));
        assert!(!is_overload_mergeable(SymbolKind::Class));
    }

    #[test]
    fn parent_name_for_dotted_member_nested() {
        assert_eq!(
            parent_name_for_dotted_member("A.B.c").as_deref(),
            Some("A.B")
        );
    }

    #[test]
    fn parent_name_for_dotted_member_prototype() {
        assert_eq!(
            parent_name_for_dotted_member("A.prototype.b").as_deref(),
            Some("A")
        );
    }

    #[test]
    fn parent_name_for_dotted_member_nested_prototype() {
        assert_eq!(
            parent_name_for_dotted_member("A.B.prototype.c").as_deref(),
            Some("A.B")
        );
    }

    #[test]
    fn parent_name_for_dotted_member_no_dot() {
        assert_eq!(parent_name_for_dotted_member("Foo"), None);
    }

    #[test]
    fn build_empty_package_graph() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let pkg_dir = temp_dir.path().to_path_buf();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "empty-pkg", "version": "1.0.0"}"#,
        )
        .unwrap();

        let info = PackageInfo {
            name: "empty-pkg".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(&pkg_dir),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "empty-pkg".into());
        assert_eq!(graph.version, "1.0.0".into());
        assert_eq!(graph.total_symbols, 0);
        assert_eq!(graph.total_files, 0);
    }

    #[test]
    fn build_graph_with_simple_exports() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let pkg_dir = temp_dir.path().to_path_buf();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "test-pkg", "version": "2.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();

        std::fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare function greet(name: string): string;\nexport interface Config { key: string; }",
        )
        .unwrap();

        let info = PackageInfo {
            name: "test-pkg".to_string().into(),
            version: "2.0.0".to_string().into(),
            dir: normalize_path(&pkg_dir),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "test-pkg".into());
        assert_eq!(graph.version, "2.0.0".into());
        assert!(graph.total_symbols >= 2);

        let greet = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name == "greet".into());
        assert!(greet.is_some());
        let greet = greet.unwrap();
        assert_eq!(greet.kind, SymbolKind::Function);
        assert!(greet.id.starts_with("test-pkg@2.0.0::"));

        let config = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name == "Config".into());
        assert!(config.is_some());
        assert_eq!(config.unwrap().kind, SymbolKind::Interface);
    }

    #[test]
    fn merged_declarations_produce_unique_synthetic_ids() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let pkg_dir = temp_dir.path().to_path_buf();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "merge-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();

        std::fs::write(
            pkg_dir.join("index.d.ts"),
            concat!(
                "export declare class Base {\n",
                "  shared(): void;\n",
                "  baseOnly(): void;\n",
                "}\n",
                "export declare interface Trait {\n",
                "  shared(): void;\n",
                "  traitOnly(): void;\n",
                "}\n",
                "export declare interface Composite extends Trait {\n",
                "  compositeFunc(): void;\n",
                "}\n",
                "export declare class Composite extends Base {\n",
                "  ownProp: number;\n",
                "}\n",
            ),
        )
        .unwrap();

        let info = PackageInfo {
            name: "merge-pkg".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(&pkg_dir),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        let all_ids: Vec<&str> = graph.symbols.iter().map(|symbol| symbol.id.as_ref()).collect();
        let unique_ids: std::collections::HashSet<&str> = all_ids.iter().copied().collect();
        assert_eq!(
            all_ids.len(),
            unique_ids.len(),
            "Duplicate symbol IDs found: {:?}",
            all_ids
                .iter()
                .filter(|id| all_ids.iter().filter(|other| other == id).count() > 1)
                .collect::<std::collections::HashSet<_>>()
        );

        let shared_synthetics: Vec<_> = graph
            .symbols
            .iter()
            .filter(|symbol| symbol.name.as_ref() == "Composite.shared")
            .collect();
        assert_eq!(
            shared_synthetics.len(),
            1,
            "Expected exactly one Composite.shared synthetic, found {}",
            shared_synthetics.len()
        );
        assert!(shared_synthetics[0].is_inherited);
    }
}
