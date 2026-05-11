import * as React from "react";
import { cn } from "@/lib/utils";

export interface PipelineFlowProps {
  steps: readonly string[];
  className?: string;
}

export function PipelineFlow({ steps, className }: PipelineFlowProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <figure
      className={cn(
        "my-6 overflow-hidden rounded-xl border border-border/70 bg-surface/50 shadow-[inset_0_1px_0_#ffffff06]",
        className,
      )}
    >
      <div className="px-4 py-3.5">
        <ul
          className="flex list-none flex-wrap items-baseline justify-center gap-x-0 gap-y-1 text-center font-mono text-[0.8125rem] leading-relaxed tracking-tight-p text-ink/88"
          aria-label="Pipeline stages"
        >
          {steps.map((label, index) => (
            <li
              key={`${label}-${index}`}
              className="inline-flex items-baseline"
            >
              {index > 0 ? (
                <span
                  className="mx-1 text-muted/45 select-none"
                  aria-hidden="true"
                >
                  /
                </span>
              ) : null}
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="border-t border-border/55 px-4 py-3 text-xs leading-relaxed text-muted">
        Parsing and crawling fan out per package; the resolver and dedupe stages
        run as the package&apos;s graph completes; storage commits in batches.
      </figcaption>
    </figure>
  );
}
