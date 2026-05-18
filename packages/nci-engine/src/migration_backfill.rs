//! Batched, keyset-paginated symbol updates for package-scoped backfill.

use std::thread;
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension, params};

/// Tunables for batched symbol backfill passes.
#[derive(Debug, Clone, Copy)]
pub(crate) struct BackfillBatchOptions {
    pub batch_size: usize,
    pub pause_between_batches: Duration,
}

impl Default for BackfillBatchOptions {
    fn default() -> Self {
        Self {
            batch_size: 5_000,
            pause_between_batches: Duration::from_millis(50),
        }
    }
}

/// Applies `set_clause` only to symbols owned by `package_id`.
#[allow(dead_code)] // Called from `PACKAGE_BACKFILL_STEPS` when a Backfill migration is registered.
pub(crate) fn run_batched_symbol_update_for_package(
    connection: &Connection,
    package_id: i64,
    set_clause: &str,
    filter_clause: Option<&str>,
    options: BackfillBatchOptions,
) -> rusqlite::Result<u64> {
    let batch_size = options.batch_size.max(1) as i64;
    let filter_suffix = filter_clause
        .filter(|clause| !clause.trim().is_empty())
        .map(|clause| format!(" AND ({clause})"))
        .unwrap_or_default();
    let package_scope = format!(" AND package_id = {package_id}");

    let batch_max_sql = format!(
        "SELECT MAX(batch.symbol_id) FROM (
            SELECT symbol_id
            FROM symbols
            WHERE symbol_id > ?1{filter_suffix}{package_scope}
            ORDER BY symbol_id ASC
            LIMIT ?2
        ) batch"
    );
    let update_sql = format!(
        "UPDATE symbols
         SET {set_clause}
         WHERE symbol_id > ?1
           AND symbol_id <= ?2{filter_suffix}{package_scope}"
    );

    let mut last_symbol_id: i64 = 0;
    let mut total_updated: u64 = 0;

    loop {
        let batch_max: Option<i64> = connection
            .query_row(&batch_max_sql, params![last_symbol_id, batch_size], |row| {
                row.get(0)
            })
            .optional()?
            .flatten();
        let Some(batch_max_id) = batch_max else {
            break;
        };
        if batch_max_id <= last_symbol_id {
            break;
        }

        let updated = connection.execute(&update_sql, params![last_symbol_id, batch_max_id])?;
        if updated == 0 {
            break;
        }
        total_updated += updated as u64;
        last_symbol_id = batch_max_id;

        if !options.pause_between_batches.is_zero() {
            thread::sleep(options.pause_between_batches);
        }
    }

    Ok(total_updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn open_symbols_table(connection: &Connection) {
        connection
            .execute_batch(
                "CREATE TABLE symbols (
                    symbol_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    package_id INTEGER NOT NULL,
                    symbol_space TEXT NOT NULL DEFAULT 'value'
                );",
            )
            .expect("ddl");
    }

    #[test]
    fn package_scoped_update_visits_every_row_for_one_package() {
        let connection = Connection::open_in_memory().expect("open");
        open_symbols_table(&connection);
        for _ in 0..12 {
            connection
                .execute(
                    "INSERT INTO symbols (package_id, symbol_space) VALUES (1, 'type')",
                    [],
                )
                .expect("insert");
        }

        let updated = run_batched_symbol_update_for_package(
            &connection,
            1,
            "symbol_space = 'value'",
            None,
            BackfillBatchOptions {
                batch_size: 4,
                pause_between_batches: Duration::ZERO,
            },
        )
        .expect("backfill");

        assert_eq!(updated, 12);
        let remaining: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM symbols WHERE symbol_space != 'value'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(remaining, 0);
    }

    #[test]
    fn package_scoped_update_skips_other_packages() {
        let connection = Connection::open_in_memory().expect("open");
        open_symbols_table(&connection);
        for _ in 0..5 {
            connection
                .execute(
                    "INSERT INTO symbols (package_id, symbol_space) VALUES (1, 'type')",
                    [],
                )
                .expect("insert pkg 1");
        }
        for _ in 0..5 {
            connection
                .execute(
                    "INSERT INTO symbols (package_id, symbol_space) VALUES (2, 'type')",
                    [],
                )
                .expect("insert pkg 2");
        }

        let updated = run_batched_symbol_update_for_package(
            &connection,
            1,
            "symbol_space = 'value'",
            None,
            BackfillBatchOptions {
                batch_size: 3,
                pause_between_batches: Duration::ZERO,
            },
        )
        .expect("backfill");

        assert_eq!(updated, 5);
        let other_pkg_remaining: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM symbols WHERE package_id = 2 AND symbol_space != 'value'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(other_pkg_remaining, 5);
    }

    #[test]
    fn package_scoped_update_noop_when_package_has_no_symbols() {
        let connection = Connection::open_in_memory().expect("open");
        open_symbols_table(&connection);
        let updated = run_batched_symbol_update_for_package(
            &connection,
            99,
            "symbol_space = 'value'",
            None,
            BackfillBatchOptions::default(),
        )
        .expect("backfill");
        assert_eq!(updated, 0);
    }
}
