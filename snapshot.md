PS C:\Users\doyer\native-context-modules> cargo test --test snapshot_tests
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.53s
     Running tests\snapshot_tests.rs (target\debug\deps\snapshot_tests-9bd8cde340c79aea.exe)

running 37 tests
test all_oracles_have_tests ... ok
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_circular-deps.snap.new
test snapshot_circular_deps ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_conditional-exports.snap.new
test snapshot_conditional_exports ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_class-statics.snap.new
test snapshot_class_statics ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_deprecated-exports.snap.new
test snapshot_deprecated_exports ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_computed-properties.snap.new
test snapshot_computed_properties ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_class-instance.snap.new
test snapshot_class_instance ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_deep-chain.snap.new
test snapshot_deep_chain ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_deps-pkg.snap.new
test snapshot_deps_pkg ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_all-export-forms.snap.new
test snapshot_enum_declaration ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_global-augmentation.snap.new
test snapshot_global_augmentation ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_import-cases.snap.new
test snapshot_import_cases ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_inherited-member-flattening.snap.new
test snapshot_inherited_member_flattening ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_inline-import-type.snap.new
test snapshot_inline_import_type ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_literal-export.snap.new
test snapshot_literal_export ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_local-export.snap.new
test snapshot_local_export ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_local-reexport.snap.new
test snapshot_local_reexport ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_merged-symbols.snap.new
test snapshot_merged_symbols ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_mixin-composition.snap.new
test snapshot_mixin_composition ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_multi-star-exports.snap.new
test snapshot_multi_star_exports ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_name-collision.snap.new
test snapshot_name_collision ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_namespace-cases.snap.new
test snapshot_namespace_cases ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_namespace-reexport.snap.new
test snapshot_namespace_reexport ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_nested-prefix.snap.new
test snapshot_nested_prefix ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_no-types-pkg.snap.new
test snapshot_no_types_pkg ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_parser-edge-case.snap.new
test snapshot_parser_edge_case ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_re-export-chain.snap.new
test snapshot_re_export_chain ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_simple-export.snap.new
test snapshot_simple_export ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_since-inheritance.snap.new
test snapshot_since_inheritance ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_string-exports.snap.new
test snapshot_string_exports ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_subpath-exports.snap.new
test snapshot_subpath_exports ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_triple-slash-refs.snap.new
test snapshot_triple_slash_refs ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_since-decl.snap.new
test snapshot_type_alias ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_types-versions.snap.new
test snapshot_types_versions ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_visibility-merge.snap.new
test snapshot_visibility_merge ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_visibility-tags.snap.new
test snapshot_visibility_tags ... FAILED
stored new snapshot C:\Users\doyer\native-context-modules\crates\nci-engine\tests\snapshots\snapshot_tests__rust_wildcard-reexport.snap.new
test snapshot_wildcard_reexport ... FAILED

failures:

---- snapshot_circular_deps stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_circular-deps.snap
Snapshot: rust_circular-deps
Source: C:\Users\doyer\native-context-modules:282
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "circular-deps",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [],
          5 │+  "totalSymbols": 0,
          6 │+  "totalFiles": 0,
          7 │+  "crawlDurationMs": 0.0
          8 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_circular_deps' (54748) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_circular-deps' failed in line 282
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- snapshot_conditional_exports stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_conditional-exports.snap
Snapshot: rust_conditional-exports
Source: C:\Users\doyer\native-context-modules:290
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "conditional-exports-pkg",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "conditional-exports-pkg@1.0.0::Config",
          7 │+      "name": "Config",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "conditional-exports-pkg",
         11 │+      "filePath": "dist/index.d.ts",
         12 │+      "signature": "interface Config {\n  host: string;\n  port: number;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "conditional-exports-pkg@1.0.0::Config.host",
         18 │+      "name": "Config.host",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "conditional-exports-pkg",
         22 │+      "filePath": "dist/index.d.ts",
         23 │+      "signature": "host: string;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "conditional-exports-pkg@1.0.0::Config.host#2",
         29 │+      "name": "Config.host",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "conditional-exports-pkg",
         33 │+      "filePath": "dist/index.d.ts",
         34 │+      "signature": "host: string;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "conditional-exports-pkg@1.0.0::Config.port",
         40 │+      "name": "Config.port",
         41 │+      "kind": "PropertyDeclaration",
         42 │+      "kindName": "PropertyDeclaration",
         43 │+      "package": "conditional-exports-pkg",
         44 │+      "filePath": "dist/index.d.ts",
         45 │+      "signature": "port: number;",
         46 │+      "isTypeOnly": false,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "conditional-exports-pkg@1.0.0::Config.port#2",
         51 │+      "name": "Config.port",
         52 │+      "kind": "PropertyDeclaration",
         53 │+      "kindName": "PropertyDeclaration",
         54 │+      "package": "conditional-exports-pkg",
         55 │+      "filePath": "dist/index.d.ts",
         56 │+      "signature": "port: number;",
         57 │+      "isTypeOnly": false,
         58 │+      "dependencies": []
         59 │+    }
         60 │+  ],
         61 │+  "totalSymbols": 5,
         62 │+  "totalFiles": 1,
         63 │+  "crawlDurationMs": 0.0
         64 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_conditional_exports' (51012) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_conditional-exports' failed in line 290

---- snapshot_class_statics stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_class-statics.snap
Snapshot: rust_class-statics
Source: C:\Users\doyer\native-context-modules:305
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "class-statics",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "class-statics@1.0.0::Cache",
          7 │+      "name": "Cache",
          8 │+      "kind": "ClassDeclaration",
          9 │+      "kindName": "ClassDeclaration",
         10 │+      "package": "class-statics",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "class Cache {\n  /**\n   * @since 1.1.0\n   * @public\n   */\n  static maxSize: number;\n\n  /**\n   * @since 1.0.0\n   * @public\n   */\n  static clear(): void;\n\n  /**\n   * @since 1.2.0\n   * @internal\n   */\n  static _internalHelper(): boolean;\n\n  /**\n   * Non-static member (should NOT be extracted as a separate symbol)\n   */\n  get(key: string): any;\n}",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "visibility": "public",
         16 │+      "since": "1.0.0"
         17 │+    },
         18 │+    {
         19 │+      "id": "class-statics@1.0.0::Cache#2",
         20 │+      "name": "Cache",
         21 │+      "kind": "ModuleDeclaration",
         22 │+      "kindName": "ModuleDeclaration",
         23 │+      "package": "class-statics",
         24 │+      "filePath": "index.d.ts",
         25 │+      "signature": "namespace Cache { ... }",
         26 │+      "isTypeOnly": false,
         27 │+      "dependencies": []
         28 │+    },
         29 │+    {
         30 │+      "id": "class-statics@1.0.0::Cache._internalHelper",
         31 │+      "name": "Cache._internalHelper",
         32 │+      "kind": "MethodDeclaration",
         33 │+      "kindName": "MethodDeclaration",
         34 │+      "package": "class-statics",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "static _internalHelper(): boolean;",
         37 │+      "isTypeOnly": false,
         38 │+      "dependencies": [],
         39 │+      "visibility": "internal",
         40 │+      "since": "1.2.0"
         41 │+    },
         42 │+    {
         43 │+      "id": "class-statics@1.0.0::Cache.clear",
         44 │+      "name": "Cache.clear",
         45 │+      "kind": "MethodDeclaration",
         46 │+      "kindName": "MethodDeclaration",
         47 │+      "package": "class-statics",
         48 │+      "filePath": "index.d.ts",
         49 │+      "signature": "static clear(): void;",
         50 │+      "isTypeOnly": false,
         51 │+      "dependencies": [],
         52 │+      "visibility": "public",
         53 │+      "since": "1.0.0"
         54 │+    },
         55 │+    {
         56 │+      "id": "class-statics@1.0.0::Cache.maxSize",
         57 │+      "name": "Cache.maxSize",
         58 │+      "kind": "PropertyDeclaration",
         59 │+      "kindName": "PropertyDeclaration",
         60 │+      "package": "class-statics",
         61 │+      "filePath": "index.d.ts",
         62 │+      "signature": "static maxSize: number;",
         63 │+      "isTypeOnly": false,
         64 │+      "dependencies": [],
         65 │+      "visibility": "public",
         66 │+      "since": "1.1.0"
         67 │+    },
         68 │+    {
         69 │+      "id": "class-statics@1.0.0::Cache.prototype.get",
         70 │+      "name": "Cache.prototype.get",
         71 │+      "kind": "MethodDeclaration",
         72 │+      "kindName": "MethodDeclaration",
         73 │+      "package": "class-statics",
         74 │+      "filePath": "index.d.ts",
         75 │+      "signature": "get(key: string): any;",
         76 │+      "jsDoc": "Non-static member (should NOT be extracted as a separate symbol)",
         77 │+      "isTypeOnly": false,
         78 │+      "dependencies": [],
         79 │+      "visibility": "public",
         80 │+      "since": "1.0.0"
         81 │+    }
         82 │+  ],
         83 │+  "totalSymbols": 6,
         84 │+  "totalFiles": 1,
         85 │+  "crawlDurationMs": 0.0
         86 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_class_statics' (56292) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_class-statics' failed in line 305

---- snapshot_deprecated_exports stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_deprecated-exports.snap
Snapshot: rust_deprecated-exports
Source: C:\Users\doyer\native-context-modules:279
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "deprecated-exports",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "deprecated-exports@1.0.0::LegacyConfig",
          7 │+      "name": "LegacyConfig",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "deprecated-exports",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface LegacyConfig {\n  name: string;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "deprecated": true
         16 │+    },
         17 │+    {
         18 │+      "id": "deprecated-exports@1.0.0::LegacyConfig.name",
         19 │+      "name": "LegacyConfig.name",
         20 │+      "kind": "PropertyDeclaration",
         21 │+      "kindName": "PropertyDeclaration",
         22 │+      "package": "deprecated-exports",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "name: string;",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "deprecated": true
         28 │+    },
         29 │+    {
         30 │+      "id": "deprecated-exports@1.0.0::ModernConfig",
         31 │+      "name": "ModernConfig",
         32 │+      "kind": "InterfaceDeclaration",
         33 │+      "kindName": "InterfaceDeclaration",
         34 │+      "package": "deprecated-exports",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "interface ModernConfig {\n  name: string;\n  version: string;\n}",
         37 │+      "isTypeOnly": true,
         38 │+      "dependencies": []
         39 │+    },
         40 │+    {
         41 │+      "id": "deprecated-exports@1.0.0::ModernConfig.name",
         42 │+      "name": "ModernConfig.name",
         43 │+      "kind": "PropertyDeclaration",
         44 │+      "kindName": "PropertyDeclaration",
         45 │+      "package": "deprecated-exports",
         46 │+      "filePath": "index.d.ts",
         47 │+      "signature": "name: string;",
         48 │+      "isTypeOnly": false,
         49 │+      "dependencies": []
         50 │+    },
         51 │+    {
         52 │+      "id": "deprecated-exports@1.0.0::ModernConfig.version",
         53 │+      "name": "ModernConfig.version",
         54 │+      "kind": "PropertyDeclaration",
         55 │+      "kindName": "PropertyDeclaration",
         56 │+      "package": "deprecated-exports",
         57 │+      "filePath": "index.d.ts",
         58 │+      "signature": "version: string;",
         59 │+      "isTypeOnly": false,
         60 │+      "dependencies": []
         61 │+    },
         62 │+    {
         63 │+      "id": "deprecated-exports@1.0.0::newInit",
         64 │+      "name": "newInit",
         65 │+      "kind": "FunctionDeclaration",
         66 │+      "kindName": "FunctionDeclaration",
         67 │+      "package": "deprecated-exports",
         68 │+      "filePath": "index.d.ts",
         69 │+      "signature": "declare function newInit(): void;",
         70 │+      "jsDoc": "This is the current API",
         71 │+      "isTypeOnly": false,
         72 │+      "dependencies": []
         73 │+    },
         74 │+    {
         75 │+      "id": "deprecated-exports@1.0.0::oldInit",
         76 │+      "name": "oldInit",
         77 │+      "kind": "FunctionDeclaration",
         78 │+      "kindName": "FunctionDeclaration",
         79 │+      "package": "deprecated-exports",
         80 │+      "filePath": "index.d.ts",
         81 │+      "signature": "declare function oldInit(): void;",
         82 │+      "isTypeOnly": false,
         83 │+      "dependencies": [],
         84 │+      "deprecated": "Use newInit instead"
         85 │+    }
         86 │+  ],
         87 │+  "totalSymbols": 7,
         88 │+  "totalFiles": 1,
         89 │+  "crawlDurationMs": 0.0
         90 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_deprecated_exports' (62788) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_deprecated-exports' failed in line 279

---- snapshot_computed_properties stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_computed-properties.snap
Snapshot: rust_computed-properties
Source: C:\Users\doyer\native-context-modules:287
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "computed-properties",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "computed-properties@1.0.0::Iterable",
          7 │+      "name": "Iterable",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "computed-properties",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Iterable {\n  /** @since 1.1.0 */\n  [Symbol.iterator](): void;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "since": "1.0.0"
         16 │+    },
         17 │+    {
         18 │+      "id": "computed-properties@1.0.0::Iterable.[Symbol.iterator]",
         19 │+      "name": "Iterable.[Symbol.iterator]",
         20 │+      "kind": "MethodDeclaration",
         21 │+      "kindName": "MethodDeclaration",
         22 │+      "package": "computed-properties",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "[Symbol.iterator](): void;",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "since": "1.1.0"
         28 │+    },
         29 │+    {
         30 │+      "id": "computed-properties@1.0.0::Literals",
         31 │+      "name": "Literals",
         32 │+      "kind": "VariableStatement",
         33 │+      "kindName": "VariableStatement",
         34 │+      "package": "computed-properties",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "declare const Literals: {\n  /** @since 3.1.0 */\n  [\"literal-key\"]: number;\n}",
         37 │+      "isTypeOnly": false,
         38 │+      "dependencies": [],
         39 │+      "since": "3.0.0"
         40 │+    },
         41 │+    {
         42 │+      "id": "computed-properties@1.0.0::Overloaded",
         43 │+      "name": "Overloaded",
         44 │+      "kind": "ClassDeclaration",
         45 │+      "kindName": "ClassDeclaration",
         46 │+      "package": "computed-properties",
         47 │+      "filePath": "index.d.ts",
         48 │+      "signature": "class Overloaded {\n  /** @since 1.0.0 */\n  [Symbol.iterator](): void;\n  /** @since 1.1.0 */\n  [Symbol.iterator](arg: number): void;\n}",
         49 │+      "isTypeOnly": false,
         50 │+      "dependencies": []
         51 │+    },
         52 │+    {
         53 │+      "id": "computed-properties@1.0.0::Overloaded.prototype.[Symbol.iterator]",
         54 │+      "name": "Overloaded.prototype.[Symbol.iterator]",
         55 │+      "kind": "MethodDeclaration",
         56 │+      "kindName": "MethodDeclaration",
         57 │+      "package": "computed-properties",
         58 │+      "filePath": "index.d.ts",
         59 │+      "signature": "[Symbol.iterator](): void;",
         60 │+      "isTypeOnly": false,
         61 │+      "dependencies": [],
         62 │+      "since": "1.0.0"
         63 │+    },
         64 │+    {
         65 │+      "id": "computed-properties@1.0.0::Overloaded.prototype.[Symbol.iterator]#2",
         66 │+      "name": "Overloaded.prototype.[Symbol.iterator]",
         67 │+      "kind": "MethodDeclaration",
         68 │+      "kindName": "MethodDeclaration",
         69 │+      "package": "computed-properties",
         70 │+      "filePath": "index.d.ts",
         71 │+      "signature": "[Symbol.iterator](arg: number): void;",
         72 │+      "isTypeOnly": false,
         73 │+      "dependencies": [],
         74 │+      "since": "1.1.0"
         75 │+    },
         76 │+    {
         77 │+      "id": "computed-properties@1.0.0::Tagged",
         78 │+      "name": "Tagged",
         79 │+      "kind": "ClassDeclaration",
         80 │+      "kindName": "ClassDeclaration",
         81 │+      "package": "computed-properties",
         82 │+      "filePath": "index.d.ts",
         83 │+      "signature": "class Tagged {\n  /** @since 2.1.0 */\n  [Symbol.toStringTag]: string;\n}",
         84 │+      "isTypeOnly": false,
         85 │+      "dependencies": [],
         86 │+      "since": "2.0.0"
         87 │+    },
         88 │+    {
         89 │+      "id": "computed-properties@1.0.0::Tagged.prototype.[Symbol.toStringTag]",
         90 │+      "name": "Tagged.prototype.[Symbol.toStringTag]",
         91 │+      "kind": "PropertyDeclaration",
         92 │+      "kindName": "PropertyDeclaration",
         93 │+      "package": "computed-properties",
         94 │+      "filePath": "index.d.ts",
         95 │+      "signature": "[Symbol.toStringTag]: string;",
         96 │+      "isTypeOnly": false,
         97 │+      "dependencies": [],
         98 │+      "since": "2.1.0"
         99 │+    }
        100 │+  ],
        101 │+  "totalSymbols": 8,
        102 │+  "totalFiles": 1,
        103 │+  "crawlDurationMs": 0.0
        104 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_computed_properties' (11828) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_computed-properties' failed in line 287

---- snapshot_class_instance stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_class-instance.snap
Snapshot: rust_class-instance
Source: C:\Users\doyer\native-context-modules:277
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "class-instance",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "class-instance@1.0.0::User",
          7 │+      "name": "User",
          8 │+      "kind": "ClassDeclaration",
          9 │+      "kindName": "ClassDeclaration",
         10 │+      "package": "class-instance",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare class User {\n  constructor(name: string);\n\n  /** @since 1.1.0 */\n  readonly name: string;\n\n  /** @since 1.2.0 */\n  greet(): string;\n\n  /** @internal */\n  _internalMethod(): void;\n\n  static create(name: string): User;\n}",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "since": "1.0.0",
         16 │+      "modifiers": [
         17 │+        "declare"
         18 │+      ]
         19 │+    },
         20 │+    {
         21 │+      "id": "class-instance@1.0.0::User.create",
         22 │+      "name": "User.create",
         23 │+      "kind": "MethodDeclaration",
         24 │+      "kindName": "MethodDeclaration",
         25 │+      "package": "class-instance",
         26 │+      "filePath": "index.d.ts",
         27 │+      "signature": "static create(name: string): User;",
         28 │+      "isTypeOnly": false,
         29 │+      "dependencies": [],
         30 │+      "since": "1.0.0"
         31 │+    },
         32 │+    {
         33 │+      "id": "class-instance@1.0.0::User.prototype._internalMethod",
         34 │+      "name": "User.prototype._internalMethod",
         35 │+      "kind": "MethodDeclaration",
         36 │+      "kindName": "MethodDeclaration",
         37 │+      "package": "class-instance",
         38 │+      "filePath": "index.d.ts",
         39 │+      "signature": "_internalMethod(): void;",
         40 │+      "isTypeOnly": false,
         41 │+      "dependencies": [],
         42 │+      "visibility": "internal",
         43 │+      "since": "1.0.0"
         44 │+    },
         45 │+    {
         46 │+      "id": "class-instance@1.0.0::User.prototype.greet",
         47 │+      "name": "User.prototype.greet",
         48 │+      "kind": "MethodDeclaration",
         49 │+      "kindName": "MethodDeclaration",
         50 │+      "package": "class-instance",
         51 │+      "filePath": "index.d.ts",
         52 │+      "signature": "greet(): string;",
         53 │+      "isTypeOnly": false,
         54 │+      "dependencies": [],
         55 │+      "since": "1.2.0"
         56 │+    },
         57 │+    {
         58 │+      "id": "class-instance@1.0.0::User.prototype.name",
         59 │+      "name": "User.prototype.name",
         60 │+      "kind": "PropertyDeclaration",
         61 │+      "kindName": "PropertyDeclaration",
         62 │+      "package": "class-instance",
         63 │+      "filePath": "index.d.ts",
         64 │+      "signature": "readonly name: string;",
         65 │+      "isTypeOnly": false,
         66 │+      "dependencies": [],
         67 │+      "since": "1.1.0"
         68 │+    }
         69 │+  ],
         70 │+  "totalSymbols": 5,
         71 │+  "totalFiles": 1,
         72 │+  "crawlDurationMs": 0.0
         73 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_class_instance' (41924) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_class-instance' failed in line 277

---- snapshot_deep_chain stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_deep-chain.snap
Snapshot: rust_deep-chain
Source: C:\Users\doyer\native-context-modules:283
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "deep-chain",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "deep-chain@1.0.0::APP_NAME",
          7 │+      "name": "APP_NAME",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "deep-chain",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare const APP_NAME: string",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "deep-chain@1.0.0::Handler",
         18 │+      "name": "Handler",
         19 │+      "kind": "TypeAliasDeclaration",
         20 │+      "kindName": "TypeAliasDeclaration",
         21 │+      "package": "deep-chain",
         22 │+      "filePath": "core/handler.d.ts",
         23 │+      "signature": "type Handler = (req: Request, res: Response) => void;",
         24 │+      "isTypeOnly": true,
         25 │+      "dependencies": [
         26 │+        "deep-chain@1.0.0::core/handler.d.ts::Request",
         27 │+        "deep-chain@1.0.0::core/handler.d.ts::Response"
         28 │+      ],
         29 │+      "reExportedFrom": "index.d.ts"
         30 │+    },
         31 │+    {
         32 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Request",
         33 │+      "name": "Request",
         34 │+      "kind": "InterfaceDeclaration",
         35 │+      "kindName": "InterfaceDeclaration",
         36 │+      "package": "deep-chain",
         37 │+      "filePath": "core/handler.d.ts",
         38 │+      "signature": "interface Request {\n  url: string;\n  method: string;\n}",
         39 │+      "isTypeOnly": true,
         40 │+      "dependencies": [],
         41 │+      "isInternal": true
         42 │+    },
         43 │+    {
         44 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Request.method",
         45 │+      "name": "Request.method",
         46 │+      "kind": "PropertyDeclaration",
         47 │+      "kindName": "PropertyDeclaration",
         48 │+      "package": "deep-chain",
         49 │+      "filePath": "core/handler.d.ts",
         50 │+      "signature": "method: string;",
         51 │+      "isTypeOnly": false,
         52 │+      "dependencies": [],
         53 │+      "isInternal": true
         54 │+    },
         55 │+    {
         56 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Request.url",
         57 │+      "name": "Request.url",
         58 │+      "kind": "PropertyDeclaration",
         59 │+      "kindName": "PropertyDeclaration",
         60 │+      "package": "deep-chain",
         61 │+      "filePath": "core/handler.d.ts",
         62 │+      "signature": "url: string;",
         63 │+      "isTypeOnly": false,
         64 │+      "dependencies": [],
         65 │+      "isInternal": true
         66 │+    },
         67 │+    {
         68 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Response",
         69 │+      "name": "Response",
         70 │+      "kind": "InterfaceDeclaration",
         71 │+      "kindName": "InterfaceDeclaration",
         72 │+      "package": "deep-chain",
         73 │+      "filePath": "core/handler.d.ts",
         74 │+      "signature": "interface Response {\n  status: number;\n  body: string;\n}",
         75 │+      "isTypeOnly": true,
         76 │+      "dependencies": [],
         77 │+      "isInternal": true
         78 │+    },
         79 │+    {
         80 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Response.body",
         81 │+      "name": "Response.body",
         82 │+      "kind": "PropertyDeclaration",
         83 │+      "kindName": "PropertyDeclaration",
         84 │+      "package": "deep-chain",
         85 │+      "filePath": "core/handler.d.ts",
         86 │+      "signature": "body: string;",
         87 │+      "isTypeOnly": false,
         88 │+      "dependencies": [],
         89 │+      "isInternal": true
         90 │+    },
         91 │+    {
         92 │+      "id": "deep-chain@1.0.0::core/handler.d.ts::Response.status",
         93 │+      "name": "Response.status",
         94 │+      "kind": "PropertyDeclaration",
         95 │+      "kindName": "PropertyDeclaration",
         96 │+      "package": "deep-chain",
         97 │+      "filePath": "core/handler.d.ts",
         98 │+      "signature": "status: number;",
         99 │+      "isTypeOnly": false,
        100 │+      "dependencies": [],
        101 │+      "isInternal": true
        102 │+    }
        103 │+  ],
        104 │+  "totalSymbols": 8,
        105 │+  "totalFiles": 3,
        106 │+  "crawlDurationMs": 0.0
        107 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_deep_chain' (46528) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_deep-chain' failed in line 283

---- snapshot_deps_pkg stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_deps-pkg.snap
Snapshot: rust_deps-pkg
Source: C:\Users\doyer\native-context-modules:303
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "deps-pkg",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "deps-pkg@1.0.0::Config",
          7 │+      "name": "Config",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "deps-pkg",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Config {\n  name: string;\n  debug: boolean;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "deps-pkg@1.0.0::Config.debug",
         18 │+      "name": "Config.debug",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "deps-pkg",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "debug: boolean;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "deps-pkg@1.0.0::Config.name",
         29 │+      "name": "Config.name",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "deps-pkg",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "name: string;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "deps-pkg@1.0.0::LogLevel",
         40 │+      "name": "LogLevel",
         41 │+      "kind": "TypeAliasDeclaration",
         42 │+      "kindName": "TypeAliasDeclaration",
         43 │+      "package": "deps-pkg",
         44 │+      "filePath": "index.d.ts",
         45 │+      "signature": "type LogLevel = \"info\" | \"warn\" | \"error\";",
         46 │+      "isTypeOnly": true,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "deps-pkg@1.0.0::Logger",
         51 │+      "name": "Logger",
         52 │+      "kind": "InterfaceDeclaration",
         53 │+      "kindName": "InterfaceDeclaration",
         54 │+      "package": "deps-pkg",
         55 │+      "filePath": "index.d.ts",
         56 │+      "signature": "interface Logger {\n  config: Config;\n  level: LogLevel;\n}",
         57 │+      "isTypeOnly": true,
         58 │+      "dependencies": []
         59 │+    },
         60 │+    {
         61 │+      "id": "deps-pkg@1.0.0::Logger.config",
         62 │+      "name": "Logger.config",
         63 │+      "kind": "PropertyDeclaration",
         64 │+      "kindName": "PropertyDeclaration",
         65 │+      "package": "deps-pkg",
         66 │+      "filePath": "index.d.ts",
         67 │+      "signature": "config: Config;",
         68 │+      "isTypeOnly": false,
         69 │+      "dependencies": []
         70 │+    },
         71 │+    {
         72 │+      "id": "deps-pkg@1.0.0::Logger.level",
         73 │+      "name": "Logger.level",
         74 │+      "kind": "PropertyDeclaration",
         75 │+      "kindName": "PropertyDeclaration",
         76 │+      "package": "deps-pkg",
         77 │+      "filePath": "index.d.ts",
         78 │+      "signature": "level: LogLevel;",
         79 │+      "isTypeOnly": false,
         80 │+      "dependencies": []
         81 │+    },
         82 │+    {
         83 │+      "id": "deps-pkg@1.0.0::createLogger",
         84 │+      "name": "createLogger",
         85 │+      "kind": "FunctionDeclaration",
         86 │+      "kindName": "FunctionDeclaration",
         87 │+      "package": "deps-pkg",
         88 │+      "filePath": "index.d.ts",
         89 │+      "signature": "declare function createLogger(config: Config): Logger;",
         90 │+      "isTypeOnly": false,
         91 │+      "dependencies": [
         92 │+        "deps-pkg@1.0.0::Config",
         93 │+        "deps-pkg@1.0.0::Logger"
         94 │+      ]
         95 │+    }
         96 │+  ],
         97 │+  "totalSymbols": 8,
         98 │+  "totalFiles": 1,
         99 │+  "crawlDurationMs": 0.0
        100 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_deps_pkg' (11868) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_deps-pkg' failed in line 303

---- snapshot_enum_declaration stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_all-export-forms.snap
Snapshot: rust_all-export-forms
Source: C:\Users\doyer\native-context-modules:281
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "all-export-forms",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "all-export-forms@1.0.0::Config",
          7 │+      "name": "Config",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "all-export-forms",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Config {\n  host: string;\n  port: number;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "all-export-forms@1.0.0::Config.host",
         18 │+      "name": "Config.host",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "all-export-forms",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "host: string;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "all-export-forms@1.0.0::Config.port",
         29 │+      "name": "Config.port",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "all-export-forms",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "port: number;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "all-export-forms@1.0.0::Handler",
         40 │+      "name": "Handler",
         41 │+      "kind": "TypeAliasDeclaration",
         42 │+      "kindName": "TypeAliasDeclaration",
         43 │+      "package": "all-export-forms",
         44 │+      "filePath": "handlers.d.ts",
         45 │+      "signature": "type Handler = (req: any, res: any) => void;",
         46 │+      "isTypeOnly": true,
         47 │+      "dependencies": [],
         48 │+      "reExportedFrom": "index.d.ts"
         49 │+    },
         50 │+    {
         51 │+      "id": "all-export-forms@1.0.0::internal.d.ts::InternalRouter",
         52 │+      "name": "InternalRouter",
         53 │+      "kind": "ClassDeclaration",
         54 │+      "kindName": "ClassDeclaration",
         55 │+      "package": "all-export-forms",
         56 │+      "filePath": "internal.d.ts",
         57 │+      "signature": "declare class InternalRouter {\n  add(path: string, handler: any): void;\n}",
         58 │+      "isTypeOnly": false,
         59 │+      "dependencies": [],
         60 │+      "isInternal": true,
         61 │+      "modifiers": [
         62 │+        "declare"
         63 │+      ]
         64 │+    },
         65 │+    {
         66 │+      "id": "all-export-forms@1.0.0::internal.d.ts::InternalRouter.prototype.add",
         67 │+      "name": "InternalRouter.prototype.add",
         68 │+      "kind": "MethodDeclaration",
         69 │+      "kindName": "MethodDeclaration",
         70 │+      "package": "all-export-forms",
         71 │+      "filePath": "internal.d.ts",
         72 │+      "signature": "add(path: string, handler: any): void;",
         73 │+      "isTypeOnly": false,
         74 │+      "dependencies": [],
         75 │+      "isInternal": true
         76 │+    },
         77 │+    {
         78 │+      "id": "all-export-forms@1.0.0::LogLevel",
         79 │+      "name": "LogLevel",
         80 │+      "kind": "EnumDeclaration",
         81 │+      "kindName": "EnumDeclaration",
         82 │+      "package": "all-export-forms",
         83 │+      "filePath": "index.d.ts",
         84 │+      "signature": "declare enum LogLevel {\n  DEBUG = 0,\n  INFO = 1,\n  WARN = 2,\n  ERROR = 3,\n}",
         85 │+      "isTypeOnly": false,
         86 │+      "dependencies": [],
         87 │+      "modifiers": [
         88 │+        "declare"
         89 │+      ]
         90 │+    },
         91 │+    {
         92 │+      "id": "all-export-forms@1.0.0::RequestOptions",
         93 │+      "name": "RequestOptions",
         94 │+      "kind": "InterfaceDeclaration",
         95 │+      "kindName": "InterfaceDeclaration",
         96 │+      "package": "all-export-forms",
         97 │+      "filePath": "options.d.ts",
         98 │+      "signature": "interface RequestOptions {\n  timeout?: number;\n  retries?: number;\n}",
         99 │+      "isTypeOnly": true,
        100 │+      "dependencies": [],
        101 │+      "reExportedFrom": "index.d.ts"
        102 │+    },
        103 │+    {
        104 │+      "id": "all-export-forms@1.0.0::options.d.ts::RequestOptions.retries",
        105 │+      "name": "RequestOptions.retries",
        106 │+      "kind": "PropertyDeclaration",
        107 │+      "kindName": "PropertyDeclaration",
        108 │+      "package": "all-export-forms",
        109 │+      "filePath": "options.d.ts",
        110 │+      "signature": "retries?: number;",
        111 │+      "isTypeOnly": false,
        112 │+      "dependencies": [],
        113 │+      "isInternal": true
        114 │+    },
        115 │+    {
        116 │+      "id": "all-export-forms@1.0.0::options.d.ts::RequestOptions.timeout",
        117 │+      "name": "RequestOptions.timeout",
        118 │+      "kind": "PropertyDeclaration",
        119 │+      "kindName": "PropertyDeclaration",
        120 │+      "package": "all-export-forms",
        121 │+      "filePath": "options.d.ts",
        122 │+      "signature": "timeout?: number;",
        123 │+      "isTypeOnly": false,
        124 │+      "dependencies": [],
        125 │+      "isInternal": true
        126 │+    },
        127 │+    {
        128 │+      "id": "all-export-forms@1.0.0::Router",
        129 │+      "name": "Router",
        130 │+      "kind": "ClassDeclaration",
        131 │+      "kindName": "ClassDeclaration",
        132 │+      "package": "all-export-forms",
        133 │+      "filePath": "internal.d.ts",
        134 │+      "signature": "declare class InternalRouter {\n  add(path: string, handler: any): void;\n}",
        135 │+      "isTypeOnly": false,
        136 │+      "dependencies": [],
        137 │+      "reExportedFrom": "index.d.ts",
        138 │+      "modifiers": [
        139 │+        "declare"
        140 │+      ]
        141 │+    },
        142 │+    {
        143 │+      "id": "all-export-forms@1.0.0::Server",
        144 │+      "name": "Server",
        145 │+      "kind": "ClassDeclaration",
        146 │+      "kindName": "ClassDeclaration",
        147 │+      "package": "all-export-forms",
        148 │+      "filePath": "index.d.ts",
        149 │+      "signature": "declare class Server {\n  constructor(config: Config);\n  listen(): Promise<void>;\n  close(): void;\n}",
        150 │+      "isTypeOnly": false,
        151 │+      "dependencies": [],
        152 │+      "modifiers": [
        153 │+        "declare"
        154 │+      ]
        155 │+    },
        156 │+    {
        157 │+      "id": "all-export-forms@1.0.0::Server.prototype.close",
        158 │+      "name": "Server.prototype.close",
        159 │+      "kind": "MethodDeclaration",
        160 │+      "kindName": "MethodDeclaration",
        161 │+      "package": "all-export-forms",
        162 │+      "filePath": "index.d.ts",
        163 │+      "signature": "close(): void;",
        164 │+      "isTypeOnly": false,
        165 │+      "dependencies": []
        166 │+    },
        167 │+    {
        168 │+      "id": "all-export-forms@1.0.0::Server.prototype.listen",
        169 │+      "name": "Server.prototype.listen",
        170 │+      "kind": "MethodDeclaration",
        171 │+      "kindName": "MethodDeclaration",
        172 │+      "package": "all-export-forms",
        173 │+      "filePath": "index.d.ts",
        174 │+      "signature": "listen(): Promise<void>;",
        175 │+      "isTypeOnly": false,
        176 │+      "dependencies": []
        177 │+    },
        178 │+    {
        179 │+      "id": "all-export-forms@1.0.0::Status",
        180 │+      "name": "Status",
        181 │+      "kind": "TypeAliasDeclaration",
        182 │+      "kindName": "TypeAliasDeclaration",
        183 │+      "package": "all-export-forms",
        184 │+      "filePath": "index.d.ts",
        185 │+      "signature": "type Status = \"active\" | \"inactive\" | \"pending\";",
        186 │+      "isTypeOnly": true,
        187 │+      "dependencies": []
        188 │+    },
        189 │+    {
        190 │+      "id": "all-export-forms@1.0.0::VERSION",
        191 │+      "name": "VERSION",
        192 │+      "kind": "VariableStatement",
        193 │+      "kindName": "VariableStatement",
        194 │+      "package": "all-export-forms",
        195 │+      "filePath": "index.d.ts",
        196 │+      "signature": "declare const VERSION: string",
        197 │+      "isTypeOnly": false,
        198 │+      "dependencies": []
        199 │+    },
        200 │+    {
        201 │+      "id": "all-export-forms@1.0.0::helpers.d.ts::decode",
        202 │+      "name": "decode",
        203 │+      "kind": "FunctionDeclaration",
        204 │+      "kindName": "FunctionDeclaration",
        205 │+      "package": "all-export-forms",
        206 │+      "filePath": "helpers.d.ts",
        207 │+      "signature": "declare function decode(data: string): string;",
        208 │+      "isTypeOnly": false,
        209 │+      "dependencies": [],
        210 │+      "isInternal": true
        211 │+    },
        212 │+    {
        213 │+      "id": "all-export-forms@1.0.0::default",
        214 │+      "name": "default",
        215 │+      "kind": "ExportAssignment",
        216 │+      "kindName": "ExportAssignment",
        217 │+      "package": "all-export-forms",
        218 │+      "filePath": "index.d.ts",
        219 │+      "signature": "export default Server;",
        220 │+      "isTypeOnly": false,
        221 │+      "dependencies": []
        222 │+    },
        223 │+    {
        224 │+      "id": "all-export-forms@1.0.0::helpers.d.ts::encode",
        225 │+      "name": "encode",
        226 │+      "kind": "FunctionDeclaration",
        227 │+      "kindName": "FunctionDeclaration",
        228 │+      "package": "all-export-forms",
        229 │+      "filePath": "helpers.d.ts",
        230 │+      "signature": "declare function encode(data: string): string;",
        231 │+      "isTypeOnly": false,
        232 │+      "dependencies": [],
        233 │+      "isInternal": true
        234 │+    },
        235 │+    {
        236 │+      "id": "all-export-forms@1.0.0::formatDate",
        237 │+      "name": "formatDate",
        238 │+      "kind": "FunctionDeclaration",
        239 │+      "kindName": "FunctionDeclaration",
        240 │+      "package": "all-export-forms",
        241 │+      "filePath": "utils.d.ts",
        242 │+      "signature": "declare function formatDate(date: Date): string;",
        243 │+      "isTypeOnly": false,
        244 │+      "dependencies": []
        245 │+    },
        246 │+    {
        247 │+      "id": "all-export-forms@1.0.0::helpers",
        248 │+      "name": "helpers",
        249 │+      "kind": "ExportDeclaration",
        250 │+      "kindName": "ExportDeclaration",
        251 │+      "package": "all-export-forms",
        252 │+      "filePath": "index.d.ts",
        253 │+      "signature": "export * as helpers from './helpers.js'",
        254 │+      "isTypeOnly": false,
        255 │+      "dependencies": []
        256 │+    },
        257 │+    {
        258 │+      "id": "all-export-forms@1.0.0::helpers.decode",
        259 │+      "name": "helpers.decode",
        260 │+      "kind": "FunctionDeclaration",
        261 │+      "kindName": "FunctionDeclaration",
        262 │+      "package": "all-export-forms",
        263 │+      "filePath": "helpers.d.ts",
        264 │+      "signature": "declare function decode(data: string): string;",
        265 │+      "isTypeOnly": false,
        266 │+      "dependencies": [],
        267 │+      "reExportedFrom": "index.d.ts"
        268 │+    },
        269 │+    {
        270 │+      "id": "all-export-forms@1.0.0::helpers.encode",
        271 │+      "name": "helpers.encode",
        272 │+      "kind": "FunctionDeclaration",
        273 │+      "kindName": "FunctionDeclaration",
        274 │+      "package": "all-export-forms",
        275 │+      "filePath": "helpers.d.ts",
        276 │+      "signature": "declare function encode(data: string): string;",
        277 │+      "isTypeOnly": false,
        278 │+      "dependencies": [],
        279 │+      "reExportedFrom": "index.d.ts"
        280 │+    },
        281 │+    {
        282 │+      "id": "all-export-forms@1.0.0::init",
        283 │+      "name": "init",
        284 │+      "kind": "FunctionDeclaration",
        285 │+      "kindName": "FunctionDeclaration",
        286 │+      "package": "all-export-forms",
        287 │+      "filePath": "index.d.ts",
        288 │+      "signature": "declare function init(config: Config): void;",
        289 │+      "jsDoc": "Initialize the application.",
        290 │+      "isTypeOnly": false,
        291 │+      "dependencies": [
        292 │+        "all-export-forms@1.0.0::Config"
        293 │+      ]
        294 │+    },
        295 │+    {
        296 │+      "id": "all-export-forms@1.0.0::index.d.ts::my-plugin",
        297 │+      "name": "my-plugin",
        298 │+      "kind": "ModuleDeclaration",
        299 │+      "kindName": "ModuleDeclaration",
        300 │+      "package": "all-export-forms",
        301 │+      "filePath": "index.d.ts",
        302 │+      "signature": "declare module \"my-plugin\" { ... }",
        303 │+      "isTypeOnly": false,
        304 │+      "dependencies": [],
        305 │+      "isInternal": true
        306 │+    },
        307 │+    {
        308 │+      "id": "all-export-forms@1.0.0::parseDate",
        309 │+      "name": "parseDate",
        310 │+      "kind": "FunctionDeclaration",
        311 │+      "kindName": "FunctionDeclaration",
        312 │+      "package": "all-export-forms",
        313 │+      "filePath": "utils.d.ts",
        314 │+      "signature": "declare function parseDate(str: string): Date;",
        315 │+      "isTypeOnly": false,
        316 │+      "dependencies": []
        317 │+    }
        318 │+  ],
        319 │+  "totalSymbols": 26,
        320 │+  "totalFiles": 6,
        321 │+  "crawlDurationMs": 0.0
        322 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_enum_declaration' (20288) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_all-export-forms' failed in line 281

---- snapshot_global_augmentation stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_global-augmentation.snap
Snapshot: rust_global-augmentation
Source: C:\Users\doyer\native-context-modules:306
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "global-augmentation",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "global-augmentation@1.0.0::AppState",
          7 │+      "name": "AppState",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "global-augmentation",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface AppState {\n  initialized: boolean;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "global-augmentation@1.0.0::AppState.initialized",
         18 │+      "name": "AppState.initialized",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "global-augmentation",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "initialized: boolean;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "global-augmentation@1.0.0::initApp",
         29 │+      "name": "initApp",
         30 │+      "kind": "FunctionDeclaration",
         31 │+      "kindName": "FunctionDeclaration",
         32 │+      "package": "global-augmentation",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "declare function initApp(): AppState;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": [
         37 │+        "global-augmentation@1.0.0::AppState"
         38 │+      ]
         39 │+    }
         40 │+  ],
         41 │+  "totalSymbols": 3,
         42 │+  "totalFiles": 1,
         43 │+  "crawlDurationMs": 0.0
         44 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_global_augmentation' (13748) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_global-augmentation' failed in line 306

---- snapshot_import_cases stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_import-cases.snap
Snapshot: rust_import-cases
Source: C:\Users\doyer\native-context-modules:300
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "import-cases",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "import-cases@1.0.0::default.d.ts::Default",
          7 │+      "name": "Default",
          8 │+      "kind": "ExportAssignment",
          9 │+      "kindName": "ExportAssignment",
         10 │+      "package": "import-cases",
         11 │+      "filePath": "default.d.ts",
         12 │+      "signature": "export default class Default {}",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "isInternal": true
         16 │+    },
         17 │+    {
         18 │+      "id": "import-cases@1.0.0::Foo",
         19 │+      "name": "Foo",
         20 │+      "kind": "InterfaceDeclaration",
         21 │+      "kindName": "InterfaceDeclaration",
         22 │+      "package": "import-cases",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "interface Foo {}",
         25 │+      "isTypeOnly": true,
         26 │+      "dependencies": []
         27 │+    },
         28 │+    {
         29 │+      "id": "import-cases@1.0.0::handlers.d.ts::Handler",
         30 │+      "name": "Handler",
         31 │+      "kind": "InterfaceDeclaration",
         32 │+      "kindName": "InterfaceDeclaration",
         33 │+      "package": "import-cases",
         34 │+      "filePath": "handlers.d.ts",
         35 │+      "signature": "interface Handler {}",
         36 │+      "isTypeOnly": true,
         37 │+      "dependencies": [],
         38 │+      "isInternal": true
         39 │+    },
         40 │+    {
         41 │+      "id": "import-cases@1.0.0::utils.d.ts::util",
         42 │+      "name": "util",
         43 │+      "kind": "VariableStatement",
         44 │+      "kindName": "VariableStatement",
         45 │+      "package": "import-cases",
         46 │+      "filePath": "utils.d.ts",
         47 │+      "signature": "declare const util: string",
         48 │+      "isTypeOnly": false,
         49 │+      "dependencies": [],
         50 │+      "isInternal": true
         51 │+    }
         52 │+  ],
         53 │+  "totalSymbols": 4,
         54 │+  "totalFiles": 4,
         55 │+  "crawlDurationMs": 0.0
         56 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_import_cases' (8860) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_import-cases' failed in line 300

---- snapshot_inherited_member_flattening stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_inherited-member-flattening.snap
Snapshot: rust_inherited-member-flattening
Source: C:\Users\doyer\native-context-modules:278
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "inherited-member-flattening",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "inherited-member-flattening@1.0.0::BaseInterface",
          7 │+      "name": "BaseInterface",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "inherited-member-flattening",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface BaseInterface {\n    baseFunc(): void;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "since": "1.0.0"
         16 │+    },
         17 │+    {
         18 │+      "id": "inherited-member-flattening@1.0.0::BaseInterface.baseFunc",
         19 │+      "name": "BaseInterface.baseFunc",
         20 │+      "kind": "MethodDeclaration",
         21 │+      "kindName": "MethodDeclaration",
         22 │+      "package": "inherited-member-flattening",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "baseFunc(): void;",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "since": "1.0.0"
         28 │+    },
         29 │+    {
         30 │+      "id": "inherited-member-flattening@1.0.0::BaseNode",
         31 │+      "name": "BaseNode",
         32 │+      "kind": "ClassDeclaration",
         33 │+      "kindName": "ClassDeclaration",
         34 │+      "package": "inherited-member-flattening",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "declare class BaseNode {\n  /** @since 1.0.0 */\n  baseProp: string;\n  /** @since 1.0.0 */\n  commonMethod(): void;\n}",
         37 │+      "isTypeOnly": false,
         38 │+      "dependencies": [],
         39 │+      "since": "1.0.0",
         40 │+      "modifiers": [
         41 │+        "declare"
         42 │+      ]
         43 │+    },
         44 │+    {
         45 │+      "id": "inherited-member-flattening@1.0.0::BaseNode.prototype.baseProp",
         46 │+      "name": "BaseNode.prototype.baseProp",
         47 │+      "kind": "PropertyDeclaration",
         48 │+      "kindName": "PropertyDeclaration",
         49 │+      "package": "inherited-member-flattening",
         50 │+      "filePath": "index.d.ts",
         51 │+      "signature": "baseProp: string;",
         52 │+      "isTypeOnly": false,
         53 │+      "dependencies": [],
         54 │+      "since": "1.0.0"
         55 │+    },
         56 │+    {
         57 │+      "id": "inherited-member-flattening@1.0.0::BaseNode.prototype.commonMethod",
         58 │+      "name": "BaseNode.prototype.commonMethod",
         59 │+      "kind": "MethodDeclaration",
         60 │+      "kindName": "MethodDeclaration",
         61 │+      "package": "inherited-member-flattening",
         62 │+      "filePath": "index.d.ts",
         63 │+      "signature": "commonMethod(): void;",
         64 │+      "isTypeOnly": false,
         65 │+      "dependencies": [],
         66 │+      "since": "1.0.0"
         67 │+    },
         68 │+    {
         69 │+      "id": "inherited-member-flattening@1.0.0::DerivedInterface",
         70 │+      "name": "DerivedInterface",
         71 │+      "kind": "InterfaceDeclaration",
         72 │+      "kindName": "InterfaceDeclaration",
         73 │+      "package": "inherited-member-flattening",
         74 │+      "filePath": "index.d.ts",
         75 │+      "signature": "interface DerivedInterface extends BaseInterface {\n    derivedFunc(): void;\n}",
         76 │+      "isTypeOnly": true,
         77 │+      "dependencies": [
         78 │+        "inherited-member-flattening@1.0.0::BaseInterface"
         79 │+      ],
         80 │+      "since": "2.0.0",
         81 │+      "heritage": [
         82 │+        "BaseInterface"
         83 │+      ]
         84 │+    },
         85 │+    {
         86 │+      "id": "inherited-member-flattening@1.0.0::DerivedInterface.baseFunc",
         87 │+      "name": "DerivedInterface.baseFunc",
         88 │+      "kind": "MethodDeclaration",
         89 │+      "kindName": "MethodDeclaration",
         90 │+      "package": "inherited-member-flattening",
         91 │+      "filePath": "index.d.ts",
         92 │+      "signature": "baseFunc(): void;",
         93 │+      "isTypeOnly": false,
         94 │+      "dependencies": [],
         95 │+      "since": "1.0.0",
         96 │+      "isInherited": true,
         97 │+      "inheritedFrom": "inherited-member-flattening@1.0.0::BaseInterface.baseFunc"
         98 │+    },
         99 │+    {
        100 │+      "id": "inherited-member-flattening@1.0.0::DerivedInterface.derivedFunc",
        101 │+      "name": "DerivedInterface.derivedFunc",
        102 │+      "kind": "MethodDeclaration",
        103 │+      "kindName": "MethodDeclaration",
        104 │+      "package": "inherited-member-flattening",
        105 │+      "filePath": "index.d.ts",
        106 │+      "signature": "derivedFunc(): void;",
        107 │+      "isTypeOnly": false,
        108 │+      "dependencies": [],
        109 │+      "since": "2.0.0"
        110 │+    },
        111 │+    {
        112 │+      "id": "inherited-member-flattening@1.0.0::LeafNode",
        113 │+      "name": "LeafNode",
        114 │+      "kind": "ClassDeclaration",
        115 │+      "kindName": "ClassDeclaration",
        116 │+      "package": "inherited-member-flattening",
        117 │+      "filePath": "index.d.ts",
        118 │+      "signature": "declare class LeafNode extends MiddleNode {\n  /** @since 3.0.0 */\n  leafProp: boolean;\n}",
        119 │+      "isTypeOnly": false,
        120 │+      "dependencies": [
        121 │+        "inherited-member-flattening@1.0.0::MiddleNode"
        122 │+      ],
        123 │+      "since": "3.0.0",
        124 │+      "heritage": [
        125 │+        "MiddleNode"
        126 │+      ],
        127 │+      "modifiers": [
        128 │+        "declare"
        129 │+      ]
        130 │+    },
        131 │+    {
        132 │+      "id": "inherited-member-flattening@1.0.0::LeafNode.prototype.baseProp",
        133 │+      "name": "LeafNode.prototype.baseProp",
        134 │+      "kind": "PropertyDeclaration",
        135 │+      "kindName": "PropertyDeclaration",
        136 │+      "package": "inherited-member-flattening",
        137 │+      "filePath": "index.d.ts",
        138 │+      "signature": "baseProp: string;",
        139 │+      "isTypeOnly": false,
        140 │+      "dependencies": [],
        141 │+      "since": "1.0.0",
        142 │+      "isInherited": true,
        143 │+      "inheritedFrom": "inherited-member-flattening@1.0.0::BaseNode.prototype.baseProp"
        144 │+    },
        145 │+    {
        146 │+      "id": "inherited-member-flattening@1.0.0::LeafNode.prototype.commonMethod",
        147 │+      "name": "LeafNode.prototype.commonMethod",
        148 │+      "kind": "MethodDeclaration",
        149 │+      "kindName": "MethodDeclaration",
        150 │+      "package": "inherited-member-flattening",
        151 │+      "filePath": "index.d.ts",
        152 │+      "signature": "commonMethod(): void;",
        153 │+      "isTypeOnly": false,
        154 │+      "dependencies": [],
        155 │+      "since": "2.1.0",
        156 │+      "isInherited": true,
        157 │+      "inheritedFrom": "inherited-member-flattening@1.0.0::MiddleNode.prototype.commonMethod"
        158 │+    },
        159 │+    {
        160 │+      "id": "inherited-member-flattening@1.0.0::LeafNode.prototype.leafProp",
        161 │+      "name": "LeafNode.prototype.leafProp",
        162 │+      "kind": "PropertyDeclaration",
        163 │+      "kindName": "PropertyDeclaration",
        164 │+      "package": "inherited-member-flattening",
        165 │+      "filePath": "index.d.ts",
        166 │+      "signature": "leafProp: boolean;",
        167 │+      "isTypeOnly": false,
        168 │+      "dependencies": [],
        169 │+      "since": "3.0.0"
        170 │+    },
        171 │+    {
        172 │+      "id": "inherited-member-flattening@1.0.0::LeafNode.prototype.middleProp",
        173 │+      "name": "LeafNode.prototype.middleProp",
        174 │+      "kind": "PropertyDeclaration",
        175 │+      "kindName": "PropertyDeclaration",
        176 │+      "package": "inherited-member-flattening",
        177 │+      "filePath": "index.d.ts",
        178 │+      "signature": "middleProp: number;",
        179 │+      "isTypeOnly": false,
        180 │+      "dependencies": [],
        181 │+      "since": "2.0.0",
        182 │+      "isInherited": true,
        183 │+      "inheritedFrom": "inherited-member-flattening@1.0.0::MiddleNode.prototype.middleProp"
        184 │+    },
        185 │+    {
        186 │+      "id": "inherited-member-flattening@1.0.0::MiddleNode",
        187 │+      "name": "MiddleNode",
        188 │+      "kind": "ClassDeclaration",
        189 │+      "kindName": "ClassDeclaration",
        190 │+      "package": "inherited-member-flattening",
        191 │+      "filePath": "index.d.ts",
        192 │+      "signature": "declare class MiddleNode extends BaseNode {\n  /** @since 2.0.0 */\n  middleProp: number;\n  /** @since 2.1.0 */\n  commonMethod(): void; // Override\n}",
        193 │+      "isTypeOnly": false,
        194 │+      "dependencies": [
        195 │+        "inherited-member-flattening@1.0.0::BaseNode"
        196 │+      ],
        197 │+      "since": "2.0.0",
        198 │+      "heritage": [
        199 │+        "BaseNode"
        200 │+      ],
        201 │+      "modifiers": [
        202 │+        "declare"
        203 │+      ]
        204 │+    },
        205 │+    {
        206 │+      "id": "inherited-member-flattening@1.0.0::MiddleNode.prototype.baseProp",
        207 │+      "name": "MiddleNode.prototype.baseProp",
        208 │+      "kind": "PropertyDeclaration",
        209 │+      "kindName": "PropertyDeclaration",
        210 │+      "package": "inherited-member-flattening",
        211 │+      "filePath": "index.d.ts",
        212 │+      "signature": "baseProp: string;",
        213 │+      "isTypeOnly": false,
        214 │+      "dependencies": [],
        215 │+      "since": "1.0.0",
        216 │+      "isInherited": true,
        217 │+      "inheritedFrom": "inherited-member-flattening@1.0.0::BaseNode.prototype.baseProp"
        218 │+    },
        219 │+    {
        220 │+      "id": "inherited-member-flattening@1.0.0::MiddleNode.prototype.commonMethod",
        221 │+      "name": "MiddleNode.prototype.commonMethod",
        222 │+      "kind": "MethodDeclaration",
        223 │+      "kindName": "MethodDeclaration",
        224 │+      "package": "inherited-member-flattening",
        225 │+      "filePath": "index.d.ts",
        226 │+      "signature": "commonMethod(): void;",
        227 │+      "isTypeOnly": false,
        228 │+      "dependencies": [],
        229 │+      "since": "2.1.0"
        230 │+    },
        231 │+    {
        232 │+      "id": "inherited-member-flattening@1.0.0::MiddleNode.prototype.middleProp",
        233 │+      "name": "MiddleNode.prototype.middleProp",
        234 │+      "kind": "PropertyDeclaration",
        235 │+      "kindName": "PropertyDeclaration",
        236 │+      "package": "inherited-member-flattening",
        237 │+      "filePath": "index.d.ts",
        238 │+      "signature": "middleProp: number;",
        239 │+      "isTypeOnly": false,
        240 │+      "dependencies": [],
        241 │+      "since": "2.0.0"
        242 │+    }
        243 │+  ],
        244 │+  "totalSymbols": 17,
        245 │+  "totalFiles": 1,
        246 │+  "crawlDurationMs": 0.0
        247 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_inherited_member_flattening' (58096) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_inherited-member-flattening' failed in line 278

---- snapshot_inline_import_type stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_inline-import-type.snap
Snapshot: rust_inline-import-type
Source: C:\Users\doyer\native-context-modules:304
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "inline-import-type",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "inline-import-type@1.0.0::NoQualifier",
          7 │+      "name": "NoQualifier",
          8 │+      "kind": "TypeAliasDeclaration",
          9 │+      "kindName": "TypeAliasDeclaration",
         10 │+      "package": "inline-import-type",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "type NoQualifier = import(\"./none.js\");",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "inline-import-type@1.0.0::OtherKey",
         18 │+      "name": "OtherKey",
         19 │+      "kind": "TypeAliasDeclaration",
         20 │+      "kindName": "TypeAliasDeclaration",
         21 │+      "package": "inline-import-type",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "type OtherKey = import(\"./other.js\").OtherKey;",
         24 │+      "isTypeOnly": true,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "inline-import-type@1.0.0::VisitorKeys",
         29 │+      "name": "VisitorKeys",
         30 │+      "kind": "TypeAliasDeclaration",
         31 │+      "kindName": "TypeAliasDeclaration",
         32 │+      "package": "inline-import-type",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "type VisitorKeys = import(\"./visitor-keys.js\").VisitorKeys;",
         35 │+      "isTypeOnly": true,
         36 │+      "dependencies": []
         37 │+    }
         38 │+  ],
         39 │+  "totalSymbols": 3,
         40 │+  "totalFiles": 1,
         41 │+  "crawlDurationMs": 0.0
         42 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_inline_import_type' (60296) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_inline-import-type' failed in line 304

---- snapshot_literal_export stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_literal-export.snap
Snapshot: rust_literal-export
Source: C:\Users\doyer\native-context-modules:288
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "literal-export",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "literal-export@1.0.0::default",
          7 │+      "name": "default",
          8 │+      "kind": "ExportAssignment",
          9 │+      "kindName": "ExportAssignment",
         10 │+      "package": "literal-export",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "export default 123;",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    }
         16 │+  ],
         17 │+  "totalSymbols": 1,
         18 │+  "totalFiles": 1,
         19 │+  "crawlDurationMs": 0.0
         20 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_literal_export' (18260) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_literal-export' failed in line 288

---- snapshot_local_export stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_local-export.snap
Snapshot: rust_local-export
Source: C:\Users\doyer\native-context-modules:298
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "local-export",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "local-export@1.0.0::Local",
          7 │+      "name": "Local",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "local-export",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Local { id: string }",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "local-export@1.0.0::Local#2",
         18 │+      "name": "Local",
         19 │+      "kind": "ExportDeclaration",
         20 │+      "kindName": "ExportDeclaration",
         21 │+      "package": "local-export",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "export { Local }",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "local-export@1.0.0::Local.id",
         29 │+      "name": "Local.id",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "local-export",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "id: string",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "local-export@1.0.0::Local.id#2",
         40 │+      "name": "Local.id",
         41 │+      "kind": "PropertyDeclaration",
         42 │+      "kindName": "PropertyDeclaration",
         43 │+      "package": "local-export",
         44 │+      "filePath": "index.d.ts",
         45 │+      "signature": "id: string",
         46 │+      "isTypeOnly": false,
         47 │+      "dependencies": []
         48 │+    }
         49 │+  ],
         50 │+  "totalSymbols": 4,
         51 │+  "totalFiles": 1,
         52 │+  "crawlDurationMs": 0.0
         53 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_local_export' (48780) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_local-export' failed in line 298

---- snapshot_local_reexport stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_local-reexport.snap
Snapshot: rust_local-reexport
Source: C:\Users\doyer\native-context-modules:297
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "local-reexport",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "local-reexport@1.0.0::External",
          7 │+      "name": "External",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "local-reexport",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Internal {\n  id: string;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "local-reexport@1.0.0::External.id",
         18 │+      "name": "External.id",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "local-reexport",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "id: string;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "local-reexport@1.0.0::index.d.ts::Internal",
         29 │+      "name": "Internal",
         30 │+      "kind": "InterfaceDeclaration",
         31 │+      "kindName": "InterfaceDeclaration",
         32 │+      "package": "local-reexport",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "interface Internal {\n  id: string;\n}",
         35 │+      "isTypeOnly": true,
         36 │+      "dependencies": [],
         37 │+      "isInternal": true
         38 │+    },
         39 │+    {
         40 │+      "id": "local-reexport@1.0.0::index.d.ts::Internal.id",
         41 │+      "name": "Internal.id",
         42 │+      "kind": "PropertyDeclaration",
         43 │+      "kindName": "PropertyDeclaration",
         44 │+      "package": "local-reexport",
         45 │+      "filePath": "index.d.ts",
         46 │+      "signature": "id: string;",
         47 │+      "isTypeOnly": false,
         48 │+      "dependencies": [],
         49 │+      "isInternal": true
         50 │+    },
         51 │+    {
         52 │+      "id": "local-reexport@1.0.0::default",
         53 │+      "name": "default",
         54 │+      "kind": "ExportAssignment",
         55 │+      "kindName": "ExportAssignment",
         56 │+      "package": "local-reexport",
         57 │+      "filePath": "index.d.ts",
         58 │+      "signature": "export default x;",
         59 │+      "isTypeOnly": false,
         60 │+      "dependencies": []
         61 │+    },
         62 │+    {
         63 │+      "id": "local-reexport@1.0.0::index.d.ts::x",
         64 │+      "name": "x",
         65 │+      "kind": "VariableStatement",
         66 │+      "kindName": "VariableStatement",
         67 │+      "package": "local-reexport",
         68 │+      "filePath": "index.d.ts",
         69 │+      "signature": "declare const x: number",
         70 │+      "isTypeOnly": false,
         71 │+      "dependencies": [],
         72 │+      "isInternal": true
         73 │+    }
         74 │+  ],
         75 │+  "totalSymbols": 6,
         76 │+  "totalFiles": 1,
         77 │+  "crawlDurationMs": 0.0
         78 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_local_reexport' (10144) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_local-reexport' failed in line 297

---- snapshot_merged_symbols stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_merged-symbols.snap
Snapshot: rust_merged-symbols
Source: C:\Users\doyer\native-context-modules:301
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "merged-symbols",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "merged-symbols@1.0.0::merged",
          7 │+      "name": "merged",
          8 │+      "kind": "ModuleDeclaration",
          9 │+      "kindName": "ModuleDeclaration",
         10 │+      "package": "merged-symbols",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare namespace merged { ... }",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    }
         16 │+  ],
         17 │+  "totalSymbols": 1,
         18 │+  "totalFiles": 1,
         19 │+  "crawlDurationMs": 0.0
         20 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_merged_symbols' (60396) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_merged-symbols' failed in line 301

---- snapshot_mixin_composition stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_mixin-composition.snap
Snapshot: rust_mixin-composition
Source: C:\Users\doyer\native-context-modules:307
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "mixin-composition",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "mixin-composition@1.0.0::Base",
          7 │+      "name": "Base",
          8 │+      "kind": "ClassDeclaration",
          9 │+      "kindName": "ClassDeclaration",
         10 │+      "package": "mixin-composition",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare class Base {\n  /** @since 1.0.0 */\n  baseMethod(): void;\n}",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "modifiers": [
         16 │+        "declare"
         17 │+      ]
         18 │+    },
         19 │+    {
         20 │+      "id": "mixin-composition@1.0.0::Base.prototype.baseMethod",
         21 │+      "name": "Base.prototype.baseMethod",
         22 │+      "kind": "MethodDeclaration",
         23 │+      "kindName": "MethodDeclaration",
         24 │+      "package": "mixin-composition",
         25 │+      "filePath": "index.d.ts",
         26 │+      "signature": "baseMethod(): void;",
         27 │+      "isTypeOnly": false,
         28 │+      "dependencies": [],
         29 │+      "since": "1.0.0"
         30 │+    },
         31 │+    {
         32 │+      "id": "mixin-composition@1.0.0::Mixed",
         33 │+      "name": "Mixed",
         34 │+      "kind": "VariableStatement",
         35 │+      "kindName": "VariableStatement",
         36 │+      "package": "mixin-composition",
         37 │+      "filePath": "index.d.ts",
         38 │+      "signature": "declare const Mixed: typeof Base & {\n  /** @since 2.1.0 */\n  staticExtra(): number;\n} & {\n  prototype: {\n    /** @since 2.2.0 */\n    mixinMethod(): string;\n  }\n}",
         39 │+      "isTypeOnly": false,
         40 │+      "dependencies": [
         41 │+        "mixin-composition@1.0.0::Base"
         42 │+      ],
         43 │+      "since": "2.0.0"
         44 │+    }
         45 │+  ],
         46 │+  "totalSymbols": 3,
         47 │+  "totalFiles": 1,
         48 │+  "crawlDurationMs": 0.0
         49 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_mixin_composition' (31872) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_mixin-composition' failed in line 307

---- snapshot_multi_star_exports stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_multi-star-exports.snap
Snapshot: rust_multi-star-exports
Source: C:\Users\doyer\native-context-modules:296
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "multi-star-exports",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "multi-star-exports@1.0.0::a_b_val",
          7 │+      "name": "a_b_val",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "multi-star-exports",
         11 │+      "filePath": "dist/a/b/index.d.ts",
         12 │+      "signature": "declare const a_b_val: number",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "since": "1.0.0"
         16 │+    },
         17 │+    {
         18 │+      "id": "multi-star-exports@1.0.0::x_y_val",
         19 │+      "name": "x_y_val",
         20 │+      "kind": "VariableStatement",
         21 │+      "kindName": "VariableStatement",
         22 │+      "package": "multi-star-exports",
         23 │+      "filePath": "dist/x/y/index.d.ts",
         24 │+      "signature": "declare const x_y_val: number",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "since": "1.0.0"
         28 │+    }
         29 │+  ],
         30 │+  "totalSymbols": 2,
         31 │+  "totalFiles": 2,
         32 │+  "crawlDurationMs": 0.0
         33 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_multi_star_exports' (28540) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_multi-star-exports' failed in line 296

---- snapshot_name_collision stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_name-collision.snap
Snapshot: rust_name-collision
Source: C:\Users\doyer\native-context-modules:302
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "name-collision",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "name-collision@1.0.0::ChannelConfig",
          7 │+      "name": "ChannelConfig",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "name-collision",
         11 │+      "filePath": "dist/channel.d.ts",
         12 │+      "signature": "interface ChannelConfig {\n  maxRetries: number;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "name-collision@1.0.0::ChannelConfig.maxRetries",
         18 │+      "name": "ChannelConfig.maxRetries",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "name-collision",
         22 │+      "filePath": "dist/channel.d.ts",
         23 │+      "signature": "maxRetries: number;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "name-collision@1.0.0::Config",
         29 │+      "name": "Config",
         30 │+      "kind": "InterfaceDeclaration",
         31 │+      "kindName": "InterfaceDeclaration",
         32 │+      "package": "name-collision",
         33 │+      "filePath": "dist/index.d.ts",
         34 │+      "signature": "interface Config {\n  name: string;\n}",
         35 │+      "isTypeOnly": true,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "name-collision@1.0.0::Config.name",
         40 │+      "name": "Config.name",
         41 │+      "kind": "PropertyDeclaration",
         42 │+      "kindName": "PropertyDeclaration",
         43 │+      "package": "name-collision",
         44 │+      "filePath": "dist/index.d.ts",
         45 │+      "signature": "name: string;",
         46 │+      "isTypeOnly": false,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "name-collision@1.0.0::StreamConfig",
         51 │+      "name": "StreamConfig",
         52 │+      "kind": "InterfaceDeclaration",
         53 │+      "kindName": "InterfaceDeclaration",
         54 │+      "package": "name-collision",
         55 │+      "filePath": "dist/stream.d.ts",
         56 │+      "signature": "interface StreamConfig {\n  bufferSize: number;\n}",
         57 │+      "isTypeOnly": true,
         58 │+      "dependencies": []
         59 │+    },
         60 │+    {
         61 │+      "id": "name-collision@1.0.0::StreamConfig.bufferSize",
         62 │+      "name": "StreamConfig.bufferSize",
         63 │+      "kind": "PropertyDeclaration",
         64 │+      "kindName": "PropertyDeclaration",
         65 │+      "package": "name-collision",
         66 │+      "filePath": "dist/stream.d.ts",
         67 │+      "signature": "bufferSize: number;",
         68 │+      "isTypeOnly": false,
         69 │+      "dependencies": []
         70 │+    },
         71 │+    {
         72 │+      "id": "name-collision@1.0.0::identity",
         73 │+      "name": "identity",
         74 │+      "kind": "VariableStatement",
         75 │+      "kindName": "VariableStatement",
         76 │+      "package": "name-collision",
         77 │+      "filePath": "dist/index.d.ts",
         78 │+      "signature": "declare const identity: <A>(a: A) => A",
         79 │+      "jsDoc": "The identity function.",
         80 │+      "isTypeOnly": false,
         81 │+      "dependencies": []
         82 │+    },
         83 │+    {
         84 │+      "id": "name-collision@1.0.0::identity#2",
         85 │+      "name": "identity",
         86 │+      "kind": "VariableStatement",
         87 │+      "kindName": "VariableStatement",
         88 │+      "package": "name-collision",
         89 │+      "filePath": "dist/stream.d.ts",
         90 │+      "signature": "declare const identity: <A>(stream: StreamConfig) => StreamConfig",
         91 │+      "jsDoc": "Stream identity — passes through unchanged.",
         92 │+      "isTypeOnly": false,
         93 │+      "dependencies": [
         94 │+        "name-collision@1.0.0::StreamConfig"
         95 │+      ]
         96 │+    },
         97 │+    {
         98 │+      "id": "name-collision@1.0.0::identity#3",
         99 │+      "name": "identity",
        100 │+      "kind": "VariableStatement",
        101 │+      "kindName": "VariableStatement",
        102 │+      "package": "name-collision",
        103 │+      "filePath": "dist/channel.d.ts",
        104 │+      "signature": "declare const identity: <A>(channel: ChannelConfig) => ChannelConfig",
        105 │+      "jsDoc": "Channel identity — passes through unchanged.",
        106 │+      "isTypeOnly": false,
        107 │+      "dependencies": [
        108 │+        "name-collision@1.0.0::ChannelConfig"
        109 │+      ]
        110 │+    }
        111 │+  ],
        112 │+  "totalSymbols": 9,
        113 │+  "totalFiles": 3,
        114 │+  "crawlDurationMs": 0.0
        115 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_name_collision' (56580) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_name-collision' failed in line 302

---- snapshot_namespace_cases stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_namespace-cases.snap
Snapshot: rust_namespace-cases
Source: C:\Users\doyer\native-context-modules:276
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "namespace-cases",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "namespace-cases@1.0.0::API",
          7 │+      "name": "API",
          8 │+      "kind": "ModuleDeclaration",
          9 │+      "kindName": "ModuleDeclaration",
         10 │+      "package": "namespace-cases",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "namespace API { ... }",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "namespace-cases@1.0.0::API.hidden",
         18 │+      "name": "API.hidden",
         19 │+      "kind": "VariableStatement",
         20 │+      "kindName": "VariableStatement",
         21 │+      "package": "namespace-cases",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "declare const hidden: number",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "namespace-cases@1.0.0::Widget",
         29 │+      "name": "Widget",
         30 │+      "kind": "InterfaceDeclaration",
         31 │+      "kindName": "InterfaceDeclaration",
         32 │+      "package": "namespace-cases",
         33 │+      "filePath": "index.d.ts",
         34 │+      "signature": "interface Widget {\n  id: string;\n}",
         35 │+      "isTypeOnly": true,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "namespace-cases@1.0.0::Widget.id",
         40 │+      "name": "Widget.id",
         41 │+      "kind": "PropertyDeclaration",
         42 │+      "kindName": "PropertyDeclaration",
         43 │+      "package": "namespace-cases",
         44 │+      "filePath": "index.d.ts",
         45 │+      "signature": "id: string;",
         46 │+      "isTypeOnly": false,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "namespace-cases@1.0.0::createWidget",
         51 │+      "name": "createWidget",
         52 │+      "kind": "FunctionDeclaration",
         53 │+      "kindName": "FunctionDeclaration",
         54 │+      "package": "namespace-cases",
         55 │+      "filePath": "index.d.ts",
         56 │+      "signature": "function createWidget(): Widget;",
         57 │+      "isTypeOnly": false,
         58 │+      "dependencies": [
         59 │+        "namespace-cases@1.0.0::Widget"
         60 │+      ]
         61 │+    }
         62 │+  ],
         63 │+  "totalSymbols": 5,
         64 │+  "totalFiles": 1,
         65 │+  "crawlDurationMs": 0.0
         66 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_namespace_cases' (32532) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_namespace-cases' failed in line 276

---- snapshot_namespace_reexport stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_namespace-reexport.snap
Snapshot: rust_namespace-reexport
Source: C:\Users\doyer\native-context-modules:295
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "namespace-reexport",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "namespace-reexport@1.0.0::CORE_VERSION",
          7 │+      "name": "CORE_VERSION",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "namespace-reexport",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare const CORE_VERSION: any",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "namespace-reexport@1.0.0::Lib",
         18 │+      "name": "Lib",
         19 │+      "kind": "ExportDeclaration",
         20 │+      "kindName": "ExportDeclaration",
         21 │+      "package": "namespace-reexport",
         22 │+      "filePath": "index.d.ts",
         23 │+      "signature": "export * as Lib from './lib.js'",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "namespace-reexport@1.0.0::Lib.VERSION",
         29 │+      "name": "Lib.VERSION",
         30 │+      "kind": "VariableStatement",
         31 │+      "kindName": "VariableStatement",
         32 │+      "package": "namespace-reexport",
         33 │+      "filePath": "lib.d.ts",
         34 │+      "signature": "declare const VERSION: any",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": [],
         37 │+      "reExportedFrom": "index.d.ts"
         38 │+    },
         39 │+    {
         40 │+      "id": "namespace-reexport@1.0.0::Lib.internal",
         41 │+      "name": "Lib.internal",
         42 │+      "kind": "FunctionDeclaration",
         43 │+      "kindName": "FunctionDeclaration",
         44 │+      "package": "namespace-reexport",
         45 │+      "filePath": "lib.d.ts",
         46 │+      "signature": "function internal(): void;",
         47 │+      "isTypeOnly": false,
         48 │+      "dependencies": [],
         49 │+      "reExportedFrom": "index.d.ts"
         50 │+    },
         51 │+    {
         52 │+      "id": "namespace-reexport@1.0.0::lib.d.ts::VERSION",
         53 │+      "name": "VERSION",
         54 │+      "kind": "VariableStatement",
         55 │+      "kindName": "VariableStatement",
         56 │+      "package": "namespace-reexport",
         57 │+      "filePath": "lib.d.ts",
         58 │+      "signature": "declare const VERSION: any",
         59 │+      "isTypeOnly": false,
         60 │+      "dependencies": [],
         61 │+      "isInternal": true
         62 │+    },
         63 │+    {
         64 │+      "id": "namespace-reexport@1.0.0::lib.d.ts::internal",
         65 │+      "name": "internal",
         66 │+      "kind": "FunctionDeclaration",
         67 │+      "kindName": "FunctionDeclaration",
         68 │+      "package": "namespace-reexport",
         69 │+      "filePath": "lib.d.ts",
         70 │+      "signature": "function internal(): void;",
         71 │+      "isTypeOnly": false,
         72 │+      "dependencies": [],
         73 │+      "isInternal": true
         74 │+    }
         75 │+  ],
         76 │+  "totalSymbols": 6,
         77 │+  "totalFiles": 2,
         78 │+  "crawlDurationMs": 0.0
         79 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_namespace_reexport' (18024) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_namespace-reexport' failed in line 295

---- snapshot_nested_prefix stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_nested-prefix.snap
Snapshot: rust_nested-prefix
Source: C:\Users\doyer\native-context-modules:299
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "nested-prefix",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "nested-prefix@1.0.0::Mid",
          7 │+      "name": "Mid",
          8 │+      "kind": "ExportDeclaration",
          9 │+      "kindName": "ExportDeclaration",
         10 │+      "package": "nested-prefix",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "export * as Mid from './mid.js'",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "nested-prefix@1.0.0::Mid.Inner",
         18 │+      "name": "Mid.Inner",
         19 │+      "kind": "ExportDeclaration",
         20 │+      "kindName": "ExportDeclaration",
         21 │+      "package": "nested-prefix",
         22 │+      "filePath": "mid.d.ts",
         23 │+      "signature": "export * as Inner from './inner.js'",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": [],
         26 │+      "reExportedFrom": "index.d.ts"
         27 │+    },
         28 │+    {
         29 │+      "id": "nested-prefix@1.0.0::Mid.Inner.val",
         30 │+      "name": "Mid.Inner.val",
         31 │+      "kind": "VariableStatement",
         32 │+      "kindName": "VariableStatement",
         33 │+      "package": "nested-prefix",
         34 │+      "filePath": "inner.d.ts",
         35 │+      "signature": "declare const val: any",
         36 │+      "isTypeOnly": false,
         37 │+      "dependencies": [],
         38 │+      "reExportedFrom": "index.d.ts"
         39 │+    },
         40 │+    {
         41 │+      "id": "nested-prefix@1.0.0::inner.d.ts::val",
         42 │+      "name": "val",
         43 │+      "kind": "VariableStatement",
         44 │+      "kindName": "VariableStatement",
         45 │+      "package": "nested-prefix",
         46 │+      "filePath": "inner.d.ts",
         47 │+      "signature": "declare const val: any",
         48 │+      "isTypeOnly": false,
         49 │+      "dependencies": [],
         50 │+      "isInternal": true
         51 │+    }
         52 │+  ],
         53 │+  "totalSymbols": 4,
         54 │+  "totalFiles": 3,
         55 │+  "crawlDurationMs": 0.0
         56 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_nested_prefix' (15008) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_nested-prefix' failed in line 299

---- snapshot_no_types_pkg stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_no-types-pkg.snap
Snapshot: rust_no-types-pkg
Source: C:\Users\doyer\native-context-modules:293
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "no-types-pkg",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [],
          5 │+  "totalSymbols": 0,
          6 │+  "totalFiles": 0,
          7 │+  "crawlDurationMs": 0.0
          8 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_no_types_pkg' (62400) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_no-types-pkg' failed in line 293

---- snapshot_parser_edge_case stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_parser-edge-case.snap
Snapshot: rust_parser-edge-case
Source: C:\Users\doyer\native-context-modules:286
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "parser-edge-case",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "parser-edge-case@1.0.0::index.d.ts::Inherit",
          7 │+      "name": "Inherit",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "parser-edge-case",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Inherit extends External.Base {}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "isInternal": true
         16 │+    },
         17 │+    {
         18 │+      "id": "parser-edge-case@1.0.0::MyType",
         19 │+      "name": "MyType",
         20 │+      "kind": "ExportDeclaration",
         21 │+      "kindName": "ExportDeclaration",
         22 │+      "package": "parser-edge-case",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "export type { MyType } from './mod'",
         25 │+      "isTypeOnly": true,
         26 │+      "dependencies": []
         27 │+    },
         28 │+    {
         29 │+      "id": "parser-edge-case@1.0.0::index.d.ts::TypeA",
         30 │+      "name": "TypeA",
         31 │+      "kind": "TypeAliasDeclaration",
         32 │+      "kindName": "TypeAliasDeclaration",
         33 │+      "package": "parser-edge-case",
         34 │+      "filePath": "index.d.ts",
         35 │+      "signature": "type TypeA = import(\"pkg\").Inner.Type;",
         36 │+      "isTypeOnly": true,
         37 │+      "dependencies": [],
         38 │+      "isInternal": true
         39 │+    },
         40 │+    {
         41 │+      "id": "parser-edge-case@1.0.0::default",
         42 │+      "name": "default",
         43 │+      "kind": "ExportAssignment",
         44 │+      "kindName": "ExportAssignment",
         45 │+      "package": "parser-edge-case",
         46 │+      "filePath": "index.d.ts",
         47 │+      "signature": "export default localRef;",
         48 │+      "isTypeOnly": false,
         49 │+      "dependencies": []
         50 │+    },
         51 │+    {
         52 │+      "id": "parser-edge-case@1.0.0::default#2",
         53 │+      "name": "default",
         54 │+      "kind": "ExportAssignment",
         55 │+      "kindName": "ExportAssignment",
         56 │+      "package": "parser-edge-case",
         57 │+      "filePath": "index.d.ts",
         58 │+      "signature": "export default { key: 'val' };",
         59 │+      "isTypeOnly": false,
         60 │+      "dependencies": []
         61 │+    },
         62 │+    {
         63 │+      "id": "parser-edge-case@1.0.0::default#3",
         64 │+      "name": "default",
         65 │+      "kind": "ExportAssignment",
         66 │+      "kindName": "ExportAssignment",
         67 │+      "package": "parser-edge-case",
         68 │+      "filePath": "index.d.ts",
         69 │+      "signature": "export default localRef;",
         70 │+      "isTypeOnly": false,
         71 │+      "dependencies": []
         72 │+    },
         73 │+    {
         74 │+      "id": "parser-edge-case@1.0.0::default#4",
         75 │+      "name": "default",
         76 │+      "kind": "ExportAssignment",
         77 │+      "kindName": "ExportAssignment",
         78 │+      "package": "parser-edge-case",
         79 │+      "filePath": "index.d.ts",
         80 │+      "signature": "export default { key: 'val' };",
         81 │+      "isTypeOnly": false,
         82 │+      "dependencies": []
         83 │+    },
         84 │+    {
         85 │+      "id": "parser-edge-case@1.0.0::index.d.ts::localRef",
         86 │+      "name": "localRef",
         87 │+      "kind": "VariableStatement",
         88 │+      "kindName": "VariableStatement",
         89 │+      "package": "parser-edge-case",
         90 │+      "filePath": "index.d.ts",
         91 │+      "signature": "declare const localRef: any",
         92 │+      "isTypeOnly": false,
         93 │+      "dependencies": [],
         94 │+      "isInternal": true
         95 │+    },
         96 │+    {
         97 │+      "id": "parser-edge-case@1.0.0::namespacedImport",
         98 │+      "name": "namespacedImport",
         99 │+      "kind": "ExportDeclaration",
        100 │+      "kindName": "ExportDeclaration",
        101 │+      "package": "parser-edge-case",
        102 │+      "filePath": "index.d.ts",
        103 │+      "signature": "export * as namespacedImport from './mod'",
        104 │+      "isTypeOnly": false,
        105 │+      "dependencies": []
        106 │+    }
        107 │+  ],
        108 │+  "totalSymbols": 9,
        109 │+  "totalFiles": 1,
        110 │+  "crawlDurationMs": 0.0
        111 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_parser_edge_case' (16404) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_parser-edge-case' failed in line 286

---- snapshot_re_export_chain stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_re-export-chain.snap
Snapshot: rust_re-export-chain
Source: C:\Users\doyer\native-context-modules:275
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "re-export-chain",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "re-export-chain@1.0.0::Server",
          7 │+      "name": "Server",
          8 │+      "kind": "ClassDeclaration",
          9 │+      "kindName": "ClassDeclaration",
         10 │+      "package": "re-export-chain",
         11 │+      "filePath": "lib/core.d.ts",
         12 │+      "signature": "declare class Server {\n  constructor(options: ServerOptions);\n  listen(): Promise<void>;\n  close(): void;\n}",
         13 │+      "jsDoc": "A basic HTTP server.",
         14 │+      "isTypeOnly": false,
         15 │+      "dependencies": [],
         16 │+      "reExportedFrom": "index.d.ts",
         17 │+      "modifiers": [
         18 │+        "declare"
         19 │+      ]
         20 │+    },
         21 │+    {
         22 │+      "id": "re-export-chain@1.0.0::lib/core.d.ts::Server.prototype.close",
         23 │+      "name": "Server.prototype.close",
         24 │+      "kind": "MethodDeclaration",
         25 │+      "kindName": "MethodDeclaration",
         26 │+      "package": "re-export-chain",
         27 │+      "filePath": "lib/core.d.ts",
         28 │+      "signature": "close(): void;",
         29 │+      "jsDoc": "A basic HTTP server.",
         30 │+      "isTypeOnly": false,
         31 │+      "dependencies": [],
         32 │+      "isInternal": true
         33 │+    },
         34 │+    {
         35 │+      "id": "re-export-chain@1.0.0::lib/core.d.ts::Server.prototype.listen",
         36 │+      "name": "Server.prototype.listen",
         37 │+      "kind": "MethodDeclaration",
         38 │+      "kindName": "MethodDeclaration",
         39 │+      "package": "re-export-chain",
         40 │+      "filePath": "lib/core.d.ts",
         41 │+      "signature": "listen(): Promise<void>;",
         42 │+      "jsDoc": "A basic HTTP server.",
         43 │+      "isTypeOnly": false,
         44 │+      "dependencies": [],
         45 │+      "isInternal": true
         46 │+    },
         47 │+    {
         48 │+      "id": "re-export-chain@1.0.0::ServerOptions",
         49 │+      "name": "ServerOptions",
         50 │+      "kind": "InterfaceDeclaration",
         51 │+      "kindName": "InterfaceDeclaration",
         52 │+      "package": "re-export-chain",
         53 │+      "filePath": "lib/core.d.ts",
         54 │+      "signature": "interface ServerOptions {\n  port: number;\n  host?: string;\n}",
         55 │+      "jsDoc": "Options for creating a Server instance.",
         56 │+      "isTypeOnly": true,
         57 │+      "dependencies": [],
         58 │+      "reExportedFrom": "index.d.ts"
         59 │+    },
         60 │+    {
         61 │+      "id": "re-export-chain@1.0.0::lib/core.d.ts::ServerOptions.host",
         62 │+      "name": "ServerOptions.host",
         63 │+      "kind": "PropertyDeclaration",
         64 │+      "kindName": "PropertyDeclaration",
         65 │+      "package": "re-export-chain",
         66 │+      "filePath": "lib/core.d.ts",
         67 │+      "signature": "host?: string;",
         68 │+      "jsDoc": "Options for creating a Server instance.",
         69 │+      "isTypeOnly": false,
         70 │+      "dependencies": [],
         71 │+      "isInternal": true
         72 │+    },
         73 │+    {
         74 │+      "id": "re-export-chain@1.0.0::lib/core.d.ts::ServerOptions.port",
         75 │+      "name": "ServerOptions.port",
         76 │+      "kind": "PropertyDeclaration",
         77 │+      "kindName": "PropertyDeclaration",
         78 │+      "package": "re-export-chain",
         79 │+      "filePath": "lib/core.d.ts",
         80 │+      "signature": "port: number;",
         81 │+      "jsDoc": "Options for creating a Server instance.",
         82 │+      "isTypeOnly": false,
         83 │+      "dependencies": [],
         84 │+      "isInternal": true
         85 │+    }
         86 │+  ],
         87 │+  "totalSymbols": 6,
         88 │+  "totalFiles": 2,
         89 │+  "crawlDurationMs": 0.0
         90 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_re_export_chain' (52668) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_re-export-chain' failed in line 275

---- snapshot_simple_export stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_simple-export.snap
Snapshot: rust_simple-export
Source: C:\Users\doyer\native-context-modules:274
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "simple-export",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "simple-export@1.0.0::Config",
          7 │+      "name": "Config",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "simple-export",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Config {\n  name: string;\n  version: string;\n  debug?: boolean;\n}",
         13 │+      "jsDoc": "A simple configuration interface.",
         14 │+      "isTypeOnly": true,
         15 │+      "dependencies": []
         16 │+    },
         17 │+    {
         18 │+      "id": "simple-export@1.0.0::Config.debug",
         19 │+      "name": "Config.debug",
         20 │+      "kind": "PropertyDeclaration",
         21 │+      "kindName": "PropertyDeclaration",
         22 │+      "package": "simple-export",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "debug?: boolean;",
         25 │+      "jsDoc": "A simple configuration interface.",
         26 │+      "isTypeOnly": false,
         27 │+      "dependencies": []
         28 │+    },
         29 │+    {
         30 │+      "id": "simple-export@1.0.0::Config.name",
         31 │+      "name": "Config.name",
         32 │+      "kind": "PropertyDeclaration",
         33 │+      "kindName": "PropertyDeclaration",
         34 │+      "package": "simple-export",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "name: string;",
         37 │+      "jsDoc": "A simple configuration interface.",
         38 │+      "isTypeOnly": false,
         39 │+      "dependencies": []
         40 │+    },
         41 │+    {
         42 │+      "id": "simple-export@1.0.0::Config.version",
         43 │+      "name": "Config.version",
         44 │+      "kind": "PropertyDeclaration",
         45 │+      "kindName": "PropertyDeclaration",
         46 │+      "package": "simple-export",
         47 │+      "filePath": "index.d.ts",
         48 │+      "signature": "version: string;",
         49 │+      "jsDoc": "A simple configuration interface.",
         50 │+      "isTypeOnly": false,
         51 │+      "dependencies": []
         52 │+    },
         53 │+    {
         54 │+      "id": "simple-export@1.0.0::init",
         55 │+      "name": "init",
         56 │+      "kind": "FunctionDeclaration",
         57 │+      "kindName": "FunctionDeclaration",
         58 │+      "package": "simple-export",
         59 │+      "filePath": "index.d.ts",
         60 │+      "signature": "declare function init(config: Config): void;",
         61 │+      "jsDoc": "Initialize the application with the given config.",
         62 │+      "isTypeOnly": false,
         63 │+      "dependencies": [
         64 │+        "simple-export@1.0.0::Config"
         65 │+      ]
         66 │+    }
         67 │+  ],
         68 │+  "totalSymbols": 5,
         69 │+  "totalFiles": 1,
         70 │+  "crawlDurationMs": 0.0
         71 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_simple_export' (54480) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_simple-export' failed in line 274

---- snapshot_since_inheritance stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_since-inheritance.snap
Snapshot: rust_since-inheritance
Source: C:\Users\doyer\native-context-modules:309
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "since-inheritance",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "since-inheritance@1.0.0::Database",
          7 │+      "name": "Database",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "since-inheritance",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare const Database: {\n  /** Database connection pool */\n  pool: any;\n}",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": [],
         15 │+      "since": "1.5.0"
         16 │+    }
         17 │+  ],
         18 │+  "totalSymbols": 1,
         19 │+  "totalFiles": 1,
         20 │+  "crawlDurationMs": 0.0
         21 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_since_inheritance' (29768) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_since-inheritance' failed in line 309

---- snapshot_string_exports stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_string-exports.snap
Snapshot: rust_string-exports
Source: C:\Users\doyer\native-context-modules:294
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "string-exports-pkg",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "string-exports-pkg@1.0.0::VERSION",
          7 │+      "name": "VERSION",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "string-exports-pkg",
         11 │+      "filePath": "lib/index.d.ts",
         12 │+      "signature": "declare const VERSION: string",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    }
         16 │+  ],
         17 │+  "totalSymbols": 1,
         18 │+  "totalFiles": 1,
         19 │+  "crawlDurationMs": 0.0
         20 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_string_exports' (13276) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_string-exports' failed in line 294

---- snapshot_subpath_exports stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_subpath-exports.snap
Snapshot: rust_subpath-exports
Source: C:\Users\doyer\native-context-modules:291
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "subpath-exports",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "subpath-exports@1.0.0::AppConfig",
          7 │+      "name": "AppConfig",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "subpath-exports",
         11 │+      "filePath": "dist/index.d.ts",
         12 │+      "signature": "interface AppConfig {\n  name: string;\n  debug: boolean;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "subpath-exports@1.0.0::AppConfig.debug",
         18 │+      "name": "AppConfig.debug",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "subpath-exports",
         22 │+      "filePath": "dist/index.d.ts",
         23 │+      "signature": "debug: boolean;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "subpath-exports@1.0.0::AppConfig.name",
         29 │+      "name": "AppConfig.name",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "subpath-exports",
         33 │+      "filePath": "dist/index.d.ts",
         34 │+      "signature": "name: string;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "subpath-exports@1.0.0::QueryParams",
         40 │+      "name": "QueryParams",
         41 │+      "kind": "TypeAliasDeclaration",
         42 │+      "kindName": "TypeAliasDeclaration",
         43 │+      "package": "subpath-exports",
         44 │+      "filePath": "dist/utils.d.ts",
         45 │+      "signature": "type QueryParams = Record<string, string>;",
         46 │+      "isTypeOnly": true,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "subpath-exports@1.0.0::Server",
         51 │+      "name": "Server",
         52 │+      "kind": "InterfaceDeclaration",
         53 │+      "kindName": "InterfaceDeclaration",
         54 │+      "package": "subpath-exports",
         55 │+      "filePath": "dist/server.d.ts",
         56 │+      "signature": "interface Server {\n  listen(port: number): void;\n  close(): void;\n}",
         57 │+      "isTypeOnly": true,
         58 │+      "dependencies": []
         59 │+    },
         60 │+    {
         61 │+      "id": "subpath-exports@1.0.0::Server.close",
         62 │+      "name": "Server.close",
         63 │+      "kind": "MethodDeclaration",
         64 │+      "kindName": "MethodDeclaration",
         65 │+      "package": "subpath-exports",
         66 │+      "filePath": "dist/server.d.ts",
         67 │+      "signature": "close(): void;",
         68 │+      "isTypeOnly": false,
         69 │+      "dependencies": []
         70 │+    },
         71 │+    {
         72 │+      "id": "subpath-exports@1.0.0::Server.listen",
         73 │+      "name": "Server.listen",
         74 │+      "kind": "MethodDeclaration",
         75 │+      "kindName": "MethodDeclaration",
         76 │+      "package": "subpath-exports",
         77 │+      "filePath": "dist/server.d.ts",
         78 │+      "signature": "listen(port: number): void;",
         79 │+      "isTypeOnly": false,
         80 │+      "dependencies": []
         81 │+    },
         82 │+    {
         83 │+      "id": "subpath-exports@1.0.0::createApp",
         84 │+      "name": "createApp",
         85 │+      "kind": "FunctionDeclaration",
         86 │+      "kindName": "FunctionDeclaration",
         87 │+      "package": "subpath-exports",
         88 │+      "filePath": "dist/index.d.ts",
         89 │+      "signature": "declare function createApp(config: AppConfig): void;",
         90 │+      "isTypeOnly": false,
         91 │+      "dependencies": [
         92 │+        "subpath-exports@1.0.0::AppConfig"
         93 │+      ]
         94 │+    },
         95 │+    {
         96 │+      "id": "subpath-exports@1.0.0::createServer",
         97 │+      "name": "createServer",
         98 │+      "kind": "FunctionDeclaration",
         99 │+      "kindName": "FunctionDeclaration",
        100 │+      "package": "subpath-exports",
        101 │+      "filePath": "dist/server.d.ts",
        102 │+      "signature": "declare function createServer(): Server;",
        103 │+      "isTypeOnly": false,
        104 │+      "dependencies": [
        105 │+        "subpath-exports@1.0.0::Server"
        106 │+      ]
        107 │+    },
        108 │+    {
        109 │+      "id": "subpath-exports@1.0.0::formatDate",
        110 │+      "name": "formatDate",
        111 │+      "kind": "FunctionDeclaration",
        112 │+      "kindName": "FunctionDeclaration",
        113 │+      "package": "subpath-exports",
        114 │+      "filePath": "dist/utils.d.ts",
        115 │+      "signature": "declare function formatDate(d: Date): string;",
        116 │+      "isTypeOnly": false,
        117 │+      "dependencies": []
        118 │+    },
        119 │+    {
        120 │+      "id": "subpath-exports@1.0.0::parseQuery",
        121 │+      "name": "parseQuery",
        122 │+      "kind": "FunctionDeclaration",
        123 │+      "kindName": "FunctionDeclaration",
        124 │+      "package": "subpath-exports",
        125 │+      "filePath": "dist/utils.d.ts",
        126 │+      "signature": "declare function parseQuery(q: string): Record<string, string>;",
        127 │+      "isTypeOnly": false,
        128 │+      "dependencies": []
        129 │+    }
        130 │+  ],
        131 │+  "totalSymbols": 11,
        132 │+  "totalFiles": 3,
        133 │+  "crawlDurationMs": 0.0
        134 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_subpath_exports' (61900) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_subpath-exports' failed in line 291

---- snapshot_triple_slash_refs stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_triple-slash-refs.snap
Snapshot: rust_triple-slash-refs
Source: C:\Users\doyer\native-context-modules:285
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "triple-slash-refs",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "triple-slash-refs@1.0.0::APP_VERSION",
          7 │+      "name": "APP_VERSION",
          8 │+      "kind": "VariableStatement",
          9 │+      "kindName": "VariableStatement",
         10 │+      "package": "triple-slash-refs",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "declare const APP_VERSION: string",
         13 │+      "isTypeOnly": false,
         14 │+      "dependencies": []
         15 │+    }
         16 │+  ],
         17 │+  "totalSymbols": 1,
         18 │+  "totalFiles": 1,
         19 │+  "crawlDurationMs": 0.0
         20 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_triple_slash_refs' (65316) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_triple-slash-refs' failed in line 285

---- snapshot_type_alias stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_since-decl.snap
Snapshot: rust_since-decl
Source: C:\Users\doyer\native-context-modules:289
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "since-decl",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "since-decl@1.0.0::I",
          7 │+      "name": "I",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "since-decl",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface I {}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "since": "2.0.0"
         16 │+    },
         17 │+    {
         18 │+      "id": "since-decl@1.0.0::V",
         19 │+      "name": "V",
         20 │+      "kind": "VariableStatement",
         21 │+      "kindName": "VariableStatement",
         22 │+      "package": "since-decl",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "declare const V: string",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "since": "2.1.0"
         28 │+    }
         29 │+  ],
         30 │+  "totalSymbols": 2,
         31 │+  "totalFiles": 1,
         32 │+  "crawlDurationMs": 0.0
         33 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_type_alias' (61552) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_since-decl' failed in line 289

---- snapshot_types_versions stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_types-versions.snap
Snapshot: rust_types-versions
Source: C:\Users\doyer\native-context-modules:292
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "types-versions-pkg",
          3 │+  "version": "3.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "types-versions-pkg@3.0.0::ModernConfig",
          7 │+      "name": "ModernConfig",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "types-versions-pkg",
         11 │+      "filePath": "ts5/index.d.ts",
         12 │+      "signature": "interface ModernConfig {\n  strict: boolean;\n  esm: boolean;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "types-versions-pkg@3.0.0::ModernConfig.esm",
         18 │+      "name": "ModernConfig.esm",
         19 │+      "kind": "PropertyDeclaration",
         20 │+      "kindName": "PropertyDeclaration",
         21 │+      "package": "types-versions-pkg",
         22 │+      "filePath": "ts5/index.d.ts",
         23 │+      "signature": "esm: boolean;",
         24 │+      "isTypeOnly": false,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "types-versions-pkg@3.0.0::ModernConfig.strict",
         29 │+      "name": "ModernConfig.strict",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "types-versions-pkg",
         33 │+      "filePath": "ts5/index.d.ts",
         34 │+      "signature": "strict: boolean;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    }
         38 │+  ],
         39 │+  "totalSymbols": 3,
         40 │+  "totalFiles": 1,
         41 │+  "crawlDurationMs": 0.0
         42 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_types_versions' (37872) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_types-versions' failed in line 292

---- snapshot_visibility_merge stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_visibility-merge.snap
Snapshot: rust_visibility-merge
Source: C:\Users\doyer\native-context-modules:308
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "visibility-merge",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "visibility-merge@1.0.0::Merged",
          7 │+      "name": "Merged",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "visibility-merge",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface Merged { a: string; }",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "visibility": "public"
         16 │+    },
         17 │+    {
         18 │+      "id": "visibility-merge@1.0.0::Merged.a",
         19 │+      "name": "Merged.a",
         20 │+      "kind": "PropertyDeclaration",
         21 │+      "kindName": "PropertyDeclaration",
         22 │+      "package": "visibility-merge",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "a: string;",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "visibility": "public"
         28 │+    },
         29 │+    {
         30 │+      "id": "visibility-merge@1.0.0::Merged.b",
         31 │+      "name": "Merged.b",
         32 │+      "kind": "PropertyDeclaration",
         33 │+      "kindName": "PropertyDeclaration",
         34 │+      "package": "visibility-merge",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "b: string;",
         37 │+      "isTypeOnly": false,
         38 │+      "dependencies": []
         39 │+    }
         40 │+  ],
         41 │+  "totalSymbols": 3,
         42 │+  "totalFiles": 1,
         43 │+  "crawlDurationMs": 0.0
         44 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_visibility_merge' (52896) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_visibility-merge' failed in line 308

---- snapshot_visibility_tags stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_visibility-tags.snap
Snapshot: rust_visibility-tags
Source: C:\Users\doyer\native-context-modules:280
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "visibility-tags",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "visibility-tags@1.0.0::AlphaFeature",
          7 │+      "name": "AlphaFeature",
          8 │+      "kind": "InterfaceDeclaration",
          9 │+      "kindName": "InterfaceDeclaration",
         10 │+      "package": "visibility-tags",
         11 │+      "filePath": "index.d.ts",
         12 │+      "signature": "interface AlphaFeature {\n  experimental: boolean;\n}",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": [],
         15 │+      "visibility": "alpha"
         16 │+    },
         17 │+    {
         18 │+      "id": "visibility-tags@1.0.0::AlphaFeature.experimental",
         19 │+      "name": "AlphaFeature.experimental",
         20 │+      "kind": "PropertyDeclaration",
         21 │+      "kindName": "PropertyDeclaration",
         22 │+      "package": "visibility-tags",
         23 │+      "filePath": "index.d.ts",
         24 │+      "signature": "experimental: boolean;",
         25 │+      "isTypeOnly": false,
         26 │+      "dependencies": [],
         27 │+      "visibility": "alpha"
         28 │+    },
         29 │+    {
         30 │+      "id": "visibility-tags@1.0.0::DEFAULT_VALUE",
         31 │+      "name": "DEFAULT_VALUE",
         32 │+      "kind": "VariableStatement",
         33 │+      "kindName": "VariableStatement",
         34 │+      "package": "visibility-tags",
         35 │+      "filePath": "index.d.ts",
         36 │+      "signature": "declare const DEFAULT_VALUE: number",
         37 │+      "jsDoc": "No visibility tag",
         38 │+      "isTypeOnly": false,
         39 │+      "dependencies": []
         40 │+    },
         41 │+    {
         42 │+      "id": "visibility-tags@1.0.0::PublicAPI",
         43 │+      "name": "PublicAPI",
         44 │+      "kind": "InterfaceDeclaration",
         45 │+      "kindName": "InterfaceDeclaration",
         46 │+      "package": "visibility-tags",
         47 │+      "filePath": "index.d.ts",
         48 │+      "signature": "interface PublicAPI {\n  version: string;\n}",
         49 │+      "isTypeOnly": true,
         50 │+      "dependencies": [],
         51 │+      "visibility": "public",
         52 │+      "since": "1.0.0"
         53 │+    },
         54 │+    {
         55 │+      "id": "visibility-tags@1.0.0::PublicAPI.version",
         56 │+      "name": "PublicAPI.version",
         57 │+      "kind": "PropertyDeclaration",
         58 │+      "kindName": "PropertyDeclaration",
         59 │+      "package": "visibility-tags",
         60 │+      "filePath": "index.d.ts",
         61 │+      "signature": "version: string;",
         62 │+      "isTypeOnly": false,
         63 │+      "dependencies": [],
         64 │+      "visibility": "public",
         65 │+      "since": "1.0.0"
         66 │+    },
         67 │+    {
         68 │+      "id": "visibility-tags@1.0.0::_internalHelper",
         69 │+      "name": "_internalHelper",
         70 │+      "kind": "FunctionDeclaration",
         71 │+      "kindName": "FunctionDeclaration",
         72 │+      "package": "visibility-tags",
         73 │+      "filePath": "index.d.ts",
         74 │+      "signature": "declare function _internalHelper(): void;",
         75 │+      "isTypeOnly": false,
         76 │+      "dependencies": [],
         77 │+      "visibility": "internal"
         78 │+    },
         79 │+    {
         80 │+      "id": "visibility-tags@1.0.0::betaFunction",
         81 │+      "name": "betaFunction",
         82 │+      "kind": "FunctionDeclaration",
         83 │+      "kindName": "FunctionDeclaration",
         84 │+      "package": "visibility-tags",
         85 │+      "filePath": "index.d.ts",
         86 │+      "signature": "declare function betaFunction(): string;",
         87 │+      "isTypeOnly": false,
         88 │+      "dependencies": [],
         89 │+      "visibility": "beta",
         90 │+      "since": "2.1.0"
         91 │+    }
         92 │+  ],
         93 │+  "totalSymbols": 7,
         94 │+  "totalFiles": 1,
         95 │+  "crawlDurationMs": 0.0
         96 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_visibility_tags' (64940) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_visibility-tags' failed in line 280

---- snapshot_wildcard_reexport stdout ----
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Snapshot Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Snapshot file: crates\nci-engine\tests\snapshots\snapshot_tests__rust_wildcard-reexport.snap
Snapshot: rust_wildcard-reexport
Source: C:\Users\doyer\native-context-modules:284
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Expression: &rust_graph
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+new results
────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
          1 │+{
          2 │+  "package": "wildcard-reexport",
          3 │+  "version": "1.0.0",
          4 │+  "symbols": [
          5 │+    {
          6 │+      "id": "wildcard-reexport@1.0.0::Callback",
          7 │+      "name": "Callback",
          8 │+      "kind": "TypeAliasDeclaration",
          9 │+      "kindName": "TypeAliasDeclaration",
         10 │+      "package": "wildcard-reexport",
         11 │+      "filePath": "types.d.ts",
         12 │+      "signature": "type Callback = () => void;",
         13 │+      "isTypeOnly": true,
         14 │+      "dependencies": []
         15 │+    },
         16 │+    {
         17 │+      "id": "wildcard-reexport@1.0.0::Config",
         18 │+      "name": "Config",
         19 │+      "kind": "InterfaceDeclaration",
         20 │+      "kindName": "InterfaceDeclaration",
         21 │+      "package": "wildcard-reexport",
         22 │+      "filePath": "types.d.ts",
         23 │+      "signature": "interface Config {\n  host: string;\n  port: number;\n}",
         24 │+      "isTypeOnly": true,
         25 │+      "dependencies": []
         26 │+    },
         27 │+    {
         28 │+      "id": "wildcard-reexport@1.0.0::Config.host",
         29 │+      "name": "Config.host",
         30 │+      "kind": "PropertyDeclaration",
         31 │+      "kindName": "PropertyDeclaration",
         32 │+      "package": "wildcard-reexport",
         33 │+      "filePath": "types.d.ts",
         34 │+      "signature": "host: string;",
         35 │+      "isTypeOnly": false,
         36 │+      "dependencies": []
         37 │+    },
         38 │+    {
         39 │+      "id": "wildcard-reexport@1.0.0::Config.port",
         40 │+      "name": "Config.port",
         41 │+      "kind": "PropertyDeclaration",
         42 │+      "kindName": "PropertyDeclaration",
         43 │+      "package": "wildcard-reexport",
         44 │+      "filePath": "types.d.ts",
         45 │+      "signature": "port: number;",
         46 │+      "isTypeOnly": false,
         47 │+      "dependencies": []
         48 │+    },
         49 │+    {
         50 │+      "id": "wildcard-reexport@1.0.0::LIB_VERSION",
         51 │+      "name": "LIB_VERSION",
         52 │+      "kind": "VariableStatement",
         53 │+      "kindName": "VariableStatement",
         54 │+      "package": "wildcard-reexport",
         55 │+      "filePath": "index.d.ts",
         56 │+      "signature": "declare const LIB_VERSION: string",
         57 │+      "isTypeOnly": false,
         58 │+      "dependencies": []
         59 │+    }
         60 │+  ],
         61 │+  "totalSymbols": 5,
         62 │+  "totalFiles": 2,
         63 │+  "crawlDurationMs": 0.0
         64 │+}
────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
To update snapshots run `cargo insta review`
Stopped on the first failure. Run `cargo insta test` to run all snapshots.

thread 'snapshot_wildcard_reexport' (61500) panicked at C:\Users\doyer\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\insta-1.46.3\src\runtime.rs:719:13:
snapshot assertion for 'rust_wildcard-reexport' failed in line 284


failures:
    snapshot_circular_deps
    snapshot_class_instance
    snapshot_class_statics
    snapshot_computed_properties
    snapshot_conditional_exports
    snapshot_deep_chain
    snapshot_deprecated_exports
    snapshot_deps_pkg
    snapshot_enum_declaration
    snapshot_global_augmentation
    snapshot_import_cases
    snapshot_inherited_member_flattening
    snapshot_inline_import_type
    snapshot_literal_export
    snapshot_local_export
    snapshot_local_reexport
    snapshot_merged_symbols
    snapshot_mixin_composition
    snapshot_multi_star_exports
    snapshot_name_collision
    snapshot_namespace_cases
    snapshot_namespace_reexport
    snapshot_nested_prefix
    snapshot_no_types_pkg
    snapshot_parser_edge_case
    snapshot_re_export_chain
    snapshot_simple_export
    snapshot_since_inheritance
    snapshot_string_exports
    snapshot_subpath_exports
    snapshot_triple_slash_refs
    snapshot_type_alias
    snapshot_types_versions
    snapshot_visibility_merge
    snapshot_visibility_tags
    snapshot_wildcard_reexport

test result: FAILED. 1 passed; 36 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.48s

error: test failed, to rerun pass `--test snapshot_tests`
PS C:\Users\doyer\native-context-modules>
