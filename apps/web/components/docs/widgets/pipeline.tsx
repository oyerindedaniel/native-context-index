"use client";

import * as React from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";

interface PipelineContextValue {
  activeStageId: string | null;
  setActiveStageId: (next: string) => void;
  maxHops: number;
  setMaxHops: (next: number) => void;
}

const PipelineContext = React.createContext<PipelineContextValue | null>(null);

function usePipelineContext(): PipelineContextValue {
  const context = React.useContext(PipelineContext);
  if (!context) {
    throw new Error("Pipeline sub-components must be used inside PipelineRoot");
  }
  return context;
}

interface PipelineRootProps {
  defaultMaxHops?: number;
  className?: string;
  children: React.ReactNode;
}

export function PipelineRoot({
  defaultMaxHops = 10,
  className,
  children,
}: PipelineRootProps) {
  const [activeStageId, setActiveStageIdState] = React.useState<string | null>(
    null,
  );
  const [maxHops, setMaxHops] = React.useState<number>(defaultMaxHops);

  const setActiveStageId = React.useCallback((next: string) => {
    setActiveStageIdState(next);
  }, []);

  const value = React.useMemo<PipelineContextValue>(
    () => ({ activeStageId, setActiveStageId, maxHops, setMaxHops }),
    [activeStageId, setActiveStageId, maxHops],
  );

  return (
    <PipelineContext.Provider value={value}>
      <div
        className={cn(
          "my-8 flex flex-col gap-6 rounded-3xl border border-border bg-elevated p-5",
          className,
        )}
      >
        {children}
      </div>
    </PipelineContext.Provider>
  );
}

interface PipelineStageProps {
  stageId: string;
  index: number;
  title: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
}

export function PipelineStage({
  stageId,
  index,
  title,
  eyebrow,
  className,
  children,
}: PipelineStageProps) {
  const { activeStageId, setActiveStageId } = usePipelineContext();
  const stageRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.5 });
  const isActive = activeStageId === stageId;

  React.useEffect(() => {
    if (inView) {
      setActiveStageId(stageId);
    }
  }, [inView, setActiveStageId, stageId]);

  return (
    <motion.section
      ref={stageRef}
      data-stage-id={stageId}
      initial={false}
      animate={{
        borderColor: isActive ? "var(--color-primary)" : "var(--color-border)",
        backgroundColor: isActive
          ? "color-mix(in oklab, var(--color-primary) 4%, transparent)"
          : "var(--color-elevated)",
      }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border p-5",
        className,
      )}
    >
      <header className="flex items-start gap-4">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            isActive ? "bg-primary text-white" : "bg-surface text-ink/85",
          )}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-col">
          {eyebrow ? (
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/80">
              {eyebrow}
            </span>
          ) : null}
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {title}
          </h3>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </motion.section>
  );
}

interface PipelineStagePanelProps {
  side: "input" | "output";
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function PipelineStagePanel({
  side,
  label,
  children,
  className,
}: PipelineStagePanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-elevated/80 p-4",
        side === "output" && "bg-surface/40",
        className,
      )}
    >
      <span className="text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/80">
        {label}
      </span>
      <div className="text-base leading-relaxed tracking-tight-p text-ink/90">
        {children}
      </div>
    </div>
  );
}

interface PipelineStageNoteProps {
  className?: string;
  children: React.ReactNode;
}

export function PipelineStageNote({
  className,
  children,
}: PipelineStageNoteProps) {
  return (
    <div
      className={cn(
        "col-span-full text-sm leading-relaxed tracking-tight-p text-muted",
        "[&_p]:m-0 [&_p]:text-inherit [&_p]:leading-inherit [&_p]:tracking-inherit",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PipelineMaxHopsToggleProps {
  options?: number[];
  className?: string;
}

export function PipelineMaxHopsToggle({
  options = [0, 10, -1],
  className,
}: PipelineMaxHopsToggleProps) {
  const { maxHops, setMaxHops } = usePipelineContext();
  const layoutId = React.useId();

  return (
    <div
      className={cn(
        "col-span-full flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2",
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-[0.11em] text-muted/80">
        --max-hops
      </span>
      <div className="flex items-center gap-1">
        {options.map((option) => {
          const isActive = option === maxHops;
          const label = option === -1 ? "∞" : String(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMaxHops(option)}
              className={cn(
                "relative inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                isActive ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId={`pipeline-max-hops-${layoutId}`}
                  className="absolute inset-0 -z-0 rounded-full bg-elevated shadow-[0_1px_2px_#00000010,0_6px_14px_-8px_#0000001a,inset_0_1px_#ffffff80]"
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                />
              ) : null}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>
      <span className="text-[0.7rem] tracking-tight-p text-muted/70">
        controls how deep re-export chains are followed
      </span>
    </div>
  );
}

interface PipelineHopsResultProps {
  results: Record<number, string>;
  className?: string;
}

export function PipelineHopsResult({
  results,
  className,
}: PipelineHopsResultProps) {
  const { maxHops } = usePipelineContext();
  const value = results[maxHops];
  return (
    <p
      className={cn(
        "col-span-full rounded-xl border border-border bg-elevated px-4 py-3 text-sm tracking-tight-p text-ink/90",
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-[0.11em] text-muted/80">
        Result
      </span>
      <span className="ml-3 font-mono text-sm text-ink">{value ?? "—"}</span>
    </p>
  );
}

PipelineRoot.displayName = "Pipeline.Root";
PipelineStage.displayName = "Pipeline.Stage";
PipelineStagePanel.displayName = "Pipeline.StagePanel";
PipelineStageNote.displayName = "Pipeline.StageNote";
PipelineMaxHopsToggle.displayName = "Pipeline.MaxHopsToggle";
PipelineHopsResult.displayName = "Pipeline.HopsResult";

export interface PipelineNamespace {
  Root: typeof PipelineRoot;
  Stage: typeof PipelineStage;
  StagePanel: typeof PipelineStagePanel;
  StageNote: typeof PipelineStageNote;
  MaxHopsToggle: typeof PipelineMaxHopsToggle;
  HopsResult: typeof PipelineHopsResult;
}

export const Pipeline: PipelineNamespace = {
  Root: PipelineRoot,
  Stage: PipelineStage,
  StagePanel: PipelineStagePanel,
  StageNote: PipelineStageNote,
  MaxHopsToggle: PipelineMaxHopsToggle,
  HopsResult: PipelineHopsResult,
};
