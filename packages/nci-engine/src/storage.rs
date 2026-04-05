//! SQLite-backed NCI index: packages, symbols, and FTS5 search.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use tracing::{info, warn};

use crate::cache::NCI_ENGINE_VERSION;
use crate::types::{
    DecoratorMetadata, Deprecation, PackageGraph, PackageInfo, SharedString, SharedVec, SymbolKind,
    SymbolNode, SymbolSpace, Visibility,
};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error(
        "database schema version {found} is newer than this engine supports ({max}); upgrade nci-engine"
    )]
    SchemaTooNew { found: u32, max: u32 },

    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
}

pub type StorageResult<T> = Result<T, StorageError>;

pub use crate::storage_migrations::SCHEMA_VERSION;

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

    let current = crate::storage_migrations::read_schema_version(&transaction)?;
    let max_known = crate::storage_migrations::MIGRATIONS
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

    for migration in crate::storage_migrations::MIGRATIONS {
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
                    crate::storage_migrations::META_SCHEMA_KEY,
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
            ",
        )?;
        run_migrations(&mut connection)?;
        Ok(Self { connection })
    }

    pub fn stored_schema_version(&self) -> StorageResult<u32> {
        crate::storage_migrations::read_schema_version(&self.connection)
            .map_err(Into::into)
    }

    pub fn journal_mode_label(&self) -> StorageResult<String> {
        let label = self.connection.query_row("PRAGMA journal_mode", [], |row| {
            row.get::<_, String>(0)
        })?;
        Ok(label)
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

    pub fn load_package(&self, package_info: &PackageInfo) -> Option<PackageGraph> {
        let (package_id, stored_total_symbols, stored_total_files, crawl_ms) = match self
            .connection
            .query_row(
                "SELECT package_id, total_symbols, total_files, crawl_duration_ms
                 FROM packages
                 WHERE name = ?1 AND version = ?2 AND engine_version = ?3",
                rusqlite::params![
                    package_info.name.as_ref(),
                    package_info.version.as_ref(),
                    NCI_ENGINE_VERSION,
                ],
                |package_row| {
                    Ok((
                        package_row.get::<_, i64>(0)?,
                        package_row.get::<_, i64>(1)?,
                        package_row.get::<_, i64>(2)?,
                        package_row.get::<_, i64>(3)?,
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

        let mut symbol_stmt = self
            .connection
            .prepare(
                "SELECT symbol_id, id, name, kind, kind_name, file_path, signature, signature_hash,
                        js_doc, is_type_only, symbol_space, re_exported_from, deprecated,
                        visibility, since, is_internal, is_global_augmentation, is_inherited, inherited_from
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
                    symbol_row.get::<_, Option<String>>(8)?,
                    symbol_row.get::<_, i64>(9)?,
                    symbol_row.get::<_, String>(10)?,
                    symbol_row.get::<_, Option<String>>(11)?,
                    symbol_row.get::<_, Option<String>>(12)?,
                    symbol_row.get::<_, Option<String>>(13)?,
                    symbol_row.get::<_, Option<String>>(14)?,
                    symbol_row.get::<_, i64>(15)?,
                    symbol_row.get::<_, i64>(16)?,
                    symbol_row.get::<_, i64>(17)?,
                    symbol_row.get::<_, Option<String>>(18)?,
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
                signature_hash_opt,
                js_doc_opt,
                is_type_only_int,
                symbol_space_text,
                re_exported_from_opt,
                deprecated_opt,
                visibility_opt,
                since_opt,
                is_internal_int,
                is_global_augmentation_int,
                is_inherited_int,
                inherited_from_opt,
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

            let deprecated = deprecated_opt.and_then(parse_deprecated_from_db);
            let visibility = visibility_opt.and_then(parse_visibility_from_db);
            let symbol_space =
                parse_symbol_space_from_db(&symbol_space_text).unwrap_or(SymbolSpace::Value);

            symbols.push(SymbolNode {
                id: SharedString::from(id_text),
                name: SharedString::from(name_text),
                kind: SymbolKind::from_numeric_kind(kind_int as u32),
                kind_name: SharedString::from(kind_name_text),
                package: package_info.name.clone(),
                file_path: SharedString::from(file_path_text),
                additional_files,
                signature: signature_opt.map(SharedString::from),
                signature_hash: signature_hash_opt.map(SharedString::from),
                js_doc: js_doc_opt.map(SharedString::from),
                is_type_only: is_type_only_int != 0,
                symbol_space,
                dependencies,
                re_exported_from: re_exported_from_opt.map(SharedString::from),
                deprecated,
                visibility,
                since: since_opt.map(SharedString::from),
                is_internal: is_internal_int != 0,
                is_global_augmentation: is_global_augmentation_int != 0,
                decorators,
                is_inherited: is_inherited_int != 0,
                inherited_from: inherited_from_opt.map(SharedString::from),
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
        })
    }

    pub fn save_package(
        &mut self,
        package_info: &PackageInfo,
        graph: &PackageGraph,
    ) -> StorageResult<()> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;

        transaction.execute(
            "DELETE FROM packages WHERE name = ?1 AND version = ?2",
            rusqlite::params![package_info.name.as_ref(), package_info.version.as_ref()],
        )?;

        let crawl_ms = graph.crawl_duration_ms as i64;
        transaction.execute(
            "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, engine_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                package_info.name.as_ref(),
                package_info.version.as_ref(),
                graph.total_symbols as i64,
                graph.total_files as i64,
                crawl_ms,
                NCI_ENGINE_VERSION,
            ],
        )?;

        let package_id = transaction.last_insert_rowid();

        {
            let mut insert_symbol = transaction.prepare(
                "INSERT OR REPLACE INTO symbols (
                package_id, id, name, kind, kind_name, file_path, signature, signature_hash,
                js_doc, is_type_only, symbol_space, re_exported_from, deprecated, visibility,
                since, is_internal, is_global_augmentation, is_inherited, inherited_from
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
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
                let deprecated_text = symbol_node
                    .deprecated
                    .as_ref()
                    .map(deprecated_to_db_string);
                let visibility_text = symbol_node.visibility.as_ref().map(visibility_to_db_string);
                let symbol_space_text = symbol_space_to_db_string(symbol_node.symbol_space);

                insert_symbol.execute(rusqlite::params![
                    package_id,
                    symbol_node.id.as_ref(),
                    symbol_node.name.as_ref(),
                    symbol_node.kind.numeric_kind() as i64,
                    symbol_node.kind_name.as_ref(),
                    symbol_node.file_path.as_ref(),
                    symbol_node.signature.as_ref().map(|value| value.as_ref()),
                    symbol_node.signature_hash.as_ref().map(|value| value.as_ref()),
                    symbol_node.js_doc.as_ref().map(|value| value.as_ref()),
                    if symbol_node.is_type_only { 1i64 } else { 0i64 },
                    symbol_space_text,
                    symbol_node
                        .re_exported_from
                        .as_ref()
                        .map(|value| value.as_ref()),
                    deprecated_text.as_deref(),
                    visibility_text.as_deref(),
                    symbol_node.since.as_ref().map(|value| value.as_ref()),
                    if symbol_node.is_internal { 1i64 } else { 0i64 },
                    if symbol_node.is_global_augmentation {
                        1i64
                    } else {
                        0i64
                    },
                    if symbol_node.is_inherited { 1i64 } else { 0i64 },
                    symbol_node
                        .inherited_from
                        .as_ref()
                        .map(|value| value.as_ref()),
                ])?;

                let symbol_row_id = transaction.last_insert_rowid();

                for dependency_id in symbol_node.dependencies.iter() {
                    insert_dependency.execute(rusqlite::params![
                        symbol_row_id,
                        dependency_id.as_ref()
                    ])?;
                }

                if let Some(ref additional) = symbol_node.additional_files {
                    for additional_path in additional.iter() {
                        insert_additional.execute(rusqlite::params![
                            symbol_row_id,
                            additional_path.as_ref()
                        ])?;
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
                    let arguments_json: Option<String> =
                        decorator.arguments.as_ref().map(|argument_arc| {
                            let collected: Vec<&str> = argument_arc
                                .iter()
                                .map(|argument_string| argument_string.as_ref())
                                .collect();
                            serde_json::to_string(&collected)
                                .unwrap_or_else(|_json_error| "[]".to_string())
                        });
                    insert_decorator.execute(rusqlite::params![
                        symbol_row_id,
                        decorator.name.as_ref(),
                        arguments_json.as_deref(),
                    ])?;
                }
            }
        }

        transaction.commit()?;
        Ok(())
    }

    /// All symbols for a package (same logical shape as `load_package` but returns nodes only).
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

    /// Full-text search across indexed symbols (FTS5 `MATCH` syntax).
    pub fn find_symbols_fts(&self, fts_match_query: &str, limit: usize) -> StorageResult<Vec<SymbolNode>> {
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
                "SELECT package_id, id, name, kind, kind_name, file_path, signature, signature_hash,
                        js_doc, is_type_only, symbol_space, re_exported_from, deprecated, visibility,
                        since, is_internal, is_global_augmentation, is_inherited, inherited_from
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
                        symbol_row.get::<_, Option<String>>(8)?,
                        symbol_row.get::<_, i64>(9)?,
                        symbol_row.get::<_, String>(10)?,
                        symbol_row.get::<_, Option<String>>(11)?,
                        symbol_row.get::<_, Option<String>>(12)?,
                        symbol_row.get::<_, Option<String>>(13)?,
                        symbol_row.get::<_, Option<String>>(14)?,
                        symbol_row.get::<_, i64>(15)?,
                        symbol_row.get::<_, i64>(16)?,
                        symbol_row.get::<_, i64>(17)?,
                        symbol_row.get::<_, Option<String>>(18)?,
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
            signature_hash_opt,
            js_doc_opt,
            is_type_only_int,
            symbol_space_text,
            re_exported_from_opt,
            deprecated_opt,
            visibility_opt,
            since_opt,
            is_internal_int,
            is_global_augmentation_int,
            is_inherited_int,
            inherited_from_opt,
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
            let rows = additional_files_stmt.query_map([symbol_row_id], |path_row| {
                path_row.get::<_, String>(0)
            })?;
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
            let rows =
                heritage_stmt.query_map([symbol_row_id], |heritage_row| heritage_row.get::<_, String>(0))?;
            for heritage_text in rows.flatten() {
                heritage_vec.push(SharedString::from(heritage_text));
            }
            SharedVec::from(heritage_vec.into_boxed_slice())
        };

        let modifiers: SharedVec<SharedString> = {
            let mut mod_vec: Vec<SharedString> = Vec::new();
            let mut modifier_stmt =
                self.connection.prepare("SELECT modifier FROM symbol_modifiers WHERE symbol_id = ?1")?;
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

        let deprecated = deprecated_opt.and_then(parse_deprecated_from_db);
        let visibility = visibility_opt.and_then(parse_visibility_from_db);
        let symbol_space =
            parse_symbol_space_from_db(&symbol_space_text).unwrap_or(SymbolSpace::Value);

        Ok(Some(SymbolNode {
            id: SharedString::from(id_text),
            name: SharedString::from(name_text),
            kind: SymbolKind::from_numeric_kind(kind_int as u32),
            kind_name: SharedString::from(kind_name_text),
            package: package_info.name.clone(),
            file_path: SharedString::from(file_path_text),
            additional_files,
            signature: signature_opt.map(SharedString::from),
            signature_hash: signature_hash_opt.map(SharedString::from),
            js_doc: js_doc_opt.map(SharedString::from),
            is_type_only: is_type_only_int != 0,
            symbol_space,
            dependencies,
            re_exported_from: re_exported_from_opt.map(SharedString::from),
            deprecated,
            visibility,
            since: since_opt.map(SharedString::from),
            is_internal: is_internal_int != 0,
            is_global_augmentation: is_global_augmentation_int != 0,
            decorators,
            is_inherited: is_inherited_int != 0,
            inherited_from: inherited_from_opt.map(SharedString::from),
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
            map.entry(symbol_id)
                .or_default()
                .push(DecoratorMetadata {
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

    /// Delete all indexed data and FTS; re-run would require migrations (schema stays).
    pub fn clear_all_packages(&self) -> StorageResult<()> {
        self.connection.execute("DELETE FROM packages", [])?;
        Ok(())
    }
}

fn deprecated_to_db_string(deprecation: &Deprecation) -> String {
    match deprecation {
        Deprecation::Flag(true) => "true".to_string(),
        Deprecation::Flag(false) => "false".to_string(),
        Deprecation::Message(message) => message.as_ref().to_string(),
    }
}

fn parse_deprecated_from_db(text: String) -> Option<Deprecation> {
    if text == "true" {
        Some(Deprecation::Flag(true))
    } else if text == "false" {
        Some(Deprecation::Flag(false))
    } else {
        Some(Deprecation::Message(SharedString::from(text)))
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::PackageGraph;
    use std::sync::{Arc, Mutex};
    use std::thread;

    fn minimal_symbol(id_str: &str, name_str: &str) -> SymbolNode {
        SymbolNode {
            id: SharedString::from(id_str),
            name: SharedString::from(name_str),
            kind: SymbolKind::Function,
            kind_name: SharedString::from("FunctionDeclaration"),
            package: SharedString::from("demo-pkg"),
            file_path: SharedString::from("index.d.ts"),
            additional_files: None,
            signature: Some(SharedString::from("declare function demo(): void")),
            signature_hash: None,
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
            inherited_from: None,
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
        };

        database.save_package(&package_info, &graph).expect("save");

        assert!(database.has_cached_package(&package_info, NCI_ENGINE_VERSION));
        let loaded = database.load_package(&package_info).expect("load");
        assert_eq!(loaded.symbols.len(), 1);
        assert_eq!(loaded.symbols[0].name.as_ref(), "demo");
        assert_eq!(loaded.total_files, 3);
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
        };
        database.save_package(&package_info, &graph).expect("save");
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
        };
        database.save_package(&package_info, &graph).expect("save");

        let shared = Arc::new(Mutex::new(database));
        let mut handles = Vec::new();
        for _thread_slot in 0..8 {
            let clone_mutex = Arc::clone(&shared);
            let cloned_package_info = package_info.clone();
            handles.push(thread::spawn(move || {
                let guard = clone_mutex.lock().expect("lock");
                assert!(guard.has_cached_package(&cloned_package_info, NCI_ENGINE_VERSION));
                assert!(guard.load_package(&cloned_package_info).is_some());
            }));
        }
        for handle in handles {
            handle.join().expect("join");
        }
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
        };
        database.save_package(&package_info, &graph).expect("save");
        assert!(database.has_cached_package(&package_info, NCI_ENGINE_VERSION));
        assert!(!database.has_cached_package(&package_info, "not-a-real-engine-version"));
    }
}
