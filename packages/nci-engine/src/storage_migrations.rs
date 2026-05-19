//! Versioned DDL and post-steps for [`crate::storage::NciDatabase`].
//!
//! Each [`Migration`] has a [`MigrationKind`] that decides what runs after the SQL batch.
//! [`MigrationKind::Backfill`] records pending per-package work in `nci_meta` — it does not
//! scan all symbols at migrate time.
//!
//! ## Author checklist
//!
//! | Change | `MigrationKind` | Bump |
//! |--------|-----------------|------|
//! | Additive DDL, symbols unchanged | `Instant` | migration version in [`MIGRATIONS`] only |
//! | Row-level `UPDATE`/`DELETE` on `packages` during Instant for cheap metadata on packages (counters, flags), rare bulk fixes  | put SQL in [`Migration::package_sql`] | same version |
//! | Symbol-row SQL transform, indexer unchanged | `Backfill` + one step per version in `PACKAGE_BACKFILL_STEPS` | migration version + step fn (engine chains steps ≤ pending target) |
//! | Storage incompatible with old rows | `Rebuild` | migration version (purges `packages`) |
//! | Crawl/build output changes | DDL as needed | [`crate::cache::INDEXER_OUTPUT_REVISION`] |
//! | Crate release / CLI-only | none | `Cargo.toml` only (not cache) |
//!
//! See [`docs/nci-sqlite-migrations.md`].

use rusqlite::{Connection, OptionalExtension};
use tracing::info;

use crate::package_backfill::{
    clear_pending_backfill_version, read_pending_backfill_version,
    record_pending_backfill_after_ddl,
};

pub(crate) const META_SCHEMA_KEY: &str = "schema_version";

/// What happens to indexed package rows after a migration's SQL runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MigrationKind {
    /// Cheap or additive DDL only. Package rows stay; no `pending_backfill`. Does not bump
    /// [`crate::cache::INDEXER_OUTPUT_REVISION`] — indexed packages remain cache-valid.
    Instant,
    /// Destructive DDL (table rebuild, FTS shape change, column drop). Purges all package rows
    /// in the same transaction so dependents cascade away.
    Rebuild,
    /// DDL only at migrate time; symbol data backfill runs per package during index, `db backfill`,
    /// or on first read. Sets `nci_meta.pending_backfill`.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "used when a future migration opts into per-package backfill"
        )
    )]
    Backfill,
}

pub(crate) struct Migration {
    pub(crate) version: u32,
    pub(crate) kind: MigrationKind,
    pub(crate) description: &'static str,
    /// DDL and other statements that must run even on an empty index (CREATE/ALTER, triggers).
    pub(crate) sql: &'static str,
    /// Optional bulk `UPDATE`/`DELETE` on `packages` (whole table, not per-package). Skipped when
    /// the index has no rows or any [`MigrationKind::Rebuild`] in this apply batch (before or after).
    pub(crate) package_sql: &'static str,
}

pub(crate) const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    kind: MigrationKind::Instant,
    description: "initial NCI index schema (packages, symbols, FTS5 external content)",
    sql: r#"
CREATE TABLE IF NOT EXISTS nci_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
    package_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    total_symbols INTEGER NOT NULL,
    total_files INTEGER NOT NULL,
    crawl_duration_ms INTEGER NOT NULL,
    build_duration_ms INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
    index_cache_key TEXT NOT NULL,
    backfill_revision INTEGER NOT NULL DEFAULT 0,
    UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_packages_indexed_at ON packages(indexed_at);
CREATE INDEX IF NOT EXISTS idx_packages_cache_key_backfill_revision
    ON packages(index_cache_key, backfill_revision);

CREATE TABLE IF NOT EXISTS symbols (
    symbol_id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES packages(package_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind INTEGER NOT NULL,
    kind_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    signature TEXT,
    js_doc TEXT,
    is_type_only INTEGER NOT NULL DEFAULT 0,
    symbol_space TEXT NOT NULL DEFAULT 'value',
    re_exported_from TEXT,
    deprecated_flag INTEGER NOT NULL DEFAULT 0,
    deprecated_message TEXT,
    visibility TEXT,
    since_tag TEXT,
    since_major INTEGER,
    since_minor INTEGER,
    since_patch INTEGER,
    is_internal INTEGER NOT NULL DEFAULT 0,
    is_global_augmentation INTEGER NOT NULL DEFAULT 0,
    is_inherited INTEGER NOT NULL DEFAULT 0,
    parent_symbol_id TEXT,
    enclosing_module_declaration_id TEXT,
    merge_provenance_json TEXT,
    entry_visibility_json TEXT,
    source_package_name TEXT NOT NULL,
    source_package_version TEXT,
    source_file_path TEXT NOT NULL,
    UNIQUE(package_id, id)
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_package ON symbols(package_id);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_source_package_name ON symbols(source_package_name);

CREATE INDEX IF NOT EXISTS idx_symbols_since_semver ON symbols(since_major, since_minor, since_patch);

CREATE INDEX IF NOT EXISTS idx_symbols_deprecated ON symbols(deprecated_flag)
    WHERE deprecated_flag != 0;

CREATE TABLE IF NOT EXISTS symbol_dependencies (
    from_symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    to_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(from_symbol_id, to_symbol_id_text)
);

CREATE TABLE IF NOT EXISTS symbol_surface_dependencies (
    from_symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    to_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(from_symbol_id, to_symbol_id_text)
);

CREATE TABLE IF NOT EXISTS package_dependencies (
    package_id INTEGER NOT NULL REFERENCES packages(package_id) ON DELETE CASCADE,
    dependency_name TEXT NOT NULL,
    PRIMARY KEY(package_id, dependency_name)
);

CREATE INDEX IF NOT EXISTS idx_package_dependencies_name
    ON package_dependencies(dependency_name);

CREATE TABLE IF NOT EXISTS symbol_inherited_from_sources (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    source_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(symbol_id, source_symbol_id_text)
);

CREATE INDEX IF NOT EXISTS idx_symbol_inherited_from_sources_source
    ON symbol_inherited_from_sources(source_symbol_id_text);

CREATE TABLE IF NOT EXISTS symbol_additional_files (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    PRIMARY KEY(symbol_id, file_path)
);

CREATE TABLE IF NOT EXISTS symbol_heritage (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    heritage TEXT NOT NULL,
    PRIMARY KEY(symbol_id, heritage)
);

CREATE TABLE IF NOT EXISTS symbol_modifiers (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    modifier TEXT NOT NULL,
    PRIMARY KEY(symbol_id, modifier)
);

CREATE TABLE IF NOT EXISTS symbol_decorators (
    decorator_id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    arguments TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbol_decorators_symbol ON symbol_decorators(symbol_id);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    name,
    signature,
    js_doc,
    content='symbols',
    content_rowid='symbol_id'
);

CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, js_doc)
  VALUES('delete', old.symbol_id, old.name, COALESCE(old.signature, ''), COALESCE(old.js_doc, ''));
END;

CREATE TRIGGER symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, js_doc)
  VALUES('delete', old.symbol_id, old.name, COALESCE(old.signature, ''), COALESCE(old.js_doc, ''));
  INSERT INTO symbols_fts(rowid, name, signature, js_doc)
  VALUES (
    new.symbol_id,
    new.name,
    COALESCE(new.signature, ''),
    COALESCE(new.js_doc, '')
  );
END;
"#,
    package_sql: "",
}];

const fn highest_migration_version(migrations: &[Migration]) -> u32 {
    if migrations.is_empty() {
        0
    } else {
        migrations[migrations.len() - 1].version
    }
}

/// Highest migration number this crate applies — same as the last [`Migration::version`] in [`MIGRATIONS`].
pub const SCHEMA_VERSION: u32 = highest_migration_version(MIGRATIONS);

/// Summary returned after [`run_migrations`] completes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationApplyReport {
    pub schema_version_before: u32,
    pub schema_version_after: u32,
    pub applied_versions: Vec<u32>,
    /// True when at least one applied migration used [`MigrationKind::Rebuild`].
    pub purged_all_packages: bool,
    /// True when `nci_meta.pending_backfill` remains set after migrate (deferred per-package work).
    pub deferred_backfill: bool,
}

pub(crate) fn read_schema_version(connection: &Connection) -> rusqlite::Result<u32> {
    let meta_table_exists = connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nci_meta' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !meta_table_exists {
        return Ok(0);
    }

    let value_opt: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_SCHEMA_KEY],
            |meta_row| meta_row.get(0),
        )
        .optional()?;
    Ok(value_opt
        .as_deref()
        .and_then(|version_text| version_text.parse().ok())
        .unwrap_or(0))
}

pub(crate) fn purge_indexed_packages(connection: &Connection) -> rusqlite::Result<usize> {
    connection.execute("DELETE FROM packages", [])
}

fn packages_table_exists(connection: &Connection) -> rusqlite::Result<bool> {
    Ok(connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'packages' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn indexed_package_count(connection: &Connection) -> rusqlite::Result<i64> {
    if !packages_table_exists(connection)? {
        return Ok(0);
    }
    connection.query_row("SELECT COUNT(*) FROM packages", [], |count_row| {
        count_row.get(0)
    })
}

/// True when a later [`MigrationKind::Rebuild`] in this apply batch will purge package rows.
fn batch_will_purge_packages(migrations: &[Migration], schema_version_before: u32) -> bool {
    migrations.iter().any(|migration| {
        migration.version > schema_version_before && migration.kind == MigrationKind::Rebuild
    })
}

/// Package-row work (Instant `package_sql`, Backfill pending) is pointless when a rebuild already
/// ran, will run later in this batch, or the index has no package rows — re-index repopulates.
fn should_apply_package_row_work(
    purged_in_batch: bool,
    will_purge_in_batch: bool,
    package_count: i64,
) -> bool {
    !purged_in_batch && !will_purge_in_batch && package_count > 0
}

fn apply_package_row_sql(
    connection: &Connection,
    migration: &Migration,
    purged_in_batch: bool,
    will_purge_in_batch: bool,
) -> rusqlite::Result<()> {
    if migration.package_sql.is_empty() {
        return Ok(());
    }
    let package_count = indexed_package_count(connection)?;
    if should_apply_package_row_work(purged_in_batch, will_purge_in_batch, package_count) {
        connection
            .execute_batch(migration.package_sql)
            .map_err(|sqlite_error| {
                tracing::error!(
                    migration_version = migration.version,
                    migration_kind = ?migration.kind,
                    error = %sqlite_error,
                    "migration package row SQL failed"
                );
                sqlite_error
            })?;
    } else {
        info!(
            migration_version = migration.version,
            migration_kind = ?migration.kind,
            purged_in_batch,
            will_purge_in_batch,
            package_count,
            "migration package row SQL skipped (empty index or rebuild in batch)"
        );
    }
    Ok(())
}

fn apply_migration_post_step(
    connection: &Connection,
    migration: &Migration,
    purged_in_batch: &mut bool,
    will_purge_in_batch: bool,
) -> rusqlite::Result<bool> {
    match migration.kind {
        MigrationKind::Instant => Ok(false),
        MigrationKind::Rebuild => {
            let deleted = purge_indexed_packages(connection)?;
            *purged_in_batch = true;
            info!(
                migration_version = migration.version,
                deleted_packages = deleted,
                "migration rebuild purged indexed packages"
            );
            Ok(true)
        }
        MigrationKind::Backfill => {
            let package_count = indexed_package_count(connection)?;
            if should_apply_package_row_work(*purged_in_batch, will_purge_in_batch, package_count) {
                record_pending_backfill_after_ddl(connection, migration.version)?;
                info!(
                    migration_version = migration.version,
                    package_count,
                    "migration backfill deferred to per-package index and db backfill"
                );
            } else {
                info!(
                    migration_version = migration.version,
                    purged_in_batch = *purged_in_batch,
                    will_purge_in_batch,
                    package_count,
                    "migration backfill skipped pending_backfill (empty index or rebuild in batch)"
                );
            }
            Ok(false)
        }
    }
}

pub(crate) fn run_migrations(
    connection: &mut Connection,
) -> rusqlite::Result<MigrationApplyReport> {
    run_migrations_from(connection, MIGRATIONS)
}

pub(crate) fn run_migrations_from(
    connection: &mut Connection,
    migrations: &[Migration],
) -> rusqlite::Result<MigrationApplyReport> {
    use tracing::debug;

    let transaction =
        connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS nci_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    let schema_version_before = read_schema_version(&transaction)?;
    let max_known = migrations
        .last()
        .map(|migration| migration.version)
        .unwrap_or(0);

    debug!(
        current_schema_version = schema_version_before,
        max_known_migration = max_known,
        "nci migration check"
    );

    let mut applied_versions = Vec::new();
    let mut purged_in_batch = false;
    let will_purge_in_batch = batch_will_purge_packages(migrations, schema_version_before);

    if will_purge_in_batch {
        debug!("migration batch includes rebuild; package row work will be skipped");
    }

    for migration in migrations {
        if migration.version <= schema_version_before {
            continue;
        }
        transaction
            .execute_batch(migration.sql)
            .map_err(|sqlite_error| {
                tracing::error!(
                    migration_version = migration.version,
                    migration_kind = ?migration.kind,
                    error = %sqlite_error,
                    "migration batch failed"
                );
                sqlite_error
            })?;

        apply_package_row_sql(
            &transaction,
            migration,
            purged_in_batch,
            will_purge_in_batch,
        )?;

        apply_migration_post_step(
            &transaction,
            migration,
            &mut purged_in_batch,
            will_purge_in_batch,
        )?;

        transaction.execute(
            "INSERT OR REPLACE INTO nci_meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![META_SCHEMA_KEY, migration.version.to_string()],
        )?;
        applied_versions.push(migration.version);

        info!(
            applied = migration.version,
            kind = ?migration.kind,
            description = migration.description,
            "migration applied"
        );
    }

    if purged_in_batch {
        clear_pending_backfill_version(&transaction)?;
    }

    let schema_version_after = read_schema_version(&transaction)?;
    let deferred_backfill = read_pending_backfill_version(&transaction)?.is_some();
    let report = MigrationApplyReport {
        schema_version_before,
        schema_version_after,
        applied_versions,
        purged_all_packages: purged_in_batch,
        deferred_backfill,
    };

    transaction.commit()?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    const TEST_MIG_INSTANT: Migration = Migration {
        version: 2,
        kind: MigrationKind::Instant,
        description: "test instant",
        sql: "",
        package_sql: "",
    };

    const TEST_MIG_INSTANT_ROW_BUMP: Migration = Migration {
        version: 2,
        kind: MigrationKind::Instant,
        description: "test instant package row bump",
        sql: "",
        package_sql: "UPDATE packages SET total_symbols = total_symbols + 1",
    };

    const TEST_MIG_INSTANT_META_TOUCH: Migration = Migration {
        version: 2,
        kind: MigrationKind::Instant,
        description: "test instant package_sql side effect",
        sql: "",
        package_sql: "INSERT OR REPLACE INTO nci_meta (key, value) VALUES ('test_pkg_sql_ran', '1')",
    };

    const TEST_MIG_INSTANT_ROW_BUMP_V4: Migration = Migration {
        version: 4,
        kind: MigrationKind::Instant,
        description: "test instant package row bump after rebuild",
        sql: "",
        package_sql: "UPDATE packages SET total_symbols = total_symbols + 1",
    };

    const TEST_MIG_REBUILD: Migration = Migration {
        version: 3,
        kind: MigrationKind::Rebuild,
        description: "test rebuild",
        sql: "",
        package_sql: "",
    };

    const TEST_MIG_BACKFILL_V2: Migration = Migration {
        version: 2,
        kind: MigrationKind::Backfill,
        description: "test backfill v2",
        sql: "",
        package_sql: "",
    };

    const TEST_MIG_BACKFILL_V5: Migration = Migration {
        version: 5,
        kind: MigrationKind::Backfill,
        description: "test backfill v5",
        sql: "",
        package_sql: "",
    };

    fn open_migrated_v1() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open");
        run_migrations(&mut connection).expect("apply v1");
        connection
    }

    fn seed_minimal_package(connection: &Connection) {
        connection
            .execute(
                "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
                 VALUES ('pkg-a', '1.0.0', 1, 1, 0, 0, 'test-key', 1)",
                [],
            )
            .expect("seed package");
    }

    fn pending_backfill(connection: &Connection) -> Option<u32> {
        read_pending_backfill_version(connection).expect("read pending_backfill")
    }

    fn package_total_symbols(connection: &Connection, name: &str) -> i64 {
        connection
            .query_row(
                "SELECT total_symbols FROM packages WHERE name = ?1",
                [name],
                |row| row.get(0),
            )
            .expect("package total_symbols")
    }

    #[test]
    fn fresh_database_applies_v1() {
        let mut connection = Connection::open_in_memory().expect("open");
        let report = run_migrations(&mut connection).expect("migrate");
        assert_eq!(report.schema_version_before, 0);
        assert_eq!(report.schema_version_after, SCHEMA_VERSION);
        assert_eq!(report.applied_versions, vec![1]);
        assert!(!report.purged_all_packages);
        assert!(!report.deferred_backfill);

        let column_name: String = connection
            .query_row(
                "SELECT name FROM pragma_table_info('packages') WHERE name = 'backfill_revision'",
                [],
                |row| row.get(0),
            )
            .expect("backfill_revision column exists");
        assert_eq!(column_name, "backfill_revision");

        let index_name: String = connection
            .query_row(
                "SELECT name FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_packages_cache_key_backfill_revision'",
                [],
                |row| row.get(0),
            )
            .expect("composite cache/backfill index exists");
        assert_eq!(index_name, "idx_packages_cache_key_backfill_revision");
    }

    #[test]
    fn backfill_on_empty_index_does_not_set_pending() {
        let mut connection = open_migrated_v1();
        let report =
            run_migrations_from(&mut connection, &[TEST_MIG_BACKFILL_V2]).expect("migrate");
        assert_eq!(report.applied_versions, vec![2]);
        assert!(!report.purged_all_packages);
        assert!(!report.deferred_backfill);
        assert_eq!(pending_backfill(&connection), None);
    }

    #[test]
    fn backfill_with_packages_sets_pending() {
        let mut connection = open_migrated_v1();
        seed_minimal_package(&connection);
        let report =
            run_migrations_from(&mut connection, &[TEST_MIG_BACKFILL_V2]).expect("migrate");
        assert_eq!(report.applied_versions, vec![2]);
        assert!(!report.purged_all_packages);
        assert!(report.deferred_backfill);
        assert_eq!(pending_backfill(&connection), Some(2));
    }

    #[test]
    fn instant_package_sql_skipped_on_empty_index() {
        let mut connection = open_migrated_v1();
        let report =
            run_migrations_from(&mut connection, &[TEST_MIG_INSTANT_ROW_BUMP]).expect("migrate");
        assert_eq!(report.applied_versions, vec![2]);
        assert_eq!(indexed_package_count(&connection).expect("count"), 0);
    }

    #[test]
    fn instant_before_rebuild_in_batch_skips_package_sql() {
        let mut connection = open_migrated_v1();
        seed_minimal_package(&connection);
        run_migrations_from(
            &mut connection,
            &[TEST_MIG_INSTANT_META_TOUCH, TEST_MIG_REBUILD],
        )
        .expect("migrate");
        let touched: Option<String> = connection
            .query_row(
                "SELECT value FROM nci_meta WHERE key = 'test_pkg_sql_ran'",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("read meta");
        assert_eq!(touched, None);
    }

    #[test]
    fn instant_package_sql_applied_when_packages_present() {
        let mut connection = open_migrated_v1();
        seed_minimal_package(&connection);
        assert_eq!(package_total_symbols(&connection, "pkg-a"), 1);
        run_migrations_from(&mut connection, &[TEST_MIG_INSTANT_ROW_BUMP]).expect("migrate");
        assert_eq!(package_total_symbols(&connection, "pkg-a"), 2);
    }

    #[test]
    fn rebuild_then_instant_and_backfill_in_same_batch_skips_row_work() {
        let mut connection = open_migrated_v1();
        seed_minimal_package(&connection);
        let report = run_migrations_from(
            &mut connection,
            &[
                TEST_MIG_INSTANT,
                TEST_MIG_REBUILD,
                TEST_MIG_INSTANT_ROW_BUMP_V4,
                TEST_MIG_BACKFILL_V5,
            ],
        )
        .expect("migrate");
        assert_eq!(report.applied_versions, vec![2, 3, 4, 5]);
        assert!(report.purged_all_packages);
        assert!(!report.deferred_backfill);
        assert_eq!(pending_backfill(&connection), None);
        assert_eq!(indexed_package_count(&connection).expect("count"), 0);
    }

    #[test]
    fn backfill_then_rebuild_clears_pending_from_earlier_backfill() {
        let mut connection = open_migrated_v1();
        seed_minimal_package(&connection);
        let report = run_migrations_from(
            &mut connection,
            &[TEST_MIG_BACKFILL_V2, TEST_MIG_REBUILD, TEST_MIG_BACKFILL_V5],
        )
        .expect("migrate");
        assert_eq!(report.applied_versions, vec![2, 3, 5]);
        assert!(report.purged_all_packages);
        assert!(!report.deferred_backfill);
        assert_eq!(pending_backfill(&connection), None);
    }
}
