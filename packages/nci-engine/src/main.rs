use std::fs;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use nci_engine::cache::nci_sqlite_path;
use nci_engine::pipeline::{self, GraphSource, IndexOptions};
use nci_engine::scanner::ScanError;
use nci_engine::storage::NciDatabase;

#[derive(Parser)]
#[command(
    name = "nci",
    version,
    about = "Native Context Index — index and query TypeScript declaration graphs"
)]
struct Cli {
    #[arg(
        long,
        global = true,
        value_name = "PATH",
        help = "Path to nci.sqlite (default: per-user cache path)"
    )]
    database: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Create or open the SQLite index and run migrations")]
    Init,
    #[command(about = "Scan node_modules under the project root and update the index")]
    Index(IndexArgs),
    #[command(about = "Same as index")]
    Refresh(IndexArgs),
    Query {
        #[command(subcommand)]
        command: QueryCommands,
    },
}

#[derive(Parser, Clone)]
struct IndexArgs {
    #[arg(
        short = 'r',
        long,
        default_value = ".",
        help = "Project root directory (must contain node_modules)"
    )]
    project_root: PathBuf,

    #[arg(
        long,
        default_value_t = false,
        help = "On SQLite cache hit, load the full in-memory graph (more RAM; default is metadata only)"
    )]
    hydrate_cache_hits: bool,
}

#[derive(Subcommand)]
enum QueryCommands {
    #[command(about = "Search symbols using SQLite FTS5 MATCH syntax")]
    Find {
        #[arg(short = 'n', long, default_value_t = 20)]
        limit: usize,
        #[arg(required = true)]
        fts_query: String,
    },
    #[command(about = "List package name and version rows stored in the index")]
    Packages,
    #[command(about = "List symbol names for an indexed package")]
    Symbols { name: String, version: String },
}

fn resolve_database_path(explicit: Option<PathBuf>) -> Result<PathBuf, String> {
    explicit.or_else(nci_sqlite_path).ok_or_else(|| {
        "could not resolve database path; pass --database or set a writable cache directory"
            .to_string()
    })
}

fn open_database(explicit: Option<PathBuf>) -> Result<(PathBuf, NciDatabase), String> {
    let path = resolve_database_path(explicit)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let database = NciDatabase::open(&path).map_err(|err| err.to_string())?;
    Ok((path, database))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Init => {
            let (path, database) = open_database(cli.database)?;
            let schema = database.stored_schema_version()?;
            println!("{}", path.display());
            println!("sqlite schema version {schema}");
            Ok(())
        }
        Commands::Index(args) | Commands::Refresh(args) => {
            run_index(args, cli.database)?;
            Ok(())
        }
        Commands::Query { command } => {
            let (_, database) = open_database(cli.database)?;
            match command {
                QueryCommands::Find { limit, fts_query } => {
                    for symbol in database.find_symbols_fts(&fts_query, limit)? {
                        println!(
                            "{} [{}] {}",
                            symbol.name, symbol.kind_name, symbol.file_path
                        );
                    }
                }
                QueryCommands::Packages => {
                    for (package_name, package_version) in database.list_indexed_packages()? {
                        println!("{package_name}\t{package_version}");
                    }
                }
                QueryCommands::Symbols { name, version } => {
                    let symbols = database.list_package_symbols(&name, &version)?;
                    println!("{} symbols", symbols.len());
                    for symbol in symbols {
                        println!("{}", symbol.name);
                    }
                }
            }
            Ok(())
        }
    }
}

fn run_index(args: IndexArgs, database: Option<PathBuf>) -> Result<(), String> {
    let project_root = fs::canonicalize(&args.project_root)
        .map_err(|err| format!("project root {}: {err}", args.project_root.display()))?;
    let node_modules = project_root.join("node_modules");
    if !node_modules.is_dir() {
        return Err(format!(
            "node_modules directory missing: {}",
            node_modules.display()
        ));
    }

    let index_options = IndexOptions {
        db_path: database.clone(),
        project_root: Some(project_root.clone()),
        hydrate_cache_hits: args.hydrate_cache_hits,
        ..Default::default()
    };

    let indexed =
        pipeline::index_all(&node_modules, Some(index_options)).map_err(scan_error_str)?;
    let cached_total = indexed
        .iter()
        .filter(|entry| entry.source == GraphSource::Cached)
        .count();
    let crawled_total = indexed.len() - cached_total;
    println!(
        "{} packages indexed (cached: {}, crawled: {})",
        indexed.len(),
        cached_total,
        crawled_total
    );
    Ok(())
}

fn scan_error_str(error: ScanError) -> String {
    error.to_string()
}
