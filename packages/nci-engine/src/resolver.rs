use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use dashmap::DashMap;
use regex::Regex;

static VERSION_RANGE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$").unwrap());

static JS_EXT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.(js|mjs|cjs)$").unwrap());

use crate::constants::NODE_BUILTINS;
use crate::types::{PackageEntry, SharedString};

thread_local! {
    /// Reused for [`specifier_is_dependency_stub`] so hot paths do not allocate per lookup.
    static STUB_ROOT_MATCH_SCRATCH: RefCell<String> = const { RefCell::new(String::new()) };
}

fn push_lower_ascii_package_segment(dest: &mut String, segment: &str) {
    dest.reserve(segment.len());
    for character in segment.chars() {
        dest.push(character.to_ascii_lowercase());
    }
}

/// Writes the normalized npm root (lowercase) into `dest`.
fn try_write_npm_package_root_lowercase(specifier: &str, dest: &mut String) -> bool {
    dest.clear();
    let trimmed = specifier.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.starts_with('.') {
        return false;
    }
    if trimmed.starts_with('/') {
        return false;
    }
    let spec_bytes = trimmed.as_bytes();
    if spec_bytes.len() >= 3
        && spec_bytes[0].is_ascii_alphabetic()
        && spec_bytes[1] == b':'
        && (spec_bytes[2] == b'/' || spec_bytes[2] == b'\\')
    {
        return false;
    }
    if trimmed.get(..5).is_some_and(|prefix| {
        prefix.eq_ignore_ascii_case("node:") || prefix.eq_ignore_ascii_case("file:")
    }) {
        return false;
    }
    if trimmed.contains("://") {
        return false;
    }
    if spec_bytes.len() >= 2 && spec_bytes[0].is_ascii_alphabetic() && spec_bytes[1] == b':' {
        return false;
    }

    if let Some(after_at) = trimmed.strip_prefix('@') {
        let Some(scope_delim) = after_at.find('/') else {
            return false;
        };
        if scope_delim == 0 || scope_delim + 1 >= after_at.len() {
            return false;
        }
        let scope_segment = &after_at[..scope_delim];
        let after_scope = &after_at[scope_delim + 1..];
        let package_name_end = after_scope.find(['/', '\\']).unwrap_or(after_scope.len());
        if package_name_end == 0 {
            return false;
        }
        let package_name_segment = &after_scope[..package_name_end];
        dest.push('@');
        push_lower_ascii_package_segment(dest, scope_segment);
        dest.push('/');
        push_lower_ascii_package_segment(dest, package_name_segment);
        return true;
    }

    let root_end = trimmed.find(['/', '\\']).unwrap_or(trimmed.len());
    if root_end == 0 {
        return false;
    }
    let first_segment = &trimmed[..root_end];
    push_lower_ascii_package_segment(dest, first_segment);
    true
}

/// Normalized npm package root for `dependency_stub_packages` matching (`npm_package_root` on a bare name or specifier).
///
/// Returns `None` for relative specifiers, `node:`, URLs, Windows paths, and other non-npm-package patterns.
pub fn npm_package_root(specifier: &str) -> Option<String> {
    let mut buffer = String::new();
    try_write_npm_package_root_lowercase(specifier, &mut buffer).then_some(buffer)
}

/// `true` when `specifier` is a bare package-style module id whose normalized root is in `stub_roots`.
#[inline]
pub fn specifier_is_dependency_stub(
    specifier: &str,
    stub_roots: &HashSet<String>,
    self_stub_exempt_root: Option<&str>,
) -> bool {
    if stub_roots.is_empty() {
        return false;
    }
    STUB_ROOT_MATCH_SCRATCH.with(|scratch_cell| {
        let scratch = &mut *scratch_cell.borrow_mut();
        if !try_write_npm_package_root_lowercase(specifier, scratch) {
            return false;
        }
        if let Some(exempt) = self_stub_exempt_root
            && scratch.as_str() == exempt
        {
            return false;
        }
        stub_roots.contains(scratch.as_str())
    })
}

/// Merge and normalize stub package roots from config / CLI (sorted, deduped) in one pass via [`BTreeSet`].
pub fn normalize_dependency_stub_list(
    entries: impl IntoIterator<Item = impl AsRef<str>>,
) -> Vec<String> {
    let mut roots: BTreeSet<String> = BTreeSet::new();
    let mut norm_buf = String::new();
    for entry in entries {
        let trimmed = entry.as_ref().trim();
        if trimmed.is_empty() {
            continue;
        }
        if try_write_npm_package_root_lowercase(trimmed, &mut norm_buf) {
            roots.insert(std::mem::take(&mut norm_buf));
            continue;
        }
        if trimmed.starts_with('@') {
            let segments: Vec<&str> = trimmed
                .split('/')
                .filter(|segment| !segment.is_empty())
                .collect();
            if segments.len() == 2 && segments[0].starts_with('@') {
                norm_buf.clear();
                norm_buf.push('@');
                push_lower_ascii_package_segment(
                    &mut norm_buf,
                    segments[0].get(1..).unwrap_or_default(),
                );
                norm_buf.push('/');
                push_lower_ascii_package_segment(&mut norm_buf, segments[1]);
                roots.insert(std::mem::take(&mut norm_buf));
            }
        } else {
            norm_buf.clear();
            push_lower_ascii_package_segment(&mut norm_buf, trimmed);
            roots.insert(std::mem::take(&mut norm_buf));
        }
    }
    roots.into_iter().collect()
}

#[derive(Debug, thiserror::Error)]
pub enum ResolveError {
    #[error("No package.json found at: {path}")]
    NoPkgJson { path: PathBuf },

    #[error("Failed to parse package.json: {source}")]
    ParseError {
        #[from]
        source: serde_json::Error,
    },

    #[error("IO error during resolution: {source}")]
    Io {
        #[from]
        source: std::io::Error,
    },
}

/// Builds [`PackageEntry`] from an already-parsed `package.json` value (avoids re-reading the file).
pub fn package_entry_from_parsed_pkg(
    package_dir: &Path,
    parsed_pkg: &serde_json::Value,
) -> Result<PackageEntry, ResolveError> {
    let basename = package_dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    let name = SharedString::from(
        parsed_pkg["name"]
            .as_str()
            .unwrap_or_else(|| basename.as_ref()),
    );
    let _version = SharedString::from(parsed_pkg["version"].as_str().unwrap_or("0.0.0"));

    // Priority: exports -> typesVersions -> types -> typings -> index.d.ts fallback
    let mut types_entries: Vec<SharedString> = Vec::new();
    let mut subpaths: HashMap<SharedString, SharedString> = HashMap::new();

    if let Some(exports) = parsed_pkg.get("exports") {
        let resolved = resolve_all_exports(package_dir, exports, &mut subpaths);
        types_entries.extend(resolved);
    }

    let should_resolve_root_fallbacks = types_entries.is_empty() || !subpaths.contains_key(".");

    if should_resolve_root_fallbacks
        && let Some(types_versions) = parsed_pkg.get("typesVersions")
        && let Some(resolved) = resolve_types_versions(package_dir, types_versions)
    {
        if !types_entries
            .iter()
            .any(|entry_path| entry_path == &resolved)
        {
            types_entries.push(resolved.clone());
        }
        subpaths.insert(".".into(), resolved);
    }

    if (types_entries.is_empty() || !subpaths.contains_key("."))
        && let Some(types_value) = parsed_pkg["types"].as_str()
        && let Some(resolved) = resolve_file(package_dir, types_value)
    {
        if !types_entries
            .iter()
            .any(|entry_path| entry_path == &resolved)
        {
            types_entries.push(resolved.clone());
        }
        subpaths.insert(".".into(), resolved);
    }

    if (types_entries.is_empty() || !subpaths.contains_key("."))
        && let Some(typings_value) = parsed_pkg["typings"].as_str()
        && let Some(resolved) = resolve_file(package_dir, typings_value)
    {
        if !types_entries
            .iter()
            .any(|entry_path| entry_path == &resolved)
        {
            types_entries.push(resolved.clone());
        }
        subpaths.insert(".".into(), resolved);
    }

    if types_entries.is_empty() {
        let fallback_path = package_dir.join("index.d.ts");
        if fallback_path.is_file() {
            let normalized = normalize_path(&fallback_path);
            subpaths.insert(".".into(), normalized.clone());
            types_entries.push(normalized);
        }
    }

    types_entries.sort();
    types_entries.dedup();

    Ok(PackageEntry {
        name,
        dir_path: normalize_path(package_dir),
        types_entries,
        subpaths,
    })
}

pub fn resolve_types_entry(package_dir: &Path) -> Result<PackageEntry, ResolveError> {
    let pkg_json_path = package_dir.join("package.json");

    let parsed_pkg: serde_json::Value = if pkg_json_path.exists() {
        let raw_contents = fs::read_to_string(&pkg_json_path)?;
        serde_json::from_str(&raw_contents)?
    } else {
        serde_json::Value::Object(serde_json::Map::new())
    };

    package_entry_from_parsed_pkg(package_dir, &parsed_pkg)
}

pub fn resolve_module_specifier(specifier: &str, current_file: &str) -> Vec<SharedString> {
    if (specifier.contains(':') || NODE_BUILTINS.contains(specifier)) && !specifier.starts_with('.')
    {
        return vec![SharedString::from(specifier)];
    }

    if specifier.starts_with('.') {
        return resolve_relative_specifier(specifier, current_file);
    }

    resolve_package_entry(specifier, current_file)
}

/// Handles string maps, nested conditional objects, and wildcard expansion.
fn resolve_all_exports(
    package_dir: &Path,
    exports: &serde_json::Value,
    subpaths: &mut HashMap<SharedString, SharedString>,
) -> Vec<SharedString> {
    let mut entries: Vec<SharedString> = Vec::new();
    let mut seen_paths: HashSet<SharedString> = HashSet::new();

    match exports {
        serde_json::Value::String(export_string) => {
            if is_declaration_file(export_string)
                && let Some(resolved) = resolve_file(package_dir, export_string)
            {
                entries.push(resolved.clone());
                subpaths.entry(".".into()).or_insert(resolved);
            }
        }

        serde_json::Value::Object(exports_map) => {
            let has_subpaths = exports_map.keys().any(|key| key.starts_with('.'));

            if has_subpaths {
                for (subpath_key_str, subpath_value) in exports_map {
                    let subpath_key = SharedString::from(subpath_key_str.as_ref());
                    if !subpath_key.as_ref().starts_with('.') {
                        continue;
                    }
                    if subpath_key.as_ref() == "./package.json" {
                        continue;
                    }

                    if subpath_key.as_ref().contains('*') {
                        let wildcard_entries = expand_wildcard_subpath(package_dir, subpath_value);
                        for entry_path in wildcard_entries {
                            if seen_paths.insert(entry_path.clone()) {
                                entries.push(entry_path);
                            }
                        }
                        continue;
                    }

                    if let Some(resolved) = resolve_export_condition(package_dir, subpath_value) {
                        subpaths.insert(subpath_key, resolved.clone());
                        if seen_paths.insert(resolved.clone()) {
                            entries.push(resolved);
                        }
                    }
                }
            } else {
                if let Some(resolved) = resolve_export_condition(package_dir, exports) {
                    entries.push(resolved.clone());
                    subpaths.entry(".".into()).or_insert(resolved);
                }
            }
        }

        serde_json::Value::Array(export_array) => {
            for item in export_array {
                let resolved = resolve_all_exports(package_dir, item, subpaths);
                for resolved_path in resolved {
                    if seen_paths.insert(resolved_path.clone()) {
                        entries.push(resolved_path);
                    }
                }
            }
        }

        _ => {}
    }

    entries
}

fn resolve_export_condition(package_dir: &Path, entry: &serde_json::Value) -> Option<SharedString> {
    match entry {
        serde_json::Value::String(path_string) => {
            if is_declaration_file(path_string) {
                resolve_file(package_dir, path_string)
            } else {
                None
            }
        }

        serde_json::Value::Array(condition_array) => condition_array
            .iter()
            .find_map(|item| resolve_export_condition(package_dir, item)),

        serde_json::Value::Object(condition_map) => {
            // Priority order: types → import → require → node → default
            let condition_keys = ["types", "import", "require", "node", "default"];
            for key in &condition_keys {
                if let Some(value) = condition_map.get(*key)
                    && let Some(resolved) = resolve_export_condition(package_dir, value)
                {
                    return Some(resolved);
                }
            }
            None
        }

        _ => None,
    }
}

fn resolve_types_versions(
    package_dir: &Path,
    types_versions: &serde_json::Value,
) -> Option<SharedString> {
    let versions_map = types_versions.as_object()?;
    // We use a fixed TS version for matching — in practice this is always satisfied
    // by the common ">= 5.0" pattern used by most packages.
    let current_ts_version = "5.7.0";

    for (version_range, path_map_value) in versions_map {
        if !matches_version_range(current_ts_version, version_range) {
            continue;
        }

        let path_map = match path_map_value.as_object() {
            Some(map) => map,
            None => continue,
        };

        if let Some(dot_paths) = path_map.get(".")
            && let Some(dot_candidates) = dot_paths.as_array()
        {
            for dot_candidate in dot_candidates {
                if let Some(path_str) = dot_candidate.as_str()
                    && let Some(resolved) = resolve_file(package_dir, path_str)
                {
                    return Some(resolved);
                }
            }
        }

        if let Some(wildcard_paths) = path_map.get("*")
            && let Some(wildcard_candidates) = wildcard_paths.as_array()
        {
            for wildcard_candidate in wildcard_candidates {
                if let Some(pattern_str) = wildcard_candidate.as_str() {
                    let redirect_path = pattern_str.replace('*', "index");
                    if let Some(resolved) = resolve_file(package_dir, &redirect_path) {
                        return Some(resolved);
                    }
                    if !is_declaration_file(&redirect_path) {
                        let with_dts = format!("{redirect_path}.d.ts");
                        if let Some(resolved) = resolve_file(package_dir, &with_dts) {
                            return Some(resolved);
                        }
                        let with_dmts = format!("{redirect_path}.d.mts");
                        if let Some(resolved) = resolve_file(package_dir, &with_dmts) {
                            return Some(resolved);
                        }
                        let with_dcts = format!("{redirect_path}.d.cts");
                        if let Some(resolved) = resolve_file(package_dir, &with_dcts) {
                            return Some(resolved);
                        }
                    }
                }
            }
        }
    }

    None
}

fn matches_version_range(version: &str, range: &str) -> bool {
    let range_regex = &*VERSION_RANGE_REGEX;

    let range_captures = match range_regex.captures(range) {
        Some(captures) => captures,
        None => return false,
    };

    let required_major: u32 = range_captures[1].parse().unwrap_or(0);
    let required_minor: u32 = range_captures[2].parse().unwrap_or(0);

    let current_major: u32 = version
        .split('.')
        .next()
        .and_then(|segment| segment.parse().ok())
        .unwrap_or(0);
    let current_minor: u32 = version
        .split('.')
        .nth(1)
        .and_then(|segment| segment.parse().ok())
        .unwrap_or(0);

    if current_major > required_major {
        return true;
    }
    current_major == required_major && current_minor >= required_minor
}

fn expand_wildcard_subpath(package_dir: &Path, value: &serde_json::Value) -> Vec<SharedString> {
    let pattern = match extract_wildcard_pattern(value) {
        Some(pattern_str) if pattern_str.contains('*') => pattern_str,
        _ => return Vec::new(),
    };

    let first_star_index = match pattern.find('*') {
        Some(index) => index,
        None => return Vec::new(),
    };

    let before_first_star = &pattern[..first_star_index];
    let last_slash_before_star = before_first_star.rfind('/');

    let dir_part = if let Some(idx) = last_slash_before_star {
        &before_first_star[..idx]
    } else {
        "."
    };

    let scan_directory = package_dir.join(dir_part.trim_start_matches("./"));
    if !scan_directory.exists() {
        return vec![];
    }

    let glob_regex = glob_to_regexp(&pattern);
    let mut matching_entries: Vec<SharedString> = Vec::new();
    collect_wildcard_declaration_files(
        package_dir,
        &scan_directory,
        &glob_regex,
        &mut matching_entries,
    );

    // read_dir order is platform-dependent; stable sort keeps crawl + symbol id suffixes consistent in CI.
    matching_entries.sort_by(|left, right| left.as_ref().cmp(right.as_ref()));
    matching_entries
}

fn collect_wildcard_declaration_files(
    package_dir: &Path,
    scan_directory: &Path,
    glob_regex: &Regex,
    out: &mut Vec<SharedString>,
) {
    let entries = match fs::read_dir(scan_directory) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_wildcard_declaration_files(package_dir, &entry_path, glob_regex, out);
            continue;
        }

        if !is_declaration_file_path(&entry_path) {
            continue;
        }

        let relative_to_package = match entry_path.strip_prefix(package_dir) {
            Ok(relative) => relative.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        let normalized_relative = if relative_to_package.starts_with("./") {
            relative_to_package.clone()
        } else {
            format!("./{}", relative_to_package)
        };

        if glob_regex.is_match(&normalized_relative) || glob_regex.is_match(&relative_to_package) {
            out.push(normalize_path(&entry_path));
        }
    }
}

fn extract_wildcard_pattern(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(string_value) => Some(string_value.clone()),
        serde_json::Value::Array(items) => items.iter().find_map(extract_wildcard_pattern),

        serde_json::Value::Object(condition_map) => {
            let priority_keys = ["types", "import", "require", "default"];
            for key in &priority_keys {
                if let Some(nested_value) = condition_map.get(*key)
                    && let Some(result) = extract_wildcard_pattern(nested_value)
                {
                    return Some(result);
                }
            }
            None
        }

        _ => None,
    }
}

/// Converts a glob-style pattern (e.g., `"dist/*.d.ts"`) into a compiled `Regex`.
fn glob_to_regexp(pattern: &str) -> Regex {
    let escaped = regex::escape(pattern);
    let regex_str = escaped.replace(r"\*", "([^/]+)");
    Regex::new(&format!("^{}$", regex_str)).unwrap()
}

/// Resolves a relative specifier (e.g., `"./foo"`, `"../bar"`) to `.d.ts` files.
fn resolve_relative_specifier(specifier: &str, current_file: &str) -> Vec<SharedString> {
    let current_dir = Path::new(current_file)
        .parent()
        .unwrap_or_else(|| Path::new("."));

    // Try JS extension replacement (.js → .d.ts, .mjs → .d.mts, .cjs → .d.cts)
    let js_ext_regex = &*JS_EXT_REGEX;

    if let Some(ext_match) = js_ext_regex.find(specifier) {
        let base = &specifier[..ext_match.start()];
        let matched_ext = ext_match.as_str();

        // Try .d.ts replacement
        let dts_path = current_dir.join(format!("{}.d.ts", base));
        if is_file_safe(&dts_path) {
            return vec![normalize_path(&dts_path)];
        }

        // Try module-specific replacements
        if matched_ext == ".mjs" {
            let dmts_path = current_dir.join(format!("{}.d.mts", base));
            if is_file_safe(&dmts_path) {
                return vec![normalize_path(&dmts_path)];
            }
        }
        if matched_ext == ".cjs" {
            let dcts_path = current_dir.join(format!("{}.d.cts", base));
            if is_file_safe(&dcts_path) {
                return vec![normalize_path(&dcts_path)];
            }
        }

        // Try index.d.ts fallback
        let index_path = current_dir.join(base).join("index.d.ts");
        if is_file_safe(&index_path) {
            return vec![normalize_path(&index_path)];
        }
    }

    // Try appending .d.ts
    let with_dts = current_dir.join(format!("{}.d.ts", specifier));
    if is_file_safe(&with_dts) {
        return vec![normalize_path(&with_dts)];
    }

    // Try as-is (already ends in .d.ts or similar)
    let as_is = current_dir.join(specifier);
    if is_file_safe(&as_is) {
        return vec![normalize_path(&as_is)];
    }

    // Try directory/index.d.ts
    let index_fallback = current_dir.join(specifier).join("index.d.ts");
    if is_file_safe(&index_fallback) {
        return vec![normalize_path(&index_fallback)];
    }
    vec![]
}

/// Resolves a package-level entry point from `node_modules`.
fn resolve_package_entry(specifier: &str, current_file: &str) -> Vec<SharedString> {
    let parts: Vec<&str> = specifier.split('/').collect();
    let (package_name, subpath);

    if parts[0].starts_with('@') && parts.len() >= 2 {
        package_name = format!("{}/{}", parts[0], parts[1]);
        subpath = if parts.len() > 2 {
            format!("./{}", parts[2..].join("/"))
        } else {
            ".".to_string()
        };
    } else {
        package_name = parts[0].to_string();
        subpath = if parts.len() > 1 {
            format!("./{}", parts[1..].join("/"))
        } else {
            ".".to_string()
        };
    }

    let current_dir = Path::new(current_file)
        .parent()
        .unwrap_or_else(|| Path::new("."));

    let mut pkg_dir = find_package_dir(&package_name, current_dir);
    if pkg_dir.is_none() && !package_name.starts_with('@') {
        let types_fallback_name = format!("@types/{package_name}");
        pkg_dir = find_package_dir(&types_fallback_name, current_dir);
    }
    let mut pkg_dir = match pkg_dir {
        Some(dir) => dir,
        None => return vec![],
    };

    let pkg_json_path = pkg_dir.join("package.json");
    if !pkg_json_path.exists() {
        return vec![];
    }

    let raw_contents = match fs::read_to_string(&pkg_json_path) {
        Ok(contents) => contents,
        Err(_) => return vec![],
    };
    let mut parsed_pkg: serde_json::Value = match serde_json::from_str(&raw_contents) {
        Ok(parsed) => parsed,
        Err(_) => return vec![],
    };

    let mut pkg_entry = match package_entry_from_parsed_pkg(&pkg_dir, &parsed_pkg) {
        Ok(entry) => entry,
        Err(_) => return vec![],
    };

    // Unscoped install: if `package.json` exposes no declaration entry points, try the matching DefinitelyTyped package.
    if !package_name.starts_with('@') && pkg_entry.types_entries.is_empty() {
        if let Some(types_pkg_dir) = find_package_dir(&format!("@types/{package_name}"), current_dir)
        {
            let alt_json = types_pkg_dir.join("package.json");
            if alt_json.exists() {
                if let Ok(raw_alt) = fs::read_to_string(&alt_json) {
                    if let Ok(parsed_alt) = serde_json::from_str::<serde_json::Value>(&raw_alt) {
                        if let Ok(entry_alt) =
                            package_entry_from_parsed_pkg(&types_pkg_dir, &parsed_alt)
                            && !entry_alt.types_entries.is_empty()
                        {
                            pkg_dir = types_pkg_dir;
                            parsed_pkg = parsed_alt;
                            pkg_entry = entry_alt;
                        }
                    }
                }
            }
        }
    }

    if subpath == "." {
        return pkg_entry.types_entries;
    }

    // Check mapped subpaths
    if let Some(mapped_path) = pkg_entry.subpaths.get(subpath.as_ref() as &str) {
        let entries: Vec<SharedString> = vec![mapped_path.clone()];
        return entries;
    }

    // Try wildcard matching against exports
    if let Some(exports) = parsed_pkg.get("exports")
        && let Some(wildcard_matched) = match_wildcard_subpath(&subpath, exports)
        && let Some(resolved) = resolve_export_condition(&pkg_dir, &wildcard_matched)
    {
        return vec![resolved];
    }

    // Direct file resolution fallback
    let subpath_normalized = if subpath.starts_with("./") {
        subpath.clone()
    } else {
        format!("./{}", subpath)
    };

    if let Some(resolved) = resolve_file(&pkg_dir, &subpath_normalized) {
        return vec![resolved];
    }

    let with_dts = format!("{}.d.ts", subpath_normalized);
    if let Some(resolved) = resolve_file(&pkg_dir, &with_dts) {
        return vec![resolved];
    }

    // Directory-to-index fallback
    let index_fallback = pkg_dir.join(&subpath_normalized).join("index.d.ts");
    if index_fallback.exists() {
        return vec![normalize_path(&index_fallback)];
    }
    vec![]
}

/// Matches a target subpath against wildcard export patterns.
///
/// Performs replacement of capturing groups into the target path template.
fn match_wildcard_subpath(subpath: &str, exports: &serde_json::Value) -> Option<serde_json::Value> {
    let exports_map = exports.as_object()?;

    for (key, value) in exports_map {
        if !key.contains('*') || !key.starts_with('.') {
            continue;
        }

        let key_parts: Vec<&str> = key.splitn(2, '*').collect();
        if key_parts.len() != 2 {
            continue; // Spec limit: only a single wildcard per pattern
        }

        let prefix = key_parts[0];
        let suffix = key_parts[1];

        if subpath.starts_with(prefix) && subpath.ends_with(suffix) {
            let captured = &subpath[prefix.len()..subpath.len() - suffix.len()];
            return Some(replace_wildcard_in_value(value, captured));
        }
    }

    None
}

/// Recursively injects captured wildcard segments into template strings/objects.
fn replace_wildcard_in_value(value: &serde_json::Value, replacement: &str) -> serde_json::Value {
    match value {
        serde_json::Value::String(template) => {
            serde_json::Value::String(template.replace('*', replacement))
        }

        serde_json::Value::Array(items) => serde_json::Value::Array(
            items
                .iter()
                .map(|item| replace_wildcard_in_value(item, replacement))
                .collect(),
        ),

        serde_json::Value::Object(map) => {
            let mut result = serde_json::Map::new();
            for (key, nested_value) in map {
                result.insert(
                    key.clone(),
                    replace_wildcard_in_value(nested_value, replacement),
                );
            }
            serde_json::Value::Object(result)
        }

        other => other.clone(),
    }
}

/// Discovers a package's root directory by traversing upwards to the nearest `node_modules`.
fn find_package_dir(package_name: &str, start_dir: &Path) -> Option<PathBuf> {
    let mut current = match start_dir.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => start_dir.to_path_buf(),
    };

    loop {
        let potential = current.join("node_modules").join(package_name);
        if potential.exists() && potential.is_dir() {
            return Some(potential);
        }

        match current.parent() {
            Some(parent) if parent != current => {
                current = parent.to_path_buf();
            }
            _ => break,
        }
    }
    None
}

/// Resolves a relative file path against the package root and verifies existence.
pub fn resolve_triple_slash_ref(reference: &str, current_file: &str) -> Option<SharedString> {
    let current_dir = Path::new(current_file).parent()?;
    let ref_path = current_dir.join(reference);
    if is_file_safe(&ref_path) {
        Some(normalize_path(&ref_path))
    } else {
        None
    }
}

/// Resolves a relative file path against the package root and verifies existence.
fn resolve_file(package_dir: &Path, relative_path: &str) -> Option<SharedString> {
    let absolute_path = package_dir.join(relative_path);
    if is_file_safe(&absolute_path) {
        Some(normalize_path(&absolute_path))
    } else {
        None
    }
}

/// If a path is a regular file.
pub fn is_file_safe(file_path: &Path) -> bool {
    fs::metadata(file_path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}

fn normalize_path_from_canonical(canonical: &Path) -> SharedString {
    let path_string = canonical.to_string_lossy().to_string();

    // Strip Windows UNC prefix that canonicalize adds
    let stripped = path_string.strip_prefix(r"\\?\").unwrap_or(&path_string);

    stripped.replace('\\', "/").into()
}

/// Normalizes a file path to an absolute format with forward slash separators.
pub fn normalize_path(file_path: &Path) -> SharedString {
    let canonical = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.to_path_buf());
    normalize_path_from_canonical(&canonical)
}

/// Like [`normalize_path`], but reuses prior canonicalizations in `cache` (same `PathBuf` key).
pub fn normalize_path_with_cache(
    cache: &mut HashMap<PathBuf, SharedString>,
    file_path: &Path,
) -> SharedString {
    let canonical = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.to_path_buf());
    if let Some(cached) = cache.get(&canonical) {
        return cached.clone();
    }
    let result = normalize_path_from_canonical(&canonical);
    cache.insert(canonical, result.clone());
    result
}

/// Like [`normalize_path_with_cache`], but the cache is a [`DashMap`].
pub fn normalize_path_with_dashmap(
    cache: &DashMap<PathBuf, SharedString>,
    file_path: &Path,
) -> SharedString {
    let canonical = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.to_path_buf());
    if let Some(cached) = cache.get(&canonical) {
        return cached.clone();
    }
    let result = normalize_path_from_canonical(&canonical);
    cache.insert(canonical, result.clone());
    result
}

/// Checks if a path string ends with a `.d.ts` / `.d.mts` / `.d.cts` extension.
fn is_declaration_file(path_str: &str) -> bool {
    path_str.ends_with(".d.ts") || path_str.ends_with(".d.mts") || path_str.ends_with(".d.cts")
}

/// Checks if a `PathBuf` points to a declaration file.
fn is_declaration_file_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    is_declaration_file(&path_str)
}

/// Encodes `pathdiff` output when a file is outside the package root so `..` never appears in stored
/// paths (avoids agents misreading `../../` as a normal navigable path).
fn encode_outside_package_relative(relative_path: &str) -> String {
    let normalized = relative_path.replace('\\', "/");
    let mut rest = normalized.as_str();
    while rest.starts_with("./") {
        rest = rest.get(2..).unwrap_or("");
        rest = rest.trim_start_matches('/');
    }
    let mut up_count = 0usize;
    while rest.starts_with("../") {
        up_count += 1;
        rest = rest.get(3..).unwrap_or("");
    }
    if rest == ".." {
        up_count += 1;
        rest = "";
    }
    let tail = rest.trim_start_matches('/');
    let mut out = String::from("__nci_external__");
    for _ in 0..up_count {
        out.push_str("/__up__");
    }
    if !tail.is_empty() {
        out.push('/');
        out.push_str(tail);
    }
    out
}

/// `normalized_package_dir` must equal `package_dir.replace('\\', "/")` so prefix checks match `abs_path` normalization.
pub(crate) fn make_relative_to_package(
    abs_path: &str,
    package_dir: &str,
    normalized_package_dir: &str,
) -> String {
    let normalized = abs_path.replace('\\', "/");

    if let Some(rest) = normalized.strip_prefix(normalized_package_dir) {
        if let Some(no_slash) = rest.strip_prefix('/') {
            return no_slash.to_string();
        }
        return rest.to_string();
    }

    pathdiff::diff_paths(abs_path, package_dir)
        .map(|path| {
            let raw = path.to_string_lossy().replace('\\', "/");
            encode_outside_package_relative(&raw)
        })
        .unwrap_or_else(|| normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::Path;

    fn fixture_dir(fixture_name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join(fixture_name)
    }

    #[test]
    fn resolve_bare_package_subpath_from_nested_project() {
        let ws = fixture_dir("resolver-nested-node-modules").join("ws");
        let from_file = ws.join("pkg/dist/consumer.d.ts");

        let paths = resolve_module_specifier(
            "typescript/lib/tsserverlibrary",
            from_file.to_str().unwrap(),
        );
        assert!(
            paths.iter().any(|candidate_path| {
                let path_str = candidate_path.as_ref();
                path_str.contains("tsserverlibrary.d.ts") && Path::new(path_str).is_file()
            }),
            "got {:?}",
            paths
        );
    }

    #[test]
    fn version_range_matches_exact() {
        assert!(matches_version_range("5.0.0", ">=5.0"));
    }

    #[test]
    fn version_range_matches_higher_major() {
        assert!(matches_version_range("6.0.0", ">=5.0"));
    }

    #[test]
    fn version_range_matches_higher_minor() {
        assert!(matches_version_range("5.3.0", ">=5.0"));
    }

    #[test]
    fn version_range_rejects_lower() {
        assert!(!matches_version_range("4.9.0", ">=5.0"));
    }

    #[test]
    fn version_range_rejects_invalid_format() {
        assert!(!matches_version_range("5.0.0", "~5.0"));
    }

    #[test]
    fn detects_dts_extension() {
        assert!(is_declaration_file("index.d.ts"));
        assert!(is_declaration_file("./lib/core.d.ts"));
    }

    #[test]
    fn detects_dmts_and_dcts_extensions() {
        assert!(is_declaration_file("index.d.mts"));
        assert!(is_declaration_file("index.d.cts"));
    }

    #[test]
    fn rejects_non_declaration_files() {
        assert!(!is_declaration_file("index.ts"));
        assert!(!is_declaration_file("index.js"));
        assert!(!is_declaration_file("index.json"));
    }

    // ─── resolve_export_condition tests ────────────────────────

    #[test]
    fn resolve_export_condition_string_dts() {
        let fixture_path = fixture_dir("simple-export");
        let value = serde_json::json!("./index.d.ts");
        let result = resolve_export_condition(&fixture_path, &value);
        assert!(result.is_some());
    }

    #[test]
    fn resolve_export_condition_rejects_js() {
        let fixture_path = fixture_dir("simple-export");
        let value = serde_json::json!("./index.js");
        let result = resolve_export_condition(&fixture_path, &value);
        assert!(result.is_none());
    }

    #[test]
    fn resolve_export_condition_nested_types() {
        let fixture_path = fixture_dir("export-condition-nested-types");
        let value = serde_json::json!({
            "types": "./dist/index.d.ts",
            "import": "./dist/index.mjs",
            "default": "./dist/index.js"
        });

        let result = resolve_export_condition(&fixture_path, &value);
        assert!(result.is_some());
        assert!(result.unwrap().contains("index.d.ts"));
    }

    // ─── resolve_types_entry tests ─────────────────────────────

    #[test]
    fn resolve_types_entry_from_types_field() {
        let fixture_path = fixture_dir("simple-export");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        assert_eq!(entry.name, "simple-export".into());
        assert_eq!(entry.types_entries.len(), 1);
        assert!(entry.types_entries[0].contains("index.d.ts"));
    }

    #[test]
    fn resolve_types_entry_fallback_to_index_dts() {
        let fixture_path = fixture_dir("fallback-index-types");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        assert_eq!(entry.types_entries.len(), 1);
        assert!(entry.types_entries[0].contains("index.d.ts"));
    }

    #[test]
    fn resolve_types_entry_works_without_pkg_json() {
        let fixture_path = fixture_dir("no-package-json-dir");
        let result = resolve_types_entry(&fixture_path);
        assert!(result.is_ok());
        let entry = result.unwrap();
        assert_eq!(
            entry.name,
            SharedString::from(fixture_path.file_name().unwrap().to_string_lossy().as_ref())
        );
    }

    #[test]
    fn resolve_types_entry_includes_root_types_when_exports_only_lists_subpath() {
        let fixture_path = fixture_dir("exports-plus-types-root");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        assert_eq!(
            entry.types_entries.len(),
            2,
            "expected both root types and exports subpath entries"
        );
        assert!(entry.types_entries.iter().any(|entry_path| {
            entry_path
                .as_ref()
                .replace('\\', "/")
                .ends_with("index.d.ts")
        }));
        assert!(entry.types_entries.iter().any(|entry_path| {
            entry_path
                .as_ref()
                .replace('\\', "/")
                .ends_with("utils.d.ts")
        }));
    }

    #[test]
    fn resolve_types_entry_types_versions_tries_later_dot_candidates() {
        let fixture_path = fixture_dir("types-versions-multi-candidate");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        assert_eq!(entry.types_entries.len(), 1);
        assert!(
            entry.types_entries[0].contains("types/index.d.ts"),
            "expected resolver to continue to second typesVersions candidate"
        );
    }

    #[test]
    fn resolve_types_entry_supports_wildcard_exports_in_array_conditions() {
        let fixture_path = fixture_dir("exports-wildcard-array-types");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        assert_eq!(
            entry.types_entries.len(),
            2,
            "expected wildcard export array branch to collect all declaration files"
        );
        assert!(entry.types_entries.iter().any(|entry_path| {
            entry_path
                .as_ref()
                .replace('\\', "/")
                .ends_with("dist/alpha.d.ts")
        }));
        assert!(entry.types_entries.iter().any(|entry_path| {
            entry_path
                .as_ref()
                .replace('\\', "/")
                .ends_with("dist/beta.d.ts")
        }));
    }

    // ─── npm_package_root tests ───────────────────────────────

    #[test]
    fn npm_package_root_unscoped_and_subpath() {
        assert_eq!(npm_package_root("zod"), Some("zod".into()));
        assert_eq!(npm_package_root("zod/v4"), Some("zod".into()));
        assert_eq!(npm_package_root("zod\\v4"), Some("zod".into()));
        assert_eq!(npm_package_root("Lodash"), Some("lodash".into()));
        assert_eq!(
            npm_package_root("lodash.merge"),
            Some("lodash.merge".into())
        );
    }

    #[test]
    fn npm_package_root_scoped() {
        assert_eq!(npm_package_root("@Foo/Bar"), Some("@foo/bar".into()));
        assert_eq!(
            npm_package_root("@SCOPE/pkg/subpath"),
            Some("@scope/pkg".into())
        );
        assert_eq!(
            npm_package_root("@SCOPE/pkg\\deep"),
            Some("@scope/pkg".into())
        );
        assert_eq!(npm_package_root("@123/456"), Some("@123/456".into()));
    }

    #[test]
    fn npm_package_root_rejects_relative_and_builtin() {
        assert_eq!(npm_package_root("./x"), None);
        assert_eq!(npm_package_root("../y"), None);
        assert_eq!(npm_package_root("/abs"), None);
        assert_eq!(npm_package_root("node:fs"), None);
        assert_eq!(npm_package_root("NODE:fs"), None);
        assert_eq!(npm_package_root("file:///tmp/x"), None);
        assert_eq!(npm_package_root("https://a/b"), None);
        assert_eq!(npm_package_root("x:y"), None);
        assert_eq!(npm_package_root("C:rel"), None);
        assert_eq!(npm_package_root("\\foo"), None);
        assert_eq!(npm_package_root("\\\\server\\share\\x"), None);
        assert_eq!(npm_package_root("@"), None);
        assert_eq!(npm_package_root("@scope"), None);
        assert_eq!(npm_package_root("@scope//pkg"), None);
    }

    #[test]
    fn normalize_dependency_stub_list_sort_dedupes() {
        let normalized_stubs = normalize_dependency_stub_list(["zod", "A", "zod", "@B/C"]);
        assert_eq!(normalized_stubs, vec!["@b/c", "a", "zod"]);
    }

    #[test]
    fn specifier_is_dependency_stub_matches_normalized_roots() {
        let mut stub_roots = HashSet::new();
        stub_roots.insert("zod".to_string());
        assert!(specifier_is_dependency_stub(
            "zod/v4/classic",
            &stub_roots,
            None
        ));
        assert!(!specifier_is_dependency_stub("./local", &stub_roots, None));
        assert!(!specifier_is_dependency_stub("zod", &HashSet::new(), None));
    }

    #[test]
    fn specifier_is_dependency_stub_self_exempt_skips_own_package_root() {
        let mut stub_roots = HashSet::new();
        stub_roots.insert("zod".to_string());
        assert!(!specifier_is_dependency_stub(
            "zod/v4/classic",
            &stub_roots,
            Some("zod")
        ));
        assert!(specifier_is_dependency_stub(
            "zod/v4/classic",
            &stub_roots,
            Some("other-pkg")
        ));

        let mut scoped = HashSet::new();
        scoped.insert("@scope/pkg".to_string());
        assert!(!specifier_is_dependency_stub(
            "@scope/pkg/sub",
            &scoped,
            Some("@scope/pkg")
        ));
        assert!(specifier_is_dependency_stub(
            "@scope/pkg/sub",
            &scoped,
            Some("@other/x")
        ));
    }

    // ─── normalize_path tests ──────────────────────────────────

    #[test]
    fn normalize_path_uses_forward_slashes() {
        let path = Path::new("some\\windows\\path.d.ts");
        let normalized = normalize_path(path);
        assert!(!normalized.contains('\\'));
    }

    // ─── replace_wildcard tests ────────────────────────────────

    #[test]
    fn replace_wildcard_in_string() {
        let value = serde_json::json!("./dist/*.d.ts");
        let result = replace_wildcard_in_value(&value, "utils");
        assert_eq!(result, serde_json::json!("./dist/utils.d.ts"));
    }

    #[test]
    fn replace_wildcard_in_nested_object() {
        let value = serde_json::json!({
            "types": "./dist/*.d.ts",
            "import": "./dist/*.mjs"
        });
        let result = replace_wildcard_in_value(&value, "core");
        assert_eq!(result["types"], "./dist/core.d.ts");
        assert_eq!(result["import"], "./dist/core.mjs");
    }

    #[test]
    fn make_relative_to_package_strips_prefix() {
        assert_eq!(
            make_relative_to_package("/pkg/src/index.d.ts", "/pkg", "/pkg"),
            "src/index.d.ts"
        );
    }

    #[test]
    fn make_relative_to_package_handles_windows_paths() {
        assert_eq!(
            make_relative_to_package("C:\\pkg\\src\\index.d.ts", "C:\\pkg", "C:/pkg"),
            "src/index.d.ts"
        );
    }

    #[test]
    fn encode_outside_package_relative_replaces_dot_dot_segments() {
        assert_eq!(
            encode_outside_package_relative("../other/x.d.ts"),
            "__nci_external__/__up__/other/x.d.ts"
        );
        assert_eq!(
            encode_outside_package_relative("../../a/b"),
            "__nci_external__/__up__/__up__/a/b"
        );
        assert_eq!(
            encode_outside_package_relative("sub/no-ups.d.ts"),
            "__nci_external__/sub/no-ups.d.ts"
        );
    }

    #[cfg(unix)]
    #[test]
    fn make_relative_to_package_outside_package_root_uses_encoded_path() {
        assert_eq!(
            make_relative_to_package("/other/x.d.ts", "/pkg", "/pkg"),
            "__nci_external__/__up__/other/x.d.ts"
        );
    }

    #[cfg(windows)]
    #[test]
    fn make_relative_to_package_outside_package_root_uses_encoded_path_windows() {
        assert_eq!(
            make_relative_to_package(r"C:\other\x.d.ts", r"C:\pkg", "C:/pkg"),
            "__nci_external__/__up__/other/x.d.ts"
        );
    }

    #[test]
    fn exports_wildcard_subpath_collects_only_matching_declaration_files() {
        let fixture_path = fixture_dir("exports-wildcard-noise");
        let entry = resolve_types_entry(&fixture_path).unwrap();
        let mut paths: Vec<&str> = entry
            .types_entries
            .iter()
            .map(|entry_path| entry_path.as_ref())
            .collect();
        paths.sort();
        assert_eq!(paths.len(), 2, "expected two .d.ts matches, got {paths:?}");
        assert!(paths.iter().all(|entry_path| entry_path.ends_with(".d.ts")));
    }

    #[test]
    fn resolve_module_specifier_falls_back_to_types_package_for_unscoped_bare_import() {
        let fixture_path = fixture_dir("bare-to-types-fallback");
        let from_file = fixture_path.join("index.d.ts");
        let resolved_paths =
            resolve_module_specifier("routing-core-types", from_file.to_str().unwrap());

        assert!(
            resolved_paths.iter().any(|resolved_path| {
                resolved_path
                    .as_ref()
                    .replace('\\', "/")
                    .contains("node_modules/@types/routing-core-types/index.d.ts")
            }),
            "expected @types fallback resolution, got {resolved_paths:?}"
        );
    }

    #[test]
    fn resolve_module_specifier_prefers_direct_package_over_types_fallback() {
        let fixture_path = fixture_dir("bare-to-types-fallback-prefer-direct");
        let from_file = fixture_path.join("index.d.ts");
        let resolved_paths =
            resolve_module_specifier("routing-core-types", from_file.to_str().unwrap());

        assert!(
            resolved_paths.iter().any(|resolved_path| {
                resolved_path
                    .as_ref()
                    .replace('\\', "/")
                    .contains("node_modules/routing-core-types/index.d.ts")
            }),
            "expected direct package resolution, got {resolved_paths:?}"
        );
        assert!(
            resolved_paths.iter().all(|resolved_path| !resolved_path
                .as_ref()
                .replace('\\', "/")
                .contains("node_modules/@types/routing-core-types/index.d.ts")),
            "direct package should win over @types fallback, got {resolved_paths:?}"
        );
    }

    #[test]
    fn resolve_module_specifier_falls_back_for_multiple_unscoped_runtime_packages_without_types() {
        let fixture_path = fixture_dir("bare-to-types-fallback-multi-imports");
        let from_file = fixture_path.join("index.d.ts");
        for (import_specifier, expected_path_segment) in [
            ("runtime-no-types-alpha", "@types/runtime-no-types-alpha"),
            ("runtime-no-types-beta", "@types/runtime-no-types-beta"),
        ] {
            let resolved_paths = resolve_module_specifier(import_specifier, from_file.to_str().unwrap());
            assert!(
                !resolved_paths.is_empty(),
                "{import_specifier}: expected at least one declaration path"
            );
            assert!(
                resolved_paths.iter().all(|resolved_path| {
                    let normalized_path = resolved_path.as_ref().replace('\\', "/");
                    normalized_path.contains(expected_path_segment)
                        && normalized_path.ends_with(".d.ts")
                }),
                "{import_specifier}: expected @types fallback under {expected_path_segment}, got {resolved_paths:?}"
            );
        }
    }

}
