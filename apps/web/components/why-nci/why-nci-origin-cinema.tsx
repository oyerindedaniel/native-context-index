"use client";

import * as React from "react";
import { motion } from "motion/react";
import { StagedDemo } from "@/components/marketing/staged-demo";
import { cn } from "@/lib/utils";
import type { OriginCinemaPlayback } from "@/lib/hooks/use-origin-cinema-playback";
import {
  CinemaReducedMotionSummary,
  OriginCinemaStageContent,
  ORIGIN_CINEMA_STAGE_HEIGHT_TRANSITION,
} from "@/components/why-nci/origin-cinema-stage";
import {
  OriginCinemaControlsOverlay,
  OriginCinemaControlsOverlayDebug,
} from "@/components/why-nci/origin-cinema-controls-overlay";
import { OriginCinemaControlsPlayer } from "@/components/why-nci/origin-cinema-controls-player";

/**
 * When `true`, hides the full-card tap-to-pause layer and the pause/replay blur
 * overlay so the stage stays visible (e.g. for Caliper). Top-right Pause/Play
 * and Replay remain available on the overlay variant only.
 */
const TEMP_CALIPER_DISABLE_PAUSE_OVERLAY = false;

export type OriginCinemaVariant = "overlay" | "player";

export interface WhyNciOriginCinemaProps {
  readonly playback: OriginCinemaPlayback;
  /** `overlay` = tap-to-pause with resume/replay sheet. `player` = hover-reveal bottom chrome. */
  readonly variant?: OriginCinemaVariant;
}

export function WhyNciOriginCinema({
  playback,
  variant = "player",
}: WhyNciOriginCinemaProps) {
  const {
    prefersReducedMotion,
    rootRef,
    measureRef,
    playbackCursor,
    currentBeat,
    settledForDisplay,
    monoTailForPillOverlay,
    partialMonoText,
    partialCardTitle,
    cardBodyVisible,
    cinemaComplete,
    targetStageHeight,
    story,
    restartFromBeginning,
    togglePlayPause,
    stepSceneBackward,
    stepSceneForward,
    isFirstScene,
    isLastScene,
  } = playback;

  const handleOverlayResumeOrReplay = React.useCallback(() => {
    if (cinemaComplete) {
      restartFromBeginning();
      return;
    }
    story.setOriginCinemaUserPaused(false);
  }, [cinemaComplete, restartFromBeginning, story]);

  const handlePlayerStagePointerUp = React.useCallback(() => {
    if (cinemaComplete) {
      restartFromBeginning();
      return;
    }
    story.setOriginCinemaUserPaused(!story.originCinemaUserPaused);
  }, [cinemaComplete, restartFromBeginning, story]);

  if (prefersReducedMotion) {
    return <CinemaReducedMotionSummary />;
  }

  const showOverlayControls =
    variant === "overlay" && !TEMP_CALIPER_DISABLE_PAUSE_OVERLAY;
  const showOverlayDebug =
    variant === "overlay" && TEMP_CALIPER_DISABLE_PAUSE_OVERLAY;
  const showPlayerControls = variant === "player";

  return (
    <div
      ref={rootRef}
      className="w-full min-w-0 max-sm:-mx-6 max-sm:w-[calc(100%+3rem)] max-sm:max-w-none"
    >
      <StagedDemo.Root className="max-sm:rounded-none max-sm:border-x-0 max-sm:p-3">
        <StagedDemo.Card
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border/90 bg-elevated/88 p-4 shadow-[0_1px_0_rgb(255_255_255_/_0.85)_inset,0_18px_48px_-28px_rgb(0_0_0_/_0.12)] max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-4 max-sm:pb-5 max-sm:pt-4 max-sm:shadow-none sm:p-5 md:p-6 lg:px-10 lg:py-9",
            showPlayerControls && "group/cinema",
          )}
        >
          {showOverlayDebug ? (
            <OriginCinemaControlsOverlayDebug
              cinemaComplete={cinemaComplete}
              isUserPaused={story.originCinemaUserPaused}
              onTogglePause={() => {
                story.setOriginCinemaUserPaused(!story.originCinemaUserPaused);
              }}
              onReplay={handleOverlayResumeOrReplay}
            />
          ) : null}

          <motion.div
            initial={false}
            animate={{ height: targetStageHeight }}
            transition={ORIGIN_CINEMA_STAGE_HEIGHT_TRANSITION}
            className={cn(
              "group/cinema relative z-0 w-full min-w-0 max-w-prose overflow-hidden rounded-xl border border-border bg-surface/95 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] [contain:inline-size] max-sm:rounded-none max-sm:border-0 max-sm:border-y max-sm:border-border/80 max-sm:shadow-none sm:rounded-xl md:rounded-xl",
              showPlayerControls && "cursor-pointer",
            )}
          >
            {showPlayerControls ? (
              <OriginCinemaControlsPlayer
                cinemaComplete={cinemaComplete}
                isUserPaused={story.originCinemaUserPaused}
                isFirstScene={isFirstScene}
                isLastScene={isLastScene}
                onStepBackward={stepSceneBackward}
                onStepForward={stepSceneForward}
                onTogglePlayPause={togglePlayPause}
              />
            ) : null}

            <motion.div ref={measureRef} className="p-3 sm:p-4">
              <OriginCinemaStageContent
                sceneIndex={playbackCursor.sceneIndex}
                settledForDisplay={settledForDisplay}
                monoTailForPillOverlay={monoTailForPillOverlay}
                currentBeat={currentBeat}
                partialMonoText={partialMonoText}
                partialCardTitle={partialCardTitle}
                cardBodyVisible={cardBodyVisible}
              />
            </motion.div>

            {showPlayerControls ? (
              <button
                type="button"
                onPointerUp={(event) => {
                  event.preventDefault();
                  handlePlayerStagePointerUp();
                }}
                className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                aria-label={
                  cinemaComplete
                    ? "Replay trace"
                    : story.originCinemaUserPaused
                      ? "Resume trace"
                      : "Pause trace"
                }
              />
            ) : null}
          </motion.div>

          {showOverlayControls ? (
            <OriginCinemaControlsOverlay
              cinemaComplete={cinemaComplete}
              isUserPaused={story.originCinemaUserPaused}
              onPauseTap={() => {
                story.setOriginCinemaUserPaused(true);
              }}
              onResumeOrReplay={handleOverlayResumeOrReplay}
            />
          ) : null}
        </StagedDemo.Card>
      </StagedDemo.Root>
    </div>
  );
}
