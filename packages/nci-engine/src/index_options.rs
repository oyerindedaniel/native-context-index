use std::fmt::{Debug, Formatter, Result as FmtResult};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crate::constants::DEFAULT_MAX_HOPS;
use crate::filter::FilterConfig;
use crate::storage::{SavePackageMode, StorageConnectionPragmas};
use crate::types::SharedString;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphSource {
    Cached,
    Crawled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PackageTimingBreakdown {
    pub crawl: Duration,
    pub queue_wait: Duration,
    pub save: Duration,
}

impl PackageTimingBreakdown {
    pub fn total(&self) -> Duration {
        self.crawl + self.queue_wait + self.save
    }
}

/// Progress hooks for index phases outside per-package crawl/save.
#[derive(Clone, Debug)]
pub enum IndexPhaseEvent {
    ForegroundBackfillStart {
        pending_global: u64,
        packages_in_scope: usize,
    },
    ForegroundBackfillDone {
        elapsed: Duration,
        packages_backfilled: usize,
        symbol_rows_updated: u64,
    },
    ForegroundBackfillFailed {
        elapsed: Duration,
        message: String,
    },
    /// Emitted immediately before the parallel/sequential package index loop.
    IndexPackagesStarted,
}

#[derive(Clone)]
pub struct PackageProgress {
    pub name: SharedString,
    pub version: SharedString,
    pub source: GraphSource,
    pub total_symbols: usize,
    pub persisted: bool,
    pub elapsed: Duration,
    pub timing_breakdown: Option<PackageTimingBreakdown>,
}

#[derive(Clone)]
pub struct IndexOptions {
    pub max_hops: usize,
    pub parallel: bool,
    pub enable_package_cache: bool,
    pub db_path: Option<PathBuf>,
    pub project_root: Option<PathBuf>,
    pub filter: FilterConfig,
    pub parallel_resolve_deps: bool,
    /// `None` follows the concurrency plan; `Some(false)` forces sequential BFS layers.
    pub parallel_crawl_layers: Option<bool>,
    pub hydrate_cache_hits: bool,
    pub retain_graph_after_save: bool,
    /// When `None`, capacity comes from [`crate::concurrency::resolve_index_concurrency_plan`].
    pub save_queue_capacity: Option<usize>,
    pub save_retry_count: u32,
    pub dependency_stub_packages: Vec<String>,
    pub on_package_done: Option<Arc<dyn Fn(PackageProgress) + Send + Sync>>,
    pub on_index_phase: Option<Arc<dyn Fn(IndexPhaseEvent) + Send + Sync>>,
    pub index_timing_detail: bool,
    /// `None` reads `nci_meta.pending_backfill` per probe; `Some(None)` / `Some(Some(v))` reuse one value for the run.
    pub pending_backfill_revision: Option<Option<u32>>,
    pub save_package_mode: SavePackageMode,
    pub storage_connection_pragmas: StorageConnectionPragmas,
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
            parallel_crawl_layers: None,
            hydrate_cache_hits: false,
            retain_graph_after_save: false,
            save_queue_capacity: None,
            save_retry_count: 0,
            dependency_stub_packages: Vec::new(),
            on_package_done: None,
            on_index_phase: None,
            index_timing_detail: false,
            pending_backfill_revision: None,
            save_package_mode: SavePackageMode::default(),
            storage_connection_pragmas: StorageConnectionPragmas::baseline(),
        }
    }
}

impl Debug for IndexOptions {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> FmtResult {
        formatter
            .debug_struct("IndexOptions")
            .field("max_hops", &self.max_hops)
            .field("parallel", &self.parallel)
            .field("enable_package_cache", &self.enable_package_cache)
            .field("db_path", &self.db_path)
            .field("project_root", &self.project_root)
            .field("filter", &self.filter)
            .field("parallel_resolve_deps", &self.parallel_resolve_deps)
            .field("parallel_crawl_layers", &self.parallel_crawl_layers)
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
            .field(
                "on_index_phase",
                &self
                    .on_index_phase
                    .as_ref()
                    .map(|_| "<callback>")
                    .unwrap_or("<none>"),
            )
            .field("index_timing_detail", &self.index_timing_detail)
            .finish()
    }
}
