/**
 * Scripted scenes for the home page “CLI journey” demo.
 *
 * `nci` lines were captured with `NO_COLOR=1` and the workspace binary
 * `cargo build -p nci-engine --bin nci` → `target/debug/nci(.exe)` in a temp
 * npm project with `effect@3.12.0` installed (`nci init -y`, then
 * `nci index package effect 3.12.0`, `nci query find …`, `nci sql …`).
 * Re-validate after material CLI or schema changes.
 */

export type HomeCliSceneVariant = "npm-single" | "nci-single" | "nci-sequence";

export interface HomeCliSceneBase {
  readonly sceneKey: string;
  readonly tabLabel: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly caption: string;
}

export interface HomeCliNpmScene extends HomeCliSceneBase {
  readonly variant: "npm-single";
  readonly chromeTitle: string;
  readonly cwdLabel: string;
  readonly commandLine: string;
  readonly outputText: string;
}

export interface HomeCliNciSingleScene extends HomeCliSceneBase {
  readonly variant: "nci-single";
  readonly cwdLabel: string;
  readonly commandLine: string;
  readonly outputText: string;
}

export interface HomeCliNciSequenceScene extends HomeCliSceneBase {
  readonly variant: "nci-sequence";
  readonly cwdLabel: string;
  readonly steps: readonly {
    readonly commandLine: string;
    readonly outputText: string;
  }[];
}

export type HomeCliScene =
  | HomeCliNpmScene
  | HomeCliNciSingleScene
  | HomeCliNciSequenceScene;

/** Plain `nci query find` output (four hits, `--limit 4`, scoped to effect 3.12.0). */
/** `Effect#3` in `id=` is a disambiguation suffix when several public symbols share the same name in one package (see `graph.rs` name_count / stable ids). */
const HOME_CLI_QUERY_FIND_EFFECT_CAPTURE =
  "Effect [ExportDeclaration] effect@3.12.0 source=effect@3.12.0 file=dist/dts/index.d.ts id=effect@3.12.0::Effect#3\n" +
  "  signature: export * as Effect from './Effect.js'\n" +
  "Effect [InterfaceDeclaration] effect@3.12.0 source=effect@3.12.0 file=dist/dts/Stream.d.ts id=effect@3.12.0::dist/dts/Stream.d.ts::Effect\n" +
  "  signature: interface Effect<A, E, R> extends Stream<A, E, R> {\n" +
  "    }\n" +
  "Effect [ModuleDeclaration] effect@3.12.0 source=effect@3.12.0 file=dist/dts/Effect.d.ts id=effect@3.12.0::Effect#2\n" +
  "  signature: export declare namespace Effect {\n" +
  "    /**\n" +
  "     * @since 2.0.0\n" +
  "     * @category Models\n" +
  "     */\n" +
  "    interface Variance<out A, out E, out R> {\n" +
  "        readonly [EffectTypeId]: VarianceStruct<A, E, R>;\n" +
  "    }\n" +
  "    /**\n" +
  "     * @since 2.0.0\n" +
  "     * @category Models\n" +
  "     */\n" +
  "    interface VarianceStruct<out A, out E, out R> {\n" +
  "    ...\n" +
  "Effect [InterfaceDeclaration] effect@3.12.0 source=effect@3.12.0 file=dist/dts/Sink.d.ts id=effect@3.12.0::dist/dts/Sink.d.ts::Effect\n" +
  "  signature: interface Effect<A, E, R> extends Sink<A, unknown, never, E, R> {\n" +
  "    }";

export const HOME_CLI_SCENES: readonly HomeCliScene[] = [
  {
    sceneKey: "npm-install-effect",
    variant: "npm-single",
    tabLabel: "effect",
    eyebrow: "Step 1",
    title: "Add the dependency you care about",
    caption:
      "Here we pull in `effect` as a real dependency so the later index has declarations to chew on.",
    chromeTitle: "npm",
    cwdLabel: "~/effect-demo",
    commandLine: "npm install effect",
    outputText:
      "npm warn EBADENGINE …\n" +
      "\n" +
      "added 12 packages, and audited 13 packages in 3s\n" +
      "\n" +
      "2 packages are looking for funding\n" +
      "  run `npm fund` for details\n" +
      "\n" +
      "found 0 vulnerabilities",
  },
  {
    sceneKey: "npm-install-nci-cli",
    variant: "npm-single",
    tabLabel: "nci cli",
    eyebrow: "Step 2",
    title: "Install the NCI CLI",
    caption:
      "Same package manager story as the quickstart: the binary is published as `@nativecontextindex/cli`.",
    chromeTitle: "npm",
    cwdLabel: "~/effect-demo",
    commandLine: "npm install -g @nativecontextindex/cli",
    outputText:
      "changed 1 package, and audited 1 package in 2s\n" +
      "\n" +
      "found 0 vulnerabilities",
  },
  {
    sceneKey: "nci-init",
    variant: "nci-single",
    tabLabel: "init",
    eyebrow: "Step 3",
    title: "Initialize the workspace",
    caption:
      "`nci init -y` writes `nci.config.json`, opens the SQLite file from that config, and runs migrations. Plain `stdout` lines use the same `[ok]` / `==>` tags as the Rust CLI (`cli/style.rs`).",
    cwdLabel: "~/effect-demo",
    commandLine: "nci init -y",
    outputText:
      "[ok] init: complete\n" +
      "Database: …/nci.sqlite\n" +
      "Config: …/nci.config.json\n" +
      "==> init: next: nci index; then nci query packages",
  },
  {
    sceneKey: "nci-index",
    variant: "nci-single",
    tabLabel: "index",
    eyebrow: "Step 4",
    title: "Index one installed package",
    caption:
      "Single-package indexing is `nci index package <name> <version>` (exact semver from `node_modules`). Stderr uses `emit_progress_line` (`==>`, `[ok]`, …); the summary line is `[#] index: …` on stdout.",
    cwdLabel: "~/effect-demo",
    commandLine: "nci index package effect 3.12.0",
    outputText:
      "==> index: discovering package target\n" +
      "[ok] index: target resolved +38ms\n" +
      "[ok] index package: [1/1] [INDEXED] effect 3.12.0 symbols=100575 +2.0s\n" +
      "[#] index: 1 package(s) complete | cached=0 indexed=1 not_persisted=0",
  },
  {
    sceneKey: "nci-query-and-sql",
    variant: "nci-sequence",
    tabLabel: "query",
    eyebrow: "Step 5",
    title: "Query, then drop into SQL",
    caption:
      "`query find` prints one hit line per match, plus optional `signature:` continuations. `nci sql --format jsonl` prints one JSON object per row. SQLite column names apply (`kind_name`, not `kind`); `symbols.package_id` links to `packages`.",
    cwdLabel: "~/effect-demo",
    steps: [
      {
        commandLine:
          'nci query find "Effect" --limit 4 --package effect --package-version 3.12.0',
        outputText: HOME_CLI_QUERY_FIND_EFFECT_CAPTURE,
      },
      {
        commandLine:
          "nci sql --format jsonl -c \"SELECT name, kind_name FROM symbols WHERE id IN ('effect@3.12.0::Effect','effect@3.12.0::Effect.Effect','effect@3.12.0::EffectTypeId') ORDER BY name\"",
        outputText:
          '{"name":"Effect","kind_name":"InterfaceDeclaration"}\n' +
          '{"name":"Effect.Effect","kind_name":"InterfaceDeclaration"}\n' +
          '{"name":"EffectTypeId","kind_name":"VariableStatement"}',
      },
    ],
  },
];
