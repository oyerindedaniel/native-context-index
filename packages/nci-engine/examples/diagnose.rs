//! Support / diagnostics: print nci-engine version, cache paths, and SQLite state.
//!
//! Run from repo root:
//!
//! ```text
//! cargo run -p nci-engine --example diagnose
//! ```
//!
//! With tracing (stderr):
//!
//! ```text
//! NCI_LOG=1 cargo run -p nci-engine --example diagnose
//! ```
//!
//! Or:
//!
//! ```text
//! RUST_LOG=nci_engine=debug cargo run -p nci-engine --example diagnose
//! ```

use std::env;
use std::sync::OnceLock;

use nci_engine::cache::{nci_cache_base_dir, nci_sqlite_path, NCI_ENGINE_VERSION};
use nci_engine::storage::NciDatabase;

fn try_init_tracing_from_env() {
    static INIT: OnceLock<()> = OnceLock::new();
    INIT.get_or_init(|| {
        let nci_log = env::var("NCI_LOG").map(|value| value == "1").unwrap_or(false);
        let rust_log_set = env::var("RUST_LOG").map(|value| !value.is_empty()).unwrap_or(false);
        if !nci_log && !rust_log_set {
            return;
        }
        let filter = if rust_log_set {
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("nci_engine=debug")
            })
        } else {
            tracing_subscriber::EnvFilter::new("nci_engine=debug")
        };
        let _ignored = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(std::io::stderr)
            .try_init();
    });
}

fn main() {
    try_init_tracing_from_env();

    println!("nci-engine diagnostics");
    println!("=======================");
    println!("crate_version (engine): {}", NCI_ENGINE_VERSION);
    println!("embedded SCHEMA_VERSION: {}", nci_engine::SCHEMA_VERSION);

    match env::var("NCI_CACHE_DIR") {
        Ok(value) => println!("NCI_CACHE_DIR: {}", value),
        Err(_) => println!("NCI_CACHE_DIR: (unset)"),
    }

    match nci_cache_base_dir() {
        Some(ref path) => {
            println!("nci_cache_base_dir: {}", path.display());
            println!(
                "  exists: {}",
                path.exists() && path.is_dir()
            );
        }
        None => println!("nci_cache_base_dir: (none — dirs::cache_dir and NCI_CACHE_DIR both unavailable)"),
    }

    match nci_sqlite_path() {
        Some(ref sqlite_path) => {
            println!("nci_sqlite_path: {}", sqlite_path.display());
            println!(
                "  file_exists: {}",
                sqlite_path.exists()
            );
            if let Some(parent) = sqlite_path.parent() {
                println!(
                    "  parent_exists: {}",
                    parent.exists() && parent.is_dir()
                );
            }

            match NciDatabase::open(sqlite_path) {
                Ok(database) => {
                    println!("NciDatabase::open: Ok");
                    match database.stored_schema_version() {
                        Ok(version) => println!("  nci_meta schema_version: {}", version),
                        Err(error) => println!("  nci_meta schema_version: (read error) {}", error),
                    }
                    match database.journal_mode_label() {
                        Ok(mode) => println!("  PRAGMA journal_mode: {}", mode),
                        Err(error) => println!("  PRAGMA journal_mode: (error) {}", error),
                    }
                }
                Err(error) => {
                    println!("NciDatabase::open: Err — {}", error);
                    if sqlite_path.exists() {
                        println!("  hint: file exists but open/migrate failed; check permissions or SchemaTooNew message above");
                    } else {
                        println!("  hint: database file not created yet (first index will create it)");
                    }
                }
            }
        }
        None => println!("nci_sqlite_path: (none)"),
    }

    println!(
        "\ncwd: {}",
        env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "(unknown)".into())
    );
}
