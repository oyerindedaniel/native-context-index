use std::cell::RefCell;
use std::collections::HashSet;
use std::fmt::{Debug, Formatter, Result as FmtResult};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
use crate::types::{PackageGraph, PackageIndexMetadata, PackageInfo, SharedString};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphSource {
    Cached,
    Crawled,
}

/// Per-package progress for CLI plain output (after outcome is final for this run).
#[derive(Clone)]
pub struct PackageProgress {
    pub name: SharedString,
    pub version: SharedString,
    pub source: GraphSource,
}

#[derive(Debug)]
pub struct IndexedGraph {
    pub graph: Option<PackageGraph>,
    pub source: GraphSource,
    pub cache_metadata: Option<PackageIndexMetadata>,
}

#[derive(Clone)]
pub struct IndexOptions {
    /// Upper bound on discovery edges from each package entry (default: 10).
    /// Use [`usize::MAX`] for no hop cap (CLI / `.nci.toml` use `max_hops = -1` → [`crate::constants::MAX_HOPS_UNLIMITED`]).
    pub max_hops: usize,

    /// Whether to run in parallel (default: true).
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

    /// After a **successful** SQLite persist of a freshly crawled package, keep the full
    /// [`PackageGraph`] in [`IndexedGraph`].
    ///
    /// Default **`false`**: only [`PackageIndexMetadata`] is attached (`graph: None`) to lower RAM
    /// for production-style indexing. Ignored when [`Self::enable_package_cache`] is false or when
    /// no save ran (e.g. symlink packages). After all save attempts fail, the graph is dropped.
    pub retain_graph_after_save: bool,

    /// Capacity of the bounded channel from crawl workers to the SQLite writer thread.
    ///
    /// When `None`, uses `max(4, rayon_max_threads * 2)` at call time for backpressure against
    /// slow `save_package` without queuing an unbounded number of full graphs in memory.
    pub save_queue_capacity: Option<usize>,

    /// Extra `save_package` attempts after the first try fails (writer thread). **`0`** = one try
    /// only. Backoff between retries is fixed internally (bounded ms + clock jitter).
    pub save_retry_count: u32,

    /// Normalized npm package roots for dependency stubbing (merged from `.nci.toml` and CLI).
    pub dependency_stub_packages: Vec<String>,

    /// Optional hook after each package’s index outcome is final (cache hit, persist skipped,
    /// send failure, or writer finished crawl+SQLite). Used by `nci index` plain output only.
    pub on_package_done: Option<Arc<dyn Fn(PackageProgress) + Send + Sync>>,
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
            retain_graph_after_save: false,
            save_queue_capacity: None,
            save_retry_count: 0,
            dependency_stub_packages: Vec::new(),
            on_package_done: None,
        }
    }
}

impl Debug for IndexOptions {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        f.debug_struct("IndexOptions")
            .field("max_hops", &self.max_hops)
            .field("parallel", &self.parallel)
            .field("enable_package_cache", &self.enable_package_cache)
            .field("db_path", &self.db_path)
            .field("project_root", &self.project_root)
            .field("filter", &self.filter)
            .field("parallel_resolve_deps", &self.parallel_resolve_deps)
            .field("hydrate_cache_hits", &self.hydrate_cache_hits)
            .field("retain_graph_after_save", &self.retain_graph_after_save)
            .field("save_queue_capacity", &self.save_queue_capacity)
            .field("save_retry_count", &self.save_retry_count)
            .field("dependency_stub_packages", &self.dependency_stub_packages)
            .field(
                "on_package_done",
                &self
                    .on_package_done
                    .as_ref()
                    .map(|_| "<callback>")
                    .unwrap_or("<none>"),
            )
            .finish()
    }
}

fn sleep_after_failed_save_attempt() {
    const BASE_MS: u64 = 35;
    const SPAN_MS: u64 = 40;
    let extra = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| (elapsed.subsec_nanos() as u64) % (SPAN_MS + 1))
        .unwrap_or(0);
    thread::sleep(Duration::from_millis(BASE_MS + extra));
}

fn default_save_queue_depth() -> usize {
    rayon::current_num_threads().saturating_mul(2).max(4)
}

fn index_metadata_from_graph(graph: &PackageGraph) -> PackageIndexMetadata {
    PackageIndexMetadata {
        package: graph.package.clone(),
        version: graph.version.clone(),
        total_symbols: graph.total_symbols,
        total_files: graph.total_files,
        crawl_duration_ms: graph.crawl_duration_ms,
        build_duration_ms: graph.build_duration_ms,
    }
}

// One read-only `NciDatabase` per OS thread for cache probes (Rayon workers). Path is tracked so a
// different `nci.sqlite` on a later run reopens. See `release_read_only_sqlite_thread_local`.
thread_local! {
    static INDEX_RO_SQLITE: RefCell<Option<(PathBuf, Option<NciDatabase>)>> = const { RefCell::new(None) };
}

/// Drop the per-thread read-only handle before crawl / writer handoff so the writer is not blocked
/// by a lingering reader on the same file (cache **miss** paths only; hits keep reuse).
/// No-op if this thread never got a live read-only connection (avoids clearing a failed-open slot
/// so the next probe retries after the writer creates the file).
fn release_read_only_sqlite_thread_local() {
    INDEX_RO_SQLITE.with(|cell| {
        let has_open_db = cell
            .borrow()
            .as_ref()
            .is_some_and(|(_, db)| db.is_some());
        if has_open_db {
            *cell.borrow_mut() = None;
        }
    });
}

fn with_read_only_index_db<T>(sqlite_path: &Path, f: impl FnOnce(Option<&NciDatabase>) -> T) -> T {
    INDEX_RO_SQLITE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let path_buf = sqlite_path.to_path_buf();
        let need_open = match slot.as_ref() {
            None => true,
            Some((cached_path, db)) => cached_path != &path_buf || db.is_none(),
        };
        if need_open {
            match NciDatabase::open_read_only(sqlite_path) {
                Ok(database) => *slot = Some((path_buf, Some(database))),
                Err(open_error) => {
                    trace!(
                        path = %sqlite_path.display(),
                        error = %open_error,
                        "read-only sqlite open failed for this thread"
                    );
                    *slot = Some((path_buf, None));
                }
            }
        }
        let db_ref = slot.as_ref().and_then(|(_, db)| db.as_ref());
        f(db_ref)
    })
}

fn try_package_cache_hit(
    package: &PackageInfo,
    sqlite_path: &Path,
    hydrate_cache_hits: bool,
    engine_cache_key: &str,
) -> Option<IndexedGraph> {
    if cache::package_dir_is_symlink(package) {
        return None;
    }
    let indexed_from_cache = with_read_only_index_db(sqlite_path, |db| {
        let db = db?;
        if !db.has_cached_package(package, engine_cache_key) {
            trace!(
                package = %package.name.as_ref(),
                "package cache miss (not in sqlite)"
            );
            return None;
        }
        if hydrate_cache_hits {
            if let Some(cached_graph) = db.load_package(package) {
                trace!(
                    package = %package.name.as_ref(),
                    version = %package.version.as_ref(),
                    "package cache hit (hydrated)"
                );
                return Some(IndexedGraph {
                    graph: Some(cached_graph),
                    source: GraphSource::Cached,
                    cache_metadata: None,
                });
            }
            trace!(
                package = %package.name.as_ref(),
                "package cache miss (stale engine_version or load failed)"
            );
            None
        } else if let Some(meta) = db.load_package_index_metadata(package) {
            trace!(
                package = %package.name.as_ref(),
                version = %package.version.as_ref(),
                "package cache hit (metadata only)"
            );
            Some(IndexedGraph {
                graph: None,
                source: GraphSource::Cached,
                cache_metadata: Some(meta),
            })
        } else {
            trace!(
                package = %package.name.as_ref(),
                "package cache miss (stale engine_version or load failed)"
            );
            None
        }
    });
    if indexed_from_cache.is_none() {
        release_read_only_sqlite_thread_local();
    }
    indexed_from_cache
}

fn merge_filter_for_scan(project_root: Option<&Path>, mut filter: FilterConfig) -> FilterConfig {
    if let Some(root) = project_root {
        filter = filter.with_nciignore_file(root);
    }
    filter
}

/// Scan `node_modules` and apply the same filtering as [`index_all`] (including `.nciignore` when
/// `project_root` is set on `options`).
pub fn scan_filtered_packages(
    node_modules: &Path,
    options: &IndexOptions,
) -> Result<Vec<PackageInfo>, ScanError> {
    let packages = scan_packages(node_modules)?;
    let filter = merge_filter_for_scan(
        options.project_root.as_deref(),
        options.filter.clone(),
    );
    Ok(filter.apply(packages))
}

/// Index all packages in a `node_modules` directory.
pub fn index_all(
    node_modules: &Path,
    options: Option<IndexOptions>,
) -> Result<Vec<IndexedGraph>, ScanError> {
    let index_opts = options.unwrap_or_default();
    let packages = scan_filtered_packages(node_modules, &index_opts)?;
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

/// Builds a graph for each discovered package, optionally in parallel (Rayon).
///
/// Use this when packages were collected from several `node_modules` trees and deduped with
/// [`dedupe_packages_by_canonical_dir`].
pub fn index_packages(
    packages: &[PackageInfo],
    options: Option<IndexOptions>,
) -> Vec<IndexedGraph> {
    let index_opts = options.unwrap_or_default();
    let on_package_done = index_opts.on_package_done.clone();
    let index_engine_cache_key = cache::index_engine_cache_key(&index_opts.dependency_stub_packages);
    let crawl_stub_roots: Arc<HashSet<String>> = Arc::new(
        index_opts
            .dependency_stub_packages
            .iter()
            .cloned()
            .collect(),
    );
    let crawl_max_hops = index_opts.max_hops;
    let crawl_parallel_resolve_deps = index_opts.parallel_resolve_deps;
    let crawl_profile_phases = phases_enabled();
    let crawl_options_factory = move |package: &PackageInfo| {
        Some(CrawlOptions {
            max_hops: crawl_max_hops,
            profile_as: if crawl_profile_phases {
                Some(package.name.clone())
            } else {
                None
            },
            parallel_resolve_deps: crawl_parallel_resolve_deps,
            dependency_stub_roots: Arc::clone(&crawl_stub_roots),
            ..Default::default()
        })
    };

    let n = packages.len();
    if n == 0 {
        return Vec::new();
    }

    // `None` means no SQLite sidecar for this run (probes + saves disabled).
    // When enabled, we only ensure the parent directory exists; the writer thread's `NciDatabase::open`
    // validates the path (read-only probes retry until the file exists).
    let cache_sqlite_path: Option<PathBuf> = if index_opts.enable_package_cache {
        if let Some(path) = index_opts.db_path.clone().or_else(cache::nci_sqlite_path) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            debug!(path = %path.display(), "package cache enabled");
            Some(path)
        } else {
            warn!("enable_package_cache is true but no sqlite path resolved (cache dir missing?)");
            None
        }
    } else {
        debug!("package cache disabled");
        None
    };

    let queue_capacity = index_opts
        .save_queue_capacity
        .unwrap_or_else(default_save_queue_depth);

    let results: Arc<Vec<Mutex<Option<IndexedGraph>>>> =
        Arc::new((0..n).map(|_| Mutex::new(None)).collect());

    type SaveMsg = (usize, PackageInfo, PackageGraph);
    let (writer_join, save_tx_shared): (
        Option<std::thread::JoinHandle<()>>,
        Option<Arc<mpsc::SyncSender<SaveMsg>>>,
    ) = if let Some(ref sqlite_path) = cache_sqlite_path {
        let (save_tx, save_rx) = mpsc::sync_channel::<SaveMsg>(queue_capacity);
        let save_tx = Arc::new(save_tx);
        let save_tx_thread = Arc::clone(&save_tx);
        let results_thread = Arc::clone(&results);
        let sqlite_path_owned = sqlite_path.clone();
        let retain = index_opts.retain_graph_after_save;
        let save_attempts = index_opts.save_retry_count.saturating_add(1).max(1);
        let engine_cache_key_for_writer = index_engine_cache_key.clone();
        let package_done_writer = on_package_done.clone();
        let join = std::thread::spawn(move || {
            let mut db_opt = match NciDatabase::open(&sqlite_path_owned) {
                Ok(database) => Some(database),
                Err(open_error) => {
                    warn!(
                        path = %sqlite_path_owned.display(),
                        error = %open_error,
                        "writer NciDatabase::open failed; skipping sqlite persists"
                    );
                    None
                }
            };
            while let Ok((idx, package, graph)) = save_rx.recv() {
                let slot = &results_thread[idx];
                let indexed = if let Some(ref mut db) = db_opt {
                    let mut last_err = None;
                    let mut saved = false;
                    for attempt in 0..save_attempts {
                        match db.save_package(&package, &graph, engine_cache_key_for_writer.as_str()) {
                            Ok(()) => {
                                saved = true;
                                break;
                            }
                            Err(err) => {
                                last_err = Some(err);
                                if attempt + 1 < save_attempts {
                                    trace!(
                                        package = %package.name.as_ref(),
                                        attempt = attempt + 1,
                                        max = save_attempts,
                                        "save_package failed; retrying after delay"
                                    );
                                    sleep_after_failed_save_attempt();
                                }
                            }
                        }
                    }
                    if saved {
                        if retain {
                            IndexedGraph {
                                graph: Some(graph),
                                source: GraphSource::Crawled,
                                cache_metadata: None,
                            }
                        } else {
                            let meta = index_metadata_from_graph(&graph);
                            drop(graph);
                            IndexedGraph {
                                graph: None,
                                source: GraphSource::Crawled,
                                cache_metadata: Some(meta),
                            }
                        }
                    } else {
                        let err = last_err.expect("save_package failed without error");
                        warn!(
                            package = %package.name.as_ref(),
                            attempts = save_attempts,
                            error = %err,
                            "save_package failed"
                        );
                        let meta = index_metadata_from_graph(&graph);
                        drop(graph);
                        IndexedGraph {
                            graph: None,
                            source: GraphSource::Crawled,
                            cache_metadata: Some(meta),
                        }
                    }
                } else {
                    IndexedGraph {
                        graph: Some(graph),
                        source: GraphSource::Crawled,
                        cache_metadata: None,
                    }
                };
                *slot.lock().expect("indexed result mutex poisoned") = Some(indexed);
                if let Some(cb) = package_done_writer.as_ref() {
                    cb(PackageProgress {
                        name: package.name.clone(),
                        version: package.version.clone(),
                        source: GraphSource::Crawled,
                    });
                }
            }
        });
        (Some(join), Some(save_tx_thread))
    } else {
        (None, None)
    };

    let hydrate = index_opts.hydrate_cache_hits;
    let process_index = |i: usize, package: &PackageInfo| {
        if let Some(ref path) = cache_sqlite_path {
            if let Some(indexed) =
                try_package_cache_hit(package, path.as_path(), hydrate, index_engine_cache_key.as_str())
            {
                *results[i].lock().expect("indexed result mutex poisoned") = Some(indexed);
                if let Some(cb) = on_package_done.as_ref() {
                    cb(PackageProgress {
                        name: package.name.clone(),
                        version: package.version.clone(),
                        source: GraphSource::Cached,
                    });
                }
                return;
            }
        }

        let graph = build_package_graph(package, crawl_options_factory(package));

        let persist_skipped = cache_sqlite_path.is_none() || cache::package_dir_is_symlink(package);
        if persist_skipped {
            *results[i].lock().expect("indexed result mutex poisoned") = Some(IndexedGraph {
                graph: Some(graph),
                source: GraphSource::Crawled,
                cache_metadata: None,
            });
            if let Some(cb) = on_package_done.as_ref() {
                cb(PackageProgress {
                    name: package.name.clone(),
                    version: package.version.clone(),
                    source: GraphSource::Crawled,
                });
            }
            return;
        }

        let save_tx = save_tx_shared.as_ref().expect("save channel when sqlite path set");
        let save_tx = Arc::clone(save_tx);
        if let Err(send_error) = save_tx.send((i, package.clone(), graph)) {
            let (_i, _pkg, graph) = send_error.0;
            warn!(
                package = %package.name.as_ref(),
                "save queue disconnected before persist; returning crawled graph without save"
            );
            *results[i].lock().expect("indexed result mutex poisoned") = Some(IndexedGraph {
                graph: Some(graph),
                source: GraphSource::Crawled,
                cache_metadata: None,
            });
            if let Some(cb) = on_package_done.as_ref() {
                cb(PackageProgress {
                    name: package.name.clone(),
                    version: package.version.clone(),
                    source: GraphSource::Crawled,
                });
            }
        }
    };

    if index_opts.parallel {
        packages
            .par_iter()
            .enumerate()
            .for_each(|(i, package)| process_index(i, package));
    } else {
        for (i, package) in packages.iter().enumerate() {
            process_index(i, package);
        }
    }

    drop(save_tx_shared);

    if let Some(join) = writer_join {
        if let Err(join_error) = join.join() {
            std::panic::resume_unwind(join_error);
        }
    }

    Arc::try_unwrap(results)
        .expect("results Arc still held")
        .into_iter()
        .map(|mutex| mutex.into_inner().expect("indexed result mutex poisoned").expect("indexed slot empty"))
        .collect()
}

/// Index a single package by its directory path.
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

    use crate::scanner::scan_packages;

    #[test]
    fn index_all_returns_error_for_missing_dir() {
        let result = index_all(Path::new("/nonexistent/node_modules"), None);
        assert!(result.is_err());
    }

    #[test]
    fn index_all_handles_empty_node_modules() {
        let temp_dir = TempDir::new().unwrap();
        let result = index_all(
            temp_dir.path(),
            Some(IndexOptions {
                enable_package_cache: false,
                ..Default::default()
            }),
        );
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

    #[test]
    fn index_packages_drops_graph_after_save_when_retain_false() {
        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();
        let db_path = temp_dir.path().join("nci.sqlite");

        let pkg_dir = node_modules_dir.join("tiny-pkg");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "tiny-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const X: number;",
        )
        .unwrap();

        let packages = scan_packages(node_modules_dir).unwrap();
        let indexed = index_packages(
            &packages,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: true,
                db_path: Some(db_path.clone()),
                retain_graph_after_save: false,
                ..Default::default()
            }),
        );

        assert_eq!(indexed.len(), 1);
        assert_eq!(indexed[0].source, GraphSource::Crawled);
        assert!(
            indexed[0].graph.is_none(),
            "expected no graph in RAM after save when retain_graph_after_save is false"
        );
        let meta = indexed[0].cache_metadata.as_ref().expect("metadata after crawl+save");
        assert_eq!(meta.package, "tiny-pkg".into());
        assert!(meta.total_symbols >= 1);
    }

    #[test]
    fn index_packages_keeps_graph_after_save_when_retain_true() {
        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();
        let db_path = temp_dir.path().join("nci.sqlite");

        let pkg_dir = node_modules_dir.join("tiny-pkg2");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "tiny-pkg2", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const Y: number;",
        )
        .unwrap();

        let packages = scan_packages(node_modules_dir).unwrap();
        let indexed = index_packages(
            &packages,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: true,
                db_path: Some(db_path),
                retain_graph_after_save: true,
                ..Default::default()
            }),
        );

        assert_eq!(indexed.len(), 1);
        let graph = indexed[0].graph.as_ref().expect("graph retained");
        assert_eq!(graph.package, "tiny-pkg2".into());
        assert!(indexed[0].cache_metadata.is_none());
    }
}