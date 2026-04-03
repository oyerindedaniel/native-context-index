//! Full-workspace demo: merges repo / `nci-core` / `nci-engine` `node_modules`, dedupes by
//! canonical package directory, then indexes with [`nci_engine::pipeline::index_packages`]
//! (parallel Rayon by default).
//!
//! Flags: `--package NAME` (repeatable), `--output PATH`, `--sequential` (disable parallelism),
//! `--skip-write` (skip huge JSON export — for timing index work only).

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use nci_engine::pipeline::{dedupe_packages_by_canonical_dir, index_packages, IndexOptions};
use nci_engine::scanner::scan_packages;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let mut target_packages_args: Vec<String> = Vec::new();
    let mut output_path = String::from("nci-report-rust.json");
    let mut use_sequential = false;
    let mut skip_write = false;

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
            _ => {}
        }
        current_index += 1;
    }

    println!("🔍 Scanning node_modules...\n");
    let wall_start = Instant::now();

    let scan_paths = [
        PathBuf::from("../../node_modules"),
        PathBuf::from("../nci-core/node_modules"),
        PathBuf::from("node_modules"),
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
        discovered_packages.retain(|package_info| {
            target_packages_args.contains(&package_info.name.to_string())
        });
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

    let index_options = Some(IndexOptions {
        max_depth: 10,
        parallel: !use_sequential,
    });

    let index_start = Instant::now();
    let mut graphs = index_packages(&discovered_packages, index_options);
    let index_duration = index_start.elapsed();

    let mode_label = if use_sequential {
        "sequential"
    } else {
        "parallel (Rayon)"
    };
    println!(
        "   Built {} graphs in {:.1}ms ({})\n",
        graphs.len(),
        index_duration.as_secs_f64() * 1000.0,
        mode_label
    );

    graphs.sort_by(|graph_a, graph_b| graph_a.package.cmp(&graph_b.package));
    for graph in &graphs {
        println!(
            "   {} — {} symbols, {} files ({:.1}ms)",
            graph.package,
            graph.total_symbols,
            graph.total_files,
            graph.crawl_duration_ms
        );
    }

    let total_time_elapsed = wall_start.elapsed();

    graphs.sort_by(|graph_a, graph_b| graph_b.total_symbols.cmp(&graph_a.total_symbols));

    println!("\n{}", "═".repeat(78));
    println!("📊 SUMMARY\n");
    println!("   Index mode:      {}", mode_label);
    println!(
        "   Index time:      {:.1}ms",
        index_duration.as_secs_f64() * 1000.0
    );
    println!("   Total wall:      {}ms", total_time_elapsed.as_millis());
    println!("   Total packages:  {}", graphs.len());
    println!(
        "   Total symbols:   {}",
        graphs.iter().map(|graph| graph.total_symbols).sum::<usize>()
    );
    println!(
        "   Total files:     {}",
        graphs.iter().map(|graph| graph.total_files).sum::<usize>()
    );

    println!(
        "\n   {:<40} {:>8} {:>9} {:>7} {:>10}",
        "Package", "Entries", "Symbols", "Files", "Time"
    );
    println!("   {}", "─".repeat(78));

    for graph in &graphs {
        println!(
            "   {: <40} {: >8} {: >9} {: >7} {: >10.1}ms",
            graph.package, 1, graph.total_symbols, graph.total_files, graph.crawl_duration_ms
        );
    }

    if skip_write {
        println!(
            "\n💾 Skipped JSON export (--skip-write). Index covered {} symbols.",
            graphs.iter().map(|graph| graph.total_symbols).sum::<usize>()
        );
    } else {
        let report_data = serde_json::json!({
            "generatedAt": "now",
            "indexMode": mode_label,
            "indexTimeMs": (index_duration.as_secs_f64() * 1000.0).round() as u64,
            "totalPackages": graphs.len(),
            "totalSymbols": graphs.iter().map(|graph| graph.total_symbols).sum::<usize>(),
            "totalFiles": graphs.iter().map(|graph| graph.total_files).sum::<usize>(),
            "totalTimeMs": total_time_elapsed.as_millis(),
            "packages": graphs,
        });

        fs::write(&output_path, serde_json::to_string_pretty(&report_data)?)?;
        println!("\n💾 Report saved to: {}", output_path);
    }

    Ok(())
}
