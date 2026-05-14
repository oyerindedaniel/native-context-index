"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { docsGroups, type DocsPage, type DocsGroup } from "@/lib/docs/registry";
import { docsGroupIcons, type IconComponent } from "@/lib/docs/icons";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { useDocumentScrollLock } from "@/lib/hooks/use-document-scroll-lock";

type ScopeId = "all" | DocsGroup["id"];

interface CommandResult {
  id: string;
  title: string;
  description: string;
  href: string;
  groupId: ScopeId;
  groupTitle: string;
  groupIcon: IconComponent;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  query: string;
  setQuery: (next: string) => void;
  scope: ScopeId;
  setScope: (next: ScopeId) => void;
  results: CommandResult[];
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  navigateToResult: (result: CommandResult) => void;
  /** Call when arrow keys move the highlight — hover is ignored until the pointer actually moves. */
  markResultsKeyboardNav: () => void;
  /** While keyboard drives the highlight, skip `onMouseEnter` selection until a real pointer move. */
  shouldIgnoreResultsHoverSelect: () => boolean;
}

const CommandPaletteContext =
  React.createContext<CommandPaletteContextValue | null>(null);

function useCommandPaletteContext(): CommandPaletteContextValue {
  const context = React.useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "CommandPalette sub-components must be used inside CommandPaletteRoot",
    );
  }
  return context;
}

function buildResults(query: string, scope: ScopeId): CommandResult[] {
  const lowered = query.trim().toLowerCase();
  const eligibleGroups: DocsGroup[] =
    scope === "all"
      ? docsGroups
      : docsGroups.filter((group) => group.id === scope);

  const matches: CommandResult[] = [];
  eligibleGroups.forEach((group) => {
    const groupIcon = docsGroupIcons[group.iconName];
    group.pages.forEach((page) => {
      if (lowered.length > 0) {
        const haystack =
          `${page.title} ${page.summary} ${page.eyebrow}`.toLowerCase();
        if (!haystack.includes(lowered)) {
          return;
        }
      }
      matches.push({
        id: page.slug,
        title: page.title,
        description: page.summary,
        href: page.slug,
        groupId: group.id,
        groupTitle: group.title,
        groupIcon,
      });
    });
  });
  return matches;
}

function pageBySlug(slug: string): DocsPage | undefined {
  for (const group of docsGroups) {
    const found = group.pages.find((page) => page.slug === slug);
    if (found) {
      return found;
    }
  }
  return undefined;
}

const SCOPE_ORDER: ScopeId[] = ["all", ...docsGroups.map((group) => group.id)];

function shiftScope(current: ScopeId, direction: 1 | -1): ScopeId {
  const currentIndex = SCOPE_ORDER.indexOf(current);
  if (currentIndex === -1) {
    return current;
  }
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= SCOPE_ORDER.length) {
    return current;
  }
  return SCOPE_ORDER[nextIndex] ?? current;
}

interface CommandPaletteRootProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
}

function CommandPaletteRoot({
  open,
  onOpenChange,
  children,
}: CommandPaletteRootProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<ScopeId>("all");
  const [activeIndex, setActiveIndex] = React.useState(0);
  /** After ↑/↓ from the input, ignore result hover until the user moves the pointing device. */
  const keyboardDrivesListRef = React.useRef(false);
  const lastPointerRef = React.useRef<{ x: number; y: number } | null>(null);

  const markResultsKeyboardNav = React.useCallback(() => {
    keyboardDrivesListRef.current = true;
  }, []);

  const shouldIgnoreResultsHoverSelect = React.useCallback(() => {
    return keyboardDrivesListRef.current;
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setScope("all");
      setActiveIndex(0);
      keyboardDrivesListRef.current = false;
      lastPointerRef.current = null;
      return;
    }
    keyboardDrivesListRef.current = false;
    lastPointerRef.current = null;
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const moveThresholdPx = 2;
    const thresholdSq = moveThresholdPx * moveThresholdPx;
    const onPointerMove = (event: PointerEvent) => {
      const { clientX, clientY } = event;
      const last = lastPointerRef.current;
      if (last) {
        const dx = clientX - last.x;
        const dy = clientY - last.y;
        if (dx * dx + dy * dy >= thresholdSq) {
          keyboardDrivesListRef.current = false;
        }
      }
      lastPointerRef.current = { x: clientX, y: clientY };
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [open]);

  const results = React.useMemo(
    () => buildResults(query, scope),
    [query, scope],
  );

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, scope]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const navigateToResult = React.useCallback(
    (result: CommandResult) => {
      const target = pageBySlug(result.href);
      if (!target) {
        return;
      }
      router.push(target.slug);
      onOpenChange(false);
    },
    [onOpenChange, router],
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const value = React.useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      setOpen,
      query,
      setQuery,
      scope,
      setScope,
      results,
      activeIndex,
      setActiveIndex,
      navigateToResult,
      markResultsKeyboardNav,
      shouldIgnoreResultsHoverSelect,
    }),
    [
      open,
      setOpen,
      query,
      scope,
      results,
      activeIndex,
      navigateToResult,
      markResultsKeyboardNav,
      shouldIgnoreResultsHoverSelect,
    ],
  );

  useDocumentScrollLock(open);

  return (
    <CommandPaletteContext.Provider value={value}>
      <AnimatePresence>{open ? children : null}</AnimatePresence>
    </CommandPaletteContext.Provider>
  );
}

interface CommandPaletteOverlayProps {
  className?: string;
  children: React.ReactNode;
}

function CommandPaletteOverlay({
  className,
  children,
}: CommandPaletteOverlayProps) {
  const { setOpen } = useCommandPaletteContext();
  const { containerRef, handleFocusBefore, handleFocusAfter } = useFocusTrap();

  const overlay = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Search documentation"
      className={cn(
        "fixed inset-0 flex bg-ink/45 backdrop-blur-sm",
        "max-md:h-[100dvh] max-md:flex-col max-md:items-stretch max-md:justify-start max-md:px-0 max-md:pt-0",
        "md:min-h-dvh md:items-center md:justify-center md:px-4 md:py-6",
        className,
      )}
      style={{ zIndex: "var(--nci-z-command-overlay)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div tabIndex={0} onFocus={handleFocusBefore} className="sr-only" />
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-elevated shadow-[0_8px_24px_-8px_#00000026,0_24px_48px_-16px_#0000002a]",
          "max-md:max-w-none max-md:max-h-dvh max-md:min-h-0 max-md:flex-1 max-md:rounded-none max-md:border-x-0 max-md:shadow-none",
          "md:max-h-[min(80vh,calc(100dvh-5rem))]",
        )}
        data-command-palette="dialog"
      >
        {children}
      </motion.div>
      <div tabIndex={0} onFocus={handleFocusAfter} className="sr-only" />
    </motion.div>
  );

  return createPortal(overlay, document.body);
}

function CommandPaletteInput() {
  const {
    open,
    query,
    setQuery,
    setOpen,
    results,
    activeIndex,
    setActiveIndex,
    navigateToResult,
    scope,
    setScope,
    markResultsKeyboardNav,
  } = useCommandPaletteContext();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      markResultsKeyboardNav();
      setActiveIndex((previous) => Math.min(results.length - 1, previous + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      markResultsKeyboardNav();
      setActiveIndex((previous) => Math.max(0, previous - 1));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Only steal the keystroke when the caret is at the relevant boundary
      // — otherwise the user is editing the query and expects normal cursor
      // movement inside the input.
      const input = event.currentTarget;
      const caretStart = input.selectionStart ?? 0;
      const caretEnd = input.selectionEnd ?? 0;
      const collapsed = caretStart === caretEnd;
      const atStart = collapsed && caretStart === 0;
      const atEnd = collapsed && caretStart === input.value.length;
      if (event.key === "ArrowLeft" && atStart) {
        const next = shiftScope(scope, -1);
        if (next !== scope) {
          event.preventDefault();
          setScope(next);
        }
        return;
      }
      if (event.key === "ArrowRight" && atEnd) {
        const next = shiftScope(scope, 1);
        if (next !== scope) {
          event.preventDefault();
          setScope(next);
        }
        return;
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) {
        navigateToResult(target);
      }
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border p-4">
      <MagnifyingGlassIcon
        className="size-4 shrink-0 text-muted/70"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="Search the docs..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent text-sm tracking-tight-p text-ink placeholder:text-muted/65 focus:outline-none"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="inline-flex size-6 items-center justify-center rounded-full text-muted/70 transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <XMarkIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close"
        className="hidden text-xs font-medium uppercase tracking-[0.08em] text-muted/70 hover:text-ink md:inline-flex"
      >
        Esc
      </button>
    </div>
  );
}

function CommandPalettePillRow() {
  const { scope, setScope } = useCommandPaletteContext();
  const pills: { id: ScopeId; label: string; icon?: IconComponent }[] = [
    { id: "all", label: "All" },
    ...docsGroups.map((group) => ({
      id: group.id,
      label: group.title,
      icon: docsGroupIcons[group.iconName],
    })),
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-surface/60 px-4 py-2.5">
      {pills.map((pill) => {
        const isActive = pill.id === scope;
        const PillIcon = pill.icon;
        return (
          <button
            key={pill.id}
            type="button"
            onClick={() => setScope(pill.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted/85 hover:bg-surface-hover hover:text-ink",
            )}
          >
            {PillIcon ? (
              <PillIcon className="size-3.5" aria-hidden="true" />
            ) : null}
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CommandPaletteResults() {
  const {
    results,
    activeIndex,
    setActiveIndex,
    navigateToResult,
    shouldIgnoreResultsHoverSelect,
  } = useCommandPaletteContext();
  const itemRefs = React.useRef(new Map<number, HTMLButtonElement | null>());

  React.useEffect(() => {
    const activeEl = itemRefs.current.get(activeIndex);
    if (!activeEl) {
      return;
    }

    // `behavior: "auto"` forces an instant scroll regardless of any
    // ancestor `scroll-behavior: smooth`; without this, arrow-nav that
    // crosses the visible boundary feels sluggish because the browser
    // walks up to the smooth-scrolling outer container.
    activeEl.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, [activeIndex, results]);

  if (results.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <p className="text-sm font-medium text-ink">No matches.</p>
        <p className="text-xs tracking-tight-p text-muted">
          Try a different keyword or pick another category.
        </p>
      </div>
    );
  }

  const groupedByGroup: Record<string, CommandResult[]> = {};
  results.forEach((result) => {
    const bucket = groupedByGroup[result.groupId] ?? [];
    bucket.push(result);
    groupedByGroup[result.groupId] = bucket;
  });

  let runningIndex = -1;
  return (
    <div
      data-command-palette-results
      className="min-h-0 flex-1 overflow-y-auto px-4 py-2 [scrollbar-gutter:stable] max-md:max-h-none"
    >
      {Object.entries(groupedByGroup).map(([groupId, items]) => {
        const groupTitle = items[0]?.groupTitle ?? groupId;
        const GroupIcon = items[0]?.groupIcon;
        return (
          <section key={groupId} className="py-2 first:pt-0">
            <header className="flex items-center gap-2 pb-1.5 text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/75">
              {GroupIcon ? (
                <GroupIcon className="size-3" aria-hidden="true" />
              ) : null}
              {groupTitle}
            </header>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                runningIndex += 1;
                const itemIndex = runningIndex;
                const isActive = itemIndex === activeIndex;
                return (
                  <li key={item.id}>
                    <button
                      ref={(node) => {
                        if (node) {
                          itemRefs.current.set(itemIndex, node);
                        } else {
                          itemRefs.current.delete(itemIndex);
                        }
                      }}
                      type="button"
                      onMouseEnter={() => {
                        if (shouldIgnoreResultsHoverSelect()) {
                          return;
                        }
                        setActiveIndex(itemIndex);
                      }}
                      onClick={() => navigateToResult(item)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-out",
                        "outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                        isActive
                          ? "bg-primary/10 text-ink"
                          : "text-ink/85 hover:bg-surface-hover",
                      )}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold tracking-tight">
                          {item.title}
                        </span>
                        <span className="truncate text-xs tracking-tight-p text-muted">
                          {item.description}
                        </span>
                      </div>
                      {isActive ? (
                        <ArrowUturnLeftIcon
                          className="size-3.5 -scale-x-100 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CommandPaletteFooter() {
  const { setOpen } = useCommandPaletteContext();
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/70 px-4 py-2 text-[0.7rem] font-medium uppercase tracking-[0.11em] text-muted/75">
      <div className="hidden items-center gap-3 md:flex">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border bg-elevated px-1.5 font-mono text-[10px] text-ink/85">
            ↵
          </kbd>
          Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 items-center rounded border border-border bg-elevated px-1.5 font-mono text-[10px] text-ink/85">
            ↑↓
          </kbd>
          Navigate
        </span>
      </div>
      <span className="hidden items-center gap-1.5 md:inline-flex">
        <kbd className="inline-flex h-5 items-center rounded border border-border bg-elevated px-1.5 font-mono text-[10px] text-ink/85">
          Esc
        </kbd>
        Close
      </span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close search"
        className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold normal-case tracking-tight text-ink/90 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 md:hidden"
      >
        <XMarkIcon
          className="size-4 shrink-0 text-muted/80"
          aria-hidden="true"
        />
        Close
      </button>
    </footer>
  );
}

CommandPaletteRoot.displayName = "CommandPalette.Root";
CommandPaletteOverlay.displayName = "CommandPalette.Overlay";
CommandPaletteInput.displayName = "CommandPalette.Input";
CommandPalettePillRow.displayName = "CommandPalette.PillRow";
CommandPaletteResults.displayName = "CommandPalette.Results";
CommandPaletteFooter.displayName = "CommandPalette.Footer";

export interface CommandPaletteNamespace {
  Root: typeof CommandPaletteRoot;
  Overlay: typeof CommandPaletteOverlay;
  Input: typeof CommandPaletteInput;
  PillRow: typeof CommandPalettePillRow;
  Results: typeof CommandPaletteResults;
  Footer: typeof CommandPaletteFooter;
}

export const CommandPalette: CommandPaletteNamespace = {
  Root: CommandPaletteRoot,
  Overlay: CommandPaletteOverlay,
  Input: CommandPaletteInput,
  PillRow: CommandPalettePillRow,
  Results: CommandPaletteResults,
  Footer: CommandPaletteFooter,
};
