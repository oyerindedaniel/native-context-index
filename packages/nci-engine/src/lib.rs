pub mod cache;
pub mod concurrency;
pub mod config;
pub mod constants;
pub mod crawler;
pub mod dedupe;
pub mod filter;
pub mod graph;
pub mod index_options;
mod migration_backfill;
mod package_backfill;
pub mod parser;
pub mod pipeline;
pub mod profile;
pub mod resolver;
pub mod scanner;
pub mod storage;
mod storage_migrations;
mod symbol_source_identity;
#[cfg(test)]
mod test_fixtures;
pub mod types;
pub mod upgrade;

pub use cache::{
    INDEXER_OUTPUT_REVISION, NCI_ENGINE_VERSION, index_engine_cache_key, nci_sqlite_path,
};
pub use concurrency::{
    IndexConcurrencyPlan, log_index_concurrency_plan, resolve_index_concurrency_plan, thread_budget,
};
pub use config::{DependencySection, PackageScope, PackageScopeSentinel};
pub use filter::{DepKindFilter, FilterConfig, IgnoreRule};
pub use index_options::{
    GraphSource, IndexOptions, IndexPhaseEvent, PackageProgress, PackageTimingBreakdown,
};
pub use package_backfill::ForegroundBackfillResult;
pub use resolver::{
    normalize_dependency_stub_list, npm_package_root, specifier_is_dependency_stub,
};
pub use storage::{
    BackfillDrainLimits, DEFAULT_JUNCTION_BATCH_CHUNK_SIZE, DatabaseStatusReport,
    MigrationApplyReport, NciDatabase, SCHEMA_VERSION, SavePackageMode, SqlRunSummary,
    StorageConnectionPragmas, StorageError, StorageResult, save_benchmark_scenario,
};
pub use types::PackageIndexMetadata;

pub use package_backfill::{META_PENDING_BACKFILL_KEY, TEST_PENDING_BACKFILL_VERSION};
#[cfg(feature = "test-support")]
pub use package_backfill::{
    TEST_CHAIN_BACKFILL_V1, TEST_CHAIN_BACKFILL_V2, TEST_CHAIN_BACKFILL_V3,
};
