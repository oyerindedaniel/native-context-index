"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ORIGIN_SCENE_CAPTIONS } from "@/lib/why-nci/origin-cinema-script";
import { useWhyNciStory } from "@/components/why-nci/why-nci-story-context";
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

export interface WhyNciStoryBubbleProps {
  readonly className?: string;
}

export function WhyNciStoryBubble({ className }: WhyNciStoryBubbleProps) {
  const { narrationSceneIndex, originCinemaUserPaused } = useWhyNciStory();
  const lastNarrationIndexRef = React.useRef<number | null>(null);

  const currentNarrationSceneIndex = narrationSceneIndex;
  if (
    currentNarrationSceneIndex !== null &&
    currentNarrationSceneIndex >= 0 &&
    currentNarrationSceneIndex < ORIGIN_SCENE_CAPTIONS.length
  ) {
    lastNarrationIndexRef.current = currentNarrationSceneIndex;
  }

  const activeCaptionIndex = React.useMemo(() => {
    if (
      currentNarrationSceneIndex !== null &&
      currentNarrationSceneIndex >= 0 &&
      currentNarrationSceneIndex < ORIGIN_SCENE_CAPTIONS.length
    ) {
      return currentNarrationSceneIndex;
    }
    if (
      originCinemaUserPaused &&
      lastNarrationIndexRef.current !== null &&
      lastNarrationIndexRef.current >= 0 &&
      lastNarrationIndexRef.current < ORIGIN_SCENE_CAPTIONS.length
    ) {
      return lastNarrationIndexRef.current;
    }
    return null;
  }, [currentNarrationSceneIndex, originCinemaUserPaused]);

  const captionText =
    activeCaptionIndex !== null
      ? ORIGIN_SCENE_CAPTIONS[activeCaptionIndex]
      : null;

  return (
    <aside
      aria-live="polite"
      className={cn("w-full min-w-0 max-w-prose", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {captionText !== null ? (
          <motion.div
            key={`cap-${activeCaptionIndex}`}
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
              <div className="text-[0.875rem] leading-relaxed tracking-tight-p text-muted">
                {captionText}
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
            Short captions appear here between steps while the trace pauses so
            you can read what changed.
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
