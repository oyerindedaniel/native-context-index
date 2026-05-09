use std::collections::HashSet;
use std::fs;
use std::io::{self, BufReader, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use clap_complete::{Shell, generate};
use dialoguer::{Confirm, Input};
use serde::{Deserialize, Serialize};

use nci_engine::cache::nci_sqlite_path;
use nci_engine::config::{self, NciConfigFile};
use nci_engine::constants::{DEFAULT_MAX_HOPS, max_hops_from_user_value};
use nci_engine::filter::{DepKindFilter, FilterConfig};
use nci_engine::pipeline::{self, GraphSource, IndexOptions};
use nci_engine::resolver::normalize_dependency_stub_list;
use nci_engine::scanner::{self, ScanError};
use nci_engine::storage::{
    DatabaseStatusReport, NciDatabase, StorageError, SymbolSearchFilters, SymbolSearchHit,
    verify_sqlite_file_header,
};
use serde_json::Value;

const CLI_ABOUT: &str = "Native Context Index — index and query TypeScript declaration graphs";
mod spinner_draw_line;
mod style;
use style::{
    ProgressTone, TtyProgressSpinner, emit_progress_line, emit_ui_line_stdout, format_elapsed,
    init_prompt_theme, print_banner,
};

/// Exit code when `query show`, `query snippet`, or `query overloads` finds no row for the stable id.
pub const EXIT_QUERY_NOT_FOUND: i32 = 2;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CliExit {
    Success,
    /// Stable id not found for `query show` / `query snippet`, or unknown id for `query overloads`.
    QueryNotFound,
}

fn not_found_hint(id: &str) -> String {
    format!(
        "no symbol indexed with id `{id}` — try `query find` or `query symbol` to recover the right id"
    )
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum BannerMode {
    Auto,
    On,
    Off,
}

impl BannerMode {
    fn parse(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "on" => Some(Self::On),
            "off" => Some(Self::Off),
            _ => None,
        }
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum ProgressMode {
    Auto,
    On,
    Off,
}

impl ProgressMode {
    fn parse(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "on" => Some(Self::On),
            "off" => Some(Self::Off),
            _ => None,
        }
    }
}

#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    #[default]
    Plain,
    Json,
    /// Newline-delimited JSON rows (for `nci sql`).
    Jsonl,
}

impl OutputFormat {
    fn parse_config(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "plain" => Some(Self::Plain),
            "json" => Some(Self::Json),
            "jsonl" => Some(Self::Jsonl),
            _ => None,
        }
    }
}

#[derive(Copy, Clone, Debug, Default, Eq, PartialEq)]
enum SqlRowsFormat {
    Plain,
    Json,
    #[default]
    Jsonl,
}

#[derive(Parser)]
#[command(
    name = "nci",
    version,
    about = CLI_ABOUT
)]
pub struct Cli {
    #[arg(
        long,
        global = true,
        value_name = "PATH",
        help = "Path to nci.sqlite (overrides nci.config.json)"
    )]
    database: Option<PathBuf>,

    #[arg(
        long,
        global = true,
        value_enum,
        help = "Output format for supported commands (overrides nci.config.json)"
    )]
    format: Option<OutputFormat>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Interactive setup (or -y): create nci.config.json and open the database")]
    Init {
        #[arg(short = 'y', long, help = "Accept all defaults (non-interactive)")]
        defaults: bool,
    },
    #[command(about = "Database maintenance and lifecycle commands")]
    Db {
        #[command(subcommand)]
        command: DbCommands,
    },
    #[command(about = "Scan node_modules and update the index")]
    Index {
        #[command(subcommand)]
        target: Option<IndexTarget>,
        #[command(flatten)]
        args: BulkIndexArgs,
    },
    #[command(about = "Search and inspect indexed package data")]
    Query {
        #[command(subcommand)]
        command: QueryCommands,
    },
    #[command(
        name = "sql",
        about = "Run SQL that only reads the index (no writes). Use --schema to show how tables are defined.",
        long_about = "Runs one SQL command on the database file you opened with --database (or your config). Only read-only commands are allowed; commands that change data are rejected. Output: by default each result row is one line of JSON (--format jsonl). Use --format json for one big JSON array, or --format plain for tab-separated text. Use --max-rows N to print at most N rows; the command fails if the query would return more than N rows. In PowerShell, wrap the SQL in quotes, e.g. nci sql -c \"SELECT 1\". Table tips: symbols.since_tag holds the raw @since text; symbols.since_major, since_minor, since_patch hold parsed version numbers when we could read them; packages.indexed_at is the index time as a number (Unix seconds). The SQL text you give is sent to SQLite exactly as you typed it, like the sqlite3 program—do not build it from untrusted input."
    )]
    Sql {
        #[arg(long, help = "Show SQL that creates NCI tables, then exit")]
        schema: bool,
        #[arg(
            short = 'c',
            long = "command",
            value_name = "SQL",
            help = "SQL to run (one command; read-only only)"
        )]
        sql: Option<String>,
        #[arg(
            long,
            value_name = "N",
            help = "Print at most N rows; fail if the query has more rows"
        )]
        max_rows: Option<usize>,
        #[arg(
            trailing_var_arg = true,
            allow_hyphen_values = true,
            value_name = "SQL",
            help = "Optional extra words joined into the SQL string; if the SQL starts with '-', use: nci sql -- your sql here"
        )]
        sql_parts: Vec<String>,
    },
    #[command(about = "Print shell completions")]
    Completions {
        #[arg(value_enum)]
        shell: Shell,
    },
    #[command(
        name = "binary-path",
        visible_alias = "which",
        about = "Print the absolute path of the running nci executable (e.g. for NCI_BINARY when using nci-mcp)"
    )]
    BinaryPath,
}

#[derive(Subcommand)]
enum DbCommands {
    #[command(about = "Open the database and run migrations (non-interactive)")]
    Init,
    #[command(about = "Database path/size and health checks (optional)")]
    Status {
        #[arg(
            long,
            conflicts_with = "deep",
            help = "Run PRAGMA quick_check (can still take time on large DBs)"
        )]
        check: bool,
        #[arg(
            long,
            help = "Run full PRAGMA integrity_check (can take minutes on large DBs)"
        )]
        deep: bool,
    },
    #[command(about = "Delete all indexed package rows (prompts unless -y)")]
    Clear {
        #[arg(short = 'y', long, help = "Skip confirmation prompt")]
        yes: bool,
    },
    #[command(about = "Remove one package from the index (prompts unless -y)")]
    Remove {
        name: String,
        version: String,
        #[arg(short = 'y', long, help = "Skip confirmation prompt")]
        yes: bool,
    },
    #[command(
        name = "remove-glob",
        about = "Remove packages whose name matches a SQLite GLOB (* and ?, case-sensitive) (prompts unless -y). Example: react* deletes all react-prefixed names for every indexed version."
    )]
    RemoveGlob {
        #[arg(value_name = "PATTERN")]
        pattern: String,
        #[arg(short = 'y', long, help = "Skip confirmation prompt")]
        yes: bool,
    },
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
    Package { name: String, version: String },
}

#[derive(Parser, Clone)]
struct BulkIndexArgs {
    #[arg(
        short = 'r',
        long,
        value_name = "DIR",
        help = "Project root; default from nci.config.json or `.`"
    )]
    project_root: Option<PathBuf>,

    /// `0` = entry only; `-1` = unlimited (see `MAX_HOPS_UNLIMITED`).
    #[arg(short = 'm', long, allow_hyphen_values = true)]
    max_hops: Option<i64>,

    #[arg(short = 'p', long = "package", value_name = "GLOB")]
    package_globs: Vec<String>,

    /// Emit `npm::…` stubs only for this package root (repeatable); union with `nci.config.json` `dependency_stub_packages`.
    #[arg(short = 's', long = "dependency-stub-package", value_name = "PKG")]
    dependency_stub_packages: Vec<String>,

    /// Only index packages listed under `dependencies` (overrides `package_scope` in config).
    #[arg(
        long = "only-dependencies",
        conflicts_with_all = [
            "include_dev_dependencies",
            "only_dev_dependencies",
            "all_installed_packages"
        ]
    )]
    only_dependencies: bool,

    #[arg(
        long,
        conflicts_with_all = [
            "only_dependencies",
            "only_dev_dependencies",
            "all_installed_packages"
        ]
    )]
    include_dev_dependencies: bool,

    #[arg(
        long,
        conflicts_with_all = [
            "only_dependencies",
            "include_dev_dependencies",
            "all_installed_packages"
        ]
    )]
    only_dev_dependencies: bool,

    #[arg(
        long,
        conflicts_with_all = [
            "only_dependencies",
            "include_dev_dependencies",
            "only_dev_dependencies"
        ]
    )]
    all_installed_packages: bool,

    #[arg(
        long = "skip-root-workspace",
        conflicts_with_all = ["include_root_workspace"]
    )]
    skip_root_workspace: bool,

    #[arg(
        long = "include-root-workspace",
        conflicts_with_all = ["skip_root_workspace"]
    )]
    include_root_workspace: bool,

    #[arg(long)]
    dry_run: bool,
}

#[derive(Subcommand)]
enum QueryCommands {
    #[command(
        about = "Full-text search symbols by query text",
        long_about = "Full-text search over indexed symbols (FTS). Row cap is -n/--limit (default 20). The sql subcommand's --max-rows flag does not apply here; use -n/--limit to limit hits, or use `nci sql` with --max-rows for SQL result caps."
    )]
    Find {
        #[arg(
            short = 'n',
            long,
            default_value_t = 20,
            help = "Max symbol hits to print (not --max-rows; that flag is only for `nci sql`)"
        )]
        limit: usize,
        #[arg(
            long = "package",
            value_name = "NAME",
            help = "Filter hits to an indexed package name"
        )]
        package_name: Option<String>,
        #[arg(
            long = "package-version",
            value_name = "VERSION",
            help = "Filter hits to one indexed package version"
        )]
        package_version: Option<String>,
        #[arg(
            long = "source-package",
            value_name = "NAME",
            help = "Filter hits to declarations from this source package"
        )]
        source_package_name: Option<String>,
        #[arg(
            long = "kind",
            value_name = "KIND",
            help = "Filter hits to a kind_name such as InterfaceDeclaration"
        )]
        kind_name: Option<String>,
        #[arg(
            long = "file",
            value_name = "TEXT",
            help = "Filter hits whose stored file_path contains this text"
        )]
        file_path_contains: Option<String>,
        #[arg(
            long,
            help = "Hide symbols marked internal to the package export surface"
        )]
        public_only: bool,
        #[arg(required = true)]
        fts_query: String,
    },
    #[command(about = "Exact symbol-name search with package/source filters")]
    Symbol {
        #[arg(required = true)]
        name: String,
        #[arg(
            short = 'n',
            long,
            default_value_t = 20,
            help = "Max exact symbol hits to print"
        )]
        limit: usize,
        #[arg(
            long = "package",
            value_name = "NAME",
            help = "Filter hits to an indexed package name"
        )]
        package_name: Option<String>,
        #[arg(
            long = "package-version",
            value_name = "VERSION",
            help = "Filter hits to one indexed package version"
        )]
        package_version: Option<String>,
        #[arg(
            long = "source-package",
            value_name = "NAME",
            help = "Filter hits to declarations from this source package"
        )]
        source_package_name: Option<String>,
        #[arg(
            long = "kind",
            value_name = "KIND",
            help = "Filter hits to a kind_name such as InterfaceDeclaration"
        )]
        kind_name: Option<String>,
        #[arg(
            long = "file",
            value_name = "TEXT",
            help = "Filter hits whose stored file_path contains this text"
        )]
        file_path_contains: Option<String>,
        #[arg(
            long,
            help = "Hide symbols marked internal to the package export surface"
        )]
        public_only: bool,
    },
    #[command(about = "Show one symbol by stable symbol id")]
    Show { id: String },
    #[command(about = "Print cite-ready signature snippet for a stable symbol id")]
    Snippet { id: String },
    #[command(
        about = "List overload siblings for a stable symbol id (same package, name, parent)",
        long_about = "Returns all sibling overload rows for one symbol id (same `package_id`, `name`, and `parent_symbol_id`). Useful when a query hit on `pick` should be reasoned about together with `pick#2`, etc. The input id is included in the output. Empty result when the id is not indexed."
    )]
    Overloads { id: String },
    #[command(about = "List packages currently indexed in the database")]
    Packages,
    #[command(about = "List indexed versions for a package name")]
    PackageVersions { name: String },
    #[command(about = "List declared package dependencies for a package name/version")]
    PackageDeps { name: String, version: String },
    #[command(about = "List distinct source packages for one indexed package version")]
    SourcePackages { name: String, version: String },
    #[command(
        about = "Resolve active installed package version(s) from project/workspace node_modules roots"
    )]
    ActivePackage { name: String },
    #[command(about = "List symbols for a package name/version")]
    Symbols {
        name: String,
        version: String,
        #[arg(
            short = 'n',
            long,
            default_value_t = 100,
            help = "Max symbols to return in this page"
        )]
        limit: usize,
        #[arg(
            long,
            default_value_t = 0,
            help = "Skip this many symbols before returning results"
        )]
        offset: usize,
    },
    #[command(
        about = "Bundled evidence: exact symbol hits + FTS fallback + batched snippets in ONE call",
        long_about = "Returns answer-ready declaration evidence in a single CLI invocation: exact-name hits for each `--symbol`, FTS hits for each `--phrase`, deduplicated, plus batched signature/JSDoc snippets for the top hits — all from a single SQLite open. Truncation marker: when more results existed than fit, the last entry of `data.symbols` is a sentinel hit whose `id`, `name`, and `kind_name` are the literal string `<truncated>` (no new envelope key). Use the same `--package`, `--package-version`, `--source-package`, `--kind` filter semantics as `query symbol` / `query find`."
    )]
    Evidence {
        #[arg(
            long = "package",
            value_name = "NAME",
            required = true,
            help = "Indexed package name to scope all hits"
        )]
        package_name: String,
        #[arg(
            long = "package-version",
            value_name = "VERSION",
            help = "Restrict to one indexed package version"
        )]
        package_version: Option<String>,
        #[arg(
            long = "source-package",
            value_name = "NAME",
            help = "Filter hits to declarations from this source package"
        )]
        source_package_name: Option<String>,
        #[arg(
            long = "symbol",
            value_name = "NAME",
            help = "Exact symbol name to look up (repeatable)"
        )]
        symbols: Vec<String>,
        #[arg(
            long = "phrase",
            value_name = "TEXT",
            help = "FTS phrase fallback (repeatable); used when exact returns nothing for an anchor"
        )]
        phrases: Vec<String>,
        #[arg(
            long = "kind",
            value_name = "KIND",
            help = "Filter hits to a kind_name such as InterfaceDeclaration"
        )]
        kind_name: Option<String>,
        #[arg(
            long,
            help = "Hide symbols marked internal to the package export surface"
        )]
        public_only: bool,
        #[arg(
            short = 'n',
            long,
            default_value_t = 10,
            help = "Max symbol hits returned across all anchors after dedupe"
        )]
        limit: usize,
        #[arg(
            long = "snippet-limit",
            value_name = "N",
            help = "Max signature/JSDoc snippets to attach (default: same as --limit)"
        )]
        snippet_limit: Option<usize>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ActivePackageCandidate {
    package_name: String,
    package_version: String,
    indexed: bool,
    node_modules_root: String,
    package_dir: String,
}

pub fn run() -> Result<CliExit, String> {
    let raw_args: Vec<String> = std::env::args().collect();
    if is_top_level_help_request(&raw_args) {
        run_top_level_help()?;
        return Ok(CliExit::Success);
    }

    let cli = Cli::parse();
    match &cli.command {
        Commands::Init { defaults } => {
            run_init(*defaults, cli.database.clone()).map(|_| CliExit::Success)
        }
        Commands::Db { command } => run_db(&cli, command).map(|_| CliExit::Success),
        Commands::Index { target, args } => {
            run_index(&cli, target.as_ref(), args).map(|_| CliExit::Success)
        }
        Commands::Query { command } => run_query(&cli, command),
        Commands::Sql {
            schema,
            sql,
            max_rows,
            sql_parts,
        } => run_sql(&cli, *schema, sql.clone(), sql_parts, *max_rows).map(|_| CliExit::Success),
        Commands::Completions { shell } => {
            let mut cmd = Cli::command();
            let bin_name = cmd.get_name().to_string();
            generate(*shell, &mut cmd, bin_name, &mut io::stdout());
            Ok(CliExit::Success)
        }
        Commands::BinaryPath => run_binary_path().map(|_| CliExit::Success),
    }
}

fn is_top_level_help_request(args: &[String]) -> bool {
    args.len() == 2 && (args[1] == "--help" || args[1] == "-h")
}

fn run_top_level_help() -> Result<(), String> {
    let context = resolve_command_context(None)?;
    if should_print_banner(OutputFormat::Plain, context.file.as_ref())? {
        print_banner();
    }
    let mut command = Cli::command();
    command
        .print_long_help()
        .map_err(|io_error| io_error.to_string())?;
    println!();
    Ok(())
}

fn run_binary_path() -> Result<(), String> {
    let path = std::env::current_exe()
        .map_err(|err| format!("nci binary-path: could not resolve current executable: {err}"))?;
    println!("{}", display_path(&path));
    Ok(())
}

#[derive(Clone)]
struct CommandContext {
    config_dir: PathBuf,
    project_root: PathBuf,
    file: Option<NciConfigFile>,
}

fn resolve_command_context(
    project_root_override: Option<&PathBuf>,
) -> Result<CommandContext, String> {
    let start_dir = if let Some(root_override) = project_root_override {
        root_override.clone()
    } else {
        PathBuf::from(".")
    };
    let discovery_dir = fs::canonicalize(&start_dir)
        .map_err(|err| format!("project root {}: {err}", start_dir.display()))?;
    let discovered = config::discover_config(&discovery_dir)?;
    if let Some((config_dir, file_cfg)) = discovered {
        let project_root = if project_root_override.is_some() {
            discovery_dir.clone()
        } else if let Some(root_str) = &file_cfg.project_root {
            let raw = Path::new(root_str);
            let joined = if raw.is_absolute() {
                raw.to_path_buf()
            } else {
                config_dir.join(raw)
            };
            fs::canonicalize(&joined)
                .map_err(|err| format!("config project_root {}: {err}", joined.display()))?
        } else {
            config_dir.clone()
        };
        return Ok(CommandContext {
            config_dir,
            project_root,
            file: Some(file_cfg),
        });
    }
    Ok(CommandContext {
        config_dir: discovery_dir.clone(),
        project_root: discovery_dir,
        file: None,
    })
}

fn effective_format(cli: &Cli, file: Option<&NciConfigFile>) -> Result<OutputFormat, String> {
    if let Some(fmt_flag) = cli.format {
        return Ok(fmt_flag);
    }
    if let Some(toml_cfg) = file
        && let Some(format_str) = &toml_cfg.format
    {
        if let Some(parsed) = OutputFormat::parse_config(format_str) {
            return Ok(parsed);
        }
        return Err(format!(
            "invalid format in nci.config.json: {format_str:?} (expected plain, json, or jsonl)"
        ));
    }
    Ok(OutputFormat::Plain)
}

fn envelope_output_format(fmt: OutputFormat) -> OutputFormat {
    match fmt {
        OutputFormat::Jsonl => OutputFormat::Json,
        other => other,
    }
}

fn sql_rows_format(cli: &Cli, file: Option<&NciConfigFile>) -> Result<SqlRowsFormat, String> {
    if let Some(flag) = cli.format {
        return Ok(match flag {
            OutputFormat::Plain => SqlRowsFormat::Plain,
            OutputFormat::Json => SqlRowsFormat::Json,
            OutputFormat::Jsonl => SqlRowsFormat::Jsonl,
        });
    }
    if let Some(toml_cfg) = file
        && let Some(format_str) = &toml_cfg.format
    {
        return match format_str.trim().to_ascii_lowercase().as_str() {
            "plain" => Ok(SqlRowsFormat::Plain),
            "json" => Ok(SqlRowsFormat::Json),
            "jsonl" => Ok(SqlRowsFormat::Jsonl),
            _ => Err(format!(
                "invalid format in nci.config.json: {format_str:?} (expected plain, json, or jsonl)"
            )),
        };
    }
    Ok(SqlRowsFormat::default())
}

fn resolve_database_path_from_config(
    config_dir: &Path,
    configured_database_path: PathBuf,
) -> PathBuf {
    if configured_database_path.is_absolute() {
        return configured_database_path;
    }
    config_dir.join(configured_database_path)
}

fn merge_database_path(
    cli: &Cli,
    file: Option<&NciConfigFile>,
    config_dir: &Path,
) -> Option<PathBuf> {
    if let Some(cli_database_path) = &cli.database {
        return Some(cli_database_path.clone());
    }
    file.and_then(|config_file| {
        config_file
            .database
            .clone()
            .map(|configured_database_path| {
                resolve_database_path_from_config(config_dir, configured_database_path)
            })
    })
}

fn resolve_database_path(
    cli: &Cli,
    file: Option<&NciConfigFile>,
    config_dir: &Path,
) -> Result<PathBuf, String> {
    merge_database_path(cli, file, config_dir)
        .or_else(nci_sqlite_path)
        .ok_or_else(|| {
            "could not resolve database path; set `database` in nci.config.json, pass --database, or set a writable user cache directory / NCI_CACHE_DIR"
                .to_string()
        })
}

fn open_database_at(path: &Path) -> Result<NciDatabase, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    NciDatabase::open(path).map_err(|err| err.to_string())
}

fn open_database(
    cli: &Cli,
    file: Option<&NciConfigFile>,
    config_dir: &Path,
) -> Result<(PathBuf, NciDatabase), String> {
    let path = resolve_database_path(cli, file, config_dir)?;
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
        OutputFormat::Json | OutputFormat::Jsonl => {
            json_err(msg)?;
            Err(String::new())
        }
    }
}

fn display_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn effective_banner_mode(file: Option<&NciConfigFile>) -> Result<BannerMode, String> {
    if let Ok(env_value) = std::env::var("NCI_BANNER")
        && !env_value.trim().is_empty()
    {
        return BannerMode::parse(&env_value).ok_or_else(|| {
            format!("invalid NCI_BANNER value {env_value:?} (expected auto, on, or off)")
        });
    }
    if let Some(config_file) = file
        && let Some(configured_banner_mode) = &config_file.banner
    {
        return BannerMode::parse(configured_banner_mode).ok_or_else(|| {
            format!(
                "invalid banner in nci.config.json: {:?} (expected auto, on, or off)",
                configured_banner_mode
            )
        });
    }
    Ok(BannerMode::Auto)
}

fn should_print_banner(fmt: OutputFormat, file: Option<&NciConfigFile>) -> Result<bool, String> {
    if fmt != OutputFormat::Plain {
        return Ok(false);
    }
    let mode = effective_banner_mode(file)?;
    Ok(match mode {
        BannerMode::On => true,
        BannerMode::Off => false,
        BannerMode::Auto => std::io::stdout().is_terminal(),
    })
}

fn effective_progress_mode(file: Option<&NciConfigFile>) -> Result<ProgressMode, String> {
    if let Ok(env_value) = std::env::var("NCI_PROGRESS")
        && !env_value.trim().is_empty()
    {
        return ProgressMode::parse(&env_value).ok_or_else(|| {
            format!("invalid NCI_PROGRESS value {env_value:?} (expected auto, on, or off)")
        });
    }
    if let Some(config_file) = file
        && let Some(configured_progress_mode) = &config_file.progress
    {
        return ProgressMode::parse(configured_progress_mode).ok_or_else(|| {
            format!(
                "invalid progress in nci.config.json: {:?} (expected auto, on, or off)",
                configured_progress_mode
            )
        });
    }
    Ok(ProgressMode::Auto)
}

fn should_print_progress(fmt: OutputFormat, file: Option<&NciConfigFile>) -> Result<bool, String> {
    if fmt != OutputFormat::Plain {
        return Ok(false);
    }
    let mode = effective_progress_mode(file)?;
    Ok(match mode {
        ProgressMode::On => true,
        ProgressMode::Off => false,
        ProgressMode::Auto => std::io::stderr().is_terminal(),
    })
}

fn print_status_plain(status_report: &DatabaseStatusReport) {
    println!("path: {}", display_path(&status_report.path));
    if let Some(sz) = status_report.file_size_bytes {
        println!("file_size_bytes: {sz}");
    } else {
        println!("file_size_bytes: (unavailable)");
    }
    println!("page_size: {}", status_report.page_size);
    println!("page_count: {}", status_report.page_count);
    println!(
        "database_size_bytes_approx: {}",
        status_report.database_size_bytes_approx
    );
    println!("journal_mode: {}", status_report.journal_mode);
    println!("schema_version: {}", status_report.schema_version);
    if let (Some(check_kind), Some(check_value)) = (
        &status_report.integrity_check_kind,
        &status_report.integrity_check,
    ) {
        println!("{check_kind}: {check_value}");
    } else {
        emit_ui_line_stdout(
            ProgressTone::Note,
            "db status",
            "integrity_check skipped (use --check or --deep)",
        );
    }
    if let Some(ref env_value) = status_report.nci_cache_dir_env {
        println!("NCI_CACHE_DIR (env override, may differ from DB path): {env_value}");
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
        file_cfg.progress = Some("auto".into());
        file_cfg.max_hops = Some(DEFAULT_MAX_HOPS as i64);
        if file_cfg.database.is_none() {
            return Err(
                "could not resolve default SQLite path; set NCI_CACHE_DIR or pass --database"
                    .into(),
            );
        }
    } else {
        let theme = init_prompt_theme();
        let default_db = database_cli
            .clone()
            .or_else(nci_sqlite_path)
            .map(|path_buf| display_path(&path_buf))
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
        if fmt != "plain" && fmt != "json" && fmt != "jsonl" {
            return Err(format!(
                "unknown format {fmt:?}; choose plain, json, or jsonl"
            ));
        }
        file_cfg.format = Some(fmt);
        file_cfg.progress = Some("auto".into());
        let max_hops_line: String = Input::with_theme(&theme)
            .with_prompt("Default max hops (0 = entry only, -1 = unlimited)")
            .default(DEFAULT_MAX_HOPS.to_string())
            .interact_text()
            .map_err(|err| err.to_string())?;
        let max_hops_value = max_hops_line.trim().parse::<i64>().map_err(|_| {
            format!(
                "invalid max hops {max_hops_line:?}; expected an integer like {}, 0, or -1",
                DEFAULT_MAX_HOPS
            )
        })?;
        max_hops_from_user_value(Some(max_hops_value))?;
        file_cfg.max_hops = Some(max_hops_value);
    }

    config::write_config_file(&project_root, &file_cfg)?;

    let db_path = file_cfg
        .database
        .clone()
        .ok_or_else(|| "database path missing after init".to_string())?;
    let database = open_database_at(&db_path)?;
    let _schema = database
        .stored_schema_version()
        .map_err(|err| err.to_string())?;
    let written_config_path = config::config_path_for_project_root(&project_root);
    if should_print_banner(OutputFormat::Plain, Some(&file_cfg))? {
        print_banner();
    }
    emit_ui_line_stdout(ProgressTone::Done, "init", "initialization complete");
    println!("Database: {}", display_path(&db_path));
    println!("Config: {}", display_path(&written_config_path));
    emit_ui_line_stdout(
        ProgressTone::Step,
        "init",
        "next: nci index; then nci query packages",
    );
    Ok(())
}

fn run_db(cli: &Cli, cmd: &DbCommands) -> Result<(), String> {
    let context = resolve_command_context(None)?;
    let file = context.file.as_ref();
    let config_dir = context.config_dir.as_path();
    let fmt = envelope_output_format(effective_format(cli, file)?);
    let show_progress = should_print_progress(fmt, file)?;

    match cmd {
        DbCommands::Init => {
            let started = Instant::now();
            if show_progress {
                emit_progress_line("db init", ProgressTone::Step, "starting");
            }
            let (path, database) = open_database(cli, file, config_dir)?;
            let schema = database
                .stored_schema_version()
                .map_err(|err| err.to_string())?;
            if show_progress {
                emit_progress_line(
                    "db init",
                    ProgressTone::Done,
                    &format!("done +{}", format_elapsed(started.elapsed())),
                );
            }
            match fmt {
                OutputFormat::Plain => {
                    emit_ui_line_stdout(ProgressTone::Done, "db init", "database initialized");
                    println!("Database: {}", display_path(&path));
                    println!("Schema: v{schema}");
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
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
        DbCommands::Status { check, deep } => {
            let started = Instant::now();
            let spinner = if show_progress && io::stderr().is_terminal() {
                TtyProgressSpinner::try_start()
            } else {
                None
            };
            if show_progress && spinner.is_none() {
                emit_progress_line("db status", ProgressTone::Step, "checking database");
            }
            let path = resolve_database_path(cli, file, config_dir)?;
            let database = open_database_at(&path)?;
            let check_mode = if *deep {
                Some("deep")
            } else if *check {
                Some("quick")
            } else {
                None
            };
            let report = database
                .status_report(&path, check_mode)
                .map_err(|err| err.to_string())?;
            if let Some(tty_progress_spinner) = spinner {
                tty_progress_spinner.finish();
            }
            if show_progress {
                emit_progress_line(
                    "db status",
                    ProgressTone::Done,
                    &format!("done +{}", format_elapsed(started.elapsed())),
                );
            }
            match fmt {
                OutputFormat::Plain => print_status_plain(&report),
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({ "ok": true, "data": report }))?;
                }
            }
            Ok(())
        }
        DbCommands::Clear { yes } => {
            confirm_destructive_action(
                *yes,
                "db clear",
                "This will delete all indexed package rows. Continue?",
            )?;
            let (_, db) = open_database(cli, file, config_dir)?;
            db.clear_all_packages().map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    emit_ui_line_stdout(ProgressTone::Done, "db clear", "cleared all packages")
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({ "ok": true, "data": "cleared" }))?
                }
            }
            Ok(())
        }
        DbCommands::Remove { name, version, yes } => {
            confirm_destructive_action(
                *yes,
                "db remove",
                &format!("Remove {name}@{version} from the index?"),
            )?;
            let (_, db) = open_database(cli, file, config_dir)?;
            let rows_removed = db
                .delete_package_count(name, version)
                .map_err(|err| err.to_string())?;
            if rows_removed == 0 {
                let known_versions = db
                    .list_package_versions(name)
                    .map_err(|err| err.to_string())?;
                match fmt {
                    OutputFormat::Plain => {
                        emit_ui_line_stdout(
                            ProgressTone::Error,
                            "db remove",
                            &format!("package {name}@{version} not found"),
                        );
                        if known_versions.is_empty() {
                            emit_ui_line_stdout(
                                ProgressTone::Note,
                                "db remove",
                                "run `nci query packages` to inspect indexed packages",
                            );
                        } else {
                            emit_ui_line_stdout(
                                ProgressTone::Note,
                                "db remove",
                                &format!(
                                    "indexed versions for {name}: {}",
                                    known_versions.join(", ")
                                ),
                            );
                        }
                        return Err(String::new());
                    }
                    OutputFormat::Json | OutputFormat::Jsonl => {
                        let extra_hint = if known_versions.is_empty() {
                            "; no indexed package with that name (run `nci query packages`)"
                        } else {
                            ""
                        };
                        return emit_error(
                            fmt,
                            &format!(
                                "nci db remove: package {name}@{version} not found; indexed versions: {}{}",
                                if known_versions.is_empty() {
                                    "(none)".to_string()
                                } else {
                                    known_versions.join(", ")
                                },
                                extra_hint
                            ),
                        );
                    }
                }
            }
            match fmt {
                OutputFormat::Plain => emit_ui_line_stdout(
                    ProgressTone::Done,
                    "db remove",
                    &format!("removed {name} {version}"),
                ),
                OutputFormat::Json | OutputFormat::Jsonl => print_json(&serde_json::json!({
                    "ok": true,
                    "data": { "name": name, "version": version }
                }))?,
            }
            Ok(())
        }
        DbCommands::RemoveGlob { pattern, yes } => {
            confirm_destructive_action(
                *yes,
                "db remove-glob",
                &format!(
                    "Remove all indexed packages matching pattern {pattern:?}? This affects all versions."
                ),
            )?;
            let (_, db) = open_database(cli, file, config_dir)?;
            let removed_count = db
                .delete_packages_matching_name_glob(pattern.as_str())
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => emit_ui_line_stdout(
                    ProgressTone::Done,
                    "db remove-glob",
                    &format!("removed {removed_count} package(s) matching {pattern}"),
                ),
                OutputFormat::Json | OutputFormat::Jsonl => print_json(&serde_json::json!({
                    "ok": true,
                    "data": { "pattern": pattern, "removed": removed_count }
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
            let path = resolve_database_path(cli, file, config_dir)?;
            verify_sqlite_file_header(&path).map_err(|err| err.to_string())?;
            // Drop any connection by not opening; remove file
            fs::remove_file(&path).map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => emit_ui_line_stdout(
                    ProgressTone::Done,
                    "db destroy",
                    &format!("removed {}", display_path(&path)),
                ),
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({ "ok": true, "data": { "path": path } }))?
                }
            }
            Ok(())
        }
        DbCommands::Vacuum => {
            let started = Instant::now();
            if show_progress {
                emit_progress_line("db vacuum", ProgressTone::Step, "starting");
            }
            let (_, db) = open_database(cli, file, config_dir)?;
            db.vacuum().map_err(|err| err.to_string())?;
            if show_progress {
                emit_progress_line(
                    "db vacuum",
                    ProgressTone::Done,
                    &format!("done +{}", format_elapsed(started.elapsed())),
                );
            }
            match fmt {
                OutputFormat::Plain => {
                    emit_ui_line_stdout(ProgressTone::Done, "db vacuum", "vacuum complete")
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({ "ok": true, "data": "vacuum" }))?
                }
            }
            Ok(())
        }
        DbCommands::WalCheckpoint => {
            let started = Instant::now();
            if show_progress {
                emit_progress_line("db wal-checkpoint", ProgressTone::Step, "starting");
            }
            let (_, db) = open_database(cli, file, config_dir)?;
            db.wal_checkpoint_truncate()
                .map_err(|err| err.to_string())?;
            if show_progress {
                emit_progress_line(
                    "db wal-checkpoint",
                    ProgressTone::Done,
                    &format!("done +{}", format_elapsed(started.elapsed())),
                );
            }
            match fmt {
                OutputFormat::Plain => emit_ui_line_stdout(
                    ProgressTone::Done,
                    "db wal-checkpoint",
                    "wal_checkpoint(TRUNCATE) complete",
                ),
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({ "ok": true, "data": "wal_checkpoint" }))?
                }
            }
            Ok(())
        }
    }
}

fn confirm_destructive_action(yes: bool, scope: &str, prompt: &str) -> Result<(), String> {
    if yes {
        return Ok(());
    }
    if !io::stdout().is_terminal() {
        emit_ui_line_stdout(
            ProgressTone::Warn,
            scope,
            "confirmation required in non-interactive mode; re-run with -y",
        );
        return Err(String::new());
    }
    let confirmed = Confirm::with_theme(&init_prompt_theme())
        .with_prompt(prompt)
        .default(false)
        .interact()
        .map_err(|err| err.to_string())?;
    if !confirmed {
        emit_ui_line_stdout(ProgressTone::Warn, scope, "cancelled by user");
        return Err(String::new());
    }
    Ok(())
}

fn resolve_index_root_workspace(bulk: &BulkIndexArgs, file: Option<&NciConfigFile>) -> bool {
    if bulk.skip_root_workspace {
        return false;
    }
    if bulk.include_root_workspace {
        return true;
    }
    if let Some(file_cfg) = file
        && let Some(flag) = file_cfg.index_root_workspace
    {
        return flag;
    }
    true
}

/// Same precedence as [`resolve_index_root_workspace`] without CLI flags (for `query` paths).
fn resolve_index_root_workspace_config_only(file: Option<&NciConfigFile>) -> bool {
    if let Some(file_cfg) = file
        && let Some(flag) = file_cfg.index_root_workspace
    {
        flag
    } else {
        true
    }
}

/// `index_root_workspace: false` or `--skip-root-workspace` requires non-empty `workspaces` in config.
fn ensure_index_root_workspace_valid(
    file: Option<&NciConfigFile>,
    include_root: bool,
) -> Result<(), String> {
    if include_root {
        return Ok(());
    }
    let has_workspaces = file
        .and_then(|cfg| cfg.workspaces.as_ref())
        .is_some_and(|patterns| !patterns.is_empty());
    if !has_workspaces {
        return Err(
            "omitting the root node_modules install root requires `workspaces` in nci.config.json (non-empty array)"
                .to_string(),
        );
    }
    Ok(())
}

fn resolve_package_scope(bulk: &BulkIndexArgs, file: Option<&NciConfigFile>) -> DepKindFilter {
    if bulk.only_dependencies {
        return DepKindFilter::DependenciesOnly;
    }
    if bulk.all_installed_packages {
        return DepKindFilter::All;
    }
    if bulk.only_dev_dependencies {
        return DepKindFilter::DevDependenciesOnly;
    }
    if bulk.include_dev_dependencies {
        return DepKindFilter::DependenciesAndDevDependencies;
    }
    if let Some(file_cfg) = file
        && let Some(scope) = file_cfg.package_scope
    {
        return scope.into();
    }
    DepKindFilter::DependenciesOnly
}

fn build_filter(
    file: Option<&NciConfigFile>,
    bulk: &BulkIndexArgs,
    package_globs_cli: &[String],
) -> FilterConfig {
    let mut filter = FilterConfig {
        dep_kind_filter: resolve_package_scope(bulk, file),
        ..Default::default()
    };
    if let Some(file_cfg) = file
        && let Some(package_filters) = &file_cfg.packages
    {
        if let Some(include_globs) = &package_filters.include {
            filter.include_globs.reserve(include_globs.len());
            filter.include_globs.extend(include_globs.iter().cloned());
        }
        if let Some(exclude_patterns) = &package_filters.exclude {
            filter.exclude_patterns.reserve(exclude_patterns.len());
            filter
                .exclude_patterns
                .extend(exclude_patterns.iter().cloned());
        }
    }
    filter
        .include_globs
        .extend(package_globs_cli.iter().cloned());
    filter
}

fn expand_workspace_pattern(project_root: &Path, pattern: &str) -> Vec<PathBuf> {
    let normalized = pattern.replace('\\', "/");
    if normalized.ends_with("/*") {
        let base = normalized.trim_end_matches("/*");
        let base_dir = project_root.join(base);
        if !base_dir.is_dir() {
            return Vec::new();
        }
        let mut dirs = Vec::new();
        if let Ok(entries) = fs::read_dir(base_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    dirs.push(path);
                }
            }
        }
        return dirs;
    }
    let direct = project_root.join(normalized);
    if direct.is_dir() {
        vec![direct]
    } else {
        Vec::new()
    }
}

fn try_package_manager_in_directory(dir: &Path) -> Option<String> {
    const KNOWN_TOOL_IDS: &[&str] = &["pnpm", "yarn", "npm", "bun", "deno"];
    let package_json_path = dir.join("package.json");
    if let Ok(package_json_file) = fs::File::open(&package_json_path) {
        let buffered = BufReader::new(package_json_file);
        if let Ok(root_object) = serde_json::from_reader::<_, serde_json::Value>(buffered)
            && let Some(package_manager_spec) = root_object
                .get("packageManager")
                .and_then(|field| field.as_str())
        {
            let tool_prefix = package_manager_spec.split('@').next().unwrap_or("").trim();
            if KNOWN_TOOL_IDS.contains(&tool_prefix) {
                return Some(tool_prefix.to_string());
            }
        }
    }

    const LOCKFILE_TOOL: &[(&str, &str)] = &[
        ("pnpm-lock.yaml", "pnpm"),
        ("bun.lock", "bun"),
        ("bun.lockb", "bun"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
        ("npm-shrinkwrap.json", "npm"),
        ("deno.lock", "deno"),
    ];
    for (lockfile_name, manager_id) in LOCKFILE_TOOL {
        if dir.join(lockfile_name).is_file() {
            return Some((*manager_id).to_string());
        }
    }

    None
}

/// Resolve package manager for hints (`npm`, `pnpm`, `yarn`, `bun`, `deno`, or `unknown`).
/// Checks `project_root`, then walks parents toward `config_discovery_dir` (where `nci.config.json`
/// was found). Stops at the first directory that yields Corepack `packageManager` or a lockfile.
fn detect_project_package_manager(
    project_root: &Path,
    config_discovery_dir: Option<&Path>,
) -> String {
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();

    let mut try_visit = |path: &Path| -> Option<String> {
        let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if !seen_dirs.insert(key.clone()) {
            return None;
        }
        try_package_manager_in_directory(&key)
    };

    if let Some(found) = try_visit(project_root) {
        return found;
    }

    if let Some(cfg) = config_discovery_dir {
        let cfg_canon = fs::canonicalize(cfg).unwrap_or_else(|_| cfg.to_path_buf());
        let pr_canon =
            fs::canonicalize(project_root).unwrap_or_else(|_| project_root.to_path_buf());

        if pr_canon != cfg_canon {
            let mut walk = project_root.to_path_buf();
            loop {
                let walk_canon = fs::canonicalize(&walk).unwrap_or_else(|_| walk.clone());
                if walk_canon == cfg_canon {
                    break;
                }
                let Some(parent) = walk.parent() else {
                    if let Some(found) = try_visit(cfg) {
                        return found;
                    }
                    break;
                };
                walk = parent.to_path_buf();
                if let Some(found) = try_visit(&walk) {
                    return found;
                }
                let after = fs::canonicalize(&walk).unwrap_or_else(|_| walk.clone());
                if after == cfg_canon {
                    break;
                }
            }
        }
        if let Some(found) = try_visit(cfg) {
            return found;
        }
    }

    "unknown".to_string()
}

fn collect_unique_workspace_dirs(
    project_root: &Path,
    file: Option<&NciConfigFile>,
) -> Vec<PathBuf> {
    let Some(file_cfg) = file else {
        return Vec::new();
    };
    let Some(workspaces) = &file_cfg.workspaces else {
        return Vec::new();
    };
    let mut seen_canonical: HashSet<PathBuf> = HashSet::new();
    let mut dirs: Vec<PathBuf> = Vec::new();
    for pattern in workspaces {
        for workspace_dir in expand_workspace_pattern(project_root, pattern) {
            let canonical =
                fs::canonicalize(&workspace_dir).unwrap_or_else(|_| workspace_dir.clone());
            if seen_canonical.insert(canonical) {
                dirs.push(workspace_dir);
            }
        }
    }
    dirs
}

fn collect_workspace_manifest_dirs(workspace_dirs: &[PathBuf]) -> Vec<PathBuf> {
    workspace_dirs
        .iter()
        .filter(|dir| dir.join("package.json").is_file())
        .cloned()
        .collect()
}

fn collect_node_modules_roots(
    project_root: &Path,
    workspace_dirs: &[PathBuf],
    include_root_workspace: bool,
) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if include_root_workspace {
        roots.push(project_root.join("node_modules"));
    }
    for workspace_dir in workspace_dirs {
        roots.push(workspace_dir.join("node_modules"));
    }
    let mut seen_canonical: HashSet<PathBuf> = HashSet::new();
    let mut deduped: Vec<PathBuf> = Vec::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        let canonical = fs::canonicalize(&root).unwrap_or(root.clone());
        if seen_canonical.insert(canonical) {
            deduped.push(root);
        }
    }
    deduped
}

fn scan_filtered_packages_across_roots(
    node_modules_roots: &[PathBuf],
    opts: &IndexOptions,
) -> Result<Vec<nci_engine::types::PackageInfo>, ScanError> {
    let mut all_packages = Vec::new();
    for root in node_modules_roots {
        let mut found = pipeline::scan_filtered_packages(root, opts)?;
        all_packages.append(&mut found);
    }
    Ok(pipeline::dedupe_packages_by_canonical_dir(all_packages))
}

fn scan_all_packages_across_roots(
    node_modules_roots: &[PathBuf],
) -> Result<Vec<nci_engine::types::PackageInfo>, ScanError> {
    let mut all_packages = Vec::new();
    for root in node_modules_roots {
        let mut found = scanner::scan_packages(root)?;
        all_packages.append(&mut found);
    }
    Ok(pipeline::dedupe_packages_by_canonical_dir(all_packages))
}

fn resolve_active_package_candidates(
    package_name: &str,
    node_modules_roots: &[PathBuf],
    indexed_versions: &HashSet<String>,
) -> Result<Vec<ActivePackageCandidate>, String> {
    let mut seen_package_dirs: HashSet<PathBuf> = HashSet::new();
    let mut candidates: Vec<ActivePackageCandidate> = Vec::new();

    for node_modules_root in node_modules_roots {
        let scanned_packages = scanner::scan_packages(node_modules_root)
            .map_err(|scan_error| format!("scan {}: {scan_error}", node_modules_root.display()))?;
        for package_info in scanned_packages {
            if package_info.name.as_ref() != package_name {
                continue;
            }
            let package_dir_path = PathBuf::from(package_info.dir.as_ref());
            let canonical_package_dir =
                fs::canonicalize(&package_dir_path).unwrap_or(package_dir_path.clone());
            if !seen_package_dirs.insert(canonical_package_dir) {
                continue;
            }
            let package_version = package_info.version.to_string();
            candidates.push(ActivePackageCandidate {
                package_name: package_name.to_string(),
                indexed: indexed_versions.contains(package_version.as_str()),
                package_version,
                node_modules_root: display_path(node_modules_root),
                package_dir: display_path(&package_dir_path),
            });
        }
    }

    Ok(candidates)
}

fn build_index_options(
    cli: &Cli,
    file: Option<&NciConfigFile>,
    config_dir: &Path,
    project_root: PathBuf,
    bulk: &BulkIndexArgs,
) -> Result<IndexOptions, String> {
    let db_path = merge_database_path(cli, file, config_dir);
    let max_hops = max_hops_from_user_value(bulk.max_hops.or(file.and_then(|toml| toml.max_hops)))?;
    let filter = build_filter(file, bulk, &bulk.package_globs);

    let mut stub_list_from_config: Vec<String> = Vec::new();
    if let Some(config_file) = file
        && let Some(list) = &config_file.dependency_stub_packages
    {
        stub_list_from_config.extend(list.iter().cloned());
    }
    stub_list_from_config.extend(bulk.dependency_stub_packages.iter().cloned());
    let dependency_stub_packages = normalize_dependency_stub_list(stub_list_from_config);

    Ok(IndexOptions {
        max_hops,
        parallel: true,
        enable_package_cache: true,
        db_path,
        project_root: Some(project_root),
        filter,
        parallel_resolve_deps: true,
        dependency_stub_packages,
        ..Default::default()
    })
}

/// Per-package stderr progress for `nci index` plain output only ([`OutputFormat::Plain`]).
fn with_plain_index_progress(mut opts: IndexOptions, total: usize, enabled: bool) -> IndexOptions {
    if !enabled || total == 0 {
        return opts;
    }
    fn status_token(raw_status: &str) -> String {
        raw_status
            .trim()
            .chars()
            .map(|character| {
                if character.is_whitespace() {
                    '_'
                } else {
                    character.to_ascii_uppercase()
                }
            })
            .collect()
    }
    let start = Instant::now();
    let packages_completed = Arc::new(AtomicUsize::new(0));
    let packages_completed_for_callback = Arc::clone(&packages_completed);
    opts.on_package_done = Some(Arc::new(move |progress: pipeline::PackageProgress| {
        let one_based_index = packages_completed_for_callback.fetch_add(1, Ordering::Relaxed) + 1;
        let elapsed = start.elapsed();
        let (source_label, tone) = match progress.source {
            GraphSource::Cached => ("CACHED", ProgressTone::Note),
            GraphSource::Crawled if progress.persisted => ("INDEXED", ProgressTone::Done),
            GraphSource::Crawled => ("NOT_PERSISTED", ProgressTone::Error),
        };
        emit_progress_line(
            "index package",
            tone,
            &format!(
                "[{one_based_index}/{total}] [{}] {} {} symbols={} +{}",
                status_token(source_label),
                progress.name,
                progress.version,
                progress.total_symbols,
                format_elapsed(elapsed),
            ),
        );
    }));
    opts
}

fn run_index(cli: &Cli, target: Option<&IndexTarget>, bulk: &BulkIndexArgs) -> Result<(), String> {
    let context = resolve_command_context(bulk.project_root.as_ref())?;
    let file = context.file.as_ref();
    let config_dir = context.config_dir.clone();
    let project_root = context.project_root.clone();
    let fmt = envelope_output_format(effective_format(cli, file)?);
    let show_progress = should_print_progress(fmt, file)?;
    let include_root_workspace = resolve_index_root_workspace(bulk, file);
    ensure_index_root_workspace_valid(file, include_root_workspace)?;
    let workspace_dirs = collect_unique_workspace_dirs(&project_root, file);
    let workspace_manifest_dirs = collect_workspace_manifest_dirs(&workspace_dirs);
    let node_modules_roots =
        collect_node_modules_roots(&project_root, &workspace_dirs, include_root_workspace);
    if node_modules_roots.is_empty() {
        return emit_error(
            fmt,
            &format!(
                "no node_modules directories found under {}",
                project_root.display()
            ),
        );
    }

    if bulk.dry_run {
        let dry_run_started = Instant::now();
        if show_progress {
            emit_progress_line("index dry-run", ProgressTone::Step, "scanning packages");
        }
        let mut opts = build_index_options(cli, file, &config_dir, project_root.clone(), bulk)?;
        opts.filter = opts
            .filter
            .with_nciignore_file(&config_dir)
            .with_workspace_manifest_dirs(workspace_manifest_dirs.clone());
        let filtered = scan_filtered_packages_across_roots(&node_modules_roots, &opts)
            .map_err(|scan_err: ScanError| scan_err.to_string())?;
        if show_progress {
            emit_progress_line(
                "index dry-run",
                ProgressTone::Done,
                &format!(
                    "done ({} package(s)) +{}",
                    filtered.len(),
                    format_elapsed(dry_run_started.elapsed())
                ),
            );
        }
        match fmt {
            OutputFormat::Plain => {
                emit_ui_line_stdout(
                    ProgressTone::Note,
                    "index dry-run",
                    &format!("{} package(s) would be indexed", filtered.len()),
                );
                for pkg in &filtered {
                    println!("{} {}", pkg.name, pkg.version);
                }
            }
            OutputFormat::Json | OutputFormat::Jsonl => {
                let roots_json: Vec<String> = node_modules_roots
                    .iter()
                    .map(|root_path| root_path.display().to_string())
                    .collect();
                let rows: Vec<_> = filtered
                    .iter()
                    .map(|pkg| {
                        serde_json::json!({
                            "name": pkg.name.as_ref(),
                            "version": pkg.version.as_ref(),
                        })
                    })
                    .collect();
                print_json(&serde_json::json!({
                    "ok": true,
                    "data": {
                        "node_modules_roots": roots_json,
                        "packages": rows
                    }
                }))?;
            }
        }
        return Ok(());
    }

    match target {
        Some(IndexTarget::Package { name, version }) => {
            let discover_started = Instant::now();
            if show_progress {
                emit_progress_line("index", ProgressTone::Step, "discovering package target");
            }
            let packages = scan_all_packages_across_roots(&node_modules_roots)
                .map_err(|scan_err: ScanError| scan_err.to_string())?;
            let package = packages
                .into_iter()
                .find(|pkg| pkg.name.as_ref() == name && pkg.version.as_ref() == version)
                .ok_or_else(|| {
                    format!("package {name}@{version} not found in discovered node_modules roots")
                })?;
            if show_progress {
                emit_progress_line(
                    "index",
                    ProgressTone::Done,
                    &format!(
                        "target resolved +{}",
                        format_elapsed(discover_started.elapsed())
                    ),
                );
            }
            let opts = build_index_options(cli, file, &config_dir, project_root.clone(), bulk)?;
            let opts = with_plain_index_progress(opts, 1, show_progress);
            let index_tail_spinner = if show_progress {
                TtyProgressSpinner::try_start()
            } else {
                None
            };
            let out = pipeline::index_packages(std::slice::from_ref(&package), Some(opts));
            if let Some(spinner_handle) = index_tail_spinner {
                spinner_handle.finish();
            }
            print_index_summary(fmt, &out)?;
        }
        None => {
            let scan_started = Instant::now();
            if show_progress {
                emit_progress_line(
                    "index",
                    ProgressTone::Step,
                    "scanning and filtering packages",
                );
            }
            let mut opts = build_index_options(cli, file, &config_dir, project_root, bulk)?;
            opts.filter = opts
                .filter
                .with_nciignore_file(&config_dir)
                .with_workspace_manifest_dirs(workspace_manifest_dirs.clone());
            let packages = scan_filtered_packages_across_roots(&node_modules_roots, &opts)
                .map_err(|scan_err: ScanError| scan_err.to_string())?;
            if packages.is_empty() {
                match fmt {
                    OutputFormat::Plain => {
                        emit_ui_line_stdout(
                            ProgressTone::Warn,
                            "index",
                            &format!(
                                "no matching package found to index +{}",
                                format_elapsed(scan_started.elapsed())
                            ),
                        );
                        emit_ui_line_stdout(
                            ProgressTone::Note,
                            "index",
                            "check nci.config.json project_root/package filters, or verify the package is installed",
                        );
                        return Err(String::new());
                    }
                    OutputFormat::Json | OutputFormat::Jsonl => {
                        return emit_error(
                            fmt,
                            "nci index: no packages matched filters; check project_root/package filters or package installation",
                        );
                    }
                }
            }
            if show_progress {
                emit_progress_line(
                    "index",
                    ProgressTone::Done,
                    &format!(
                        "package set ready ({} package(s)) +{}",
                        packages.len(),
                        format_elapsed(scan_started.elapsed())
                    ),
                );
            }
            let opts = with_plain_index_progress(opts, packages.len(), show_progress);
            let index_tail_spinner = if show_progress {
                TtyProgressSpinner::try_start()
            } else {
                None
            };
            let indexed = pipeline::index_packages(&packages, Some(opts));
            if let Some(spinner_handle) = index_tail_spinner {
                spinner_handle.finish();
            }
            print_index_summary(fmt, &indexed)?;
        }
    }

    Ok(())
}

fn print_index_summary(
    fmt: OutputFormat,
    indexed: &[pipeline::IndexedGraph],
) -> Result<(), String> {
    let total_packages = indexed.len();
    let cached = indexed
        .iter()
        .filter(|indexed| indexed.source == GraphSource::Cached)
        .count();
    let indexed_now = indexed
        .iter()
        .filter(|indexed| indexed.source == GraphSource::Crawled && indexed.persisted)
        .count();
    let not_persisted = indexed
        .iter()
        .filter(|indexed| indexed.source == GraphSource::Crawled && !indexed.persisted)
        .count();
    match fmt {
        OutputFormat::Plain => {
            emit_ui_line_stdout(
                ProgressTone::Summary,
                "index",
                &format!(
                    "{total_packages} package(s) complete | cached={cached} indexed={indexed_now} not_persisted={not_persisted}"
                ),
            );
        }
        OutputFormat::Json | OutputFormat::Jsonl => {
            print_json(&serde_json::json!({
                "ok": true,
                "data": {
                    "total": total_packages,
                    "cached": cached,
                    "indexed": indexed_now,
                    "not_persisted": not_persisted,
                }
            }))?;
        }
    }
    Ok(())
}

fn build_symbol_search_filters(
    package_name: &Option<String>,
    package_version: &Option<String>,
    source_package_name: &Option<String>,
    kind_name: &Option<String>,
    file_path_contains: &Option<String>,
    public_only: bool,
) -> SymbolSearchFilters {
    SymbolSearchFilters {
        package_name: package_name.clone(),
        package_version: package_version.clone(),
        source_package_name: source_package_name.clone(),
        kind_name: kind_name.clone(),
        file_path_contains: file_path_contains.clone(),
        include_internal: !public_only,
    }
}

fn print_symbol_search_hits_plain(search_hits: &[SymbolSearchHit]) {
    for search_hit in search_hits {
        let source_version = search_hit
            .source
            .package_version
            .as_deref()
            .map(|version| format!("@{version}"))
            .unwrap_or_default();
        println!(
            "{} [{}] {}@{} source={}{} file={} id={}",
            search_hit.name,
            search_hit.kind_name,
            search_hit.package_name,
            search_hit.package_version,
            search_hit.source.package_name,
            source_version,
            search_hit.source.file_path,
            search_hit.id
        );
        if let Some(signature_snippet) = &search_hit.signature_snippet {
            println!("  signature: {signature_snippet}");
        }
    }
}

fn is_fts_syntax_error(error_text: &str) -> bool {
    error_text.contains("fts5: syntax error")
}

fn sanitize_fts_query(fts_query_text: &str) -> Option<String> {
    let tokens: Vec<String> = fts_query_text
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

fn print_no_symbol_hits_message(
    package_name: &Option<String>,
    package_version: &Option<String>,
    source_package_name: &Option<String>,
) {
    let package_hint = package_name
        .as_deref()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "<any>".to_string());
    let version_hint = package_version
        .as_deref()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "<any>".to_string());
    let source_hint = source_package_name
        .as_deref()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "<any>".to_string());
    println!(
        "No symbols matched. Check `--package`/`--package-version` scope and `--source-package` filter. current scope: package={package_hint} version={version_hint} source={source_hint}"
    );
}

fn run_query(cli: &Cli, command: &QueryCommands) -> Result<CliExit, String> {
    let context = resolve_command_context(None)?;
    let file = context.file.as_ref();
    let config_dir = context.config_dir.as_path();
    let fmt = envelope_output_format(effective_format(cli, file)?);
    let (_, database) = open_database(cli, file, config_dir)?;

    let exit = match command {
        QueryCommands::Find {
            limit,
            package_name,
            package_version,
            source_package_name,
            kind_name,
            file_path_contains,
            public_only,
            fts_query,
        } => {
            let filters = build_symbol_search_filters(
                package_name,
                package_version,
                source_package_name,
                kind_name,
                file_path_contains,
                *public_only,
            );
            let search_hits = match database.find_symbol_hits_fts(fts_query, &filters, *limit) {
                Ok(found_hits) => found_hits,
                Err(storage_error) => {
                    let error_text = storage_error.to_string();
                    if is_fts_syntax_error(&error_text) {
                        if let Some(sanitized_query) = sanitize_fts_query(fts_query) {
                            database
                                .find_symbol_hits_fts(&sanitized_query, &filters, *limit)
                                .map_err(|err| {
                                    format!(
                                        "{error_text} (fallback query `{sanitized_query}` failed: {err})"
                                    )
                                })?
                        } else {
                            Vec::new()
                        }
                    } else {
                        return Err(error_text);
                    }
                }
            };
            match fmt {
                OutputFormat::Plain => {
                    print_symbol_search_hits_plain(&search_hits);
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(
                        &serde_json::json!({ "ok": true, "data": { "symbols": search_hits } }),
                    )?;
                }
            }
            CliExit::Success
        }
        QueryCommands::Symbol {
            name,
            limit,
            package_name,
            package_version,
            source_package_name,
            kind_name,
            file_path_contains,
            public_only,
        } => {
            let filters = build_symbol_search_filters(
                package_name,
                package_version,
                source_package_name,
                kind_name,
                file_path_contains,
                *public_only,
            );
            let search_hits = database
                .find_symbol_hits_exact_name(name, &filters, *limit)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    if search_hits.is_empty() {
                        print_no_symbol_hits_message(
                            package_name,
                            package_version,
                            source_package_name,
                        );
                    } else {
                        print_symbol_search_hits_plain(&search_hits);
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(
                        &serde_json::json!({ "ok": true, "data": { "symbols": search_hits } }),
                    )?;
                }
            }
            CliExit::Success
        }
        QueryCommands::Show { id } => {
            let search_hit = database
                .load_symbol_search_hit_by_stable_id(id)
                .map_err(|err| err.to_string())?;
            let miss = search_hit.is_none();
            let hint_text = not_found_hint(id);
            match fmt {
                OutputFormat::Plain => {
                    if let Some(ref hit) = search_hit {
                        print_symbol_search_hits_plain(std::slice::from_ref(hit));
                    } else {
                        emit_ui_line_stdout(ProgressTone::Note, "query show", &hint_text);
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    if miss {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "data": { "symbol": serde_json::Value::Null },
                            "hint": hint_text,
                        }))?;
                    } else {
                        print_json(
                            &serde_json::json!({ "ok": true, "data": { "symbol": search_hit } }),
                        )?;
                    }
                }
            }
            if miss {
                CliExit::QueryNotFound
            } else {
                CliExit::Success
            }
        }
        QueryCommands::Overloads { id } => {
            let siblings = database
                .find_overload_siblings_by_stable_id(id)
                .map_err(|err| err.to_string())?;
            let miss = siblings.is_empty();
            let hint_text = not_found_hint(id);
            match fmt {
                OutputFormat::Plain => {
                    if miss {
                        emit_ui_line_stdout(ProgressTone::Note, "query overloads", &hint_text);
                    } else {
                        emit_ui_line_stdout(
                            ProgressTone::Summary,
                            "query overloads",
                            &format!("{} sibling row(s)", siblings.len()),
                        );
                        print_symbol_search_hits_plain(&siblings);
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    if miss {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "data": { "symbols": siblings },
                            "hint": hint_text,
                        }))?;
                    } else {
                        print_json(
                            &serde_json::json!({ "ok": true, "data": { "symbols": siblings } }),
                        )?;
                    }
                }
            }
            if miss {
                CliExit::QueryNotFound
            } else {
                CliExit::Success
            }
        }
        QueryCommands::Snippet { id } => {
            let snippet = database
                .load_symbol_snippet_by_stable_id(id)
                .map_err(|err| err.to_string())?;
            let miss = snippet.is_none();
            let hint_text = not_found_hint(id);
            match fmt {
                OutputFormat::Plain => match snippet.as_ref() {
                    Some(snippet_row) => {
                        if let Some(signature_text) = &snippet_row.signature {
                            println!("{signature_text}");
                        }
                        if let Some(js_doc_text) = &snippet_row.js_doc
                            && !js_doc_text.trim().is_empty()
                        {
                            if io::stdout().is_terminal() {
                                println!();
                            }
                            println!("{js_doc_text}");
                        }
                    }
                    None => {
                        emit_ui_line_stdout(ProgressTone::Note, "query snippet", &hint_text);
                    }
                },
                OutputFormat::Json | OutputFormat::Jsonl => {
                    if miss {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "data": { "snippet": serde_json::Value::Null },
                            "hint": hint_text,
                        }))?;
                    } else {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "data": { "snippet": snippet }
                        }))?;
                    }
                }
            }
            if miss {
                CliExit::QueryNotFound
            } else {
                CliExit::Success
            }
        }
        QueryCommands::Packages => {
            let rows = database
                .list_indexed_packages()
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    for (name, ver) in rows {
                        println!("{name}\t{ver}");
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    let list: Vec<_> = rows
                        .into_iter()
                        .map(|(pkg_name, pkg_version)| {
                            serde_json::json!({ "name": pkg_name, "version": pkg_version })
                        })
                        .collect();
                    print_json(&serde_json::json!({ "ok": true, "data": { "packages": list } }))?;
                }
            }
            CliExit::Success
        }
        QueryCommands::PackageVersions { name } => {
            let versions = database
                .list_package_versions(name)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    if versions.is_empty() {
                        emit_ui_line_stdout(
                            ProgressTone::Note,
                            "query package-versions",
                            &format!("no indexed versions found for {name}"),
                        );
                    } else {
                        emit_ui_line_stdout(
                            ProgressTone::Summary,
                            "query package-versions",
                            &format!("{} version(s) found for {name}", versions.len()),
                        );
                        for version in versions {
                            println!("{version}");
                        }
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": { "name": name, "versions": versions }
                    }))?;
                }
            }
            CliExit::Success
        }
        QueryCommands::PackageDeps { name, version } => {
            let dependency_names = database
                .list_package_dependencies(name, version)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    if dependency_names.is_empty() {
                        emit_ui_line_stdout(
                            ProgressTone::Note,
                            "query package-deps",
                            &format!("no declared dependencies found for {name}@{version}"),
                        );
                    } else {
                        emit_ui_line_stdout(
                            ProgressTone::Summary,
                            "query package-deps",
                            &format!(
                                "{} declared dependency name(s) found for {name}@{version}",
                                dependency_names.len()
                            ),
                        );
                        for dependency_name in dependency_names {
                            println!("{dependency_name}");
                        }
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": {
                            "name": name,
                            "version": version,
                            "dependencies": dependency_names,
                        }
                    }))?;
                }
            }
            CliExit::Success
        }
        QueryCommands::SourcePackages { name, version } => {
            let source_packages = database
                .list_source_packages_for_indexed_package(name, version)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    for source_package in source_packages {
                        println!("{source_package}");
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(
                        &serde_json::json!({ "ok": true, "data": { "source_packages": source_packages } }),
                    )?;
                }
            }
            CliExit::Success
        }
        QueryCommands::ActivePackage { name } => {
            let package_manager = detect_project_package_manager(
                context.project_root.as_path(),
                Some(context.config_dir.as_path()),
            );
            let include_root_workspace = resolve_index_root_workspace_config_only(file);
            ensure_index_root_workspace_valid(file, include_root_workspace)?;
            let workspace_dirs = collect_unique_workspace_dirs(&context.project_root, file);
            let node_modules_roots = collect_node_modules_roots(
                &context.project_root,
                &workspace_dirs,
                include_root_workspace,
            );
            if node_modules_roots.is_empty() {
                return emit_error(
                    fmt,
                    &format!(
                        "no node_modules directories found under {}",
                        context.project_root.display()
                    ),
                )
                .map(|_| CliExit::Success);
            }
            let indexed_versions: HashSet<String> = database
                .list_package_versions(name)
                .map_err(|err| err.to_string())?
                .into_iter()
                .collect();
            let candidates =
                resolve_active_package_candidates(name, &node_modules_roots, &indexed_versions)?;
            let selected = candidates.first().cloned();
            let alternates = if candidates.len() > 1 {
                candidates[1..].to_vec()
            } else {
                Vec::new()
            };
            match fmt {
                OutputFormat::Plain => {
                    println!("package_manager: {package_manager}");
                    if let Some(active) = selected {
                        emit_ui_line_stdout(
                            ProgressTone::Summary,
                            "query active-package",
                            &format!(
                                "selected {}@{} (indexed={})",
                                active.package_name, active.package_version, active.indexed
                            ),
                        );
                        println!("node_modules: {}", active.node_modules_root);
                        println!("package_dir: {}", active.package_dir);
                        if !alternates.is_empty() {
                            emit_ui_line_stdout(
                                ProgressTone::Note,
                                "query active-package",
                                &format!("{} alternate install(s) found", alternates.len()),
                            );
                            for alternate in alternates {
                                println!(
                                    "{}@{}\tindexed={}\tnode_modules={}\tpackage_dir={}",
                                    alternate.package_name,
                                    alternate.package_version,
                                    alternate.indexed,
                                    alternate.node_modules_root,
                                    alternate.package_dir
                                );
                            }
                        }
                    } else {
                        emit_ui_line_stdout(
                            ProgressTone::Note,
                            "query active-package",
                            &format!(
                                "no installed matches for {name}; check project_root/workspaces context"
                            ),
                        );
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": {
                            "name": name,
                            "packageManager": package_manager,
                            "selected": selected,
                            "alternates": alternates,
                            "count": candidates.len(),
                        }
                    }))?;
                }
            }
            CliExit::Success
        }
        QueryCommands::Symbols {
            name,
            version,
            limit,
            offset,
        } => {
            let (total_symbols, symbols) = database
                .list_package_symbols_page(name, version, *limit, *offset)
                .map_err(|err| err.to_string())?;
            match fmt {
                OutputFormat::Plain => {
                    emit_ui_line_stdout(
                        ProgressTone::Summary,
                        "query symbols",
                        &format!(
                            "showing {} of {} symbols (offset {}, limit {})",
                            symbols.len(),
                            total_symbols,
                            offset,
                            limit
                        ),
                    );
                    for symbol in symbols {
                        println!("{}", symbol.name);
                    }
                }
                OutputFormat::Json | OutputFormat::Jsonl => {
                    print_json(&serde_json::json!({
                        "ok": true,
                        "data": {
                            "name": name,
                            "version": version,
                            "total": total_symbols,
                            "offset": offset,
                            "limit": limit,
                            "symbols": symbols,
                        }
                    }))?;
                }
            }
            CliExit::Success
        }
        QueryCommands::Evidence {
            package_name,
            package_version,
            source_package_name,
            symbols,
            phrases,
            kind_name,
            public_only,
            limit,
            snippet_limit,
        } => {
            run_query_evidence(
                &database,
                fmt,
                EvidenceQueryRequest {
                    package_name,
                    package_version: package_version.as_deref(),
                    source_package_name: source_package_name.as_deref(),
                    symbols,
                    phrases,
                    kind_name: kind_name.as_deref(),
                    public_only: *public_only,
                    limit: *limit,
                    snippet_limit: *snippet_limit,
                },
            )?;
            CliExit::Success
        }
    };
    Ok(exit)
}

struct EvidenceQueryRequest<'a> {
    package_name: &'a str,
    package_version: Option<&'a str>,
    source_package_name: Option<&'a str>,
    symbols: &'a [String],
    phrases: &'a [String],
    kind_name: Option<&'a str>,
    public_only: bool,
    limit: usize,
    snippet_limit: Option<usize>,
}

/// Sentinel marker placed as the trailing element of `data.symbols` when the combined
/// search produced more hits than `--limit`. The agent / consumer detects truncation by
/// looking for `kind_name == "<truncated>"` in the last hit — no new envelope key.
const EVIDENCE_TRUNCATED_MARKER: &str = "<truncated>";

fn build_evidence_filters(request: &EvidenceQueryRequest<'_>) -> SymbolSearchFilters {
    SymbolSearchFilters {
        package_name: Some(request.package_name.to_string()),
        package_version: request.package_version.map(|version| version.to_string()),
        source_package_name: request
            .source_package_name
            .map(|source_package| source_package.to_string()),
        kind_name: request.kind_name.map(|kind| kind.to_string()),
        file_path_contains: None,
        include_internal: !request.public_only,
    }
}

/// Sentinel hit appended to the symbols array when results were truncated.
/// Empty/zero everywhere except the three fields that carry the marker.
fn build_evidence_truncation_sentinel() -> SymbolSearchHit {
    SymbolSearchHit {
        symbol_row_id: 0,
        id: EVIDENCE_TRUNCATED_MARKER.to_string(),
        name: EVIDENCE_TRUNCATED_MARKER.to_string(),
        kind_name: EVIDENCE_TRUNCATED_MARKER.to_string(),
        package_name: String::new(),
        package_version: String::new(),
        source: nci_engine::storage::SymbolSourceIdentity {
            package_name: String::new(),
            package_version: None,
            file_path: String::new(),
        },
        file_path: String::new(),
        signature_snippet: None,
        is_internal: false,
    }
}

fn run_query_evidence(
    database: &NciDatabase,
    fmt: OutputFormat,
    request: EvidenceQueryRequest<'_>,
) -> Result<(), String> {
    if request.limit == 0 {
        return emit_error(fmt, "evidence: --limit must be at least 1");
    }
    if request.symbols.is_empty() && request.phrases.is_empty() {
        return emit_error(
            fmt,
            "evidence: provide at least one --symbol or --phrase anchor",
        );
    }

    let filters = build_evidence_filters(&request);
    // Over-fetch by 1 per anchor so we can detect truncation without a count query.
    let per_anchor_cap = request.limit.saturating_add(1);

    let mut combined_hits: Vec<SymbolSearchHit> = Vec::new();
    let mut seen_stable_ids: HashSet<String> = HashSet::new();
    let mut anchor_summaries: Vec<serde_json::Value> = Vec::new();
    let mut empty_anchors: Vec<String> = Vec::new();

    for symbol_anchor in request.symbols {
        let exact_hits = database
            .find_symbol_hits_exact_name(symbol_anchor, &filters, per_anchor_cap)
            .map_err(|err| err.to_string())?;
        anchor_summaries.push(serde_json::json!({
            "anchor": symbol_anchor,
            "match": "exact",
            "hits": exact_hits.len(),
        }));
        if exact_hits.is_empty() {
            empty_anchors.push(format!("symbol:{symbol_anchor}"));
        }
        push_unique_hits(&mut combined_hits, &mut seen_stable_ids, exact_hits);
    }

    for phrase_anchor in request.phrases {
        let mut fts_hits = match database.find_symbol_hits_fts(
            phrase_anchor,
            &filters,
            per_anchor_cap,
        ) {
            Ok(hits) => hits,
            Err(storage_error) => {
                let error_text = storage_error.to_string();
                if is_fts_syntax_error(&error_text) {
                    if let Some(sanitized_query) = sanitize_fts_query(phrase_anchor) {
                        database
                                .find_symbol_hits_fts(&sanitized_query, &filters, per_anchor_cap)
                                .map_err(|err| {
                                    format!(
                                        "{error_text} (fallback query `{sanitized_query}` failed: {err})"
                                    )
                                })?
                    } else {
                        Vec::new()
                    }
                } else {
                    return Err(error_text);
                }
            }
        };
        anchor_summaries.push(serde_json::json!({
            "anchor": phrase_anchor,
            "match": "fts",
            "hits": fts_hits.len(),
        }));
        if fts_hits.is_empty() {
            empty_anchors.push(format!("phrase:{phrase_anchor}"));
        }
        // Move into `push_unique_hits` to avoid an extra clone.
        let drained: Vec<SymbolSearchHit> = std::mem::take(&mut fts_hits);
        push_unique_hits(&mut combined_hits, &mut seen_stable_ids, drained);
    }

    let total_unique_hits = combined_hits.len();
    let truncated = total_unique_hits > request.limit;
    if truncated {
        combined_hits.truncate(request.limit);
    }

    let snippet_cap = request
        .snippet_limit
        .map(|cap| cap.min(combined_hits.len()))
        .unwrap_or(combined_hits.len());
    let snippet_ids: Vec<String> = combined_hits
        .iter()
        .take(snippet_cap)
        .map(|hit| hit.id.clone())
        .collect();
    let snippets_map = database
        .load_symbol_snippets_by_stable_ids(&snippet_ids)
        .map_err(|err| err.to_string())?;

    if truncated {
        combined_hits.push(build_evidence_truncation_sentinel());
    }

    match fmt {
        OutputFormat::Plain => {
            emit_ui_line_stdout(
                ProgressTone::Summary,
                "query evidence",
                &format!(
                    "{} hit(s){}{} (snippets: {})",
                    if truncated {
                        combined_hits.len() - 1
                    } else {
                        combined_hits.len()
                    },
                    if truncated {
                        format!(" of >{} (truncated)", request.limit)
                    } else {
                        String::new()
                    },
                    if !empty_anchors.is_empty() {
                        format!(", empty anchors: {}", empty_anchors.join(", "))
                    } else {
                        String::new()
                    },
                    snippet_ids
                        .iter()
                        .filter(|id| snippets_map.contains_key(*id))
                        .count(),
                ),
            );
            for hit in &combined_hits {
                if hit.kind_name == EVIDENCE_TRUNCATED_MARKER {
                    println!(
                        "{marker}\t(more results exist; raise --limit or narrow filters)",
                        marker = EVIDENCE_TRUNCATED_MARKER,
                    );
                    continue;
                }
                let source_version = hit
                    .source
                    .package_version
                    .as_deref()
                    .map(|version| format!("@{version}"))
                    .unwrap_or_default();
                println!(
                    "{name} [{kind}] {pkg}@{ver} source={src}{src_ver} file={file} id={id}",
                    name = hit.name,
                    kind = hit.kind_name,
                    pkg = hit.package_name,
                    ver = hit.package_version,
                    src = hit.source.package_name,
                    src_ver = source_version,
                    file = hit.source.file_path,
                    id = hit.id,
                );
                if let Some(snippet) = snippets_map.get(&hit.id) {
                    if let Some(signature_text) = &snippet.signature {
                        println!("  signature: {signature_text}");
                    }
                    if let Some(js_doc_text) = &snippet.js_doc
                        && !js_doc_text.trim().is_empty()
                    {
                        println!("  jsdoc: {js_doc_text}");
                    }
                }
            }
        }
        OutputFormat::Json | OutputFormat::Jsonl => {
            let snippets_json = serde_json::Map::from_iter(snippet_ids.iter().filter_map(|id| {
                snippets_map.get(id).map(|snippet| {
                    (
                        id.clone(),
                        serde_json::to_value(snippet).unwrap_or_default(),
                    )
                })
            }));
            print_json(&serde_json::json!({
                "ok": true,
                "data": {
                    "package": {
                        "name": request.package_name,
                        "version": request.package_version,
                        "sourcePackage": request.source_package_name,
                    },
                    "limit": request.limit,
                    "anchors": anchor_summaries,
                    "emptyAnchors": empty_anchors,
                    "symbols": combined_hits,
                    "snippets": snippets_json,
                }
            }))?;
        }
    }
    Ok(())
}

fn push_unique_hits(
    combined: &mut Vec<SymbolSearchHit>,
    seen_stable_ids: &mut HashSet<String>,
    new_hits: Vec<SymbolSearchHit>,
) {
    for hit in new_hits {
        if seen_stable_ids.insert(hit.id.clone()) {
            combined.push(hit);
        }
    }
}

fn tsv_cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => text.replace(['\t', '\n', '\r'], " ").to_string(),
        Value::Array(_) | Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn write_plain_sql_row(
    out: &mut impl Write,
    keys: &[String],
    row: &serde_json::Map<String, Value>,
) -> Result<(), StorageError> {
    let line: Vec<String> = keys
        .iter()
        .map(|key| tsv_cell(row.get(key).unwrap_or(&Value::Null)))
        .collect();
    writeln!(out, "{}", line.join("\t")).map_err(|err| StorageError::SqlOutput(err.to_string()))
}

fn run_sql(
    cli: &Cli,
    schema: bool,
    sql_flag: Option<String>,
    sql_parts: &[String],
    max_rows: Option<usize>,
) -> Result<(), String> {
    let context = resolve_command_context(None)?;
    let file = context.file.as_ref();
    let config_dir = context.config_dir.as_path();
    let rows_fmt = sql_rows_format(cli, file)?;
    let path = resolve_database_path(cli, file, config_dir)?;

    let database = NciDatabase::open_read_only(&path).map_err(|err| err.to_string())?;

    if schema {
        let text = database
            .nci_filtered_schema_sql()
            .map_err(|err| err.to_string())?;
        println!("{text}");
        return Ok(());
    }

    let merged_trailing = if sql_parts.is_empty() {
        None
    } else {
        Some(sql_parts.join(" "))
    };
    let sql = sql_flag
        .clone()
        .or(merged_trailing)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            "nci sql: provide SQL via -c/--command or trailing arguments, or use --schema (see --help)"
                .to_string()
        })?;

    let stdout = io::stdout();
    let mut out = stdout.lock();
    let mut json_array_open = false;

    let summary = database
        .for_each_readonly_sql_row(&sql, max_rows, |column_keys, row_obj| {
            match rows_fmt {
                SqlRowsFormat::Plain => write_plain_sql_row(&mut out, column_keys, &row_obj)?,
                SqlRowsFormat::Jsonl => {
                    serde_json::to_writer(&mut out, &row_obj)
                        .map_err(|err| StorageError::SqlOutput(err.to_string()))?;
                    writeln!(&mut out).map_err(|err| StorageError::SqlOutput(err.to_string()))?;
                }
                SqlRowsFormat::Json => {
                    if !json_array_open {
                        write!(&mut out, "[")
                            .map_err(|err| StorageError::SqlOutput(err.to_string()))?;
                        json_array_open = true;
                    } else {
                        write!(&mut out, ",")
                            .map_err(|err| StorageError::SqlOutput(err.to_string()))?;
                    }
                    serde_json::to_writer(&mut out, &row_obj)
                        .map_err(|err| StorageError::SqlOutput(err.to_string()))?;
                }
            }
            Ok(())
        })
        .map_err(|err| err.to_string())?;

    if rows_fmt == SqlRowsFormat::Json {
        if json_array_open {
            writeln!(&mut out, "]").map_err(|err| err.to_string())?;
        } else {
            writeln!(&mut out, "[]").map_err(|err| err.to_string())?;
        }
    }

    drop(out);

    if summary.truncated {
        return Err(format!(
            "nci sql: output truncated (--max-rows {}); more rows existed",
            max_rows.expect("truncation requires --max-rows")
        ));
    }

    Ok(())
}
