//! Cache locations on disk (`nci.sqlite` under the OS cache dir).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::types::PackageInfo;

/// Engine version baked at compile time; bumping invalidates rows where `packages.engine_version` differs.
pub const NCI_ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// SQLite `packages.engine_version` value: crate version plus a hash of normalized `dependency_stub_packages`
/// so cache hits invalidate when stub config changes.
pub fn index_engine_cache_key(stub_roots_normalized: &[String]) -> String {
    let mut hasher = DefaultHasher::new();
    stub_roots_normalized.hash(&mut hasher);
    format!("{}+{:x}", NCI_ENGINE_VERSION, hasher.finish())
}

const CACHE_SUBDIR: &str = "nci";

/// Optional override for tests or CI (`NCI_CACHE_DIR` points at the cache root).
pub fn nci_cache_root_from_env() -> Option<PathBuf> {
    std::env::var_os("NCI_CACHE_DIR").map(PathBuf::from)
}

/// `…/nci` under the OS cache dir (or `NCI_CACHE_DIR` when set).
pub fn nci_cache_base_dir() -> Option<PathBuf> {
    nci_cache_root_from_env().or_else(|| {
        dirs::cache_dir().map(|mut path| {
            path.push(CACHE_SUBDIR);
            path
        })
    })
}

pub fn nci_sqlite_path() -> Option<PathBuf> {
    let mut path = nci_cache_base_dir()?;
    path.push("nci.sqlite");
    Some(path)
}

pub fn ensure_nci_cache_base_dir() -> io::Result<PathBuf> {
    let dir = nci_cache_base_dir().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "no cache directory (dirs::cache_dir returned None and NCI_CACHE_DIR unset)",
        )
    })?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Returns `true` if the package directory looks like a symlink (skip cache for linked workspaces).
pub fn package_dir_is_symlink(package: &PackageInfo) -> bool {
    fs::symlink_metadata(Path::new(package.dir.as_ref()))
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::types::SharedString;

    static CACHE_ENV_MUTEX: Mutex<()> = Mutex::new(());

    fn sample_package(package_name: &str, package_version: &str, directory: &str) -> PackageInfo {
        PackageInfo {
            name: SharedString::from(package_name),
            version: SharedString::from(package_version),
            dir: SharedString::from(directory),
            is_scoped: package_name.starts_with('@'),
        }
    }

    fn run_with_nci_cache_root<T>(cache_root: &Path, body: impl FnOnce() -> T) -> T {
        let lock = CACHE_ENV_MUTEX.lock().expect("cache env mutex poisoned");
        let _keep_lock = lock;
        let previous = std::env::var_os("NCI_CACHE_DIR");
        // SAFETY: `CACHE_ENV_MUTEX` ensures no concurrent `set_var` / `remove_var` in these tests.
        unsafe {
            std::env::set_var("NCI_CACHE_DIR", cache_root.as_os_str());
        }
        let output = body();
        unsafe {
            match previous {
                None => std::env::remove_var("NCI_CACHE_DIR"),
                Some(ref value) => std::env::set_var("NCI_CACHE_DIR", value),
            }
        }
        output
    }

    #[test]
    fn nci_sqlite_path_under_env_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        run_with_nci_cache_root(temp.path(), || {
            assert_eq!(nci_sqlite_path(), Some(temp.path().join("nci.sqlite")));
        });
    }

    #[test]
    fn ensure_nci_cache_base_dir_creates_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        run_with_nci_cache_root(temp.path(), || {
            let resolved = ensure_nci_cache_base_dir().expect("ensure");
            assert!(resolved.is_dir());
            assert_eq!(resolved, temp.path());
        });
    }

    #[test]
    fn package_dir_is_symlink_false_for_normal_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let real_dir = temp.path().join("realdir");
        fs::create_dir_all(&real_dir).expect("mkdir");
        let pkg = sample_package("x", "1.0.0", real_dir.to_str().expect("utf8 path"));
        assert!(!package_dir_is_symlink(&pkg));
    }

    #[cfg(unix)]
    #[test]
    fn package_dir_is_symlink_true_when_dir_is_symlink() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().expect("tempdir");
        let target = temp.path().join("target_dir");
        fs::create_dir_all(&target).expect("mkdir");
        let link_path = temp.path().join("link_dir");
        symlink(&target, &link_path).expect("symlink");

        let pkg = sample_package("sym", "1.0.0", link_path.to_str().expect("utf8 path"));
        assert!(package_dir_is_symlink(&pkg));
    }
}
