//! Full-workspace demo: merges repo / `nci-core` / `nci-engine` `node_modules`, dedupes by
//! canonical package directory, then indexes with [`nci_engine::pipeline::index_packages`]
//! (concurrent per package unless `--sequential`).
//!
//! Flags: `--package NAME` (repeatable), `--output PATH`, `--sequential` (serialize package indexing),
//! `--skip-write` (skip huge JSON export — for timing index work only), `--profile` (sets `NCI_PROFILE=1`; stderr lines only if built with `--features phase-profile`),
//! `--no-package-cache` (no SQLite read/write; crawl only, then optional JSON — for dev profiling),
//! `--no-parallel-resolve-deps` (graph build resolves symbol dependencies sequentially — for A/B timing).
//!
//! Env: `NCI_INDEX_NO_CACHE=1` is the same as `--no-package-cache` (handy when you cannot pass flags).
//! `NCI_PARALLEL_RESOLVE_DEPS=0` is the same as `--no-parallel-resolve-deps`.
//!
//! # Diagnostics
//!
//! - `NCI_LOG=1` enables stderr logging for `nci_engine` at `debug` (cache and sqlite).
//! - Or set `RUST_LOG` (see `tracing-subscriber` env filter), e.g. `RUST_LOG=nci_engine=trace`.
//! - Phase profiling: build with `cargo run -p nci-engine --example demo --features phase-profile`, then
//!   `NCI_PROFILE=1` or `--profile` prints crawl/graph substeps to stderr (`  [profile] label …ms`).
//! - By default this example uses the per-package SQLite cache (`IndexOptions::enable_package_cache`).
//!   Use `--no-package-cache` or `NCI_INDEX_NO_CACHE=1` to force a fresh crawl and skip the DB.
//! - One-shot support bundle: `cargo run -p nci-engine --example diagnose`.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Instant;

use nci_engine::pipeline::{
    GraphSource, IndexOptions, IndexedGraph, dedupe_packages_by_canonical_dir, index_packages,
};
use nci_engine::scanner::scan_packages;
struct IndexedSummary<'a> {
    package: &'a str,
    total_symbols: usize,
    total_files: usize,
    crawl_duration_ms: f64,
    build_duration_ms: f64,
}

fn indexed_summary(result: &IndexedGraph) -> IndexedSummary<'_> {
    if let Some(graph) = result.graph.as_ref() {
        IndexedSummary {
            package: graph.package.as_ref(),
            total_symbols: graph.total_symbols,
            total_files: graph.total_files,
            crawl_duration_ms: graph.crawl_duration_ms,
            build_duration_ms: graph.build_duration_ms,
        }
    } else if let Some(meta) = result.cache_metadata.as_ref() {
        IndexedSummary {
            package: meta.package.as_ref(),
            total_symbols: meta.total_symbols,
            total_files: meta.total_files,
            crawl_duration_ms: meta.crawl_duration_ms,
            build_duration_ms: meta.build_duration_ms,
        }
    } else {
        IndexedSummary {
            package: "?",
            total_symbols: 0,
            total_files: 0,
            crawl_duration_ms: 0.0,
            build_duration_ms: 0.0,
        }
    }
}

fn summary_timings_shown(result: &IndexedGraph) -> (f64, f64) {
    let row = indexed_summary(result);
    if result.source == GraphSource::Cached {
        (0.0, 0.0)
    } else {
        (row.crawl_duration_ms, row.build_duration_ms)
    }
}

fn format_duration_ms(ms: f64) -> String {
    let ms = if ms.is_finite() { ms.max(0.0) } else { 0.0 };
    if ms == 0.0 {
        return "0".to_string();
    }
    let sec = ms / 1000.0;
    if sec >= 60.0 {
        let mins = (sec / 60.0).floor() as u64;
        let rem = sec - (mins as f64) * 60.0;
        format!("{mins}m {rem:.1}s")
    } else if sec >= 1.0 {
        format!("{sec:.2}s")
    } else {
        format!("{sec:.3}s")
    }
}

fn load_engine_dotenv(engine_dir: &std::path::Path) {
    let path = engine_dir.join(".env");
    if path.is_file() {
        let _ = dotenvy::from_path(path);
    }
}

fn try_init_tracing_from_env() {
    static INIT: OnceLock<()> = OnceLock::new();
    INIT.get_or_init(|| {
        let nci_log = env::var("NCI_LOG")
            .map(|value| value == "1")
            .unwrap_or(false);
        let rust_log_set = env::var("RUST_LOG")
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        if !nci_log && !rust_log_set {
            return;
        }
        let filter = if rust_log_set {
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("nci_engine=debug"))
        } else {
            tracing_subscriber::EnvFilter::new("nci_engine=debug")
        };
        let _ignored = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(std::io::stderr)
            .try_init();
    });
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = engine_dir.join("../..");
    load_engine_dotenv(&engine_dir);

    let args: Vec<String> = env::args().collect();
    let mut target_packages_args: Vec<String> = Vec::new();
    let mut output_path = String::from("nci-report-rust.json");
    let mut use_sequential = false;
    let mut skip_write = false;
    let mut pretty_json = false;
    let mut profile_phases = false;
    let mut no_package_cache = false;
    let mut no_parallel_resolve_deps = false;

    let mut current_index = 1;
    while current_index < args.len() {
        match args[current_index].as_str() {
            "--package" if current_index + 1 < args.len() => {
                target_packages_args.push(args[current_index + 1].clone());
                current_index += 1;
            }
            "--output" if current_index + 1 < args.len() => {
                output_path = args[current_index + 1].clone();
                current_index += 1;
            }
            "--sequential" => {
                use_sequential = true;
            }
            "--skip-write" => {
                skip_write = true;
            }
            "--pretty" => {
                pretty_json = true;
            }
            "--profile" => {
                profile_phases = true;
            }
            "--no-package-cache" => {
                no_package_cache = true;
            }
            "--no-parallel-resolve-deps" => {
                no_parallel_resolve_deps = true;
            }
            _ => {}
        }
        current_index += 1;
    }

    if env::var("NCI_INDEX_NO_CACHE")
        .map(|value| value == "1")
        .unwrap_or(false)
    {
        no_package_cache = true;
    }
    if let Ok(raw) = env::var("NCI_PARALLEL_RESOLVE_DEPS") {
        let lower = raw.to_lowercase();
        if lower == "0" || lower == "false" || lower == "off" {
            no_parallel_resolve_deps = true;
        }
    }

    if profile_phases {
        // SAFETY: set once on the main thread before `index_packages` spawns work that reads `NCI_PROFILE`
        // (only consulted when this crate is built with `--features phase-profile`).
        unsafe {
            env::set_var("NCI_PROFILE", "1");
        }
    }
    try_init_tracing_from_env();

    println!("🔍 Scanning node_modules...\n");
    // Wall-clock for discover → index all (used for `total_packages_run_ms`; tables/JSON come after).
    let run_start = Instant::now();

    // Same resolution order as the JS demo: repo → `packages/nci-core` → this crate so pnpm
    // hoists merge identically; manifest-dir paths stay correct when CWD is the repo root.
    let scan_paths = [
        repo_root.join("node_modules"),
        engine_dir.join("..").join("nci-core").join("node_modules"),
        engine_dir.join("node_modules"),
    ];

    let mut discovered_packages = Vec::new();
    for node_modules_root in scan_paths {
        if node_modules_root.exists()
            && let Ok(mut found) = scan_packages(&node_modules_root)
        {
            discovered_packages.append(&mut found);
        }
    }

    discovered_packages = dedupe_packages_by_canonical_dir(discovered_packages);

    if !target_packages_args.is_empty() {
        discovered_packages
            .retain(|package_info| target_packages_args.contains(&package_info.name.to_string()));
    }

    if discovered_packages.is_empty() {
        if !target_packages_args.is_empty() {
            eprintln!(
                "❌ No packages found matching: {}",
                target_packages_args.join(", ")
            );
        } else {
            println!("   No packages discovered.");
        }
        return Ok(());
    }

    println!("📦 Found {} packages\n", discovered_packages.len());

    let scan_dedupe_duration = run_start.elapsed();

    let index_options = Some(IndexOptions {
        max_hops: 10,
        parallel: !use_sequential,
        project_root: Some(repo_root.clone()),
        enable_package_cache: !no_package_cache,
        parallel_resolve_deps: !no_parallel_resolve_deps,
        hydrate_cache_hits: false,
        retain_graph_after_save: false,
        ..Default::default()
    });

    let index_start = Instant::now();
    let mut indexed_results = index_packages(&discovered_packages, index_options);
    let index_duration = index_start.elapsed();
    let index_wall_ms = index_duration.as_secs_f64() * 1000.0;
    // One number for “how long did it take to run all packages”: scan + index (crawl, graph, SQLite…
    // all happen inside `index_packages`). Does not include demo tables or JSON below.
    let total_packages_run_ms = run_start.elapsed().as_secs_f64() * 1000.0;

    let mode_label = if use_sequential {
        "sequential"
    } else {
        "parallel"
    };

    let cached_count = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Cached)
        .count();
    let crawled_count = indexed_results.len() - cached_count;

    println!(
        "   Built {} graphs — {} ({}) | {} cached, {} crawled\n",
        indexed_results.len(),
        format_duration_ms(index_wall_ms),
        mode_label,
        cached_count,
        crawled_count,
    );

    indexed_results.sort_by(|result_a, result_b| {
        indexed_summary(result_a)
            .package
            .cmp(indexed_summary(result_b).package)
    });
    for result in &indexed_results {
        let source_tag = match result.source {
            GraphSource::Cached => "cached",
            GraphSource::Crawled => "crawled",
        };
        let row = indexed_summary(result);
        let (crawl_ms, build_ms) = summary_timings_shown(result);
        println!(
            "   {} — {} symbols, {} files | crawl {} build {} [{}]",
            row.package,
            row.total_symbols,
            row.total_files,
            format_duration_ms(crawl_ms),
            format_duration_ms(build_ms),
            source_tag
        );
    }

    let crawled_crawl_sum_ms: f64 = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| indexed_summary(result).crawl_duration_ms)
        .sum();
    let crawled_build_sum_ms: f64 = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| indexed_summary(result).build_duration_ms)
        .sum();
    let crawled_crawl_max_ms = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| indexed_summary(result).crawl_duration_ms)
        .fold(0.0f64, f64::max);
    let crawled_build_max_ms = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| indexed_summary(result).build_duration_ms)
        .fold(0.0f64, f64::max);
    let crawled_crawl_sum_display = if crawled_count == 0 {
        0.0
    } else {
        crawled_crawl_sum_ms
    };
    let crawled_build_sum_display = if crawled_count == 0 {
        0.0
    } else {
        crawled_build_sum_ms
    };
    let crawled_crawl_max_display = if crawled_count == 0 {
        0.0
    } else {
        crawled_crawl_max_ms
    };
    let crawled_build_max_display = if crawled_count == 0 {
        0.0
    } else {
        crawled_build_max_ms
    };
    indexed_results.sort_by(|result_a, result_b| {
        indexed_summary(result_b)
            .total_symbols
            .cmp(&indexed_summary(result_a).total_symbols)
    });

    println!("\n{}", "═".repeat(86));
    println!("📊 SUMMARY\n");
    println!("   Index mode:      {}", mode_label);
    println!(
        "   Package cache:   {}",
        if no_package_cache {
            "off (no sqlite)"
        } else {
            "on (sqlite read/write when enabled)"
        }
    );
    println!(
        "   Resolve deps:    {}",
        if no_parallel_resolve_deps {
            "sequential"
        } else {
            "parallel"
        }
    );
    println!(
        "   Total packages:  {} ({} cached, {} crawled)",
        indexed_results.len(),
        cached_count,
        crawled_count
    );
    println!(
        "   Total symbols:   {}",
        indexed_results
            .iter()
            .map(|result| indexed_summary(result).total_symbols)
            .sum::<usize>()
    );
    println!(
        "   Total files:     {}",
        indexed_results
            .iter()
            .map(|result| indexed_summary(result).total_files)
            .sum::<usize>()
    );

    println!(
        "\n   {:<36} {:>8} {:>9} {:>7} {:>12} {:>12}",
        "Package",
        "Source",
        "Symbols",
        "Files",
        "Crawl",
        "Build"
    );
    println!("   {}", "─".repeat(98));

    for result in &indexed_results {
        let source_tag = match result.source {
            GraphSource::Cached => "cached",
            GraphSource::Crawled => "crawled",
        };
        let row = indexed_summary(result);
        let (crawl_ms, build_ms) = summary_timings_shown(result);
        println!(
            "   {: <36} {: >8} {: >9} {: >7} {: >12} {: >12}",
            row.package,
            source_tag,
            row.total_symbols,
            row.total_files,
            format_duration_ms(crawl_ms),
            format_duration_ms(build_ms)
        );
    }
    let crawl_build_footnote = if no_package_cache {
        "   Crawl / Build: this run only (crawled packages). Cache off."
    } else {
        "   Crawl / Build: this run only; cache hits show 0 (no crawl/graph build)."
    };
    println!("{crawl_build_footnote}");

    let export_wall_ms = if skip_write {
        println!(
            "\n💾 Skipped JSON export (--skip-write). Index covered {} symbols.",
            indexed_results
                .iter()
                .map(|result| indexed_summary(result).total_symbols)
                .sum::<usize>()
        );
        0.0
    } else {
        let export_start = Instant::now();
        let graphs_for_json: Vec<&nci_engine::types::PackageGraph> = indexed_results
            .iter()
            .filter_map(|result| result.graph.as_ref())
            .collect();
        let report_data = serde_json::json!({
            "generatedAt": "now",
            "indexMode": mode_label,
            "parallelResolveDeps": !no_parallel_resolve_deps,
            "timingsMs": {
                "scanDedupe": (scan_dedupe_duration.as_secs_f64() * 1000.0).round() as u64,
                "indexPackagesWall": (index_wall_ms).round() as u64,
                "crawledCrawlSumMs": (crawled_crawl_sum_display).round() as u64,
                "crawledBuildSumMs": (crawled_build_sum_display).round() as u64,
                "crawledCrawlMaxMs": (crawled_crawl_max_display).round() as u64,
                "crawledBuildMaxMs": (crawled_build_max_display).round() as u64,
            },
            "totalPackages": indexed_results.len(),
            "cachedCount": cached_count,
            "crawledCount": crawled_count,
            "totalSymbols": indexed_results.iter().map(|result| indexed_summary(result).total_symbols).sum::<usize>(),
            "totalFiles": indexed_results.iter().map(|result| indexed_summary(result).total_files).sum::<usize>(),
            "packages": graphs_for_json,
        });

        let json_output = if pretty_json {
            serde_json::to_string_pretty(&report_data)?
        } else {
            serde_json::to_string(&report_data)?
        };
        fs::write(&output_path, json_output)?;
        println!("\n💾 Report saved to: {}", output_path);
        export_start.elapsed().as_secs_f64() * 1000.0
    };

    let scan_wall_ms = scan_dedupe_duration.as_secs_f64() * 1000.0;

    println!("\n{}", "═".repeat(86));
    println!("⏱️  TIMING\n");
    let timing_w = 14usize;
    println!(
        "   {:<52} {:>width$}",
        "Phase / metric",
        "Time",
        width = timing_w
    );
    println!("   {}", "─".repeat(52 + timing_w));
    println!(
        "   {:<52} {:>width$}",
        "Scan + dedupe (find packages)",
        format_duration_ms(scan_wall_ms),
        width = timing_w
    );
    let index_wall_label = if no_package_cache {
        "Index all packages (parallel): crawl + graph build"
    } else {
        "Index all packages (parallel): crawl + graph + SQLite"
    };
    println!(
        "   {:<52} {:>width$}",
        index_wall_label,
        format_duration_ms(index_wall_ms),
        width = timing_w
    );
    println!(
        "   {:<52} {:>width$}",
        "Slowest single package — crawl (crawled this run)",
        format_duration_ms(crawled_crawl_max_display),
        width = timing_w
    );
    println!(
        "   {:<52} {:>width$}",
        "Slowest single package — build (crawled this run)",
        format_duration_ms(crawled_build_max_display),
        width = timing_w
    );
    println!(
        "   {:<52} {:>width$}",
        "JSON serialize + write (0 if --skip-write)",
        format_duration_ms(export_wall_ms),
        width = timing_w
    );
    println!("   {}", "─".repeat(52 + timing_w));
    let n_packages = indexed_results.len();
    println!(
        "   {:<52} {:>width$}",
        format!("Total ({n_packages} pkgs: scan + index all)"),
        format_duration_ms(total_packages_run_ms),
        width = timing_w
    );
    println!(
        "   Crawl/build column is for crawled packages only (0 if cached); parallel work means do not add rows for wall-clock total."
    );

    Ok(())
}
