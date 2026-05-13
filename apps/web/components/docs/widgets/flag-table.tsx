"use client";

import * as React from "react";
import { ClipboardIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

export interface FlagDescriptor {
  id: string;
  long?: string;
  short?: string;
  valuePlaceholder?: string;
  defaultValue?: string;
  description: React.ReactNode;
  subcommand?: string;
}

function describeFlagName(flag: FlagDescriptor): string {
  return [flag.long, flag.short].filter(Boolean).join(", ");
}

interface FlagTableContextValue {
  query: string;
  setQuery: (next: string) => void;
  activeSubcommand: string | null;
  setActiveSubcommand: (next: string | null) => void;
  matches: (flag: FlagDescriptor) => boolean;
}

const FlagTableContext = React.createContext<FlagTableContextValue | null>(
  null,
);

function useFlagTableContext(): FlagTableContextValue {
  const context = React.useContext(FlagTableContext);
  if (!context) {
    throw new Error(
      "FlagTable sub-components must be used inside FlagTableRoot",
    );
  }
  return context;
}

interface FlagTableRootProps {
  className?: string;
  children: React.ReactNode;
}

export function FlagTableRoot({ className, children }: FlagTableRootProps) {
  const [query, setQuery] = React.useState("");
  const [activeSubcommand, setActiveSubcommand] = React.useState<string | null>(
    null,
  );

  const matches = React.useCallback(
    (flag: FlagDescriptor) => {
      if (activeSubcommand && flag.subcommand !== activeSubcommand) {
        return false;
      }
      const lowered = query.trim().toLowerCase();
      if (!lowered) {
        return true;
      }
      const description =
        typeof flag.description === "string" ? flag.description : "";
      const haystack = `${describeFlagName(flag)} ${
        flag.valuePlaceholder ?? ""
      } ${description}`.toLowerCase();
      return haystack.includes(lowered);
    },
    [query, activeSubcommand],
  );

  const value = React.useMemo<FlagTableContextValue>(
    () => ({
      query,
      setQuery,
      activeSubcommand,
      setActiveSubcommand,
      matches,
    }),
    [query, activeSubcommand, matches],
  );

  return (
    <FlagTableContext.Provider value={value}>
      <section
        className={cn(
          "my-6 overflow-hidden rounded-2xl border border-border bg-elevated",
          className,
        )}
      >
        {children}
      </section>
    </FlagTableContext.Provider>
  );
}

export function FlagTableSearch() {
  const { query, setQuery } = useFlagTableContext();
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2.5">
      <MagnifyingGlassIcon
        className="h-4 w-4 shrink-0 text-muted/70"
        aria-hidden="true"
      />
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter flags..."
        autoComplete="off"
        spellCheck="false"
        className="flex-1 bg-transparent text-sm tracking-tight-p text-ink placeholder:text-muted/65 focus:outline-none"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="text-xs font-medium uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

interface FlagTableSubcommandFilterProps {
  subcommands: string[];
  className?: string;
}

export function FlagTableSubcommandFilter({
  subcommands,
  className,
}: FlagTableSubcommandFilterProps) {
  const { activeSubcommand, setActiveSubcommand } = useFlagTableContext();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 border-b border-border bg-surface/40 px-4 py-2",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setActiveSubcommand(null)}
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
          activeSubcommand === null
            ? "bg-primary/10 text-primary"
            : "text-muted hover:bg-surface-hover hover:text-ink",
        )}
      >
        All
      </button>
      {subcommands.map((subcommand) => {
        const isActive = activeSubcommand === subcommand;
        return (
          <button
            key={subcommand}
            type="button"
            onClick={() => setActiveSubcommand(subcommand)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {subcommand}
          </button>
        );
      })}
    </div>
  );
}

interface FlagTableBodyProps {
  flags: FlagDescriptor[];
  className?: string;
}

export function FlagTableBody({ flags, className }: FlagTableBodyProps) {
  const { matches } = useFlagTableContext();
  const visible = flags.filter(matches);

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">
              Flag
            </th>
            <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">
              Subcommand
            </th>
            <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">
              Description
            </th>
            <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-right">
              Copy
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-8 text-center text-sm tracking-tight-p text-muted"
              >
                No flags match the current filter.
              </td>
            </tr>
          ) : (
            visible.map((flag) => <FlagTableRow key={flag.id} flag={flag} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

interface FlagTableRowProps {
  flag: FlagDescriptor;
}

function FlagTableRow({ flag }: FlagTableRowProps) {
  const { copied, copy } = useCopyToClipboard();
  const copyTarget = flag.long ?? flag.short ?? "";

  return (
    <tr className="align-top">
      <td className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-col gap-1">
          <code className="font-mono text-[0.82rem] text-ink">
            {describeFlagName(flag)}
            {flag.valuePlaceholder ? (
              <span className="ml-1 text-muted">{flag.valuePlaceholder}</span>
            ) : null}
          </code>
          {flag.defaultValue ? (
            <span className="font-mono text-[0.7rem] text-muted/80">
              default = {flag.defaultValue}
            </span>
          ) : null}
        </div>
      </td>
      <td className="border-b border-border/60 px-4 py-3 font-mono text-xs text-muted">
        {flag.subcommand ?? "—"}
      </td>
      <td className="border-b border-border/60 px-4 py-3 text-sm tracking-tight-p text-ink/85 [&_code]:rounded-md [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink">
        {flag.description}
      </td>
      <td className="border-b border-border/60 px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => {
            if (copyTarget) {
              void copy(copyTarget);
            }
          }}
          aria-label={copied ? "Copied" : `Copy ${copyTarget}`}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted/80 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99] active:blur-[0.5px]"
        >
          <CopyStatusIcon
            copied={copied}
            idle={ClipboardIcon}
            className="h-3.5 w-3.5"
          />
        </button>
      </td>
    </tr>
  );
}

FlagTableRoot.displayName = "FlagTable.Root";
FlagTableSearch.displayName = "FlagTable.Search";
FlagTableSubcommandFilter.displayName = "FlagTable.SubcommandFilter";
FlagTableBody.displayName = "FlagTable.Body";

export interface FlagTableNamespace {
  Root: typeof FlagTableRoot;
  Search: typeof FlagTableSearch;
  SubcommandFilter: typeof FlagTableSubcommandFilter;
  Body: typeof FlagTableBody;
}

export const FlagTable: FlagTableNamespace = {
  Root: FlagTableRoot,
  Search: FlagTableSearch,
  SubcommandFilter: FlagTableSubcommandFilter,
  Body: FlagTableBody,
};
