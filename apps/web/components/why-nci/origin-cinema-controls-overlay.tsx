"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowPathIcon, PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

const OVERLAY_MOTION = {
  initial: { opacity: 0, scale: 0.94 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const },
  },
};

export interface OriginCinemaControlsOverlayProps {
  cinemaComplete: boolean;
  isUserPaused: boolean;
  onPauseTap: () => void;
  onResumeOrReplay: () => void;
}

export function OriginCinemaControlsOverlay({
  cinemaComplete,
  isUserPaused,
  onPauseTap,
  onResumeOrReplay,
}: OriginCinemaControlsOverlayProps) {
  return (
    <>
      {!isUserPaused && !cinemaComplete ? (
        <button
          type="button"
          onPointerUp={(event) => {
            event.preventDefault();
            onPauseTap();
          }}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
          aria-label="Pause trace"
        />
      ) : null}

      <AnimatePresence>
        {cinemaComplete || isUserPaused ? (
          <motion.button
            type="button"
            key={cinemaComplete ? "replay" : "paused"}
            {...OVERLAY_MOTION}
            onPointerUp={(event) => {
              event.preventDefault();
              onResumeOrReplay();
            }}
            className={cn(
              "absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-3 border-0 bg-white/72 p-0 backdrop-blur-[2px] outline-none",
              "transition-[background-color] duration-150 ease-out hover:bg-white/78",
              "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated",
            )}
            aria-label={cinemaComplete ? "Replay trace" : "Resume trace"}
          >
            <motion.div
              layout
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full border border-border bg-elevated text-ink",
                "shadow-[0_1px_0_rgb(255_255_255_/_0.9)_inset,0_2px_8px_-2px_rgb(0_0_0_/_0.12)]",
                "will-change-transform",
              )}
              aria-hidden
            >
              {cinemaComplete ? (
                <ArrowPathIcon className="size-7" aria-hidden="true" />
              ) : (
                <PlayIcon className="ml-0.5 size-7" aria-hidden="true" />
              )}
            </motion.div>
            <span className="text-xs font-medium tracking-tight-p text-muted">
              {cinemaComplete ? "Tap to replay" : "Paused — tap to resume"}
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Caliper / debug: corner pause + replay without the full-card blur overlay. */
export function OriginCinemaControlsOverlayDebug({
  cinemaComplete,
  isUserPaused,
  onTogglePause,
  onReplay,
}: {
  cinemaComplete: boolean;
  isUserPaused: boolean;
  onTogglePause: () => void;
  onReplay: () => void;
}) {
  return (
    <div
      id="caliper-why-nci-cinema-controls"
      className="absolute right-3 top-3 z-[35] flex items-center gap-2"
    >
      {cinemaComplete ? (
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface/80"
        >
          <ArrowPathIcon className="size-3.5" aria-hidden />
          Replay
        </button>
      ) : (
        <button
          type="button"
          onClick={onTogglePause}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface/80"
          aria-pressed={isUserPaused}
        >
          {!isUserPaused ? (
            <>
              <PauseIcon className="size-3.5" aria-hidden />
              Pause
            </>
          ) : (
            <>
              <PlayIcon className="size-3.5" aria-hidden />
              Play
            </>
          )}
        </button>
      )}
    </div>
  );
}
