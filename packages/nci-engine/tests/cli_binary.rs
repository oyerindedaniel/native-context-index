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
