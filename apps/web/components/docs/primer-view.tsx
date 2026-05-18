"use client";

import * as React from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
} from "@heroicons/react/20/solid";
import {
  buildNciFirstAgentPrimerCompact,
  buildNciFirstAgentPrimerReferenceDoc,
} from "@repo/nci-agent-primer/nci-first-agent-primer";
import { SplitButton } from "@/components/ui/split-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

type PrimerVariantId = "compact" | "reference";

interface PrimerVariant {
  id: PrimerVariantId;
  label: string;
  hint: string;
  build: () => string;
}

const PRIMER_VARIANTS: PrimerVariant[] = [
  {
    id: "compact",
    label: "Compact",
    hint: "What nci-mcp returns at nci://primer/agent",
    build: buildNciFirstAgentPrimerCompact,
  },
  {
    id: "reference",
    label: "Reference",
    hint: "Tabular schema reference — nci://primer/reference",
    build: buildNciFirstAgentPrimerReferenceDoc,
  },
];

const FALLBACK_VARIANT = PRIMER_VARIANTS[0]!;

export function PrimerView() {
  const [activeId, setActiveId] = React.useState<PrimerVariantId>("compact");
  const { copied, copy } = useCopyToClipboard({ resetMs: 2000 });

  const active = React.useMemo(
    () =>
      PRIMER_VARIANTS.find((variant) => variant.id === activeId) ??
      FALLBACK_VARIANT,
    [activeId],
  );

  const text = React.useMemo(() => active.build(), [active]);
  const variantLabel = active.label.toLowerCase();

  const handleCopy = React.useCallback(() => {
    void copy(text);
  }, [copy, text]);

  const handleViewRaw = React.useCallback(() => {
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [text]);

  return (
    <section className="my-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SplitButton.Root variant="outline" size="sm">
          {PRIMER_VARIANTS.map((variant, variantIndex) => {
            const isActive = variant.id === active.id;
            const isLast = variantIndex === PRIMER_VARIANTS.length - 1;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setActiveId(variant.id)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-colors duration-150 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline-none",
                  isLast ? "" : "border-r border-border",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-ink/85 hover:bg-surface-hover hover:text-ink",
                )}
              >
                {variant.label}
              </button>
            );
          })}
        </SplitButton.Root>

        <SplitButton.Root variant="outline" size="sm">
          <SplitButton.Main
            type="button"
            onClick={handleCopy}
            aria-label={
              copied ? "Copied primer text" : "Copy primer text to clipboard"
            }
            className="gap-2 px-3 sm:px-4"
          >
            <CopyStatusIcon
              copied={copied}
              idle={ClipboardDocumentIcon}
              className={cn(
                "size-4 shrink-0",
                copied ? "text-accent" : "text-muted",
              )}
            />
            <span className="hidden sm:inline">
              {copied ? "Copied" : "Copy primer"}
            </span>
          </SplitButton.Main>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SplitButton.IconTrigger
                type="button"
                aria-label="More primer copy and view options"
              >
                <ChevronDownIcon className="size-4" aria-hidden="true" />
              </SplitButton.IconTrigger>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-72 p-1.5">
              <DropdownMenuItem
                className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
                onSelect={(event) => {
                  event.preventDefault();
                  handleCopy();
                }}
              >
                <ClipboardDocumentIcon
                  className="mt-0.5 size-5 shrink-0 text-muted"
                  aria-hidden="true"
                />
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium text-ink">
                    Copy primer
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    Copy the {variantLabel} variant as Markdown
                  </span>
                </span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
                onSelect={(event) => {
                  event.preventDefault();
                  handleViewRaw();
                }}
              >
                <DocumentTextIcon
                  className="mt-0.5 size-5 shrink-0 text-muted"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    View as Markdown
                    <ArrowTopRightOnSquareIcon
                      className="size-3.5 shrink-0 text-muted"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    Open the {variantLabel} variant in a new tab
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SplitButton.Root>
      </div>

      <p className="text-sm leading-relaxed tracking-tight-p text-muted">
        {active.hint}
      </p>

      <pre className="max-h-[32rem] overflow-y-auto rounded-2xl border border-border bg-code-surface px-5 py-4 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap text-white/85 shadow-[inset_0_1px_#ffffff10]">
        {text}
      </pre>
    </section>
  );
}
