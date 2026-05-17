You have access to the NCI CLI, which indexes TypeScript declarations from node_modules into SQLite for symbol discovery and relational joins — not a full typechecker.

Subcommands: **query** (search/list) and **sql** (read-only SELECT). On Windows PowerShell use the call operator: **& "<path-to-nci.exe>" <subcommand> …args…**. **--max-rows** applies only to **nci sql** (MCP defaults a cap when invoking `nci_sql`). For **query find** and **query evidence** cap hits with **-n / --limit** (defaults: 20 and 10).

## Fast path

Run these calls first, in order:

1. **query active-package <packageName>** — required; no substitute. Resolves **package_version**, **indexed**, and **packageManager**. On JSON, read **`meta.activePackageResolution`** (`directInstallPath` vs `fullScanFallback`) and pin **package_version** in every follow-up call.

2. **query evidence** — one bundled call when you want symbol rows plus cite-ready signatures. Choose anchors by task shape:

   - **Exact API names** → `--symbol <Name>` (repeatable).

   - **Architectural / vague / multi-concept questions** → `--phrase "<terms>"` (repeatable FTS; runs alongside `--symbol`, not only as a fallback).

   - **Both** when useful → `--symbol Output --phrase "middleware lifecycle"`.

   Base: `--package <IndexedPackage> --package-version <V> [--source-package <NpmPackage>] [-n <N>] [--snippet-limit <M>]`.

Response shape: **data.symbols** (deduped hits) and **data.snippets** keyed by **symbols.id** (full **signature** / **js_doc**). When **data.snippets** already answers the task, stop.

**Query JSON:** **`meta.durationMs`**, **`meta.cost`** (`light` | `moderate` | `heavy`), truncation fields; **`meta.suggestions`** only when a call was slow and unproductive — if **data.snippets** already answers, ignore suggestions.

**-n / --limit** (default 10) caps hit rows in **data.symbols**. **--snippet-limit** caps how many of those rows get a snippet in **data.snippets** (defaults to **--limit**). Use **query snippet "<id>"** as a standalone call when you need a snippet outside an evidence result.

**--public-only** restricts **data.symbols** to rows where **symbols.is_internal = 0** (reachable on the package export surface). This is not the JSDoc **@public**/**@internal** tag, which lives in **symbols.visibility**.

Accepted flags — only these, anything else exits non-zero: **--package** (required), **--package-version**, **--source-package**, **--symbol** (repeatable), **--phrase** (repeatable), **--kind** (case-sensitive AST kind_name: **InterfaceDeclaration**, **TypeAliasDeclaration**, **FunctionDeclaration**, **VariableStatement**, **MethodSignature**, **ExportDeclaration** — note **declare const …** rows are **VariableStatement** not **TypeAliasDeclaration**), **--public-only**, **-n / --limit**, **--snippet-limit**, **--database**, **--format** (plain|json|jsonl).

**--kind** applies to every anchor in the call. Omit it if you are not certain every anchor shares the same **kind_name** — passing the wrong kind will return `0 hit(s); filter by **kindName** on the returned rows instead.

Truncation: when the last element of **data.symbols** has **id**, **name**, and **kindName** all equal to **"<truncated>"**, raise **-n** or narrow with **--package-version** / **--source-package** / **--kind**. On **`--format json`**, also read **`meta.truncated`** (and related caps) on every successful **`query`** response — same facts, structured.

When **data.symbols** and **data.snippets** already contain what you need, stop. Do not probe further with **read_file**, **grep**, **glob**, or **sql**.

## Tool choice

| Need | Prefer |
| --- | --- |
| Installed version + indexed check | **active-package** (required) |
| Symbols + signatures in one call | **evidence** (`heavy`; check **meta.durationMs**) |
| Exact name, ids only | **symbol** |
| Cite-ready text for a known **symbols.id** | **snippet** |
| Discovery without snippet batch load | **find** |
| Set-level joins after you know filters | **sql** |

If **meta.suggestions** is present, follow it instead of repeating the same heavy call.

## Narrowing tools

Use when the fast path was insufficient:

1. **query symbol <Name> --package <IndexedPackage> [--package-version] [--source-package <NpmPackage>] -n 10** — add **--source-package** to restrict to symbols whose declaration is owned by a specific npm package (**source_package_name**). Omit it when any match under the index is sufficient.

2. **query find <phrase> --package <Indexed> [--source-package] [--kind <KindName>] [--package-version] -n 10** — scoped full-text search. If a dotted name returns nothing, retry with tokenized terms (Foo bar style).

3. **query source-packages <IndexedPackage> <packageVersion>** — lists which source packages contribute declaration files under this index.

4. **query show "<symbols.id>"** returns full row metadata including a trimmed signature preview — use it when you need column context. **query snippet "<symbols.id>"** returns the full **signature** + **js_doc** text — use it when you need cite-ready declaration text. Both take exactly one positional id. Ids suffixed **#2**, **#3**, … are separate graph rows; run **query overloads "<symbols.id>"** to get the full sibling set, then **snippet** each one.

5. Path resolution — three layers: (1) which install wins (**package_dir** from active-package), (2) which package owns the declaration (**source_package_name**), (3) which file inside that install (**source_file_path**). Use **source_file_path** for disk navigation, not **file_path** when it contains index encoding. If **source_file_path** + install layout does not resolve to a real file, use **query snippet** / **query show** instead. Scope **glob**/**grep**/**read_file** only under one resolved concrete directory.

6. After resolving a declaration directory, use actual filenames first. Fall back to **.d.mts** / **.d.ts** / **.d.cts** only on a miss.

7. Use **read_file** / search only when **query show** / **query snippet** still lack what you need.

8. A single well-scoped **SELECT** is appropriate for set-level work (name collisions, merge rows, dependency fan-out) when you already know the join and filters. Use **sql --schema** to inspect table structure first if unsure.

9. Do not run **tsc -e** unless the task explicitly requires compile proof.

## SQL anchor-sweep template



```bash

nci sql --format json --max-rows 40 -c "SELECT s.id, s.name, s.kind_name, s.file_path, s.source_package_name FROM symbols s JOIN packages p ON p.package_id = s.package_id WHERE p.name = '<IndexedPackageName>' AND p.version = '<IndexedPackageVersion>' AND (LOWER(s.name) IN (<lowered_anchor_list>) OR s.name LIKE '%<OneAnchor>%') ORDER BY s.name LIMIT 40"

```



## Path encoding

**file_path** with **__nci_external__** / **__up__** are index keys, not disk paths. Join as stored; for disk use **source_package_name** + **source_file_path**, else **query snippet** / **query show**.



## Graph semantics

Join **symbols** to **packages** via **package_id**. **symbols.id** → **query snippet**; **symbol_dependencies.to_symbol_id_text** → target (indexed id or stub).

**symbol_dependencies** = resolved "uses". **symbol_surface_dependencies** = namespace rollup only — not interchangeable on member rows.

**Stubs (no `symbols` row, no `query snippet`):** **`npm::<specifier>::<member>`** when package is in **`dependency_stub_packages`** or **`nci index -s`** (consumer imports stubbed; indexing that package itself is self-exempt). **`node::NodeJS::…`** / **`node::<builtin>::…`** for ambient Node. Follow via SQL/edges; cite from indexed ids only.

**parent_symbol_id** is immediate lexical containment. **enclosing_module_declaration_id** is the surrounding ModuleDeclaration / namespace block — not a type-use edge and not always the same as **parent_symbol_id**.

Id suffixes **#2**, **#3**, … disambiguate homonyms — compare the full **id**, not just **name**.

**file_path** is the primary declaration site. **symbol_additional_files** lists other declaration files merged into the same symbol row.

**entry_visibility_json** lists package-relative entry/barrel paths through which this symbol is reachable on the public export surface — distinct from **file_path** (the definition site) and **symbol_additional_files** (merge sites).

**merge_provenance_json** describes how a row was merged: **merge_scope** (same merge-key collision), **identical_fold** (same name/kind/signature across external files), or **overload_key**. Pair with **signature** and **kind_name** when distinguishing overloads from re-exports.

**is_internal = 1** means the symbol is not on the public export path from package entries. **is_inherited** means the member is synthesized via inheritance; see **symbol_inherited_from_sources** for the contributing base symbol ids.

Run **sql --schema** for the full DDL.
