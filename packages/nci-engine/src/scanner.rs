use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::resolver::normalize_path;
use crate::types::{PackageInfo, SharedString};

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("node_modules not found at: {path}")]
    NotFound { path: PathBuf },

    #[error("no package {name}@{version} under {path}")]
    PackageVersionNotInNodeModules {
        name: String,
        version: String,
        path: PathBuf,
    },

    #[error("IO error during scan: {source}")]
    Io {
        #[from]
        source: std::io::Error,
    },
}

pub fn scan_packages(node_modules_path: &Path) -> Result<Vec<PackageInfo>, ScanError> {
    if !node_modules_path.exists() {
        return Err(ScanError::NotFound {
            path: node_modules_path.to_path_buf(),
        });
    }

    let mut packages = Vec::new();

    for dir_entry in fs::read_dir(node_modules_path)? {
        let dir_entry = dir_entry?;
        let entry_name = dir_entry.file_name();
        let entry_name_str = entry_name.to_string_lossy();

        if entry_name_str.starts_with('.') {
            continue;
        }

        if !is_directory_or_symlink(&dir_entry)? {
            continue;
        }

        if entry_name_str.starts_with('@') {
            scan_scoped_packages(node_modules_path, &entry_name_str, &mut packages)?;
        } else {
            let symlink_path = node_modules_path.join(&*entry_name_str);
            let resolved_dir = match fs::canonicalize(&symlink_path) {
                Ok(dir) => dir,
                Err(_) => continue,
            };
            if let Some(info) = read_package_info(&resolved_dir, &entry_name_str) {
                packages.push(info);
            }
        }
    }

    Ok(packages)
}

/// `node_modules/<name>` or `node_modules/@scope/<pkg>` (before `canonicalize`). `None` if `name` is malformed.
fn package_install_subpath(node_modules_path: &Path, name: &str) -> Option<PathBuf> {
    if name.starts_with('@') {
        let parts: Vec<&str> = name.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() != 2 {
            return None;
        }
        Some(node_modules_path.join(parts[0]).join(parts[1]))
    } else if name.contains('/') {
        None
    } else {
        Some(node_modules_path.join(name))
    }
}

/// Direct path resolution under `node_modules`, then `read_package_info` + version check.
pub fn find_package_in_node_modules(
    node_modules_path: &Path,
    name: &str,
    version: &str,
) -> Result<PackageInfo, ScanError> {
    if !node_modules_path.exists() {
        return Err(ScanError::NotFound {
            path: node_modules_path.to_path_buf(),
        });
    }

    let not_found = || ScanError::PackageVersionNotInNodeModules {
        name: name.to_string(),
        version: version.to_string(),
        path: node_modules_path.to_path_buf(),
    };

    let install_path = package_install_subpath(node_modules_path, name).ok_or_else(not_found)?;

    let resolved_dir = fs::canonicalize(&install_path).map_err(|_| not_found())?;

    // Align with `scan_packages`: only treat directory (or symlink-to-directory) install roots as packages.
    if !resolved_dir.is_dir() {
        return Err(not_found());
    }

    let Some(info) = read_package_info(&resolved_dir, name) else {
        return Err(not_found());
    };

    if info.name.as_ref() != name || info.version.as_ref() != version {
        return Err(not_found());
    }

    Ok(info)
}

fn scan_scoped_packages(
    node_modules_path: &Path,
    scope_name: &str,
    packages: &mut Vec<PackageInfo>,
) -> Result<(), ScanError> {
    let scope_dir = node_modules_path.join(scope_name);
    let real_scope_dir = fs::canonicalize(&scope_dir)?;

    for scoped_entry in fs::read_dir(&real_scope_dir)? {
        let scoped_entry = scoped_entry?;
        if !is_directory_or_symlink(&scoped_entry)? {
            continue;
        }

        let scoped_name = scoped_entry.file_name();
        let symlink_path = scope_dir.join(&scoped_name);
        let resolved_dir = match fs::canonicalize(&symlink_path) {
            Ok(dir) => dir,
            Err(_) => continue,
        };
        let full_name = format!("{}/{}", scope_name, scoped_name.to_string_lossy());

        if let Some(info) = read_package_info(&resolved_dir, &full_name) {
            packages.push(info);
        }
    }

    Ok(())
}

fn is_directory_or_symlink(dir_entry: &fs::DirEntry) -> Result<bool, std::io::Error> {
    let file_type = dir_entry.file_type()?;

    if file_type.is_dir() {
        return Ok(true);
    }

    if file_type.is_symlink() {
        match fs::metadata(dir_entry.path()) {
            Ok(metadata) => Ok(metadata.is_dir()),
            Err(_) => Ok(false),
        }
    } else {
        Ok(false)
    }
}

fn read_package_info(package_dir: &Path, fallback_name: &str) -> Option<PackageInfo> {
    let pkg_json_path = package_dir.join("package.json");
    let raw_contents = fs::read_to_string(&pkg_json_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw_contents).ok()?;

    let name = SharedString::from(parsed["name"].as_str().unwrap_or(fallback_name));

    let version = SharedString::from(parsed["version"].as_str().unwrap_or("0.0.0"));
    let declared_dependencies = declared_dependency_names(&parsed);

    Some(PackageInfo {
        is_scoped: name.starts_with('@'),
        name,
        version,
        dir: normalize_path(package_dir),
        declared_dependencies,
    })
}

fn declared_dependency_names(
    parsed_package_json: &serde_json::Value,
) -> crate::types::SharedVec<SharedString> {
    let mut dependency_names: BTreeSet<String> = BTreeSet::new();
    collect_dependency_section_keys(parsed_package_json, "dependencies", &mut dependency_names);
    collect_dependency_section_keys(
        parsed_package_json,
        "peerDependencies",
        &mut dependency_names,
    );
    collect_dependency_section_keys(
        parsed_package_json,
        "optionalDependencies",
        &mut dependency_names,
    );
    let deps: Vec<SharedString> = dependency_names
        .into_iter()
        .map(SharedString::from)
        .collect();
    crate::types::SharedVec::from(deps.into_boxed_slice())
}

fn collect_dependency_section_keys(
    parsed_package_json: &serde_json::Value,
    section_key: &str,
    out: &mut BTreeSet<String>,
) {
    let Some(section) = parsed_package_json
        .get(section_key)
        .and_then(|value| value.as_object())
    else {
        return;
    };
    for dependency_name in section.keys() {
        out.insert(dependency_name.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_dir(fixture_name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("nci-engine lives under packages/")
            .join("nci-core")
            .join("fixtures")
            .join(fixture_name)
    }

    #[test]
    fn scan_returns_error_for_missing_directory() {
        let result = scan_packages(Path::new("/nonexistent/node_modules"));
        assert!(result.is_err());
        match result.unwrap_err() {
            ScanError::NotFound { path } => {
                assert_eq!(path, Path::new("/nonexistent/node_modules"));
            }
            other => panic!("Expected NotFound, got: {:?}", other),
        }
    }

    #[test]
    fn is_directory_or_symlink_returns_false_for_files() {
        let fixture_root = fixture_dir("simple-export");
        let entry = fs::read_dir(&fixture_root)
            .unwrap()
            .filter_map(Result::ok)
            .find(|read_dir_entry| read_dir_entry.file_name().to_string_lossy() == "package.json")
            .expect("fixture package.json should exist");
        assert!(!is_directory_or_symlink(&entry).unwrap());
    }

    #[test]
    fn read_package_info_parses_valid_package_json() {
        let info = read_package_info(fixture_dir("simple-export").as_path(), "fallback").unwrap();
        assert_eq!(info.name.as_ref(), "simple-export");
        assert_eq!(info.version.as_ref(), "1.0.0");
        assert!(!info.is_scoped);
    }

    #[test]
    fn read_package_info_uses_fallback_name() {
        let info = read_package_info(
            fixture_dir("scanner-fallback-name").as_path(),
            "fallback-name",
        )
        .unwrap();
        assert_eq!(info.name.as_ref(), "fallback-name");
    }

    #[test]
    fn read_package_info_returns_none_for_missing_file() {
        let result = read_package_info(fixture_dir("").as_path(), "anything");
        assert!(result.is_none());
    }

    #[test]
    fn read_package_info_detects_scoped_packages() {
        let info = read_package_info(
            fixture_dir("dependency-stub-self-exempt-scoped")
                .join("node_modules")
                .join("@acme")
                .join("self-stub")
                .as_path(),
            "fallback",
        )
        .unwrap();
        assert_eq!(info.name.as_ref(), "@acme/self-stub");
        assert!(info.is_scoped);
    }

    #[test]
    fn scan_packages_discovers_simple_structure() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let packages = scan_packages(&node_modules).unwrap();
        assert!(
            packages
                .iter()
                .any(|pkg| pkg.name.as_ref() == "other-dep" && pkg.version.as_ref() == "2.0.0")
        );
        assert!(
            packages
                .iter()
                .any(|pkg| pkg.name.as_ref() == "@stub-listed/core" && pkg.is_scoped)
        );
    }

    #[test]
    fn scan_packages_discovers_scoped_packages() {
        let node_modules = fixture_dir("cross-package-resolution").join("node_modules");
        let packages = scan_packages(&node_modules).unwrap();
        assert!(
            packages
                .iter()
                .any(|pkg| pkg.name.as_ref() == "@nci-test/core" && pkg.is_scoped)
        );
        assert!(
            packages
                .iter()
                .any(|pkg| pkg.name.as_ref() == "@nci-test/bridge" && pkg.is_scoped)
        );
    }

    #[test]
    fn find_package_in_node_modules_unscoped_ok() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let info = find_package_in_node_modules(&node_modules, "other-dep", "2.0.0").unwrap();
        assert_eq!(info.name.as_ref(), "other-dep");
        assert_eq!(info.version.as_ref(), "2.0.0");
    }

    #[test]
    fn find_package_in_node_modules_scoped_ok() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let info =
            find_package_in_node_modules(&node_modules, "@stub-listed/core", "1.0.0").unwrap();
        assert_eq!(info.name.as_ref(), "@stub-listed/core");
        assert_eq!(info.version.as_ref(), "1.0.0");
        assert!(info.is_scoped);
    }

    #[test]
    fn find_package_in_node_modules_wrong_version() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let err = find_package_in_node_modules(&node_modules, "other-dep", "9.9.9").unwrap_err();
        assert!(matches!(
            err,
            ScanError::PackageVersionNotInNodeModules { .. }
        ));
    }

    #[test]
    fn find_package_in_node_modules_missing() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let err = find_package_in_node_modules(&node_modules, "nope", "1.0.0").unwrap_err();
        assert!(matches!(
            err,
            ScanError::PackageVersionNotInNodeModules { .. }
        ));
    }

    #[test]
    fn find_package_in_node_modules_rejects_file_at_install_path() {
        let node_modules = fixture_dir("scanner-file-install-path").join("node_modules");
        let err = find_package_in_node_modules(&node_modules, "not-a-dir", "1.0.0").unwrap_err();
        assert!(matches!(
            err,
            ScanError::PackageVersionNotInNodeModules { .. }
        ));
    }

    #[test]
    fn find_package_in_node_modules_malformed_scoped_name() {
        let node_modules = fixture_dir("dependency-stub-packages").join("node_modules");
        let err = find_package_in_node_modules(&node_modules, "@only-scope", "1.0.0").unwrap_err();
        assert!(matches!(
            err,
            ScanError::PackageVersionNotInNodeModules { .. }
        ));
    }

    #[test]
    fn find_package_not_found_errors_when_node_modules_missing() {
        let node_modules = fixture_dir("simple-export").join("node_modules");
        let err = find_package_in_node_modules(&node_modules, "x", "1.0.0").unwrap_err();
        assert!(matches!(err, ScanError::NotFound { .. }));
    }
}
