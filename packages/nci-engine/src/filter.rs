//! Package filtering: `.nciignore`, dependency-kind subset, and glob excludes.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::types::PackageInfo;

/// Which dependency sections from the **consumer** `package.json` count as "in scope" for filtering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DepKindFilter {
    /// No dependency-section filter; all scanned packages may pass (subject to ignore patterns).
    #[default]
    All,
    /// Only packages listed under `dependencies`.
    DependenciesOnly,
    /// Only packages listed under `devDependencies`.
    DevDependenciesOnly,
}

/// Filtering applied after `scan_packages`, before indexing / cache.
#[derive(Debug, Clone, Default)]
pub struct FilterConfig {
    /// Root directory to resolve `.nciignore` and consumer `package.json` from.
    pub project_root: Option<std::path::PathBuf>,
    /// Patterns from `.nciignore` (gitignore-style last-match wins).
    pub nciignore_rules: Vec<IgnoreRule>,
    /// Restrict to names appearing in the given sections of `package.json`.
    pub dep_kind_filter: DepKindFilter,
    /// When `dep_kind_filter` is not `All`, also allow `peerDependencies` keys.
    pub include_peer_dependencies: bool,
    /// Optional name allow-list (exact match); if non-empty, package must be in the set.
    pub include_names: HashSet<String>,
    /// Glob-style exclude patterns checked after ignore rules (e.g. CLI `--exclude`).
    pub exclude_patterns: Vec<String>,
}

/// One line from `.nciignore`: positive pattern ignores; `negated` means "do not ignore".
#[derive(Debug, Clone)]
pub struct IgnoreRule {
    pub pattern: String,
    pub negated: bool,
}

impl FilterConfig {
    pub fn with_nciignore_file(mut self, project_root: &Path) -> Self {
        let path = project_root.join(".nciignore");
        if path.is_file() {
            if let Ok(text) = fs::read_to_string(&path) {
                self.nciignore_rules.extend(parse_nciignore_lines(&text));
            }
        }
        self.project_root = Some(project_root.to_path_buf());
        self
    }

    pub fn apply(self, packages: Vec<PackageInfo>) -> Vec<PackageInfo> {
        let allowed_by_package_json: Option<HashSet<String>> =
            if self.dep_kind_filter == DepKindFilter::All {
                None
            } else {
                self.project_root.as_ref().and_then(|root| {
                    load_allowed_package_names_from_package_json(
                        root,
                        self.dep_kind_filter,
                        self.include_peer_dependencies,
                    )
                })
            };

        packages
            .into_iter()
            .filter(|package_info| {
                let name = package_info.name.as_ref();
                if !self.include_names.is_empty() && !self.include_names.contains(name) {
                    return false;
                }
                if let Some(allowed) = &allowed_by_package_json {
                    if !allowed.contains(name) {
                        return false;
                    }
                }
                if package_name_ignored_by_nciignore(name, &self.nciignore_rules) {
                    return false;
                }
                for pattern in &self.exclude_patterns {
                    if package_matches_glob(name, pattern) {
                        return false;
                    }
                }
                true
            })
            .collect()
    }
}

fn load_allowed_package_names_from_package_json(
    project_root: &Path,
    dep_filter: DepKindFilter,
    include_peer: bool,
) -> Option<HashSet<String>> {
    let package_json_path = project_root.join("package.json");
    let raw = fs::read_to_string(&package_json_path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;

    let mut names = HashSet::new();

    match dep_filter {
        DepKindFilter::All => {}
        DepKindFilter::DependenciesOnly => {
            merge_dependency_keys(&value["dependencies"], &mut names);
        }
        DepKindFilter::DevDependenciesOnly => {
            merge_dependency_keys(&value["devDependencies"], &mut names);
        }
    }

    if include_peer {
        merge_dependency_keys(&value["peerDependencies"], &mut names);
    }

    Some(names)
}

fn merge_dependency_keys(section: &Value, out: &mut HashSet<String>) {
    let Some(map) = section.as_object() else {
        return;
    };
    for key in map.keys() {
        out.insert(key.clone());
    }
}

fn parse_nciignore_lines(text: &str) -> Vec<IgnoreRule> {
    let mut rules = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('!') {
            let pattern = rest.trim().to_string();
            if !pattern.is_empty() {
                rules.push(IgnoreRule {
                    pattern,
                    negated: true,
                });
            }
        } else {
            rules.push(IgnoreRule {
                pattern: trimmed.to_string(),
                negated: false,
            });
        }
    }
    rules
}

/// Returns `true` if the package should be dropped (ignored).
fn package_name_ignored_by_nciignore(package_name: &str, rules: &[IgnoreRule]) -> bool {
    let mut ignored = false;
    for rule in rules {
        if package_matches_ignore_pattern(package_name, &rule.pattern) {
            ignored = !rule.negated;
        }
    }
    ignored
}

fn package_matches_ignore_pattern(package_name: &str, pattern: &str) -> bool {
    package_matches_glob(package_name, pattern)
}

/// Minimal glob: `*` prefix/suffix/infix, `@scope/*` for scoped packages.
fn package_matches_glob(package_name: &str, pattern: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return false;
    }

    if pattern == "*" {
        return true;
    }

    // Patterns like `**` split into only empty segments and would otherwise match any name.
    if pattern.chars().all(|character| character == '*') {
        return false;
    }

    if let Some(scope_part) = pattern.strip_suffix("/*") {
        if let Some(without_at) = scope_part.strip_prefix('@') {
            let scope_prefix = format!("@{without_at}/");
            return package_name.starts_with(&scope_prefix);
        }
        return package_name.starts_with(scope_part);
    }

    if !pattern.contains('*') {
        return package_name == pattern;
    }

    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 2 && parts[0].is_empty() && parts[1].is_empty() {
        return false;
    }
    if parts.len() == 2 {
        let (before, after) = (parts[0], parts[1]);
        if before.is_empty() {
            return package_name.ends_with(after);
        }
        if after.is_empty() {
            return package_name.starts_with(before);
        }
        return package_name.starts_with(before) && package_name.ends_with(after);
    }

    pattern
        .split('*')
        .all(|segment| segment.is_empty() || package_name.contains(segment))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SharedString;

    fn sample_package(package_name: &str) -> PackageInfo {
        PackageInfo {
            name: SharedString::from(package_name),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/virtual/pkg"),
            is_scoped: package_name.starts_with('@'),
        }
    }

    // --- parse_nciignore_lines ---

    #[test]
    fn nciignore_skips_empty_lines_hash_comments_and_whitespace_only() {
        let rules = parse_nciignore_lines("\n  \n# skip me\njest\n");
        assert_eq!(rules.len(), 1);
        assert!(!rules[0].negated);
        assert_eq!(rules[0].pattern, "jest");
    }

    #[test]
    fn nciignore_negated_line_empty_after_bang_is_omitted() {
        let rules = parse_nciignore_lines("jest\n!\n!   \n");
        assert_eq!(rules.len(), 1);
    }

    #[test]
    fn nciignore_negation_trims_pattern_after_bang() {
        let rules = parse_nciignore_lines("foo\n!  bar  \n");
        assert_eq!(rules.len(), 2);
        assert!(rules[1].negated);
        assert_eq!(rules[1].pattern, "bar");
    }

    #[test]
    fn nciignore_last_match_wins_for_overlapping_rules() {
        let rules = parse_nciignore_lines("@types/*\n!@types/react\n@types/react\n");
        // Sequence: @types/* ignore; !@types/react unignore; @types/react ignore again (last match wins).
        assert!(package_name_ignored_by_nciignore("@types/react", &rules));
        assert!(package_name_ignored_by_nciignore("@types/node", &rules));
    }

    #[test]
    fn nciignore_negation_unignores() {
        let rules = parse_nciignore_lines("eslint*\n!eslint-config-custom\n");
        assert!(package_name_ignored_by_nciignore("eslint", &rules));
        assert!(!package_name_ignored_by_nciignore(
            "eslint-config-custom",
            &rules
        ));
    }

    #[test]
    fn nciignore_no_rules_never_ignores() {
        assert!(!package_name_ignored_by_nciignore("anything", &[]));
    }

    // --- package_matches_glob / package_matches_ignore_pattern ---

    #[test]
    fn glob_empty_or_whitespace_only_pattern_never_matches() {
        assert!(!package_matches_glob("react", ""));
        assert!(!package_matches_glob("react", "   "));
    }

    #[test]
    fn glob_single_star_matches_everything() {
        assert!(package_matches_glob("", "*"));
        assert!(package_matches_glob("@scope/pkg", "*"));
    }

    #[test]
    fn glob_star_star_two_part_pattern_matches_nothing() {
        assert!(!package_matches_glob("aa", "**"));
    }

    #[test]
    fn glob_exact_name_without_wildcard() {
        assert!(package_matches_glob("lodash", "lodash"));
        assert!(!package_matches_glob("lodash-es", "lodash"));
    }

    #[test]
    fn scope_star_matches_scope_packages() {
        assert!(package_matches_glob("@types/react", "@types/*"));
        assert!(!package_matches_glob("react", "@types/*"));
    }

    #[test]
    fn glob_scope_prefix_without_at_uses_plain_prefix_before_slash_star() {
        assert!(package_matches_glob("internal/foo", "internal/*"));
        assert!(!package_matches_glob("@internal/foo", "internal/*"));
    }

    #[test]
    fn glob_prefix_wildcard_suffix() {
        assert!(package_matches_glob("eslint-config-airbnb", "eslint*"));
        assert!(!package_matches_glob("jest", "eslint*"));
    }

    #[test]
    fn glob_suffix_wildcard_prefix() {
        assert!(package_matches_glob("babel-preset-env", "*preset-env"));
        assert!(!package_matches_glob("babel", "*preset-env"));
    }

    #[test]
    fn glob_infix_single_star_both_sides_non_empty() {
        assert!(package_matches_glob("lodash-es", "lodash*-es"));
        assert!(!package_matches_glob("lodash-extra", "lodash*-es"));
    }

    #[test]
    fn glob_multi_star_segments_each_literal_must_appear_as_substring_order_not_enforced() {
        assert!(package_matches_glob("axbxc", "a*b*c"));
        // Implementation uses substring checks only, so letters need not be separated in order.
        assert!(package_matches_glob("acb", "a*b*c"));
    }

    #[test]
    fn glob_three_parts_falls_through_to_contains_semantics() {
        // parts.len() != 2: every non-empty segment must appear somewhere in the name
        assert!(package_matches_glob("fooXbarYbaz", "foo*bar*baz"));
    }

    #[test]
    fn package_matches_ignore_pattern_delegates_to_glob() {
        assert!(package_matches_ignore_pattern("jest", "jest"));
        assert!(!package_matches_ignore_pattern("jest", "mocha"));
    }

    // --- merge_dependency_keys / load_allowed_package_names_from_package_json ---

    #[test]
    fn dep_kind_filter_reads_package_json() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "name": "consumer",
            "dependencies": {"lodash": "^4"},
            "devDependencies": {"jest": "^29"}
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let allowed = load_allowed_package_names_from_package_json(
            temp.path(),
            DepKindFilter::DependenciesOnly,
            false,
        )
        .unwrap();
        assert!(allowed.contains("lodash"));
        assert!(!allowed.contains("jest"));
    }

    #[test]
    fn load_allowed_dev_dependencies_only_excludes_production_deps() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "dependencies": {"lodash": "^4"},
            "devDependencies": {"jest": "^29"}
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let allowed = load_allowed_package_names_from_package_json(
            temp.path(),
            DepKindFilter::DevDependenciesOnly,
            false,
        )
        .unwrap();
        assert!(allowed.contains("jest"));
        assert!(!allowed.contains("lodash"));
    }

    #[test]
    fn load_allowed_includes_peer_when_flag_set() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "dependencies": {"lodash": "^4"},
            "peerDependencies": {"react": "^18"}
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let allowed = load_allowed_package_names_from_package_json(
            temp.path(),
            DepKindFilter::DependenciesOnly,
            true,
        )
        .unwrap();
        assert!(allowed.contains("lodash"));
        assert!(allowed.contains("react"));
    }

    #[test]
    fn load_allowed_peer_only_when_dependencies_empty_and_peer_enabled() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "peerDependencies": {"react": "^18"}
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let allowed = load_allowed_package_names_from_package_json(
            temp.path(),
            DepKindFilter::DependenciesOnly,
            true,
        )
        .unwrap();
        assert!(allowed.contains("react"));
    }

    #[test]
    fn load_allowed_skips_non_object_dependency_sections() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "dependencies": "not-an-object",
            "devDependencies": ["array"]
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let allowed = load_allowed_package_names_from_package_json(
            temp.path(),
            DepKindFilter::DependenciesOnly,
            false,
        )
        .unwrap();
        assert!(allowed.is_empty());
    }

    #[test]
    fn load_allowed_returns_none_when_package_json_missing() {
        let temp = tempfile::tempdir().unwrap();
        assert!(
            load_allowed_package_names_from_package_json(
                temp.path(),
                DepKindFilter::DependenciesOnly,
                false
            )
            .is_none()
        );
    }

    #[test]
    fn load_allowed_returns_none_when_package_json_invalid() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("package.json"), "{ not json").unwrap();
        assert!(
            load_allowed_package_names_from_package_json(
                temp.path(),
                DepKindFilter::DependenciesOnly,
                false
            )
            .is_none()
        );
    }

    // --- FilterConfig::with_nciignore_file / apply ---

    #[test]
    fn with_nciignore_file_loads_rules_and_sets_project_root() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join(".nciignore"), "jest\n").unwrap();

        let config = FilterConfig::default().with_nciignore_file(temp.path());
        assert_eq!(
            config.project_root.as_ref().map(|path| path.as_path()),
            Some(temp.path())
        );
        assert_eq!(config.nciignore_rules.len(), 1);
        assert_eq!(config.nciignore_rules[0].pattern, "jest");
    }

    #[test]
    fn with_nciignore_missing_file_only_sets_project_root_and_no_extra_rules() {
        let temp = tempfile::tempdir().unwrap();
        let config = FilterConfig {
            nciignore_rules: vec![IgnoreRule {
                pattern: "pre-existing".into(),
                negated: false,
            }],
            ..Default::default()
        }
        .with_nciignore_file(temp.path());

        assert_eq!(config.nciignore_rules.len(), 1);
        assert_eq!(config.nciignore_rules[0].pattern, "pre-existing");
    }

    #[test]
    fn apply_include_names_allow_list_filters_packages() {
        let mut include = HashSet::new();
        include.insert("keep".to_string());

        let out = FilterConfig {
            include_names: include,
            ..Default::default()
        }
        .apply(vec![sample_package("keep"), sample_package("drop")]);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_ref(), "keep");
    }

    #[test]
    fn apply_empty_include_names_does_not_restrict_by_name() {
        let out = FilterConfig::default().apply(vec![sample_package("a"), sample_package("b")]);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn apply_exclude_patterns_drop_matching_packages() {
        let out = FilterConfig {
            exclude_patterns: vec!["eslint*".into()],
            ..Default::default()
        }
        .apply(vec![sample_package("eslint"), sample_package("prettier")]);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_ref(), "prettier");
    }

    #[test]
    fn apply_multiple_exclude_patterns_union_excludes() {
        let out = FilterConfig {
            exclude_patterns: vec!["jest".into(), "mocha".into()],
            ..Default::default()
        }
        .apply(vec![
            sample_package("jest"),
            sample_package("mocha"),
            sample_package("vitest"),
        ]);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_ref(), "vitest");
    }

    #[test]
    fn apply_dep_filter_without_project_root_skips_package_json_allow_list() {
        let out = FilterConfig {
            project_root: None,
            dep_kind_filter: DepKindFilter::DependenciesOnly,
            ..Default::default()
        }
        .apply(vec![sample_package("lodash"), sample_package("jest")]);

        assert_eq!(
            out.len(),
            2,
            "without project_root, dep filter cannot load package.json so names are not restricted"
        );
    }

    #[test]
    fn apply_dep_filter_with_empty_allow_set_drops_all() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("package.json"), r#"{"name":"x"}"#).unwrap();

        let out = FilterConfig {
            project_root: Some(temp.path().to_path_buf()),
            dep_kind_filter: DepKindFilter::DependenciesOnly,
            ..Default::default()
        }
        .apply(vec![sample_package("lodash")]);

        assert!(
            out.is_empty(),
            "no dependencies key -> empty allow set -> everything filtered out"
        );
    }

    #[test]
    fn apply_respects_nciignore_and_dep_filter_together() {
        let temp = tempfile::tempdir().unwrap();
        let pkg = serde_json::json!({
            "dependencies": {"keep": "1", "drop-dep": "1"}
        });
        std::fs::write(
            temp.path().join("package.json"),
            serde_json::to_string(&pkg).unwrap(),
        )
        .unwrap();

        let rules = parse_nciignore_lines("drop-*\n");
        let out = FilterConfig {
            project_root: Some(temp.path().to_path_buf()),
            dep_kind_filter: DepKindFilter::DependenciesOnly,
            nciignore_rules: rules,
            ..Default::default()
        }
        .apply(vec![sample_package("keep"), sample_package("drop-dep")]);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name.as_ref(), "keep");
    }
}
