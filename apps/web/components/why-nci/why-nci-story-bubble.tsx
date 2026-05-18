"use client";

import { AnimatePresence, motion } from "motion/react";
import { ORIGIN_SCENE_CAPTIONS } from "@/lib/why-nci/origin-cinema-script";
import { cn } from "@/lib/utils";

const BUBBLE_MOTION = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.98,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
  },
};

const CAPTION_IDLE_HINT =
  "Short captions appear here between steps while the trace pauses so you can read what changed.";

export interface WhyNciStoryBubbleProps {
  readonly sceneIndex: number;
  readonly scrollArmed: boolean;
  readonly className?: string;
}

export function WhyNciStoryBubble({
  sceneIndex,
  scrollArmed,
  className,
}: WhyNciStoryBubbleProps) {
  const clampedSceneIndex = Math.min(
    Math.max(0, sceneIndex),
    ORIGIN_SCENE_CAPTIONS.length - 1,
  );
  const sceneTotal = ORIGIN_SCENE_CAPTIONS.length;
  const sceneNumber = clampedSceneIndex + 1;

  const captionText = scrollArmed
    ? ORIGIN_SCENE_CAPTIONS[clampedSceneIndex]
    : null;

  const captionKey = captionText !== null ? `cap-${clampedSceneIndex}` : "idle";

  return (
    <aside
      aria-live="polite"
      className={cn("w-full min-w-0 max-w-prose", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {captionText !== null ? (
          <motion.div
            key={captionKey}
            layout
            {...BUBBLE_MOTION}
            className="relative will-change-transform"
          >
            <div
              className={cn(
                "rounded-2xl border border-border bg-elevated px-4 py-3.5 shadow-[0_1px_0_rgb(255_255_255_/_0.9)_inset,0_8px_22px_-14px_rgb(0_0_0_/_0.12)]",
                "border-l-[3px] border-l-primary/35 pl-[calc(1rem-3px)]",
              )}
            >
              <div className="flex gap-3">
                <span
                  className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums tracking-tight text-primary"
                  aria-label={`Step ${sceneNumber} of ${sceneTotal}`}
                >
                  {sceneNumber}
                </span>
                <p className="min-w-0 flex-1 pt-0.5 text-[0.875rem] leading-relaxed tracking-tight-p text-muted">
                  {captionText}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-dashed border-border/80 bg-surface/50 px-4 py-3 text-[0.8125rem] leading-snug tracking-tight-p text-muted/85"
          >
            {CAPTION_IDLE_HINT}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
