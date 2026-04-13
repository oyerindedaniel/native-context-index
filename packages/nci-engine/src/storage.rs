//! SQLite-backed NCI index: packages, symbols, and FTS5 search.

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use serde_json::{Map, Value};
use tracing::{info, trace, warn};

use crate::storage_migrations::{read_schema_version, MIGRATIONS, META_SCHEMA_KEY};
use crate::types::{
    DecoratorMetadata, Deprecation, PackageGraph, PackageIndexMetadata, PackageInfo, SharedString,
    SharedVec, SymbolKind, SymbolNode, SymbolSpace, Visibility,
};

/// Result of streaming a user SQL query via [`NciDatabase::for_each_readonly_sql_row`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SqlRunSummary {
    pub row_count: usize,
    /// True when `max_rows` was hit and at least one further row existed.
    pub truncated: bool,
}

/// Introspection snapshot for `nci db status` (plain or JSON).
#[derive(Debug, Clone, Serialize)]
pub struct DatabaseStatusReport {
    pub path: PathBuf,
    pub file_size_bytes: Option<u64>,
    pub page_size: i64,
    pub page_count: i64,
    pub database_size_bytes_approx: u64,
    pub journal_mode: String,
    pub schema_version: u32,
    pub integrity_check: String,
    /// Value of `NCI_CACHE_DIR` when that env var is set in this process.
    /// Independent of [`Self::path`]: `--database` may point elsewhere.
    pub nci_cache_dir_env: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error(
        "database schema version {found} is newer than this engine supports ({max}); upgrade nci-engine"
    )]
    SchemaTooNew { found: u32, max: u32 },

    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),

    #[error("only read-only SQL is allowed (for example SELECT or EXPLAIN QUERY PLAN)")]
    StatementNotReadOnly,

    #[error("sql output: {0}")]
    SqlOutput(String),

    #[error("not a SQLite database file at {path}: {reason}")]
    InvalidDatabaseFile { path: PathBuf, reason: String },

    #[error("remove-glob pattern must not be empty")]
    EmptyGlobPattern,

    #[error("remove-glob pattern '*' matches every package; use `nci db clear` instead")]
    GlobPatternTooBroad,
}

pub type StorageResult<T> = Result<T, StorageError>;

pub use crate::storage_migrations::SCHEMA_VERSION;

/// First 16 bytes of every SQLite 3 database file.
const SQLITE3_FILE_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Ensures `path` is a regular file whose content starts with the SQLite 3 magic header.
/// Used by `nci db destroy` so a misconfigured path cannot delete an arbitrary file.
pub fn verify_sqlite_file_header(path: &Path) -> StorageResult<()> {
    let meta = std::fs::metadata(path).map_err(|err| StorageError::InvalidDatabaseFile {
        path: path.to_path_buf(),
        reason: err.to_string(),
    })?;
    if !meta.is_file() {
        return Err(StorageError::InvalidDatabaseFile {
            path: path.to_path_buf(),
            reason: "not a regular file".to_string(),
        });
    }
    let mut file = File::open(path).map_err(|err| StorageError::InvalidDatabaseFile {
        path: path.to_path_buf(),
        reason: err.to_string(),
    })?;
    // SQLite file identity is the first 16 bytes on disk; compare to SQLITE3_FILE_HEADER.
    let mut header_prefix = [0u8; 16];
    let bytes_read = file.read(&mut header_prefix).map_err(|err| StorageError::InvalidDatabaseFile {
        path: path.to_path_buf(),
        reason: err.to_string(),
    })?;
    if bytes_read < 16 || header_prefix != *SQLITE3_FILE_HEADER {
        return Err(StorageError::InvalidDatabaseFile {
            path: path.to_path_buf(),
            reason: "file does not start with SQLite format 3 header".to_string(),
        });
    }
    Ok(())
}

fn run_migrations(connection: &mut Connection) -> StorageResult<()> {
    use tracing::debug;

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    transaction.execute(
        "CREATE TABLE IF NOT EXISTS nci_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    let current = read_schema_version(&transaction)?;
    let max_known = MIGRATIONS
        .last()
        .map(|migration| migration.version)
        .unwrap_or(0);

    debug!(
        current_schema_version = current,
        max_known_migration = max_known,
        "nci migration check"
    );

    if current > max_known {
        warn!(
            current_schema_version = current,
            max_known_migration = max_known,
            "database schema newer than this nci-engine build"
        );
        return Err(StorageError::SchemaTooNew {
            found: current,
            max: max_known,
        });
    }

    for migration in MIGRATIONS {
        if migration.version > current {
            if let Err(sqlite_error) = transaction.execute_batch(migration.sql) {
                tracing::error!(
                    migration_version = migration.version,
                    error = %sqlite_error,
                    "migration batch failed"
                );
                return Err(sqlite_error.into());
            }
            transaction.execute(
                "INSERT OR REPLACE INTO nci_meta (key, value) VALUES (?1, ?2)",
                rusqlite::params![
                    META_SCHEMA_KEY,
                    migration.version.to_string(),
                ],
            )?;
            debug!(applied = migration.version, "migration applied");
        }
    }

    transaction.commit()?;
    Ok(())
}

pub struct NciDatabase {
    connection: Connection,
}

impl NciDatabase {
    pub fn open(path: impl AsRef<Path>) -> StorageResult<Self> {
        let path_ref = path.as_ref();
        info!(path = %path_ref.display(), "opening nci sqlite database");
        let mut connection = Connection::open(path_ref)?;
        connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -64000;
            ",
        )?;
        run_migrations(&mut connection)?;
        Ok(Self { connection })
    }

    /// Read-only connection for concurrent cache probes while another connection writes (WAL).
    ///
    /// Does not run migrations (read-only). Callers should open a read-write [`Self::open`] first
    /// so schema is initialized. One connection per thread (see `rusqlite` / SQLite threading rules).
    pub fn open_read_only(path: impl AsRef<Path>) -> StorageResult<Self> {
        let path_ref = path.as_ref();
        trace!(path = %path_ref.display(), "opening nci sqlite database (read-only)");
        let connection = Connection::open_with_flags(
            path_ref,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 30000;
            ",
        )?;
        Ok(Self { connection })
    }

    pub fn stored_schema_version(&self) -> StorageResult<u32> {
        read_schema_version(&self.connection).map_err(Into::into)
    }

    pub fn journal_mode_label(&self) -> StorageResult<String> {
        let label = self
            .connection
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))?;
        Ok(label)
    }

    pub fn pragma_page_size(&self) -> StorageResult<i64> {
        self.connection
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn pragma_page_count(&self) -> StorageResult<i64> {
        self.connection
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .map_err(Into::into)
    }

    /// One-line summary: `ok` or the first integrity message.
    pub fn pragma_integrity_check_line(&self) -> StorageResult<String> {
        let mut statement = self
            .connection
            .prepare("PRAGMA integrity_check")
            .map_err(StorageError::from)?;
        let mut rows = statement.query([]).map_err(StorageError::from)?;
        if let Some(row) = rows.next().map_err(StorageError::from)? {
            Ok(row.get::<_, String>(0)?)
        } else {
            Ok(String::new())
        }
    }

    pub fn vacuum(&self) -> StorageResult<()> {
        self.connection.execute("VACUUM", [])?;
        Ok(())
    }

    /// `PRAGMA wal_checkpoint(TRUNCATE)` — moves WAL pages into the DB file and truncates the WAL.
    pub fn wal_checkpoint_truncate(&self) -> StorageResult<()> {
        self.connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(StorageError::from)
    }

    /// Fill [`DatabaseStatusReport`] using this connection plus optional filesystem metadata for `path`.
    pub fn status_report(&self, db_path: &Path) -> StorageResult<DatabaseStatusReport> {
        let page_size = self.pragma_page_size()?;
        let page_count = self.pragma_page_count()?;
        let approx = (page_size.max(0) as u64).saturating_mul(page_count.max(0) as u64);
        let file_size_bytes = std::fs::metadata(db_path).ok().map(|meta| meta.len());
        let journal_mode = self.journal_mode_label()?;
        let schema_version = self.stored_schema_version()?;
        let integrity_check = self.pragma_integrity_check_line()?;
        let nci_cache_dir_env = std::env::var_os("NCI_CACHE_DIR")
            .map(|value| value.to_string_lossy().into_owned());
        Ok(DatabaseStatusReport {
            path: db_path.to_path_buf(),
            file_size_bytes,
            page_size,
            page_count,
            database_size_bytes_approx: approx,
            journal_mode,
            schema_version,
            integrity_check,
            nci_cache_dir_env,
        })
    }

    pub fn has_cached_package(&self, package_info: &PackageInfo, engine_version: &str) -> bool {
        self.connection
            .query_row(
                "SELECT 1 FROM packages WHERE name = ?1 AND version = ?2 AND engine_version = ?3 LIMIT 1",
                rusqlite::params![
                    package_info.name.as_ref(),
                    package_info.version.as_ref(),
                    engine_version,
                ],
                |_| Ok(()),
            )
            .optional()
            .ok()
            .flatten()
            .is_some()
    }

    pub fn load_package_index_metadata(
        &self,
        package_info: &PackageInfo,
    ) -> Option<PackageIndexMetadata> {
        self.connection
            .query_row(
                "SELECT total_symbols, total_files, crawl_duration_ms, build_duration_ms
                 FROM packages
                 WHERE name = ?1 AND version = ?2",
                rusqlite::params![
                    package_info.name.as_ref(),
                    package_info.version.as_ref(),
                ],
                |package_row| {
                    Ok(PackageIndexMetadata {
                        package: package_info.name.clone(),
                        version: package_info.version.clone(),
                        total_symbols: package_row.get::<_, i64>(0)? as usize,
                        total_files: package_row.get::<_, i64>(1)? as usize,
                        crawl_duration_ms: package_row.get::<_, i64>(2)? as f64,
                        build_duration_ms: package_row.get::<_, i64>(3)? as f64,
                    })
                },
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn list_indexed_packages(&self) -> StorageResult<Vec<(String, String)>> {
        let mut statement = self.connection.prepare(
            "SELECT name, version FROM packages ORDER BY name, version",
        )?;
        let rows = statement.query_map([], |package_row| {
            Ok((
                package_row.get::<_, String>(0)?,
                package_row.get::<_, String>(1)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Loads the graph row for `(name, version)` (unique after [`Self::save_package`]). Cache validity is
    /// enforced by [`Self::has_cached_package`] + [`Self::save_package`]'s `engine_cache_key`, not this `SELECT`.
    pub fn load_package(&self, package_info: &PackageInfo) -> Option<PackageGraph> {
        let (package_id, stored_total_symbols, stored_total_files, crawl_ms, build_ms) = match self
            .connection
            .query_row(
                "SELECT package_id, total_symbols, total_files, crawl_duration_ms, build_duration_ms
                 FROM packages
                 WHERE name = ?1 AND version = ?2",
                rusqlite::params![
                    package_info.name.as_ref(),
                    package_info.version.as_ref(),
                ],
                |package_row| {
                    Ok((
                        package_row.get::<_, i64>(0)?,
                        package_row.get::<_, i64>(1)?,
                        package_row.get::<_, i64>(2)?,
                        package_row.get::<_, i64>(3)?,
                        package_row.get::<_, i64>(4)?,
                    ))
                },
            ) {
            Ok(row_data) => row_data,
            Err(rusqlite::Error::QueryReturnedNoRows) => return None,
            Err(_) => return None,
        };

        let deps_map = self.bulk_load_string_junction(
            "SELECT from_symbol_id, to_symbol_id_text FROM symbol_dependencies
             JOIN symbols ON symbols.symbol_id = from_symbol_id
             WHERE symbols.package_id = ?1",
            package_id,
        );

        let additional_map = self.bulk_load_string_junction(
            "SELECT symbol_additional_files.symbol_id, file_path FROM symbol_additional_files
             JOIN symbols ON symbols.symbol_id = symbol_additional_files.symbol_id
             WHERE symbols.package_id = ?1",
            package_id,
        );

        let heritage_map = self.bulk_load_string_junction(
            "SELECT symbol_heritage.symbol_id, heritage FROM symbol_heritage
             JOIN symbols ON symbols.symbol_id = symbol_heritage.symbol_id
             WHERE symbols.package_id = ?1",
            package_id,
        );

        let modifier_map = self.bulk_load_string_junction(
            "SELECT symbol_modifiers.symbol_id, modifier FROM symbol_modifiers
             JOIN symbols ON symbols.symbol_id = symbol_modifiers.symbol_id
             WHERE symbols.package_id = ?1",
            package_id,
        );

        let decorator_map = self.bulk_load_decorators(package_id);

        let inherited_map = self.bulk_load_string_junction(
            "SELECT symbol_inherited_from_sources.symbol_id, source_symbol_id_text
             FROM symbol_inherited_from_sources
             JOIN symbols ON symbols.symbol_id = symbol_inherited_from_sources.symbol_id
             WHERE symbols.package_id = ?1
             ORDER BY symbol_inherited_from_sources.symbol_id, source_symbol_id_text",
            package_id,
        );

        let mut symbol_stmt = self
            .connection
            .prepare(
                "SELECT symbol_id, id, name, kind, kind_name, file_path, signature,
                        js_doc, is_type_only, symbol_space, re_exported_from,
                        deprecated_flag, deprecated_message, visibility,
                        since_tag, since_major, since_minor, since_patch,
                        is_internal, is_global_augmentation, is_inherited, parent_symbol_id
                 FROM symbols WHERE package_id = ?1 ORDER BY symbol_id",
            )
            .ok()?;

        let symbol_rows = symbol_stmt
            .query_map(rusqlite::params![package_id], |symbol_row| {
                Ok((
                    symbol_row.get::<_, i64>(0)?,
                    symbol_row.get::<_, String>(1)?,
                    symbol_row.get::<_, String>(2)?,
                    symbol_row.get::<_, i64>(3)?,
                    symbol_row.get::<_, String>(4)?,
                    symbol_row.get::<_, String>(5)?,
                    symbol_row.get::<_, Option<String>>(6)?,
                    symbol_row.get::<_, Option<String>>(7)?,
                    symbol_row.get::<_, i64>(8)?,
                    symbol_row.get::<_, String>(9)?,
                    symbol_row.get::<_, Option<String>>(10)?,
                    symbol_row.get::<_, i64>(11)?,
                    symbol_row.get::<_, Option<String>>(12)?,
                    symbol_row.get::<_, Option<String>>(13)?,
                    symbol_row.get::<_, Option<String>>(14)?,
                    symbol_row.get::<_, Option<i64>>(15)?,
                    symbol_row.get::<_, Option<i64>>(16)?,
                    symbol_row.get::<_, Option<i64>>(17)?,
                    symbol_row.get::<_, i64>(18)?,
                    symbol_row.get::<_, i64>(19)?,
                    symbol_row.get::<_, i64>(20)?,
                    symbol_row.get::<_, Option<String>>(21)?,
                ))
            })
            .ok()?;

        let empty_string_vec: Vec<SharedString> = Vec::new();
        let empty_decorator_vec: Vec<DecoratorMetadata> = Vec::new();
        let mut symbols: Vec<SymbolNode> = Vec::with_capacity(stored_total_symbols as usize);

        for row_result in symbol_rows.flatten() {
            let (
                symbol_row_id,
                id_text,
                name_text,
                kind_int,
                kind_name_text,
                file_path_text,
                signature_opt,
                js_doc_opt,
                is_type_only_int,
                symbol_space_text,
                re_exported_from_opt,
                deprecated_flag,
                deprecated_message,
                visibility_opt,
                since_tag,
                _since_major,
                _since_minor,
                _since_patch,
                is_internal_int,
                is_global_augmentation_int,
                is_inherited_int,
                parent_symbol_id_opt,
            ) = row_result;

            let dependencies = SharedVec::from(
                deps_map
                    .get(&symbol_row_id)
                    .unwrap_or(&empty_string_vec)
                    .clone()
                    .into_boxed_slice(),
            );

            let additional_files = additional_map
                .get(&symbol_row_id)
                .map(|file_vec| SharedVec::from(file_vec.clone().into_boxed_slice()));

            let heritage = SharedVec::from(
                heritage_map
                    .get(&symbol_row_id)
                    .unwrap_or(&empty_string_vec)
                    .clone()
                    .into_boxed_slice(),
            );

            let modifiers = SharedVec::from(
                modifier_map
                    .get(&symbol_row_id)
                    .unwrap_or(&empty_string_vec)
                    .clone()
                    .into_boxed_slice(),
            );

            let decorators = SharedVec::from(
                decorator_map
                    .get(&symbol_row_id)
                    .unwrap_or(&empty_decorator_vec)
                    .clone()
                    .into_boxed_slice(),
            );

            let deprecated = deprecation_from_columns(deprecated_flag, deprecated_message);
            let visibility = visibility_opt.and_then(parse_visibility_from_db);
            let symbol_space =
                parse_symbol_space_from_db(&symbol_space_text).unwrap_or(SymbolSpace::Value);

            symbols.push(SymbolNode {
                id: SharedString::from(id_text),
                name: SharedString::from(name_text),
                parent_symbol_id: parent_symbol_id_opt.map(SharedString::from),
                kind: SymbolKind::from_numeric_kind(kind_int as u32),
                kind_name: SharedString::from(kind_name_text),
                package: package_info.name.clone(),
                file_path: SharedString::from(file_path_text),
                additional_files,
                signature: signature_opt.map(SharedString::from),
                js_doc: js_doc_opt.map(SharedString::from),
                is_type_only: is_type_only_int != 0,
                symbol_space,
                dependencies,
                re_exported_from: re_exported_from_opt.map(SharedString::from),
                deprecated,
                visibility,
                since: since_tag.map(SharedString::from),
                is_internal: is_internal_int != 0,
                is_global_augmentation: is_global_augmentation_int != 0,
                decorators,
                is_inherited: is_inherited_int != 0,
                inherited_from_sources: SharedVec::from(
                    inherited_map
                        .get(&symbol_row_id)
                        .unwrap_or(&empty_string_vec)
                        .clone()
                        .into_boxed_slice(),
                ),
                heritage,
                modifiers,
                dep_dedupe_keys: None,
                raw_dependencies: Vec::new(),
            });
        }

        Some(PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols,
            total_symbols: stored_total_symbols as usize,
            total_files: stored_total_files as usize,
            crawl_duration_ms: crawl_ms as f64,
            build_duration_ms: build_ms as f64,
        })
    }

    pub fn save_package(
        &mut self,
        package_info: &PackageInfo,
        graph: &PackageGraph,
        engine_cache_key: &str,
    ) -> StorageResult<()> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;

        transaction.execute(
            "DELETE FROM packages WHERE name = ?1 AND version = ?2",
            rusqlite::params![package_info.name.as_ref(), package_info.version.as_ref()],
        )?;

        let crawl_ms = graph.crawl_duration_ms as i64;
        let build_ms = graph.build_duration_ms as i64;
        transaction.execute(
            "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, engine_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                package_info.name.as_ref(),
                package_info.version.as_ref(),
                graph.total_symbols as i64,
                graph.total_files as i64,
                crawl_ms,
                build_ms,
                engine_cache_key,
            ],
        )?;

        let package_id = transaction.last_insert_rowid();

        {
            let mut insert_symbol = transaction.prepare(
                "INSERT INTO symbols (
                package_id, id, name, kind, kind_name, file_path, signature,
                js_doc, is_type_only, symbol_space, re_exported_from,
                deprecated_flag, deprecated_message, visibility,
                since_tag, since_major, since_minor, since_patch,
                is_internal, is_global_augmentation, is_inherited, parent_symbol_id
                      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
            )?;

            let mut insert_inherited = transaction.prepare(
                "INSERT OR IGNORE INTO symbol_inherited_from_sources (symbol_id, source_symbol_id_text) VALUES (?1, ?2)",
            )?;

            let mut insert_dependency = transaction.prepare(
                "INSERT OR IGNORE INTO symbol_dependencies (from_symbol_id, to_symbol_id_text) VALUES (?1, ?2)",
            )?;
            let mut insert_additional = transaction.prepare(
                "INSERT OR IGNORE INTO symbol_additional_files (symbol_id, file_path) VALUES (?1, ?2)",
            )?;
            let mut insert_heritage = transaction.prepare(
                "INSERT OR IGNORE INTO symbol_heritage (symbol_id, heritage) VALUES (?1, ?2)",
            )?;
            let mut insert_modifier = transaction.prepare(
                "INSERT OR IGNORE INTO symbol_modifiers (symbol_id, modifier) VALUES (?1, ?2)",
            )?;
            let mut insert_decorator = transaction.prepare(
                "INSERT INTO symbol_decorators (symbol_id, name, arguments) VALUES (?1, ?2, ?3)",
            )?;

            for symbol_node in &graph.symbols {
                let (deprecated_flag, deprecated_message) =
                    deprecation_to_columns(symbol_node.deprecated.as_ref());
                let visibility_text = symbol_node.visibility.as_ref().map(visibility_to_db_string);
                let symbol_space_text = symbol_space_to_db_string(symbol_node.symbol_space);
                let since_tag = symbol_node.since.as_ref().map(|value| value.as_ref());
                let (since_major, since_minor, since_patch) = since_tag
                    .map(parse_since_semver_triple)
                    .unwrap_or((None, None, None));

                insert_symbol.execute(rusqlite::params![
                    package_id,
                    symbol_node.id.as_ref(),
                    symbol_node.name.as_ref(),
                    symbol_node.kind.numeric_kind() as i64,
                    symbol_node.kind_name.as_ref(),
                    symbol_node.file_path.as_ref(),
                    symbol_node.signature.as_ref().map(|value| value.as_ref()),
                    symbol_node.js_doc.as_ref().map(|value| value.as_ref()),
                    if symbol_node.is_type_only { 1i64 } else { 0i64 },
                    symbol_space_text,
                    symbol_node
                        .re_exported_from
                        .as_ref()
                        .map(|value| value.as_ref()),
                    deprecated_flag,
                    deprecated_message.as_deref(),
                    visibility_text,
                    since_tag,
                    since_major,
                    since_minor,
                    since_patch,
                    if symbol_node.is_internal { 1i64 } else { 0i64 },
                    if symbol_node.is_global_augmentation {
                        1i64
                    } else {
                        0i64
                    },
                    if symbol_node.is_inherited { 1i64 } else { 0i64 },
                    symbol_node
                        .parent_symbol_id
                        .as_ref()
                        .map(|value| value.as_ref()),
                ])?;

                let symbol_row_id = transaction.last_insert_rowid();

                for source_id in symbol_node.inherited_from_sources.iter() {
                    insert_inherited
                        .execute(rusqlite::params![symbol_row_id, source_id.as_ref(),])?;
                }

                for dependency_id in symbol_node.dependencies.iter() {
                    insert_dependency
                        .execute(rusqlite::params![symbol_row_id, dependency_id.as_ref()])?;
                }

                if let Some(ref additional) = symbol_node.additional_files {
                    for additional_path in additional.iter() {
                        insert_additional
                            .execute(rusqlite::params![symbol_row_id, additional_path.as_ref()])?;
                    }
                }

                for heritage_name in symbol_node.heritage.iter() {
                    insert_heritage
                        .execute(rusqlite::params![symbol_row_id, heritage_name.as_ref()])?;
                }

                for modifier_name in symbol_node.modifiers.iter() {
                    insert_modifier
                        .execute(rusqlite::params![symbol_row_id, modifier_name.as_ref()])?;
                }

                for decorator in symbol_node.decorators.iter() {
                    let arguments_json = decorator
                        .arguments
                        .as_ref()
                        .map(|args| decorator_arguments_json(args.as_ref()));
                    insert_decorator.execute(rusqlite::params![
                        symbol_row_id,
                        decorator.name.as_ref(),
                        arguments_json.as_deref(),
                    ])?;
                }
            }
        }

        // No AFTER INSERT trigger on `symbols`: FTS5 is synced here only. Any other INSERT into
        // `symbols` must update `symbols_fts` too or MATCH queries will miss those rows.
        transaction.execute(
            "INSERT INTO symbols_fts(rowid, name, signature, js_doc)
             SELECT symbol_id, name, COALESCE(signature, ''), COALESCE(js_doc, '')
             FROM symbols WHERE package_id = ?1",
            [package_id],
        )?;

        transaction.execute(
            "INSERT INTO symbols_fts(symbols_fts) VALUES('integrity-check')",
            [],
        )?;

        transaction.commit()?;
        trace!(
            target: "nci_engine::storage",
            package = %package_info.name,
            version = %package_info.version,
            symbol_count = graph.symbols.len(),
            "save_package committed"
        );
        Ok(())
    }

    pub fn list_package_symbols(
        &self,
        package_name: &str,
        package_version: &str,
    ) -> StorageResult<Vec<SymbolNode>> {
        let package_info = PackageInfo {
            name: SharedString::from(package_name),
            version: SharedString::from(package_version),
            dir: SharedString::from(""),
            is_scoped: package_name.starts_with('@'),
        };
        Ok(self
            .load_package(&package_info)
            .map(|graph| graph.symbols)
            .unwrap_or_default())
    }

    pub fn find_symbols_fts(
        &self,
        fts_match_query: &str,
        limit: usize,
    ) -> StorageResult<Vec<SymbolNode>> {
        let mut output: Vec<SymbolNode> = Vec::new();
        let mut statement = self.connection.prepare(
            "SELECT indexed_symbol.symbol_id FROM symbols_fts
             JOIN symbols AS indexed_symbol ON indexed_symbol.symbol_id = symbols_fts.rowid
             WHERE symbols_fts MATCH ?1
             LIMIT ?2",
        )?;
        let symbol_id_rows = statement.query_map(
            rusqlite::params![fts_match_query, limit as i64],
            |match_row| match_row.get::<_, i64>(0),
        )?;

        for symbol_id_result in symbol_id_rows {
            let symbol_row_id = symbol_id_result?;
            if let Some(node) = self.load_symbol_row_by_id(symbol_row_id)? {
                output.push(node);
            }
        }
        Ok(output)
    }

    fn load_symbol_row_by_id(&self, symbol_row_id: i64) -> StorageResult<Option<SymbolNode>> {
        let row_opt = self
            .connection
            .query_row(
                "SELECT package_id, id, name, kind, kind_name, file_path, signature,
                        js_doc, is_type_only, symbol_space, re_exported_from,
                        deprecated_flag, deprecated_message, visibility,
                        since_tag, since_major, since_minor, since_patch,
                        is_internal, is_global_augmentation, is_inherited, parent_symbol_id
                 FROM symbols WHERE symbol_id = ?1",
                [symbol_row_id],
                |symbol_row| {
                    Ok((
                        symbol_row.get::<_, i64>(0)?,
                        symbol_row.get::<_, String>(1)?,
                        symbol_row.get::<_, String>(2)?,
                        symbol_row.get::<_, i64>(3)?,
                        symbol_row.get::<_, String>(4)?,
                        symbol_row.get::<_, String>(5)?,
                        symbol_row.get::<_, Option<String>>(6)?,
                        symbol_row.get::<_, Option<String>>(7)?,
                        symbol_row.get::<_, i64>(8)?,
                        symbol_row.get::<_, String>(9)?,
                        symbol_row.get::<_, Option<String>>(10)?,
                        symbol_row.get::<_, i64>(11)?,
                        symbol_row.get::<_, Option<String>>(12)?,
                        symbol_row.get::<_, Option<String>>(13)?,
                        symbol_row.get::<_, Option<String>>(14)?,
                        symbol_row.get::<_, Option<i64>>(15)?,
                        symbol_row.get::<_, Option<i64>>(16)?,
                        symbol_row.get::<_, Option<i64>>(17)?,
                        symbol_row.get::<_, i64>(18)?,
                        symbol_row.get::<_, i64>(19)?,
                        symbol_row.get::<_, i64>(20)?,
                        symbol_row.get::<_, Option<String>>(21)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            package_id,
            id_text,
            name_text,
            kind_int,
            kind_name_text,
            file_path_text,
            signature_opt,
            js_doc_opt,
            is_type_only_int,
            symbol_space_text,
            re_exported_from_opt,
            deprecated_flag,
            deprecated_message,
            visibility_opt,
            since_tag,
            _since_major,
            _since_minor,
            _since_patch,
            is_internal_int,
            is_global_augmentation_int,
            is_inherited_int,
            parent_symbol_id_opt,
        )) = row_opt
        else {
            return Ok(None);
        };

        let package_name: String = self.connection.query_row(
            "SELECT name FROM packages WHERE package_id = ?1",
            [package_id],
            |package_name_row| package_name_row.get(0),
        )?;

        let package_info = PackageInfo {
            name: SharedString::from(package_name.as_str()),
            version: SharedString::from(""),
            dir: SharedString::from(""),
            is_scoped: package_name.starts_with('@'),
        };

        let dependencies: SharedVec<SharedString> = {
            let mut dep_vec: Vec<SharedString> = Vec::new();
            let mut dependency_stmt = self.connection.prepare(
                "SELECT to_symbol_id_text FROM symbol_dependencies WHERE from_symbol_id = ?1",
            )?;
            let dep_rows = dependency_stmt.query_map([symbol_row_id], |dependency_row| {
                dependency_row.get::<_, String>(0)
            })?;
            for dependency_text in dep_rows.flatten() {
                dep_vec.push(SharedString::from(dependency_text));
            }
            SharedVec::from(dep_vec.into_boxed_slice())
        };

        let additional_files: Option<SharedVec<SharedString>> = {
            let mut files: Vec<SharedString> = Vec::new();
            let mut additional_files_stmt = self
                .connection
                .prepare("SELECT file_path FROM symbol_additional_files WHERE symbol_id = ?1")?;
            let rows = additional_files_stmt
                .query_map([symbol_row_id], |path_row| path_row.get::<_, String>(0))?;
            for file_text in rows.flatten() {
                files.push(SharedString::from(file_text));
            }
            if files.is_empty() {
                None
            } else {
                Some(SharedVec::from(files.into_boxed_slice()))
            }
        };

        let heritage: SharedVec<SharedString> = {
            let mut heritage_vec: Vec<SharedString> = Vec::new();
            let mut heritage_stmt = self
                .connection
                .prepare("SELECT heritage FROM symbol_heritage WHERE symbol_id = ?1")?;
            let rows = heritage_stmt.query_map([symbol_row_id], |heritage_row| {
                heritage_row.get::<_, String>(0)
            })?;
            for heritage_text in rows.flatten() {
                heritage_vec.push(SharedString::from(heritage_text));
            }
            SharedVec::from(heritage_vec.into_boxed_slice())
        };

        let modifiers: SharedVec<SharedString> = {
            let mut mod_vec: Vec<SharedString> = Vec::new();
            let mut modifier_stmt = self
                .connection
                .prepare("SELECT modifier FROM symbol_modifiers WHERE symbol_id = ?1")?;
            let rows = modifier_stmt.query_map([symbol_row_id], |modifier_row| {
                modifier_row.get::<_, String>(0)
            })?;
            for modifier_text in rows.flatten() {
                mod_vec.push(SharedString::from(modifier_text));
            }
            SharedVec::from(mod_vec.into_boxed_slice())
        };

        let decorators: SharedVec<DecoratorMetadata> = {
            let mut dec_vec: Vec<DecoratorMetadata> = Vec::new();
            let mut decorator_stmt = self.connection.prepare(
                "SELECT name, arguments FROM symbol_decorators WHERE symbol_id = ?1 ORDER BY decorator_id",
            )?;
            let rows = decorator_stmt.query_map([symbol_row_id], |decoration_row| {
                let decorator_name: String = decoration_row.get(0)?;
                let arguments_json: Option<String> = decoration_row.get(1)?;
                Ok((decorator_name, arguments_json))
            })?;
            for decoration_pair in rows.flatten() {
                let (decorator_name, arguments_json) = decoration_pair;
                let arguments: Option<SharedVec<SharedString>> = arguments_json
                    .and_then(|json_text| serde_json::from_str::<Vec<String>>(&json_text).ok())
                    .map(|string_list| {
                        SharedVec::from(
                            string_list
                                .into_iter()
                                .map(SharedString::from)
                                .collect::<Vec<_>>()
                                .into_boxed_slice(),
                        )
                    });
                dec_vec.push(DecoratorMetadata {
                    name: SharedString::from(decorator_name),
                    arguments,
                });
            }
            SharedVec::from(dec_vec.into_boxed_slice())
        };

        let inherited_from_sources: SharedVec<SharedString> = {
            let mut inherited_vec: Vec<SharedString> = Vec::new();
            let mut inherited_stmt = self.connection.prepare(
                "SELECT source_symbol_id_text FROM symbol_inherited_from_sources
                 WHERE symbol_id = ?1 ORDER BY source_symbol_id_text",
            )?;
            let rows = inherited_stmt.query_map([symbol_row_id], |junction_row| {
                junction_row.get::<_, String>(0)
            })?;
            for inherited_text in rows.flatten() {
                inherited_vec.push(SharedString::from(inherited_text));
            }
            SharedVec::from(inherited_vec.into_boxed_slice())
        };

        let deprecated = deprecation_from_columns(deprecated_flag, deprecated_message);
        let visibility = visibility_opt.and_then(parse_visibility_from_db);
        let symbol_space =
            parse_symbol_space_from_db(&symbol_space_text).unwrap_or(SymbolSpace::Value);

        Ok(Some(SymbolNode {
            id: SharedString::from(id_text),
            name: SharedString::from(name_text),
            parent_symbol_id: parent_symbol_id_opt.map(SharedString::from),
            kind: SymbolKind::from_numeric_kind(kind_int as u32),
            kind_name: SharedString::from(kind_name_text),
            package: package_info.name.clone(),
            file_path: SharedString::from(file_path_text),
            additional_files,
            signature: signature_opt.map(SharedString::from),
            js_doc: js_doc_opt.map(SharedString::from),
            is_type_only: is_type_only_int != 0,
            symbol_space,
            dependencies,
            re_exported_from: re_exported_from_opt.map(SharedString::from),
            deprecated,
            visibility,
            since: since_tag.map(SharedString::from),
            is_internal: is_internal_int != 0,
            is_global_augmentation: is_global_augmentation_int != 0,
            decorators,
            is_inherited: is_inherited_int != 0,
            inherited_from_sources,
            heritage,
            modifiers,
            dep_dedupe_keys: None,
            raw_dependencies: Vec::new(),
        }))
    }

    fn bulk_load_string_junction(
        &self,
        sql: &str,
        package_id: i64,
    ) -> HashMap<i64, Vec<SharedString>> {
        let mut map: HashMap<i64, Vec<SharedString>> = HashMap::new();
        let Ok(mut statement) = self.connection.prepare(sql) else {
            return map;
        };
        let Ok(rows) = statement.query_map([package_id], |junction_row| {
            Ok((
                junction_row.get::<_, i64>(0)?,
                junction_row.get::<_, String>(1)?,
            ))
        }) else {
            return map;
        };
        for row_result in rows.flatten() {
            let (symbol_id, value) = row_result;
            map.entry(symbol_id)
                .or_default()
                .push(SharedString::from(value));
        }
        map
    }

    fn bulk_load_decorators(&self, package_id: i64) -> HashMap<i64, Vec<DecoratorMetadata>> {
        let mut map: HashMap<i64, Vec<DecoratorMetadata>> = HashMap::new();
        let Ok(mut statement) = self.connection.prepare(
            "SELECT symbol_decorators.symbol_id, symbol_decorators.name, symbol_decorators.arguments
             FROM symbol_decorators
             JOIN symbols ON symbols.symbol_id = symbol_decorators.symbol_id
             WHERE symbols.package_id = ?1
             ORDER BY symbol_decorators.symbol_id, symbol_decorators.decorator_id",
        ) else {
            return map;
        };
        let Ok(rows) = statement.query_map([package_id], |decoration_row| {
            Ok((
                decoration_row.get::<_, i64>(0)?,
                decoration_row.get::<_, String>(1)?,
                decoration_row.get::<_, Option<String>>(2)?,
            ))
        }) else {
            return map;
        };
        for row_result in rows.flatten() {
            let (symbol_id, decorator_name, arguments_json) = row_result;
            let arguments: Option<SharedVec<SharedString>> = arguments_json
                .and_then(|json_text| serde_json::from_str::<Vec<String>>(&json_text).ok())
                .map(|string_list| {
                    SharedVec::from(
                        string_list
                            .into_iter()
                            .map(SharedString::from)
                            .collect::<Vec<_>>()
                            .into_boxed_slice(),
                    )
                });
            map.entry(symbol_id).or_default().push(DecoratorMetadata {
                name: SharedString::from(decorator_name),
                arguments,
            });
        }
        map
    }

    pub fn delete_package(&self, package_name: &str, package_version: &str) -> StorageResult<()> {
        self.connection.execute(
            "DELETE FROM packages WHERE name = ?1 AND version = ?2",
            rusqlite::params![package_name, package_version],
        )?;
        Ok(())
    }

    /// Delete every indexed package row whose `name` matches SQLite `GLOB` `pattern`
    /// (all versions). Child symbol rows cascade. Returns the number of package rows removed.
    pub fn delete_packages_matching_name_glob(&self, pattern: &str) -> StorageResult<usize> {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            return Err(StorageError::EmptyGlobPattern);
        }
        if pattern == "*" {
            return Err(StorageError::GlobPatternTooBroad);
        }
        let rows_removed = self.connection.execute(
            "DELETE FROM packages WHERE name GLOB ?1",
            rusqlite::params![pattern],
        )?;
        Ok(rows_removed)
    }

    /// Delete all indexed data and FTS; re-run would require migrations (schema stays).
    pub fn clear_all_packages(&self) -> StorageResult<()> {
        self.connection.execute("DELETE FROM packages", [])?;
        Ok(())
    }

    /// `CREATE TABLE` / `TRIGGER` text for NCI objects (stable name allowlist), for `nci sql --schema`.
    pub fn nci_filtered_schema_sql(&self) -> StorageResult<String> {
        let mut statement = self.connection.prepare(
            "SELECT sql || char(59) AS ddl
             FROM sqlite_master
             WHERE sql IS NOT NULL
               AND (
                 name = 'nci_meta'
                 OR name = 'packages'
                 OR name = 'symbols'
                 OR name = 'symbols_fts'
                 OR name LIKE 'symbol\\_%' ESCAPE '\\'
               )
             ORDER BY
               CASE type
                 WHEN 'table' THEN 0
                 WHEN 'view' THEN 1
                 WHEN 'trigger' THEN 2
                 ELSE 3
               END,
               name",
        )?;

        let mut blocks: Vec<String> = vec![
            "             -- NCI index schema (internal; version key `schema_version` in nci_meta).\n\
             -- `packages.indexed_at` is Unix seconds (INTEGER). `symbols.since_*` is semver-like; sort by since_major/minor/patch.\n\
             -- Package `version` remains the manifest string (lexicographic compare only if you need it).\n\
             -- Example: nci sql -c \"SELECT name, version FROM packages LIMIT 5\"\n"
                .to_string(),
        ];
        let ddl_rows = statement.query_map([], |ddl_row| ddl_row.get::<_, String>(0))?;
        for ddl in ddl_rows {
            blocks.push(ddl?);
        }
        Ok(blocks.join("\n"))
    }

    /// Runs a **single** read-only statement (`prepare`); invokes `on_row` for each result row.
    /// If `max_rows` is `Some(n)`, emits at most `n` rows and sets [`SqlRunSummary::truncated`]
    /// when another row was available.
    pub fn for_each_readonly_sql_row<F>(
        &self,
        sql: &str,
        max_rows: Option<usize>,
        mut on_row: F,
    ) -> StorageResult<SqlRunSummary>
    where
        F: FnMut(&[String], Map<String, Value>) -> StorageResult<()>,
    {
        let mut statement = self.connection.prepare(sql)?;
        if !statement.readonly() {
            return Err(StorageError::StatementNotReadOnly);
        }
        let raw_names: Vec<String> = statement
            .column_names()
            .iter()
            .map(|column_name| (*column_name).to_string())
            .collect();
        let column_keys = disambiguate_column_names(&raw_names);
        let mut rows = statement.query([])?;
        let mut row_count = 0;
        let mut truncated = false;

        while let Some(row) = rows.next()? {
            if let Some(limit) = max_rows {
                if row_count >= limit {
                    truncated = true;
                    break;
                }
            }
            let object = row_to_json_object(&row, &column_keys)?;
            on_row(&column_keys, object)?;
            row_count += 1;
        }

        Ok(SqlRunSummary {
            row_count,
            truncated,
        })
    }
}

fn disambiguate_column_names(raw: &[String]) -> Vec<String> {
    use std::collections::HashMap;

    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::with_capacity(raw.len());
    for name in raw {
        let ordinal = counts.entry(name.clone()).or_insert(0);
        *ordinal += 1;
        if *ordinal == 1 {
            out.push(name.clone());
        } else {
            out.push(format!("{name}__{}", *ordinal));
        }
    }
    out
}

fn value_ref_to_json(value_ref: ValueRef<'_>) -> Result<Value, rusqlite::Error> {
    Ok(match value_ref {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(f.to_string())),
        ValueRef::Text(bytes) => Value::String(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(blob) => Value::String(format!(
            "hex:{}",
            blob.iter().map(|byte| format!("{byte:02x}")).collect::<String>()
        )),
    })
}

fn row_to_json_object(
    row: &rusqlite::Row<'_>,
    column_keys: &[String],
) -> rusqlite::Result<Map<String, Value>> {
    let mut map = Map::new();
    for (index, key) in column_keys.iter().enumerate() {
        map.insert(key.clone(), value_ref_to_json(row.get_ref(index)?)?);
    }
    Ok(map)
}

fn deprecation_to_columns(deprecation: Option<&Deprecation>) -> (i64, Option<String>) {
    match deprecation {
        None | Some(Deprecation::Flag(false)) => (0, None),
        Some(Deprecation::Flag(true)) => (1, None),
        Some(Deprecation::Message(message)) => (1, Some(message.as_ref().to_string())),
    }
}

fn deprecation_from_columns(flag: i64, message: Option<String>) -> Option<Deprecation> {
    if flag == 0 {
        return None;
    }
    match message {
        None => Some(Deprecation::Flag(true)),
        Some(text) if text.is_empty() => Some(Deprecation::Flag(true)),
        Some(text) => Some(Deprecation::Message(SharedString::from(text))),
    }
}

/// Best-effort semver core `major.minor.patch` from a `@since` tag (optional leading `v`; ignores prerelease/build).
pub(crate) fn parse_since_semver_triple(raw: &str) -> (Option<i64>, Option<i64>, Option<i64>) {
    match parse_semver_loose_core(raw) {
        Some((major, minor, patch)) => (Some(major), Some(minor), Some(patch)),
        None => (None, None, None),
    }
}

fn parse_semver_loose_core(raw: &str) -> Option<(i64, i64, i64)> {
    let mut scan = raw.trim();
    if scan.is_empty() {
        return None;
    }
    if let Some(rest) = scan.strip_prefix('v').or_else(|| scan.strip_prefix('V')) {
        scan = rest.trim_start();
    }
    let token = scan.split_whitespace().next()?;
    let core = token.split('-').next()?;
    let core = core.split('+').next()?;
    let parts: Vec<&str> = core.split('.').filter(|piece| !piece.is_empty()).collect();
    if parts.is_empty() {
        return None;
    }
    let major: i64 = parts[0].parse().ok()?;
    let minor = parts
        .get(1)
        .and_then(|piece| piece.parse().ok())
        .unwrap_or(0);
    let patch = parts
        .get(2)
        .and_then(|piece| piece.parse().ok())
        .unwrap_or(0);
    Some((major, minor, patch))
}

fn visibility_to_db_string(visibility: &Visibility) -> &'static str {
    match visibility {
        Visibility::Public => "public",
        Visibility::Internal => "internal",
        Visibility::Alpha => "alpha",
        Visibility::Beta => "beta",
    }
}

fn parse_visibility_from_db(text: String) -> Option<Visibility> {
    match text.as_str() {
        "public" => Some(Visibility::Public),
        "internal" => Some(Visibility::Internal),
        "alpha" => Some(Visibility::Alpha),
        "beta" => Some(Visibility::Beta),
        _ => None,
    }
}

fn symbol_space_to_db_string(space: SymbolSpace) -> &'static str {
    match space {
        SymbolSpace::Value => "value",
        SymbolSpace::Type => "type",
    }
}

fn parse_symbol_space_from_db(text: &str) -> Option<SymbolSpace> {
    match text {
        "value" => Some(SymbolSpace::Value),
        "type" => Some(SymbolSpace::Type),
        _ => None,
    }
}

fn decorator_arguments_json(arguments: &[SharedString]) -> String {
    if arguments.is_empty() {
        return "[]".into();
    }
    let as_refs: Vec<&str> = arguments.iter().map(|shared| shared.as_ref()).collect();
    serde_json::to_string(&as_refs).unwrap_or_else(|_| "[]".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::index_engine_cache_key;
    use crate::types::PackageGraph;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Instant;

    #[test]
    fn since_semver_parse_loose() {
        assert_eq!(
            parse_since_semver_triple("2.0.0"),
            (Some(2), Some(0), Some(0))
        );
        assert_eq!(
            parse_since_semver_triple("v1.2.3-rc.1"),
            (Some(1), Some(2), Some(3))
        );
        assert_eq!(parse_since_semver_triple("12"), (Some(12), Some(0), Some(0)));
        assert_eq!(
            parse_since_semver_triple("not-a-version"),
            (None, None, None)
        );
    }

    #[test]
    fn deprecation_and_since_columns_roundtrip() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("dep_since.sqlite");
        let mut database = NciDatabase::open(&path).expect("open");
        let package_info = PackageInfo {
            name: SharedString::from("demo-pkg"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/x"),
            is_scoped: false,
        };
        let mut sym = minimal_symbol("sym-dep", "fnDep");
        sym.since = Some(SharedString::from("v4.5.6"));
        sym.deprecated = Some(Deprecation::Message(SharedString::from("use other")));
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![sym],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        };
        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");
        let loaded = database.load_package(&package_info).expect("load");
        assert_eq!(
            loaded.symbols[0].since.as_ref().map(|value| value.as_ref()),
            Some("v4.5.6")
        );
        match loaded.symbols[0].deprecated.as_ref() {
            Some(Deprecation::Message(m)) => assert_eq!(m.as_ref(), "use other"),
            other => panic!("expected deprecated message, got {other:?}"),
        }
        assert_eq!(
            parse_since_semver_triple("v4.5.6"),
            (Some(4), Some(5), Some(6))
        );
    }

    fn minimal_symbol(id_str: &str, name_str: &str) -> SymbolNode {
        SymbolNode {
            id: SharedString::from(id_str),
            name: SharedString::from(name_str),
            parent_symbol_id: None,
            kind: SymbolKind::Function,
            kind_name: SharedString::from("FunctionDeclaration"),
            package: SharedString::from("demo-pkg"),
            file_path: SharedString::from("index.d.ts"),
            additional_files: None,
            signature: Some(SharedString::from("declare function demo(): void")),
            js_doc: Some(SharedString::from("Hello world token")),
            is_type_only: false,
            symbol_space: SymbolSpace::Value,
            dependencies: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
            re_exported_from: None,
            deprecated: None,
            visibility: None,
            since: None,
            is_internal: false,
            is_global_augmentation: false,
            decorators: SharedVec::from(Vec::new().into_boxed_slice()),
            is_inherited: false,
            inherited_from_sources: SharedVec::from(Vec::new().into_boxed_slice()),
            heritage: SharedVec::from(Vec::new().into_boxed_slice()),
            modifiers: SharedVec::from(Vec::new().into_boxed_slice()),
            dep_dedupe_keys: None,
            raw_dependencies: Vec::new(),
        }
    }

    #[test]
    fn migration_and_roundtrip() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("test.sqlite");
        let mut database = NciDatabase::open(&db_path).expect("open");

        let package_info = PackageInfo {
            name: SharedString::from("demo-pkg"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/x"),
            is_scoped: false,
        };

        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![minimal_symbol("sym-1", "demo")],
            total_symbols: 1,
            total_files: 3,
            crawl_duration_ms: 12.5,
            build_duration_ms: 7.0,
        };

        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");

        let cache_key = index_engine_cache_key(&[]);
        assert!(database.has_cached_package(&package_info, cache_key.as_str()));
        let loaded = database.load_package(&package_info).expect("load");
        assert_eq!(loaded.symbols.len(), 1);
        assert_eq!(loaded.symbols[0].name.as_ref(), "demo");
        assert_eq!(loaded.total_files, 3);
        assert_eq!(loaded.crawl_duration_ms, 12.0);
        assert_eq!(loaded.build_duration_ms, 7.0);
    }

    #[test]
    fn inherited_from_sources_junction_roundtrip() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("inherited.sqlite");
        let mut database = NciDatabase::open(&db_path).expect("open");

        let package_info = PackageInfo {
            name: SharedString::from("demo-pkg"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/x"),
            is_scoped: false,
        };

        let mut sym = minimal_symbol("sym-inh", "Child.x");
        sym.is_inherited = true;
        sym.inherited_from_sources = SharedVec::from(
            vec![
                SharedString::from("demo-pkg@1.0.0::Trait.x"),
                SharedString::from("demo-pkg@1.0.0::Base.prototype.x"),
            ]
            .into_boxed_slice(),
        );

        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![sym],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        };

        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");
        let loaded = database.load_package(&package_info).expect("load");
        assert_eq!(loaded.symbols.len(), 1);
        let loaded_sources: Vec<&str> = loaded.symbols[0]
            .inherited_from_sources
            .iter()
            .map(|symbol_id| symbol_id.as_ref())
            .collect();
        assert_eq!(
            loaded_sources,
            vec![
                "demo-pkg@1.0.0::Base.prototype.x",
                "demo-pkg@1.0.0::Trait.x",
            ]
        );
    }

    #[test]
    fn save_package_profile_large_graph_smoke() {
        const N: usize = 3_000;
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("large.sqlite")).expect("open");
        assert_eq!(
            database.stored_schema_version().expect("schema"),
            SCHEMA_VERSION
        );
        let package_info = PackageInfo {
            name: SharedString::from("large-prof"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/l"),
            is_scoped: false,
        };
        let mut symbols = Vec::with_capacity(N);
        for index in 0..N {
            let mut sym = minimal_symbol(&format!("sym-{index}"), &format!("name-{index}"));
            sym.js_doc = Some(SharedString::from(format!("token_{index} uniquefts")));
            symbols.push(sym);
        }
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols,
            total_symbols: N,
            total_files: 1,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        };
        let started = Instant::now();
        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");
        let ms = started.elapsed().as_secs_f64() * 1000.0;
        eprintln!(
            "save_package profile: {N} symbols in {ms:.1} ms (batch FTS + integrity-check)"
        );
        let hits = database.find_symbols_fts("uniquefts", 50).expect("fts");
        assert!(
            !hits.is_empty(),
            "FTS should find indexed js_doc tokens after batch populate"
        );
        assert!(ms < 600_000.0, "sanity: save should finish in under 10 minutes");
    }

    #[test]
    fn fts_survives_save_resave_same_package() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("resave.sqlite")).expect("open");
        let package_info = PackageInfo {
            name: SharedString::from("re-pkg"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/r"),
            is_scoped: false,
        };
        let graph1 = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![minimal_symbol("a", "alpha")],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        };
        database
            .save_package(
                &package_info,
                &graph1,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save1");
        assert!(!database.find_symbols_fts("Hello", 5).expect("fts").is_empty());

        let mut sym2 = minimal_symbol("b", "beta");
        sym2.js_doc = Some(SharedString::from("ResaveUniqueToken"));
        let graph2 = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![sym2],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        };
        database
            .save_package(
                &package_info,
                &graph2,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save2");
        let hits = database
            .find_symbols_fts("ResaveUniqueToken", 10)
            .expect("fts");
        assert!(!hits.is_empty());
        let old = database.find_symbols_fts("Hello", 10).expect("old");
        assert!(
            old.is_empty(),
            "previous package slice should be replaced; old token gone from FTS"
        );
    }

    #[test]
    fn fts_finds_symbol() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("fts.sqlite")).expect("open");
        let package_info = PackageInfo {
            name: SharedString::from("pkg-fts-test"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/pkg-fts-test"),
            is_scoped: false,
        };
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![minimal_symbol("sym-fts-test", "foo")],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 1.0,
            build_duration_ms: 1.0,
        };
        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");
        let hits = database.find_symbols_fts("Hello", 10).expect("fts");
        assert!(!hits.is_empty());
    }

    #[test]
    fn schema_too_new_rejected() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("stale.sqlite");
        {
            let connection = Connection::open(&path).expect("open");
            connection
                .execute_batch(
                    "CREATE TABLE nci_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                     INSERT INTO nci_meta VALUES ('schema_version', '999');",
                )
                .expect("bootstrap");
        }
        let result = NciDatabase::open(&path);
        assert!(matches!(result, Err(StorageError::SchemaTooNew { .. })));
    }

    #[test]
    fn concurrent_shared_mutex_reads() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("concurrent.sqlite")).expect("open");
        let package_info = PackageInfo {
            name: SharedString::from("c"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/c"),
            is_scoped: false,
        };
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![minimal_symbol("x", "y")],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 1.0,
            build_duration_ms: 1.0,
        };
        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");

        let shared = Arc::new(Mutex::new(database));
        let mut handles = Vec::new();
        let shared_cache_key = index_engine_cache_key(&[]);
        for _thread_slot in 0..8 {
            let clone_mutex = Arc::clone(&shared);
            let cloned_package_info = package_info.clone();
            let thread_cache_key = shared_cache_key.clone();
            handles.push(thread::spawn(move || {
                let guard = clone_mutex.lock().expect("lock");
                assert!(guard.has_cached_package(&cloned_package_info, thread_cache_key.as_str()));
                assert!(guard.load_package(&cloned_package_info).is_some());
            }));
        }
        for handle in handles {
            handle.join().expect("join");
        }
    }

    #[test]
    fn adhoc_sql_readonly_select_and_reject_write() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("adhoc.sql");
        let database = NciDatabase::open(&path).expect("open");

        let mut collected = Vec::new();
        let summary = database
            .for_each_readonly_sql_row("SELECT 2 AS n, 'hi' AS t", None, |_keys, row| {
                collected.push(row);
                Ok(())
            })
            .expect("select");
        assert_eq!(summary.row_count, 1);
        assert!(!summary.truncated);
        assert_eq!(collected[0]["n"], serde_json::json!(2));
        assert_eq!(collected[0]["t"], serde_json::json!("hi"));

        let read_only_db = NciDatabase::open_read_only(&path).expect("read-only open");
        let err = read_only_db
            .for_each_readonly_sql_row("DELETE FROM packages", None, |_, _| Ok(()))
            .expect_err("mutating sql");
        assert!(matches!(err, StorageError::StatementNotReadOnly));
    }

    #[test]
    fn adhoc_sql_max_rows_truncates() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("trunc.sql");
        let database = NciDatabase::open(&path).expect("open");

        let mut n = 0;
        let summary = database
            .for_each_readonly_sql_row(
                "SELECT 1 AS x UNION SELECT 2 AS x",
                Some(1),
                |_, _| {
                    n += 1;
                    Ok(())
                },
            )
            .expect("run");
        assert_eq!(n, 1);
        assert!(summary.truncated);
    }

    #[test]
    fn engine_version_invalidation_drops_cache_row() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("inv.sqlite")).expect("open");
        let package_info = PackageInfo {
            name: SharedString::from("inv"),
            version: SharedString::from("1.0.0"),
            dir: SharedString::from("/i"),
            is_scoped: false,
        };
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![minimal_symbol("sym-invalidation", "name-invalidation")],
            total_symbols: 1,
            total_files: 1,
            crawl_duration_ms: 1.0,
            build_duration_ms: 1.0,
        };
        database
            .save_package(
                &package_info,
                &graph,
                index_engine_cache_key(&[]).as_str(),
            )
            .expect("save");
        let cache_key = index_engine_cache_key(&[]);
        assert!(database.has_cached_package(&package_info, cache_key.as_str()));
        assert!(!database.has_cached_package(&package_info, "not-a-real-engine-version"));
    }
}
