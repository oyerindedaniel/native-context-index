//! Delete the NCI SQLite cache file and WAL sidecars.
//!
//! Path resolution matches the engine ([`nci_engine::nci_sqlite_path`]): `NCI_CACHE_DIR` if set,
//! otherwise `{dirs::cache_dir}/nci/nci.sqlite` (and `…-wal` / `…-shm`).
//!
//! Run: `cargo run -p nci-engine --example clear_cache_db`
//! Dry run: `cargo run -p nci-engine --example clear_cache_db -- --dry-run`

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use nci_engine::nci_sqlite_path;

fn sqlite_wal_sidecars(database_path: &Path) -> [PathBuf; 2] {
    let mut wal = database_path.as_os_str().to_owned();
    wal.push("-wal");
    let mut shm = database_path.as_os_str().to_owned();
    shm.push("-shm");
    [PathBuf::from(wal), PathBuf::from(shm)]
}

fn main() -> std::io::Result<()> {
    let dry_run = env::args().any(|arg| arg == "--dry-run" || arg == "-n");

    let Some(database_path) = nci_sqlite_path() else {
        eprintln!("nci-engine: no cache path (could not resolve cache directory).");
        std::process::exit(1);
    };

    let mut paths_to_remove: Vec<PathBuf> = vec![database_path.clone()];
    paths_to_remove.extend(sqlite_wal_sidecars(&database_path).into_iter());

    let mut removed_any = false;
    for path in &paths_to_remove {
        if !path.exists() {
            continue;
        }
        removed_any = true;
        if dry_run {
            println!("would remove {}", path.display());
        } else {
            fs::remove_file(path)?;
            println!("removed {}", path.display());
        }
    }

    if !removed_any {
        println!("nothing to remove at {}", database_path.display());
    } else if dry_run {
        println!("(dry run; pass without --dry-run to delete)");
    }

    Ok(())
}
