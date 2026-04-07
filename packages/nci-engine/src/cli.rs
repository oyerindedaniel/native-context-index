//! `nci` binary — command tree, config merge, and output formatting.

use std::fs;
use std::io::{self, IsTerminal};
use std::path::{Path, PathBuf};

use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use clap_complete::{generate, Shell};
use dialoguer::{theme::ColorfulTheme, Input};
use serde::Serialize;

use nci_engine::cache::nci_sqlite_path;
use nci_engine::config::{self, NciConfigFile};
use nci_engine::constants::DEFAULT_MAX_HOPS;
use nci_engine::filter::FilterConfig;
use nci_engine::pipeline::{self, GraphSource, IndexOptions};
use nci_engine::scanner::{self, find_package_in_node_modules, ScanError};
use nci_engine::storage::{DatabaseStatusReport, NciDatabase};

#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    #[default]
    Plain,
    Json,
}

impl OutputFormat {
    fn parse_config(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "plain" => Some(Self::Plain),
            "json" => Some(Self::Json),
            _ => None,
        }
    }
}

#[derive(Parser)]
#[command(
    name = "nci",
    version,
    about = "Native Context Index — index and query TypeScript declaration graphs"
)]
pub struct Cli {
    #[arg(
        long,
        global = true,
        value_name = "PATH",
        help = "Path to nci.sqlite (overrides .nci.toml)"
    )]
    database: Option<PathBuf>,

    #[arg(
        long,
        global = true,
        value_enum,
        help = "Output format for supported commands (overrides .nci.toml)"
    )]
    format: Option<OutputFormat>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(
        about = "Interactive setup (or -y): create .nci.toml and open the database"
    )]
    Init {
        #[arg(short = 'y', long, help = "Accept all defaults (non-interactive)")]
        defaults: bool,
    },
    #[command(subcommand)]
    Db(DbCommands),
    #[command(about = "Scan node_modules and update the index")]
    Index {
        #[command(subcommand)]
        target: Option<IndexTarget>,
        #[command(flatten)]
        args: BulkIndexArgs,
    },
    Query {
        #[command(subcommand)]
        command: QueryCommands,
    },
    #[command(about = "Print shell completions")]
    Completions {
        #[arg(value_enum)]
        shell: Shell,
    },
}

#[derive(Subcommand)]
enum DbCommands {
    #[command(about = "Open the database and run migrations (non-interactive)")]
    Init,
    #[command(about = "Database path, size, journal mode, integrity check")]
    Status,
    #[command(about = "Delete all indexed package rows")]
    Clear,
    #[command(about = "Remove one package from the index")]
    Remove { name: String, version: String },
    #[command(about = "Delete the SQLite file on disk (requires --force)")]
    Destroy {
        #[arg(long, help = "Confirm destructive deletion of the database file")]
        force: bool,
    },
    #[command(about = "Run VACUUM")]
    Vacuum,
    #[command(about = "PRAGMA wal_checkpoint(TRUNCATE)")]
    WalCheckpoint,
}

#[derive(Subcommand)]
enum IndexTarget {
    #[command(about = "Index one package from node_modules (exact name and version)")]
    Package {
        name: String,
        version: String,
    },
}

#[derive(Parser, Clone)]
struct BulkIndexArgs {
    #[arg(
        short = 'r',
        long,
        value_name = "DIR",
        help = "Project root; default from .nci.toml or `.`"
    )]
    project_root: Option<PathBuf>,

    #[arg(long)]
    max_hops: Option<usize>,

    #[arg(long, help = "Parallel package indexing (default true)")]
    parallel: Option<bool>,

    #[arg(long)]
    parallel_resolve_deps: Option<bool>,

    #[arg(long = "package", value_name = "GLOB")]
    package_globs: Vec<String>,

    #[arg(long)]
    dry_run: bool,
}

#[derive(Subcommand)]
enum QueryCommands {
    Find {
        #[arg(short = 'n', long, default_value_t = 20)]
        limit: usize,
        #[arg(required = true)]
        fts_query: String,
    },
    Packages,
    Symbols {
        name: String,
        version: String,
    },
}

pub fn run() -> Result<(), String> {
    let cli = Cli::parse();
    match &cli.command {
        Commands::Init { defaults } => run_init(*defaults, cli.database.clone()),
        Commands::Db(db) => run_db(&cli, db),
        Commands::Index { target, args } => run_index(&cli, target.as_ref(), args),
        Commands::Query { command } => run_query(&cli, command),
        Commands::Completions { shell } => {
            let mut cmd = Cli::command();
            let bin_name = cmd.get_name().to_string();
            generate(*shell, &mut cmd, bin_name, &mut io::stdout());
            Ok(())
        }
    }
}

fn load_file_for_root(project_root: &Path) -> Option<NciConfigFile> {
    config::load_config_file(project_root)
}

/// Directory containing `.nci.toml` is discovered from `-r` when set, otherwise cwd.
fn index_config_discovery_dir(bulk: &BulkIndexArgs) -> Result<PathBuf, String> {
    let base = bulk
        .project_root
        .clone()
        .unwrap_or_else(|| PathBuf::from("."));
    fs::canonicalize(&base).map_err(|err| format!("project root {}: {err}", base.display()))
}

fn index_effective_project_root(
    bulk: &BulkIndexArgs,
    file: Option<&NciConfigFile>,
    discovery_dir: &Path,
) -> Result<PathBuf, String> {
    if bulk.project_root.is_some() {
        return Ok(discovery_dir.to_path_buf());
    }
    if let Some(toml_cfg) = file {
        if let Some(root_str) = &toml_cfg.project_root {
            let path = Path::new(root_str);
            let joined = if path.is_absolute() {
                path.to_path_buf()
            } else {
                discovery_dir.join(path)
            };
            return fs::canonicalize(&joined)
                .map_err(|err| format!("config project_root {}: {err}", joined.display()));
        }
    }
    Ok(discovery_dir.to_path_buf())
}

fn effective_format(cli: &Cli, file: Option<&NciConfigFile>) -> Result<OutputFormat, String> {
    if let Some(fmt_flag) = cli.format {
        return Ok(fmt_flag);
    }
    if let Some(toml_cfg) = file {
        if let Some(format_str) = &toml_cfg.format {
            if let Some(parsed) = OutputFormat::parse_config(format_str) {
                return Ok(parsed);
            }
            return Err(format!(
                "invalid format in .nci.toml: {format_str:?} (expected plain or json)"
            ));
        }
    }
    Ok(OutputFormat::Plain)
}

fn merge_database_path(cli: &Cli, file: Option<&NciConfigFile>) -> Option<PathBuf> {
    cli.database
        .clone()
        .or_else(|| file.and_then(|toml| toml.database.clone()))
}

fn resolve_database_path(cli: &Cli, file: Option<&NciConfigFile>) -> Result<PathBuf, String> {
    merge_database_path(cli, file)
        .or_else(nci_sqlite_path)
        .ok_or_else(|| {
            "could not resolve database path; set `database` in .nci.toml, pass --database, or set a writable user cache directory / NCI_CACHE_DIR"
                .to_string()
        })
}

fn open_database_at(path: &Path) -> Result<NciDatabase, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    NciDatabase::open(path).map_err(|err| err.to_string())
}

fn open_database(cli: &Cli, file: Option<&NciConfigFile>) -> Result<(PathBuf, NciDatabase), String> {
    let path = resolve_database_path(cli, file)?;
    let db = open_database_at(&path)?;
    Ok((path, db))
}

fn print_json<T: Serialize>(value: &T) -> Result<(), String> {
    serde_json::to_string_pretty(value)
        .map_err(|err| err.to_string())
        .map(|line| println!("{line}"))
}

fn json_err(msg: &str) -> Result<(), String> {
    print_json(&serde_json::json!({ "ok": false, "error": msg }))
}

/// Plain errors return `Err(message)` for `eprintln!` in `main`. JSON errors print the envelope to stdout and return `Err("")` to suppress stderr duplication while still failing.
fn emit_error(fmt: OutputFormat, msg: &str) -> Result<(), String> {
    match fmt {
        OutputFormat::Plain => Err(msg.to_string()),
        OutputFormat::Json => {
            json_err(msg)?;
            Err(String::new())
        }
    }
}

fn print_status_plain(r: &DatabaseStatusReport) {
    println!("path: {}", r.path.display());
    if let Some(sz) = r.file_size_bytes {
        println!("file_size_bytes: {sz}");
    } else {
        println!("file_size_bytes: (unavailable)");
    }
    println!("page_size: {}", r.page_size);
    println!("page_count: {}", r.page_count);
    println!(
        "database_size_bytes_approx: {}",
        r.database_size_bytes_approx
    );
    println!("journal_mode: {}", r.journal_mode);
    println!("schema_version: {}", r.schema_version);
    println!("integrity_check: {}", r.integrity_check);
    if let Some(ref d) = r.nci_cache_dir {
        println!("NCI_CACHE_DIR: {d}");
    }
}

fn run_init(defaults: bool, database_cli: Option<PathBuf>) -> Result<(), String> {
    let cwd = std::env::current_dir().map_err(|err| err.to_string())?;
    let project_root = fs::canonicalize(&cwd).unwrap_or(cwd);

    if !defaults && !io::stdin().is_terminal() {
        return Err(
            "nci init: terminal is not interactive; use --defaults / -y for non-interactive setup"
                .into(),
        );
    }

    let mut file_cfg = NciConfigFile::default();

    if defaults {
        file_cfg.database = database_cli.or_else(nci_sqlite_path);
        file_cfg.project_root = Some(".".to_string());
        file_cfg.format = Some("plain".into());
        file_cfg.parallel = Some(true);
        file_cfg.parallel_resolve_deps = Some(true);
        file_cfg.max_hops = Some(DEFAULT_MAX_HOPS);
        if file_cfg.database.is_none() {
            return Err(
                "could not resolve default SQLite path; set NCI_CACHE_DIR or pass --database"
                    .into(),
            );
        }
    } else {
        let theme = ColorfulTheme::default();
        let default_db = database_cli
            .clone()
            .or_else(nci_sqlite_path)
            .map(|path_buf| path_buf.display().to_string())
            .unwrap_or_else(|| "(no default cache path)".into());

        let db_line: String = Input::with_theme(&theme)
            .with_prompt("SQLite database path")
            .default(default_db)
            .interact_text()
            .map_err(|err| err.to_string())?;
        file_cfg.database = Some(PathBuf::from(db_line.trim()));

        let root_line: String = Input::with_theme(&theme)
            .with_prompt("Default project root when -r is omitted (relative path)")
            .default(".".into())
            .interact_text()
            .map_err(|err| err.to_string())?;
        file_cfg.project_root = Some(root_line.trim().to_string());

        let fmt_line: String = Input::with_theme(&theme)
            .with_prompt("Default CLI output format")
            .default("plain".into())
            .interact_text()
            .map_err(|err| err.to_string())?;
        let fmt = fmt_line.trim().to_ascii_lowercase();
        if fmt != "plain" && fmt != "json" {
            return Err(format!("unknown format {fmt:?}; choose plain or json"));
        }
        file_cfg.format = Some(fmt);

        let par_line: String = Input::with_theme(&theme)
            .with_prompt("Parallel package indexing by default (true/false)")
            .default("true".into())
            .interact_text()
            .map_err(|err| err.to_string())?;
        let par = par_line.trim().eq_ignore_ascii_case("true")
            || par_line.trim() == "1"
            || par_line.trim().eq_ignore_ascii_case("yes");
        file_cfg.parallel = Some(par);
        file_cfg.parallel_resolve_deps = Some(true);
        file_cfg.max_hops = Some(DEFAULT_MAX_HOPS);
    }

    config::write_config_file(&project_root, &file_cfg)?;

    let db_path = file_cfg
        .database
        .clone()
        .ok_or_else(|| "database path missing after init".to_string())?;
    let database = open_database_at(&db_path)?;
    let schema = database.stored_schema_version().map_err(|err| err.to_string())?;
    println!("{}", db_path.display());
    println!("sqlite schema version {schema}");
    println!(
        "wrote {}",
        config::config_path_for_project_root(&project_root).display()
    );
    Ok(())
}

fn run_db(cli: &Cli, cmd: &DbCommands) -> Result<(), String> {
    let cwd = std::env::current_dir().map_err(|err| err.to_string())?;
    let file = load_file_for_root(&fs::canonicalize(".").unwrap_or_else(|_| cwd.clone()));
    let fmt = effective_format(cli, file.as_ref())?;

    match cmd {
        DbCommands::Init => {
            let (path, database) = open_database(cli, file.as_ref())?;
            let schema = database.stored_schema_version().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    println!("{}", path.display());
                    println!("sqlite schema version {schema}");
                }
                OutputFormat::Json => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": {
                            "path": path,
                            "schema_version": schema,
                        }
                    }))?;
                }
            }
            Ok(())
        }
        DbCommands::Status => {
            let path = resolve_database_path(cli, file.as_ref())?;
            let database = open_database_at(&path)?;
            let report = database.status_report(&path).map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => print_status_plain(&report),
                OutputFormat::Json => {
                    print_json(&serde_json::json!({ "ok": true, "data": report }))?;
                }
            }
            Ok(())
        }
        DbCommands::Clear => {
            let (_, db) = open_database(cli, file.as_ref())?;
            db.clear_all_packages().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => println!("cleared all packages"),
                OutputFormat::Json => print_json(&serde_json::json!({ "ok": true, "data": "cleared" }))?,
            }
            Ok(())
        }
        DbCommands::Remove { name, version } => {
            let (_, db) = open_database(cli, file.as_ref())?;
            db.delete_package(name, version)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => println!("removed {name} {version}"),
                OutputFormat::Json => print_json(&serde_json::json!({
                    "ok": true,
                    "data": { "name": name, "version": version }
                }))?,
            }
            Ok(())
        }
        DbCommands::Destroy { force } => {
            if !force {
                return emit_error(
                    fmt,
                    "nci db destroy: refusing without --force (deletes the SQLite file on disk)",
                );
            }
            let path = resolve_database_path(cli, file.as_ref())?;
            // Drop any connection by not opening; remove file
            fs::remove_file(&path).map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => println!("removed {}", path.display()),
                OutputFormat::Json => print_json(&serde_json::json!({ "ok": true, "data": { "path": path } }))?,
            }
            Ok(())
        }
        DbCommands::Vacuum => {
            let (_, db) = open_database(cli, file.as_ref())?;
            db.vacuum().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => println!("vacuum complete"),
                OutputFormat::Json => print_json(&serde_json::json!({ "ok": true, "data": "vacuum" }))?,
            }
            Ok(())
        }
        DbCommands::WalCheckpoint => {
            let (_, db) = open_database(cli, file.as_ref())?;
            db.wal_checkpoint_truncate().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => println!("wal_checkpoint(TRUNCATE) complete"),
                OutputFormat::Json => print_json(&serde_json::json!({ "ok": true, "data": "wal_checkpoint" }))?,
            }
            Ok(())
        }
    }
}

fn build_filter(file: Option<&NciConfigFile>, package_globs_cli: &[String]) -> FilterConfig {
    let mut filter = FilterConfig::default();
    let mut globs: Vec<String> = Vec::new();
    if let Some(toml_cfg) = file {
        if let Some(pkgs) = &toml_cfg.packages {
            globs.extend(pkgs.iter().cloned());
        }
    }
    globs.extend(package_globs_cli.iter().cloned());
    filter.include_globs = globs;
    filter
}

fn build_index_options(
    cli: &Cli,
    file: Option<&NciConfigFile>,
    project_root: PathBuf,
    bulk: &BulkIndexArgs,
) -> Result<IndexOptions, String> {
    let db_path = merge_database_path(cli, file);
    let max_hops = bulk
        .max_hops
        .or(file.and_then(|toml| toml.max_hops))
        .unwrap_or(DEFAULT_MAX_HOPS);
    let parallel = bulk
        .parallel
        .or(file.and_then(|toml| toml.parallel))
        .unwrap_or(true);
    let parallel_resolve_deps = bulk
        .parallel_resolve_deps
        .or(file.and_then(|toml| toml.parallel_resolve_deps))
        .unwrap_or(true);

    let filter = build_filter(file, &bulk.package_globs);

    Ok(IndexOptions {
        max_hops,
        parallel,
        enable_package_cache: true,
        db_path,
        project_root: Some(project_root),
        filter,
        parallel_resolve_deps,
        ..Default::default()
    })
}

fn run_index(cli: &Cli, target: Option<&IndexTarget>, bulk: &BulkIndexArgs) -> Result<(), String> {
    let discovery = index_config_discovery_dir(bulk)?;
    let file = load_file_for_root(&discovery);
    let project_root = index_effective_project_root(bulk, file.as_ref(), &discovery)?;
    let fmt = effective_format(cli, file.as_ref())?;

    if bulk.dry_run {
        let node_modules = project_root.join("node_modules");
        let packages =
            scanner::scan_packages(&node_modules)
                .map_err(|scan_err: ScanError| scan_err.to_string())?;
        let filter = build_filter(file.as_ref(), &bulk.package_globs).with_nciignore_file(&project_root);
        let filtered = filter.apply(packages);
        match fmt {
            OutputFormat::Plain => {
                println!("dry-run: {} package(s) would be indexed", filtered.len());
                for pkg in &filtered {
                    println!("{} {}", pkg.name, pkg.version);
                }
            }
            OutputFormat::Json => {
                let rows: Vec<_> = filtered
                    .iter()
                    .map(|pkg| {
                        serde_json::json!({
                            "name": pkg.name.as_ref(),
                            "version": pkg.version.as_ref(),
                        })
                    })
                    .collect();
                print_json(&serde_json::json!({ "ok": true, "data": { "packages": rows } }))?;
            }
        }
        return Ok(());
    }

    match target {
        Some(IndexTarget::Package { name, version }) => {
            let node_modules = project_root.join("node_modules");
            if !node_modules.is_dir() {
                return emit_error(
                    fmt,
                    &format!("node_modules missing: {}", node_modules.display()),
                );
            }
            let package = find_package_in_node_modules(&node_modules, name, version)
                .map_err(|scan_err: ScanError| scan_err.to_string())?;
            let opts = build_index_options(cli, file.as_ref(), project_root.clone(), bulk)?;
            let out = pipeline::index_packages(std::slice::from_ref(&package), Some(opts));
            print_index_summary(fmt, &out)?;
        }
        None => {
            let node_modules = project_root.join("node_modules");
            if !node_modules.is_dir() {
                return emit_error(
                    fmt,
                    &format!("node_modules missing: {}", node_modules.display()),
                );
            }
            let opts = build_index_options(cli, file.as_ref(), project_root, bulk)?;
            let indexed =
                pipeline::index_all(&node_modules, Some(opts))
                    .map_err(|scan_err: ScanError| scan_err.to_string())?;
            print_index_summary(fmt, &indexed)?;
        }
    }

    Ok(())
}

fn print_index_summary(
    fmt: OutputFormat,
    indexed: &[pipeline::IndexedGraph],
) -> Result<(), String> {
    let n = indexed.len();
    let cached = indexed
        .iter()
        .filter(|indexed| indexed.source == GraphSource::Cached)
        .count();
    let crawled = n - cached;
    match fmt {
        OutputFormat::Plain => {
            println!(
                "{n} packages indexed (cached: {cached}, crawled: {crawled})"
            );
        }
        OutputFormat::Json => {
            print_json(&serde_json::json!({
                "ok": true,
                "data": {
                    "total": n,
                    "cached": cached,
                    "crawled": crawled,
                }
            }))?;
        }
    }
    Ok(())
}

fn run_query(cli: &Cli, command: &QueryCommands) -> Result<(), String> {
    let cwd = std::env::current_dir().map_err(|err| err.to_string())?;
    let project_root = fs::canonicalize(".").unwrap_or(cwd);
    let file = load_file_for_root(&project_root);
    let fmt = effective_format(cli, file.as_ref())?;
    let (_, database) = open_database(cli, file.as_ref())?;

    match command {
        QueryCommands::Find { limit, fts_query } => {
            let symbols = database
                .find_symbols_fts(fts_query, *limit)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    for symbol in symbols {
                        println!(
                            "{} [{}] {}",
                            symbol.name, symbol.kind_name, symbol.file_path
                        );
                    }
                }
                OutputFormat::Json => {
                    print_json(&serde_json::json!({ "ok": true, "data": { "symbols": symbols } }))?;
                }
            }
        }
        QueryCommands::Packages => {
            let rows = database.list_indexed_packages().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    for (name, ver) in rows {
                        println!("{name}\t{ver}");
                    }
                }
                OutputFormat::Json => {
                    let list: Vec<_> = rows
                        .into_iter()
                        .map(|(pkg_name, pkg_version)| {
                            serde_json::json!({ "name": pkg_name, "version": pkg_version })
                        })
                        .collect();
                    print_json(&serde_json::json!({ "ok": true, "data": { "packages": list } }))?;
                }
            }
        }
        QueryCommands::Symbols { name, version } => {
            let symbols = database
                .list_package_symbols(name, version)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    println!("{} symbols", symbols.len());
                    for symbol in symbols {
                        println!("{}", symbol.name);
                    }
                }
                OutputFormat::Json => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": {
                            "name": name,
                            "version": version,
                            "symbols": symbols,
                        }
                    }))?;
                }
            }
        }
    }
    Ok(())
}
