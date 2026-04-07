//! Project `.nci.toml` — merge order: defaults → file → CLI (CLI wins).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// On-disk schema for `.nci.toml` (all keys optional).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NciConfigFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub database: Option<PathBuf>,

    /// Default project root for `nci index` / `nci query` when `-r` is omitted (relative paths OK).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallel: Option<bool>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallel_resolve_deps: Option<bool>,

    /// `0` = entry files only; `-1` = unlimited (see `nci_engine::constants::MAX_HOPS_UNLIMITED`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_hops: Option<i64>,

    /// Include-only package name globs (`FilterConfig::include_globs`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub packages: Option<Vec<String>>,
}

pub const CONFIG_FILENAME: &str = ".nci.toml";

#[inline]
pub fn config_path_for_project_root(project_root: &Path) -> PathBuf {
    project_root.join(CONFIG_FILENAME)
}

/// Read and parse `.nci.toml` next to `project_root`, if present.
pub fn load_config_file(project_root: &Path) -> Option<NciConfigFile> {
    let path = config_path_for_project_root(project_root);
    let raw = std::fs::read_to_string(&path).ok()?;
    toml::from_str(&raw).ok()
}

pub fn write_config_file(project_root: &Path, config: &NciConfigFile) -> Result<(), String> {
    let path = config_path_for_project_root(project_root);
    let text = toml::to_string_pretty(config).map_err(|err| err.to_string())?;
    std::fs::write(&path, text).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_minimal_config() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            database: Some(temp.path().join("x.sqlite")),
            project_root: Some(".".into()),
            format: Some("json".into()),
            parallel: Some(false),
            parallel_resolve_deps: Some(true),
            max_hops: Some(7),
            packages: Some(vec!["@types/*".into()]),
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path()).expect("parsed");
        assert_eq!(loaded.max_hops, Some(7));
        assert_eq!(loaded.packages.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn roundtrip_max_hops_unlimited_sentinel() {
        let temp = tempfile::tempdir().unwrap();
        let cfg = NciConfigFile {
            max_hops: Some(-1),
            ..Default::default()
        };
        write_config_file(temp.path(), &cfg).unwrap();
        let loaded = load_config_file(temp.path()).expect("parsed");
        assert_eq!(loaded.max_hops, Some(-1));
    }
}
