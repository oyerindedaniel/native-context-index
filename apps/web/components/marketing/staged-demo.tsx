"use client";

import { cn } from "@/lib/utils";

export const STAGED_DEMO_SURFACE_PATTERN_SRC = {
  cardboardFlat: "/cardboard-flat.png",
  brightSquares: "/bright-squares.png",
  cardboard: "/cardboard.png",
  felt: "/black-felt.png",
} as const;

export type StagedDemoSurfacePattern =
  keyof typeof STAGED_DEMO_SURFACE_PATTERN_SRC;

function StagedDemoRoot({
  children,
  className,
  surfaceTint = "primary",
  surfacePattern = "cardboard",
}: {
  children: React.ReactNode;
  className?: string;
  surfaceTint?: "primary" | "accent";
  surfacePattern?: StagedDemoSurfacePattern;
}) {
  const tintSurface =
    surfaceTint === "accent"
      ? "border-accent/12 bg-[color-mix(in_oklch,var(--nci-color-accent)_7%,var(--nci-color-surface))]"
      : "border-primary/12 bg-[color-mix(in_oklch,var(--nci-color-primary)_7%,var(--nci-color-surface))]";

  const patternUrl = STAGED_DEMO_SURFACE_PATTERN_SRC[surfacePattern];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] p-6 sm:p-8 lg:p-10",
        tintSurface,
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-repeat"
        style={{ backgroundImage: `url(${patternUrl})` }}
        aria-hidden
      />
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
        "relative rounded-2xl border border-border/90 bg-elevated/88 shadow-[0_1px_0_rgb(255_255_255_/_0.85)_inset,0_18px_48px_-28px_rgb(0_0_0_/_0.12)]",
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
