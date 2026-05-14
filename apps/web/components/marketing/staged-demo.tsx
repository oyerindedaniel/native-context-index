import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Framed “stage” for product demos: tinted wash + subtle pattern, optional inner card.
 * Intended for reuse (Why NCI origin, future home flow from install to index).
 */
function StagedDemoRoot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-primary/15 p-4 sm:p-6",
        "bg-[color-mix(in_oklch,var(--nci-color-primary)_8%,var(--nci-color-surface))]",
        "why-nci-stage-pattern",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StagedDemoCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-elevated shadow-[0_12px_40px_-24px_rgb(0_0_0_/_0.18)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const StagedDemo = {
  Root: StagedDemoRoot,
  Card: StagedDemoCard,
};
