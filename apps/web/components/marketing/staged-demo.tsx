"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function StagedDemoRoot({
  children,
  className,
  surfaceTint = "primary",
}: {
  children: React.ReactNode;
  className?: string;
  surfaceTint?: "primary" | "accent";
}) {
  const patternId = React.useId().replace(/:/g, "");
  const tintSurface =
    surfaceTint === "accent"
      ? "border-accent/12 bg-[color-mix(in_oklch,var(--nci-color-accent)_7%,var(--nci-color-surface))]"
      : "border-primary/12 bg-[color-mix(in_oklch,var(--nci-color-primary)_7%,var(--nci-color-surface))]";
  const patternInk = surfaceTint === "accent" ? "text-accent" : "text-primary";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border p-6 sm:p-8 lg:p-10",
        tintSurface,
        className,
      )}
    >
      <svg
        className={cn("pointer-events-none absolute inset-0", patternInk)}
        style={{ opacity: 0.1 }}
        aria-hidden
      >
        <defs>
          <pattern
            id={patternId}
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 18 L36 18 M18 0 L18 36"
              stroke="currentColor"
              strokeWidth="0.4"
              fill="none"
            />
            <circle
              cx="18"
              cy="18"
              r="1.15"
              fill="currentColor"
              opacity="0.4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div className="relative z-[1]">{children}</div>
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
        "relative rounded-2xl border border-border/90 bg-elevated shadow-[0_1px_0_rgb(255_255_255_/_0.85)_inset,0_18px_48px_-28px_rgb(0_0_0_/_0.12)]",
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
