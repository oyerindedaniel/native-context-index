"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { ArrowLongRightIcon } from "@heroicons/react/20/solid";
import { motion, useReducedMotion } from "motion/react";
import {
  FeatureCardHoverGroup,
  useFeatureCardHoverGroup,
} from "@/components/home/features/feature-card-hover-group";
import { cn } from "@/lib/utils";

const HOVER_HIGHLIGHT_TRANSITION = {
  type: "spring",
  stiffness: 420,
  damping: 36,
  mass: 0.85,
} as const;

export type DocIntroTileData = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

interface DocIntroTileProps {
  tile: DocIntroTileData;
  cardHoverId: string;
}

export function DocIntroTile({ tile, cardHoverId }: DocIntroTileProps) {
  const hoverGroup = useFeatureCardHoverGroup();
  const reduceMotion = useReducedMotion() === true;
  const isHoverActive =
    hoverGroup !== null && hoverGroup.activeCardId === cardHoverId;

  return (
    <Link
      href={tile.href}
      className={cn(
        "group relative isolate flex aspect-[2/1] rounded-3xl w-full flex-col justify-between gap-4 border border-border bg-elevated p-6",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
      )}
      onPointerEnter={() => hoverGroup?.setActiveCardId(cardHoverId)}
    >
      {isHoverActive && !reduceMotion ? (
        <motion.div
          layoutId={hoverGroup.layoutId}
          className="absolute inset-0 -z-10 bg-surface rounded-3xl"
          transition={HOVER_HIGHLIGHT_TRANSITION}
          aria-hidden
        />
      ) : null}
      {isHoverActive && reduceMotion ? (
        <div
          className="absolute inset-0 -z-10 bg-surface rounded-3xl"
          aria-hidden
        />
      ) : null}

      <tile.Icon className="size-7 shrink-0 text-accent" aria-hidden="true" />

      <div className="flex flex-col gap-2">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.1em] text-muted/85">
          {tile.eyebrow}
        </span>
        <span className="flex items-start justify-between gap-3 text-lg font-semibold tracking-tight-sub text-ink">
          <span>{tile.title}</span>
          <ArrowLongRightIcon
            className="mt-1 size-4 shrink-0 text-muted/70 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </span>
        <p className="text-base leading-relaxed tracking-tight-p text-muted">
          {tile.description}
        </p>
      </div>
    </Link>
  );
}

interface DocIntroTileGridProps {
  tiles: DocIntroTileData[];
  className?: string;
}

export function DocIntroTileGrid({ tiles, className }: DocIntroTileGridProps) {
  return (
    <FeatureCardHoverGroup
      className={cn(
        "grid w-full max-w-[42rem] grid-cols-1 gap-4 pt-6 sm:grid-cols-2",
        className,
      )}
    >
      {tiles.map((tile) => (
        <DocIntroTile key={tile.href} tile={tile} cardHoverId={tile.href} />
      ))}
    </FeatureCardHoverGroup>
  );
}
