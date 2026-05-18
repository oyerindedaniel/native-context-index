use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::types::PackageInfo;

/// Crate version baked at compile time (diagnostics only — not used in [`index_engine_cache_key`]).
pub const NCI_ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Bump when crawl/build output stored in SQLite changes (extractor fields, merge rules, symbol ids).
///
/// Independent of [`crate::storage_migrations::SCHEMA_VERSION`] and [`NCI_ENGINE_VERSION`].
pub const INDEXER_OUTPUT_REVISION: u32 = 1;

/// FNV-1a 64-bit offset basis
const FNV1A64_OFFSET_BASIS: u64 = 0xcbf29ce484222325;

const FNV1A64_PRIME: u64 = 0x00000100000001B3;

/// Fingerprint stored on `packages.index_cache_key` for indexer cache hits.
///
/// Format: `i{INDEXER_OUTPUT_REVISION}+{stub_roots_fingerprint:x}`
///
/// `stub_roots_fingerprint` is FNV-1a over stub names sorted lexicographically and joined with `\n`.
///
/// Schema migrations and crate releases do not invalidate this key. Bump [`INDEXER_OUTPUT_REVISION`]
/// when TS indexer output changes; use [`crate::storage_migrations::MigrationKind::Backfill`] when
/// symbol rows can be patched in SQL without a recrawl.
pub fn index_engine_cache_key(stub_roots_normalized: &[String]) -> String {
    format!(
        "i{}+{:x}",
        INDEXER_OUTPUT_REVISION,
        stub_roots_fingerprint(stub_roots_normalized)
    )
}

fn fnv1a64(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV1A64_PRIME);
    }
    hash
}

fn stub_roots_fingerprint(stub_roots_normalized: &[String]) -> u64 {
    let mut sorted_stubs: Vec<&str> = stub_roots_normalized.iter().map(String::as_str).collect();
    sorted_stubs.sort_unstable();
    sorted_stubs.dedup();
    let mut hash = FNV1A64_OFFSET_BASIS;
    for (index, stub) in sorted_stubs.iter().enumerate() {
        if index > 0 {
            hash = fnv1a64(hash, b"\n");
        }
        hash = fnv1a64(hash, stub.as_bytes());
    }
    hash
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
    use crate::storage_migrations::SCHEMA_VERSION;
    use crate::types::{SharedString, SharedVec};

    static CACHE_ENV_MUTEX: Mutex<()> = Mutex::new(());

    fn sample_package(package_name: &str, package_version: &str, directory: &str) -> PackageInfo {
        PackageInfo {
            name: SharedString::from(package_name),
            version: SharedString::from(package_version),
            dir: SharedString::from(directory),
            is_scoped: package_name.starts_with('@'),
            declared_dependencies: SharedVec::from([]),
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
    fn index_cache_key_uses_indexer_output_revision_only() {
        let cache_key = index_engine_cache_key(&[]);
        assert!(
            cache_key.starts_with(&format!("i{INDEXER_OUTPUT_REVISION}+")),
            "expected indexer prefix, got {cache_key}"
        );
        assert!(
            !cache_key.contains(NCI_ENGINE_VERSION),
            "crate version must not be in cache key"
        );
        assert!(
            !cache_key.contains(&format!("s{SCHEMA_VERSION}")),
            "schema version must not be in cache key"
        );
    }

    #[test]
    fn index_cache_key_changes_when_stub_roots_differ() {
        let empty_roots = index_engine_cache_key(&[]);
        let with_stub = index_engine_cache_key(&["@types/node".to_string()]);
        assert_ne!(empty_roots, with_stub);
    }

    #[test]
    fn index_cache_key_is_independent_of_stub_root_order() {
        let forward = index_engine_cache_key(&["@types/node".to_string(), "zod".to_string()]);
        let reverse = index_engine_cache_key(&["zod".to_string(), "@types/node".to_string()]);
        assert_eq!(forward, reverse);
    }

    #[test]
    fn stub_roots_fingerprint_is_stable_for_known_input() {
        let first = stub_roots_fingerprint(&["zod".to_string()]);
        let second = stub_roots_fingerprint(&["zod".to_string()]);
        assert_eq!(first, second);
        assert_eq!(
            first,
            stub_roots_fingerprint(&["zod".to_string(), "zod".to_string()])
        );
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
