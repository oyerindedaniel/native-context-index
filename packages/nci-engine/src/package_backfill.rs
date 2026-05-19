//! Per-package deferred backfill for [`crate::storage_migrations::MigrationKind::Backfill`].
//!
//! DDL runs at migrate time; symbol row updates run per `package_id` during index (foreground),
//! `nci db backfill`, or on first read of a cold package.
//!
//! ## Contract
//!
//! - Migrate records a single `nci_meta.pending_backfill` **target** (latest Backfill version in the batch).
//! - Each symbol-transform Backfill registers one step in [`PACKAGE_BACKFILL_STEPS`] at that migration version.
//! - Instant-only migrations do not register steps (no per-package symbol work).
//! - When draining, the engine runs every registered step with
//!   `package.backfill_revision < step_version <= pending_backfill`, in ascending version order,
//!   marking `backfill_revision` after each step. Fresh [`crate::storage::NciDatabase::save_package`]
//!   rows start at [`crate::storage_migrations::SCHEMA_VERSION`] and skip the chain.
//! - Deferred SQL is skipped when `packages.index_cache_key` differs from the current engine key —
//!   index will recrawl and [`save_package`] will refresh symbols and `backfill_revision` instead.
//!
//! See [`docs/nci-sqlite-migrations.md`].

use rusqlite::{Connection, OptionalExtension, ToSql, params, params_from_iter};
use tracing::error;

use crate::migration_backfill::BackfillBatchOptions;
#[cfg(any(test, feature = "test-support"))]
use crate::migration_backfill::run_batched_symbol_update_for_package;
use crate::types::PackageInfo;

/// Symbol rows updated and packages touched by a foreground or scoped backfill pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ForegroundBackfillResult {
    pub packages_backfilled: usize,
    pub symbol_rows_updated: u64,
}

pub const META_PENDING_BACKFILL_KEY: &str = "pending_backfill";

const PACKAGE_SCOPE_SQL_BATCH_SIZE: usize = 256;

/// Reserved migration version for tests only (not used by production `MIGRATIONS`).
pub const TEST_PENDING_BACKFILL_VERSION: u32 = 9_001;

/// Chained backfill test versions (not used by production `MIGRATIONS`).
#[cfg(any(test, feature = "test-support"))]
pub const TEST_CHAIN_BACKFILL_V1: u32 = 9_101;
#[cfg(any(test, feature = "test-support"))]
pub const TEST_CHAIN_BACKFILL_V2: u32 = 9_102;
#[cfg(any(test, feature = "test-support"))]
pub const TEST_CHAIN_BACKFILL_V3: u32 = 9_103;

/// Runs batched symbol updates for one package when `backfill_version` is applied.
pub(crate) type PackageBackfillStep =
    fn(&Connection, i64, BackfillBatchOptions) -> rusqlite::Result<u64>;

#[cfg(any(test, feature = "test-support"))]
fn test_backfill_touch_symbols(
    connection: &Connection,
    package_id: i64,
    options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    run_batched_symbol_update_for_package(
        connection,
        package_id,
        "symbol_space = COALESCE(NULLIF(symbol_space, ''), 'value')",
        None,
        options,
    )
}

#[cfg(any(test, feature = "test-support"))]
fn test_chain_backfill_mark_v1(
    connection: &Connection,
    package_id: i64,
    options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    run_batched_symbol_update_for_package(
        connection,
        package_id,
        "symbol_space = 'chain-v9101'",
        None,
        options,
    )
}

#[cfg(any(test, feature = "test-support"))]
fn test_chain_backfill_mark_v2(
    connection: &Connection,
    package_id: i64,
    options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    run_batched_symbol_update_for_package(
        connection,
        package_id,
        "symbol_space = 'chain-v9102'",
        None,
        options,
    )
}

#[cfg(any(test, feature = "test-support"))]
fn test_chain_backfill_mark_v3(
    connection: &Connection,
    package_id: i64,
    options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    run_batched_symbol_update_for_package(
        connection,
        package_id,
        "symbol_space = 'chain-v9103'",
        None,
        options,
    )
}

/// Registry keyed by migration version (ascending). Production [`MigrationKind::Backfill`] migrations register here.
#[cfg(any(test, feature = "test-support"))]
const PACKAGE_BACKFILL_STEPS: &[(u32, PackageBackfillStep)] = &[
    (TEST_PENDING_BACKFILL_VERSION, test_backfill_touch_symbols),
    (TEST_CHAIN_BACKFILL_V1, test_chain_backfill_mark_v1),
    (TEST_CHAIN_BACKFILL_V2, test_chain_backfill_mark_v2),
    (TEST_CHAIN_BACKFILL_V3, test_chain_backfill_mark_v3),
];

#[cfg(not(any(test, feature = "test-support")))]
const PACKAGE_BACKFILL_STEPS: &[(u32, PackageBackfillStep)] = &[];

fn read_package_backfill_revision(
    connection: &Connection,
    package_id: i64,
) -> rusqlite::Result<u32> {
    connection
        .query_row(
            "SELECT backfill_revision FROM packages WHERE package_id = ?1",
            [package_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|revision| revision as u32)
}

pub(crate) fn read_pending_backfill_version(
    connection: &Connection,
) -> rusqlite::Result<Option<u32>> {
    if !nci_meta_table_exists(connection)? {
        return Ok(None);
    }
    let value_opt: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_PENDING_BACKFILL_KEY],
            |meta_row| meta_row.get(0),
        )
        .optional()?;
    Ok(value_opt.as_deref().and_then(|text| text.parse().ok()))
}

fn write_pending_backfill_version(
    connection: &Connection,
    backfill_version: u32,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT OR REPLACE INTO nci_meta (key, value) VALUES (?1, ?2)",
        params![META_PENDING_BACKFILL_KEY, backfill_version.to_string(),],
    )?;
    Ok(())
}

pub(crate) fn clear_pending_backfill_version(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute(
        "DELETE FROM nci_meta WHERE key = ?1",
        [META_PENDING_BACKFILL_KEY],
    )?;
    Ok(())
}

fn nci_meta_table_exists(connection: &Connection) -> rusqlite::Result<bool> {
    Ok(connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nci_meta' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub(crate) fn required_backfill_revision(
    connection: &Connection,
    pending_backfill_hint: Option<Option<u32>>,
) -> rusqlite::Result<Option<u32>> {
    match pending_backfill_hint {
        Some(pending_version) => Ok(pending_version),
        None => read_pending_backfill_version(connection),
    }
}

fn append_scope_row_literals(scope_size: usize) -> String {
    std::iter::repeat_n("(?, ?)", scope_size)
        .collect::<Vec<_>>()
        .join(", ")
}

fn bind_scope_package_params(
    chunk: &[PackageInfo],
    required_revision: u32,
    current_index_cache_key: &str,
) -> Vec<Box<dyn ToSql>> {
    let mut bind_values: Vec<Box<dyn ToSql>> = Vec::with_capacity(chunk.len() * 2 + 2);
    for package in chunk {
        bind_values.push(Box::new(package.name.as_ref().to_string()));
        bind_values.push(Box::new(package.version.as_ref().to_string()));
    }
    bind_values.push(Box::new(required_revision as i64));
    bind_values.push(Box::new(current_index_cache_key.to_string()));
    bind_values
}

fn query_package_ids_pending_in_scope(
    connection: &Connection,
    packages: &[PackageInfo],
    required_revision: u32,
    current_index_cache_key: &str,
) -> rusqlite::Result<Vec<i64>> {
    let mut package_ids = Vec::new();
    for chunk in packages.chunks(PACKAGE_SCOPE_SQL_BATCH_SIZE) {
        let row_literals = append_scope_row_literals(chunk.len());
        let sql = format!(
            "SELECT package_id FROM packages
             WHERE (name, version) IN ({row_literals})
               AND backfill_revision < ? AND index_cache_key = ?"
        );
        let bind_values =
            bind_scope_package_params(chunk, required_revision, current_index_cache_key);
        let mut statement = connection.prepare(&sql)?;
        let mut rows = statement.query(params_from_iter(bind_values.iter()))?;
        while let Some(row) = rows.next()? {
            package_ids.push(row.get(0)?);
        }
    }
    Ok(package_ids)
}

fn count_packages_pending_in_scope_query(
    connection: &Connection,
    packages: &[PackageInfo],
    required_revision: u32,
    current_index_cache_key: &str,
) -> rusqlite::Result<usize> {
    let mut total_pending = 0usize;
    for chunk in packages.chunks(PACKAGE_SCOPE_SQL_BATCH_SIZE) {
        let row_literals = append_scope_row_literals(chunk.len());
        let sql = format!(
            "SELECT COUNT(*) FROM packages
             WHERE (name, version) IN ({row_literals})
               AND backfill_revision < ? AND index_cache_key = ?"
        );
        let bind_values =
            bind_scope_package_params(chunk, required_revision, current_index_cache_key);
        let chunk_count: i64 =
            connection.query_row(&sql, params_from_iter(bind_values.iter()), |count_row| {
                count_row.get(0)
            })?;
        total_pending += chunk_count.max(0) as usize;
    }
    Ok(total_pending)
}

pub(crate) fn count_packages_pending_backfill(
    connection: &Connection,
    current_index_cache_key: &str,
) -> rusqlite::Result<u64> {
    let Some(required_revision) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    connection
        .query_row(
            "SELECT COUNT(*) FROM packages
             WHERE backfill_revision < ?1 AND index_cache_key = ?2",
            params![required_revision, current_index_cache_key],
            |count_row| count_row.get(0),
        )
        .map(|count: i64| count.max(0) as u64)
}

pub(crate) fn package_ids_pending_in_set(
    connection: &Connection,
    packages: &[PackageInfo],
    current_index_cache_key: &str,
) -> rusqlite::Result<Vec<i64>> {
    if packages.is_empty() {
        return Ok(Vec::new());
    }
    let Some(required_revision) = read_pending_backfill_version(connection)? else {
        return Ok(Vec::new());
    };
    query_package_ids_pending_in_scope(
        connection,
        packages,
        required_revision,
        current_index_cache_key,
    )
}

pub(crate) fn next_package_id_pending_backfill(
    connection: &Connection,
    current_index_cache_key: &str,
) -> rusqlite::Result<Option<i64>> {
    let Some(required_revision) = read_pending_backfill_version(connection)? else {
        return Ok(None);
    };
    connection
        .query_row(
            "SELECT package_id FROM packages
             WHERE backfill_revision < ?1 AND index_cache_key = ?2
             ORDER BY package_id ASC
             LIMIT 1",
            params![required_revision, current_index_cache_key],
            |row| row.get(0),
        )
        .optional()
}

pub(crate) fn mark_package_backfill_complete(
    connection: &Connection,
    package_id: i64,
    backfill_version: u32,
) -> rusqlite::Result<()> {
    connection.execute(
        "UPDATE packages SET backfill_revision = ?1 WHERE package_id = ?2",
        params![backfill_version, package_id],
    )?;
    Ok(())
}

fn maybe_clear_pending_when_all_complete(
    connection: &Connection,
    current_index_cache_key: &str,
) -> rusqlite::Result<()> {
    if read_pending_backfill_version(connection)?.is_none() {
        return Ok(());
    }
    if count_packages_pending_backfill(connection, current_index_cache_key)? == 0 {
        clear_pending_backfill_version(connection)?;
    }
    Ok(())
}

/// Applies registered backfill steps through the pending target version, marking revision after each.
/// Returns symbol rows updated and whether `backfill_revision` reached `pending_version`.
pub(crate) fn backfill_single_package(
    connection: &Connection,
    package_id: i64,
    pending_version: u32,
    batch_options: BackfillBatchOptions,
    current_index_cache_key: &str,
) -> rusqlite::Result<(u64, bool)> {
    let (mut current_revision, stored_cache_key): (u32, String) = connection.query_row(
        "SELECT backfill_revision, index_cache_key FROM packages WHERE package_id = ?1",
        [package_id],
        |row| Ok((row.get::<_, i64>(0)? as u32, row.get(1)?)),
    )?;
    if stored_cache_key != current_index_cache_key {
        return Ok((0, false));
    }
    if current_revision >= pending_version {
        return Ok((0, true));
    }

    let mut total_updated_rows = 0u64;
    for (step_version, step) in PACKAGE_BACKFILL_STEPS {
        if *step_version <= current_revision || *step_version > pending_version {
            continue;
        }
        total_updated_rows += step(connection, package_id, batch_options)?;
        mark_package_backfill_complete(connection, package_id, *step_version)?;
        current_revision = *step_version;
    }

    if current_revision < pending_version {
        error!(
            pending_version,
            package_id,
            current_revision,
            "pending_backfill target not reached; register PACKAGE_BACKFILL_STEPS for each Backfill version or compose transforms into a later step"
        );
    }

    Ok((total_updated_rows, current_revision >= pending_version))
}

pub(crate) fn backfill_packages_by_id(
    connection: &Connection,
    package_ids: &[i64],
    pending_version: u32,
    batch_options: BackfillBatchOptions,
    current_index_cache_key: &str,
) -> rusqlite::Result<ForegroundBackfillResult> {
    let mut result = ForegroundBackfillResult::default();
    for package_id in package_ids {
        let (updated_rows, reached_pending) = backfill_single_package(
            connection,
            *package_id,
            pending_version,
            batch_options,
            current_index_cache_key,
        )?;
        if reached_pending {
            result.packages_backfilled += 1;
        }
        result.symbol_rows_updated += updated_rows;
    }
    maybe_clear_pending_when_all_complete(connection, current_index_cache_key)?;
    Ok(result)
}

/// Called when a [`MigrationKind::Backfill`] migration's DDL has been applied.
pub(crate) fn record_pending_backfill_after_ddl(
    connection: &Connection,
    backfill_version: u32,
) -> rusqlite::Result<()> {
    write_pending_backfill_version(connection, backfill_version)
}

/// Foreground: backfill indexed packages that are still behind the pending revision.
pub(crate) fn backfill_packages_in_set(
    connection: &Connection,
    packages: &[PackageInfo],
    batch_options: BackfillBatchOptions,
    current_index_cache_key: &str,
) -> rusqlite::Result<ForegroundBackfillResult> {
    let Some(pending_version) = read_pending_backfill_version(connection)? else {
        return Ok(ForegroundBackfillResult::default());
    };
    let package_ids = package_ids_pending_in_set(connection, packages, current_index_cache_key)?;
    backfill_packages_by_id(
        connection,
        &package_ids,
        pending_version,
        batch_options,
        current_index_cache_key,
    )
}

#[derive(Debug, Clone, Copy, Default)]
pub struct BackfillDrainLimits {
    pub max_packages: Option<usize>,
}

/// Drain pending packages in `package_id` order until limits or queue is empty.
pub(crate) fn drain_pending_package_backfill(
    connection: &Connection,
    batch_options: BackfillBatchOptions,
    limits: BackfillDrainLimits,
    current_index_cache_key: &str,
) -> rusqlite::Result<u64> {
    let Some(pending_version) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    if count_packages_pending_backfill(connection, current_index_cache_key)? == 0 {
        clear_pending_backfill_version(connection)?;
        return Ok(0);
    }

    let mut total_updated = 0u64;
    let mut packages_processed = 0usize;
    loop {
        if let Some(max_packages) = limits.max_packages
            && packages_processed >= max_packages
        {
            break;
        }
        let Some(package_id) =
            next_package_id_pending_backfill(connection, current_index_cache_key)?
        else {
            break;
        };
        let revision_before = read_package_backfill_revision(connection, package_id)?;
        let (updated_rows, reached_pending) = backfill_single_package(
            connection,
            package_id,
            pending_version,
            batch_options,
            current_index_cache_key,
        )?;
        total_updated += updated_rows;
        if !reached_pending {
            let revision_after = read_package_backfill_revision(connection, package_id)?;
            error!(
                package_id,
                revision_before,
                revision_after,
                pending_version,
                "package backfill made no progress; stopping drain to avoid a loop"
            );
            break;
        }
        packages_processed += 1;
    }
    maybe_clear_pending_when_all_complete(connection, current_index_cache_key)?;
    Ok(total_updated)
}

/// Packages in `packages` that still need backfill for the current pending migration.
pub(crate) fn count_packages_pending_in_set(
    connection: &Connection,
    packages: &[PackageInfo],
    current_index_cache_key: &str,
) -> rusqlite::Result<usize> {
    if packages.is_empty() {
        return Ok(0);
    }
    let Some(required_revision) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    count_packages_pending_in_scope_query(
        connection,
        packages,
        required_revision,
        current_index_cache_key,
    )
}

#[cfg(test)]
pub(crate) fn set_pending_backfill_for_tests(
    connection: &Connection,
    backfill_version: u32,
) -> rusqlite::Result<()> {
    write_pending_backfill_version(connection, backfill_version)
}

#[cfg(test)]
mod integration_tests {
    use std::time::Duration;

    use super::*;
    use crate::cache::index_engine_cache_key;
    use crate::storage::NciDatabase;
    use crate::storage_migrations::SCHEMA_VERSION;
    use crate::test_fixtures::minimal_test_symbol;
    use crate::types::{PackageGraph, PackageInfo, SharedString, SharedVec};

    fn seed_package_row(
        database: &NciDatabase,
        package_name: &str,
        package_version: &str,
        backfill_revision: u32,
    ) -> i64 {
        let connection = database.connection_for_tests();
        connection
            .execute(
                "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
                 VALUES (?1, ?2, 0, 0, 0, 0, ?3, ?4)",
                rusqlite::params![
                    package_name,
                    package_version,
                    index_engine_cache_key(&[]).as_str(),
                    backfill_revision as i64,
                ],
            )
            .expect("insert package");
        connection.last_insert_rowid()
    }

    /// Inserts symbols via [`NciDatabase::save_package`] (FTS-safe), then resets revision and
    /// `symbol_space` so the test backfill step has rows to update.
    fn seed_symbols_for_package(
        database: &mut NciDatabase,
        package_name: &str,
        package_version: &str,
        symbol_count: usize,
    ) -> i64 {
        let package_info = sample_package(package_name, package_version);
        let symbols: Vec<_> = (0..symbol_count)
            .map(|symbol_index| {
                minimal_test_symbol(
                    package_name,
                    package_version,
                    &format!("sym-{symbol_index}"),
                    &format!("name-{symbol_index}"),
                )
            })
            .collect();
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols,
            total_symbols: symbol_count,
            total_files: 1,
            crawl_duration_ms: 1.0,
            build_duration_ms: 1.0,
        };
        database
            .save_package(&package_info, &graph, index_engine_cache_key(&[]).as_str())
            .expect("save");
        let connection = database.connection_for_tests();
        let package_id: i64 = connection
            .query_row(
                "SELECT package_id FROM packages WHERE name = ?1 AND version = ?2",
                params![package_name, package_version],
                |row| row.get(0),
            )
            .expect("package_id");
        connection
            .execute(
                "UPDATE packages SET backfill_revision = 0 WHERE package_id = ?1",
                [package_id],
            )
            .expect("reset backfill_revision for pending tests");
        connection
            .execute(
                "UPDATE symbols SET symbol_space = '' WHERE package_id = ?1",
                [package_id],
            )
            .expect("clear symbol_space for backfill");
        package_id
    }

    fn sample_package(package_name: &str, package_version: &str) -> PackageInfo {
        PackageInfo {
            name: SharedString::from(package_name),
            version: SharedString::from(package_version),
            dir: SharedString::from("/pkg"),
            is_scoped: false,
            declared_dependencies: SharedVec::from([]),
        }
    }

    fn current_engine_cache_key() -> String {
        index_engine_cache_key(&[])
    }

    #[test]
    fn foreground_backfill_only_touches_index_scope() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("scoped.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");

        seed_package_row(&database, "in-scope-a", "1.0.0", 0);
        seed_package_row(&database, "in-scope-b", "1.0.0", 0);
        seed_package_row(&database, "out-of-scope", "1.0.0", 0);

        let scope = vec![
            sample_package("in-scope-a", "1.0.0"),
            sample_package("in-scope-b", "1.0.0"),
        ];
        database
            .foreground_backfill_for_packages(&scope, current_engine_cache_key().as_str())
            .expect("foreground");

        let connection = database.connection_for_tests();
        let in_scope_done: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM packages WHERE name LIKE 'in-scope-%' AND backfill_revision >= ?1",
                [TEST_PENDING_BACKFILL_VERSION],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(in_scope_done, 2);

        let out_of_scope_pending: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'out-of-scope'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(out_of_scope_pending, 0);

        assert!(
            read_pending_backfill_version(connection)
                .expect("read")
                .is_some()
        );
    }

    #[test]
    fn cache_hit_with_low_backfill_revision_when_no_pending() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("no-pending.sqlite")).expect("open");
        let package_info = sample_package("legacy-pkg", "1.0.0");
        let cache_key = index_engine_cache_key(&[]);

        seed_package_row(&database, "legacy-pkg", "1.0.0", 0);
        database
            .connection_for_tests()
            .execute(
                "UPDATE packages SET index_cache_key = ?1 WHERE name = 'legacy-pkg'",
                [cache_key.as_str()],
            )
            .expect("update key");

        assert!(database.has_cached_package(&package_info, cache_key.as_str(), None));
    }

    #[test]
    fn cache_hit_requires_backfill_revision() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("cache-rev.sqlite")).expect("open");
        let package_info = sample_package("cache-pkg", "1.0.0");
        let cache_key = index_engine_cache_key(&[]);

        seed_package_row(&database, "cache-pkg", "1.0.0", 0);
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");

        assert!(!database.has_cached_package(&package_info, cache_key.as_str(), None));

        database
            .connection_for_tests()
            .execute(
                "UPDATE packages SET backfill_revision = ?1, index_cache_key = ?2 WHERE name = 'cache-pkg'",
                rusqlite::params![TEST_PENDING_BACKFILL_VERSION, cache_key.as_str()],
            )
            .expect("update");

        clear_pending_backfill_version(database.connection_for_tests()).expect("clear");
        assert!(database.has_cached_package(&package_info, cache_key.as_str(), None));
    }

    #[test]
    fn drain_respects_max_packages_limit() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("drain.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");

        for index in 0..5 {
            seed_package_row(&database, &format!("pkg-{index}"), "1.0.0", 0);
        }

        database
            .drain_pending_package_backfill(
                BackfillDrainLimits {
                    max_packages: Some(2),
                },
                current_engine_cache_key().as_str(),
            )
            .expect("drain");

        let connection = database.connection_for_tests();
        let completed: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM packages WHERE backfill_revision >= ?1",
                [TEST_PENDING_BACKFILL_VERSION],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(completed, 2);
        assert!(
            read_pending_backfill_version(connection)
                .expect("read")
                .is_some()
        );
    }

    #[test]
    fn pending_meta_cleared_when_all_packages_complete() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("clear.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        seed_package_row(&database, "only-pkg", "1.0.0", 0);

        database
            .drain_pending_package_backfill(
                BackfillDrainLimits::default(),
                current_engine_cache_key().as_str(),
            )
            .expect("drain");

        assert!(
            read_pending_backfill_version(database.connection_for_tests())
                .expect("read")
                .is_none()
        );
    }

    #[test]
    fn backfill_single_package_is_idempotent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("idempotent.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        let package_id = seed_symbols_for_package(&mut database, "idem", "1.0.0", 6);

        let cache_key = current_engine_cache_key();
        let (first, _) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            TEST_PENDING_BACKFILL_VERSION,
            BackfillBatchOptions {
                batch_size: 2,
                ..Default::default()
            },
            cache_key.as_str(),
        )
        .expect("first");
        let (second, _) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            TEST_PENDING_BACKFILL_VERSION,
            BackfillBatchOptions::default(),
            cache_key.as_str(),
        )
        .expect("second");
        assert_eq!(first, 6);
        assert_eq!(second, 0);

        let revision: i64 = database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [package_id],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, TEST_PENDING_BACKFILL_VERSION as i64);
    }

    /// Sequential second `NciDatabase::open` after backfill cannot re-apply revision (e.g. second CLI run).
    #[test]
    fn cross_connection_backfill_does_not_double_apply_revision() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("cross-conn.sqlite");
        let mut setup_database = NciDatabase::open(&db_path).expect("open");
        set_pending_backfill_for_tests(
            setup_database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        let package_id = seed_symbols_for_package(&mut setup_database, "cross-pkg", "1.0.0", 8);
        drop(setup_database);

        let batch_options = BackfillBatchOptions {
            batch_size: 3,
            pause_between_batches: Duration::ZERO,
        };

        let first_database = NciDatabase::open(&db_path).expect("first open");
        let cache_key = current_engine_cache_key();
        let (first_updates, _) = backfill_single_package(
            first_database.connection_for_tests(),
            package_id,
            TEST_PENDING_BACKFILL_VERSION,
            batch_options,
            cache_key.as_str(),
        )
        .expect("first open");
        assert_eq!(first_updates, 8);

        let second_database = NciDatabase::open(&db_path).expect("second open");
        let (second_updates, _) = backfill_single_package(
            second_database.connection_for_tests(),
            package_id,
            TEST_PENDING_BACKFILL_VERSION,
            batch_options,
            cache_key.as_str(),
        )
        .expect("second open");
        assert_eq!(second_updates, 0);

        let revision: i64 = second_database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [package_id],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, TEST_PENDING_BACKFILL_VERSION as i64);
    }

    #[test]
    fn no_pending_meta_makes_foreground_a_noop() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("noop.sqlite")).expect("open");
        seed_package_row(&database, "pkg-a", "1.0.0", 0);

        let updated = database
            .foreground_backfill_for_packages(
                &[sample_package("pkg-a", "1.0.0")],
                current_engine_cache_key().as_str(),
            )
            .expect("foreground");
        assert_eq!(updated.symbol_rows_updated, 0);
        assert_eq!(updated.packages_backfilled, 0);

        let revision: i64 = database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'pkg-a'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, 0);
    }

    #[test]
    fn foreground_with_empty_package_list_is_noop() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("empty-scope.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        seed_package_row(&database, "orphan", "1.0.0", 0);

        let updated = database
            .foreground_backfill_for_packages(&[], current_engine_cache_key().as_str())
            .expect("foreground");
        assert_eq!(updated.symbol_rows_updated, 0);
        assert_eq!(updated.packages_backfilled, 0);

        let revision: i64 = database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'orphan'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, 0);
    }

    #[test]
    fn count_pending_is_zero_on_fresh_database() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("fresh-count.sqlite")).expect("open");
        assert_eq!(
            database
                .count_packages_pending_backfill(current_engine_cache_key().as_str())
                .expect("count"),
            0
        );
        assert!(database.pending_backfill_version().expect("read").is_none());
    }

    #[test]
    fn package_already_at_pending_revision_is_not_selected() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("already-done.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        seed_package_row(&database, "done", "1.0.0", TEST_PENDING_BACKFILL_VERSION);

        let package_ids = package_ids_pending_in_set(
            database.connection_for_tests(),
            &[sample_package("done", "1.0.0")],
            current_engine_cache_key().as_str(),
        )
        .expect("lookup");
        assert!(package_ids.is_empty());
    }

    #[test]
    fn drain_clears_stale_pending_meta_when_no_packages_need_work() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("stale-meta.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        seed_package_row(
            &database,
            "already-current",
            "1.0.0",
            TEST_PENDING_BACKFILL_VERSION,
        );

        let updated = database
            .drain_pending_package_backfill(
                BackfillDrainLimits::default(),
                current_engine_cache_key().as_str(),
            )
            .expect("drain");
        assert_eq!(updated, 0);
        assert!(
            read_pending_backfill_version(database.connection_for_tests())
                .expect("read")
                .is_none()
        );
    }

    #[test]
    fn revision_zero_without_pending_meta_is_not_counted_as_pending() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("rev-zero.sqlite")).expect("open");
        seed_package_row(&database, "legacy", "1.0.0", 0);
        assert_eq!(
            database
                .count_packages_pending_backfill(current_engine_cache_key().as_str())
                .expect("count"),
            0
        );
    }

    #[test]
    fn pending_without_registered_step_does_not_mark_package_complete() {
        const UNREGISTERED_BACKFILL_VERSION: u32 = 8_888;
        let temp = tempfile::tempdir().expect("tempdir");
        let database = NciDatabase::open(temp.path().join("no-step.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            UNREGISTERED_BACKFILL_VERSION,
        )
        .expect("pending");
        let package_id = seed_package_row(&database, "stale", "1.0.0", 0);

        let (updated, reached_pending) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            UNREGISTERED_BACKFILL_VERSION,
            BackfillBatchOptions::default(),
            current_engine_cache_key().as_str(),
        )
        .expect("backfill");
        assert_eq!(updated, 0);
        assert!(!reached_pending);

        let revision: i64 = database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'stale'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, 0);
    }

    #[test]
    fn foreground_backfill_skips_packages_with_stale_index_cache_key() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database =
            NciDatabase::open(temp.path().join("stale-cache-key.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");

        database
            .connection_for_tests()
            .execute(
                "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
                 VALUES ('stale-key-pkg', '1.0.0', 0, 0, 0, 0, 'stale-cache-key', 0)",
                [],
            )
            .expect("insert stale-key package");

        let scope = vec![sample_package("stale-key-pkg", "1.0.0")];
        let result = database
            .foreground_backfill_for_packages(&scope, current_engine_cache_key().as_str())
            .expect("foreground");
        assert_eq!(result.packages_backfilled, 0);
        assert_eq!(result.symbol_rows_updated, 0);

        let connection = database.connection_for_tests();
        let revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'stale-key-pkg'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, 0);
        assert_eq!(
            database
                .count_packages_pending_backfill(current_engine_cache_key().as_str())
                .expect("count"),
            0
        );
        assert!(
            read_pending_backfill_version(connection)
                .expect("read")
                .is_none(),
            "no matching-key packages need work; global pending is cleared"
        );
    }

    #[test]
    fn drain_clears_pending_when_only_stale_index_cache_key_packages_lag() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database =
            NciDatabase::open(temp.path().join("stale-drain-clear.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            TEST_PENDING_BACKFILL_VERSION,
        )
        .expect("pending");
        database
            .connection_for_tests()
            .execute(
                "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
                 VALUES ('only-stale', '1.0.0', 0, 0, 0, 0, 'legacy-cache-key', 0)",
                [],
            )
            .expect("insert");

        let updated = database
            .drain_pending_package_backfill(
                BackfillDrainLimits::default(),
                current_engine_cache_key().as_str(),
            )
            .expect("drain");
        assert_eq!(updated, 0);
        assert!(
            read_pending_backfill_version(database.connection_for_tests())
                .expect("read")
                .is_none()
        );
    }

    #[test]
    fn chained_backfill_runs_all_registered_steps_up_to_pending_target() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("chain-full.sqlite")).expect("open");
        set_pending_backfill_for_tests(database.connection_for_tests(), TEST_CHAIN_BACKFILL_V3)
            .expect("pending");
        let package_id = seed_symbols_for_package(&mut database, "chain-full", "1.0.0", 4);
        database
            .connection_for_tests()
            .execute(
                "UPDATE packages SET backfill_revision = ?1 WHERE package_id = ?2",
                params![TEST_PENDING_BACKFILL_VERSION, package_id],
            )
            .expect("pretend legacy backfill step already applied");

        let (updated, reached_pending) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            TEST_CHAIN_BACKFILL_V3,
            BackfillBatchOptions {
                batch_size: 2,
                pause_between_batches: Duration::ZERO,
            },
            current_engine_cache_key().as_str(),
        )
        .expect("chain");
        assert_eq!(updated, 12);
        assert!(reached_pending);

        let connection = database.connection_for_tests();
        let revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [package_id],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, TEST_CHAIN_BACKFILL_V3 as i64);

        let symbol_space: String = connection
            .query_row(
                "SELECT symbol_space FROM symbols WHERE package_id = ?1 LIMIT 1",
                [package_id],
                |row| row.get(0),
            )
            .expect("symbol_space");
        assert_eq!(symbol_space, "chain-v9103");
    }

    #[test]
    fn chained_backfill_resumes_from_partial_package_revision() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database =
            NciDatabase::open(temp.path().join("chain-resume.sqlite")).expect("open");
        set_pending_backfill_for_tests(database.connection_for_tests(), TEST_CHAIN_BACKFILL_V3)
            .expect("pending");
        let package_id = seed_symbols_for_package(&mut database, "chain-resume", "1.0.0", 3);
        database
            .connection_for_tests()
            .execute(
                "UPDATE packages SET backfill_revision = ?1 WHERE package_id = ?2",
                params![TEST_CHAIN_BACKFILL_V1, package_id],
            )
            .expect("partial revision");
        database
            .connection_for_tests()
            .execute(
                "UPDATE symbols SET symbol_space = 'chain-v9101' WHERE package_id = ?1",
                [package_id],
            )
            .expect("partial symbols");

        let (updated, reached_pending) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            TEST_CHAIN_BACKFILL_V3,
            BackfillBatchOptions {
                batch_size: 2,
                pause_between_batches: Duration::ZERO,
            },
            current_engine_cache_key().as_str(),
        )
        .expect("resume");
        assert_eq!(updated, 6);
        assert!(reached_pending);

        let connection = database.connection_for_tests();
        let revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [package_id],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, TEST_CHAIN_BACKFILL_V3 as i64);

        let symbol_space: String = connection
            .query_row(
                "SELECT symbol_space FROM symbols WHERE package_id = ?1 LIMIT 1",
                [package_id],
                |row| row.get(0),
            )
            .expect("symbol_space");
        assert_eq!(symbol_space, "chain-v9103");
    }

    #[test]
    fn chained_backfill_stops_short_when_pending_exceeds_last_registered_step() {
        const UNREGISTERED_PENDING_TARGET: u32 = 9_150;
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("chain-gap.sqlite")).expect("open");
        set_pending_backfill_for_tests(
            database.connection_for_tests(),
            UNREGISTERED_PENDING_TARGET,
        )
        .expect("pending");
        let package_id = seed_symbols_for_package(&mut database, "chain-gap", "1.0.0", 2);

        let (updated, reached_pending) = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            UNREGISTERED_PENDING_TARGET,
            BackfillBatchOptions {
                pause_between_batches: Duration::ZERO,
                ..Default::default()
            },
            current_engine_cache_key().as_str(),
        )
        .expect("gap");
        assert_eq!(updated, 8);
        assert!(!reached_pending);

        let connection = database.connection_for_tests();
        let revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [package_id],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, TEST_CHAIN_BACKFILL_V3 as i64);
        assert!(
            read_pending_backfill_version(connection)
                .expect("read")
                .is_some(),
            "pending remains until target revision is reached"
        );
        assert_eq!(
            database
                .count_packages_pending_backfill(current_engine_cache_key().as_str())
                .expect("count"),
            1
        );
    }

    #[test]
    fn drain_chains_only_packages_behind_pending_target() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("chain-mixed.sqlite")).expect("open");
        set_pending_backfill_for_tests(database.connection_for_tests(), TEST_CHAIN_BACKFILL_V3)
            .expect("pending");

        let stale_package_id = seed_symbols_for_package(&mut database, "stale-chain", "1.0.0", 3);
        let current_package_id =
            seed_package_row(&database, "current-chain", "1.0.0", TEST_CHAIN_BACKFILL_V3);

        database
            .drain_pending_package_backfill(
                BackfillDrainLimits::default(),
                current_engine_cache_key().as_str(),
            )
            .expect("drain");

        let connection = database.connection_for_tests();
        let stale_revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [stale_package_id],
                |row| row.get(0),
            )
            .expect("stale revision");
        assert_eq!(stale_revision, TEST_CHAIN_BACKFILL_V3 as i64);

        let stale_symbol_space: String = connection
            .query_row(
                "SELECT symbol_space FROM symbols WHERE package_id = ?1 LIMIT 1",
                [stale_package_id],
                |row| row.get(0),
            )
            .expect("stale symbol_space");
        assert_eq!(stale_symbol_space, "chain-v9103");

        let current_revision: i64 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [current_package_id],
                |row| row.get(0),
            )
            .expect("current revision");
        assert_eq!(current_revision, TEST_CHAIN_BACKFILL_V3 as i64);

        assert!(
            read_pending_backfill_version(connection)
                .expect("read")
                .is_none()
        );
    }

    #[test]
    fn fresh_save_sets_backfill_revision_to_schema_version() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut database = NciDatabase::open(temp.path().join("save.sqlite")).expect("open");
        let package_info = sample_package("saved", "1.0.0");
        let graph = PackageGraph {
            package: package_info.name.clone(),
            version: package_info.version.clone(),
            symbols: vec![],
            total_symbols: 0,
            total_files: 0,
            crawl_duration_ms: 1.0,
            build_duration_ms: 1.0,
        };
        database
            .save_package(&package_info, &graph, index_engine_cache_key(&[]).as_str())
            .expect("save");
        let revision: i64 = database
            .connection_for_tests()
            .query_row(
                "SELECT backfill_revision FROM packages WHERE name = 'saved'",
                [],
                |row| row.get(0),
            )
            .expect("revision");
        assert_eq!(revision, SCHEMA_VERSION as i64);
    }
}
