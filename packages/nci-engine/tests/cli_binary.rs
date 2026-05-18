//! Integration tests for the `nci` binary.
//!
//! **Build / run:** this crate sets `required-features = ["test-support"]` on this test target.
//! The `nci` binary must be built with that feature or backfill integration tests hang or fail
//! (`TEST_PENDING_BACKFILL_VERSION` has no registered step). Always use:
//! `cargo test -p nci-engine --features test-support --test cli_binary`
//! (or `cargo test -p nci-engine --features test-support` for all engine tests).

use std::fs;
use std::path::Path;

use assert_cmd::Command;
use nci_engine::{
    META_PENDING_BACKFILL_KEY, TEST_PENDING_BACKFILL_VERSION, index_engine_cache_key,
};
use predicates::prelude::*;
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
use tempfile::tempdir;

fn nci_cmd() -> Command {
    Command::cargo_bin("nci").expect("nci binary present")
}

#[test]
fn init_y_writes_nci_config_json_and_db() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("idx.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    assert!(proj.path().join("nci.config.json").is_file());
    assert!(db_path.is_file());
}

#[test]
fn db_status_json_ok_envelope() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("st.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "status",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"ok\": true"))
        .stdout(predicate::str::contains("schema_version"))
        .stdout(predicate::str::contains("indexer_output_revision"))
        .stdout(predicate::str::contains("engine_version"));
}

#[test]
fn query_json_requires_db() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("q.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "packages",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"ok\": true"));
}

#[test]
fn index_dry_run_empty_node_modules() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("dry.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "--dry-run",
            "--format",
            "json",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"packages\""));
}

#[test]
fn binary_path_prints_running_executable() {
    let out = nci_cmd()
        .arg("binary-path")
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let line = String::from_utf8(out).expect("utf8 stdout");
    let path = line.trim();
    assert!(!path.is_empty(), "binary-path stdout empty");
    assert!(
        Path::new(path).is_file(),
        "binary-path should print a file path: {path:?}"
    );
}

#[test]
fn which_alias_prints_same_as_binary_path() {
    let a = nci_cmd()
        .arg("binary-path")
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let b = nci_cmd()
        .arg("which")
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    assert_eq!(a, b);
}

fn write_minimal_pkg(root: &Path, name: &str, version: &str) {
    let pkg = root.join("node_modules").join(name);
    write_minimal_pkg_at(&pkg, name, version);
}

fn write_minimal_pkg_at(pkg: &Path, name: &str, version: &str) {
    fs::create_dir_all(pkg).unwrap();
    fs::write(
        pkg.join("package.json"),
        format!(r#"{{"name":"{name}","version":"{version}","types":"./index.d.ts"}}"#),
    )
    .unwrap();
    fs::write(pkg.join("index.d.ts"), "export declare const x: number;\n").unwrap();
}

fn write_consumer_package_json(proj_root: &Path, dependencies: &str, dev_dependencies: &str) {
    fs::write(
        proj_root.join("package.json"),
        format!(
            r#"{{"name":"consumer-root","version":"1.0.0","dependencies":{dependencies},"devDependencies":{dev_dependencies}}}"#
        ),
    )
    .unwrap();
}

fn seed_indexed_package_row(db_path: &Path, package_name: &str, package_version: &str) {
    let connection = Connection::open(db_path).expect("open sqlite");
    connection
        .execute(
            "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
             VALUES (?1, ?2, 0, 0, 0, 0, 'test', 1)",
            [package_name, package_version],
        )
        .expect("insert package");
}

fn init_db_path(proj: &Path, cache: &Path) -> std::path::PathBuf {
    let db_path = cache.join("cli.sqlite");
    nci_cmd()
        .current_dir(proj)
        .env("NCI_CACHE_DIR", cache)
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();
    db_path
}

fn set_pending_backfill_meta(db_path: &Path, backfill_version: u32) {
    let connection = Connection::open(db_path).expect("open sqlite");
    connection
        .execute(
            "INSERT OR REPLACE INTO nci_meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![META_PENDING_BACKFILL_KEY, backfill_version.to_string()],
        )
        .expect("pending meta");
}

fn seed_package_with_backfill_revision(
    db_path: &Path,
    package_name: &str,
    package_version: &str,
    backfill_revision: u32,
) {
    seed_package_with_cache_and_backfill_revision(
        db_path,
        package_name,
        package_version,
        index_engine_cache_key(&[]).as_str(),
        backfill_revision,
    );
}

fn seed_package_with_cache_and_backfill_revision(
    db_path: &Path,
    package_name: &str,
    package_version: &str,
    index_cache_key: &str,
    backfill_revision: u32,
) {
    let connection = Connection::open(db_path).expect("open sqlite");
    connection
        .execute(
            "INSERT INTO packages (name, version, total_symbols, total_files, crawl_duration_ms, build_duration_ms, index_cache_key, backfill_revision)
             VALUES (?1, ?2, 0, 0, 0, 0, ?3, ?4)",
            rusqlite::params![
                package_name,
                package_version,
                index_cache_key,
                backfill_revision as i64
            ],
        )
        .expect("insert package");
}

fn count_packages_below_backfill_revision(db_path: &Path, backfill_version: u32) -> i64 {
    let connection = Connection::open(db_path).expect("open sqlite");
    connection
        .query_row(
            "SELECT COUNT(*) FROM packages WHERE backfill_revision < ?1",
            [backfill_version],
            |row| row.get(0),
        )
        .expect("count")
}

fn write_pkg_with_dependencies(
    root: &Path,
    name: &str,
    version: &str,
    dependencies_json: &str,
    peer_dependencies_json: &str,
) {
    let pkg = root.join("node_modules").join(name);
    fs::create_dir_all(&pkg).unwrap();
    fs::write(
        pkg.join("package.json"),
        format!(
            r#"{{
"name":"{name}",
"version":"{version}",
"types":"./index.d.ts",
"dependencies": {dependencies_json},
"peerDependencies": {peer_dependencies_json}
}}"#
        ),
    )
    .unwrap();
    fs::write(pkg.join("index.d.ts"), "export declare const x: number;\n").unwrap();
}

#[test]
fn index_dry_run_scans_workspace_node_modules_from_config() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-a");
    fs::create_dir_all(workspace_dir.join("node_modules")).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();

    write_minimal_pkg(proj.path(), "root-pkg", "1.0.0");
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("workspace-pkg"),
        "workspace-pkg",
        "1.0.0",
    );

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*"]
}"#,
    )
    .unwrap();

    nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"root-pkg\""))
        .stdout(predicate::str::contains("\"workspace-pkg\""));
}

#[test]
fn index_errors_when_omitting_root_without_workspaces_config() {
    let proj = tempdir().unwrap();
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{"index_root_workspace": false}"#,
    )
    .unwrap();
    nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("workspaces"));
}

#[test]
fn index_errors_when_skip_root_workspace_cli_without_workspaces() {
    let proj = tempdir().unwrap();
    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--skip-root-workspace",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("workspaces"));
}

#[test]
fn index_dry_run_skip_root_workspace_excludes_root_node_modules() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-skip");
    fs::create_dir_all(workspace_dir.join("node_modules")).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();

    write_minimal_pkg(proj.path(), "root-only", "1.0.0");
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("workspace-only"),
        "workspace-only",
        "1.0.0",
    );

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*"],
  "index_root_workspace": false
}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("valid json");
    let roots = parsed["data"]["node_modules_roots"]
        .as_array()
        .expect("node_modules_roots array");
    assert!(
        roots.len() == 1,
        "expected single workspace node_modules root, got {roots:?}"
    );
    let root_path = roots[0].as_str().unwrap();
    assert!(
        root_path
            .replace('\\', "/")
            .contains("packages/app-skip/node_modules"),
        "unexpected root path {root_path:?}"
    );

    let packages_text = String::from_utf8(output).unwrap();
    assert!(packages_text.contains("\"workspace-only\""));
    assert!(!packages_text.contains("\"root-only\""));
}

#[test]
fn index_dry_run_skip_root_workspace_cli_overrides_config_true() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-cli");
    fs::create_dir_all(workspace_dir.join("node_modules")).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();

    write_minimal_pkg(proj.path(), "root-cli", "1.0.0");
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("ws-cli"),
        "ws-cli",
        "1.0.0",
    );

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*"],
  "index_root_workspace": true
}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--skip-root-workspace",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let packages_text = String::from_utf8(output).unwrap();
    assert!(packages_text.contains("\"ws-cli\""));
    assert!(!packages_text.contains("\"root-cli\""));
}

#[test]
fn query_package_versions_lists_versions_for_name() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("versions.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    seed_indexed_package_row(&db_path, "demo-pkg", "1.0.0");
    seed_indexed_package_row(&db_path, "demo-pkg", "2.0.0");

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "package-versions",
            "demo-pkg",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("1.0.0"))
        .stdout(predicate::str::contains("2.0.0"));
}

#[test]
fn db_remove_missing_version_shows_available_versions_hint() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("remove.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    seed_indexed_package_row(&db_path, "demo-pkg", "1.0.0");
    seed_indexed_package_row(&db_path, "demo-pkg", "1.1.0");

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "--database",
            db_path.to_str().unwrap(),
            "remove",
            "demo-pkg",
            "9.9.9",
            "-y",
        ])
        .assert()
        .failure()
        .stdout(predicate::str::contains(
            "indexed versions for demo-pkg: 1.0.0, 1.1.0",
        ));
}

#[test]
fn db_clear_requires_yes_in_non_interactive_mode() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("clear-confirm.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args(["db", "--database", db_path.to_str().unwrap(), "clear"])
        .assert()
        .failure()
        .stdout(predicate::str::contains(
            "[!] db clear: confirmation required",
        ));
}

#[test]
fn query_package_deps_lists_declared_package_dependencies() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("deps.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_pkg_with_dependencies(
        proj.path(),
        "deps-pkg",
        "1.2.3",
        r#"{"react":"^19.2.0"}"#,
        r#"{"@types/node":"^22.0.0"}"#,
    );

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "deps-pkg",
            "1.2.3",
        ])
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "package-deps",
            "deps-pkg",
            "1.2.3",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("@types/node"))
        .stdout(predicate::str::contains("react"));
}

fn write_pkg_with_overloaded_method(root: &Path, name: &str, version: &str) {
    let pkg = root.join("node_modules").join(name);
    fs::create_dir_all(&pkg).unwrap();
    fs::write(
        pkg.join("package.json"),
        format!(r#"{{"name":"{name}","version":"{version}","types":"./index.d.ts"}}"#),
    )
    .unwrap();
    fs::write(
        pkg.join("index.d.ts"),
        "export interface Dual {\n  pick(): void;\n  pick(n: number): void;\n}\n",
    )
    .unwrap();
}

#[test]
fn query_overloads_returns_sibling_overload_rows_for_member_signature() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("overloads.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_pkg_with_overloaded_method(proj.path(), "ovl-pkg", "1.0.0");

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "ovl-pkg",
            "1.0.0",
        ])
        .assert()
        .success();

    let stable_id = "ovl-pkg@1.0.0::Dual.pick";

    let json_output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "overloads",
            stable_id,
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&json_output).expect("valid json");
    let symbols = parsed["data"]["symbols"]
        .as_array()
        .expect("symbols array")
        .clone();
    assert_eq!(
        symbols.len(),
        2,
        "expected two overload rows, got {symbols:?}"
    );
    let returned_ids: Vec<String> = symbols
        .iter()
        .map(|symbol| symbol["id"].as_str().unwrap_or_default().to_string())
        .collect();
    assert!(
        returned_ids.iter().any(|id| id == stable_id),
        "input id missing from overload siblings: {returned_ids:?}"
    );
    assert!(
        returned_ids
            .iter()
            .any(|id| id == &format!("{stable_id}#2")),
        "second overload missing from overload siblings: {returned_ids:?}"
    );

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "overloads",
            "ovl-pkg@1.0.0::Dual.nope",
        ])
        .assert()
        .code(2)
        .stdout(predicate::str::contains("\"symbols\": []"));
}

fn write_pkg_with_evidence_surface(root: &Path, name: &str, version: &str) {
    let pkg = root.join("node_modules").join(name);
    fs::create_dir_all(&pkg).unwrap();
    fs::write(
        pkg.join("package.json"),
        format!(r#"{{"name":"{name}","version":"{version}","types":"./index.d.ts"}}"#),
    )
    .unwrap();
    fs::write(
        pkg.join("index.d.ts"),
        "/**\n * Evidence sample fn\n */\nexport declare function evidenceFn(input: string): string;\n\
         export interface EvidenceShape { token: string; }\n\
         export declare function evidenceMatchA(): void;\n\
         export declare function evidenceMatchB(): void;\n\
         export declare function evidenceMatchC(): void;\n\
         export declare function evidenceMatchD(): void;\n",
    )
    .unwrap();
}

#[test]
fn query_evidence_returns_symbols_and_snippets_in_one_call() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("evidence.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_pkg_with_evidence_surface(proj.path(), "evid-pkg", "1.0.0");

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "evid-pkg",
            "1.0.0",
        ])
        .assert()
        .success();

    let json_output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "evidence",
            "--package",
            "evid-pkg",
            "--symbol",
            "evidenceFn",
            "--phrase",
            "EvidenceShape",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let parsed: Value = serde_json::from_slice(&json_output).expect("valid json envelope");
    assert_eq!(parsed["ok"], serde_json::Value::Bool(true));
    assert!(
        parsed["meta"]["durationMs"].is_number(),
        "meta.durationMs missing: {}",
        parsed["meta"]
    );
    assert_eq!(parsed["meta"]["cost"], "heavy");

    let symbols = parsed["data"]["symbols"]
        .as_array()
        .expect("symbols array")
        .clone();
    assert!(
        symbols.iter().any(
            |hit| hit["id"] == "evid-pkg@1.0.0::evidenceFn" && hit["kindName"] != "<truncated>"
        ),
        "exact-name anchor produced no usable hit: {symbols:?}"
    );
    assert!(
        symbols.iter().any(|hit| hit["name"] == "EvidenceShape"),
        "FTS phrase anchor produced no usable hit: {symbols:?}"
    );

    let snippets = parsed["data"]["snippets"]
        .as_object()
        .expect("snippets object");
    let snippet_for_fn = snippets
        .get("evid-pkg@1.0.0::evidenceFn")
        .expect("snippet for evidenceFn included");
    assert!(
        snippet_for_fn["signature"]
            .as_str()
            .map(|signature| signature.contains("evidenceFn"))
            .unwrap_or(false),
        "snippet signature missing evidenceFn: {snippet_for_fn:?}"
    );

    let anchor_summary = parsed["data"]["anchors"].as_array().expect("anchors array");
    assert!(
        anchor_summary
            .iter()
            .any(|entry| entry["match"] == "exact" && entry["anchor"] == "evidenceFn"),
        "exact anchor summary missing: {anchor_summary:?}"
    );
    assert!(
        anchor_summary
            .iter()
            .any(|entry| entry["match"] == "fts" && entry["anchor"] == "EvidenceShape"),
        "fts anchor summary missing: {anchor_summary:?}"
    );

    // No truncation expected at default limit.
    assert!(
        symbols.iter().all(|hit| hit["kindName"] != "<truncated>"),
        "did not expect truncation marker yet: {symbols:?}"
    );
}

#[test]
fn query_evidence_appends_truncation_sentinel_when_limit_exceeded() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("evidence-trunc.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_pkg_with_evidence_surface(proj.path(), "evid-trunc", "1.0.0");

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "evid-trunc",
            "1.0.0",
        ])
        .assert()
        .success();

    // Use exact-name anchors against four distinct fixture symbols so we exceed `-n 2` and
    // force the sentinel to be appended.
    let json_output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "evidence",
            "--package",
            "evid-trunc",
            "--symbol",
            "evidenceMatchA",
            "--symbol",
            "evidenceMatchB",
            "--symbol",
            "evidenceMatchC",
            "--symbol",
            "evidenceMatchD",
            "-n",
            "2",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let parsed: Value = serde_json::from_slice(&json_output).expect("valid json envelope");
    let symbols = parsed["data"]["symbols"]
        .as_array()
        .expect("symbols array")
        .clone();

    let last_hit = symbols.last().expect("at least one symbol");
    assert_eq!(
        last_hit["kindName"], "<truncated>",
        "expected sentinel marker as last entry; got {last_hit:?}"
    );
    assert_eq!(last_hit["id"], "<truncated>");
    assert_eq!(last_hit["name"], "<truncated>");

    let real_hits: Vec<&Value> = symbols
        .iter()
        .filter(|hit| hit["kindName"] != "<truncated>")
        .collect();
    assert_eq!(
        real_hits.len(),
        2,
        "expected exactly two real hits before sentinel; got {real_hits:?}"
    );
}

#[test]
fn query_evidence_requires_at_least_one_anchor() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("evidence-empty.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "evidence",
            "--package",
            "anything",
        ])
        .assert()
        .failure()
        .stdout(predicate::str::contains("\"ok\": false"))
        .stdout(predicate::str::contains("--symbol or --phrase"));
}

#[test]
fn index_dry_run_applies_config_include_and_exclude_filters() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "@scope/keep-lib", "1.0.0");
    write_minimal_pkg(proj.path(), "@scope/drop-lib", "1.0.0");
    write_minimal_pkg(proj.path(), "plain-lib", "1.0.0");

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "packages": {
    "include": ["@scope/*"],
    "exclude": ["@scope/drop-*"]
  }
}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_text = String::from_utf8(output).unwrap();

    assert!(output_text.contains("\"@scope/keep-lib\""));
    assert!(!output_text.contains("\"@scope/drop-lib\""));
    assert!(!output_text.contains("\"plain-lib\""));
}

#[test]
fn index_dry_run_ignores_missing_workspace_paths_but_keeps_root_scan() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "root-only", "1.0.0");

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*", "apps/missing"]
}"#,
    )
    .unwrap();

    nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"root-only\""));
}

#[test]
fn query_fails_when_discovered_config_is_invalid_json() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-c");
    fs::create_dir_all(&workspace_dir).unwrap();
    fs::write(proj.path().join("nci.config.json"), "{ bad json").unwrap();

    nci_cmd()
        .current_dir(&workspace_dir)
        .args(["query", "packages"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("invalid nci.config.json"));
}

#[test]
fn index_dry_run_applies_root_nciignore_when_running_from_root() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "keep-root", "1.0.0");
    write_minimal_pkg(proj.path(), "drop-root", "1.0.0");
    fs::write(proj.path().join(".nciignore"), "drop-*\n").unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_text = String::from_utf8(output).unwrap();
    assert!(output_text.contains("\"keep-root\""));
    assert!(!output_text.contains("\"drop-root\""));
}

#[test]
fn index_dry_run_uses_workspace_nciignore_when_workspace_has_nearest_config() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-d");
    fs::create_dir_all(workspace_dir.join("node_modules")).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "root-visible", "1.0.0");
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("keep-workspace"),
        "keep-workspace",
        "1.0.0",
    );
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("drop-workspace"),
        "drop-workspace",
        "1.0.0",
    );

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*"]
}"#,
    )
    .unwrap();
    fs::write(proj.path().join(".nciignore"), "root-visible\n").unwrap();

    fs::write(
        workspace_dir.join("nci.config.json"),
        r#"{
  "workspaces": ["."]
}"#,
    )
    .unwrap();
    fs::write(workspace_dir.join(".nciignore"), "drop-*\n").unwrap();

    let output = nci_cmd()
        .current_dir(&workspace_dir)
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_text = String::from_utf8(output).unwrap();
    assert!(output_text.contains("\"keep-workspace\""));
    assert!(!output_text.contains("\"drop-workspace\""));
    assert!(!output_text.contains("\"root-visible\""));
}

#[test]
fn index_dry_run_nearest_config_owns_ignore_scope_when_root_and_workspace_ignore_exist() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-e");
    fs::create_dir_all(workspace_dir.join("node_modules")).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "root-shared", "1.0.0");
    write_minimal_pkg_at(
        &workspace_dir.join("node_modules").join("workspace-shared"),
        "workspace-shared",
        "1.0.0",
    );

    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "workspaces": ["packages/*"]
}"#,
    )
    .unwrap();
    fs::write(proj.path().join(".nciignore"), "root-*\n").unwrap();

    fs::write(
        workspace_dir.join("nci.config.json"),
        r#"{
  "workspaces": ["."]
}"#,
    )
    .unwrap();
    fs::write(workspace_dir.join(".nciignore"), "workspace-*\n").unwrap();

    let workspace_output = nci_cmd()
        .current_dir(&workspace_dir)
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let workspace_text = String::from_utf8(workspace_output).unwrap();
    assert!(!workspace_text.contains("\"root-shared\""));
    assert!(!workspace_text.contains("\"workspace-shared\""));

    let root_output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let root_text = String::from_utf8(root_output).unwrap();
    assert!(!root_text.contains("\"root-shared\""));
    assert!(root_text.contains("\"workspace-shared\""));
}

#[test]
fn index_dry_run_composes_nciignore_with_package_filters() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "@scope/keep-me", "1.0.0");
    write_minimal_pkg(proj.path(), "@scope/drop-by-ignore", "1.0.0");
    write_minimal_pkg(proj.path(), "not-in-include", "1.0.0");
    fs::write(proj.path().join(".nciignore"), "*ignore\n").unwrap();
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "packages": {
    "include": ["@scope/*"]
  }
}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_text = String::from_utf8(output).unwrap();
    assert!(output_text.contains("\"@scope/keep-me\""));
    assert!(!output_text.contains("\"@scope/drop-by-ignore\""));
    assert!(!output_text.contains("\"not-in-include\""));
}

#[test]
fn index_dry_run_defaults_to_dependencies_section_only() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(!text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_runtime_and_dev_unions_sections() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--package-scope",
            "dependencies,dev-dependencies",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_repeated_flag_unions_sections() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--package-scope",
            "dependencies",
            "--package-scope",
            "dev-dependencies",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_dev_only_filters_dependencies_section() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--package-scope",
            "dev-dependencies",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(!text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_all_installed_skips_section_filter() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");
    write_minimal_pkg(proj.path(), "extra-pkg", "1.0.0");

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--package-scope",
            "all-installed",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
    assert!(text.contains("\"extra-pkg\""));
}

#[test]
fn index_dry_run_package_scope_all_installed_with_section_is_rejected() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);

    let stderr = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "plain",
            "--package-scope",
            "all-installed,dependencies",
        ])
        .assert()
        .failure()
        .get_output()
        .stderr
        .clone();
    let stderr_text = String::from_utf8(stderr).unwrap();
    assert!(
        stderr_text.contains("all-installed cannot be combined with section names"),
        "expected sentinel-mixed error, got: {stderr_text}"
    );
}

#[test]
fn index_dry_run_package_scope_from_config_sentinel() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{"package_scope": "all_installed"}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_from_config_sections_array() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{"package_scope": ["dependencies", "dev_dependencies"]}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("\"lodash\""));
    assert!(text.contains("\"jest\""));
}

#[test]
fn index_dry_run_package_scope_cli_overrides_config() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_consumer_package_json(proj.path(), r#"{"lodash":"^4"}"#, r#"{"jest":"^29"}"#);
    write_minimal_pkg(proj.path(), "lodash", "4.17.21");
    write_minimal_pkg(proj.path(), "jest", "29.0.0");
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{"package_scope": ["dev_dependencies"]}"#,
    )
    .unwrap();

    let dev_only = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let dev_only_text = String::from_utf8(dev_only).unwrap();
    assert!(!dev_only_text.contains("\"lodash\""));
    assert!(dev_only_text.contains("\"jest\""));

    let deps_cli = nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--dry-run",
            "--format",
            "json",
            "--package-scope",
            "dependencies",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let deps_text = String::from_utf8(deps_cli).unwrap();
    assert!(deps_text.contains("\"lodash\""));
    assert!(!deps_text.contains("\"jest\""));
}

#[test]
fn index_dry_run_exclude_wins_over_nciignore_negation() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "other-pkg", "1.0.0");
    write_minimal_pkg(proj.path(), "shadow-blocked", "1.0.0");
    write_minimal_pkg(proj.path(), "shadow-kept", "1.0.0");
    fs::write(
        proj.path().join(".nciignore"),
        "shadow-*\n!shadow-blocked\n",
    )
    .unwrap();
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "packages": {
    "exclude": ["shadow-blocked"]
  }
}"#,
    )
    .unwrap();

    let output = nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--dry-run", "--format", "json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let output_text = String::from_utf8(output).unwrap();
    assert!(output_text.contains("\"other-pkg\""));
    assert!(!output_text.contains("\"shadow-blocked\""));
    assert!(!output_text.contains("\"shadow-kept\""));
}

#[test]
fn sql_schema_includes_packages_ddl() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqlsc.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args(["sql", "--schema", "--database", db_path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("CREATE TABLE packages"));
}

#[test]
fn sql_select_json_array() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqlj.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "sql",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "-c",
            "SELECT 1 AS v",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("[{\"v\":1}]"));
}

#[test]
fn sql_jsonl_one_line_per_row() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqll.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    let out = nci_cmd()
        .current_dir(proj.path())
        .args([
            "sql",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "jsonl",
            "-c",
            "SELECT 1 AS a UNION SELECT 2 AS a",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(out).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2, "jsonl: {text:?}");
}

#[test]
fn sql_rejects_mutating_statement() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqlm.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "sql",
            "--database",
            db_path.to_str().unwrap(),
            "-c",
            "DELETE FROM packages",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("read-only"));
}

#[test]
fn sql_explain_query_plan_allowed() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqle.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "sql",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "plain",
            "-c",
            "EXPLAIN QUERY PLAN SELECT 1",
        ])
        .assert()
        .success();
}

#[test]
fn sql_max_rows_truncation_errors() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("sqlt.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "sql",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "plain",
            "--max-rows",
            "1",
            "-c",
            "SELECT 1 AS x UNION SELECT 2 AS x",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("truncated"));
}

#[test]
fn index_one_package_smoke() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "smoke-pkg", "1.0.0");

    let cache = tempdir().unwrap();
    let db_path = cache.path().join("one.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "smoke-pkg",
            "1.0.0",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("package(s) complete"));

    nci_cmd()
        .current_dir(proj.path())
        .args(["query", "--database", db_path.to_str().unwrap(), "packages"])
        .assert()
        .success()
        .stdout(predicate::str::contains("smoke-pkg"));
}

#[test]
fn query_resolves_database_from_root_config_when_run_in_workspace_dir() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-b");
    fs::create_dir_all(&workspace_dir).unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "cfg-pkg", "1.0.0");

    let cache = tempdir().unwrap();
    let db_path = cache.path().join("cfg.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    nci_cmd()
        .current_dir(proj.path())
        .args(["index", "--database", db_path.to_str().unwrap()])
        .assert()
        .success();

    nci_cmd()
        .current_dir(&workspace_dir)
        .args(["query", "--format", "json", "packages"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"cfg-pkg\""));
}

#[test]
fn db_init_resolves_relative_database_path_from_nearest_config_directory() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-f");
    fs::create_dir_all(&workspace_dir).unwrap();
    fs::write(
        proj.path().join("nci.config.json"),
        r#"{
  "database": ".nci/anchored.sqlite",
  "workspaces": ["packages/*"]
}"#,
    )
    .unwrap();

    nci_cmd()
        .current_dir(&workspace_dir)
        .args(["db", "init"])
        .assert()
        .success();

    assert!(proj.path().join(".nci").join("anchored.sqlite").is_file());
}

#[test]
fn db_init_keeps_absolute_database_path_from_config() {
    let proj = tempdir().unwrap();
    let workspace_dir = proj.path().join("packages").join("app-g");
    fs::create_dir_all(&workspace_dir).unwrap();
    let absolute_database_path = proj.path().join("absolute-db.sqlite");
    let config_json = serde_json::json!({
        "database": absolute_database_path,
        "workspaces": ["packages/*"]
    });
    fs::write(
        proj.path().join("nci.config.json"),
        serde_json::to_string_pretty(&config_json).unwrap(),
    )
    .unwrap();

    nci_cmd()
        .current_dir(&workspace_dir)
        .args(["db", "init"])
        .assert()
        .success();

    assert!(proj.path().join("absolute-db.sqlite").is_file());
}

#[test]
fn query_active_package_prefers_root_node_modules_then_workspace_json() {
    let proj = tempdir().unwrap();
    let apps_docs = proj.path().join("apps").join("docs");
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    fs::create_dir_all(apps_docs.join("node_modules")).unwrap();

    let cache = tempdir().unwrap();
    let db_path = cache.path().join("active-pkg.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    // `init -y` writes nci.config.json; merge workspaces so active-package sees workspace node_modules.
    let config = serde_json::json!({
        "workspaces": ["apps/*"],
        "database": db_path,
    });
    fs::write(
        proj.path().join("nci.config.json"),
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .unwrap();

    fs::write(
        proj.path().join("package-lock.json"),
        r#"{"lockfileVersion":3}"#,
    )
    .unwrap();

    write_minimal_pkg(proj.path(), "vitest", "4.1.0");
    write_minimal_pkg_at(
        &apps_docs.join("node_modules").join("vitest"),
        "vitest",
        "3.2.4",
    );

    seed_indexed_package_row(&db_path, "vitest", "3.2.4");

    let assert = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "active-package",
            "vitest",
        ])
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).expect("utf8");
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["meta"]["envelopeVersion"], 1);
    assert_eq!(parsed["meta"]["query"], "active-package");
    assert!(parsed["meta"]["durationMs"].is_number());
    assert_eq!(parsed["meta"]["cost"], "moderate");
    assert_eq!(
        parsed["meta"]["activePackageResolution"],
        "directInstallPath"
    );
    assert_eq!(parsed["data"]["packageManager"], "npm");
    let selected = &parsed["data"]["selected"];
    assert_eq!(selected["packageVersion"], "4.1.0");
    assert_eq!(selected["indexed"], false);
    let alternates = parsed["data"]["alternates"]
        .as_array()
        .expect("alternates array");
    assert_eq!(alternates.len(), 1);
    assert_eq!(alternates[0]["packageVersion"], "3.2.4");
    assert_eq!(alternates[0]["indexed"], true);
}

/// When the hoisted path `node_modules/<name>` is absent, resolution falls back to a full
/// top-level scan so oddly named folders (still declaring the same npm `name`) remain discoverable.
#[test]
fn query_active_package_full_scan_fallback_finds_odd_top_level_folder_name() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("active-pkg-fallback.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::write(
        proj.path().join("package-lock.json"),
        r#"{"lockfileVersion":3}"#,
    )
    .unwrap();

    let odd = proj.path().join("node_modules").join("motion-build");
    write_minimal_pkg_at(&odd, "motion", "2.0.0");
    seed_indexed_package_row(&db_path, "motion", "2.0.0");

    let assert = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "active-package",
            "motion",
        ])
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).expect("utf8");
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(
        parsed["meta"]["activePackageResolution"],
        "fullScanFallback"
    );
    assert_eq!(parsed["data"]["selected"]["packageVersion"], "2.0.0");
}

#[test]
fn query_active_package_package_manager_prefers_package_json_field() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("pm-json.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::write(
        proj.path().join("package.json"),
        r#"{"name":"x","packageManager":"pnpm@9.0.0"}"#,
    )
    .unwrap();
    fs::write(
        proj.path().join("package-lock.json"),
        r#"{"lockfileVersion":3}"#,
    )
    .unwrap();

    write_minimal_pkg(proj.path(), "react", "18.0.0");
    seed_indexed_package_row(&db_path, "react", "18.0.0");

    let assert = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "active-package",
            "react",
        ])
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).expect("utf8");
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["data"]["packageManager"], "pnpm");
}

#[test]
fn query_active_package_lockfile_order_prefers_pnpm_over_npm_lock() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("pm-order.sqlite");

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    fs::write(proj.path().join("pnpm-lock.yaml"), "lockfileVersion: 9.0\n").unwrap();
    fs::write(
        proj.path().join("package-lock.json"),
        r#"{"lockfileVersion":3}"#,
    )
    .unwrap();

    write_minimal_pkg(proj.path(), "react", "18.0.0");
    seed_indexed_package_row(&db_path, "react", "18.0.0");

    let assert = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "active-package",
            "react",
        ])
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).expect("utf8");
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["data"]["packageManager"], "pnpm");
}

#[test]
fn query_active_package_package_manager_finds_lockfile_in_config_ancestor() {
    let proj = tempdir().unwrap();
    let apps_docs = proj.path().join("apps").join("docs");
    fs::create_dir_all(apps_docs.join("node_modules")).unwrap();
    let cache = tempdir().unwrap();
    let db_path = cache.path().join("pm-ancestor.sqlite");

    fs::write(proj.path().join("pnpm-lock.yaml"), "lockfileVersion: 9.0\n").unwrap();

    nci_cmd()
        .current_dir(proj.path())
        .env("NCI_CACHE_DIR", cache.path())
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();

    let config = serde_json::json!({
        "database": db_path,
        "project_root": "apps/docs",
    });
    fs::write(
        proj.path().join("nci.config.json"),
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .unwrap();

    write_minimal_pkg(&apps_docs, "lodash", "4.0.0");
    seed_indexed_package_row(&db_path, "lodash", "4.0.0");

    let assert = nci_cmd()
        .current_dir(&apps_docs)
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "active-package",
            "lodash",
        ])
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).expect("utf8");
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["data"]["packageManager"], "pnpm");
}

fn init_db_with_evidence_pkg(proj: &Path, cache: &Path) -> std::path::PathBuf {
    let db_path = cache.join("snippet_nf.sqlite");
    nci_cmd()
        .current_dir(proj)
        .env("NCI_CACHE_DIR", cache)
        .args(["init", "-y", "--database"])
        .arg(&db_path)
        .assert()
        .success();
    fs::create_dir_all(proj.join("node_modules")).unwrap();
    write_pkg_with_evidence_surface(proj, "evid-pkg", "1.0.0");
    nci_cmd()
        .current_dir(proj)
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "evid-pkg",
            "1.0.0",
        ])
        .assert()
        .success();
    db_path
}

#[test]
fn query_snippet_unknown_stable_id_json_exit_2_hint_and_null_envelope() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_with_evidence_pkg(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "snippet",
            "evid-pkg@1.0.0::noSuchSymbol",
        ])
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["meta"]["envelopeVersion"], 1);
    assert_eq!(parsed["meta"]["query"], "snippet");
    assert!(parsed["data"]["snippet"].is_null());
    assert!(parsed["hint"].as_str().unwrap().contains("query find"));
}

#[test]
fn query_show_unknown_stable_id_json_exit_2_hint_and_null_envelope() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_with_evidence_pkg(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "show",
            "evid-pkg@1.0.0::noSuchSymbol",
        ])
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["meta"]["envelopeVersion"], 1);
    assert_eq!(parsed["meta"]["query"], "show");
    assert!(parsed["data"]["symbol"].is_null());
    assert!(parsed["hint"].as_str().unwrap().contains("query symbol"));
}

#[test]
fn query_overloads_unknown_stable_id_json_exit_2_hint_and_empty_symbols() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_with_evidence_pkg(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "overloads",
            "evid-pkg@1.0.0::noSuchSymbol",
        ])
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["meta"]["envelopeVersion"], 1);
    assert_eq!(parsed["meta"]["query"], "overloads");
    assert_eq!(parsed["data"]["symbols"].as_array().unwrap().len(), 0);
    assert!(parsed["hint"].as_str().unwrap().contains("recover"));
}

#[test]
fn query_snippet_resolved_stable_id_json_exit_0() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_with_evidence_pkg(proj.path(), cache.path());

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
            "snippet",
            "evid-pkg@1.0.0::evidenceFn",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"ok\": true"))
        .stdout(predicate::str::contains("evidenceFn"));
}

#[test]
fn query_snippet_unknown_stable_id_plain_stdout_hint_line() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_with_evidence_pkg(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "snippet",
            "evid-pkg@1.0.0::noSuchSymbol",
        ])
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("query snippet"),
        "expected ui label in stdout: {stdout}"
    );
    assert!(
        stdout.contains("noSuchSymbol") && stdout.contains("query find"),
        "expected recovery hint: {stdout}"
    );
}

#[test]
fn db_migrate_json_reports_no_deferred_backfill_on_fresh_db() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "migrate",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["data"]["deferred_backfill"], false);
    assert_eq!(
        parsed["data"]["applied_versions"].as_array().unwrap().len(),
        0
    );
}

#[test]
fn db_backfill_json_no_pending_on_fresh_db() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "backfill",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["data"]["pending_packages_before"], 0);
    assert_eq!(parsed["data"]["pending_packages_after"], 0);
    assert_eq!(parsed["data"]["symbol_rows_updated"], 0);
}

#[test]
fn db_backfill_drains_all_seeded_pending_packages() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());
    set_pending_backfill_meta(&db_path, TEST_PENDING_BACKFILL_VERSION);
    seed_package_with_backfill_revision(&db_path, "pkg-alpha", "1.0.0", 0);
    seed_package_with_backfill_revision(&db_path, "pkg-beta", "2.0.0", 0);

    assert_eq!(
        count_packages_below_backfill_revision(&db_path, TEST_PENDING_BACKFILL_VERSION),
        2
    );

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "backfill",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("json");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["data"]["pending_packages_before"], 2);
    assert_eq!(parsed["data"]["pending_packages_after"], 0);

    let connection = Connection::open(&db_path).expect("open");
    let pending_meta: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_PENDING_BACKFILL_KEY],
            |row| row.get(0),
        )
        .optional()
        .expect("query");
    assert!(pending_meta.is_none());

    let completed: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM packages WHERE backfill_revision >= ?1",
            [TEST_PENDING_BACKFILL_VERSION],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(completed, 2);
}

#[test]
fn db_backfill_max_packages_leaves_remainder_pending() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());
    set_pending_backfill_meta(&db_path, TEST_PENDING_BACKFILL_VERSION);
    for index in 0..4 {
        seed_package_with_backfill_revision(&db_path, &format!("pkg-{index}"), "1.0.0", 0);
    }

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "backfill",
            "--database",
            db_path.to_str().unwrap(),
            "--max-packages",
            "2",
            "--format",
            "json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("json");
    assert_eq!(parsed["data"]["pending_packages_before"], 4);
    assert_eq!(parsed["data"]["pending_packages_after"], 2);

    let connection = Connection::open(&db_path).expect("open");
    let pending_meta: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_PENDING_BACKFILL_KEY],
            |row| row.get(0),
        )
        .optional()
        .expect("query");
    assert!(pending_meta.is_some());
}

#[test]
fn db_backfill_plain_reports_pending_counts() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());
    set_pending_backfill_meta(&db_path, TEST_PENDING_BACKFILL_VERSION);
    seed_package_with_backfill_revision(&db_path, "plain-pkg", "1.0.0", 0);

    nci_cmd()
        .current_dir(proj.path())
        .args(["db", "backfill", "--database", db_path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("Pending before: 1"))
        .stdout(predicate::str::contains("Pending after: 0"));
}

#[test]
fn db_backfill_is_noop_when_packages_already_current() {
    let proj = tempdir().unwrap();
    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());
    set_pending_backfill_meta(&db_path, TEST_PENDING_BACKFILL_VERSION);
    seed_package_with_backfill_revision(
        &db_path,
        "current",
        "1.0.0",
        TEST_PENDING_BACKFILL_VERSION,
    );

    let output = nci_cmd()
        .current_dir(proj.path())
        .args([
            "db",
            "backfill",
            "--database",
            db_path.to_str().unwrap(),
            "--format",
            "json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let parsed: Value = serde_json::from_slice(&output).expect("json");
    assert_eq!(parsed["data"]["pending_packages_before"], 0);
    assert_eq!(parsed["data"]["pending_packages_after"], 0);

    let connection = Connection::open(&db_path).expect("open");
    let pending_meta: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_PENDING_BACKFILL_KEY],
            |row| row.get(0),
        )
        .optional()
        .expect("query");
    assert!(pending_meta.is_none());
}

/// Index runs foreground backfill before cache probes: second index must not recrawl when
/// `index_cache_key` still matches and only `pending_backfill` lagged.
#[test]
fn index_foreground_backfill_clears_pending_without_recrawl() {
    let proj = tempdir().unwrap();
    fs::create_dir_all(proj.path().join("node_modules")).unwrap();
    write_minimal_pkg(proj.path(), "backfill-index-pkg", "1.0.0");

    let cache = tempdir().unwrap();
    let db_path = init_db_path(proj.path(), cache.path());
    let engine_cache_key = index_engine_cache_key(&[]);

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "backfill-index-pkg",
            "1.0.0",
        ])
        .assert()
        .success();

    let connection = Connection::open(&db_path).expect("open");
    let indexed_at_before: i64 = connection
        .query_row(
            "SELECT indexed_at FROM packages WHERE name = 'backfill-index-pkg'",
            [],
            |row| row.get(0),
        )
        .expect("indexed_at");
    drop(connection);

    set_pending_backfill_meta(&db_path, TEST_PENDING_BACKFILL_VERSION);
    let connection = Connection::open(&db_path).expect("open");
    connection
        .execute(
            "UPDATE packages SET backfill_revision = 0, index_cache_key = ?1 WHERE name = 'backfill-index-pkg'",
            [engine_cache_key.as_str()],
        )
        .expect("simulate pending backfill lag");
    drop(connection);

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "index",
            "--database",
            db_path.to_str().unwrap(),
            "package",
            "backfill-index-pkg",
            "1.0.0",
        ])
        .assert()
        .success();

    let connection = Connection::open(&db_path).expect("open");
    let indexed_at_after: i64 = connection
        .query_row(
            "SELECT indexed_at FROM packages WHERE name = 'backfill-index-pkg'",
            [],
            |row| row.get(0),
        )
        .expect("indexed_at");
    assert_eq!(
        indexed_at_before, indexed_at_after,
        "cache hit should not rewrite package row via save_package"
    );

    let pending_meta: Option<String> = connection
        .query_row(
            "SELECT value FROM nci_meta WHERE key = ?1",
            [META_PENDING_BACKFILL_KEY],
            |row| row.get(0),
        )
        .optional()
        .expect("query");
    assert!(pending_meta.is_none());

    let package_revision: i64 = connection
        .query_row(
            "SELECT backfill_revision FROM packages WHERE name = 'backfill-index-pkg'",
            [],
            |row| row.get(0),
        )
        .expect("revision");
    assert!(package_revision >= TEST_PENDING_BACKFILL_VERSION as i64);
}
