//! Project `nci.config.json` — merge order: defaults -> file -> CLI (CLI wins).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

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

    /// Optional package roots (`npm_package_root` shape) whose dependencies resolve as `npm::…` stubs only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependency_stub_packages: Option<Vec<String>>,

    /// Optional workspace directory globs under `project_root` (e.g. `apps/*`, `packages/*`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspaces: Option<Vec<String>>,
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
