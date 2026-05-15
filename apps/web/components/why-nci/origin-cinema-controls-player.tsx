"use client";

import {
  ArrowPathIcon,
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/20/solid";
import { SplitButton } from "@/components/ui/split-button";
import { cn } from "@/lib/utils";

export interface OriginCinemaControlsPlayerProps {
  cinemaComplete: boolean;
  isUserPaused: boolean;
  isFirstScene: boolean;
  isLastScene: boolean;
  onStepBackward: () => void;
  onStepForward: () => void;
  onTogglePlayPause: () => void;
}

export function OriginCinemaControlsPlayer({
  cinemaComplete,
  isUserPaused,
  isFirstScene,
  isLastScene,
  onStepBackward,
  onStepForward,
  onTogglePlayPause,
}: OriginCinemaControlsPlayerProps) {
  const playPauseLabel = cinemaComplete
    ? "Replay trace"
    : isUserPaused
      ? "Resume trace"
      : "Pause trace";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-30",
        "opacity-0 transition-opacity duration-300 ease-out",
        "group-hover/cinema:opacity-100 group-focus-within/cinema:opacity-100",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[4.75rem] bg-gradient-to-t from-surface via-surface/72 to-transparent sm:h-[5.25rem]"
        aria-hidden
      />
      <div className="pointer-events-auto relative flex items-center justify-center gap-2 px-3 pb-3 pt-7 sm:gap-2.5 sm:px-4 sm:pb-3.5 sm:pt-8">
        <SplitButton.Root variant="outline" size="sm" className="shadow-sm">
          <SplitButton.IconTrigger
            onClick={onStepBackward}
            disabled={isFirstScene}
            aria-label="Previous scene"
          >
            <BackwardIcon className="size-4" aria-hidden="true" />
          </SplitButton.IconTrigger>
          <SplitButton.IconTrigger
            onClick={onStepForward}
            disabled={isLastScene && cinemaComplete}
            aria-label="Next scene"
          >
            <ForwardIcon className="size-4" aria-hidden="true" />
          </SplitButton.IconTrigger>
        </SplitButton.Root>

        <SplitButton.Root variant="outline" size="sm" className="shadow-sm">
          <SplitButton.Main
            onClick={onTogglePlayPause}
            aria-label={playPauseLabel}
            className="min-w-[5.25rem] justify-center gap-1.5"
          >
            {cinemaComplete ? (
              <ArrowPathIcon className="size-4 shrink-0" aria-hidden="true" />
            ) : isUserPaused ? (
              <PlayIcon className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <PauseIcon className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">
              {cinemaComplete ? "Replay" : isUserPaused ? "Play" : "Pause"}
            </span>
          </SplitButton.Main>
        </SplitButton.Root>
      </div>
    </div>
  );
}
