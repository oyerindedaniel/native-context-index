//! Full-workspace demo: merges repo / `nci-core` / `nci-engine` `node_modules`, dedupes by
//! canonical package directory, then indexes with [`nci_engine::pipeline::index_packages`]
//! (concurrent per package unless `--sequential`).
//!
//! Flags: `--package NAME` (repeatable), `--output PATH`, `--sequential` (serialize package indexing),
//! `--skip-write` (skip huge JSON export — for timing index work only), `--profile` (`NCI_PROFILE=1`),
//! `--no-package-cache` (no SQLite read/write; crawl only, then optional JSON — for dev profiling).
//!
//! Env: `NCI_INDEX_NO_CACHE=1` is the same as `--no-package-cache` (handy when you cannot pass flags).
//!
//! # Diagnostics
//!
//! - `NCI_LOG=1` enables stderr logging for `nci_engine` at `debug` (cache and sqlite).
//! - Or set `RUST_LOG` (see `tracing-subscriber` env filter), e.g. `RUST_LOG=nci_engine=trace`.
//! - Phase profiling: `NCI_PROFILE=1` or `--profile` on this
//!   example prints crawl/graph substeps to stderr (`  [profile] label …ms`).
//! - By default this example uses the per-package SQLite cache (`IndexOptions::enable_package_cache`).
//!   Use `--no-package-cache` or `NCI_INDEX_NO_CACHE=1` to force a fresh crawl and skip the DB.
//! - One-shot support bundle: `cargo run -p nci-engine --example diagnose`.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Instant;

use nci_engine::pipeline::{
    GraphSource, IndexOptions, dedupe_packages_by_canonical_dir, index_packages,
};
use nci_engine::scanner::scan_packages;

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
    let args: Vec<String> = env::args().collect();
    let mut target_packages_args: Vec<String> = Vec::new();
    let mut output_path = String::from("nci-report-rust.json");
    let mut use_sequential = false;
    let mut skip_write = false;
    let mut pretty_json = false;
    let mut profile_phases = false;
    let mut no_package_cache = false;

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

    if profile_phases {
        // SAFETY: set once on the main thread before `index_packages` spawns work that reads `NCI_PROFILE`.
        unsafe {
            env::set_var("NCI_PROFILE", "1");
        }
    }
    try_init_tracing_from_env();

    println!("🔍 Scanning node_modules...\n");
    let wall_start = Instant::now();

    // Same resolution order as the JS demo: repo → `packages/nci-core` → this crate so pnpm
    // hoists merge identically; manifest-dir paths stay correct when CWD is the repo root.
    let engine_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let scan_paths = [
        engine_dir.join("../..").join("node_modules"),
        engine_dir.join("..").join("nci-core").join("node_modules"),
        engine_dir.join("node_modules"),
    ];

    let mut discovered_packages = Vec::new();
    for node_modules_root in scan_paths {
        if node_modules_root.exists() {
            if let Ok(mut found) = scan_packages(&node_modules_root) {
                discovered_packages.append(&mut found);
            }
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

    let scan_dedupe_duration = wall_start.elapsed();

    let project_root = engine_dir.join("../..");
    let index_options = Some(IndexOptions {
        max_hops: 10,
        parallel: !use_sequential,
        project_root: Some(project_root),
        enable_package_cache: !no_package_cache,
        ..Default::default()
    });

    let index_start = Instant::now();
    let mut indexed_results = index_packages(&discovered_packages, index_options);
    let index_duration = index_start.elapsed();
    let index_wall_ms = index_duration.as_secs_f64() * 1000.0;

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
        "   Built {} graphs — {:.1}ms ({}) | {} cached, {} crawled\n",
        indexed_results.len(),
        index_wall_ms,
        mode_label,
        cached_count,
        crawled_count,
    );

    indexed_results
        .sort_by(|result_a, result_b| result_a.graph.package.cmp(&result_b.graph.package));
    for result in &indexed_results {
        let source_tag = match result.source {
            GraphSource::Cached => "cached",
            GraphSource::Crawled => "crawled",
        };
        println!(
            "   {} — {} symbols, {} files | crawl {:.1}ms build {:.1}ms [{}]",
            result.graph.package,
            result.graph.total_symbols,
            result.graph.total_files,
            result.graph.crawl_duration_ms,
            result.graph.build_duration_ms,
            source_tag
        );
    }

    let crawled_crawl_sum_ms: f64 = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| result.graph.crawl_duration_ms)
        .sum();
    let crawled_build_sum_ms: f64 = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| result.graph.build_duration_ms)
        .sum();
    let crawled_crawl_max_ms = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| result.graph.crawl_duration_ms)
        .fold(0.0f64, f64::max);
    let crawled_build_max_ms = indexed_results
        .iter()
        .filter(|result| result.source == GraphSource::Crawled)
        .map(|result| result.graph.build_duration_ms)
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
        result_b
            .graph
            .total_symbols
            .cmp(&result_a.graph.total_symbols)
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
        "   Total packages:  {} ({} cached, {} crawled)",
        indexed_results.len(),
        cached_count,
        crawled_count
    );
    println!(
        "   Total symbols:   {}",
        indexed_results
            .iter()
            .map(|result| result.graph.total_symbols)
            .sum::<usize>()
    );
    println!(
        "   Total files:     {}",
        indexed_results
            .iter()
            .map(|result| result.graph.total_files)
            .sum::<usize>()
    );

    println!(
        "\n   {:<36} {:>8} {:>9} {:>7} {:>10} {:>10}",
        "Package", "Source", "Symbols", "Files", "Crawl ms", "Build ms"
    );
    println!("   {}", "─".repeat(96));

    for result in &indexed_results {
        let source_tag = match result.source {
            GraphSource::Cached => "cached",
            GraphSource::Crawled => "crawled",
        };
        println!(
            "   {: <36} {: >8} {: >9} {: >7} {: >9.1} {: >9.1}",
            result.graph.package,
            source_tag,
            result.graph.total_symbols,
            result.graph.total_files,
            result.graph.crawl_duration_ms,
            result.graph.build_duration_ms
        );
    }
    println!(
        "   Crawl ms: time inside the crawler (parse + file walk + export resolution). Build ms: entry resolution, merge, dep IDs, inheritance flatten. Values come from the graph (SQLite when cached)."
    );

    let export_wall_ms = if skip_write {
        println!(
            "\n💾 Skipped JSON export (--skip-write). Index covered {} symbols.",
            indexed_results
                .iter()
                .map(|result| result.graph.total_symbols)
                .sum::<usize>()
        );
        0.0
    } else {
        let export_start = Instant::now();
        let graphs_for_json: Vec<&nci_engine::types::PackageGraph> =
            indexed_results.iter().map(|result| &result.graph).collect();
        let report_data = serde_json::json!({
            "generatedAt": "now",
            "indexMode": mode_label,
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
            "totalSymbols": indexed_results.iter().map(|result| result.graph.total_symbols).sum::<usize>(),
            "totalFiles": indexed_results.iter().map(|result| result.graph.total_files).sum::<usize>(),
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
    let total_wall_ms = wall_start.elapsed().as_secs_f64() * 1000.0;

    println!("\n{}", "═".repeat(86));
    println!("⏱️  TIMING (wall clock)\n");
    println!("   {:<52} {:>12}", "Phase / metric", "ms");
    println!("   {}", "─".repeat(66));
    println!(
        "   {:<52} {:>12.1}",
        "Scan node_modules + dedupe (+ filter)", scan_wall_ms
    );
    println!(
        "   {:<52} {:>12.1}",
        "index_packages (wall: parallel index + SQLite)", index_wall_ms
    );
    println!(
        "   {:<52} {:>12.1}",
        "Σ crawl ms (crawled pkgs only, CPU crawler)", crawled_crawl_sum_display
    );
    println!(
        "   {:<52} {:>12.1}",
        "Σ build ms (crawled pkgs only, graph assembly)", crawled_build_sum_display
    );
    println!(
        "   {:<52} {:>12.1}",
        "Max crawl ms (single crawled package)", crawled_crawl_max_display
    );
    println!(
        "   {:<52} {:>12.1}",
        "Max build ms (single crawled package)", crawled_build_max_display
    );
    println!(
        "   {:<52} {:>12.1}",
        "JSON serialize + write (0 if --skip-write)", export_wall_ms
    );
    println!("   {}", "─".repeat(66));
    println!("   {:<52} {:>12.1}", "Total demo wall", total_wall_ms);

    Ok(())
}
