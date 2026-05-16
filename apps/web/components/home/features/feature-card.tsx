"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useFeatureCardHoverGroup } from "./feature-card-hover-group";

const HOVER_HIGHLIGHT_TRANSITION = {
  type: "spring",
  stiffness: 420,
  damping: 36,
  mass: 0.85,
} as const;

interface FeatureCardProps {
  title: string;
  body: string;
  className?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  /** When inside {@link FeatureCardHoverGroup}, enables shared sliding hover fill. */
  cardHoverId?: string;
}

export function FeatureCard({
  title,
  body,
  className,
  icon,
  footer,
  cardHoverId,
}: FeatureCardProps) {
  const hoverGroup = useFeatureCardHoverGroup();
  const reduceMotion = useReducedMotion() === true;
  const usesSharedHover = cardHoverId !== undefined && hoverGroup !== null;
  const isHoverActive =
    usesSharedHover && hoverGroup.activeCardId === cardHoverId;

  return (
    <div
      className={cn(
        "group relative flex flex-col p-6",
        usesSharedHover && "isolate",
        className,
      )}
      onPointerEnter={
        usesSharedHover
          ? () => hoverGroup.setActiveCardId(cardHoverId)
          : undefined
      }
    >
      {usesSharedHover && isHoverActive && !reduceMotion ? (
        <motion.div
          layoutId={hoverGroup.layoutId}
          className="absolute inset-0 -z-10 bg-surface"
          transition={HOVER_HIGHLIGHT_TRANSITION}
          aria-hidden
        />
      ) : null}

      {usesSharedHover && isHoverActive && reduceMotion ? (
        <motion.div className="absolute inset-0 -z-10 bg-surface" aria-hidden />
      ) : null}

      <div className="mb-6 text-primary">
        {icon || <div className="size-6 rounded-md bg-border/50" />}
      </div>

      <h3 className="text-lg font-semibold tracking-tight-sub text-ink">
        {title}
      </h3>

      <p className="mt-3 text-base leading-relaxed tracking-tight-p text-muted">
        {body}
      </p>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}
