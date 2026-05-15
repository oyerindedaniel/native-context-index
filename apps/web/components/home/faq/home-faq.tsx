"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FaqKiteTrigger } from "@/components/home/faq/faq-kite-trigger";
import { cn } from "@/lib/utils";

const PANEL_HEIGHT_EASE = [0.16, 1, 0.3, 1] as const;
const PANEL_HEIGHT_DURATION = 0.32;
const CONTENT_FADE_IN_DURATION = 0.22;
const CONTENT_FADE_IN_DELAY = 0.04;
const CONTENT_FADE_OUT_DURATION = 0.14;

interface FaqContextValue {
  openItemId: string | null;
  toggleItem: (itemId: string) => void;
  isItemOpen: (itemId: string) => boolean;
  reduceMotion: boolean | null;
}

const FaqContext = createContext<FaqContextValue | null>(null);

function useFaqContext(): FaqContextValue {
  const context = useContext(FaqContext);
  if (!context) {
    throw new Error("Faq compound components must be used within Faq.Root");
  }
  return context;
}

interface FaqRootProps {
  children: React.ReactNode;
  className?: string;
  defaultOpenItemId?: string | null;
}

export function FaqRoot({
  children,
  className,
  defaultOpenItemId = null,
}: FaqRootProps) {
  const reduceMotion = useReducedMotion();
  const [openItemId, setOpenItemId] = React.useState<string | null>(
    defaultOpenItemId,
  );

  const toggleItem = React.useCallback((itemId: string) => {
    setOpenItemId((previous) => (previous === itemId ? null : itemId));
  }, []);

  const isItemOpen = React.useCallback(
    (itemId: string) => openItemId === itemId,
    [openItemId],
  );

  const value = React.useMemo<FaqContextValue>(
    () => ({
      openItemId,
      toggleItem,
      isItemOpen,
      reduceMotion,
    }),
    [openItemId, toggleItem, isItemOpen, reduceMotion],
  );

  return (
    <FaqContext.Provider value={value}>
      <motion.div layout className={cn("w-full min-w-0", className)}>
        {children}
      </motion.div>
    </FaqContext.Provider>
  );
}

interface FaqListProps {
  children: React.ReactNode;
  className?: string;
}

export function FaqList({ children, className }: FaqListProps) {
  return (
    <motion.ul layout role="list" className={cn("flex flex-col", className)}>
      {children}
    </motion.ul>
  );
}

interface FaqItemProps {
  itemId: string;
  children: React.ReactNode;
  className?: string;
}

export function FaqItem({ itemId, children, className }: FaqItemProps) {
  const { isItemOpen } = useFaqContext();
  const isOpen = isItemOpen(itemId);

  return (
    <motion.li
      layout
      role="listitem"
      className={cn(
        "border-b border-border/70 last:border-b-0",
        isOpen && "bg-elevated/25",
        className,
      )}
    >
      {children}
    </motion.li>
  );
}

interface FaqTriggerProps {
  itemId: string;
  children: React.ReactNode;
  className?: string;
}

export function FaqTrigger({ itemId, children, className }: FaqTriggerProps) {
  const { toggleItem, isItemOpen } = useFaqContext();
  const isOpen = isItemOpen(itemId);
  const panelId = `faq-panel-${itemId}`;

  return (
    <button
      type="button"
      id={`faq-trigger-${itemId}`}
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={() => toggleItem(itemId)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md py-4 text-left outline-none transition-colors duration-150 ease-out",
        "hover:bg-surface-hover/50 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        className,
      )}
    >
      <FaqKiteTrigger isOpen={isOpen} className="mt-0.5" />
      <span className="min-w-0 flex-1 text-base font-medium tracking-tight-p text-ink">
        {children}
      </span>
    </button>
  );
}

interface FaqPanelProps {
  itemId: string;
  children: React.ReactNode;
  className?: string;
}

export function FaqPanel({ itemId, children, className }: FaqPanelProps) {
  const { isItemOpen, reduceMotion } = useFaqContext();
  const isOpen = isItemOpen(itemId);
  const panelId = `faq-panel-${itemId}`;

  const heightTransition = reduceMotion
    ? { duration: 0 }
    : { duration: PANEL_HEIGHT_DURATION, ease: PANEL_HEIGHT_EASE };

  const contentTransition = reduceMotion
    ? { duration: 0 }
    : isOpen
      ? {
          duration: CONTENT_FADE_IN_DURATION,
          delay: CONTENT_FADE_IN_DELAY,
        }
      : { duration: CONTENT_FADE_OUT_DURATION };

  return (
    <motion.div
      id={panelId}
      role="region"
      aria-labelledby={`faq-trigger-${itemId}`}
      initial={false}
      animate={{ height: isOpen ? "auto" : 0 }}
      transition={heightTransition}
      className="overflow-hidden"
    >
      <motion.div
        initial={false}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={contentTransition}
        className={cn(
          "ml-8 border-l-2 border-primary/35 bg-elevated/40 py-1 pl-4 pr-2 pb-4",
          className,
        )}
      >
        <motion.div className="text-sm leading-relaxed tracking-tight-p text-muted">
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

FaqRoot.displayName = "Faq.Root";
FaqList.displayName = "Faq.List";
FaqItem.displayName = "Faq.Item";
FaqTrigger.displayName = "Faq.Trigger";
FaqPanel.displayName = "Faq.Panel";

export interface FaqNamespace {
  Root: typeof FaqRoot;
  List: typeof FaqList;
  Item: typeof FaqItem;
  Trigger: typeof FaqTrigger;
  Panel: typeof FaqPanel;
}

export const Faq: FaqNamespace = {
  Root: FaqRoot,
  List: FaqList,
  Item: FaqItem,
  Trigger: FaqTrigger,
  Panel: FaqPanel,
};
