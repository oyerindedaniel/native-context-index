"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import {
  type OriginBeat,
  type OriginCardBeat,
  type OriginPillBeat,
} from "@/lib/why-nci/origin-cinema-script";

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

export const ORIGIN_CINEMA_SCENE_INNER_CLASS =
  "flex min-h-[10rem] min-w-0 flex-col gap-2.5 overflow-hidden sm:min-h-[11.5rem] md:min-h-[12rem] md:gap-3";

export const ORIGIN_CINEMA_STAGE_HEIGHT_TRANSITION = {
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1] as const,
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
    <motion.div
      layout
      className="relative flex flex-col gap-2 border-l-2 border-primary/30 py-1 pl-3 max-sm:gap-2 sm:block"
    >
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
    </motion.div>
  );
}

function CinemaDocCard({ beat }: { beat: OriginCardBeat }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/90 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.7)]">
      <motion.div
        layout
        className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted"
      >
        <span className="inline-block size-2 shrink-0 rounded-full bg-primary/55" />
        <span className="min-w-0 truncate">{beat.title}</span>
      </motion.div>
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
  let beatIndex = 0;
  while (beatIndex < beats.length) {
    const item = beats[beatIndex]!;
    if (item.beatKind === "mono") {
      const next = beats[beatIndex + 1];
      if (next?.beatKind === "pill") {
        nodes.push(
          <MonoLineWithPill
            key={`${keyPrefix}-${beatIndex}`}
            monoText={item.text}
            pillLabel={next.text}
          />,
        );
        beatIndex += 2;
        continue;
      }
      nodes.push(
        <CinemaMonoLine key={`${keyPrefix}-${beatIndex}`} text={item.text} />,
      );
      beatIndex += 1;
      continue;
    }
    if (item.beatKind === "card") {
      nodes.push(
        <CinemaDocCard key={`${keyPrefix}-${beatIndex}`} beat={item} />,
      );
      beatIndex += 1;
      continue;
    }
    beatIndex += 1;
  }
  return nodes;
}

export function CinemaReducedMotionSummary() {
  return (
    <motion.div
      layout
      className="scroll-mt-28 border border-border/80 bg-surface/40 px-5 py-6 sm:px-7 sm:py-7"
    >
      <p className="text-base leading-relaxed tracking-tight-p text-muted">
        This trace is shortened from a real session: the agent searched
        generated types under{" "}
        <code className="nci-code-chip">expo-modules-core</code>, hit dead ends,
        opened public Expo docs, then worked through more files before landing
        on how <code className="nci-code-chip">useCameraPermissions()</code> is
        shaped. The full sequence is available with motion enabled in your
        system settings.
      </p>
    </motion.div>
  );
}

export interface OriginCinemaStageContentProps {
  sceneIndex: number;
  settledForDisplay: readonly OriginBeat[];
  monoTailForPillOverlay: string | null;
  currentBeat: OriginBeat | undefined;
  partialMonoText: string;
  partialCardTitle: string;
  cardBodyVisible: boolean;
}

export function OriginCinemaStageContent({
  sceneIndex,
  settledForDisplay,
  monoTailForPillOverlay,
  currentBeat,
  partialMonoText,
  partialCardTitle,
  cardBodyVisible,
}: OriginCinemaStageContentProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sceneIndex}
        {...SCENE_MOTION}
        className={ORIGIN_CINEMA_SCENE_INNER_CLASS}
      >
        <div className="flex min-w-0 flex-col gap-2.5 overflow-hidden">
          {mapBeatsToNodes(settledForDisplay, `scene-${sceneIndex}`)}

          {monoTailForPillOverlay !== null &&
          currentBeat?.beatKind === "pill" ? (
            <MonoLineWithPill
              monoText={monoTailForPillOverlay}
              pillLabel={(currentBeat as OriginPillBeat).text}
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
  );
}
