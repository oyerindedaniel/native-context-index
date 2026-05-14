"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Maps to the three real `nci query` surfaces:
 *  - `find`: a list-hit row (id + 320-char truncated `signature_snippet`).
 *  - `snippet`: full `signature` + verbatim `js_doc`, cite-ready.
 *  - `show`: the entire stored symbol row (kind_name, parent_symbol_id, source_*, …).
 *
 * NCI does not have intermediate detail tiers — there is one `signature` string
 * per symbol; what changes between commands is *which fields* you ask for.
 */
type DetailLevel = "find" | "snippet" | "show";

interface SideBySideContextValue {
  activeHighlightId: string | null;
  setActiveHighlightId: (next: string | null) => void;
  detail: DetailLevel;
  setDetail: (next: DetailLevel) => void;
}

const SideBySideContext = React.createContext<SideBySideContextValue | null>(
  null,
);

function useSideBySideContext(): SideBySideContextValue {
  const context = React.useContext(SideBySideContext);
  if (!context) {
    throw new Error(
      "SideBySide sub-components must be used inside SideBySideRoot",
    );
  }
  return context;
}

interface SideBySideRootProps {
  defaultDetail?: DetailLevel;
  defaultHighlightId?: string | null;
  className?: string;
  children: React.ReactNode;
}

export function SideBySideRoot({
  defaultDetail = "snippet",
  defaultHighlightId = null,
  className,
  children,
}: SideBySideRootProps) {
  const [activeHighlightId, setActiveHighlightId] = React.useState<
    string | null
  >(defaultHighlightId);
  const [detail, setDetail] = React.useState<DetailLevel>(defaultDetail);

  const value = React.useMemo<SideBySideContextValue>(
    () => ({ activeHighlightId, setActiveHighlightId, detail, setDetail }),
    [activeHighlightId, detail],
  );

  return (
    <SideBySideContext.Provider value={value}>
      <div className={cn("my-6 grid gap-4 md:grid-cols-2 md:gap-5", className)}>
        {children}
      </div>
    </SideBySideContext.Provider>
  );
}

interface SideBySidePanelProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "source" | "index";
}

export function SideBySidePanel({
  title,
  subtitle,
  children,
  className,
  variant = "source",
}: SideBySidePanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-elevated",
        variant === "index" && "bg-surface/40",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-[0.11em] text-muted/80">
            {title}
          </span>
          {subtitle ? (
            <span className="text-[0.7rem] tracking-tight-p text-muted/70">
              {subtitle}
            </span>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-4 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

interface SideBySideHighlightProps {
  highlightId: string;
  className?: string;
  children: React.ReactNode;
}

export function SideBySideHighlight({
  highlightId,
  className,
  children,
}: SideBySideHighlightProps) {
  const { activeHighlightId, setActiveHighlightId } = useSideBySideContext();
  const isActive = activeHighlightId === highlightId;

  return (
    <span
      onMouseEnter={() => setActiveHighlightId(highlightId)}
      onMouseLeave={() => setActiveHighlightId(null)}
      onFocus={() => setActiveHighlightId(highlightId)}
      onBlur={() => setActiveHighlightId(null)}
      tabIndex={0}
      className={cn(
        "rounded-md px-1 py-0.5 transition-[background-color,color,box-shadow] duration-150 ease-out",
        isActive
          ? "bg-primary/12 text-ink ring-1 ring-primary/35"
          : "text-inherit hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface SideBySideRevealProps {
  show: DetailLevel | DetailLevel[];
  className?: string;
  children: React.ReactNode;
}

export function SideBySideReveal({
  show,
  className,
  children,
}: SideBySideRevealProps) {
  const { detail } = useSideBySideContext();
  const levels = Array.isArray(show) ? show : [show];
  const visible = levels.includes(detail);

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        height: visible ? "auto" : 0,
        marginTop: visible ? 8 : 0,
      }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: "hidden" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SideBySideDetailSliderProps {
  className?: string;
}

const detailLevels: { id: DetailLevel; label: string; hint: string }[] = [
  { id: "find", label: "find hit", hint: "list row · 320-char snippet" },
  { id: "snippet", label: "snippet", hint: "signature + js_doc" },
  { id: "show", label: "show row", hint: "full stored row" },
];

export function SideBySideDetailSlider({
  className,
}: SideBySideDetailSliderProps) {
  const { detail, setDetail } = useSideBySideContext();
  const layoutId = React.useId();

  return (
    <div
      className={cn(
        "col-span-full flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/60 px-3 py-2",
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-[0.11em] text-muted/80">
        Query
      </span>
      <div className="flex items-center gap-1">
        {detailLevels.map((level) => {
          const isActive = level.id === detail;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => setDetail(level.id)}
              title={`nci query ${level.id} — ${level.hint}`}
              className={cn(
                "relative inline-flex items-center rounded-full px-3 py-1 font-mono text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                isActive ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId={`side-by-side-detail-${layoutId}`}
                  className="absolute inset-0 -z-0 rounded-full bg-elevated shadow-[0_1px_2px_#00000010,0_6px_14px_-8px_#0000001a,inset_0_1px_#ffffff80]"
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                />
              ) : null}
              <span className="relative z-10">{level.label}</span>
            </button>
          );
        })}
      </div>
      <span className="ml-auto text-[0.7rem] tracking-tight-p text-muted/70">
        {detailLevels.find((level) => level.id === detail)?.hint}
      </span>
    </div>
  );
}

SideBySideRoot.displayName = "SideBySide.Root";
SideBySidePanel.displayName = "SideBySide.Panel";
SideBySideHighlight.displayName = "SideBySide.Highlight";
SideBySideReveal.displayName = "SideBySide.Reveal";
SideBySideDetailSlider.displayName = "SideBySide.DetailSlider";

export interface SideBySideNamespace {
  Root: typeof SideBySideRoot;
  Panel: typeof SideBySidePanel;
  Highlight: typeof SideBySideHighlight;
  Reveal: typeof SideBySideReveal;
  DetailSlider: typeof SideBySideDetailSlider;
}

export const SideBySide: SideBySideNamespace = {
  Root: SideBySideRoot,
  Panel: SideBySidePanel,
  Highlight: SideBySideHighlight,
  Reveal: SideBySideReveal,
  DetailSlider: SideBySideDetailSlider,
};
