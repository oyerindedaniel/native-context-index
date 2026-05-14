"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { StagedDemo } from "@/components/marketing/staged-demo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ORIGIN_SCENES,
  type OriginBeat,
  type OriginCardBeat,
  type OriginMonoBeat,
} from "@/lib/why-nci/origin-cinema-script";

const DEFAULT_TYPING_MS_PER_CHAR = 11;
const CARD_TITLE_MS_PER_CHAR = 10;
const MONO_HOLD_MS = 420;
const PILL_DWELL_MS = 560;
const CARD_TITLE_HOLD_MS = 380;
const CARD_BODY_DWELL_MS = 2200;
const SCENE_GAP_MS = 620;

const SCENE_MOTION = {
  initial: { opacity: 0, y: 10, filter: "blur(6px)" as const },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)" as const,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(5px)" as const,
    transition: { duration: 0.26, ease: [0.4, 0, 1, 1] as const },
  },
};

function CinemaMonoLine({ text }: { text: string }) {
  return (
    <p className="font-mono text-[0.72rem] leading-relaxed text-code-ink/90 sm:text-[0.78rem]">
      {text}
    </p>
  );
}

function CinemaPill({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-center font-mono text-[0.72rem] text-code-ink/75 sm:text-[0.78rem]">
      {label}
    </div>
  );
}

function CinemaDocCard({ beat }: { beat: OriginCardBeat }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-black/35">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[0.65rem] text-code-ink/60 sm:text-[0.7rem]">
        <span className="inline-block size-2 shrink-0 rounded-full bg-emerald-500/80" />
        <span className="min-w-0 truncate">{beat.title}</span>
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-3 font-mono text-[0.68rem] leading-relaxed text-code-ink/88 sm:text-[0.74rem]">
        {beat.body}
      </pre>
    </div>
  );
}

function CinemaReducedMotionSummary() {
  return (
    <section className="my-10 sm:my-14" aria-label="Origin story">
      <h2 className="mb-4 font-instrument-serif text-2xl font-normal text-ink sm:text-3xl">
        Where this started
      </h2>
      <StagedDemo.Root>
        <StagedDemo.Card className="p-6 sm:p-8">
          <p className="text-base leading-relaxed tracking-tight-p text-muted">
            This trace is shortened from a real session: the agent searched
            generated types under{" "}
            <code className="nci-code-chip">expo-modules-core</code>, hit dead
            ends, opened public Expo docs, then worked through more files before
            landing on how{" "}
            <code className="nci-code-chip">useCameraPermissions()</code> is
            shaped. The full cinema animation is available with motion enabled
            in your system settings.
          </p>
        </StagedDemo.Card>
      </StagedDemo.Root>
    </section>
  );
}

export function WhyNciOriginCinema() {
  const prefersReducedMotion = useReducedMotion();

  const [playbackCursor, setPlaybackCursor] = React.useState({
    sceneIndex: 0,
    beatIndex: 0,
  });
  const [settledEntries, setSettledEntries] = React.useState<OriginBeat[]>([]);
  const [monoRevealLength, setMonoRevealLength] = React.useState(0);
  const [cardTitleRevealLength, setCardTitleRevealLength] = React.useState(0);
  const [cardBodyVisible, setCardBodyVisible] = React.useState(false);
  const [cinemaComplete, setCinemaComplete] = React.useState(false);
  const [shouldRunCinema, setShouldRunCinema] = React.useState(false);

  const sceneGapTimeoutRef = React.useRef<number | null>(null);
  const rootRef = React.useRef<HTMLElement | null>(null);

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

  const appendSettledAndAdvance = React.useCallback(
    (completedBeat: OriginBeat) => {
      setSettledEntries((previous) => [...previous, completedBeat]);
      setPlaybackCursor(({ sceneIndex, beatIndex }) => {
        const scene = ORIGIN_SCENES[sceneIndex];
        if (!scene) {
          return { sceneIndex, beatIndex };
        }
        const nextBeatIndex = beatIndex + 1;
        if (nextBeatIndex < scene.beats.length) {
          return { sceneIndex, beatIndex: nextBeatIndex };
        }
        if (sceneIndex + 1 < ORIGIN_SCENES.length) {
          if (sceneGapTimeoutRef.current) {
            window.clearTimeout(sceneGapTimeoutRef.current);
          }
          sceneGapTimeoutRef.current = window.setTimeout(() => {
            setPlaybackCursor({
              sceneIndex: sceneIndex + 1,
              beatIndex: 0,
            });
            setSettledEntries([]);
            resetPartials();
            sceneGapTimeoutRef.current = null;
          }, SCENE_GAP_MS);
          return { sceneIndex, beatIndex: scene.beats.length };
        }
        setCinemaComplete(true);
        return { sceneIndex, beatIndex: scene.beats.length };
      });
    },
    [resetPartials],
  );

  React.useLayoutEffect(() => {
    resetPartials();
  }, [playbackCursor.sceneIndex, playbackCursor.beatIndex, resetPartials]);

  React.useEffect(() => {
    return () => {
      if (sceneGapTimeoutRef.current) {
        window.clearTimeout(sceneGapTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || shouldRunCinema) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        setShouldRunCinema(true);
      },
      { root: null, rootMargin: "140px 0px 55% 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRunCinema]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
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
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    monoRevealLength,
  ]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
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
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    monoRevealLength,
    appendSettledAndAdvance,
  ]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "pill") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(currentBeat);
    }, PILL_DWELL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    appendSettledAndAdvance,
  ]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
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
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    cardTitleRevealLength,
    cardBodyVisible,
  ]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
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
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    cardTitleRevealLength,
    cardBodyVisible,
  ]);

  React.useEffect(() => {
    if (!shouldRunCinema || prefersReducedMotion || cinemaComplete) {
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
  }, [
    shouldRunCinema,
    prefersReducedMotion,
    cinemaComplete,
    currentBeat,
    cardBodyVisible,
    appendSettledAndAdvance,
  ]);

  const handleReplay = React.useCallback(() => {
    if (sceneGapTimeoutRef.current) {
      window.clearTimeout(sceneGapTimeoutRef.current);
      sceneGapTimeoutRef.current = null;
    }
    setPlaybackCursor({ sceneIndex: 0, beatIndex: 0 });
    setSettledEntries([]);
    resetPartials();
    setCinemaComplete(false);
    setShouldRunCinema(true);
  }, [resetPartials]);

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

  return (
    <section ref={rootRef} className="my-10 sm:my-14" aria-label="Origin story">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-instrument-serif text-2xl font-normal text-ink sm:text-3xl">
          Where this started
        </h2>
        {cinemaComplete ? (
          <button
            type="button"
            onClick={handleReplay}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-2",
            )}
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
            Replay
          </button>
        ) : null}
      </div>

      <StagedDemo.Root>
        <StagedDemo.Card className="p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Agent trace (illustration)
            </span>
            <span className="font-mono text-[0.65rem] text-muted sm:text-xs">
              Scene {playbackCursor.sceneIndex + 1} / {ORIGIN_SCENES.length}
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-code-surface px-3 py-4 sm:px-4 sm:py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={playbackCursor.sceneIndex}
                {...SCENE_MOTION}
                className="flex min-h-[12rem] flex-col gap-3 sm:min-h-[14rem]"
              >
                <div className="flex flex-col gap-3">
                  {settledEntries.map((entry, entryIndex) => {
                    const stableKey = `${playbackCursor.sceneIndex}-${entryIndex}-${entry.beatKind}`;
                    if (entry.beatKind === "mono") {
                      return (
                        <CinemaMonoLine key={stableKey} text={entry.text} />
                      );
                    }
                    if (entry.beatKind === "pill") {
                      return <CinemaPill key={stableKey} label={entry.text} />;
                    }
                    return <CinemaDocCard key={stableKey} beat={entry} />;
                  })}

                  {currentBeat?.beatKind === "mono" ? (
                    <div className="flex items-end gap-0.5">
                      <CinemaMonoLine text={partialMonoText} />
                      <span
                        className="mb-0.5 inline-block h-3.5 w-px animate-pulse bg-code-ink/50"
                        aria-hidden="true"
                      />
                    </div>
                  ) : null}

                  {currentBeat?.beatKind === "pill" ? (
                    <CinemaPill label={currentBeat.text} />
                  ) : null}

                  {currentBeat?.beatKind === "card" ? (
                    <div className="flex flex-col gap-2">
                      <CinemaMonoLine text={partialCardTitle} />
                      {cardBodyVisible ? (
                        <CinemaDocCard beat={currentBeat as OriginCardBeat} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </StagedDemo.Card>
      </StagedDemo.Root>
    </section>
  );
}
