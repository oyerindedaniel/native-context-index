use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rayon::prelude::*;
use tracing::{debug, trace, warn};

use crate::cache;
use crate::constants::DEFAULT_MAX_HOPS;
use crate::crawler::CrawlOptions;
use crate::filter::FilterConfig;
use crate::graph::build_package_graph;
use crate::profile::phases_enabled;
use crate::resolver::normalize_path;
use crate::scanner::{ScanError, scan_packages};
use crate::storage::NciDatabase;
use crate::types::{PackageGraph, PackageIndexMetadata, PackageInfo};

#[derive(Debug, Clone)]
pub struct IndexOptions {
    /// Upper bound on discovery edges from each package entry (default: 10).
    pub max_hops: usize,

    /// Whether to run in parallel (default: true).
    /// Set to false for deterministic output ordering in tests.
    pub parallel: bool,

    /// Read/write per-package graphs to SQLite under the OS cache dir (`NCI_CACHE_DIR` overrides).
    /// Disable in tests to avoid stale hits and shared-cache pollution.
    pub enable_package_cache: bool,

    /// Path to `nci.sqlite`. When `None`, uses [`crate::cache::nci_sqlite_path`].
    pub db_path: Option<PathBuf>,

    /// When set, `.nciignore` is loaded from this root before [`Self::filter`] is applied.
    pub project_root: Option<PathBuf>,

    /// Package-name filtering (ignore patterns, dep sections, CLI globs).
    pub filter: FilterConfig,

    /// Parallel symbol dependency resolution in graph build (see [`crate::crawler::CrawlOptions`]).
    pub parallel_resolve_deps: bool,

    /// When the SQLite per-package cache hits, load the full [`PackageGraph`] from the database.
    /// Default is **`false`**: only [`PackageIndexMetadata`] is read. Set **`true`**
    /// for tooling that needs symbols in RAM on a cache hit (e.g. demo JSON export, tests).
    pub hydrate_cache_hits: bool,
}

impl Default for IndexOptions {
    fn default() -> Self {
        Self {
            max_hops: DEFAULT_MAX_HOPS,
            parallel: true,
            enable_package_cache: true,
            db_path: None,
            project_root: None,
            filter: FilterConfig::default(),
            parallel_resolve_deps: true,
            hydrate_cache_hits: false,
        }
    }
}

fn merge_filter_for_scan(project_root: Option<&Path>, mut filter: FilterConfig) -> FilterConfig {
    if let Some(root) = project_root {
        filter = filter.with_nciignore_file(root);
    }
    filter
}

/// Index all packages in a `node_modules` directory.
///
/// Scans for packages, resolves types entry points, crawls `.d.ts` files,
/// and builds a symbol graph for each package.
///
/// When `parallel` is true (default), packages are processed concurrently
pub fn index_all(
    node_modules: &Path,
    options: Option<IndexOptions>,
) -> Result<Vec<IndexedGraph>, ScanError> {
    let index_opts = options.unwrap_or_default();
    let packages = scan_packages(node_modules)?;
    let filter = merge_filter_for_scan(
        index_opts.project_root.as_deref(),
        index_opts.filter.clone(),
    );
    let packages = filter.apply(packages);

    Ok(index_packages(&packages, Some(index_opts)))
}

/// Drops later entries that resolve to the same canonical package directory as an earlier one.
/// Scan roots should be ordered from highest priority (e.g. repo root `node_modules`) first.
pub fn dedupe_packages_by_canonical_dir(packages: Vec<PackageInfo>) -> Vec<PackageInfo> {
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();
    let mut unique: Vec<PackageInfo> = Vec::with_capacity(packages.len());
    for package in packages {
        let path = Path::new(package.dir.as_ref());
        let canonical_key = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if seen_dirs.insert(canonical_key) {
            unique.push(package);
        }
    }
    unique
}

/// Whether a graph came from the SQLite cache or a fresh crawl.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphSource {
    Cached,
    Crawled,
}

/// A graph together with its source (cache hit vs fresh crawl).
#[derive(Debug)]
pub struct IndexedGraph {
    pub graph: Option<PackageGraph>,
    pub source: GraphSource,
    pub cache_metadata: Option<PackageIndexMetadata>,
}

/// Builds a graph for each discovered package, optionally in parallel (Rayon).
///
/// Use this when packages were collected from several `node_modules` trees and deduped with
/// [`dedupe_packages_by_canonical_dir`].
pub fn index_packages(
    packages: &[PackageInfo],
    options: Option<IndexOptions>,
) -> Vec<IndexedGraph> {
    let index_opts = options.unwrap_or_default();
    let crawl_options_factory = |package: &PackageInfo| {
        Some(CrawlOptions {
            max_hops: index_opts.max_hops,
            profile_as: if phases_enabled() {
                Some(package.name.clone())
            } else {
                None
            },
            parallel_resolve_deps: index_opts.parallel_resolve_deps,
        })
    };

    let database_arc: Option<Arc<Mutex<NciDatabase>>> = if index_opts.enable_package_cache {
        if let Some(path) = index_opts.db_path.clone().or_else(cache::nci_sqlite_path) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            debug!(path = %path.display(), "package cache enabled");
            match NciDatabase::open(&path) {
                Ok(database) => Some(Arc::new(Mutex::new(database))),
                Err(open_error) => {
                    warn!(
                        path = %path.display(),
                        error = %open_error,
                        "NciDatabase::open failed; indexing without sqlite cache"
                    );
                    None
                }
            }
        } else {
            warn!("enable_package_cache is true but no sqlite path resolved (cache dir missing?)");
            None
        }
    } else {
        debug!("package cache disabled");
        None
    };

    let build_one = |package: &PackageInfo| -> IndexedGraph {
        if let Some(database_mutex) = database_arc.as_ref()
            && !cache::package_dir_is_symlink(package)
        {
            let database_guard = database_mutex
                .lock()
                .expect("sqlite storage mutex poisoned");
            if database_guard.has_cached_package(package, cache::NCI_ENGINE_VERSION) {
                if index_opts.hydrate_cache_hits {
                    if let Some(cached_graph) = database_guard.load_package(package) {
                        trace!(
                            package = %package.name.as_ref(),
                            version = %package.version.as_ref(),
                            "package cache hit (hydrated)"
                        );
                        return IndexedGraph {
                            graph: Some(cached_graph),
                            source: GraphSource::Cached,
                            cache_metadata: None,
                        };
                    }
                } else if let Some(meta) = database_guard.load_package_index_metadata(package) {
                    trace!(
                        package = %package.name.as_ref(),
                        version = %package.version.as_ref(),
                        "package cache hit (metadata only)"
                    );
                    return IndexedGraph {
                        graph: None,
                        source: GraphSource::Cached,
                        cache_metadata: Some(meta),
                    };
                }
                trace!(
                    package = %package.name.as_ref(),
                    "package cache miss (stale engine_version or load failed)"
                );
            } else {
                trace!(
                    package = %package.name.as_ref(),
                    "package cache miss (not in sqlite)"
                );
            }
        }

        let graph = build_package_graph(package, crawl_options_factory(package));

        if let Some(database_mutex) = database_arc.as_ref()
            && !cache::package_dir_is_symlink(package)
        {
            let mut database_guard = database_mutex
                .lock()
                .expect("sqlite storage mutex poisoned");
            if let Err(save_error) = database_guard.save_package(package, &graph) {
                warn!(
                    package = %package.name.as_ref(),
                    error = %save_error,
                    "save_package failed"
                );
            }
        }

        IndexedGraph {
            graph: Some(graph),
            source: GraphSource::Crawled,
            cache_metadata: None,
        }
    };

    if index_opts.parallel {
        packages.par_iter().map(build_one).collect()
    } else {
        packages.iter().map(build_one).collect()
    }
}

/// Index a single package by its directory path.
///
/// Useful for targeted indexing of a specific package without scanning
/// all of `node_modules`.
///
/// # Arguments
/// * `package_dir` - Absolute path to the package directory.
/// * `name` - Package name (e.g., `"react"` or `"@types/react"`).
/// * `version` - Package version string.
/// * `options` - Optional crawl configuration.
pub fn index_single(
    package_dir: &Path,
    name: &str,
    version: &str,
    options: Option<CrawlOptions>,
) -> PackageGraph {
    let info = PackageInfo {
        name: name.into(),
        version: version.into(),
        dir: normalize_path(package_dir),
        is_scoped: name.starts_with('@'),
    };

    build_package_graph(&info, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn index_all_returns_error_for_missing_dir() {
        let result = index_all(Path::new("/nonexistent/node_modules"), None);
        assert!(result.is_err());
    }

    #[test]
    fn index_all_handles_empty_node_modules() {
        let temp_dir = TempDir::new().unwrap();
        let result = index_all(temp_dir.path(), None);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn index_single_builds_graph() {
        let temp_dir = TempDir::new().unwrap();
        let pkg_dir = temp_dir.path();

        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "test-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();

        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare function hello(): void;",
        )
        .unwrap();

        let graph = index_single(pkg_dir, "test-pkg", "1.0.0", None);

        assert_eq!(graph.package, "test-pkg".into());
        assert_eq!(graph.version, "1.0.0".into());
        assert!(graph.total_symbols >= 1);
        assert!(
            graph
                .symbols
                .iter()
                .any(|symbol| symbol.name == "hello".into())
        );
    }

    #[test]
    fn index_all_discovers_and_indexes_packages() {
        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();

        let pkg_dir = node_modules_dir.join("my-lib");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "my-lib", "version": "3.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const VALUE: number;",
        )
        .unwrap();

        let result = index_all(
            node_modules_dir,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: false,
                ..Default::default()
            }),
        );

        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 1);
        let graph = results[0].graph.as_ref().expect("indexed graph");
        assert_eq!(graph.package, "my-lib".into());
        assert!(
            graph
                .symbols
                .iter()
                .any(|symbol| symbol.name == "VALUE".into())
        );
    }
}
