pub mod cache;
pub mod config;
pub mod constants;
pub mod crawler;
pub mod dedupe;
pub mod filter;
pub mod graph;
pub mod parser;
pub mod pipeline;
pub mod profile;
pub mod resolver;
pub mod scanner;
pub mod storage;
mod storage_migrations;
mod symbol_source_identity;
pub mod types;

pub use cache::{NCI_ENGINE_VERSION, index_engine_cache_key, nci_sqlite_path};
pub use config::{DependencySection, PackageScope, PackageScopeSentinel};
pub use filter::{DepKindFilter, FilterConfig, IgnoreRule};
pub use resolver::{
    normalize_dependency_stub_list, npm_package_root, specifier_is_dependency_stub,
};
pub use storage::{
    DEFAULT_JUNCTION_BATCH_CHUNK_SIZE, DatabaseStatusReport, NciDatabase, SCHEMA_VERSION,
    SavePackageMode, SqlRunSummary, StorageConnectionPragmas, StorageError, StorageResult,
    save_benchmark_scenario,
};
pub use types::PackageIndexMetadata;
