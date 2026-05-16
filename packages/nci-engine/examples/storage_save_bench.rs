//! Isolated `save_package` A/B: junction batching, mmap, FK-off upper bound.
//!
//! ```text
//! cargo run --release -p nci-engine --example storage_save_bench -- --scenario S0 --symbols 3000 --repeat 3 --fresh-db
//! cargo run --release -p nci-engine --example storage_save_bench -- --scenario S1 --package effect --manifest-root packages/nci-core --repeat 3 --fresh-db
//! ```

use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use clap::Parser;
use nci_engine::cache::index_engine_cache_key;
use nci_engine::filter::{DepKindFilter, FilterConfig};
use nci_engine::pipeline::{GraphSource, IndexOptions, index_packages};
use nci_engine::scanner::scan_packages;
use nci_engine::storage::{
    NciDatabase, SavePackageMode, StorageConnectionPragmas, save_benchmark_scenario,
};
use nci_engine::types::{
    PackageGraph, PackageInfo, SharedString, SharedVec, SymbolKind, SymbolNode, SymbolSpace,
};

#[derive(Debug, Parser)]
#[command(name = "storage_save_bench")]
struct BenchCli {
    /// Scenario id: S0–S5 or P0 (page_size 8192 on new DB).
    #[arg(long, default_value = "S0")]
    scenario: String,
    /// Synthetic symbol count (mutually exclusive with `--package`).
    #[arg(long)]
    symbols: Option<usize>,
    /// Real package name from manifest-scoped scan (crawl once, time save only).
    #[arg(long)]
    package: Option<String>,
    #[arg(long, default_value = "packages/nci-core")]
    manifest_root: PathBuf,
    #[arg(long, default_value_t = 3)]
    repeat: usize,
    #[arg(long)]
    fresh_db: bool,
    #[arg(long)]
    database: Option<PathBuf>,
    /// One warmup save before measured runs (default when repeat > 1).
    #[arg(long)]
    warmup: Option<bool>,
    #[arg(long)]
    append_results: Option<PathBuf>,
}

fn fresh_database_path(label: &str) -> PathBuf {
    let mut path = env::temp_dir();
    path.push(format!(
        "nci-save-bench-{label}-{}-{}.sqlite",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis())
            .unwrap_or(0)
    ));
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    path
}

fn median_of(samples: &[f64]) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    sorted[sorted.len() / 2]
}

fn synthetic_graph(symbol_count: usize, package_name: &str) -> (PackageInfo, PackageGraph) {
    let package_info = PackageInfo {
        name: SharedString::from(package_name),
        version: SharedString::from("1.0.0"),
        dir: SharedString::from("/bench"),
        is_scoped: false,
        declared_dependencies: SharedVec::from([]),
    };
    let mut symbols = Vec::with_capacity(symbol_count);
    for index in 0..symbol_count {
        symbols.push(synthetic_symbol(
            &format!("sym-{index}"),
            &format!("name-{index}"),
            package_name,
        ));
    }
    let graph = PackageGraph {
        package: package_info.name.clone(),
        version: package_info.version.clone(),
        symbols,
        total_symbols: symbol_count,
        total_files: 1,
        crawl_duration_ms: 0.0,
        build_duration_ms: 0.0,
    };
    (package_info, graph)
}

fn synthetic_symbol(stable_id: &str, name: &str, package_name: &str) -> SymbolNode {
    SymbolNode {
        id: SharedString::from(stable_id),
        name: SharedString::from(name),
        parent_symbol_id: None,
        enclosing_module_declaration_id: None,
        enclosing_module_declaration_name: None,
        kind: SymbolKind::Function,
        kind_name: SharedString::from("FunctionDeclaration"),
        package: SharedString::from(package_name),
        file_path: SharedString::from("index.d.ts"),
        source_package_name: SharedString::from(package_name),
        source_package_version: Some(SharedString::from("1.0.0")),
        source_file_path: SharedString::from("index.d.ts"),
        additional_files: None,
        entry_visibility: None,
        merge_provenance: None,
        signature: Some(SharedString::from("declare function bench(): void")),
        js_doc: Some(SharedString::from("bench token uniquefts")),
        is_type_only: false,
        symbol_space: SymbolSpace::Value,
        dependencies: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        surface_dependencies: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        re_exported_from: None,
        heritage: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        modifiers: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        decorators: SharedVec::from(Vec::new().into_boxed_slice()),
        deprecated: None,
        visibility: None,
        since: None,
        is_internal: false,
        is_global_augmentation: false,
        is_inherited: false,
        inherited_from_sources: SharedVec::from(Vec::<SharedString>::new().into_boxed_slice()),
        dep_dedupe_keys: None,
        raw_dependencies: Vec::new(),
    }
}

fn discover_package(
    repo_root: &Path,
    engine_dir: &Path,
    manifest_root: &Path,
    package_name: &str,
) -> Result<PackageInfo, String> {
    let scan_paths = [
        repo_root.join("node_modules"),
        engine_dir.join("..").join("nci-core").join("node_modules"),
        engine_dir.join("node_modules"),
    ];
    let mut discovered = Vec::new();
    for node_modules_root in scan_paths {
        if node_modules_root.is_dir()
            && let Ok(mut found) = scan_packages(&node_modules_root)
        {
            discovered.append(&mut found);
        }
    }
    let scope_filter = FilterConfig {
        dep_kind_filter: DepKindFilter::DependenciesAndDevDependencies,
        project_root: Some(manifest_root.to_path_buf()),
        ..Default::default()
    }
    .with_nciignore_file(repo_root);
    discovered = scope_filter.apply(discovered);
    discovered
        .into_iter()
        .find(|package_info| package_info.name.as_ref() == package_name)
        .ok_or_else(|| format!("package {package_name:?} not found under manifest scope"))
}

fn crawl_graph(repo_root: &Path, package_info: &PackageInfo) -> Result<PackageGraph, String> {
    let index_options = IndexOptions {
        enable_package_cache: false,
        parallel: false,
        project_root: Some(repo_root.to_path_buf()),
        ..Default::default()
    };
    let indexed = index_packages(std::slice::from_ref(package_info), Some(index_options));
    let result = indexed
        .into_iter()
        .next()
        .ok_or_else(|| "index_packages returned no results".to_string())?;
    if result.source == GraphSource::Cached {
        return Err("expected crawl, got cache hit".to_string());
    }
    result
        .graph
        .ok_or_else(|| "graph missing after crawl (cache off)".to_string())
}

fn time_save(
    database_path: &Path,
    pragmas: StorageConnectionPragmas,
    package_info: &PackageInfo,
    graph: &PackageGraph,
    save_mode: SavePackageMode,
) -> Result<f64, Box<dyn std::error::Error>> {
    let mut database = NciDatabase::open_with_pragmas(database_path, pragmas)?;
    let engine_cache_key = index_engine_cache_key(&[]);
    let started = Instant::now();
    database.save_package_with_mode(package_info, graph, engine_cache_key.as_str(), save_mode)?;
    Ok(started.elapsed().as_secs_f64() * 1000.0)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = BenchCli::parse();
    let (pragmas, save_mode) = save_benchmark_scenario(&cli.scenario)?;

    let engine_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = engine_dir.join("../..");
    let manifest_root = if cli.manifest_root.is_absolute() {
        cli.manifest_root.clone()
    } else {
        repo_root.join(&cli.manifest_root)
    };

    let (package_info, graph, workload_label): (PackageInfo, PackageGraph, String) =
        match (&cli.symbols, &cli.package) {
            (Some(symbol_count), None) => {
                let label = format!("synthetic-{symbol_count}");
                let (package_info, graph) = synthetic_graph(*symbol_count, "bench-synthetic");
                (package_info, graph, label)
            }
            (None, Some(package_name)) => {
                let package_info =
                    discover_package(&repo_root, &engine_dir, &manifest_root, package_name)?;
                eprintln!(
                    "crawling {} (symbols unknown until graph built)…",
                    package_name
                );
                let graph = crawl_graph(&repo_root, &package_info)?;
                let label = format!("{package_name}-{}-sym", graph.symbols.len());
                (package_info, graph, label)
            }
            (Some(_), Some(_)) => {
                return Err("--symbols and --package are mutually exclusive".into());
            }
            (None, None) => {
                return Err("pass --symbols N or --package NAME".into());
            }
        };

    let use_warmup = cli.warmup.unwrap_or(cli.repeat > 1);
    let base_db_path = cli
        .database
        .clone()
        .unwrap_or_else(|| env::temp_dir().join("nci-save-bench.sqlite"));

    eprintln!(
        "storage_save_bench: scenario={} workload={} symbols={} repeat={} fresh_db={}",
        cli.scenario,
        workload_label,
        graph.symbols.len(),
        cli.repeat,
        cli.fresh_db,
    );

    if use_warmup {
        let warmup_path = if cli.fresh_db {
            fresh_database_path("warmup")
        } else {
            base_db_path.clone()
        };
        let warmup_ms = time_save(&warmup_path, pragmas, &package_info, &graph, save_mode)?;
        eprintln!("warmup save: {warmup_ms:.1} ms ({})", warmup_path.display());
        if cli.fresh_db {
            let _ = fs::remove_file(&warmup_path);
        }
    }

    let mut samples_ms = Vec::with_capacity(cli.repeat);
    for run_index in 1..=cli.repeat {
        let database_path = if cli.fresh_db {
            fresh_database_path(&format!("run{run_index}"))
        } else {
            base_db_path.clone()
        };
        let elapsed_ms = time_save(&database_path, pragmas, &package_info, &graph, save_mode)?;
        eprintln!(
            "run {run_index}/{}: save_package {:.1} ms ({})",
            cli.repeat,
            elapsed_ms,
            database_path.display()
        );
        samples_ms.push(elapsed_ms);
        if cli.fresh_db {
            let _ = fs::remove_file(&database_path);
        }
    }

    let median_ms = median_of(&samples_ms);
    eprintln!(
        "median save_package: {median_ms:.1} ms (scenario={}, workload={})",
        cli.scenario, workload_label
    );

    if let Some(results_path) = cli.append_results {
        let row = format!(
            "| {} | {} | {} | {} | {:.1} | {:?} |\n",
            chrono_like_timestamp(),
            cli.scenario,
            workload_label,
            graph.symbols.len(),
            median_ms,
            save_mode,
        );
        if let Some(parent) = results_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let needs_header = !results_path.exists();
        if needs_header {
            fs::write(
                &results_path,
                "# SQLite save_package A/B\n\n| timestamp | scenario | workload | symbols | median_ms | save_mode |\n| --- | --- | --- | ---: | ---: | --- |\n",
            )?;
        }
        let mut results_file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&results_path)?;
        results_file.write_all(row.as_bytes())?;
        eprintln!("appended row to {}", results_path.display());
    }

    Ok(())
}

fn chrono_like_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| format!("{}", elapsed.as_secs()))
        .unwrap_or_else(|_| "0".to_string())
}
