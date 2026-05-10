//! Project `nci.config.json` — merge order: defaults -> file -> CLI (CLI wins).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::filter::DepKindFilter;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencySection {
    Dependencies,
    DevDependencies,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageScopeSentinel {
    AllInstalled,
}

/// Either a non-empty list of `package.json` sections (`["dependencies"]`,
/// `["dev_dependencies"]`, or both) or the `"all_installed"` sentinel (no manifest gate).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum PackageScope {
    Sections(Vec<DependencySection>),
    Sentinel(PackageScopeSentinel),
}

impl<'de> Deserialize<'de> for PackageScope {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Sections(Vec<DependencySection>),
            Sentinel(PackageScopeSentinel),
        }

        match Raw::deserialize(deserializer)? {
            Raw::Sections(sections) if sections.is_empty() => Err(serde::de::Error::custom(
                "package_scope must list at least one section (\"dependencies\" or \"dev_dependencies\"), or use the \"all_installed\" sentinel",
            )),
            Raw::Sections(sections) => Ok(PackageScope::Sections(sections)),
            Raw::Sentinel(sentinel) => Ok(PackageScope::Sentinel(sentinel)),
        }
    }
}

impl From<&PackageScope> for DepKindFilter {
    fn from(scope: &PackageScope) -> Self {
        match scope {
            PackageScope::Sentinel(PackageScopeSentinel::AllInstalled) => DepKindFilter::All,
            PackageScope::Sections(sections) => dep_kind_for_sections(sections),
        }
    }
}

fn dep_kind_for_sections(sections: &[DependencySection]) -> DepKindFilter {
    let has_runtime = sections.contains(&DependencySection::Dependencies);
    let has_dev = sections.contains(&DependencySection::DevDependencies);
    match (has_runtime, has_dev) {
        (true, true) => DepKindFilter::DependenciesAndDevDependencies,
        (true, false) => DepKindFilter::DependenciesOnly,
        (false, true) => DepKindFilter::DevDependenciesOnly,
        (false, false) => DepKindFilter::All,
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct PackageFiltersConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include: Option<Vec<String>>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclude: Option<Vec<String>>,
}

/// On-disk schema for `nci.config.json` (all keys optional).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NciConfigFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub database: Option<PathBuf>,

    /// Default project root for `nci index` / `nci query` when `-r` is omitted (relative paths OK).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,

    /// Startup banner visibility: `auto` | `on` | `off`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub banner: Option<String>,

    /// Progress messages visibility: `auto` | `on` | `off`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,

    /// `0` = entry files only; `-1` = unlimited (see `nci_engine::constants::MAX_HOPS_UNLIMITED`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_hops: Option<i64>,

    /// Include/exclude package name globs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub packages: Option<PackageFiltersConfig>,

    /// Sections of the consumer `package.json` whose names gate indexing. Either a non-empty list
    /// like `["dependencies"]`, `["dev_dependencies"]`, or `["dependencies", "dev_dependencies"]`,
    /// or the sentinel `"all_installed"` to disable the manifest gate. Omit = `["dependencies"]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_scope: Option<PackageScope>,

    /// Optional package roots (`npm_package_root` shape) whose dependencies resolve as `npm::…` stubs only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependency_stub_packages: Option<Vec<String>>,

    /// Optional workspace directory globs under `project_root` (e.g. `apps/*`, `packages/*`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspaces: Option<Vec<String>>,

    /// When `false`, `<project_root>/node_modules` is not scanned as an install root. Requires at least
    /// one entry in `workspaces` so at least one `…/node_modules` root remains (omit = scan root).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index_root_workspace: Option<bool>,
}

pub const CONFIG_FILENAME: &str = "nci.config.json";

#[inline]
pub fn config_path_for_project_root(project_root: &Path) -> PathBuf {
    project_root.join(CONFIG_FILENAME)
}

pub fn load_config_file(project_root: &Path) -> Result<Option<NciConfigFile>, String> {
    let path = config_path_for_project_root(project_root);
    if path.is_file() {
        let raw = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
        let parsed = serde_json::from_str(&raw)
            .map_err(|err| format!("invalid {} at {}: {err}", CONFIG_FILENAME, path.display()))?;
        return Ok(Some(parsed));
    }
    Ok(None)
}

pub fn write_config_file(project_root: &Path, config: &NciConfigFile) -> Result<(), String> {
    let path = config_path_for_project_root(project_root);
    let text = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    std::fs::write(&path, text).map_err(|err| err.to_string())
}

pub fn discover_config(start_dir: &Path) -> Result<Option<(PathBuf, NciConfigFile)>, String> {
    let mut cursor = start_dir.to_path_buf();
    loop {
        if let Some(config_file) = load_config_file(&cursor)? {
            return Ok(Some((cursor, config_file)));
        }
        let Some(parent) = cursor.parent() else {
            return Ok(None);
        };
        if parent == cursor {
            return Ok(None);
        }
        cursor = parent.to_path_buf();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn roundtrip_package_scope_sections_runtime_and_dev() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            package_scope: Some(PackageScope::Sections(vec![
                DependencySection::Dependencies,
                DependencySection::DevDependencies,
            ])),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path())
            .expect("load ok")
            .expect("parsed");
        assert_eq!(
            loaded.package_scope,
            Some(PackageScope::Sections(vec![
                DependencySection::Dependencies,
                DependencySection::DevDependencies,
            ]))
        );
        let raw = fs::read_to_string(temp.path().join(CONFIG_FILENAME)).unwrap();
        assert!(raw.contains("\"package_scope\""), "key present: {raw}");
        assert!(raw.contains("\"dependencies\""), "runtime listed: {raw}");
        assert!(raw.contains("\"dev_dependencies\""), "dev listed: {raw}");
    }

    #[test]
    fn roundtrip_package_scope_sentinel_all_installed() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            package_scope: Some(PackageScope::Sentinel(PackageScopeSentinel::AllInstalled)),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path())
            .expect("load ok")
            .expect("parsed");
        assert_eq!(
            loaded.package_scope,
            Some(PackageScope::Sentinel(PackageScopeSentinel::AllInstalled))
        );
        let raw = fs::read_to_string(temp.path().join(CONFIG_FILENAME)).unwrap();
        assert!(
            raw.contains("\"all_installed\""),
            "sentinel serialized: {raw}"
        );
    }

    #[test]
    fn package_scope_rejects_empty_sections_array() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(
            temp.path().join(CONFIG_FILENAME),
            r#"{"package_scope": []}"#,
        )
        .unwrap();
        let err = load_config_file(temp.path())
            .expect_err("empty array must be rejected at deserialization");
        assert!(
            err.contains("at least one section"),
            "error wording surfaces section guidance: {err}"
        );
    }

    #[test]
    fn package_scope_sections_map_to_dep_kind_filter() {
        let runtime_only = PackageScope::Sections(vec![DependencySection::Dependencies]);
        assert_eq!(
            DepKindFilter::from(&runtime_only),
            DepKindFilter::DependenciesOnly
        );

        let dev_only = PackageScope::Sections(vec![DependencySection::DevDependencies]);
        assert_eq!(
            DepKindFilter::from(&dev_only),
            DepKindFilter::DevDependenciesOnly
        );

        let both = PackageScope::Sections(vec![
            DependencySection::Dependencies,
            DependencySection::DevDependencies,
        ]);
        assert_eq!(
            DepKindFilter::from(&both),
            DepKindFilter::DependenciesAndDevDependencies
        );

        let all_installed = PackageScope::Sentinel(PackageScopeSentinel::AllInstalled);
        assert_eq!(DepKindFilter::from(&all_installed), DepKindFilter::All);
    }

    #[test]
    fn roundtrip_index_root_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            workspaces: Some(vec!["packages/*".into()]),
            index_root_workspace: Some(false),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path())
            .expect("load ok")
            .expect("parsed");
        assert_eq!(loaded.workspaces.as_ref().unwrap().len(), 1);
        assert_eq!(loaded.index_root_workspace, Some(false));
        let raw = fs::read_to_string(temp.path().join(CONFIG_FILENAME)).unwrap();
        assert!(
            raw.contains("\"index_root_workspace\""),
            "serialize uses index_root_workspace: {raw}"
        );
        assert!(raw.contains("false"), "serialize writes false: {raw}");
    }

    #[test]
    fn roundtrip_minimal_config() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            database: Some(temp.path().join("x.sqlite")),
            project_root: Some(".".into()),
            format: Some("json".into()),
            banner: Some("auto".into()),
            progress: Some("auto".into()),
            max_hops: Some(7),
            packages: Some(PackageFiltersConfig {
                include: Some(vec!["@types/*".into()]),
                exclude: None,
            }),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path())
            .expect("load ok")
            .expect("parsed");
        assert_eq!(loaded.max_hops, Some(7));
        assert_eq!(loaded.banner.as_deref(), Some("auto"));
        assert_eq!(loaded.progress.as_deref(), Some("auto"));
        assert_eq!(
            loaded
                .packages
                .as_ref()
                .and_then(|package_filters| package_filters.include.as_ref())
                .map(|include_globs| include_globs.len()),
            Some(1)
        );
    }

    #[test]
    fn roundtrip_max_hops_unlimited_sentinel() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            max_hops: Some(-1),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path())
            .expect("load ok")
            .expect("parsed");
        assert_eq!(loaded.max_hops, Some(-1));
    }

    #[test]
    fn discover_config_prefers_nearest_parent_config() {
        let temp = tempfile::tempdir().unwrap();
        let root_dir = temp.path().join("repo");
        let workspace_dir = root_dir.join("packages").join("app-one");
        fs::create_dir_all(&workspace_dir).unwrap();

        let root_cfg = NciConfigFile {
            format: Some("json".into()),
            ..Default::default()
        };
        let workspace_cfg = NciConfigFile {
            format: Some("plain".into()),
            ..Default::default()
        };
        write_config_file(&root_dir, &root_cfg).unwrap();
        write_config_file(&workspace_dir, &workspace_cfg).unwrap();

        let discovered = discover_config(&workspace_dir)
            .expect("discover should succeed")
            .expect("config should be discovered");
        assert_eq!(discovered.0, workspace_dir);
        assert_eq!(discovered.1.format.as_deref(), Some("plain"));
    }

    #[test]
    fn discover_config_returns_error_for_invalid_json() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join(CONFIG_FILENAME), "{ invalid json").unwrap();
        let err = discover_config(temp.path()).expect_err("invalid json should error");
        assert!(err.contains("invalid nci.config.json"));
    }
}
