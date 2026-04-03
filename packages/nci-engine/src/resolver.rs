use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

static VERSION_RANGE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$").unwrap());

static JS_EXT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.(js|mjs|cjs)$").unwrap());

use crate::constants::NODE_BUILTINS;
use crate::types::{PackageEntry, SharedString};

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

    if types_entries.is_empty() {
        if let Some(types_versions) = parsed_pkg.get("typesVersions") {
            if let Some(resolved) = resolve_types_versions(package_dir, types_versions) {
                subpaths.insert(".".into(), resolved.clone());
                types_entries.push(resolved);
            }
        }
    }

    if types_entries.is_empty() {
        if let Some(types_value) = parsed_pkg["types"].as_str() {
            if let Some(resolved) = resolve_file(package_dir, types_value) {
                subpaths.insert(".".into(), resolved.clone());
                types_entries.push(resolved);
            }
        }
    }

    if types_entries.is_empty() {
        if let Some(typings_value) = parsed_pkg["typings"].as_str() {
            if let Some(resolved) = resolve_file(package_dir, typings_value) {
                subpaths.insert(".".into(), resolved.clone());
                types_entries.push(resolved);
            }
        }
    }

    if types_entries.is_empty() {
        let fallback_path = package_dir.join("index.d.ts");
        if fallback_path.is_file() {
            let normalized = normalize_path(&fallback_path);
            subpaths.insert(".".into(), normalized.clone());
            types_entries.push(normalized);
        }
    }

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
            if is_declaration_file(export_string) {
                if let Some(resolved) = resolve_file(package_dir, export_string) {
                    entries.push(resolved.clone());
                    subpaths.entry(".".into()).or_insert(resolved);
                }
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
                if let Some(value) = condition_map.get(*key) {
                    if let Some(resolved) = resolve_export_condition(package_dir, value) {
                        return Some(resolved);
                    }
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

        // Try wildcard paths first
        if let Some(wildcard_paths) = path_map.get("*") {
            if let Some(first_pattern) = wildcard_paths.as_array().and_then(|arr| arr.first()) {
                if let Some(pattern_str) = first_pattern.as_str() {
                    let redirect_path = pattern_str.replace('*', "index.d.ts");
                    if let Some(resolved) = resolve_file(package_dir, &redirect_path) {
                        return Some(resolved);
                    }
                }
            }
        }

        // Try dot paths
        if let Some(dot_paths) = path_map.get(".") {
            if let Some(first_path) = dot_paths.as_array().and_then(|arr| arr.first()) {
                if let Some(path_str) = first_path.as_str() {
                    if let Some(resolved) = resolve_file(package_dir, path_str) {
                        return Some(resolved);
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
    let all_files = scan_directory_recursive(&scan_directory);
    let mut matching_entries: Vec<SharedString> = Vec::new();

    for candidate_path in &all_files {
        let relative_to_package = match candidate_path.strip_prefix(package_dir) {
            Ok(relative) => relative.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        let normalized_relative = if relative_to_package.starts_with("./") {
            relative_to_package.clone()
        } else {
            format!("./{}", relative_to_package)
        };

        if (glob_regex.is_match(&normalized_relative) || glob_regex.is_match(&relative_to_package))
            && is_declaration_file_path(candidate_path)
        {
            matching_entries.push(normalize_path(candidate_path));
        }
    }

    matching_entries
}

fn extract_wildcard_pattern(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(string_value) => Some(string_value.clone()),

        serde_json::Value::Object(condition_map) => {
            let priority_keys = ["types", "import", "require", "default"];
            for key in &priority_keys {
                if let Some(nested_value) = condition_map.get(*key) {
                    if let Some(result) = extract_wildcard_pattern(nested_value) {
                        return Some(result);
                    }
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

/// Scans a directory recursively to identify all candidate files.
fn scan_directory_recursive(dir: &Path) -> Vec<PathBuf> {
    let mut results: Vec<PathBuf> = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return results,
    };

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        if entry_path.is_dir() {
            results.extend(scan_directory_recursive(&entry_path));
        } else {
            results.push(entry_path);
        }
    }

    results
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

    let pkg_dir = match find_package_dir(&package_name, current_dir) {
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
    let parsed_pkg: serde_json::Value = match serde_json::from_str(&raw_contents) {
        Ok(parsed) => parsed,
        Err(_) => return vec![],
    };

    let pkg_entry = match package_entry_from_parsed_pkg(&pkg_dir, &parsed_pkg) {
        Ok(entry) => entry,
        Err(_) => return vec![],
    };

    if subpath == "." {
        return pkg_entry.types_entries;
    }

    // Check mapped subpaths
    if let Some(mapped_path) = pkg_entry.subpaths.get(subpath.as_ref() as &str) {
        let entries: Vec<SharedString> = vec![mapped_path.clone()];
        return entries;
    }

    // Try wildcard matching against exports
    if let Some(exports) = parsed_pkg.get("exports") {
        if let Some(wildcard_matched) = match_wildcard_subpath(&subpath, exports) {
            if let Some(resolved) = resolve_export_condition(&pkg_dir, &wildcard_matched) {
                return vec![resolved];
            }
        }
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

/// Checks if a path string ends with a `.d.ts` / `.d.mts` / `.d.cts` extension.
fn is_declaration_file(path_str: &str) -> bool {
    path_str.ends_with(".d.ts") || path_str.ends_with(".d.mts") || path_str.ends_with(".d.cts")
}

/// Checks if a `PathBuf` points to a declaration file.
fn is_declaration_file_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    is_declaration_file(&path_str)
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let temp_dir = tempfile::tempdir().unwrap();
        let dts_file = temp_dir.path().join("index.d.ts");
        fs::write(&dts_file, "export {};").unwrap();

        let value = serde_json::json!("./index.d.ts");
        let result = resolve_export_condition(temp_dir.path(), &value);
        assert!(result.is_some());
    }

    #[test]
    fn resolve_export_condition_rejects_js() {
        let temp_dir = tempfile::tempdir().unwrap();
        let value = serde_json::json!("./index.js");
        let result = resolve_export_condition(temp_dir.path(), &value);
        assert!(result.is_none());
    }

    #[test]
    fn resolve_export_condition_nested_types() {
        let temp_dir = tempfile::tempdir().unwrap();
        let dts_file = temp_dir.path().join("dist").join("index.d.ts");
        fs::create_dir_all(dts_file.parent().unwrap()).unwrap();
        fs::write(&dts_file, "export {};").unwrap();

        let value = serde_json::json!({
            "types": "./dist/index.d.ts",
            "import": "./dist/index.mjs",
            "default": "./dist/index.js"
        });

        let result = resolve_export_condition(temp_dir.path(), &value);
        assert!(result.is_some());
        assert!(result.unwrap().contains("index.d.ts"));
    }

    // ─── resolve_types_entry tests ─────────────────────────────

    #[test]
    fn resolve_types_entry_from_types_field() {
        let temp_dir = tempfile::tempdir().unwrap();

        // Create package.json with types field
        fs::write(
            temp_dir.path().join("package.json"),
            serde_json::to_string(&serde_json::json!({
                "name": "test-pkg",
                "version": "1.0.0",
                "types": "./index.d.ts"
            }))
            .unwrap(),
        )
        .unwrap();

        // Create the .d.ts file
        fs::write(temp_dir.path().join("index.d.ts"), "export {};").unwrap();

        let entry = resolve_types_entry(temp_dir.path()).unwrap();
        assert_eq!(entry.name, "test-pkg".into());
        assert_eq!(entry.types_entries.len(), 1);
        assert!(entry.types_entries[0].contains("index.d.ts"));
    }

    #[test]
    fn resolve_types_entry_fallback_to_index_dts() {
        let temp_dir = tempfile::tempdir().unwrap();

        fs::write(
            temp_dir.path().join("package.json"),
            serde_json::to_string(&serde_json::json!({
                "name": "bare-pkg",
                "version": "1.0.0"
            }))
            .unwrap(),
        )
        .unwrap();

        fs::write(temp_dir.path().join("index.d.ts"), "export {};").unwrap();

        let entry = resolve_types_entry(temp_dir.path()).unwrap();
        assert_eq!(entry.types_entries.len(), 1);
        assert!(entry.types_entries[0].contains("index.d.ts"));
    }

    #[test]
    fn resolve_types_entry_works_without_pkg_json() {
        let temp_dir = tempfile::tempdir().unwrap();
        let result = resolve_types_entry(temp_dir.path());
        assert!(result.is_ok());
        let entry = result.unwrap();
        assert_eq!(
            entry.name,
            SharedString::from(
                temp_dir
                    .path()
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .as_ref()
            )
        );
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
}
