//! Rough timings for `scanner::scan_packages` (one full directory read per timed call).
//!
//! Default: `<repo>/node_modules` only — 3 package names × 3 runs = **9** measurements.
//! Pass `--workspaces` to also time `apps/docs` and `apps/web` `node_modules` when present.
//!
//! From repo root, release build:
//! `cargo run -p nci-engine --example scanner_microbench --release -- . typescript vitest vite`
//! `cargo run -p nci-engine --example scanner_microbench --release -- . --workspaces typescript vitest vite`

use std::path::{Path, PathBuf};
use std::time::Instant;

use nci_engine::scanner::scan_packages;

fn collect_node_modules_roots(repo_root: &Path, include_workspaces: bool) -> Vec<PathBuf> {
    let mut roots = vec![repo_root.join("node_modules")];
    if include_workspaces {
        for relative_node_modules in ["apps/docs/node_modules", "apps/web/node_modules"] {
            let workspace_nm = repo_root.join(relative_node_modules);
            if workspace_nm.is_dir() {
                roots.push(workspace_nm);
            }
        }
    }
    roots
}

fn main() {
    let mut args = std::env::args().skip(1);
    let repo_root: PathBuf = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    let mut include_workspaces = false;
    let mut name_args: Vec<String> = Vec::new();
    for a in args {
        if a == "--workspaces" {
            include_workspaces = true;
        } else {
            name_args.push(a);
        }
    }

    let names: Vec<&str> = if name_args.is_empty() {
        vec!["typescript", "vitest", "vite"]
    } else {
        name_args.iter().map(String::as_str).collect()
    };

    let roots = collect_node_modules_roots(&repo_root, include_workspaces);

    eprintln!(
        "scanner_microbench: repo={} roots={} pkgs={} × 3 runs/root",
        repo_root.display(),
        roots.len(),
        names.len(),
    );

    for node_modules in roots {
        if !node_modules.is_dir() {
            eprintln!("skip (missing): {}", node_modules.display());
            continue;
        }
        let label = node_modules
            .parent()
            .and_then(Path::file_name)
            .and_then(|parent_name| parent_name.to_str())
            .unwrap_or("node_modules");
        for name in &names {
            for run in 1..=3u8 {
                let started = Instant::now();
                let packages = scan_packages(&node_modules).expect("scan_packages");
                let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
                let hits = packages
                    .iter()
                    .filter(|package_info| package_info.name.as_ref() == *name)
                    .count();
                println!(
                    "root={label} pkg={name} run={run}/3 scan_ms={elapsed_ms:.2} name_hits={hits}"
                );
            }
        }
    }
}
