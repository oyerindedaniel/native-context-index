use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::sync::{Arc, LazyLock};
use std::time::Instant;

use dashmap::DashMap;
use rayon::prelude::*;
use regex::Regex;

static PROTOCOL_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([a-z]+):(.*)$").unwrap());

use crate::constants::NODE_BUILTINS;
use crate::crawler::{CrawlOptions, crawl};
use crate::dedupe::normalize_signature;
use crate::profile;
use crate::resolver::{
    make_relative_to_package, normalize_path, npm_package_root, resolve_module_specifier,
    resolve_types_entry, specifier_is_dependency_stub,
};
use crate::types::{
    MergeProvenance, MergeProvenanceKind, PackageEntry, PackageGraph, PackageInfo, ParsedImport,
    ResolvedSymbol, SharedString, SharedVec, SymbolKind, SymbolNode, SymbolSpace, Visibility,
};

/// Parent directory of a package-relative path (already forward-slash normalized by [`make_relative_to_package`]).
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

fn graph_profile_label(package: &SharedString, phase: &str) -> String {
    format!("[{}] {}", package.as_ref(), phase)
}

fn uf_find(parent: &mut [usize], mut index: usize) -> usize {
    while parent[index] != index {
        parent[index] = parent[parent[index]];
        index = parent[index];
    }
    index
}

fn uf_union(parent: &mut [usize], index_a: usize, index_b: usize) {
    let root_a = uf_find(parent, index_a);
    let root_b = uf_find(parent, index_b);
    if root_a != root_b {
        parent[root_b] = root_a;
    }
}

/// Per **package-relative** file path: module scope is `m:<rel>` or `mcc:<rep>` (triple-slash-connected modules),
/// scripts use `s:<rep>` from their triple-slash connected component.
fn compute_merge_scope_ids(
    visited_files: &[SharedString],
    triple_slash: &HashMap<SharedString, Vec<SharedString>>,
    file_is_external_module: &HashMap<SharedString, bool>,
    abs_to_rel: &HashMap<SharedString, SharedString>,
) -> HashMap<SharedString, SharedString> {
    let mut script_abs: Vec<SharedString> = Vec::new();
    let mut module_abs: Vec<SharedString> = Vec::new();
    let mut script_index: HashMap<SharedString, usize> = HashMap::new();
    let mut module_index: HashMap<SharedString, usize> = HashMap::new();
    for abs in visited_files {
        let is_external_module = file_is_external_module.get(abs).copied().unwrap_or(true);
        if is_external_module {
            let module_idx = module_abs.len();
            module_index.insert(abs.clone(), module_idx);
            module_abs.push(abs.clone());
        } else {
            let script_idx = script_abs.len();
            script_index.insert(abs.clone(), script_idx);
            script_abs.push(abs.clone());
        }
    }

    let script_count = script_abs.len();
    let module_count = module_abs.len();
    script_index.reserve(script_count.saturating_sub(script_index.len()));
    module_index.reserve(module_count.saturating_sub(module_index.len()));

    let mut parent: Vec<usize> = if script_count > 0 {
        (0..script_count).collect()
    } else {
        Vec::new()
    };
    let mut module_parent: Vec<usize> = if module_count > 0 {
        (0..module_count).collect()
    } else {
        Vec::new()
    };
    for (from_abs, targets) in triple_slash {
        let from_script_idx = script_index.get(from_abs).copied();
        let from_module_idx = module_index.get(from_abs).copied();
        for to_abs in targets {
            if let Some(from_idx) = from_script_idx
                && let Some(&to_idx) = script_index.get(to_abs)
            {
                uf_union(&mut parent, from_idx, to_idx);
            }
            if let Some(from_idx) = from_module_idx
                && let Some(&to_idx) = module_index.get(to_abs)
            {
                uf_union(&mut module_parent, from_idx, to_idx);
            }
        }
    }

    let mut root_min_rel: HashMap<usize, SharedString> = HashMap::new();
    let mut module_root_min_rel: HashMap<usize, SharedString> = HashMap::new();
    let mut module_root_size: HashMap<usize, usize> = HashMap::new();
    if script_count > 0 {
        for (script_idx, script_file) in script_abs.iter().enumerate().take(script_count) {
            let root = uf_find(&mut parent, script_idx);
            let rel = abs_to_rel
                .get(script_file)
                .cloned()
                .unwrap_or_else(|| SharedString::from("."));
            root_min_rel
                .entry(root)
                .and_modify(|cur| {
                    if rel.as_ref() < cur.as_ref() {
                        *cur = rel.clone();
                    }
                })
                .or_insert(rel);
        }
    }
    if module_count > 0 {
        for (module_idx, module_file) in module_abs.iter().enumerate().take(module_count) {
            let root = uf_find(&mut module_parent, module_idx);
            let rel = abs_to_rel
                .get(module_file)
                .cloned()
                .unwrap_or_else(|| SharedString::from("."));
            module_root_min_rel
                .entry(root)
                .and_modify(|cur| {
                    if rel.as_ref() < cur.as_ref() {
                        *cur = rel.clone();
                    }
                })
                .or_insert(rel);
            *module_root_size.entry(root).or_insert(0) += 1;
        }
    }

    let mut merge_scope_by_rel: HashMap<SharedString, SharedString> =
        HashMap::with_capacity(visited_files.len());
    for abs in visited_files {
        let rel = abs_to_rel
            .get(abs)
            .cloned()
            .unwrap_or_else(|| SharedString::from("."));
        let scope_id = if let Some(&script_idx) = script_index.get(abs) {
            let root = uf_find(&mut parent, script_idx);
            let rep = root_min_rel
                .get(&root)
                .cloned()
                .unwrap_or_else(|| rel.clone());
            SharedString::from(format!("s:{}", rep.as_ref()))
        } else if let Some(&module_idx) = module_index.get(abs) {
            let root = uf_find(&mut module_parent, module_idx);
            let component_size = module_root_size.get(&root).copied().unwrap_or(1);
            if component_size > 1 {
                let representative_rel = module_root_min_rel
                    .get(&root)
                    .cloned()
                    .unwrap_or_else(|| rel.clone());
                SharedString::from(format!("mcc:{}", representative_rel.as_ref()))
            } else {
                SharedString::from(format!("m:{}", rel.as_ref()))
            }
        } else {
            SharedString::from(format!("m:{}", rel.as_ref()))
        };
        merge_scope_by_rel.insert(rel, scope_id);
    }
    merge_scope_by_rel
}

#[inline]
fn is_interface_or_type_alias_merge_scoped(kind: SymbolKind) -> bool {
    matches!(kind, SymbolKind::Interface | SymbolKind::TypeAlias)
}

/// Namespace and enum use the same merge-scope key as interface/type (`merge_scope_by_rel` + name + kind),
/// with identical `normalize_signature` fold across external modules (see `graph-merge.md`).
#[inline]
fn is_namespace_or_enum_cross_file_mergeable(kind: SymbolKind) -> bool {
    matches!(kind, SymbolKind::Namespace | SymbolKind::Enum)
}

/// Member/overload-shaped kinds: merge key omits file path so the same logical overload can coalesce across files.
#[inline]
fn is_member_overload_mergeable(kind: SymbolKind) -> bool {
    matches!(
        kind,
        SymbolKind::MethodSignature
            | SymbolKind::PropertySignature
            | SymbolKind::GetAccessor
            | SymbolKind::SetAccessor
    )
}

#[derive(Clone, Copy)]
enum ContributionMergePath {
    MergeScope,
    IdenticalFold,
}

fn upsert_merge_provenance(
    existing: &mut SymbolNode,
    contribution_path: ContributionMergePath,
    resolved: &ResolvedSymbol,
) {
    use MergeProvenanceKind::{IdenticalFold, MergeScope, OverloadKey};
    let path_kind = match contribution_path {
        ContributionMergePath::MergeScope => MergeScope,
        ContributionMergePath::IdenticalFold => IdenticalFold,
    };
    let provenance = existing
        .merge_provenance
        .get_or_insert_with(|| MergeProvenance {
            kinds: Vec::with_capacity(3),
        });
    if !provenance.kinds.contains(&path_kind) {
        provenance.kinds.push(path_kind);
    }
    if is_member_overload_mergeable(resolved.kind) && !provenance.kinds.contains(&OverloadKey) {
        provenance.kinds.push(OverloadKey);
    }
    provenance.kinds.sort();
}

fn fuse_merged_signatures(existing: &mut Option<SharedString>, incoming: Option<&SharedString>) {
    match (existing.as_ref(), incoming) {
        (_, None) => {}
        (None, Some(incoming_sig)) => *existing = Some(incoming_sig.clone()),
        (Some(existing_sig), Some(incoming_sig)) if existing_sig == incoming_sig => {}
        (Some(_existing_sig), Some(incoming_sig)) if incoming_sig.as_ref().is_empty() => {}
        (Some(existing_sig), Some(incoming_sig)) if existing_sig.as_ref().is_empty() => {
            *existing = Some(incoming_sig.clone());
        }
        (Some(existing_sig), Some(incoming_sig)) => {
            let mut fused = String::with_capacity(existing_sig.len() + incoming_sig.len() + 1);
            fused.push_str(existing_sig.as_ref());
            fused.push('\n');
            fused.push_str(incoming_sig.as_ref());
            *existing = Some(SharedString::from(fused));
        }
    }
}

fn entry_visibility_contributions(
    resolved: &ResolvedSymbol,
    symbol_file_path: &SharedString,
    entry_files: &HashSet<SharedString>,
    abs_to_rel: &HashMap<SharedString, SharedString>,
    package_dir_str: &str,
    normalized_pkg_dir: &str,
) -> Vec<SharedString> {
    let mut visibility: Vec<SharedString> = Vec::new();
    if entry_files.contains(symbol_file_path) {
        visibility.push(symbol_file_path.clone());
    }
    if let Some(entry_abs_path) = resolved.resolved_from_package_entry.as_ref() {
        let rel = abs_to_rel.get(entry_abs_path).cloned().unwrap_or_else(|| {
            SharedString::from(
                make_relative_to_package(entry_abs_path, package_dir_str, normalized_pkg_dir)
                    .as_str(),
            )
        });
        if entry_files.contains(&rel) && !visibility.iter().any(|current| current == &rel) {
            visibility.push(rel);
        }
    }
    visibility
}

// Merge bookkeeping: per-row signature sets, additional-file dedupe, and contribution path.
#[allow(clippy::too_many_arguments)]
fn merge_resolved_into_node(
    existing: &mut SymbolNode,
    resolved: &ResolvedSymbol,
    symbol_file_path: &SharedString,
    entry_visibility_paths: &[SharedString],
    merged_index: usize,
    additional_files_seen: &mut HashMap<usize, HashSet<SharedString>>,
    signature_norm_seen: &mut [HashSet<String>],
    contribution_path: ContributionMergePath,
) {
    upsert_merge_provenance(existing, contribution_path, resolved);

    if symbol_file_path != &existing.file_path {
        let seen = additional_files_seen
            .entry(merged_index)
            .or_insert_with(|| {
                let mut known_paths = HashSet::new();
                known_paths.insert(existing.file_path.clone());
                if let Some(files) = &existing.additional_files {
                    for path in files.iter() {
                        known_paths.insert(path.clone());
                    }
                }
                known_paths
            });
        if seen.insert(symbol_file_path.clone()) {
            match &mut existing.additional_files {
                Some(files) => {
                    let mut paths_with_new: Vec<SharedString> = files.iter().cloned().collect();
                    paths_with_new.push(symbol_file_path.clone());
                    existing.additional_files = Some(SharedVec::from(paths_with_new));
                }
                None => {
                    existing.additional_files = Some(SharedVec::from([symbol_file_path.clone()]));
                }
            }
        }
    }

    let normalized_incoming_signature = normalize_signature(resolved.signature.as_deref());
    let should_skip_redundant_signature_fusion = if normalized_incoming_signature.is_empty() {
        false
    } else {
        let normalized_signatures_for_row = &mut signature_norm_seen[merged_index];
        if normalized_signatures_for_row.contains(&normalized_incoming_signature) {
            true
        } else {
            normalized_signatures_for_row.insert(normalized_incoming_signature);
            false
        }
    };
    if !should_skip_redundant_signature_fusion {
        fuse_merged_signatures(&mut existing.signature, resolved.signature.as_ref());
    }

    if !entry_visibility_paths.is_empty() {
        match &mut existing.entry_visibility {
            Some(paths) => {
                let mut merged_paths: Vec<SharedString> = paths.iter().cloned().collect();
                let mut changed = false;
                for vis_path in entry_visibility_paths {
                    if !merged_paths
                        .iter()
                        .any(|existing_path| existing_path == vis_path)
                    {
                        merged_paths.push(vis_path.clone());
                        changed = true;
                    }
                }
                if changed {
                    existing.entry_visibility = Some(SharedVec::from(merged_paths));
                }
            }
            None => {
                existing.entry_visibility = Some(SharedVec::from(entry_visibility_paths.to_vec()));
            }
        }
    }

    if let Some(paths) = existing.entry_visibility.as_ref()
        && paths.len() == 1
        && paths[0] == existing.file_path
    {
        existing.entry_visibility = None;
    }

    if !resolved.dependencies.is_empty() {
        let set = existing.dep_dedupe_keys.get_or_insert_with(|| {
            existing
                .raw_dependencies
                .iter()
                .map(|dep| {
                    (
                        dep.name.clone(),
                        dep.import_path
                            .clone()
                            .unwrap_or_else(|| SharedString::from("")),
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

    match (
        &existing.enclosing_module_declaration_name,
        &resolved.enclosing_module_declaration_name,
    ) {
        (Some(existing_enc), Some(incoming_enc)) if existing_enc != incoming_enc => {}
        (None, Some(incoming_enc)) => {
            existing.enclosing_module_declaration_name = Some(incoming_enc.clone());
        }
        _ => {}
    }
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

/// Per absolute file path: local binding name → parsed import (earliest statement wins, matching `.find` on the crawl list).
fn index_imports_by_local_name(
    all_imports_per_file: &HashMap<SharedString, Vec<ParsedImport>>,
) -> HashMap<SharedString, HashMap<SharedString, ParsedImport>> {
    let mut out: HashMap<SharedString, HashMap<SharedString, ParsedImport>> =
        HashMap::with_capacity(all_imports_per_file.len());
    for (abs_path, imports) in all_imports_per_file {
        let mut by_name: HashMap<SharedString, ParsedImport> =
            HashMap::with_capacity(imports.len());
        for import in imports {
            by_name
                .entry(import.name.clone())
                .or_insert_with(|| import.clone());
        }
        out.insert(abs_path.clone(), by_name);
    }
    out
}

fn dash_norm_abs(
    cache: &DashMap<SharedString, SharedString>,
    file_path: &SharedString,
    package_dir_str: &str,
    rel_to_abs: &HashMap<SharedString, SharedString>,
) -> SharedString {
    if let Some(entry) = cache.get(file_path) {
        return entry.value().clone();
    }
    let normalized_abs = rel_to_abs
        .get(file_path)
        .map(|abs| normalize_path(Path::new(abs.as_ref())))
        .unwrap_or_else(|| normalize_path(&Path::new(package_dir_str).join(file_path.as_ref())));
    cache.insert(file_path.clone(), normalized_abs.clone());
    normalized_abs
}

fn dash_module_paths(
    cache: &DashMap<(SharedString, SharedString), Vec<SharedString>>,
    key: (SharedString, SharedString),
    abs_lookup_str: &str,
) -> Vec<SharedString> {
    if let Some(entry) = cache.get(&key) {
        return entry.value().clone();
    }
    let resolved_paths = resolve_module_specifier(key.1.as_ref(), abs_lookup_str);
    cache.insert(key, resolved_paths.clone());
    resolved_paths
}

fn dash_triple_closure(
    cache: &DashMap<SharedString, Vec<SharedString>>,
    file_rel: &SharedString,
    abs: SharedString,
    edges: &HashMap<SharedString, Vec<SharedString>>,
) -> Vec<SharedString> {
    if let Some(entry) = cache.get(file_rel) {
        return entry.value().clone();
    }
    let reachable_files = triple_slash_reachable(abs, edges);
    cache.insert(file_rel.clone(), reachable_files.clone());
    reachable_files
}

#[allow(clippy::too_many_arguments)]
fn resolve_dependency_ids_for_symbol(
    symbol_node: &SymbolNode,
    package_dir_str: &str,
    normalized_pkg_dir: &str,
    normalized_abs_cache: &DashMap<SharedString, SharedString>,
    module_specifier_cache: &DashMap<(SharedString, SharedString), Vec<SharedString>>,
    closure_cache: &DashMap<SharedString, Vec<SharedString>>,
    file_local_to_ids: &HashMap<SharedString, Vec<SharedString>>,
    file_local_member_tail_to_ids: &HashMap<SharedString, Vec<SharedString>>,
    name_to_ids: &HashMap<SharedString, Vec<SharedString>>,
    id_to_file_path: &HashMap<SharedString, SharedString>,
    import_maps_per_file: &HashMap<SharedString, HashMap<SharedString, ParsedImport>>,
    triple_slash_edges: &HashMap<SharedString, Vec<SharedString>>,
    has_ref_edges: bool,
    protocol_regex: &Regex,
    dependency_stub_roots: Option<&HashSet<String>>,
    stub_self_exempt_root: Option<&str>,
    rel_to_abs: &HashMap<SharedString, SharedString>,
) -> Vec<SharedString> {
    let abs_lookup = dash_norm_abs(
        normalized_abs_cache,
        &symbol_node.file_path,
        package_dir_str,
        rel_to_abs,
    );
    let abs_lookup_str: &str = abs_lookup.as_ref();

    let stub_roots_nonempty = dependency_stub_roots.filter(|roots| !roots.is_empty());

    let dep_count = symbol_node.raw_dependencies.len();
    let mut resolved_ids: HashSet<SharedString> =
        HashSet::with_capacity(dep_count.saturating_mul(2));
    let mut target_ids: Vec<SharedString> = Vec::with_capacity(8);
    let mut namespace_fallback_roots: Vec<SharedString> = Vec::with_capacity(4);
    let mut import_path_dedup: HashSet<SharedString> = HashSet::with_capacity(8);

    for raw_dep in symbol_node.raw_dependencies.iter() {
        let namespace_qual = raw_dep
            .import_path
            .is_none()
            .then(|| split_import_namespace_member(raw_dep.name.as_ref()))
            .flatten();

        target_ids.clear();
        namespace_fallback_roots.clear();

        if let Some(stub_roots) = stub_roots_nonempty {
            if let Some(spec) = raw_dep.import_path.as_deref() {
                if specifier_is_dependency_stub(spec, stub_roots, stub_self_exempt_root)
                    && let Some(stub) =
                        try_external_module_stub_id(spec, raw_dep.name.as_ref(), protocol_regex)
                {
                    resolved_ids.insert(stub.into());
                    continue;
                }
            } else if let Some(import_map) = import_maps_per_file.get(abs_lookup.as_ref()) {
                if let Some(matching_import) = import_map.get(raw_dep.name.as_ref()) {
                    let source = matching_import.source.as_ref();
                    if specifier_is_dependency_stub(source, stub_roots, stub_self_exempt_root) {
                        let original_name = matching_import
                            .original_name
                            .as_deref()
                            .unwrap_or(matching_import.name.as_ref());
                        if let Some(stub) =
                            try_external_module_stub_id(source, original_name, protocol_regex)
                        {
                            resolved_ids.insert(stub.into());
                            continue;
                        }
                    }
                }
                if let Some((qualifier, member_path)) = namespace_qual
                    && let Some(ns_import) = import_map.get(qualifier)
                {
                    let source = ns_import.source.as_ref();
                    if specifier_is_dependency_stub(source, stub_roots, stub_self_exempt_root)
                        && let Some(stub) =
                            try_external_module_stub_id(source, member_path, protocol_regex)
                    {
                        resolved_ids.insert(stub.into());
                        continue;
                    }
                }
            }
        }

        // import()-style deps: merge file_local_to_ids across all resolved paths,
        // then fall back to name_to_ids when the entry file has no local row
        // (typical barrel re-export to a definition file).
        if let Some(import_path) = &raw_dep.import_path {
            let cache_key = (symbol_node.file_path.clone(), import_path.clone());
            let abs_paths = dash_module_paths(module_specifier_cache, cache_key, abs_lookup_str);
            import_path_dedup.clear();
            for abs_path in abs_paths.iter() {
                let rel_path = make_relative_to_package(
                    abs_path.as_ref(),
                    package_dir_str,
                    normalized_pkg_dir,
                );
                let key: SharedString = format!("{}::{}", rel_path, raw_dep.name.as_ref()).into();
                if let Some(ids) = file_local_to_ids.get(&key) {
                    for symbol_id in ids {
                        import_path_dedup.insert(symbol_id.clone());
                    }
                } else {
                    let member_tail_key: SharedString =
                        format!("{}::.{}", rel_path, raw_dep.name.as_ref()).into();
                    if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                        for symbol_id in ids {
                            import_path_dedup.insert(symbol_id.clone());
                        }
                    }
                }
            }
            target_ids.extend(import_path_dedup.drain());
            if target_ids.is_empty()
                && let Some(ids) = name_to_ids.get(&raw_dep.name)
            {
                target_ids.extend(ids.iter().cloned());
            }
        } else {
            let mut namespace_target_files_resolved = false;

            let key: SharedString = format!(
                "{}::{}",
                symbol_node.file_path.as_ref(),
                raw_dep.name.as_ref()
            )
            .into();
            if let Some(ids) = file_local_to_ids.get(&key) {
                target_ids.extend(ids.iter().cloned());
            } else {
                let member_tail_key: SharedString = format!(
                    "{}::.{}",
                    symbol_node.file_path.as_ref(),
                    raw_dep.name.as_ref()
                )
                .into();
                if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                    target_ids.extend(ids.iter().cloned());
                }
            }

            if target_ids.is_empty()
                && let Some(import_map) = import_maps_per_file.get(abs_lookup.as_ref())
                && let Some(matching_import) = import_map.get(raw_dep.name.as_ref())
            {
                let source_cache_key = (
                    symbol_node.file_path.clone(),
                    matching_import.source.clone(),
                );
                let abs_source_paths =
                    dash_module_paths(module_specifier_cache, source_cache_key, abs_lookup_str);
                if !abs_source_paths.is_empty() {
                    let rel_source_path = make_relative_to_package(
                        &abs_source_paths[0],
                        package_dir_str,
                        normalized_pkg_dir,
                    );
                    let original_name = matching_import
                        .original_name
                        .as_deref()
                        .unwrap_or(&matching_import.name);
                    let import_key: SharedString =
                        format!("{}::{}", rel_source_path, original_name).into();
                    if let Some(ids) = file_local_to_ids.get(&import_key) {
                        target_ids.extend(ids.iter().cloned());
                    } else {
                        let member_tail_key: SharedString =
                            format!("{}::.{}", rel_source_path, original_name).into();
                        if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                            target_ids.extend(ids.iter().cloned());
                        }
                    }
                }
            }

            if target_ids.is_empty()
                && let (Some(import_map), Some((qualifier, member_path))) = (
                    import_maps_per_file.get(abs_lookup.as_ref()),
                    namespace_qual,
                )
                && let Some(ns_import) = import_map.get(qualifier)
            {
                let ns_cache_key = (symbol_node.file_path.clone(), ns_import.source.clone());
                let abs_source_paths =
                    dash_module_paths(module_specifier_cache, ns_cache_key, abs_lookup_str);
                namespace_target_files_resolved = !abs_source_paths.is_empty();
                namespace_fallback_roots.clear();
                for absolute_source_path in &abs_source_paths {
                    let rel_source_path = make_relative_to_package(
                        absolute_source_path.as_ref(),
                        package_dir_str,
                        normalized_pkg_dir,
                    );
                    let parent_dir = rel_parent_dir(rel_source_path.as_ref());
                    if !namespace_fallback_roots.contains(&parent_dir) {
                        namespace_fallback_roots.push(parent_dir);
                    }
                    let import_key: SharedString =
                        format!("{}::{}", rel_source_path, member_path).into();
                    if let Some(ids) = file_local_to_ids.get(&import_key) {
                        target_ids.extend(ids.iter().cloned());
                    } else {
                        let member_tail_key: SharedString =
                            format!("{}::.{}", rel_source_path, member_path).into();
                        if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                            target_ids.extend(ids.iter().cloned());
                        }
                    }
                }
            }

            if target_ids.is_empty() && has_ref_edges {
                let closure = dash_triple_closure(
                    closure_cache,
                    &symbol_node.file_path,
                    abs_lookup.clone(),
                    triple_slash_edges,
                );
                let mut from_closure: HashSet<SharedString> = HashSet::new();
                for reachable_abs in closure {
                    let relative_file_path = make_relative_to_package(
                        reachable_abs.as_ref(),
                        package_dir_str,
                        normalized_pkg_dir,
                    );
                    if relative_file_path == symbol_node.file_path.as_ref() {
                        continue;
                    }
                    let closure_lookup_key: SharedString =
                        format!("{}::{}", relative_file_path, raw_dep.name.as_ref()).into();
                    if let Some(ids) = file_local_to_ids.get(&closure_lookup_key) {
                        for symbol_id in ids {
                            from_closure.insert(symbol_id.clone());
                        }
                    } else {
                        let member_tail_key: SharedString =
                            format!("{}::.{}", relative_file_path, raw_dep.name.as_ref()).into();
                        if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                            for symbol_id in ids {
                                from_closure.insert(symbol_id.clone());
                            }
                        }
                    }
                    if let Some((_qualifier, member_path)) = namespace_qual {
                        let member_key: SharedString =
                            format!("{}::{}", relative_file_path, member_path).into();
                        if let Some(ids) = file_local_to_ids.get(&member_key) {
                            for symbol_id in ids {
                                from_closure.insert(symbol_id.clone());
                            }
                        } else {
                            let member_tail_key: SharedString =
                                format!("{}::.{}", relative_file_path, member_path).into();
                            if let Some(ids) = file_local_member_tail_to_ids.get(&member_tail_key) {
                                for symbol_id in ids {
                                    from_closure.insert(symbol_id.clone());
                                }
                            }
                        }
                    }
                }
                target_ids.extend(from_closure.into_iter());
            }

            if target_ids.is_empty()
                && let Some(ids) = name_to_ids.get(&raw_dep.name)
            {
                target_ids.extend(ids.iter().cloned());
            }
            if target_ids.is_empty()
                && namespace_target_files_resolved
                && let Some((_, member_path)) = namespace_qual
            {
                let member_key: SharedString = SharedString::from(member_path);
                if let Some(ids) = name_to_ids.get(&member_key) {
                    let skip_namespace_root_filter = namespace_fallback_roots.is_empty()
                        || namespace_fallback_roots.iter().any(|root_path| {
                            root_path.as_ref() == "." || root_path.as_ref().is_empty()
                        });
                    if skip_namespace_root_filter {
                        target_ids.extend(ids.iter().cloned());
                    } else {
                        for symbol_id in ids {
                            if let Some(stored_path) = id_to_file_path.get(symbol_id) {
                                let defining_path = stored_path.as_ref();
                                if namespace_fallback_roots.iter().any(|namespace_root| {
                                    file_path_under_namespace_root(
                                        defining_path,
                                        namespace_root.as_ref(),
                                    )
                                }) {
                                    target_ids.push(symbol_id.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        target_ids.retain(|symbol_id| symbol_id.as_ref() != symbol_node.id.as_ref());

        if !target_ids.is_empty() {
            for symbol_id in target_ids.drain(..) {
                resolved_ids.insert(symbol_id);
            }
        } else {
            let import_path = raw_dep.import_path.as_deref();

            if let Some(path) = import_path {
                if let Some(ext_id) =
                    resolve_external_dep_id(path, raw_dep.name.as_ref(), protocol_regex)
                {
                    resolved_ids.insert(ext_id.into());
                } else if let Some(stub) =
                    try_external_module_stub_id(path, raw_dep.name.as_ref(), protocol_regex)
                {
                    resolved_ids.insert(stub.into());
                }
            } else if let Some(import_map) = import_maps_per_file.get(abs_lookup.as_ref()) {
                if let Some(matching_import) = import_map.get(raw_dep.name.as_ref()) {
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
                if let Some((qualifier, member_path)) = namespace_qual
                    && let Some(ns_import) = import_map.get(qualifier)
                    && let Some(stub) = try_external_module_stub_id(
                        ns_import.source.as_ref(),
                        member_path,
                        protocol_regex,
                    )
                {
                    resolved_ids.insert(stub.into());
                }
            }
        }
    }

    let mut resolved_ids_vec: Vec<SharedString> = resolved_ids.into_iter().collect();
    resolved_ids_vec.sort();
    resolved_ids_vec
}

pub fn build_package_graph(
    package_info: &PackageInfo,
    crawl_options: Option<CrawlOptions>,
) -> PackageGraph {
    let parallel_resolve_deps = crawl_options
        .as_ref()
        .map(|options| options.parallel_resolve_deps)
        .unwrap_or(true);

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
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.resolve_entry"),
        entry_resolution_ms,
    );

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

    let stub_self_exempt_root = npm_package_root(package_info.name.as_ref());

    let mut merged_crawl_opts = crawl_options.as_ref().cloned().unwrap_or_default();
    merged_crawl_opts.dependency_stub_self_exempt_root = stub_self_exempt_root.clone();
    merged_crawl_opts.package_dir_for_relative_paths = Some(package_info.dir.as_ref().to_string());

    let dependency_stub_roots_arc = if merged_crawl_opts.dependency_stub_roots.is_empty() {
        None
    } else {
        Some(Arc::clone(&merged_crawl_opts.dependency_stub_roots))
    };

    let crawl_phase_start = Instant::now();
    let crawl_result = crawl(&entry.types_entries, Some(merged_crawl_opts));
    let crawl_duration_ms = crawl_phase_start.elapsed().as_secs_f64() * 1000.0;
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.crawl_total"),
        crawl_duration_ms,
    );

    let graph_assembly_phase_start = Instant::now();
    let all_symbols = crawl_result.exports;
    let all_imports_per_file = crawl_result.imports;
    let import_maps_per_file = index_imports_by_local_name(&all_imports_per_file);
    let triple_slash_edges = crawl_result.triple_slash_reference_targets;
    let file_is_external = crawl_result.file_is_external_module;
    let package_dir_str = package_info.dir.as_ref();
    let normalized_pkg_dir = package_dir_str.replace('\\', "/");
    let entry_files: HashSet<SharedString> = entry
        .types_entries
        .iter()
        .map(|entry_file_path| {
            SharedString::from(
                make_relative_to_package(
                    entry_file_path,
                    package_dir_str,
                    normalized_pkg_dir.as_str(),
                )
                .as_str(),
            )
        })
        .collect();
    let abs_to_rel = &crawl_result.absolute_to_package_relative;
    let rel_to_abs = &crawl_result.rel_to_abs;
    let merge_scope_by_rel = compute_merge_scope_ids(
        &crawl_result.visited_files,
        &triple_slash_edges,
        &file_is_external,
        abs_to_rel,
    );
    let visited: HashSet<SharedString> = crawl_result.visited_files.into_iter().collect();

    let mut merged: Vec<(SharedString, SymbolNode)> = Vec::new();
    let mut merge_index: HashMap<SharedString, usize> =
        HashMap::with_capacity(all_symbols.len().min(65536));
    let mut additional_files_seen: HashMap<usize, HashSet<SharedString>> = HashMap::new();
    let mut signature_norm_seen: Vec<HashSet<String>> = Vec::new();
    // External-module Interface / TypeAlias: fold files when kind + name + normalized signature match.
    let mut module_identical_fold: HashMap<(SharedString, u32, String), usize> =
        HashMap::with_capacity(all_symbols.len().min(4096));

    let merge_phase_start = Instant::now();
    for resolved in &all_symbols {
        let symbol_file_path = abs_to_rel
            .get(&resolved.defined_in)
            .cloned()
            .unwrap_or_else(|| {
                SharedString::from(
                    make_relative_to_package(
                        resolved.defined_in.as_ref(),
                        package_dir_str,
                        normalized_pkg_dir.as_str(),
                    )
                    .as_str(),
                )
            });
        let is_ext = file_is_external
            .get(resolved.defined_in.as_ref())
            .copied()
            .unwrap_or(true);
        let entry_visibility_paths = entry_visibility_contributions(
            resolved,
            &symbol_file_path,
            &entry_files,
            abs_to_rel,
            package_dir_str,
            normalized_pkg_dir.as_str(),
        );
        let norm_sig = normalize_signature(resolved.signature.as_deref());
        let merge_key: SharedString = if is_interface_or_type_alias_merge_scoped(resolved.kind) {
            let scope_key = merge_scope_by_rel
                .get(&symbol_file_path)
                .cloned()
                .unwrap_or_else(|| SharedString::from(format!("m:{}", symbol_file_path.as_ref())));
            format!(
                "{}::{}::{}",
                scope_key.as_ref(),
                resolved.name.as_ref(),
                resolved.kind.numeric_kind()
            )
            .into()
        } else if is_namespace_or_enum_cross_file_mergeable(resolved.kind) {
            let scope_key = merge_scope_by_rel
                .get(&symbol_file_path)
                .cloned()
                .unwrap_or_else(|| SharedString::from(format!("m:{}", symbol_file_path.as_ref())));
            format!(
                "{}::{}::{}",
                scope_key.as_ref(),
                resolved.name.as_ref(),
                resolved.kind.numeric_kind()
            )
            .into()
        } else if is_member_overload_mergeable(resolved.kind) {
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

        let can_identical_fold_across_modules = is_ext
            && (is_interface_or_type_alias_merge_scoped(resolved.kind)
                || is_namespace_or_enum_cross_file_mergeable(resolved.kind));
        if can_identical_fold_across_modules {
            let fold_key = (
                resolved.name.clone(),
                resolved.kind.numeric_kind(),
                norm_sig.clone(),
            );
            if let Some(&fold_idx) = module_identical_fold.get(&fold_key)
                && merged[fold_idx].1.file_path != symbol_file_path
            {
                merge_resolved_into_node(
                    &mut merged[fold_idx].1,
                    resolved,
                    &symbol_file_path,
                    &entry_visibility_paths,
                    fold_idx,
                    &mut additional_files_seen,
                    &mut signature_norm_seen,
                    ContributionMergePath::IdenticalFold,
                );
                continue;
            }
        }

        if let Some(&index) = merge_index.get(&merge_key) {
            merge_resolved_into_node(
                &mut merged[index].1,
                resolved,
                &symbol_file_path,
                &entry_visibility_paths,
                index,
                &mut additional_files_seen,
                &mut signature_norm_seen,
                ContributionMergePath::MergeScope,
            );
        } else {
            let re_export_source = resolved.re_export_chain.first().map(|chain_start| {
                make_relative_to_package(chain_start, package_dir_str, normalized_pkg_dir.as_str())
            });

            let re_exported_from = match &re_export_source {
                Some(source) if source != &*symbol_file_path => Some(source.clone()),
                _ => None,
            };

            let node = SymbolNode {
                id: "".into(),
                name: resolved.name.clone(),
                parent_symbol_id: None,
                enclosing_module_declaration_id: None,
                enclosing_module_declaration_name: resolved
                    .enclosing_module_declaration_name
                    .clone(),
                kind: resolved.kind,
                kind_name: SharedString::from(resolved.kind.as_str()),
                package: package_info.name.clone(),
                file_path: symbol_file_path,
                additional_files: None,
                entry_visibility: if entry_visibility_paths.is_empty() {
                    None
                } else {
                    Some(SharedVec::from(entry_visibility_paths))
                },
                merge_provenance: None,
                signature: resolved.signature.clone(),
                js_doc: resolved.js_doc.clone(),
                is_type_only: resolved.is_type_only,
                symbol_space: resolved.symbol_space,
                dependencies: SharedVec::from(Vec::new()), // Built later
                surface_dependencies: SharedVec::from(Vec::new()),
                raw_dependencies: resolved.dependencies.to_vec(),
                re_exported_from: re_exported_from.map(Into::into),
                deprecated: resolved.deprecated.clone(),
                visibility: resolved.visibility.clone(),
                since: resolved.since.clone(),
                is_internal: resolved.is_internal,
                is_global_augmentation: resolved.is_global_augmentation,
                decorators: resolved.decorators.clone(),
                is_inherited: false,
                inherited_from_sources: SharedVec::from(Vec::new()),
                heritage: resolved.heritage.clone(),
                modifiers: resolved.modifiers.clone(),
                dep_dedupe_keys: None,
            };

            let index = merged.len();
            merge_index.insert(merge_key, index);
            if can_identical_fold_across_modules {
                module_identical_fold.insert(
                    (
                        resolved.name.clone(),
                        resolved.kind.numeric_kind(),
                        norm_sig,
                    ),
                    index,
                );
            }
            let mut initial_normalized_signatures_for_row = HashSet::with_capacity(4);
            let normalized_signature_initial = normalize_signature(resolved.signature.as_deref());
            if !normalized_signature_initial.is_empty() {
                initial_normalized_signatures_for_row.insert(normalized_signature_initial);
            }
            signature_norm_seen.push(initial_normalized_signatures_for_row);
            merged.push((SharedString::from(""), node));
        }
    }
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.merge"),
        merge_phase_start.elapsed().as_secs_f64() * 1000.0,
    );

    // Insertion order = first occurrence of each merge key in crawl order (stable `#n` / name_to_id).
    let mut symbols: Vec<SymbolNode> = merged.into_iter().map(|(_unused_key, node)| node).collect();
    for symbol_node in &mut symbols {
        if let Some(paths) = symbol_node.entry_visibility.as_ref()
            && paths.len() == 1
            && paths[0] == symbol_node.file_path
        {
            symbol_node.entry_visibility = None;
        }
    }

    let ids_maps_phase_start = Instant::now();
    let sym_cap = symbols.len().min(65536);
    let mut name_to_id: HashMap<SharedString, SharedString> = HashMap::with_capacity(sym_cap);
    let mut name_to_ids: HashMap<SharedString, Vec<SharedString>> = HashMap::with_capacity(sym_cap);
    let mut file_local_to_ids: HashMap<SharedString, Vec<SharedString>> =
        HashMap::with_capacity(sym_cap);
    let mut file_local_member_tail_to_ids: HashMap<SharedString, Vec<SharedString>> =
        HashMap::with_capacity(sym_cap);
    let mut file_local_namespace_ids: HashMap<SharedString, Vec<SharedString>> =
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
            let fk: SharedString =
                format!("{}::{}", symbol_node.file_path, symbol_node.name).into();
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
                    package_info.name, package_info.version, symbol_node.name, count
                )
                .into()
            };
        }

        let short_key: SharedString =
            format!("{}::{}", symbol_node.file_path, symbol_node.name).into();
        file_local_to_ids
            .entry(short_key.clone())
            .or_default()
            .push(symbol_node.id.clone());
        if let Some((_, tail)) = symbol_node.name.rsplit_once('.') {
            let member_tail_key: SharedString =
                format!("{}::.{}", symbol_node.file_path, tail).into();
            file_local_member_tail_to_ids
                .entry(member_tail_key)
                .or_default()
                .push(symbol_node.id.clone());
        }
        if matches!(symbol_node.kind, SymbolKind::Namespace) {
            file_local_namespace_ids
                .entry(short_key)
                .or_default()
                .push(symbol_node.id.clone());
        }

        name_to_ids
            .entry(symbol_node.name.clone())
            .or_default()
            .push(symbol_node.id.clone());
    }

    // Package-level name → id: Interface/TypeAlias, then Class, then Namespace, then backfill.
    name_to_id.clear();
    for symbol_node in &symbols {
        if matches!(
            symbol_node.kind,
            SymbolKind::Interface | SymbolKind::TypeAlias
        ) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols {
        if matches!(symbol_node.kind, SymbolKind::Class)
            && !name_to_id.contains_key(symbol_node.name.as_ref())
        {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols {
        if matches!(symbol_node.kind, SymbolKind::Namespace)
            && !name_to_id.contains_key(symbol_node.name.as_ref())
        {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols {
        if !name_to_id.contains_key(symbol_node.name.as_ref()) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }

    let mut id_to_kind: HashMap<SharedString, SymbolKind> =
        HashMap::with_capacity(symbols.len().min(65536));
    for symbol_node in &symbols {
        id_to_kind.insert(symbol_node.id.clone(), symbol_node.kind);
    }

    let mut id_to_file_path: HashMap<SharedString, SharedString> =
        HashMap::with_capacity(symbols.len().min(65536));
    for symbol_node in &symbols {
        id_to_file_path.insert(symbol_node.id.clone(), symbol_node.file_path.clone());
    }
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.ids_maps"),
        ids_maps_phase_start.elapsed().as_secs_f64() * 1000.0,
    );

    let protocol_regex = &*PROTOCOL_REGEX;
    let has_ref_edges = !triple_slash_edges.is_empty();

    let dependency_stub_roots_ref = dependency_stub_roots_arc
        .as_ref()
        .map(|roots| roots.as_ref())
        .filter(|roots| !roots.is_empty());

    let stub_self_exempt_for_resolve = stub_self_exempt_root.as_deref();

    let resolve_deps_phase_start = Instant::now();
    let normalized_abs_cache: DashMap<SharedString, SharedString> = DashMap::new();
    let closure_cache: DashMap<SharedString, Vec<SharedString>> = DashMap::new();
    let module_specifier_cache: DashMap<(SharedString, SharedString), Vec<SharedString>> =
        DashMap::new();

    if parallel_resolve_deps {
        let indexed: Vec<(usize, Vec<SharedString>)> = symbols
            .iter()
            .enumerate()
            .filter(|(_symbol_index, symbol_node)| !symbol_node.raw_dependencies.is_empty())
            .collect::<Vec<_>>()
            .into_par_iter()
            .map(|(symbol_index, symbol_node)| {
                let deps = resolve_dependency_ids_for_symbol(
                    symbol_node,
                    package_dir_str,
                    normalized_pkg_dir.as_str(),
                    &normalized_abs_cache,
                    &module_specifier_cache,
                    &closure_cache,
                    &file_local_to_ids,
                    &file_local_member_tail_to_ids,
                    &name_to_ids,
                    &id_to_file_path,
                    &import_maps_per_file,
                    &triple_slash_edges,
                    has_ref_edges,
                    protocol_regex,
                    dependency_stub_roots_ref,
                    stub_self_exempt_for_resolve,
                    rel_to_abs,
                );
                (symbol_index, deps)
            })
            .collect();
        for (symbol_index, deps) in indexed {
            symbols[symbol_index].dependencies = SharedVec::from(deps);
            symbols[symbol_index].raw_dependencies.clear();
        }
    } else {
        for symbol_node in &mut symbols {
            if symbol_node.raw_dependencies.is_empty() {
                continue;
            }
            let deps = resolve_dependency_ids_for_symbol(
                symbol_node,
                package_dir_str,
                normalized_pkg_dir.as_str(),
                &normalized_abs_cache,
                &module_specifier_cache,
                &closure_cache,
                &file_local_to_ids,
                &file_local_member_tail_to_ids,
                &name_to_ids,
                &id_to_file_path,
                &import_maps_per_file,
                &triple_slash_edges,
                has_ref_edges,
                protocol_regex,
                dependency_stub_roots_ref,
                stub_self_exempt_for_resolve,
                rel_to_abs,
            );
            symbol_node.dependencies = SharedVec::from(deps);
            symbol_node.raw_dependencies.clear();
        }
    }
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.resolve_deps"),
        resolve_deps_phase_start.elapsed().as_secs_f64() * 1000.0,
    );

    let flatten_phase_start = Instant::now();
    let pre_flatten_len = symbols.len();
    flatten_inherited_members(
        &mut symbols,
        &name_to_id,
        &package_info.name,
        &package_info.version,
    );
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.flatten_heritage"),
        flatten_phase_start.elapsed().as_secs_f64() * 1000.0,
    );

    for symbol_node in &symbols[pre_flatten_len..] {
        id_to_kind.insert(symbol_node.id.clone(), symbol_node.kind);
        let short_key: SharedString =
            format!("{}::{}", symbol_node.file_path, symbol_node.name).into();
        file_local_to_ids
            .entry(short_key.clone())
            .or_default()
            .push(symbol_node.id.clone());
        if matches!(symbol_node.kind, SymbolKind::Namespace) {
            file_local_namespace_ids
                .entry(short_key)
                .or_default()
                .push(symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols[pre_flatten_len..] {
        if matches!(
            symbol_node.kind,
            SymbolKind::Interface | SymbolKind::TypeAlias
        ) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols[pre_flatten_len..] {
        if matches!(symbol_node.kind, SymbolKind::Class)
            && !name_to_id.contains_key(symbol_node.name.as_ref())
        {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols[pre_flatten_len..] {
        if matches!(symbol_node.kind, SymbolKind::Namespace)
            && !name_to_id.contains_key(symbol_node.name.as_ref())
        {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for symbol_node in &symbols[pre_flatten_len..] {
        if !name_to_id.contains_key(symbol_node.name.as_ref()) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }
    for ids in file_local_to_ids.values_mut() {
        ids.sort_by(|left, right| left.as_ref().cmp(right.as_ref()));
    }
    for ids in file_local_namespace_ids.values_mut() {
        ids.sort_by(|left, right| left.as_ref().cmp(right.as_ref()));
    }
    assign_parent_symbol_ids(&mut symbols, &file_local_to_ids, &name_to_id, &id_to_kind);
    assign_enclosing_module_declaration_ids(&mut symbols, &file_local_namespace_ids);
    assign_surface_dependencies(&mut symbols);

    let graph_assembly_ms = graph_assembly_phase_start.elapsed().as_secs_f64() * 1000.0;
    profile::profile_log(
        &graph_profile_label(&package_info.name, "graph.assembly_total"),
        graph_assembly_ms,
    );
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

fn assign_surface_dependencies(symbols: &mut [SymbolNode]) {
    let mut namespace_container_index_by_id: HashMap<SharedString, usize> = HashMap::new();
    for (symbol_index, symbol_node) in symbols.iter().enumerate() {
        if matches!(symbol_node.kind, SymbolKind::Namespace) {
            namespace_container_index_by_id.insert(symbol_node.id.clone(), symbol_index);
        }
    }
    if namespace_container_index_by_id.is_empty() {
        return;
    }

    let mut member_indices_by_container_index: HashMap<usize, Vec<usize>> = HashMap::new();
    for (symbol_index, symbol_node) in symbols.iter().enumerate() {
        let Some(parent_id) = symbol_node.parent_symbol_id.as_ref() else {
            continue;
        };
        let Some(container_index) = namespace_container_index_by_id.get(parent_id) else {
            continue;
        };
        member_indices_by_container_index
            .entry(*container_index)
            .or_default()
            .push(symbol_index);
    }

    for (container_index, member_indices) in member_indices_by_container_index {
        let mut rolled_dependency_ids: HashSet<SharedString> = HashSet::new();
        for member_index in member_indices {
            let member_node = &symbols[member_index];
            for dependency_id in member_node.dependencies.iter() {
                rolled_dependency_ids.insert(dependency_id.clone());
            }
        }
        let container_node = &mut symbols[container_index];
        if rolled_dependency_ids.is_empty() {
            container_node.surface_dependencies = SharedVec::from(Vec::new());
            continue;
        }
        let mut sorted_dependency_ids: Vec<SharedString> =
            rolled_dependency_ids.into_iter().collect();
        sorted_dependency_ids.sort_by(|left, right| left.as_ref().cmp(right.as_ref()));
        container_node.surface_dependencies = SharedVec::from(sorted_dependency_ids);
    }
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
                raw.strip_prefix("//").unwrap_or(raw)
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

/// Prefer a parent container when `filePath::parentName` maps to multiple symbol ids.
fn rank_parent_kind_for_member(parent_kind: SymbolKind, member: &SymbolNode) -> u8 {
    use SymbolKind::*;
    use SymbolSpace::Type;

    if matches!(member.kind, MethodDeclaration | PropertyDeclaration) {
        return match parent_kind {
            Class => 0,
            Interface => 1,
            Namespace => 2,
            Function => 3,
            _ => 5,
        };
    }

    if matches!(member.kind, Interface | Class | Enum | TypeAlias) {
        return match parent_kind {
            Namespace => 0,
            Class => 1,
            Enum => 2,
            Interface => 3,
            Function => 4,
            _ => 5,
        };
    }

    let type_shape_member = matches!(member.symbol_space, Type)
        || matches!(
            member.kind,
            PropertySignature | MethodSignature | GetAccessor | SetAccessor
        );

    if type_shape_member {
        return match parent_kind {
            Interface => 0,
            TypeAlias => 1,
            Class => 2,
            Namespace => 3,
            Function => 4,
            _ => 5,
        };
    }

    match parent_kind {
        Namespace => 0,
        Class => 1,
        Enum => 2,
        Function => 3,
        Interface => 4,
        _ => 5,
    }
}

fn pick_preferred_parent_id(
    candidate_ids: &[SharedString],
    member: &SymbolNode,
    id_to_kind: &HashMap<SharedString, SymbolKind>,
) -> Option<SharedString> {
    if candidate_ids.is_empty() {
        return None;
    }
    if candidate_ids.len() == 1 {
        return Some(candidate_ids[0].clone());
    }
    let mut ranked: Vec<SharedString> = candidate_ids.to_vec();
    ranked.sort_by(|a, b| {
        let ka = id_to_kind.get(a).copied().unwrap_or(SymbolKind::Unknown);
        let kb = id_to_kind.get(b).copied().unwrap_or(SymbolKind::Unknown);
        let ra = rank_parent_kind_for_member(ka, member);
        let rb = rank_parent_kind_for_member(kb, member);
        ra.cmp(&rb).then_with(|| a.as_ref().cmp(b.as_ref()))
    });
    ranked.first().cloned()
}

/// Sets [`SymbolNode::enclosing_module_declaration_id`] from [`SymbolNode::enclosing_module_declaration_name`]
/// using `filePath::moduleName` keys. Only namespace symbol ids are stored in `file_local_namespace_ids`
/// (precomputed while building `file_local_to_ids`).
///
/// `file_local_namespace_ids` values **must** be sorted by id string (see call site).
fn assign_enclosing_module_declaration_ids(
    symbols: &mut [SymbolNode],
    file_local_namespace_ids: &HashMap<SharedString, Vec<SharedString>>,
) {
    for node in symbols.iter_mut() {
        let Some(enclosing_name) = node.enclosing_module_declaration_name.clone() else {
            continue;
        };
        if matches!(node.kind, SymbolKind::Namespace)
            && node.name.as_ref() == enclosing_name.as_ref()
        {
            node.enclosing_module_declaration_name = None;
            continue;
        }
        let file_key: SharedString =
            format!("{}::{}", node.file_path.as_ref(), enclosing_name.as_ref()).into();
        let Some(module_declaration_ids) = file_local_namespace_ids.get(&file_key) else {
            node.enclosing_module_declaration_name = None;
            continue;
        };
        if module_declaration_ids.is_empty() {
            node.enclosing_module_declaration_name = None;
            continue;
        }
        // `file_local_namespace_ids` values are sorted by id string (same as `file_local_to_ids`).
        node.enclosing_module_declaration_id = Some(module_declaration_ids[0].clone());
        node.enclosing_module_declaration_name = None;
    }
}

fn assign_parent_symbol_ids(
    symbols: &mut [SymbolNode],
    file_local_to_ids: &HashMap<SharedString, Vec<SharedString>>,
    name_to_id: &HashMap<SharedString, SharedString>,
    id_to_kind: &HashMap<SharedString, SymbolKind>,
) {
    for node in symbols.iter_mut() {
        let Some(parent_name) = parent_name_for_dotted_member(node.name.as_ref()) else {
            continue;
        };
        let parent_name: SharedString = parent_name.into();
        let file_key: SharedString =
            format!("{}::{}", node.file_path.as_ref(), parent_name.as_ref()).into();
        if let Some(ids) = file_local_to_ids.get(&file_key)
            && let Some(chosen) = pick_preferred_parent_id(ids, node, id_to_kind)
        {
            node.parent_symbol_id = Some(chosen);
            continue;
        }
        if let Some(pid) = name_to_id.get(parent_name.as_ref()) {
            node.parent_symbol_id = Some(pid.clone());
        }
    }
}

fn parent_name_for_dotted_member(name: &str) -> Option<String> {
    if !name.contains('.') {
        return None;
    }
    if name.contains(".prototype.") {
        let segments: Vec<&str> = name.split('.').collect();
        if segments.contains(&"prototype") {
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
        matches!(node.kind, SymbolKind::Class | SymbolKind::Interface) && !node.heritage.is_empty()
    }) {
        let entry = merged_heritage.entry(node.name.clone()).or_default();
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

        let direct_child_short_names: HashSet<String> = child_members
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

        let mut inherited_by_leaf: HashMap<String, SymbolNode> = HashMap::new();

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

                if direct_child_short_names.contains(short_name) {
                    continue;
                }

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
                let leaf_key = format!("{}::{}", node_name, short_name);

                match inherited_by_leaf.entry(leaf_key) {
                    Entry::Occupied(mut occupied) => {
                        let synth = occupied.get_mut();
                        let parent_source_id = parent_member.id.clone();
                        if !synth.inherited_from_sources.contains(&parent_source_id) {
                            let mut combined: Vec<SharedString> =
                                synth.inherited_from_sources.iter().cloned().collect();
                            combined.push(parent_source_id);
                            synth.inherited_from_sources = SharedVec::from(combined);
                        }
                    }
                    Entry::Vacant(vacant) => {
                        let mut synth_node = (*parent_member).clone();
                        synth_node.id = synth_id.into();
                        synth_node.name = new_member_name.into();
                        synth_node.package = pkg_name.clone();
                        synth_node.is_inherited = true;
                        synth_node.inherited_from_sources =
                            SharedVec::from(vec![parent_member.id.clone()]);
                        synth_node.additional_files = None;
                        synth_node.merge_provenance = None;
                        vacant.insert(synth_node);
                    }
                }
            }
        }

        for mut symbol_node in inherited_by_leaf.into_values() {
            let mut sources: Vec<SharedString> =
                symbol_node.inherited_from_sources.iter().cloned().collect();
            sources.sort_by(|a, b| a.as_ref().cmp(b.as_ref()));
            symbol_node.inherited_from_sources = SharedVec::from(sources);
            synthetic.push(symbol_node);
        }
    }

    symbols.extend(synthetic);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crawler::CrawlOptions;
    use crate::resolver::normalize_path;
    use std::collections::HashSet;
    use std::path::Path;
    use std::sync::Arc;

    fn fixture_dir(fixture_name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join(fixture_name)
    }

    #[test]
    fn namespace_enum_cross_file_mergeable_matches_expectation() {
        assert!(is_namespace_or_enum_cross_file_mergeable(
            SymbolKind::Namespace
        ));
        assert!(is_namespace_or_enum_cross_file_mergeable(SymbolKind::Enum));
        assert!(!is_namespace_or_enum_cross_file_mergeable(
            SymbolKind::Interface
        ));
        assert!(!is_namespace_or_enum_cross_file_mergeable(
            SymbolKind::TypeAlias
        ));
        assert!(!is_namespace_or_enum_cross_file_mergeable(
            SymbolKind::Function
        ));
        assert!(!is_namespace_or_enum_cross_file_mergeable(
            SymbolKind::Class
        ));
    }

    #[test]
    fn interface_type_alias_use_distinct_merge_scope_helpers() {
        assert!(is_interface_or_type_alias_merge_scoped(
            SymbolKind::Interface
        ));
        assert!(is_interface_or_type_alias_merge_scoped(
            SymbolKind::TypeAlias
        ));
        assert!(!is_interface_or_type_alias_merge_scoped(SymbolKind::Class));
    }

    #[test]
    fn member_overload_mergeable_includes_member_signature_kinds() {
        assert!(is_member_overload_mergeable(SymbolKind::MethodSignature));
        assert!(is_member_overload_mergeable(SymbolKind::PropertySignature));
        assert!(is_member_overload_mergeable(SymbolKind::GetAccessor));
        assert!(is_member_overload_mergeable(SymbolKind::SetAccessor));
        assert!(!is_member_overload_mergeable(SymbolKind::Function));
        assert!(!is_member_overload_mergeable(SymbolKind::Variable));
        assert!(!is_member_overload_mergeable(SymbolKind::Class));
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
    fn parent_name_for_dotted_member_qualified_class_before_prototype() {
        assert_eq!(
            parent_name_for_dotted_member("OuterNS.InnerWidget.prototype.slot").as_deref(),
            Some("OuterNS.InnerWidget")
        );
    }

    #[test]
    fn parent_name_for_dotted_member_no_dot() {
        assert_eq!(parent_name_for_dotted_member("Foo"), None);
    }

    #[test]
    fn build_empty_package_graph() {
        let pkg_dir = fixture_dir("no-types-pkg");
        let info = PackageInfo {
            name: "no-types-pkg".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "no-types-pkg".into());
        assert_eq!(graph.version, "1.0.0".into());
        assert_eq!(graph.total_symbols, 0);
        assert_eq!(graph.total_files, 0);
    }

    #[test]
    fn build_graph_with_simple_exports() {
        let pkg_dir = fixture_dir("simple-export");
        let info = PackageInfo {
            name: "simple-export".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "simple-export".into());
        assert_eq!(graph.version, "1.0.0".into());
        assert!(graph.total_symbols >= 2);

        let init = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name == "init".into());
        assert!(init.is_some());
        let init = init.unwrap();
        assert_eq!(init.kind, SymbolKind::Function);
        assert!(init.id.starts_with("simple-export@1.0.0::"));

        let config = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name == "Config".into());
        assert!(config.is_some());
        assert_eq!(config.unwrap().kind, SymbolKind::Interface);
    }

    #[test]
    fn resolves_import_type_members_from_fallback_packages_with_export_equals_namespace() {
        let pkg_dir = fixture_dir("types-fallback-export-equals-namespace");
        let info = PackageInfo {
            name: "types-fallback-export-equals-namespace".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let query_wrapper = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name.as_ref() == "QueryWrapper")
            .expect("QueryWrapper symbol");
        let send_wrapper = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name.as_ref() == "SendWrapper")
            .expect("SendWrapper symbol");

        assert!(
            query_wrapper
                .dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().starts_with("npm::")),
            "QueryWrapper should resolve ParseShape in-graph: {:?}",
            query_wrapper.dependencies
        );
        assert!(
            send_wrapper
                .dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().starts_with("npm::")),
            "SendWrapper should resolve TransferOptions in-graph: {:?}",
            send_wrapper.dependencies
        );
        assert!(
            query_wrapper
                .dependencies
                .iter()
                .any(|dependency_id| dependency_id.as_ref().contains("ParseShape"))
        );
        assert!(
            send_wrapper
                .dependencies
                .iter()
                .any(|dependency_id| dependency_id.as_ref().contains("TransferOptions"))
        );
    }

    #[test]
    fn namespace_surface_dependencies_roll_up_direct_member_semantics() {
        let pkg_dir = fixture_dir("interface-wrapper-generic-default-deps");
        let info = PackageInfo {
            name: "interface-wrapper-generic-default-deps".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let wrapper_namespace = graph
            .symbols
            .iter()
            .find(|symbol| {
                symbol.name.as_ref() == "wrapper" && matches!(symbol.kind, SymbolKind::Namespace)
            })
            .expect("wrapper namespace symbol");

        assert!(
            wrapper_namespace.dependencies.is_empty(),
            "wrapper direct dependencies should stay semantic-only: {:?}",
            wrapper_namespace.dependencies
        );
        assert!(
            wrapper_namespace
                .surface_dependencies
                .iter()
                .any(|dependency_id| dependency_id.as_ref().contains("core.Handler")),
            "wrapper surface dependencies should include core.Handler refs: {:?}",
            wrapper_namespace.surface_dependencies
        );
        assert!(
            wrapper_namespace
                .surface_dependencies
                .iter()
                .any(|dependency_id| dependency_id.as_ref().contains("core.ParamsShape")),
            "wrapper surface dependencies should include core.ParamsShape refs: {:?}",
            wrapper_namespace.surface_dependencies
        );
        assert!(
            wrapper_namespace
                .surface_dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().ends_with("::wrapper.Handler")),
            "wrapper surface dependencies must exclude containment ids: {:?}",
            wrapper_namespace.surface_dependencies
        );
    }

    #[test]
    fn graph_keeps_concrete_intersections_and_filters_placeholder_indexed_access() {
        let pkg_dir = fixture_dir("generic-intersection-placeholder-filtering");
        let info = PackageInfo {
            name: "generic-intersection-placeholder-filtering"
                .to_string()
                .into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let carrier = graph
            .symbols
            .iter()
            .find(|symbol| symbol.name.as_ref() == "Carrier")
            .expect("Carrier symbol");

        assert!(
            carrier.dependencies.iter().any(|dependency_id| {
                dependency_id.as_ref()
                    == "generic-intersection-placeholder-filtering@1.0.0::ConcreteLeft"
            }),
            "Carrier should include ConcreteLeft dependency: {:?}",
            carrier.dependencies
        );
        assert!(
            carrier.dependencies.iter().any(|dependency_id| {
                dependency_id.as_ref()
                    == "generic-intersection-placeholder-filtering@1.0.0::ConcreteRight"
            }),
            "Carrier should include ConcreteRight dependency: {:?}",
            carrier.dependencies
        );
        assert!(
            carrier.dependencies.iter().any(|dependency_id| {
                dependency_id.as_ref() == "generic-intersection-placeholder-filtering@1.0.0::Slot"
            }),
            "Carrier should include Slot dependency: {:?}",
            carrier.dependencies
        );
        assert!(
            carrier
                .dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().ends_with("::GenericParam")),
            "Carrier must not include generic placeholder deps: {:?}",
            carrier.dependencies
        );
        assert!(
            carrier
                .dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().ends_with("::GenericParam.field")),
            "Carrier must not include placeholder-derived indexed access deps: {:?}",
            carrier.dependencies
        );
    }

    #[test]
    fn dependency_stub_roots_short_circuits_listed_packages_to_npm_stub_edges() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join("dependency-stub-packages");
        let info = PackageInfo {
            name: "stub-root-pkg".into(),
            version: "1.0.0".into(),
            dir: normalize_path(&fixture),
            is_scoped: false,
        };

        let graph_plain = build_package_graph(&info, None);
        let combined_plain = graph_plain
            .symbols
            .iter()
            .find(|symbol| symbol.name.as_ref() == "combined")
            .expect("combined symbol");

        let mut stub_roots = HashSet::new();
        stub_roots.insert("@stub-listed/core".to_string());
        let graph_stubbed = build_package_graph(
            &info,
            Some(CrawlOptions {
                dependency_stub_roots: Arc::new(stub_roots),
                ..Default::default()
            }),
        );
        let combined_stubbed = graph_stubbed
            .symbols
            .iter()
            .find(|symbol| symbol.name.as_ref() == "combined")
            .expect("combined symbol");

        assert!(
            combined_plain
                .dependencies
                .iter()
                .all(|dependency_id| !dependency_id.as_ref().starts_with("npm::@stub-listed")),
            "without stub list, listed-dep should resolve in-graph"
        );
        assert!(
            combined_stubbed.dependencies.iter().any(|dependency_id| {
                dependency_id.as_ref() == "npm::@stub-listed/core::ListedType"
            }),
            "with stub list, listed-dep should be npm stub"
        );
        assert!(
            combined_stubbed
                .dependencies
                .iter()
                .any(|dependency_id| { dependency_id.as_ref().contains("other-dep") }),
            "non-listed dependency still in-graph"
        );
        assert!(
            graph_stubbed
                .symbols
                .iter()
                .any(|symbol_node| { symbol_node.file_path.as_ref().contains("other-dep") }),
            "non-stubbed dependency files remain in the graph"
        );
        for symbol_node in &graph_stubbed.symbols {
            assert!(
                !symbol_node.file_path.as_ref().contains("@stub-listed"),
                "stub-listed package must not be crawled: {}",
                symbol_node.file_path.as_ref()
            );
        }
    }

    #[test]
    fn dependency_stub_self_exempt_allows_own_package_subpath_imports() {
        let pkg = fixture_dir("dependency-stub-self-exempt-unscoped");
        let info = PackageInfo {
            name: "self-stub-pkg".into(),
            version: "1.0.0".into(),
            dir: normalize_path(pkg.as_path()),
            is_scoped: false,
        };
        let mut stub_roots = HashSet::new();
        stub_roots.insert("self-stub-pkg".to_string());
        let graph = build_package_graph(
            &info,
            Some(CrawlOptions {
                dependency_stub_roots: Arc::new(stub_roots),
                ..Default::default()
            }),
        );
        let inner_symbol = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "Inner")
            .expect("Inner should be crawled when self-exempt matches package name");
        assert!(
            inner_symbol.file_path.as_ref().contains("inner"),
            "Inner should be defined in inner.d.ts, got {}",
            inner_symbol.file_path.as_ref()
        );
        assert!(
            graph.total_files >= 2,
            "expected index + inner on disk, total_files={}",
            graph.total_files
        );
    }

    #[test]
    fn triple_slash_scope_rules_cover_script_merges_without_module_module_collapse() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join("triple-slash-scope-cases");
        let info = PackageInfo {
            name: "triple-slash-scope-cases".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(&fixture),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);

        let module_reach_rows: Vec<&SymbolNode> = graph
            .symbols
            .iter()
            .filter(|symbol_node| {
                symbol_node.name.as_ref() == "ModuleReachPair"
                    && symbol_node.kind == SymbolKind::Namespace
            })
            .collect();
        assert_eq!(
            module_reach_rows.len(),
            1,
            "module+module with triple-slash reachability should merge"
        );
        assert_eq!(
            module_reach_rows[0].file_path.as_ref(),
            "module-reach-core.d.ts"
        );
        assert!(
            module_reach_rows[0]
                .additional_files
                .as_ref()
                .map(|files| files
                    .iter()
                    .any(|file_path| file_path.as_ref() == "module-reach-extra.d.ts"))
                .unwrap_or(false),
            "merged module namespace should include module-reach-extra.d.ts"
        );
        let module_reach_parent_id = module_reach_rows[0].id.clone();
        let module_reach_core = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "ModuleReachPair.core")
            .expect("ModuleReachPair.core symbol should exist");
        let module_reach_extra = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "ModuleReachPair.extra")
            .expect("ModuleReachPair.extra symbol should exist");
        assert_eq!(
            module_reach_core.parent_symbol_id.as_ref(),
            Some(&module_reach_parent_id)
        );
        assert_eq!(
            module_reach_extra.parent_symbol_id.as_ref(),
            Some(&module_reach_parent_id)
        );

        let module_pair_rows: Vec<&SymbolNode> = graph
            .symbols
            .iter()
            .filter(|symbol_node| {
                symbol_node.name.as_ref() == "ModulePair"
                    && symbol_node.kind == SymbolKind::Namespace
            })
            .collect();
        assert_eq!(
            module_pair_rows.len(),
            2,
            "module+module should remain separate rows"
        );
        assert!(
            module_pair_rows
                .iter()
                .any(|symbol_node| symbol_node.file_path.as_ref() == "module-a.d.ts")
        );
        assert!(
            module_pair_rows
                .iter()
                .any(|symbol_node| symbol_node.file_path.as_ref() == "module-b.d.ts")
        );

        let mixed_scope_rows: Vec<&SymbolNode> = graph
            .symbols
            .iter()
            .filter(|symbol_node| {
                symbol_node.name.as_ref() == "MixedScope"
                    && symbol_node.kind == SymbolKind::Namespace
            })
            .collect();
        assert_eq!(
            mixed_scope_rows.len(),
            2,
            "module+script should remain as separate namespace rows"
        );

        let script_pair_rows: Vec<&SymbolNode> = graph
            .symbols
            .iter()
            .filter(|symbol_node| {
                symbol_node.name.as_ref() == "ScriptPair"
                    && symbol_node.kind == SymbolKind::Namespace
            })
            .collect();
        assert_eq!(
            script_pair_rows.len(),
            1,
            "script+script should merge by script component scope"
        );
        let script_pair_id = script_pair_rows[0].id.clone();
        let script_alpha = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "ScriptPair.alpha")
            .expect("ScriptPair.alpha symbol should exist");
        let script_beta = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "ScriptPair.beta")
            .expect("ScriptPair.beta symbol should exist");
        assert_eq!(
            script_alpha.parent_symbol_id.as_ref(),
            Some(&script_pair_id)
        );
        assert_eq!(script_beta.parent_symbol_id.as_ref(), Some(&script_pair_id));
    }

    #[test]
    fn parser_edge_case_emits_default_class_member_rows() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join("parser-edge-case");
        let info = PackageInfo {
            name: "parser-edge-case".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(&fixture),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);

        let default_class = graph
            .symbols
            .iter()
            .find(|symbol_node| {
                symbol_node.name.as_ref() == "default" && symbol_node.kind == SymbolKind::Class
            })
            .expect("default class symbol should exist");

        let default_key = graph
            .symbols
            .iter()
            .find(|symbol_node| symbol_node.name.as_ref() == "default.prototype.key")
            .expect("default.prototype.key should exist");

        assert_eq!(default_key.kind, SymbolKind::PropertyDeclaration);
        assert_eq!(
            default_key.parent_symbol_id.as_ref(),
            Some(&default_class.id)
        );
    }

    #[test]
    fn merged_declarations_produce_unique_synthetic_ids() {
        let pkg_dir = fixture_dir("multi-declaration-heritage");
        let info = PackageInfo {
            name: "multi-declaration-heritage".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        let all_ids: Vec<&str> = graph
            .symbols
            .iter()
            .map(|symbol| symbol.id.as_ref())
            .collect();
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
        let sources: Vec<&str> = shared_synthetics[0]
            .inherited_from_sources
            .iter()
            .map(|symbol_id| symbol_id.as_ref())
            .collect();
        assert_eq!(
            sources.len(),
            2,
            "Composite.shared should list both parent defs"
        );
        assert!(sources.iter().any(|id| id.contains("Trait.shared")));
        assert!(
            sources
                .iter()
                .any(|id| id.contains("Base.prototype.shared"))
        );
    }

    #[test]
    fn parent_symbol_id_fixture_covers_signatures_namespace_and_prototype() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join("member-property-extraction");
        let info = PackageInfo {
            name: "member-property-extraction".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(&fixture),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let find = |name: &str| {
            graph
                .symbols
                .iter()
                .find(|symbol| symbol.name.as_ref() == name)
                .unwrap_or_else(|| panic!("missing symbol {name:?}"))
        };

        let parser_services = find("ParserServices");
        let es_tree_map = find("ParserServices.esTreeNodeToTSNodeMap");
        assert_eq!(es_tree_map.kind, SymbolKind::PropertySignature);
        assert_eq!(
            es_tree_map
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(parser_services.id.as_ref())
        );

        let method_parent = find("MethodSigParent");
        let on_flush = find("MethodSigParent.onFlush");
        assert_eq!(on_flush.kind, SymbolKind::MethodSignature);
        assert_eq!(
            on_flush
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(method_parent.id.as_ref())
        );

        let caliper_ns = find("CaliperNS");
        let bench_opts = find("CaliperNS.BenchOpts");
        assert_eq!(
            bench_opts
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(caliper_ns.id.as_ref())
        );
        let label = find("CaliperNS.BenchOpts.label");
        let refresh = find("CaliperNS.BenchOpts.refresh");
        let snapshot_fn = find("CaliperNS.snapshot");
        assert_eq!(label.kind, SymbolKind::PropertySignature);
        assert_eq!(refresh.kind, SymbolKind::MethodSignature);
        assert_eq!(
            label.parent_symbol_id.as_ref().map(|value| value.as_ref()),
            Some(bench_opts.id.as_ref())
        );
        assert_eq!(
            refresh
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(bench_opts.id.as_ref())
        );
        assert_eq!(
            snapshot_fn
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(caliper_ns.id.as_ref())
        );

        let parser_options = find("ParserOptions");
        let debug_level = find("ParserOptions.prototype.debugLevel");
        let get_parser = find("ParserOptions.prototype.getParser");
        assert_eq!(
            debug_level
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(parser_options.id.as_ref())
        );
        assert_eq!(
            get_parser
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(parser_options.id.as_ref())
        );

        let outer_ns = find("OuterNS");
        let inner_widget = find("OuterNS.InnerWidget");
        assert_eq!(
            inner_widget
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(outer_ns.id.as_ref())
        );
        let slot = find("OuterNS.InnerWidget.prototype.slot");
        let mount = find("OuterNS.InnerWidget.prototype.mount");
        assert_eq!(
            slot.parent_symbol_id.as_ref().map(|value| value.as_ref()),
            Some(inner_widget.id.as_ref())
        );
        assert_eq!(
            mount.parent_symbol_id.as_ref().map(|value| value.as_ref()),
            Some(inner_widget.id.as_ref())
        );

        let bridge = find("BRIDGE_METHODS");
        let select = find("BRIDGE_METHODS.SELECT");
        let measure = find("BRIDGE_METHODS.MEASURE");
        assert_eq!(
            select.parent_symbol_id.as_ref().map(|value| value.as_ref()),
            Some(bridge.id.as_ref())
        );
        assert_eq!(
            measure
                .parent_symbol_id
                .as_ref()
                .map(|value| value.as_ref()),
            Some(bridge.id.as_ref())
        );
        assert!(bridge.parent_symbol_id.is_none());
    }

    /// Cross-package type alias RHS must produce at least one navigable edge (in-graph id or `npm::` stub).
    fn assert_dependency_targets_shimmed_type(
        symbol: &SymbolNode,
        node_modules_segment: &str,
        exported_type_name: &str,
        bare_specifier: &str,
    ) {
        assert!(
            !symbol.dependencies.is_empty(),
            "{}: dependencies must not be empty for a cross-package type reference",
            symbol.name
        );
        let stub_edge = format!("npm::{bare_specifier}::{exported_type_name}");
        let found = symbol.dependencies.iter().any(|edge| {
            let edge_str = edge.as_ref();
            edge_str == stub_edge.as_str()
                || (edge_str.contains(node_modules_segment)
                    && edge_str.ends_with(format!("::{exported_type_name}").as_str()))
        });
        assert!(
            found,
            "{}: expected edge to {} from `{}` (stub `{}` or in-graph path containing `{}`); got {:?}",
            symbol.name,
            exported_type_name,
            bare_specifier,
            stub_edge,
            node_modules_segment,
            symbol.dependencies
        );
    }

    #[test]
    fn cross_package_type_alias_rhs_resolves_dependency_edge() {
        let pkg_dir = fixture_dir("cross-package-type-alias-rhs");
        let info = PackageInfo {
            name: "cross-package-type-alias-rhs".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let alias_symbol = graph
            .symbols
            .iter()
            .find(|symbol_node| {
                symbol_node.name.as_ref() == "ReExportedAlias"
                    && symbol_node.kind == SymbolKind::TypeAlias
            })
            .expect("ReExportedAlias type alias");
        assert_dependency_targets_shimmed_type(
            alias_symbol,
            "external-type-shim",
            "ExternalTypeShape",
            "external-type-shim",
        );
    }

    #[test]
    fn cross_package_interface_extends_resolves_base_type_edge() {
        let pkg_dir = fixture_dir("cross-package-interface-extends");
        let info = PackageInfo {
            name: "cross-package-interface-extends".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let extended = graph
            .symbols
            .iter()
            .find(|symbol_node| {
                symbol_node.name.as_ref() == "ExtendedOptions"
                    && symbol_node.kind == SymbolKind::Interface
            })
            .expect("ExtendedOptions interface");
        assert_dependency_targets_shimmed_type(
            extended,
            "external-options-shim",
            "BaseOptions",
            "external-options-shim",
        );
    }

    #[test]
    fn namespace_import_qualified_extends_resolves_base_interface() {
        let pkg_dir = fixture_dir("namespace-import-qualified-extends");
        let info = PackageInfo {
            name: "namespace-import-qualified-extends".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let root_contract = graph
            .symbols
            .iter()
            .find(|symbol_node| {
                symbol_node.name.as_ref() == "AppSurface.RootContract"
                    && symbol_node.kind == SymbolKind::Interface
            })
            .expect("AppSurface.RootContract interface");
        assert!(
            !root_contract.dependencies.is_empty(),
            "qualified extends must emit raw_dependencies resolved to ContainerContract; got {:?}",
            root_contract.dependencies
        );
        let targets_container = root_contract.dependencies.iter().any(|edge| {
            let edge_str = edge.as_ref();
            edge_str.contains("shared-contracts") && edge_str.ends_with("::ContainerContract")
        });
        assert!(
            targets_container,
            "expected dependency to shared-contracts ContainerContract; heritage={:?} deps={:?}",
            root_contract.heritage, root_contract.dependencies
        );
    }

    #[test]
    fn declare_namespace_emits_distinct_variable_and_interface_symbols() {
        let pkg_dir = fixture_dir("declare-namespace-variable-and-type");
        let info = PackageInfo {
            name: "declare-namespace-variable-and-type".to_string().into(),
            version: "1.0.0".to_string().into(),
            dir: normalize_path(pkg_dir.as_path()),
            is_scoped: false,
        };
        let graph = build_package_graph(&info, None);
        let variable_row = graph.symbols.iter().find(|symbol_node| {
            symbol_node.name.as_ref() == "AppSurface.primaryHandle"
                && symbol_node.kind == SymbolKind::Variable
        });
        let interface_row = graph.symbols.iter().find(|symbol_node| {
            symbol_node.name.as_ref() == "AppSurface.ControllerHandle"
                && symbol_node.kind == SymbolKind::Interface
        });
        assert!(
            variable_row.is_some(),
            "expected a Variable row for the namespace `var` binding; names: {:?}",
            graph
                .symbols
                .iter()
                .map(|symbol_node| symbol_node.name.as_ref())
                .collect::<Vec<_>>()
        );
        assert!(
            interface_row.is_some(),
            "expected an Interface row for the nested interface; names: {:?}",
            graph
                .symbols
                .iter()
                .map(|symbol_node| symbol_node.name.as_ref())
                .collect::<Vec<_>>()
        );
    }
}

#[cfg(test)]
#[test]
fn index_imports_by_local_name_keeps_first_binding_per_name() {
    let abs: SharedString = "/pkg/a.d.ts".into();
    let mut all_imports: HashMap<SharedString, Vec<ParsedImport>> = HashMap::new();
    all_imports.insert(
        abs.clone(),
        vec![
            ParsedImport {
                name: SharedString::from("Foo"),
                source: SharedString::from("./keep"),
                original_name: None,
                is_default: false,
                is_namespace: false,
            },
            ParsedImport {
                name: SharedString::from("Foo"),
                source: SharedString::from("./ignore"),
                original_name: None,
                is_default: false,
                is_namespace: false,
            },
        ],
    );
    let maps = index_imports_by_local_name(&all_imports);
    let by_name = maps.get(abs.as_ref()).expect("map for file");
    assert_eq!(by_name.get("Foo").unwrap().source.as_ref(), "./keep");
}

#[cfg(test)]
#[test]
fn dash_norm_abs_prefers_rel_to_abs_over_package_dir_join() {
    let cache = DashMap::new();
    let package_dir = "/workspace/pkg";
    let encoded: SharedString = "__nci_external__/other/types.d.ts".into();
    let crawl_absolute: SharedString = "/hoisted/other/types.d.ts".into();
    let mut rel_to_abs = HashMap::new();
    rel_to_abs.insert(encoded.clone(), crawl_absolute.clone());
    let normalized = dash_norm_abs(&cache, &encoded, package_dir, &rel_to_abs);
    assert_eq!(
        normalized.as_ref(),
        normalize_path(Path::new(crawl_absolute.as_ref())).as_ref()
    );
    let wrong_join = normalize_path(&Path::new(package_dir).join(encoded.as_ref()));
    assert_ne!(normalized.as_ref(), wrong_join.as_ref());
}
