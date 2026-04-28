//! Versioned DDL for `NciDatabase`.
//! [`Migration::version`] values. [`SCHEMA_VERSION`] is always the last migration’s version.
use rusqlite::{Connection, OptionalExtension};

pub(crate) const META_SCHEMA_KEY: &str = "schema_version";

pub(crate) struct Migration {
    pub(crate) version: u32,
    pub(crate) sql: &'static str,
}

pub(crate) const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    sql: r#"
CREATE TABLE IF NOT EXISTS nci_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
    package_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    total_symbols INTEGER NOT NULL,
    total_files INTEGER NOT NULL,
    crawl_duration_ms INTEGER NOT NULL,
    build_duration_ms INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
    engine_version TEXT NOT NULL,
    UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_packages_indexed_at ON packages(indexed_at);

CREATE TABLE IF NOT EXISTS symbols (
    symbol_id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES packages(package_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind INTEGER NOT NULL,
    kind_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    signature TEXT,
    js_doc TEXT,
    is_type_only INTEGER NOT NULL DEFAULT 0,
    symbol_space TEXT NOT NULL DEFAULT 'value',
    re_exported_from TEXT,
    deprecated_flag INTEGER NOT NULL DEFAULT 0,
    deprecated_message TEXT,
    visibility TEXT,
    since_tag TEXT,
    since_major INTEGER,
    since_minor INTEGER,
    since_patch INTEGER,
    is_internal INTEGER NOT NULL DEFAULT 0,
    is_global_augmentation INTEGER NOT NULL DEFAULT 0,
    is_inherited INTEGER NOT NULL DEFAULT 0,
    parent_symbol_id TEXT,
    enclosing_module_declaration_id TEXT,
    merge_provenance_json TEXT,
    UNIQUE(package_id, id)
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_package ON symbols(package_id);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

CREATE INDEX IF NOT EXISTS idx_symbols_since_semver ON symbols(since_major, since_minor, since_patch);

CREATE INDEX IF NOT EXISTS idx_symbols_deprecated ON symbols(deprecated_flag)
    WHERE deprecated_flag != 0;

CREATE TABLE IF NOT EXISTS symbol_dependencies (
    from_symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    to_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(from_symbol_id, to_symbol_id_text)
);

CREATE TABLE IF NOT EXISTS symbol_surface_dependencies (
    from_symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    to_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(from_symbol_id, to_symbol_id_text)
);

CREATE TABLE IF NOT EXISTS package_dependencies (
    package_id INTEGER NOT NULL REFERENCES packages(package_id) ON DELETE CASCADE,
    dependency_name TEXT NOT NULL,
    PRIMARY KEY(package_id, dependency_name)
);

CREATE INDEX IF NOT EXISTS idx_package_dependencies_name
    ON package_dependencies(dependency_name);

CREATE TABLE IF NOT EXISTS symbol_inherited_from_sources (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    source_symbol_id_text TEXT NOT NULL,
    PRIMARY KEY(symbol_id, source_symbol_id_text)
);

CREATE INDEX IF NOT EXISTS idx_symbol_inherited_from_sources_source
    ON symbol_inherited_from_sources(source_symbol_id_text);

CREATE TABLE IF NOT EXISTS symbol_additional_files (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    PRIMARY KEY(symbol_id, file_path)
);

CREATE TABLE IF NOT EXISTS symbol_heritage (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    heritage TEXT NOT NULL,
    PRIMARY KEY(symbol_id, heritage)
);

CREATE TABLE IF NOT EXISTS symbol_modifiers (
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    modifier TEXT NOT NULL,
    PRIMARY KEY(symbol_id, modifier)
);

CREATE TABLE IF NOT EXISTS symbol_decorators (
    decorator_id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    arguments TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbol_decorators_symbol ON symbol_decorators(symbol_id);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
    name,
    signature,
    js_doc,
    content='symbols',
    content_rowid='symbol_id'
);

-- No symbols_ai: FTS rows for new symbols are populated in save_package via INSERT...SELECT.
DROP TRIGGER IF EXISTS symbols_ai;
DROP TRIGGER IF EXISTS symbols_ad;
DROP TRIGGER IF EXISTS symbols_au;

CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, js_doc)
  VALUES('delete', old.symbol_id, old.name, COALESCE(old.signature, ''), COALESCE(old.js_doc, ''));
END;

CREATE TRIGGER symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, js_doc)
  VALUES('delete', old.symbol_id, old.name, COALESCE(old.signature, ''), COALESCE(old.js_doc, ''));
  INSERT INTO symbols_fts(rowid, name, signature, js_doc)
  VALUES (
    new.symbol_id,
    new.name,
    COALESCE(new.signature, ''),
    COALESCE(new.js_doc, '')
  );
END;
"#,
}];

const fn highest_migration_version(migrations: &[Migration]) -> u32 {
    if migrations.is_empty() {
        0
    } else {
        migrations[migrations.len() - 1].version
    }
}

/// Highest migration number this crate applies — same as the last [`Migration::version`] in [`MIGRATIONS`].
pub const SCHEMA_VERSION: u32 = highest_migration_version(MIGRATIONS);

pub(crate) fn read_schema_version(connection: &Connection) -> rusqlite::Result<u32> {
    let value_opt: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_SCHEMA_KEY],
            |meta_row| meta_row.get(0),
        )
        .optional()?;
    Ok(value_opt
        .as_deref()
        .and_then(|version_text| version_text.parse().ok())
        .unwrap_or(0))
}
