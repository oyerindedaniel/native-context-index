use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use nci_engine::crawler::CrawlOptions;
use nci_engine::graph::build_package_graph;
use nci_engine::scanner::scan_packages;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let mut target_packages_args: Vec<String> = Vec::new();
    let mut output_path = String::from("nci-report-rust.json");

    let mut current_index = 1;
    while current_index < args.len() {
        if args[current_index] == "--package" && current_index + 1 < args.len() {
            target_packages_args.push(args[current_index + 1].clone());
            current_index += 1;
        } else if args[current_index] == "--output" && current_index + 1 < args.len() {
            output_path = args[current_index + 1].clone();
            current_index += 1;
        }
        current_index += 1;
    }

    println!("🔍 Scanning node_modules...\n");
    let start_time = Instant::now();

    let scan_paths = [
        PathBuf::from("../../node_modules"),
        PathBuf::from("../nci-core/node_modules"),
        PathBuf::from("node_modules"),
    ];

    let mut discovered_packages = Vec::new();
    for path in scan_paths {
        if path.exists() {
            if let Ok(mut pkgs) = scan_packages(&path) {
                discovered_packages.append(&mut pkgs);
            }
        }
    }

    if !target_packages_args.is_empty() {
        discovered_packages.retain(|package_info| target_packages_args.contains(&package_info.name.to_string()));
    }

    if discovered_packages.is_empty() {
        if !target_packages_args.is_empty() {
            eprintln!("❌ No packages found matching: {}", target_packages_args.join(", "));
        } else {
            println!("   No packages discovered.");
        }
        return Ok(());
    }

    println!("📦 Found {} packages\n", discovered_packages.len());

    let crawl_options = Some(CrawlOptions {
        max_depth: 10,
    });

    let mut graphs = Vec::new();
    for package_info in discovered_packages {
        print!("   {}...", package_info.name);
        use std::io::Write;
        std::io::stdout().flush()?;
        
        let graph = build_package_graph(&package_info, crawl_options.clone());
        println!(" {} symbols, {} files ({:.1}ms)", graph.total_symbols, graph.total_files, graph.crawl_duration_ms);
        graphs.push(graph);
    }

    let total_time_elapsed = start_time.elapsed();

    graphs.sort_by(|graph_a, graph_b| graph_b.total_symbols.cmp(&graph_a.total_symbols));

    println!("\n{}", "═".repeat(78));
    println!("📊 SUMMARY\n");
    println!("   Total packages:  {}", graphs.len());
    println!("   Total symbols:   {}", graphs.iter().map(|graph| graph.total_symbols).sum::<usize>());
    println!("   Total files:     {}", graphs.iter().map(|graph| graph.total_files).sum::<usize>());
    println!("   Total time:      {}ms\n", total_time_elapsed.as_millis());

    println!("   {:<40} {:>8} {:>9} {:>7} {:>10}", "Package", "Entries", "Symbols", "Files", "Time");
    println!("   {}", "─".repeat(78));

    for graph in &graphs {
        println!(
            "   {: <40} {: >8} {: >9} {: >7} {: >10.1}ms",
            graph.package,
            1,
            graph.total_symbols,
            graph.total_files,
            graph.crawl_duration_ms
        );
    }

    let report_data = serde_json::json!({
        "generatedAt": "now",
        "totalPackages": graphs.len(),
        "totalSymbols": graphs.iter().map(|graph| graph.total_symbols).sum::<usize>(),
        "totalFiles": graphs.iter().map(|graph| graph.total_files).sum::<usize>(),
        "totalTimeMs": total_time_elapsed.as_millis(),
        "packages": graphs,
    });

    fs::write(&output_path, serde_json::to_string_pretty(&report_data)?)?;
    println!("\n💾 Report saved to: {}", output_path);

    Ok(())
}
