//! Per-package deferred backfill for [`crate::storage_migrations::MigrationKind::Backfill`].
//!
//! DDL runs at migrate time; symbol row updates run per `package_id` during index (foreground),
//! `nci db backfill`, or on first read of a cold package.

use rusqlite::{Connection, OptionalExtension, params};
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

/// Reserved migration version for tests only (not used by production `MIGRATIONS`).
pub const TEST_PENDING_BACKFILL_VERSION: u32 = 9_001;

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

/// Registry keyed by migration version. Production [`MigrationKind::Backfill`] migrations register here.
#[cfg(any(test, feature = "test-support"))]
const PACKAGE_BACKFILL_STEPS: &[(u32, PackageBackfillStep)] =
    &[(TEST_PENDING_BACKFILL_VERSION, test_backfill_touch_symbols)];

#[cfg(not(any(test, feature = "test-support")))]
const PACKAGE_BACKFILL_STEPS: &[(u32, PackageBackfillStep)] = &[];

fn package_backfill_step_for_version(backfill_version: u32) -> Option<PackageBackfillStep> {
    PACKAGE_BACKFILL_STEPS
        .iter()
        .find(|(version, _)| *version == backfill_version)
        .map(|(_, step)| *step)
}

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

/// Minimum `packages.backfill_revision` required for cache hits while `pending_backfill` is set.
pub(crate) fn required_backfill_revision(connection: &Connection) -> rusqlite::Result<Option<u32>> {
    read_pending_backfill_version(connection)
}

pub(crate) fn count_packages_pending_backfill(connection: &Connection) -> rusqlite::Result<u64> {
    let Some(required) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    connection
        .query_row(
            "SELECT COUNT(*) FROM packages WHERE backfill_revision < ?1",
            [required],
            |count_row| count_row.get(0),
        )
        .map(|count: i64| count.max(0) as u64)
}

pub(crate) fn package_ids_pending_in_set(
    connection: &Connection,
    packages: &[PackageInfo],
) -> rusqlite::Result<Vec<i64>> {
    if packages.is_empty() {
        return Ok(Vec::new());
    }
    let Some(required_revision) = read_pending_backfill_version(connection)? else {
        return Ok(Vec::new());
    };
    let mut package_ids = Vec::with_capacity(packages.len());
    let mut lookup = connection.prepare(
        "SELECT package_id FROM packages
         WHERE name = ?1 AND version = ?2 AND backfill_revision < ?3",
    )?;
    for package in packages {
        let package_id_opt: Option<i64> = lookup
            .query_row(
                params![
                    package.name.as_ref(),
                    package.version.as_ref(),
                    required_revision,
                ],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(package_id) = package_id_opt {
            package_ids.push(package_id);
        }
    }
    Ok(package_ids)
}

pub(crate) fn next_package_id_pending_backfill(
    connection: &Connection,
) -> rusqlite::Result<Option<i64>> {
    let Some(required) = read_pending_backfill_version(connection)? else {
        return Ok(None);
    };
    connection
        .query_row(
            "SELECT package_id FROM packages
             WHERE backfill_revision < ?1
             ORDER BY package_id ASC
             LIMIT 1",
            [required],
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

fn maybe_clear_pending_when_all_complete(connection: &Connection) -> rusqlite::Result<()> {
    if read_pending_backfill_version(connection)?.is_none() {
        return Ok(());
    }
    if count_packages_pending_backfill(connection)? == 0 {
        clear_pending_backfill_version(connection)?;
    }
    Ok(())
}

/// Applies the registered backfill step for the pending migration version, then marks the package.
pub(crate) fn backfill_single_package(
    connection: &Connection,
    package_id: i64,
    batch_options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    let Some(pending_version) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    let current_revision: u32 = connection
        .query_row(
            "SELECT backfill_revision FROM packages WHERE package_id = ?1",
            [package_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|revision| revision as u32)?;
    if current_revision >= pending_version {
        return Ok(0);
    }
    let Some(step) = package_backfill_step_for_version(pending_version) else {
        error!(
            pending_version,
            package_id,
            "pending_backfill is set but PACKAGE_BACKFILL_STEPS has no entry for this version"
        );
        return Ok(0);
    };
    let updated_rows = step(connection, package_id, batch_options)?;
    mark_package_backfill_complete(connection, package_id, pending_version)?;
    Ok(updated_rows)
}

pub(crate) fn backfill_packages_by_id(
    connection: &Connection,
    package_ids: &[i64],
    batch_options: BackfillBatchOptions,
) -> rusqlite::Result<ForegroundBackfillResult> {
    let Some(pending_version) = read_pending_backfill_version(connection)? else {
        return Ok(ForegroundBackfillResult::default());
    };
    let mut result = ForegroundBackfillResult::default();
    for package_id in package_ids {
        let current_revision: u32 = connection
            .query_row(
                "SELECT backfill_revision FROM packages WHERE package_id = ?1",
                [*package_id],
                |row| row.get::<_, i64>(0),
            )
            .map(|revision| revision as u32)?;
        if current_revision >= pending_version {
            continue;
        }
        let updated_rows = backfill_single_package(connection, *package_id, batch_options)?;
        result.packages_backfilled += 1;
        result.symbol_rows_updated += updated_rows;
    }
    maybe_clear_pending_when_all_complete(connection)?;
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
) -> rusqlite::Result<ForegroundBackfillResult> {
    let package_ids = package_ids_pending_in_set(connection, packages)?;
    backfill_packages_by_id(connection, &package_ids, batch_options)
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
) -> rusqlite::Result<u64> {
    let Some(pending_version) = read_pending_backfill_version(connection)? else {
        return Ok(0);
    };
    if count_packages_pending_backfill(connection)? == 0 {
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
        let Some(package_id) = next_package_id_pending_backfill(connection)? else {
            break;
        };
        let revision_before = read_package_backfill_revision(connection, package_id)?;
        total_updated += backfill_single_package(connection, package_id, batch_options)?;
        let revision_after = read_package_backfill_revision(connection, package_id)?;
        if revision_after < pending_version {
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
    maybe_clear_pending_when_all_complete(connection)?;
    Ok(total_updated)
}

/// Packages in `packages` that still need backfill for the current pending migration.
pub(crate) fn count_packages_pending_in_set(
    connection: &Connection,
    packages: &[PackageInfo],
) -> rusqlite::Result<usize> {
    Ok(package_ids_pending_in_set(connection, packages)?.len())
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
            .foreground_backfill_for_packages(&scope)
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

        assert!(database.has_cached_package(&package_info, cache_key.as_str()));
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

        assert!(!database.has_cached_package(&package_info, cache_key.as_str()));

        database
            .connection_for_tests()
            .execute(
                "UPDATE packages SET backfill_revision = ?1, index_cache_key = ?2 WHERE name = 'cache-pkg'",
                rusqlite::params![TEST_PENDING_BACKFILL_VERSION, cache_key.as_str()],
            )
            .expect("update");

        clear_pending_backfill_version(database.connection_for_tests()).expect("clear");
        assert!(database.has_cached_package(&package_info, cache_key.as_str()));
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
            .drain_pending_package_backfill(BackfillDrainLimits {
                max_packages: Some(2),
            })
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
            .drain_pending_package_backfill(BackfillDrainLimits::default())
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

        let first = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            BackfillBatchOptions {
                batch_size: 2,
                ..Default::default()
            },
        )
        .expect("first");
        let second = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            BackfillBatchOptions::default(),
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
        let first_updates = backfill_single_package(
            first_database.connection_for_tests(),
            package_id,
            batch_options,
        )
        .expect("first open");
        assert_eq!(first_updates, 8);

        let second_database = NciDatabase::open(&db_path).expect("second open");
        let second_updates = backfill_single_package(
            second_database.connection_for_tests(),
            package_id,
            batch_options,
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
            .foreground_backfill_for_packages(&[sample_package("pkg-a", "1.0.0")])
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
            .foreground_backfill_for_packages(&[])
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
            database.count_packages_pending_backfill().expect("count"),
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
            .drain_pending_package_backfill(BackfillDrainLimits::default())
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
            database.count_packages_pending_backfill().expect("count"),
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

        let updated = backfill_single_package(
            database.connection_for_tests(),
            package_id,
            BackfillBatchOptions::default(),
        )
        .expect("backfill");
        assert_eq!(updated, 0);

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
