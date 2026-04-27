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
