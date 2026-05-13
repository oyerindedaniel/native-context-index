"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ClipboardIcon, DocumentTextIcon } from "@heroicons/react/20/solid";
import {
  buildNciFirstAgentPrimerCompact,
  buildNciFirstAgentPrimerReferenceDoc,
} from "@repo/nci-agent-primer/nci-first-agent-primer";
import { SplitButton } from "@/components/ui/split-button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

type PrimerVariantId = "compact" | "live" | "reference";

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
  // {
  //   id: "live",
  //   label: "Live",
  //   hint: "Full prose body — same module, longer form",
  //   build: buildNciFirstAgentPrimer,
  // },
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
  const { copied, copy } = useCopyToClipboard();

  const active = React.useMemo(
    () =>
      PRIMER_VARIANTS.find((variant) => variant.id === activeId) ??
      FALLBACK_VARIANT,
    [activeId],
  );

  const text = React.useMemo(() => active.build(), [active]);

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
            onClick={() => {
              void copy(text);
            }}
            className="gap-2 px-4"
          >
            <DocumentTextIcon
              className="h-4 w-4 text-muted/85"
              aria-hidden="true"
            />
            <span>{copied ? "Copied" : "Copy primer"}</span>
          </SplitButton.Main>
          <SplitButton.IconTrigger
            type="button"
            onClick={() => {
              void copy(text);
            }}
            aria-label={copied ? "Copied" : "Copy primer text"}
          >
            <CopyStatusIcon
              copied={copied}
              idle={ClipboardIcon}
              className="h-4 w-4"
            />
          </SplitButton.IconTrigger>
        </SplitButton.Root>
      </div>

      <p className="text-sm leading-relaxed tracking-tight-p text-muted">
        {active.hint}
      </p>

      <AnimatePresence mode="wait">
        <motion.pre
          key={active.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="max-h-[32rem] overflow-y-auto rounded-2xl border border-border bg-code-surface px-5 py-4 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap text-white/85 shadow-[inset_0_1px_#ffffff10]"
        >
          {text}
        </motion.pre>
      </AnimatePresence>
    </section>
  );
}
