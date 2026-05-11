"use client";

import * as React from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import {
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  ChatBubbleOvalLeftIcon,
  WrenchScrewdriverIcon,
  SparklesIcon,
} from "@heroicons/react/20/solid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FrameKind = "thought" | "toolCall" | "response";

export interface AgentLoopFrameDescriptor {
  id: string;
  kind: FrameKind;
  label: string;
  body: React.ReactNode;
  durationMs?: number;
}

interface AgentLoopContextValue {
  frames: AgentLoopFrameDescriptor[];
  activeFrameIndex: number;
  isPlaying: boolean;
  setPlaying: (next: boolean) => void;
  restart: () => void;
  goToFrame: (index: number) => void;
}

const AgentLoopContext = React.createContext<AgentLoopContextValue | null>(
  null,
);

function useAgentLoopContext(): AgentLoopContextValue {
  const context = React.useContext(AgentLoopContext);
  if (!context) {
    throw new Error(
      "AgentLoop sub-components must be used inside AgentLoopRoot",
    );
  }
  return context;
}

interface AgentLoopRootProps {
  frames: AgentLoopFrameDescriptor[];
  className?: string;
  defaultPlaying?: boolean;
  children: React.ReactNode;
}

const DEFAULT_FRAME_DURATION_MS = 2200;

export function AgentLoopRoot({
  frames,
  className,
  defaultPlaying = true,
  children,
}: AgentLoopRootProps) {
  const [activeFrameIndex, setActiveFrameIndex] = React.useState(0);
  const [isPlaying, setPlaying] = React.useState(defaultPlaying);
  const tick = React.useRef<number | null>(null);

  const goToFrame = React.useCallback(
    (index: number) => {
      if (frames.length === 0) {
        return;
      }
      const wrapped = ((index % frames.length) + frames.length) % frames.length;
      setActiveFrameIndex(wrapped);
    },
    [frames.length],
  );

  const advance = React.useCallback(() => {
    setActiveFrameIndex((current) => (current + 1) % frames.length);
  }, [frames.length]);

  const restart = React.useCallback(() => {
    setActiveFrameIndex(0);
    setPlaying(true);
  }, []);

  React.useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const duration =
      frames[activeFrameIndex]?.durationMs ?? DEFAULT_FRAME_DURATION_MS;
    tick.current = window.setTimeout(advance, duration);
    return () => {
      if (tick.current !== null) {
        window.clearTimeout(tick.current);
      }
    };
  }, [isPlaying, activeFrameIndex, advance, frames]);

  const value = React.useMemo<AgentLoopContextValue>(
    () => ({
      frames,
      activeFrameIndex,
      isPlaying,
      setPlaying,
      restart,
      goToFrame,
    }),
    [frames, activeFrameIndex, isPlaying, restart, goToFrame],
  );

  return (
    <AgentLoopContext.Provider value={value}>
      <div
        className={cn(
          "my-8 flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-border bg-elevated p-5",
          className,
        )}
      >
        {children}
      </div>
    </AgentLoopContext.Provider>
  );
}

const FRAME_ENTRANCE: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const FRAME_TRANSITION = { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const };

interface AgentLoopStageProps {
  className?: string;
}

export function AgentLoopStage({ className }: AgentLoopStageProps) {
  const { frames, activeFrameIndex } = useAgentLoopContext();
  const active = frames[activeFrameIndex];
  if (!active) {
    return null;
  }

  const { Icon, accentClass, eyebrow } = describeFrame(active.kind);

  return (
    <div
      className={cn(
        "relative min-h-[10rem] w-full min-w-0 max-w-full overflow-x-clip overflow-y-visible rounded-2xl border border-border bg-surface/40 px-5 py-4 [contain:inline-size]",
        className,
      )}
    >
      <AnimatePresence mode="wait">
        <motion.article
          key={active.id}
          variants={FRAME_ENTRANCE}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={FRAME_TRANSITION}
          layout={false}
          className="flex w-full min-w-0 max-w-full flex-col gap-3"
        >
          <header className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                accentClass,
              )}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/85">
                {eyebrow}
              </span>
              <span className="truncate text-sm font-semibold tracking-tight-sub text-ink">
                {active.label}
              </span>
            </div>
          </header>
          <div className="min-w-0 w-full max-w-full overflow-x-clip text-sm leading-relaxed tracking-tight-p text-ink/85 [&_.nci-agent-loop-code]:min-w-0 [&_.nci-agent-loop-code]:max-w-full [&_pre]:my-0 [&_pre]:block [&_pre]:min-w-0 [&_pre]:w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]">
            {active.body}
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}

function describeFrame(kind: FrameKind): {
  Icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  eyebrow: string;
} {
  switch (kind) {
    case "thought":
      return {
        Icon: ChatBubbleOvalLeftIcon,
        accentClass: "bg-primary/12 text-primary",
        eyebrow: "Thought",
      };
    case "toolCall":
      return {
        Icon: WrenchScrewdriverIcon,
        accentClass: "bg-accent/12 text-accent",
        eyebrow: "Tool call",
      };
    case "response":
      return {
        Icon: SparklesIcon,
        accentClass: "bg-amber-100 text-amber-700",
        eyebrow: "Response",
      };
  }
}

interface AgentLoopProgressProps {
  className?: string;
}

export function AgentLoopProgress({ className }: AgentLoopProgressProps) {
  const { frames, activeFrameIndex, goToFrame } = useAgentLoopContext();
  return (
    <ol
      role="tablist"
      aria-label="Loop steps"
      className={cn(
        "flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/80",
        className,
      )}
    >
      {frames.map((frame, frameIndex) => {
        const isActive = frameIndex === activeFrameIndex;
        const isPast = frameIndex < activeFrameIndex;
        return (
          <li key={frame.id} className="flex items-center gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={frame.label}
              onClick={() => goToFrame(frameIndex)}
              className={cn(
                "-m-1 cursor-pointer rounded-md p-1 transition-[background-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                "hover:bg-surface-hover/80",
              )}
            >
              <span
                className={cn(
                  "block h-1.5 w-6 rounded-full transition-[background-color] duration-200 ease-out",
                  isActive
                    ? "bg-primary"
                    : isPast
                      ? "bg-primary/45"
                      : "bg-border",
                )}
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

interface AgentLoopControlsProps {
  className?: string;
}

export function AgentLoopControls({ className }: AgentLoopControlsProps) {
  const { isPlaying, setPlaying, restart } = useAgentLoopContext();
  const PlayPauseIcon = isPlaying ? PauseIcon : PlayIcon;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setPlaying(!isPlaying)}
        aria-label={isPlaying ? "Pause loop" : "Play loop"}
      >
        <PlayPauseIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={restart}
        aria-label="Restart loop"
      >
        <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

AgentLoopRoot.displayName = "AgentLoop.Root";
AgentLoopStage.displayName = "AgentLoop.Stage";
AgentLoopProgress.displayName = "AgentLoop.Progress";
AgentLoopControls.displayName = "AgentLoop.Controls";

export interface AgentLoopNamespace {
  Root: typeof AgentLoopRoot;
  Stage: typeof AgentLoopStage;
  Progress: typeof AgentLoopProgress;
  Controls: typeof AgentLoopControls;
}

export const AgentLoop: AgentLoopNamespace = {
  Root: AgentLoopRoot,
  Stage: AgentLoopStage,
  Progress: AgentLoopProgress,
  Controls: AgentLoopControls,
};
