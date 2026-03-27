
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::LazyLock;
use std::time::Instant;

use regex::Regex;

static PROTOCOL_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([a-z]+):(.*)$").unwrap());

use crate::constants::NODE_BUILTINS;
use crate::crawler::{crawl, CrawlOptions};
use crate::resolver::{resolve_module_specifier, resolve_types_entry};
use crate::types::{
    PackageEntry, PackageGraph, PackageInfo, SymbolKind, SymbolNode,
};

pub fn build_package_graph(
    package_info: &PackageInfo,
    crawl_options: Option<CrawlOptions>,
) -> PackageGraph {
    let start = Instant::now();

    let entry = resolve_types_entry(&package_info.dir).unwrap_or_else(|_| PackageEntry {
        name: package_info.name.clone(),
        dir_path: package_info.dir.clone(),
        types_entries: Vec::new(),
        subpaths: HashMap::new(),
    });

    if entry.types_entries.is_empty() {
        return PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: Vec::new(),
            total_symbols: 0,
            total_files: 0,
            crawl_duration_ms: start.elapsed().as_secs_f64() * 1000.0,
        };
    }

    let crawl_result = crawl(&entry.types_entries, crawl_options);
    let all_symbols = crawl_result.exports;
    let all_imports_per_file = crawl_result.imports;
    let visited: HashSet<String> = crawl_result.visited_files.into_iter().collect();

    let mut merged: Vec<(String, SymbolNode)> = Vec::new();
    let mut merge_index: HashMap<String, usize> = HashMap::new();
    let mut same_file_counters: HashMap<String, usize> = HashMap::new();
    let package_dir_str = package_info.dir.to_string_lossy().replace('\\', "/");

    for resolved in &all_symbols {
        let symbol_file_path = make_relative(&resolved.defined_in, &package_dir_str);
        let merge_key: String;

        if is_cross_file_mergeable(resolved.kind) {
            merge_key = resolved.name.clone();
        } else {
            let per_file_key = format!(
                "{}::{}::{}",
                resolved.name,
                resolved.kind.as_str(),
                symbol_file_path
            );
            let count = same_file_counters.entry(per_file_key.clone()).or_insert(0);
            *count += 1;
            merge_key = if *count == 1 {
                per_file_key
            } else {
                format!("{}#local{}", per_file_key, count)
            };
        }

        if let Some(&index) = merge_index.get(&merge_key) {
            let existing = &mut merged[index].1;

            if symbol_file_path != existing.file_path {
                let additional = existing.additional_files.get_or_insert_with(Vec::new);
                if !additional.contains(&symbol_file_path) {
                    additional.push(symbol_file_path.clone());
                }
            }

            if !resolved.dependencies.is_empty() {
                let mut existing_dep_keys: HashSet<String> = existing
                    .raw_dependencies
                    .iter()
                    .map(|dep| {
                        format!(
                            "{}::{}",
                            dep.name,
                            dep.import_path.as_deref().unwrap_or("")
                        )
                    })
                    .collect();

                for raw_dep in &resolved.dependencies {
                    let dep_key = format!(
                        "{}::{}",
                        raw_dep.name,
                        raw_dep.import_path.as_deref().unwrap_or("")
                    );
                    if existing_dep_keys.insert(dep_key) {
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
        } else {
            let re_export_source = resolved
                .re_export_chain
                .first()
                .map(|chain_start| make_relative(chain_start, &package_dir_str));

            let re_exported_from = match &re_export_source {
                Some(source) if source != &symbol_file_path => Some(source.clone()),
                _ => None,
            };

            let node = SymbolNode {
                id: String::new(),
                name: resolved.name.clone(),
                kind: resolved.kind,
                kind_name: resolved.kind.as_str().to_string(),
                package: package_info.name.clone(),
                file_path: symbol_file_path,
                additional_files: None,
                signature: resolved.signature.clone(),
                js_doc: resolved.js_doc.clone(),
                is_type_only: resolved.is_type_only,
                dependencies: Vec::new(),
                raw_dependencies: resolved.dependencies.clone(),
                re_exported_from: re_exported_from,
                deprecated: resolved.deprecated.clone(),
                visibility: resolved.visibility.clone(),
                since: resolved.since.clone(),
                is_internal: resolved.is_internal,
                decorators: resolved.decorators.clone(),
                is_inherited: None,
                inherited_from: None,
                heritage: resolved.heritage.clone(),
                modifiers: resolved.modifiers.clone(),
            };

            let index = merged.len();
            merge_index.insert(merge_key, index);
            merged.push((String::new(), node));
        }
    }

    let mut symbols: Vec<SymbolNode> = merged.into_iter().map(|(_, node)| node).collect();

    // Sort symbols by priority (Class/Variable/etc before Namespace) 
    // to ensure the base ID goes to the right declaration kind.
    symbols.sort_by(|node_a, node_b| {
        let priority_a = node_a.kind.priority();
        let priority_b = node_b.kind.priority();
        if priority_a != priority_b {
            priority_a.cmp(&priority_b)
        } else {
            node_a.name.cmp(&node_b.name)
        }
    });

    let mut name_to_id: HashMap<String, String> = HashMap::new();
    let mut file_local_to_id: HashMap<String, String> = HashMap::new();
    let mut name_count: HashMap<String, usize> = HashMap::new();

    for symbol_node in &mut symbols {
        let count = name_count.entry(symbol_node.name.clone()).or_insert(0);
        *count += 1;

        let base_id = format!(
            "{}@{}::{}",
            package_info.name, package_info.version, symbol_node.name
        );

        if symbol_node.is_internal {
            symbol_node.id = format!(
                "{}@{}::{}::{}",
                package_info.name, package_info.version, symbol_node.file_path, symbol_node.name
            );
        } else {
            symbol_node.id = if *count == 1 {
                base_id
            } else {
                format!(
                    "{}@{}::{}#{}",
                    package_info.name, package_info.version, symbol_node.name, count
                )
            };
        }

        file_local_to_id.insert(
            format!("{}::{}", symbol_node.file_path, symbol_node.name),
            symbol_node.id.clone(),
        );

        if !symbol_node.is_internal || !name_to_id.contains_key(&symbol_node.name) {
            name_to_id.insert(symbol_node.name.clone(), symbol_node.id.clone());
        }
    }

    let protocol_regex = &*PROTOCOL_REGEX;

    for symbol_node in &mut symbols {
        if symbol_node.raw_dependencies.is_empty() {
            continue;
        }

        let mut resolved_ids: HashSet<String> = HashSet::new();

        let raw_deps = symbol_node.raw_dependencies.clone();
        for raw_dep in &raw_deps {
            let mut target_id: Option<String> = None;

            if let Some(import_path) = &raw_dep.import_path {
                let abs_lookup = format!("{}/{}", package_dir_str, symbol_node.file_path);
                let abs_paths = resolve_module_specifier(import_path, &abs_lookup);
                if !abs_paths.is_empty() {
                    let rel_path = make_relative(&abs_paths[0], &package_dir_str);
                    target_id = file_local_to_id
                        .get(&format!("{}::{}", rel_path, raw_dep.name))
                        .cloned();
                }
            } else {
                target_id = file_local_to_id
                    .get(&format!("{}::{}", symbol_node.file_path, raw_dep.name))
                    .cloned();

                if target_id.is_none() {
                    let abs_path_for_lookup = format!(
                        "{}/{}",
                        package_dir_str, symbol_node.file_path
                    )
                    .replace('\\', "/");

                    if let Some(file_imports) = all_imports_per_file.get(&abs_path_for_lookup) {
                        if let Some(matching_import) =
                            file_imports.iter().find(|imported| imported.name == raw_dep.name)
                        {
                            let abs_source_paths = resolve_module_specifier(
                                &matching_import.source,
                                &format!("{}/{}", package_dir_str, symbol_node.file_path),
                            );
                            if !abs_source_paths.is_empty() {
                                let rel_source_path =
                                    make_relative(&abs_source_paths[0], &package_dir_str);
                                let original_name = matching_import
                                    .original_name
                                    .as_deref()
                                    .unwrap_or(&matching_import.name);
                                target_id = file_local_to_id
                                    .get(&format!("{}::{}", rel_source_path, original_name))
                                    .cloned();
                            }
                        }
                    }
                }

                if target_id.is_none() {
                    target_id = name_to_id.get(&raw_dep.name).cloned();
                }
            }

            if let Some(id) = target_id {
                resolved_ids.insert(id);
            } else {
                let import_path = raw_dep.import_path.as_deref();

                if let Some(path) = import_path {
                    if let Some(ext_id) = resolve_external_dep_id(path, &raw_dep.name, protocol_regex) {
                        resolved_ids.insert(ext_id);
                    }
                } else {
                    let abs_path_for_lookup = format!(
                        "{}/{}",
                        package_dir_str, symbol_node.file_path
                    )
                    .replace('\\', "/");

                    if let Some(file_imports) = all_imports_per_file.get(&abs_path_for_lookup) {
                        if let Some(matching_import) = file_imports
                            .iter()
                            .find(|imported| imported.name == raw_dep.name)
                        {
                            let original_name = matching_import
                                .original_name
                                .as_deref()
                                .unwrap_or(&matching_import.name);
                            if let Some(ext_id) = resolve_external_dep_id(
                                &matching_import.source, original_name, protocol_regex
                            ) {
                                resolved_ids.insert(ext_id);
                            }
                        }
                    }
                }
            }
        }

        symbol_node.dependencies = resolved_ids.into_iter().collect();
        symbol_node.raw_dependencies.clear();
    }

    flatten_inherited_members(
        &mut symbols,
        &name_to_id,
        &package_info.name,
        &package_info.version,
    );

    let total_symbols = symbols.len();
    let total_files = visited.len();

    PackageGraph {
        package: package_info.name.clone(),
        version: package_info.version.clone(),
        symbols,
        total_symbols,
        total_files,
        crawl_duration_ms: start.elapsed().as_secs_f64() * 1000.0,
    }
}

fn is_cross_file_mergeable(kind: SymbolKind) -> bool {
    matches!(
        kind,
        SymbolKind::Namespace | SymbolKind::Interface | SymbolKind::Enum
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
        let proto = caps.get(1).map_or("unknown", |m| m.as_str()).to_string();
        let src = caps
            .get(2)
            .map(|m| {
                let raw = m.as_str();
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

fn flatten_inherited_members(
    symbols: &mut Vec<SymbolNode>,
    name_to_id: &HashMap<String, String>,
    pkg_name: &str,
    pkg_version: &str,
) {
    let id_to_node: HashMap<String, &SymbolNode> =
        symbols.iter().map(|node| (node.id.clone(), node)).collect();

    let mut members_by_parent_name: HashMap<String, Vec<&SymbolNode>> = HashMap::new();

    for symbol_node in symbols.iter() {
        if let Some(dot_pos) = symbol_node.name.find('.') {
            let parent_name = if symbol_node.name.contains(".prototype.") {
                &symbol_node.name[..symbol_node.name.find(".prototype").unwrap()]
            } else {
                &symbol_node.name[..dot_pos]
            };
            members_by_parent_name
                .entry(parent_name.to_string())
                .or_default()
                .push(symbol_node);
        }
    }

    let mut synthetic: Vec<SymbolNode> = Vec::new();

    let heritage_work: Vec<(String, Vec<String>)> = symbols
        .iter()
        .filter(|node| {
            matches!(node.kind, SymbolKind::Class | SymbolKind::Interface) && !node.heritage.is_empty()
        })
        .map(|node| (node.name.clone(), node.heritage.clone()))
        .collect();

    for (node_name, heritage) in &heritage_work {
        let child_members = members_by_parent_name
            .get(node_name.as_str())
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
        let mut parents_to_visit: VecDeque<String> = heritage.iter().cloned().collect();

        while let Some(parent_name) = parents_to_visit.pop_front() {
            if !visited_parents.insert(parent_name.clone()) {
                continue;
            }

            let parent_id = match name_to_id.get(&parent_name) {
                Some(id) => id,
                None => continue,
            };

            if let Some(parent_node) = id_to_node.get(parent_id) {
                for grandparent in &parent_node.heritage {
                    parents_to_visit.push_back(grandparent.clone());
                }
            }

            let parent_members = members_by_parent_name
                .get(&parent_name)
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

                if parent_member.is_internal {
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
                synth_node.id = synth_id;
                synth_node.name = new_member_name;
                synth_node.is_inherited = Some(true);
                synth_node.inherited_from = Some(parent_member.id.clone());
                synth_node.additional_files = None;

                synthetic.push(synth_node);
            }
        }
    }

    symbols.extend(synthetic);
}

fn make_relative(abs_path: &str, package_dir: &str) -> String {
    let normalized = abs_path.replace('\\', "/");
    let normalized_dir = package_dir.replace('\\', "/");

    if normalized.starts_with(&normalized_dir) {
        let rest = &normalized[normalized_dir.len()..];
        if rest.starts_with('/') {
            return rest[1..].to_string();
        }
        return rest.to_string();
    }

    let rel = pathdiff::diff_paths(abs_path, package_dir)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| normalized);
    rel
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn make_relative_strips_prefix() {
        assert_eq!(
            make_relative("/pkg/src/index.d.ts", "/pkg"),
            "src/index.d.ts"
        );
    }

    #[test]
    fn make_relative_handles_windows_paths() {
        assert_eq!(
            make_relative("C:\\pkg\\src\\index.d.ts", "C:\\pkg"),
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
    fn build_empty_package_graph() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let pkg_dir = temp_dir.path().to_path_buf();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "empty-pkg", "version": "1.0.0"}"#,
        )
        .unwrap();

        let info = PackageInfo {
            name: "empty-pkg".to_string(),
            version: "1.0.0".to_string(),
            dir: pkg_dir,
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "empty-pkg");
        assert_eq!(graph.version, "1.0.0");
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
            name: "test-pkg".to_string(),
            version: "2.0.0".to_string(),
            dir: pkg_dir,
            is_scoped: false,
        };

        let graph = build_package_graph(&info, None);

        assert_eq!(graph.package, "test-pkg");
        assert_eq!(graph.version, "2.0.0");
        assert!(graph.total_symbols >= 2);

        let greet = graph.symbols.iter().find(|s| s.name == "greet");
        assert!(greet.is_some());
        let greet = greet.unwrap();
        assert_eq!(greet.kind, SymbolKind::Function);
        assert!(greet.id.starts_with("test-pkg@2.0.0::"));

        let config = graph.symbols.iter().find(|s| s.name == "Config");
        assert!(config.is_some());
        assert_eq!(config.unwrap().kind, SymbolKind::Interface);
    }
}
