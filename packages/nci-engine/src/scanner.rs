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

/// Resolve a single package from `node_modules` by exact `package.json` name and version.
pub fn find_package_in_node_modules(
    node_modules_path: &Path,
    name: &str,
    version: &str,
) -> Result<PackageInfo, ScanError> {
    let mut found: Option<PackageInfo> = None;
    for package in scan_packages(node_modules_path)? {
        if package.name.as_ref() == name && package.version.as_ref() == version && found.is_none() {
            found = Some(package);
        }
    }
    found.ok_or_else(|| ScanError::PackageVersionNotInNodeModules {
        name: name.to_string(),
        version: version.to_string(),
        path: node_modules_path.to_path_buf(),
    })
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

    Some(PackageInfo {
        is_scoped: name.starts_with('@'),
        name,
        version,
        dir: normalize_path(package_dir),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        for entry in fs::read_dir(temp_dir.path()).unwrap() {
            let entry = entry.unwrap();
            assert!(!is_directory_or_symlink(&entry).unwrap());
        }
    }

    #[test]
    fn read_package_info_parses_valid_package_json() {
        let temp_dir = tempfile::tempdir().unwrap();
        let pkg_json = serde_json::json!({
            "name": "my-package",
            "version": "1.2.3"
        });
        fs::write(
            temp_dir.path().join("package.json"),
            serde_json::to_string(&pkg_json).unwrap(),
        )
        .unwrap();

        let info = read_package_info(temp_dir.path(), "fallback").unwrap();
        assert_eq!(info.name.as_ref(), "my-package");
        assert_eq!(info.version.as_ref(), "1.2.3");
        assert!(!info.is_scoped);
    }

    #[test]
    fn read_package_info_uses_fallback_name() {
        let temp_dir = tempfile::tempdir().unwrap();
        let pkg_json = serde_json::json!({
            "version": "0.1.0"
        });
        fs::write(
            temp_dir.path().join("package.json"),
            serde_json::to_string(&pkg_json).unwrap(),
        )
        .unwrap();

        let info = read_package_info(temp_dir.path(), "fallback-name").unwrap();
        assert_eq!(info.name.as_ref(), "fallback-name");
    }

    #[test]
    fn read_package_info_returns_none_for_missing_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let result = read_package_info(temp_dir.path(), "anything");
        assert!(result.is_none());
    }

    #[test]
    fn read_package_info_detects_scoped_packages() {
        let temp_dir = tempfile::tempdir().unwrap();
        let pkg_json = serde_json::json!({
            "name": "@types/react",
            "version": "18.0.0"
        });
        fs::write(
            temp_dir.path().join("package.json"),
            serde_json::to_string(&pkg_json).unwrap(),
        )
        .unwrap();

        let info = read_package_info(temp_dir.path(), "fallback").unwrap();
        assert_eq!(info.name.as_ref(), "@types/react");
        assert!(info.is_scoped);
    }

    #[test]
    fn scan_packages_discovers_simple_structure() {
        let temp_dir = tempfile::tempdir().unwrap();
        let node_modules = temp_dir.path().join("node_modules");
        fs::create_dir(&node_modules).unwrap();

        let pkg_dir = node_modules.join("lodash");
        fs::create_dir(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            serde_json::to_string(&serde_json::json!({
                "name": "lodash",
                "version": "4.17.21"
            }))
            .unwrap(),
        )
        .unwrap();

        let dot_dir = node_modules.join(".pnpm");
        fs::create_dir(&dot_dir).unwrap();

        let packages = scan_packages(&node_modules).unwrap();
        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].name.as_ref(), "lodash");
        assert_eq!(packages[0].version.as_ref(), "4.17.21");
    }

    #[test]
    fn scan_packages_discovers_scoped_packages() {
        let temp_dir = tempfile::tempdir().unwrap();
        let node_modules = temp_dir.path().join("node_modules");
        fs::create_dir(&node_modules).unwrap();

        let scope_dir = node_modules.join("@types");
        fs::create_dir(&scope_dir).unwrap();
        let pkg_dir = scope_dir.join("react");
        fs::create_dir(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            serde_json::to_string(&serde_json::json!({
                "name": "@types/react",
                "version": "18.2.0"
            }))
            .unwrap(),
        )
        .unwrap();

        let packages = scan_packages(&node_modules).unwrap();
        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].name.as_ref(), "@types/react");
        assert!(packages[0].is_scoped);
    }
}
