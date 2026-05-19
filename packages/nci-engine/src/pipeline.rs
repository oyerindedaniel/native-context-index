use std::cell::RefCell;
use std::collections::HashSet;
use std::fmt::Debug;
use std::fs;
use std::panic;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use tracing::{debug, trace, warn};

use crate::cache;
use crate::concurrency::{log_index_concurrency_plan, resolve_index_concurrency_plan};
use crate::crawler::CrawlOptions;
use crate::filter::FilterConfig;
use crate::graph::build_package_graph;
use crate::profile::phases_enabled;
use crate::resolver::normalize_path;
use crate::scanner::{ScanError, scan_packages};
use crate::storage::NciDatabase;
use crate::types::{PackageGraph, PackageIndexMetadata, PackageInfo, SharedString, SharedVec};

pub use crate::index_options::{
    GraphSource, IndexOptions, IndexPhaseEvent, PackageProgress, PackageTimingBreakdown,
};

#[derive(Debug)]
struct PackageTimingSlot {
    started: Option<Instant>,
    crawl_finished: Option<Instant>,
    save_started: Option<Instant>,
}

/// End-to-end elapsed and crawl / queue / save split for stderr progress (see `nci index --index-timing-detail`).
fn compute_package_timing(
    slot: &PackageTimingSlot,
    finished_at: Instant,
) -> (Duration, PackageTimingBreakdown) {
    let started = slot.started.unwrap_or(finished_at);
    let crawl_finished = slot.crawl_finished.unwrap_or(finished_at);
    let crawl = crawl_finished.saturating_duration_since(started);
    let save_started = slot.save_started.unwrap_or(crawl_finished);
    let queue_wait = save_started.saturating_duration_since(crawl_finished);
    let save = finished_at.saturating_duration_since(save_started);
    let elapsed = finished_at.saturating_duration_since(started);
    (
        elapsed,
        PackageTimingBreakdown {
            crawl,
            queue_wait,
            save,
        },
    )
}

fn mark_package_timing_started(
    timing_slots: &Arc<Vec<Mutex<PackageTimingSlot>>>,
    package_index: usize,
) {
    let mut slot = timing_slots[package_index]
        .lock()
        .expect("package timing mutex poisoned");
    slot.started = Some(Instant::now());
}

fn mark_package_crawl_finished(
    timing_slots: &Arc<Vec<Mutex<PackageTimingSlot>>>,
    package_index: usize,
) {
    let mut slot = timing_slots[package_index]
        .lock()
        .expect("package timing mutex poisoned");
    if slot.crawl_finished.is_none() {
        slot.crawl_finished = Some(Instant::now());
    }
}

fn mark_package_save_started(
    timing_slots: &Arc<Vec<Mutex<PackageTimingSlot>>>,
    package_index: usize,
) {
    let mut slot = timing_slots[package_index]
        .lock()
        .expect("package timing mutex poisoned");
    if slot.save_started.is_none() {
        slot.save_started = Some(Instant::now());
    }
}

struct FinishPackageProgressArgs {
    on_package_done: Option<Arc<dyn Fn(PackageProgress) + Send + Sync>>,
    timing_slots: Option<Arc<Vec<Mutex<PackageTimingSlot>>>>,
    index_timing_detail: bool,
    package_index: usize,
    name: SharedString,
    version: SharedString,
    source: GraphSource,
    total_symbols: usize,
    persisted: bool,
}

fn finish_package_progress(args: FinishPackageProgressArgs) {
    let Some(callback) = args.on_package_done.as_ref() else {
        return;
    };
    let finished_at = Instant::now();
    let (elapsed, timing_breakdown) = if let Some(slots) = args.timing_slots.as_ref() {
        let slot = slots[args.package_index]
            .lock()
            .expect("package timing mutex poisoned");
        let (elapsed, breakdown) = compute_package_timing(&slot, finished_at);
        let breakdown = args.index_timing_detail.then_some(breakdown);
        (elapsed, breakdown)
    } else {
        (Duration::ZERO, None)
    };
    callback(PackageProgress {
        name: args.name,
        version: args.version,
        source: args.source,
        total_symbols: args.total_symbols,
        persisted: args.persisted,
        elapsed,
        timing_breakdown,
    });
}

#[derive(Debug)]
pub struct IndexedGraph {
    pub graph: Option<PackageGraph>,
    pub source: GraphSource,
    pub cache_metadata: Option<PackageIndexMetadata>,
    pub persisted: bool,
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

fn indexed_total_symbols(indexed: &IndexedGraph) -> usize {
    indexed
        .graph
        .as_ref()
        .map(|graph| graph.total_symbols)
        .or_else(|| {
            indexed
                .cache_metadata
                .as_ref()
                .map(|metadata| metadata.total_symbols)
        })
        .unwrap_or(0)
}

// One read-only `NciDatabase` per OS thread for cache probes (Rayon workers). Path is tracked so a
// different `nci.sqlite` on a later run reopens. See `release_read_only_sqlite_thread_local`.
thread_local! {
    static INDEX_RO_SQLITE: RefCell<Option<(PathBuf, Option<NciDatabase>)>> = const { RefCell::new(None) };
}

/// Drop the per-thread read-only handle on cache **miss** after a probe that had a live RO
/// connection (hits keep reuse). Miss paths soon crawl and may enqueue a save; closing here avoids
/// holding an idle handle through that work and trims extra concurrent readers (minor WAL
/// checkpoint / `BUSY` hygiene).
/// No-op if this thread never got a live read-only connection (avoids clearing a failed-open slot
/// so the next probe retries after the writer creates the file).
fn release_read_only_sqlite_thread_local() {
    INDEX_RO_SQLITE.with(|cell| {
        let has_open_db = cell.borrow().as_ref().is_some_and(|(_, db)| db.is_some());
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
    pending_backfill_hint: Option<Option<u32>>,
) -> Option<IndexedGraph> {
    if cache::package_dir_is_symlink(package) {
        return None;
    }
    let indexed_from_cache = with_read_only_index_db(sqlite_path, |db| {
        let db = db?;
        if !db.has_cached_package(package, engine_cache_key, pending_backfill_hint) {
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
                    persisted: true,
                });
            }
            trace!(
                package = %package.name.as_ref(),
                "package cache miss (index_cache_key mismatch or load failed)"
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
                persisted: true,
            })
        } else {
            trace!(
                package = %package.name.as_ref(),
                "package cache miss (index_cache_key mismatch or load failed)"
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
    let filter = merge_filter_for_scan(options.project_root.as_deref(), options.filter.clone());
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
        let canonical_key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
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
    let index_timing_detail = index_opts.index_timing_detail;
    let track_package_timing = on_package_done.is_some();
    let index_engine_cache_key =
        cache::index_engine_cache_key(&index_opts.dependency_stub_packages);
    let mut pending_backfill_revision = index_opts.pending_backfill_revision;
    let crawl_stub_roots: Arc<HashSet<String>> = Arc::new(
        index_opts
            .dependency_stub_packages
            .iter()
            .cloned()
            .collect(),
    );
    let package_count = packages.len();
    if package_count == 0 {
        return Vec::new();
    }

    let concurrency_plan = resolve_index_concurrency_plan(&index_opts, package_count);
    log_index_concurrency_plan(&concurrency_plan, package_count);

    let crawl_max_hops = index_opts.max_hops;
    let crawl_parallel_resolve_deps =
        index_opts.parallel_resolve_deps && concurrency_plan.graph_dep_parallel_allowed;
    let crawl_parallel_parse_layers = concurrency_plan.crawl_layer_parallel_allowed;
    let crawl_min_layer_files = concurrency_plan.min_layer_files_for_parallel;
    let crawl_min_symbols = concurrency_plan.min_symbols_for_dep_parallel;
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
            parallel_parse_layers: crawl_parallel_parse_layers,
            min_layer_files_for_parallel: crawl_min_layer_files,
            min_symbols_for_dep_parallel: crawl_min_symbols,
            dependency_stub_roots: Arc::clone(&crawl_stub_roots),
            ..Default::default()
        })
    };

    // `None` means no SQLite sidecar for this run (probes + saves disabled).
    // Open once here to create/migrate before parallel read-only probes; the writer opens the same path again.
    let cache_sqlite_path: Option<PathBuf> = if index_opts.enable_package_cache {
        if let Some(path) = index_opts.db_path.clone().or_else(cache::nci_sqlite_path) {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            debug!(path = %path.display(), "package cache enabled");
            match NciDatabase::open_with_pragmas(&path, index_opts.storage_connection_pragmas) {
                Ok(mut database) => {
                    if pending_backfill_revision.is_none() {
                        pending_backfill_revision = database.pending_backfill_version().ok();
                    }
                    let phase_callback = index_opts.on_index_phase.clone();
                    match database.count_packages_pending_backfill(index_engine_cache_key.as_str())
                    {
                        Ok(pending_count) if pending_count > 0 => {
                            let packages_in_scope = database
                                .count_packages_pending_in_scope(
                                    packages,
                                    index_engine_cache_key.as_str(),
                                )
                                .unwrap_or(0);
                            if let Some(callback) = phase_callback.as_ref() {
                                callback(IndexPhaseEvent::ForegroundBackfillStart {
                                    pending_global: pending_count,
                                    packages_in_scope,
                                });
                            }
                            trace!(
                                pending_packages = pending_count,
                                index_scope = package_count,
                                packages_in_scope,
                                "foreground package backfill before cache probes"
                            );
                            let backfill_started = std::time::Instant::now();
                            match database.foreground_backfill_for_packages(
                                packages,
                                index_engine_cache_key.as_str(),
                            ) {
                                Ok(backfill_result) => {
                                    if let Some(callback) = phase_callback.as_ref() {
                                        callback(IndexPhaseEvent::ForegroundBackfillDone {
                                            elapsed: backfill_started.elapsed(),
                                            packages_backfilled: backfill_result
                                                .packages_backfilled,
                                            symbol_rows_updated: backfill_result
                                                .symbol_rows_updated,
                                        });
                                    }
                                }
                                Err(backfill_error) => {
                                    warn!(
                                        error = %backfill_error,
                                        "foreground package backfill failed; continuing index"
                                    );
                                    if let Some(callback) = phase_callback.as_ref() {
                                        callback(IndexPhaseEvent::ForegroundBackfillFailed {
                                            elapsed: backfill_started.elapsed(),
                                            message: backfill_error.to_string(),
                                        });
                                    }
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(count_error) => {
                            warn!(
                                error = %count_error,
                                "could not count pending package backfill"
                            );
                        }
                    }
                    Some(path)
                }
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

    let queue_capacity = index_opts
        .save_queue_capacity
        .unwrap_or(concurrency_plan.save_queue_capacity);

    let results: Arc<Vec<Mutex<Option<IndexedGraph>>>> =
        Arc::new((0..package_count).map(|_| Mutex::new(None)).collect());

    let timing_slots: Option<Arc<Vec<Mutex<PackageTimingSlot>>>> = if track_package_timing {
        Some(Arc::new(
            (0..package_count)
                .map(|_| {
                    Mutex::new(PackageTimingSlot {
                        started: None,
                        crawl_finished: None,
                        save_started: None,
                    })
                })
                .collect(),
        ))
    } else {
        None
    };

    type SaveMsg = (usize, PackageInfo, PackageGraph);
    let (writer_join, save_tx_shared): (
        Option<JoinHandle<()>>,
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
        let timing_slots_writer = timing_slots.clone();
        let index_timing_detail_for_writer = index_timing_detail;
        let save_package_mode = index_opts.save_package_mode;
        let storage_connection_pragmas = index_opts.storage_connection_pragmas;
        let join = thread::spawn(move || {
            let mut db_opt = match NciDatabase::open_with_pragmas(
                &sqlite_path_owned,
                storage_connection_pragmas,
            ) {
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
            while let Ok((package_index, package, graph)) = save_rx.recv() {
                if let Some(ref slots) = timing_slots_writer {
                    mark_package_save_started(slots, package_index);
                }
                let slot = &results_thread[package_index];
                let (indexed, persisted) = if let Some(ref mut db) = db_opt {
                    let mut last_err = None;
                    let mut saved = false;
                    for attempt in 0..save_attempts {
                        match db.save_package_with_mode(
                            &package,
                            &graph,
                            engine_cache_key_for_writer.as_str(),
                            save_package_mode,
                        ) {
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
                            (
                                IndexedGraph {
                                    graph: Some(graph),
                                    source: GraphSource::Crawled,
                                    cache_metadata: None,
                                    persisted: true,
                                },
                                true,
                            )
                        } else {
                            let meta = index_metadata_from_graph(&graph);
                            drop(graph);
                            (
                                IndexedGraph {
                                    graph: None,
                                    source: GraphSource::Crawled,
                                    cache_metadata: Some(meta),
                                    persisted: true,
                                },
                                true,
                            )
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
                        (
                            IndexedGraph {
                                graph: None,
                                source: GraphSource::Crawled,
                                cache_metadata: Some(meta),
                                persisted: false,
                            },
                            false,
                        )
                    }
                } else {
                    (
                        IndexedGraph {
                            graph: Some(graph),
                            source: GraphSource::Crawled,
                            cache_metadata: None,
                            persisted: false,
                        },
                        false,
                    )
                };
                let total_symbols = indexed_total_symbols(&indexed);
                *slot.lock().expect("indexed result mutex poisoned") = Some(indexed);
                finish_package_progress(FinishPackageProgressArgs {
                    on_package_done: package_done_writer.clone(),
                    timing_slots: timing_slots_writer.clone(),
                    index_timing_detail: index_timing_detail_for_writer,
                    package_index,
                    name: package.name.clone(),
                    version: package.version.clone(),
                    source: GraphSource::Crawled,
                    total_symbols,
                    persisted,
                });
            }
        });
        (Some(join), Some(save_tx_thread))
    } else {
        (None, None)
    };

    let hydrate = index_opts.hydrate_cache_hits;
    let timing_slots_for_workers = timing_slots.clone();
    let process_index = |package_index: usize, package: &PackageInfo| {
        if let Some(ref slots) = timing_slots_for_workers {
            mark_package_timing_started(slots, package_index);
        }
        if let Some(ref path) = cache_sqlite_path
            && let Some(indexed) = try_package_cache_hit(
                package,
                path.as_path(),
                hydrate,
                index_engine_cache_key.as_str(),
                pending_backfill_revision,
            )
        {
            let total_symbols = indexed_total_symbols(&indexed);
            *results[package_index]
                .lock()
                .expect("indexed result mutex poisoned") = Some(indexed);
            finish_package_progress(FinishPackageProgressArgs {
                on_package_done: on_package_done.clone(),
                timing_slots: timing_slots_for_workers.clone(),
                index_timing_detail,
                package_index,
                name: package.name.clone(),
                version: package.version.clone(),
                source: GraphSource::Cached,
                total_symbols,
                persisted: true,
            });
            return;
        }

        let graph = build_package_graph(package, crawl_options_factory(package));
        if let Some(ref slots) = timing_slots_for_workers {
            mark_package_crawl_finished(slots, package_index);
        }

        let persist_skipped = cache_sqlite_path.is_none() || cache::package_dir_is_symlink(package);
        if persist_skipped {
            let total_symbols = graph.total_symbols;
            *results[package_index]
                .lock()
                .expect("indexed result mutex poisoned") = Some(IndexedGraph {
                graph: Some(graph),
                source: GraphSource::Crawled,
                cache_metadata: None,
                persisted: false,
            });
            finish_package_progress(FinishPackageProgressArgs {
                on_package_done: on_package_done.clone(),
                timing_slots: timing_slots_for_workers.clone(),
                index_timing_detail,
                package_index,
                name: package.name.clone(),
                version: package.version.clone(),
                source: GraphSource::Crawled,
                total_symbols,
                persisted: false,
            });
            return;
        }

        let save_tx = save_tx_shared
            .as_ref()
            .expect("save channel when sqlite path set");
        let save_tx = Arc::clone(save_tx);
        if let Err(send_error) = save_tx.send((package_index, package.clone(), graph)) {
            let (_package_index, _package, graph) = send_error.0;
            let total_symbols = graph.total_symbols;
            warn!(
                package = %package.name.as_ref(),
                "save queue disconnected before persist; returning crawled graph without save"
            );
            *results[package_index]
                .lock()
                .expect("indexed result mutex poisoned") = Some(IndexedGraph {
                graph: Some(graph),
                source: GraphSource::Crawled,
                cache_metadata: None,
                persisted: false,
            });
            finish_package_progress(FinishPackageProgressArgs {
                on_package_done: on_package_done.clone(),
                timing_slots: timing_slots_for_workers.clone(),
                index_timing_detail,
                package_index,
                name: package.name.clone(),
                version: package.version.clone(),
                source: GraphSource::Crawled,
                total_symbols,
                persisted: false,
            });
        }
    };

    if let Some(callback) = index_opts.on_index_phase.as_ref() {
        callback(IndexPhaseEvent::IndexPackagesStarted);
    }

    if concurrency_plan.package_parallel {
        packages
            .par_iter()
            .enumerate()
            .for_each(|(package_index, package)| process_index(package_index, package));
    } else {
        for (package_index, package) in packages.iter().enumerate() {
            process_index(package_index, package);
        }
    }

    drop(save_tx_shared);

    if let Some(join) = writer_join
        && let Err(join_error) = join.join()
    {
        panic::resume_unwind(join_error);
    }

    let indexed_graphs: Vec<IndexedGraph> = Arc::try_unwrap(results)
        .expect("results Arc still held")
        .into_iter()
        .map(|mutex| {
            mutex
                .into_inner()
                .expect("indexed result mutex poisoned")
                .expect("indexed slot empty")
        })
        .collect();

    indexed_graphs
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
        declared_dependencies: SharedVec::from([]),
    };

    build_package_graph(&info, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

    use crate::cache;
    use crate::scanner::scan_packages;
    use crate::storage::NciDatabase;

    fn indexed_package_name(indexed: &IndexedGraph) -> SharedString {
        indexed
            .graph
            .as_ref()
            .map(|graph| graph.package.clone())
            .or_else(|| {
                indexed
                    .cache_metadata
                    .as_ref()
                    .map(|meta| meta.package.clone())
            })
            .expect("indexed graph or cache metadata should name the package")
    }

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
        let meta = indexed[0]
            .cache_metadata
            .as_ref()
            .expect("metadata after crawl+save");
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

    /// Parallel index with SQLite: one package already in DB (cache hit) and one new (crawl + writer).
    #[test]
    fn index_packages_parallel_mixed_cache_hit_and_crawl() {
        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();
        let db_path = temp_dir.path().join("nci.sqlite");

        let pkg_a = node_modules_dir.join("pkg-a");
        fs::create_dir_all(&pkg_a).unwrap();
        fs::write(
            pkg_a.join("package.json"),
            r#"{"name":"pkg-a","version":"1.0.0","types":"./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(pkg_a.join("index.d.ts"), "export declare const A: number;").unwrap();

        let packages_one = scan_packages(node_modules_dir).unwrap();
        assert_eq!(packages_one.len(), 1);
        let first_run = index_packages(
            &packages_one,
            Some(IndexOptions {
                parallel: true,
                enable_package_cache: true,
                db_path: Some(db_path.clone()),
                ..Default::default()
            }),
        );
        assert_eq!(first_run.len(), 1);
        assert_eq!(first_run[0].source, GraphSource::Crawled);

        let pkg_b = node_modules_dir.join("pkg-b");
        fs::create_dir_all(&pkg_b).unwrap();
        fs::write(
            pkg_b.join("package.json"),
            r#"{"name":"pkg-b","version":"1.0.0","types":"./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(pkg_b.join("index.d.ts"), "export declare const B: number;").unwrap();

        let packages_two = scan_packages(node_modules_dir).unwrap();
        assert_eq!(packages_two.len(), 2);
        let second_run = index_packages(
            &packages_two,
            Some(IndexOptions {
                parallel: true,
                enable_package_cache: true,
                db_path: Some(db_path.clone()),
                ..Default::default()
            }),
        );
        assert_eq!(second_run.len(), 2);

        let cached_count = second_run
            .iter()
            .filter(|indexed_graph| indexed_graph.source == GraphSource::Cached)
            .count();
        let crawled_count = second_run
            .iter()
            .filter(|indexed_graph| indexed_graph.source == GraphSource::Crawled)
            .count();
        assert_eq!(cached_count, 1, "expected one cache hit");
        assert_eq!(crawled_count, 1, "expected one fresh crawl");

        let by_name: HashMap<String, GraphSource> = second_run
            .iter()
            .map(|indexed_graph| {
                (
                    indexed_package_name(indexed_graph).to_string(),
                    indexed_graph.source,
                )
            })
            .collect();
        assert_eq!(by_name.get("pkg-a"), Some(&GraphSource::Cached));
        assert_eq!(by_name.get("pkg-b"), Some(&GraphSource::Crawled));

        let cache_key = cache::index_engine_cache_key(&[]);
        let ro = NciDatabase::open_read_only(&db_path).expect("read-only after mixed run");
        for (name, dir) in [("pkg-a", pkg_a.as_path()), ("pkg-b", pkg_b.as_path())] {
            let info = PackageInfo {
                name: SharedString::from(name),
                version: SharedString::from("1.0.0"),
                dir: normalize_path(dir),
                is_scoped: false,
                declared_dependencies: SharedVec::from([]),
            };
            assert!(
                ro.has_cached_package(&info, cache_key.as_str(), None),
                "expected {name} in sqlite after mixed parallel index"
            );
        }
    }

    #[test]
    fn default_multi_package_index_plan_suppresses_inner_rayon() {
        use crate::concurrency::resolve_index_concurrency_plan;

        let index_options = IndexOptions::default();
        let plan = resolve_index_concurrency_plan(&index_options, 3);
        assert!(plan.package_parallel);
        assert!(!plan.crawl_layer_parallel_allowed);
        assert!(!plan.graph_dep_parallel_allowed);
    }

    #[test]
    fn compute_package_timing_splits_crawl_queue_and_save() {
        let started = Instant::now();
        let crawl_finished = started + Duration::from_secs(12);
        let save_started = crawl_finished + Duration::from_secs(3);
        let finished = save_started + Duration::from_secs(2);
        let slot = PackageTimingSlot {
            started: Some(started),
            crawl_finished: Some(crawl_finished),
            save_started: Some(save_started),
        };
        let (elapsed, breakdown) = compute_package_timing(&slot, finished);
        assert_eq!(elapsed, Duration::from_secs(17));
        assert_eq!(breakdown.crawl, Duration::from_secs(12));
        assert_eq!(breakdown.queue_wait, Duration::from_secs(3));
        assert_eq!(breakdown.save, Duration::from_secs(2));
        assert_eq!(breakdown.total(), elapsed);
    }

    #[test]
    fn index_packages_callback_includes_positive_elapsed() {
        use std::sync::atomic::{AtomicU64, Ordering};

        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();
        let db_path = temp_dir.path().join("nci.sqlite");

        let pkg_dir = node_modules_dir.join("elapsed-pkg");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "elapsed-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const ELAPSED: number;",
        )
        .unwrap();

        let packages = scan_packages(node_modules_dir).unwrap();
        let max_elapsed_ms = Arc::new(AtomicU64::new(0));
        let max_elapsed_for_callback = Arc::clone(&max_elapsed_ms);
        let _indexed = index_packages(
            &packages,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: true,
                db_path: Some(db_path),
                on_package_done: Some(Arc::new(move |progress| {
                    max_elapsed_for_callback
                        .fetch_max(progress.elapsed.as_millis() as u64, Ordering::Relaxed);
                })),
                ..Default::default()
            }),
        );

        assert!(
            max_elapsed_ms.load(Ordering::Relaxed) > 0,
            "expected per-package elapsed timing in progress callback"
        );
    }

    /// Foreground backfill runs before cache probes: pending symbol SQL must complete so a
    /// matching `index_cache_key` still yields `GraphSource::Cached` without recrawl.
    #[test]
    fn index_packages_foreground_backfill_before_cache_avoids_recrawl() {
        use crate::package_backfill::{
            TEST_PENDING_BACKFILL_VERSION, read_pending_backfill_version,
            set_pending_backfill_for_tests,
        };

        let temp_dir = TempDir::new().unwrap();
        let node_modules_dir = temp_dir.path();
        let db_path = temp_dir.path().join("nci.sqlite");

        let pkg_dir = node_modules_dir.join("backfill-pkg");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "backfill-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const BackfillTarget: number;",
        )
        .unwrap();

        let packages = scan_packages(node_modules_dir).unwrap();
        assert_eq!(packages.len(), 1);

        let first_run = index_packages(
            &packages,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: true,
                db_path: Some(db_path.clone()),
                ..Default::default()
            }),
        );
        assert_eq!(first_run.len(), 1);
        assert_eq!(first_run[0].source, GraphSource::Crawled);

        let database = NciDatabase::open_with_pragmas(&db_path, Default::default()).unwrap();
        let connection = database.connection_for_tests();
        set_pending_backfill_for_tests(connection, TEST_PENDING_BACKFILL_VERSION).unwrap();
        connection
            .execute(
                "UPDATE packages SET backfill_revision = 0 WHERE name = 'backfill-pkg'",
                [],
            )
            .unwrap();
        drop(database);

        let second_run = index_packages(
            &packages,
            Some(IndexOptions {
                parallel: false,
                enable_package_cache: true,
                db_path: Some(db_path.clone()),
                ..Default::default()
            }),
        );
        assert_eq!(second_run.len(), 1);
        assert_eq!(
            second_run[0].source,
            GraphSource::Cached,
            "foreground backfill should satisfy pending gate so indexer cache hits"
        );

        let verify_db = NciDatabase::open_with_pragmas(&db_path, Default::default()).unwrap();
        let verify_connection = verify_db.connection_for_tests();
        assert!(
            read_pending_backfill_version(verify_connection)
                .unwrap()
                .is_none(),
            "pending_backfill cleared after foreground backfill in index"
        );
        let package_revision: i64 = verify_connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'backfill-pkg'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(package_revision >= TEST_PENDING_BACKFILL_VERSION as i64);
    }
}
