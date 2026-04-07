//! Integration tests for the `nci` binary.

use std::fs;
use std::path::Path;

use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::tempdir;

fn nci_cmd() -> Command {
    Command::cargo_bin("nci").expect("nci binary present")
}

#[test]
fn init_y_writes_nci_toml_and_db() {
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

    assert!(proj.path().join(".nci.toml").is_file());
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
        .stdout(predicate::str::contains("schema_version"));
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
    fs::create_dir_all(&pkg).unwrap();
    fs::write(
        pkg.join("package.json"),
        format!(
            r#"{{"name":"{name}","version":"{version}","types":"./index.d.ts"}}"#
        ),
    )
    .unwrap();
    fs::write(pkg.join("index.d.ts"), "export declare const x: number;\n").unwrap();
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
        .stdout(predicate::str::contains("packages indexed"));

    nci_cmd()
        .current_dir(proj.path())
        .args([
            "query",
            "--database",
            db_path.to_str().unwrap(),
            "packages",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("smoke-pkg"));
}
