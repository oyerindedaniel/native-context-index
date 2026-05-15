"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowPathIcon, PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { StagedDemo } from "@/components/marketing/staged-demo";
import { cn } from "@/lib/utils";
import {
  ORIGIN_SCENES,
  type OriginBeat,
  type OriginCardBeat,
  type OriginMonoBeat,
} from "@/lib/why-nci/origin-cinema-script";
import { useWhyNciStory } from "@/components/why-nci/why-nci-story-context";
import { useResizeObserverElementHeight } from "@/lib/hooks/use-resize-observer-element-height";
import { useIntersectionObserverEffect } from "@/lib/hooks/use-intersection-observer-effect";

const DEFAULT_TYPING_MS_PER_CHAR = 11;
const CARD_TITLE_MS_PER_CHAR = 10;
const MONO_HOLD_MS = 420;
const PILL_DWELL_MS = 560;
const CARD_TITLE_HOLD_MS = 380;
const CARD_BODY_DWELL_MS = 2200;

const STAGE_HEIGHT_TRANSITION = {
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1] as const,
};

const STAGE_MIN_HEIGHT_PX = 130;

/**
 * When `true`, hides the full-card tap-to-pause layer and the pause/replay blur
 * overlay so the stage stays visible (e.g. for Caliper). Top-right Pause/Play
 * and Replay remain available. Toggle to `false` to restore the default UX;
 * both code paths stay in the tree and are gated only by this flag.
 */
const TEMP_CALIPER_DISABLE_PAUSE_OVERLAY = false;

const ORIGIN_CINEMA_INTERSECTION_ROOT_MARGIN = "120px 0px 50% 0px";
const ORIGIN_CINEMA_INTERSECTION_THRESHOLD = 0;

type PlaybackCursorState = {
  sceneIndex: number;
  beatIndex: number;
};

function computePlaybackOutcomeAfterBeatCompletes(
  previousCursor: PlaybackCursorState,
): {
  nextCursor: PlaybackCursorState;
  pendingBetweenScenesSceneIndex: number | null;
  markCinemaComplete: boolean;
} {
  const { sceneIndex, beatIndex } = previousCursor;
  const scene = ORIGIN_SCENES[sceneIndex];
  if (!scene) {
    return {
      nextCursor: previousCursor,
      pendingBetweenScenesSceneIndex: null,
      markCinemaComplete: false,
    };
  }
  const nextBeatIndex = beatIndex + 1;
  if (nextBeatIndex < scene.beats.length) {
    return {
      nextCursor: { sceneIndex, beatIndex: nextBeatIndex },
      pendingBetweenScenesSceneIndex: null,
      markCinemaComplete: false,
    };
  }
  if (sceneIndex + 1 < ORIGIN_SCENES.length) {
    return {
      nextCursor: { sceneIndex, beatIndex: scene.beats.length },
      pendingBetweenScenesSceneIndex: sceneIndex,
      markCinemaComplete: false,
    };
  }
  return {
    nextCursor: { sceneIndex, beatIndex: scene.beats.length },
    pendingBetweenScenesSceneIndex: null,
    markCinemaComplete: true,
  };
}

const SCENE_MOTION = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" as const },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)" as const,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -6,
    filter: "blur(3px)" as const,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  },
};

const SCENE_INNER_CLASS =
  "flex min-h-[10rem] min-w-0 flex-col gap-2.5 overflow-hidden sm:min-h-[11.5rem] md:min-h-[12rem] md:gap-3";

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

function CinemaMonoLine({ text }: { text: string }) {
  return (
    <p className="min-w-0 break-words border-l-2 border-transparent pl-3 font-mono text-sm leading-relaxed tracking-tight-p text-ink/88 [overflow-wrap:anywhere]">
      {text}
    </p>
  );
}

function MonoLineWithPill({
  monoText,
  pillLabel,
}: {
  monoText: string;
  pillLabel: string;
}) {
  return (
    <div className="relative flex flex-col gap-2 border-l-2 border-primary/30 py-1 pl-3 max-sm:gap-2 sm:block">
      <p
        className={cn(
          "min-w-0 max-w-full break-words font-mono text-sm leading-relaxed tracking-tight-p text-ink/88 [overflow-wrap:anywhere]",
          "max-sm:pr-0 sm:pr-[9.5rem] md:pr-[10.25rem]",
        )}
      >
        {monoText}
      </p>
      <div
        className={cn(
          "z-[1] w-fit max-w-full rounded-full border border-border bg-elevated px-2.5 py-1 text-left font-mono text-[0.7rem] font-medium text-muted",
          "shadow-[0_1px_0_rgb(255_255_255_/_0.9)_inset,0_2px_6px_-2px_rgb(0_0_0_/_0.12)]",
          "max-sm:relative max-sm:translate-y-0 sm:pointer-events-none sm:absolute sm:right-0.5 sm:top-1/2 sm:-translate-y-1/2 sm:text-center",
        )}
        aria-hidden
      >
        {pillLabel}
      </div>
    </div>
  );
}

function CinemaDocCard({ beat }: { beat: OriginCardBeat }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/90 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.7)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted">
        <span className="inline-block size-2 shrink-0 rounded-full bg-primary/55" />
        <span className="min-w-0 truncate">{beat.title}</span>
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap p-3 font-mono text-[0.8rem] leading-relaxed text-ink/85">
        {beat.body}
      </pre>
    </div>
  );
}

function mapBeatsToNodes(
  beats: readonly OriginBeat[],
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let index = 0;
  while (index < beats.length) {
    const item = beats[index]!;
    if (item.beatKind === "mono") {
      const next = beats[index + 1];
      if (next?.beatKind === "pill") {
        nodes.push(
          <MonoLineWithPill
            key={`${keyPrefix}-${index}`}
            monoText={item.text}
            pillLabel={next.text}
          />,
        );
        index += 2;
        continue;
      }
      nodes.push(
        <CinemaMonoLine key={`${keyPrefix}-${index}`} text={item.text} />,
      );
      index += 1;
      continue;
    }
    if (item.beatKind === "card") {
      nodes.push(<CinemaDocCard key={`${keyPrefix}-${index}`} beat={item} />);
      index += 1;
      continue;
    }
    index += 1;
  }
  return nodes;
}

function CinemaReducedMotionSummary() {
  return (
    <div className="scroll-mt-28 border border-border/80 bg-surface/40 px-5 py-6 sm:px-7 sm:py-7">
      <p className="text-base leading-relaxed tracking-tight-p text-muted">
        This trace is shortened from a real session: the agent searched
        generated types under{" "}
        <code className="nci-code-chip">expo-modules-core</code>, hit dead ends,
        opened public Expo docs, then worked through more files before landing
        on how <code className="nci-code-chip">useCameraPermissions()</code> is
        shaped. The full sequence is available with motion enabled in your
        system settings.
      </p>
    </div>
  );
}

export function WhyNciOriginCinema() {
  const prefersReducedMotion = useReducedMotion();
  const story = useWhyNciStory();

  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const measuredStageHeight = useResizeObserverElementHeight(measureRef);

  const intersectionObserverSupported =
    typeof IntersectionObserver !== "undefined";

  useIntersectionObserverEffect(
    rootRef,
    intersectionObserverSupported && !story.originCinemaScrollArmed,
    ORIGIN_CINEMA_INTERSECTION_ROOT_MARGIN,
    ORIGIN_CINEMA_INTERSECTION_THRESHOLD,
    (entry) => {
      if (entry.isIntersecting) {
        story.setOriginCinemaScrollArmed(true);
        story.setOriginCinemaUserPaused(false);
      }
    },
  );

  React.useEffect(() => {
    if (!intersectionObserverSupported) {
      story.setOriginCinemaScrollArmed(true);
    }
  }, [intersectionObserverSupported, story]);

  const [playbackCursor, setPlaybackCursor] = React.useState({
    sceneIndex: 0,
    beatIndex: 0,
  });
  const playbackCursorRef = React.useRef(playbackCursor);
  React.useLayoutEffect(() => {
    playbackCursorRef.current = playbackCursor;
  }, [playbackCursor]);

  const [pendingBetweenScenesSceneIndex, setPendingBetweenScenesSceneIndex] =
    React.useState<number | null>(null);

  const [settledEntries, setSettledEntries] = React.useState<OriginBeat[]>([]);
  const [monoRevealLength, setMonoRevealLength] = React.useState(0);
  const [cardTitleRevealLength, setCardTitleRevealLength] = React.useState(0);
  const [cardBodyVisible, setCardBodyVisible] = React.useState(false);
  const [cinemaComplete, setCinemaComplete] = React.useState(false);

  const currentScene = ORIGIN_SCENES[playbackCursor.sceneIndex];
  const currentBeat =
    currentScene && playbackCursor.beatIndex < currentScene.beats.length
      ? currentScene.beats[playbackCursor.beatIndex]
      : undefined;

  const resetPartials = React.useCallback(() => {
    setMonoRevealLength(0);
    setCardTitleRevealLength(0);
    setCardBodyVisible(false);
  }, []);

  React.useEffect(() => {
    if (pendingBetweenScenesSceneIndex === null) {
      return;
    }
    const sceneIndex = pendingBetweenScenesSceneIndex;
    setPendingBetweenScenesSceneIndex(null);
    story.scheduleBetweenScenes(sceneIndex, () => {
      setPlaybackCursor({
        sceneIndex: sceneIndex + 1,
        beatIndex: 0,
      });
      setSettledEntries([]);
      resetPartials();
    });
  }, [pendingBetweenScenesSceneIndex, story, resetPartials]);

  const timelineRunning =
    story.originCinemaScrollArmed &&
    !prefersReducedMotion &&
    !cinemaComplete &&
    !story.timelineSuspended &&
    !story.originCinemaUserPaused;

  const appendSettledAndAdvance = React.useCallback(
    (_completedBeat: OriginBeat) => {
      setSettledEntries((previous) => [...previous, _completedBeat]);
      const previousCursor = playbackCursorRef.current;
      const outcome = computePlaybackOutcomeAfterBeatCompletes(previousCursor);
      setPlaybackCursor(outcome.nextCursor);
      if (outcome.pendingBetweenScenesSceneIndex !== null) {
        setPendingBetweenScenesSceneIndex(
          outcome.pendingBetweenScenesSceneIndex,
        );
      }
      if (outcome.markCinemaComplete) {
        setCinemaComplete(true);
      }
    },
    [],
  );

  const restartFromBeginning = React.useCallback(() => {
    story.clearBetweenScenes();
    setPlaybackCursor({ sceneIndex: 0, beatIndex: 0 });
    setSettledEntries([]);
    resetPartials();
    setCinemaComplete(false);
    setPendingBetweenScenesSceneIndex(null);
    story.setOriginCinemaScrollArmed(true);
    story.setOriginCinemaUserPaused(false);
  }, [resetPartials, story]);

  React.useLayoutEffect(() => {
    resetPartials();
  }, [playbackCursor.sceneIndex, playbackCursor.beatIndex, resetPartials]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "mono") {
      return;
    }
    const monoBeat = currentBeat as OriginMonoBeat;
    if (monoRevealLength >= monoBeat.text.length) {
      return;
    }
    const delayMs = monoBeat.typingMsPerChar ?? DEFAULT_TYPING_MS_PER_CHAR;
    const timeoutId = window.setTimeout(() => {
      setMonoRevealLength((previous) => previous + 1);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, monoRevealLength]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "mono") {
      return;
    }
    const monoBeat = currentBeat as OriginMonoBeat;
    if (monoRevealLength < monoBeat.text.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(monoBeat);
    }, MONO_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, monoRevealLength, appendSettledAndAdvance]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "pill") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(currentBeat);
    }, PILL_DWELL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, appendSettledAndAdvance]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    if (cardTitleRevealLength >= cardBeat.title.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCardTitleRevealLength((previous) => previous + 1);
    }, CARD_TITLE_MS_PER_CHAR);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardTitleRevealLength, cardBodyVisible]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    if (cardTitleRevealLength < cardBeat.title.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCardBodyVisible(true);
    }, CARD_TITLE_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardTitleRevealLength, cardBodyVisible]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (!cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(cardBeat);
    }, CARD_BODY_DWELL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardBodyVisible, appendSettledAndAdvance]);

  const handleOverlayPointerUp = React.useCallback(() => {
    if (prefersReducedMotion) {
      return;
    }
    if (cinemaComplete) {
      restartFromBeginning();
      return;
    }
    story.setOriginCinemaUserPaused(false);
  }, [cinemaComplete, prefersReducedMotion, restartFromBeginning, story]);

  if (prefersReducedMotion) {
    return <CinemaReducedMotionSummary />;
  }

  const partialMonoText =
    currentBeat?.beatKind === "mono"
      ? (currentBeat as OriginMonoBeat).text.slice(0, monoRevealLength)
      : "";

  const partialCardTitle =
    currentBeat?.beatKind === "card"
      ? (currentBeat as OriginCardBeat).title.slice(0, cardTitleRevealLength)
      : "";

  const settledForDisplay =
    currentBeat?.beatKind === "pill" &&
    settledEntries.length > 0 &&
    settledEntries[settledEntries.length - 1]!.beatKind === "mono"
      ? settledEntries.slice(0, -1)
      : settledEntries;

  const monoTailForPillOverlay =
    currentBeat?.beatKind === "pill" &&
    settledEntries.length > 0 &&
    settledEntries[settledEntries.length - 1]!.beatKind === "mono"
      ? (settledEntries[settledEntries.length - 1] as OriginMonoBeat).text
      : null;

  const targetStageHeight =
    measuredStageHeight === null
      ? "auto"
      : Math.max(STAGE_MIN_HEIGHT_PX, measuredStageHeight);

  return (
    <div
      ref={rootRef}
      className="w-full min-w-0 max-sm:-mx-6 max-sm:w-[calc(100%+3rem)] max-sm:max-w-none"
    >
      <StagedDemo.Root className="max-sm:rounded-none max-sm:border-x-0 max-sm:p-3">
        <StagedDemo.Card className="relative overflow-hidden rounded-2xl border border-border/90 bg-elevated/88 p-4 shadow-[0_1px_0_rgb(255_255_255_/_0.85)_inset,0_18px_48px_-28px_rgb(0_0_0_/_0.12)] max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-4 max-sm:pb-5 max-sm:pt-4 max-sm:shadow-none sm:p-5 md:p-6 lg:px-10 lg:py-9">
          {TEMP_CALIPER_DISABLE_PAUSE_OVERLAY ? (
            <div
              id="caliper-why-nci-cinema-controls"
              className="absolute right-3 top-3 z-[35] flex items-center gap-2"
            >
              {cinemaComplete ? (
                <button
                  type="button"
                  onClick={() => {
                    handleOverlayPointerUp();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface/80"
                >
                  <ArrowPathIcon className="size-3.5" aria-hidden />
                  Replay
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    story.setOriginCinemaUserPaused(
                      !story.originCinemaUserPaused,
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface/80"
                  aria-pressed={story.originCinemaUserPaused}
                >
                  {!story.originCinemaUserPaused ? (
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
          ) : null}

          <motion.div
            initial={false}
            animate={{ height: targetStageHeight }}
            transition={STAGE_HEIGHT_TRANSITION}
            className="relative z-0 w-full min-w-0 max-w-prose overflow-hidden rounded-xl border border-border bg-surface/95 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.75)] [contain:inline-size] max-sm:rounded-none max-sm:border-0 max-sm:border-y max-sm:border-border/80 max-sm:shadow-none sm:rounded-xl md:rounded-xl"
          >
            <div ref={measureRef} className="p-3 sm:p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={playbackCursor.sceneIndex}
                  {...SCENE_MOTION}
                  className={SCENE_INNER_CLASS}
                >
                  <div className="flex min-w-0 flex-col gap-2.5 overflow-hidden">
                    {mapBeatsToNodes(
                      settledForDisplay,
                      `scene-${playbackCursor.sceneIndex}`,
                    )}

                    {monoTailForPillOverlay !== null &&
                    currentBeat?.beatKind === "pill" ? (
                      <MonoLineWithPill
                        monoText={monoTailForPillOverlay}
                        pillLabel={currentBeat.text}
                      />
                    ) : null}

                    {currentBeat?.beatKind === "mono" ? (
                      <div className="min-w-0 overflow-hidden border-l-2 border-transparent pl-3">
                        <p className="min-w-0 max-w-full break-words font-mono text-sm leading-relaxed tracking-tight-p text-ink/88 [overflow-wrap:anywhere]">
                          {partialMonoText}
                          <span
                            aria-hidden
                            className="ml-px inline-block h-[1.125em] w-px translate-y-[0.05em] align-baseline animate-pulse bg-ink/35"
                          />
                        </p>
                      </div>
                    ) : null}

                    {currentBeat?.beatKind === "card" ? (
                      <div className="flex min-w-0 flex-col gap-2 overflow-hidden border-l-2 border-transparent pl-3">
                        <p className="min-w-0 break-words font-mono text-sm leading-relaxed tracking-tight-p text-ink/88 [overflow-wrap:anywhere]">
                          {partialCardTitle}
                        </p>
                        {cardBodyVisible ? (
                          <CinemaDocCard beat={currentBeat as OriginCardBeat} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>

          {!TEMP_CALIPER_DISABLE_PAUSE_OVERLAY &&
          !story.originCinemaUserPaused &&
          !cinemaComplete ? (
            <button
              type="button"
              onPointerUp={(event) => {
                event.preventDefault();
                story.setOriginCinemaUserPaused(true);
              }}
              className="absolute inset-0 z-10 cursor-pointer rounded-2xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
              aria-label="Pause trace"
            />
          ) : null}

          {!TEMP_CALIPER_DISABLE_PAUSE_OVERLAY ? (
            <AnimatePresence>
              {cinemaComplete || story.originCinemaUserPaused ? (
                <motion.button
                  type="button"
                  key={cinemaComplete ? "replay" : "paused"}
                  {...OVERLAY_MOTION}
                  onPointerUp={(event) => {
                    event.preventDefault();
                    handleOverlayPointerUp();
                  }}
                  className={cn(
                    "absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-3 border-0 bg-white/72 p-0 backdrop-blur-[2px] outline-none",
                    "transition-[background-color] duration-150 ease-out hover:bg-white/78",
                    "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated",
                  )}
                  aria-label={cinemaComplete ? "Replay trace" : "Resume trace"}
                >
                  <div
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
                  </div>
                  <span className="text-xs font-medium tracking-tight-p text-muted">
                    {cinemaComplete
                      ? "Tap to replay"
                      : "Paused — tap to resume"}
                  </span>
                </motion.button>
              ) : null}
            </AnimatePresence>
          ) : null}
        </StagedDemo.Card>
      </StagedDemo.Root>
    </div>
  );
}
