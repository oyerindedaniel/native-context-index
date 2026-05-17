# NCI SQLite reference

CLI workflow, fast path, and tool choice are in the **agent primer** (`nci://primer/agent` / compact skill **PRIMER.md**). This document covers **schema and column semantics** for `nci sql` and MCP `nci://primer/reference`.

Run **`nci sql --schema`** for authoritative DDL. If anything below disagrees with that output, **believe the schema**.

## Package-relative path encoding

When a declaration resolves **outside** the indexed package root, stored paths do **not** use raw `../` segments. The index uses a **canonical encoding**: each parent hop outside the package root adds **`__nci_external__`** plus one **`__up__`** segment (repeat for multiple hops). Example shape: `__nci_external__/__up__/other/x.d.ts`. That encoded string is for **stable SQLite keys and joins**, not a literal directory tree to walk under `node_modules`. **`symbols.file_path`** and symbol **`id`** strings (`pkg@version::file_path::name`) may contain these tokens. For ownership, use **`source_package_name`** + **`source_file_path`** (and `source_package_version` when non-null), not reverse-parsed `../` paths or `id` split on `::` alone.

## Table `packages`

`package_id`, `name`, `version`, index stats, timestamps. To filter symbols by package, use `symbols.package_id = packages.package_id` and `packages.name` / `packages.version`.

## Table `symbols`

One row per **graph symbol** after the merge phase:

- **`symbol_id`:** integer row id.
- **`package_id`:** which package this symbol belongs to.
- **`id`:** stable string id (scoped to the indexed package version). Use this when joining to dependency tables or comparing to `to_symbol_id_text`.
  - **`#` suffixes (`#2`, `#3`, …):** **Disambiguation**, not overload indices by themselves. The graph assigns **unique** ids when the same human-readable name would otherwise collide:
    - **Exported symbols (`is_internal = 0`):** the **first** row for a given short `name` in the package typically uses `pkg@version::name`. **Further homonyms** (same exported `name`, different declarations) become `pkg@version::name#2`, `#3`, … in stable crawl order.
    - **Internal symbols (`is_internal = 1`):** ids are usually **`pkg@version::file_path::name`**. If the **same file + same name** still produces multiple distinct symbols (e.g. overload rows that stay separate), the **second and later** occurrences add **`#2`, `#3`** on that **file-qualified** base (`…::file.d.ts::sym#2`).
  - **If two SQL rows share the same base name but different `#n`:** they are **different symbol rows** by construction—compare full **`id`** strings, not only `name`. Do **not** assume `#2` always means “second overload” globally; it means “second disambiguated occurrence” in that package/file context.
- **`name`:** the symbol’s short name; nested members may still use dotted segments in `name`—**do not infer the lexical parent only from string parsing** when `parent_symbol_id` is set.
- **`kind`:** numeric internal code; **`kind_name`:** string form of the declaration kind (e.g. `FunctionDeclaration`, `InterfaceDeclaration`, `MethodSignature`, `ExportDeclaration`). Use `kind_name` with `name` and `signature` to tell functions from types from re-exports.
- **`file_path`:** path to the **primary declaration site** for this graph row—package-relative. Merge may fold other sites into the same row; those extra physical files are recorded in **`symbol_additional_files`**, not by repeating them as extra `file_path` columns.
- **`source_package_name`:** npm package that owns the declaration (`packages.name` for in-tree symbols; dependency package id parsed from the first `node_modules/<pkg>/` segment for `__nci_external__` paths). This is the canonical field for `--source-package` filters.
- **`source_package_version`:** semver of the source package **only** when the source package is the indexed package. For external dependency declarations this is usually **NULL** by design; folder names like `@scope+pkg@x.y.z` are install-layout artifacts and are not treated as authoritative source semver.
- **`source_file_path`:** path relative to `source_package_name` (mirrors `file_path` for in-package symbols; dependency-local path for external symbols). DDL stores it **NOT NULL**; use this when citing where the declaration lives inside the owning package.
- **`entry_visibility_json` (TEXT, optional):** JSON array text of package-relative paths—**which package entry / barrel files make this symbol reachable on the public export surface** (`types` / `exports` roots and re-export traversal). This is the persisted SQL form of entry-surface visibility metadata. Populated when the symbol’s file (or the file resolved from package entry re-export) is one of the indexed **entry files**. **Not** the same as **`file_path`**: a symbol may be **defined** in `dist/foo.d.ts` but **reachable** only via `dist/index.d.ts`—then `file_path` is `foo`, while **`entry_visibility_json`** lists index/barrel paths that surface it. **Not** the same as **`symbol_additional_files`**: those are **extra declaration merge sites** for the same merged symbol, not “which entry re-exported this name.” If the only entry path equals **`file_path`** alone, the engine often omits the field as redundant—**NULL / absent** does not mean “not exported”; use **`is_internal`** plus this column when present.
- **`signature`:** declaration signature / export text. **After merge,** the engine may **fuse** several normalized-distinct signature bodies into one field (newline-separated blocks), not “first file only.” If two overloads collapse when their normalized signatures match, you will not see duplicate raw text for the same normalized overload key.
- **`js_doc`:** JSDoc when present.
- **`parent_symbol_id`:** the **lexical / containment** parent for member shapes (e.g. a method’s parent class or interface id). This answers “this member lives under which container in the graph.” It is **not** a “this type uses that type” edge. For **use** relationships, use **`symbol_dependencies`** (or the graph’s `dependencies` when not using SQL). **Never** replace dependency reasoning with `parent_symbol_id` or vice versa.
- **`enclosing_module_declaration_id`:** string id of the **enclosing module / namespace declaration** row (`ModuleDeclaration`-like container) for module-scoped symbols—**which module block** this symbol belongs to. **Not** a type-reference edge and **not** the same as `parent_symbol_id` for every kind (parent is often the immediate lexical owner; enclosing module is the surrounding module/namespace declaration id). Use it when you need “inside which module namespace” vs following **`symbol_dependencies`** for references.
- **`merge_provenance_json`:** present when this row **absorbed more than one** declaration. JSON object; typically a `kinds` array whose values describe **how** the row was formed (snake_case labels), for example:
  - **`merge_scope`:** at least one contribution came from the same **declaration merge key** as another row (same merge scope for declaration kinds, or overload keys for members).
  - **`identical_fold`:** at least one contribution came from **identical cross-file fold**: same `name`, same `kind`, same **normalized** signature across **external** module files, folded into one row. **Row is still one `symbols` entry;** extra physical sites are listed in **`symbol_additional_files`.**
  - **`overload_key`:** the row participates in **overload-style** merging (member overloads / overload rows keyed by normalized signature). Multiple overloads of the same member name may share merge mechanics or remain distinct rows depending on normalization—use **`kind_name`**, **`signature`**, and **`merge_provenance_json`** rather than assuming “one row == one overload.”
    A single row can list **multiple** `kinds` when different mechanisms contributed.
- **`visibility` (TEXT, optional):** JSDoc **tag-level** API visibility (`@public`, `@internal`, `@alpha`, `@beta`) when extracted—not the same thing as **`is_internal`**. A symbol may have tag **`@internal`** in docs while **`is_internal`** reflects export graph reachability; treat both columns independently.
- **`is_internal` (integer 0/1):** **Package export-surface flag**, not TypeScript `private`. **`1`** means the symbol was crawled but is **not** on the public export surface from package entry resolution. **`1` does _not_ mean “ignore this symbol”**—internal symbols are still valid rows and still participate in **`symbol_dependencies`** resolution.
- **`is_global_augmentation`:** **`1`** if the symbol comes from **`declare global { … }`** (ambient/global augmentation). Do not confuse with ordinary exported API surface.
- **`is_inherited`:** **`1`** when the row is a **synthesized inherited member** lifted from a base type (inheritance flattening), where relevant.
- **`is_type_only`**, **`symbol_space`:** distinguish type-only declarations vs value namespace (`type` vs `value`).
- **`re_exported_from`, deprecation fields, since-tag columns:** metadata per schema; see **`sql --schema`**.

## Table `symbol_additional_files`

(`symbol_id`, `file_path`) — **additional** package-relative declaration files that contributed to **this** merged/folded symbol row. Non-empty means “more than one physical declaration site”; combine with **`merge_provenance_json`** and **`signature`** to interpret provenance.

## Table `symbol_dependencies`

(`from_symbol_id`, `to_symbol_id_text`) — resolved "uses". **`to_symbol_id_text`**: **`symbols.id`**, or stub **`npm::<specifier>::<member>`** (`dependency_stub_packages` / `nci index -s`), **`node::NodeJS::…`**, **`node::<builtin>::…`**, **`protocol::…`** (no `symbols` row). Resolution order: module specifier → same file → import alias → `/// <reference … />` closure → bare-name fallback. **`is_internal` does not block an edge.**

## Table `symbol_surface_dependencies`

Same id shape as above but semantics are **namespace/module surface rollup**—aggregated dependencies for container symbols—not a substitute for **`symbol_dependencies`** on an arbitrary member row. Use **`symbol_dependencies`** when following “what does this declaration reference”; use surface rollup only when you intentionally care about the rolled-up namespace view.

## Table `symbol_inherited_from_sources`

(`symbol_id`, `source_symbol_id_text`) — for **synthesized inherited members** (`is_inherited = 1`), lists **which base/source symbol ids** contributed to this member’s flattening. Join `symbol_id` to `symbols.symbol_id` for the inherited row; **`source_symbol_id_text`** matches **`symbols.id`** strings of parents/interfaces bases. Use this when tracing **why** an inherited member exists; use **`symbol_dependencies`** for ordinary type/value references on non-inherited symbols.

## Table `symbol_heritage`

(`symbol_id`, `heritage`) — verbatim **`extends` / `implements`** clause fragments for human-readable provenance; **do not** treat `heritage` text as the machine edge set—prefer **`symbol_dependencies`** for resolved targets.

## Tables `symbol_modifiers`, `symbol_decorators`

Structured modifiers and decorators attached to a symbol row—see **`sql --schema`**.

## Table `package_dependencies`

Declared npm dependency names per indexed package—package-level, not symbol edges.

## FTS `symbols_fts`

Full-text search over symbol name/signature/js_doc; **`query`** may use this indirectly—relational joins usually start from **`symbols`** / **`packages`**.

---

## Overload and merge

How to avoid wrong conclusions:

- **Merge** reduces many declaration AST nodes to **one `symbols` row** when keys collide (same merge scope for declaration kinds, or overload keys for members). **Identical fold** merges **different files** when name/kind/normalized-signature match. Always check **`merge_provenance_json`** and **`symbol_additional_files`** before assuming a single file or a single overload site.
- **Overloads:** Multiple overload signatures may appear as **one fused `signature`** string when merged, or as **separate `symbols` rows** when keys stay distinct. Counting rows by **`name`** alone without **`kind_name`** and **`signature`** mis-counts overloads vs re-exports. Rows that share a base name may differ by **`#n`** in **`id`**—pair **`id`**, **`signature`**, and **`merge_provenance_json`**. CLI **`query overloads "<symbols.id>"`** returns the full sibling set (**same `package_id` + `name` + `parent_symbol_id`**, including the input row).
- **`[]` from `nci sql --format json`:** output is a **JSON array** of row objects. **`[]`** means **no rows matched** your WHERE/JOIN—adjust filters (e.g. wrong `package_id`, wrong `name`, typo in path). It does **not** mean the index is empty. Join **`packages`** first when filtering by package name/version.
