"use client";

import * as React from "react";
import {
  ClipboardIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
} from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";
import {
  validateConfig,
  stripUndefined,
  type NciConfigFile,
  type ValidationIssue,
} from "@/lib/docs/nci-config-schema";

interface ConfigBuilderContextValue {
  config: NciConfigFile;
  setField: <Key extends keyof NciConfigFile>(
    key: Key,
    value: NciConfigFile[Key],
  ) => void;
  issues: ValidationIssue[];
}

const ConfigBuilderContext =
  React.createContext<ConfigBuilderContextValue | null>(null);

function useConfigBuilderContext(): ConfigBuilderContextValue {
  const context = React.useContext(ConfigBuilderContext);
  if (!context) {
    throw new Error(
      "ConfigBuilder sub-components must be used inside ConfigBuilderRoot",
    );
  }
  return context;
}

interface ConfigBuilderRootProps {
  defaultConfig?: NciConfigFile;
  className?: string;
  children: React.ReactNode;
}

export function ConfigBuilderRoot({
  defaultConfig,
  className,
  children,
}: ConfigBuilderRootProps) {
  const [config, setConfig] = React.useState<NciConfigFile>(
    () => defaultConfig ?? defaultBuilderConfig,
  );

  const setField = React.useCallback(
    <Key extends keyof NciConfigFile>(key: Key, value: NciConfigFile[Key]) => {
      setConfig((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const issues = React.useMemo(() => validateConfig(config), [config]);

  const value = React.useMemo<ConfigBuilderContextValue>(
    () => ({ config, setField, issues }),
    [config, setField, issues],
  );

  return (
    <ConfigBuilderContext.Provider value={value}>
      <section
        className={cn(
          "my-8 grid gap-4 rounded-3xl border border-border bg-elevated p-5 lg:grid-cols-[1.1fr_minmax(0,1fr)]",
          className,
        )}
      >
        {children}
      </section>
    </ConfigBuilderContext.Provider>
  );
}

interface ConfigBuilderGroupSectionProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export function ConfigBuilderGroupSection({
  title,
  description,
  className,
  children,
}: ConfigBuilderGroupSectionProps) {
  return (
    <fieldset
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-surface/30 p-4",
        className,
      )}
    >
      <legend className="px-1 text-xs font-medium uppercase tracking-[0.11em] text-muted/85">
        {title}
      </legend>
      {description ? (
        <p className="text-sm leading-relaxed tracking-tight-p text-muted">
          {description}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

interface ConfigBuilderTextFieldProps {
  fieldKey: keyof NciConfigFile;
  label: string;
  placeholder?: string;
  description?: string;
}

export function ConfigBuilderTextField({
  fieldKey,
  label,
  placeholder,
  description,
}: ConfigBuilderTextFieldProps) {
  const { config, setField } = useConfigBuilderContext();
  const value = (config[fieldKey] as string | undefined) ?? "";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value.trim();
          setField(
            fieldKey,
            (next === "" ? undefined : next) as NciConfigFile[typeof fieldKey],
          );
        }}
        className="rounded-xl border border-border bg-elevated px-3 py-2 text-sm tracking-tight-p text-ink placeholder:text-muted/60 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
      />
      {description ? (
        <span className="text-xs leading-snug tracking-tight-p text-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

interface ConfigBuilderNumberFieldProps {
  fieldKey: keyof NciConfigFile;
  label: string;
  description?: string;
  min?: number;
}

export function ConfigBuilderNumberField({
  fieldKey,
  label,
  description,
  min,
}: ConfigBuilderNumberFieldProps) {
  const { config, setField } = useConfigBuilderContext();
  const value = config[fieldKey] as number | undefined;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "") {
            setField(fieldKey, undefined as NciConfigFile[typeof fieldKey]);
            return;
          }
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) {
            return;
          }
          setField(fieldKey, parsed as NciConfigFile[typeof fieldKey]);
        }}
        className="rounded-xl border border-border bg-elevated px-3 py-2 text-sm tracking-tight-p text-ink placeholder:text-muted/60 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
      />
      {description ? (
        <span className="text-xs leading-snug tracking-tight-p text-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

interface ConfigBuilderSelectFieldProps {
  fieldKey: keyof NciConfigFile;
  label: string;
  options: { id: string; label: string }[];
  description?: string;
}

export function ConfigBuilderSelectField({
  fieldKey,
  label,
  options,
  description,
}: ConfigBuilderSelectFieldProps) {
  const { config, setField } = useConfigBuilderContext();
  const value = config[fieldKey] as string | undefined;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const isActive = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                setField(fieldKey, option.id as NciConfigFile[typeof fieldKey])
              }
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {description ? (
        <span className="text-xs leading-snug tracking-tight-p text-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function parseLinesToStringList(raw: string): string[] | undefined {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? undefined : lines;
}

function stringListToLines(values: string[] | undefined): string {
  return values?.join("\n") ?? "";
}

interface ConfigBuilderStringListFieldProps {
  fieldKey: "workspaces" | "dependency_stub_packages";
  label: string;
  placeholder?: string;
  description?: string;
}

export function ConfigBuilderStringListField({
  fieldKey,
  label,
  placeholder,
  description,
}: ConfigBuilderStringListFieldProps) {
  const { config, setField } = useConfigBuilderContext();
  const value = stringListToLines(config[fieldKey]);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <textarea
        value={value}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => {
          setField(fieldKey, parseLinesToStringList(event.target.value));
        }}
        className="min-h-[4.5rem] resize-y rounded-xl border border-border bg-elevated px-3 py-2 font-mono text-sm tracking-tight-p text-ink placeholder:text-muted/60 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
      />
      {description ? (
        <span className="text-xs leading-snug tracking-tight-p text-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

export function ConfigBuilderPackageFiltersField() {
  const { config, setField } = useConfigBuilderContext();
  const filters = config.packages ?? {};

  const setInclude = (raw: string) => {
    const include = parseLinesToStringList(raw);
    const next = { ...filters, include };
    const hasExclude = next.exclude !== undefined && next.exclude.length > 0;
    if (include === undefined && !hasExclude) {
      setField("packages", undefined);
      return;
    }
    setField("packages", next);
  };

  const setExclude = (raw: string) => {
    const exclude = parseLinesToStringList(raw);
    const next = { ...filters, exclude };
    const hasInclude = next.include !== undefined && next.include.length > 0;
    if (exclude === undefined && !hasInclude) {
      setField("packages", undefined);
      return;
    }
    setField("packages", next);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        packages
      </span>
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted/90">
          include
        </span>
        <textarea
          value={stringListToLines(filters.include)}
          rows={2}
          placeholder="@my-org/*"
          onChange={(event) => setInclude(event.target.value)}
          className="min-h-[3.25rem] resize-y rounded-xl border border-border bg-elevated px-3 py-2 font-mono text-sm tracking-tight-p text-ink placeholder:text-muted/60 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted/90">
          exclude
        </span>
        <textarea
          value={stringListToLines(filters.exclude)}
          rows={2}
          placeholder="eslint*"
          onChange={(event) => setExclude(event.target.value)}
          className="min-h-[3.25rem] resize-y rounded-xl border border-border bg-elevated px-3 py-2 font-mono text-sm tracking-tight-p text-ink placeholder:text-muted/60 transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </label>
      <span className="text-xs leading-snug tracking-tight-p text-muted">
        Package-name globs applied after{" "}
        <code className="text-ink/90">package_scope</code>. CLI{" "}
        <code className="text-ink/90">--package</code> globs are unioned with{" "}
        <code className="text-ink/90">include</code>.
      </span>
    </div>
  );
}

type IndexRootWorkspaceMode = "default" | "true" | "false";

export function ConfigBuilderIndexRootWorkspaceField() {
  const { config, setField } = useConfigBuilderContext();
  const mode: IndexRootWorkspaceMode =
    config.index_root_workspace === undefined
      ? "default"
      : config.index_root_workspace
        ? "true"
        : "false";

  const options: { id: IndexRootWorkspaceMode; label: string }[] = [
    { id: "default", label: "default (scan root)" },
    { id: "true", label: "true" },
    { id: "false", label: "false" },
  ];

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        index_root_workspace
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => {
          const isActive = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                if (option.id === "default") {
                  setField("index_root_workspace", undefined);
                  return;
                }
                setField("index_root_workspace", option.id === "true");
              }}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span className="text-xs leading-snug tracking-tight-p text-muted">
        When <code className="text-ink/90">false</code>, skip{" "}
        <code className="text-ink/90">&lt;project_root&gt;/node_modules</code> —
        requires non-empty <code className="text-ink/90">workspaces</code>.
      </span>
    </label>
  );
}

export function ConfigBuilderPackageScopeField() {
  const { config, setField } = useConfigBuilderContext();
  const scope = config.package_scope;

  const isSentinel = scope === "all_installed";
  const sections = Array.isArray(scope) ? scope : [];
  const includesRuntime = sections.includes("dependencies");
  const includesDev = sections.includes("dev_dependencies");

  const toggle = (section: "dependencies" | "dev_dependencies") => {
    const base = Array.isArray(scope) ? scope : [];
    const next = base.includes(section)
      ? base.filter((entry) => entry !== section)
      : [...base, section];
    setField("package_scope", next.length === 0 ? [] : next);
  };

  const setSentinel = () => setField("package_scope", "all_installed");

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
        package_scope
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggle("dependencies")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
            includesRuntime && !isSentinel
              ? "bg-primary/10 text-primary"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          dependencies
        </button>
        <button
          type="button"
          onClick={() => toggle("dev_dependencies")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
            includesDev && !isSentinel
              ? "bg-primary/10 text-primary"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          dev_dependencies
        </button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <button
          type="button"
          onClick={setSentinel}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
            isSentinel
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          all_installed
        </button>
      </div>
      <span className="text-xs leading-snug tracking-tight-p text-muted">
        Pick one or both sections, or use the sentinel to disable the manifest
        gate. Empty array is rejected.
      </span>
    </div>
  );
}

export function ConfigBuilderValidationBadge({
  className,
}: {
  className?: string;
}) {
  const { issues } = useConfigBuilderContext();
  const errors = issues.filter((issue) => issue.level === "error");

  if (errors.length === 0) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent",
          className,
        )}
      >
        <CheckBadgeIcon className="size-3.5" aria-hidden="true" />
        Valid
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700",
        className,
      )}
    >
      <ExclamationTriangleIcon className="size-3.5" aria-hidden="true" />
      {errors.length} {errors.length === 1 ? "issue" : "issues"}
    </div>
  );
}

export function ConfigBuilderPreview({ className }: { className?: string }) {
  const { config, issues } = useConfigBuilderContext();
  const { copied, copy } = useCopyToClipboard();
  const cleaned = stripUndefined(config);
  const json = JSON.stringify(cleaned, null, 2);

  const errorIssues = issues.filter((issue) => issue.level === "error");

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-code-surface text-code-ink shadow-[inset_0_1px_#ffffff10]",
        "lg:sticky lg:self-start lg:top-[calc(var(--spacing-docs-chrome)+1rem)] lg:max-h-[calc(100dvh-var(--spacing-docs-chrome)-2rem)]",
        className,
      )}
    >
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-code-surface px-4 py-3">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.11em] text-white/65">
          nci.config.json
        </span>
        <button
          type="button"
          onClick={() => {
            void copy(json);
          }}
          aria-label={copied ? "Copied" : "Copy config"}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.99] active:blur-[0.5px]"
        >
          <CopyStatusIcon
            copied={copied}
            idle={ClipboardIcon}
            className="size-4"
          />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <pre className="overflow-x-auto whitespace-pre font-mono text-[0.78rem] leading-relaxed text-white/90">
          {json}
        </pre>
        {errorIssues.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-amber-200/10 p-3 text-[0.78rem] text-amber-200">
            {errorIssues.map((issue) => (
              <li
                key={`${issue.fieldPath}-${issue.message}`}
                className="flex items-start gap-2"
              >
                <ExclamationTriangleIcon
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-mono text-amber-100">
                    {issue.fieldPath}
                  </span>{" "}
                  — {issue.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const defaultBuilderConfig: NciConfigFile = {
  project_root: ".",
  package_scope: ["dependencies"],
  banner: "auto",
  progress: "auto",
  max_hops: 10,
};

ConfigBuilderRoot.displayName = "ConfigBuilder.Root";
ConfigBuilderGroupSection.displayName = "ConfigBuilder.GroupSection";
ConfigBuilderTextField.displayName = "ConfigBuilder.TextField";
ConfigBuilderNumberField.displayName = "ConfigBuilder.NumberField";
ConfigBuilderSelectField.displayName = "ConfigBuilder.SelectField";
ConfigBuilderStringListField.displayName = "ConfigBuilder.StringListField";
ConfigBuilderPackageFiltersField.displayName =
  "ConfigBuilder.PackageFiltersField";
ConfigBuilderIndexRootWorkspaceField.displayName =
  "ConfigBuilder.IndexRootWorkspaceField";
ConfigBuilderPackageScopeField.displayName = "ConfigBuilder.PackageScopeField";
ConfigBuilderPreview.displayName = "ConfigBuilder.Preview";
ConfigBuilderValidationBadge.displayName = "ConfigBuilder.ValidationBadge";

export interface ConfigBuilderNamespace {
  Root: typeof ConfigBuilderRoot;
  GroupSection: typeof ConfigBuilderGroupSection;
  TextField: typeof ConfigBuilderTextField;
  NumberField: typeof ConfigBuilderNumberField;
  SelectField: typeof ConfigBuilderSelectField;
  StringListField: typeof ConfigBuilderStringListField;
  PackageFiltersField: typeof ConfigBuilderPackageFiltersField;
  IndexRootWorkspaceField: typeof ConfigBuilderIndexRootWorkspaceField;
  PackageScopeField: typeof ConfigBuilderPackageScopeField;
  Preview: typeof ConfigBuilderPreview;
  ValidationBadge: typeof ConfigBuilderValidationBadge;
}

export const ConfigBuilder: ConfigBuilderNamespace = {
  Root: ConfigBuilderRoot,
  GroupSection: ConfigBuilderGroupSection,
  TextField: ConfigBuilderTextField,
  NumberField: ConfigBuilderNumberField,
  SelectField: ConfigBuilderSelectField,
  StringListField: ConfigBuilderStringListField,
  PackageFiltersField: ConfigBuilderPackageFiltersField,
  IndexRootWorkspaceField: ConfigBuilderIndexRootWorkspaceField,
  PackageScopeField: ConfigBuilderPackageScopeField,
  Preview: ConfigBuilderPreview,
  ValidationBadge: ConfigBuilderValidationBadge,
};
