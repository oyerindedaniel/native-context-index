"use client";

import * as React from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { ListBulletIcon } from "@heroicons/react/20/solid";
import { NciKiteMark } from "@/components/marketing/nci-kite-mark";
import { cn } from "@/lib/utils";
import { useActiveHeadingLock } from "@/lib/hooks/use-active-heading-lock";
import { useIntersectionObserverTargetsEffect } from "@/lib/hooks/use-intersection-observer-effect";
import {
  computeKiteRotationPointsUp,
  KITE_SPRING,
  useKiteRotateTransition,
  useKiteTipUpOnScrollUp,
} from "@/lib/hooks/use-kite-tip-up-on-scroll-up";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TocRailProps {
  scopeSelector?: string;
  className?: string;
}

const HEADING_QUERY = "h2[id], h3[id]";

function readHeadings(scope: HTMLElement): TocItem[] {
  const items: TocItem[] = [];
  for (const node of scope.querySelectorAll<HTMLElement>(HEADING_QUERY)) {
    if (!node.id) {
      continue;
    }
    items.push({
      id: node.id,
      text: node.textContent?.trim() ?? node.id,
      level: Number.parseInt(node.tagName.substring(1), 10),
    });
  }
  return items;
}

export function TocRail({ scopeSelector = "main", className }: TocRailProps) {
  const pathname = usePathname();
  const [items, setItems] = React.useState<TocItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const layoutGroupId = React.useId().replace(/:/g, "");
  const firstId = items[0]?.id ?? null;

  const reduceMotion = useReducedMotion();
  const { kiteTipUp, resetKiteTipUp } = useKiteTipUpOnScrollUp(
    items.length > 0,
  );
  const kiteRotationPointsUp = computeKiteRotationPointsUp(
    kiteTipUp,
    firstId,
    activeId,
  );
  const kiteRotateTransition = useKiteRotateTransition(
    kiteRotationPointsUp,
    reduceMotion,
  );

  const activeLock = useActiveHeadingLock();
  const isLockedRef = React.useRef(activeLock.isLocked);
  isLockedRef.current = activeLock.isLocked;

  React.useEffect(() => {
    const scope = document.querySelector<HTMLElement>(scopeSelector);
    if (!scope) {
      return;
    }

    const collected = readHeadings(scope);
    setItems(collected);
    const firstHeading = collected[0];
    if (firstHeading) {
      setActiveId(firstHeading.id);
    }
  }, [scopeSelector, pathname]);

  useIntersectionObserverTargetsEffect(
    items.length > 0,
    {
      rootMargin: "-96px 0px -55% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    },
    () => {
      const headingElements: HTMLElement[] = [];
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (element) {
          headingElements.push(element);
        }
      }
      return headingElements;
    },
    [items],
    (entries) => {
      if (isLockedRef.current()) {
        return;
      }
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (first, second) => first.intersectionRatio - second.intersectionRatio,
        );
      const top = visible.at(-1);
      if (top?.target.id) {
        setActiveId(top.target.id);
      }
    },
  );

  const handleNavigate = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      const opensElsewhere =
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey;
      if (opensElsewhere) {
        return;
      }
      if (firstId != null && activeId === firstId && id !== firstId) {
        resetKiteTipUp();
      }
      setActiveId(id);
      activeLock.lock(900);
    },
    [activeId, activeLock, firstId, resetKiteTipUp],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="On this page"
      className={cn(
        "sticky top-24 hidden h-[calc(100vh-7rem)] w-56 shrink-0 self-start overflow-y-auto pl-4 text-sm xl:block",
        className,
      )}
    >
      <p className="mb-3 flex items-center gap-1.5 px-3 text-[0.68rem] font-medium uppercase tracking-[0.11em] text-muted/70">
        <ListBulletIcon
          className="size-3.5 -translate-y-px shrink-0"
          aria-hidden="true"
        />
        <span>On this page</span>
      </p>
      <LayoutGroup id={`docs-toc-${layoutGroupId}`}>
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 left-3 w-px bg-gradient-to-b from-primary/25 via-primary/12 to-primary/25"
          />
          <ul className="flex flex-col">
            {items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => handleNavigate(event, item.id)}
                    className={cn(
                      "group relative block rounded-md py-1.5 pr-3 text-[0.8125rem] tracking-tight-p outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                      item.level === 3 ? "pl-12" : "pl-7",
                      isActive
                        ? "font-medium text-primary"
                        : "text-muted/85 hover:text-ink",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId={`docs-toc-active-kite-${layoutGroupId}`}
                        transition={KITE_SPRING}
                        className="absolute z-[1] flex h-[1.05rem] w-[1rem] items-center justify-center"
                        aria-hidden="true"
                        style={{
                          left: "calc(0.75rem + 0.85px)",
                          top: "50%",
                          marginLeft: "-0.5rem",
                          marginTop: "-0.525rem",
                        }}
                      >
                        <motion.span
                          initial={false}
                          className="flex size-full will-change-transform items-center justify-center"
                          style={{ transformOrigin: "50% 50%" }}
                          animate={{
                            rotate: kiteRotationPointsUp ? 180 : 0,
                          }}
                          transition={kiteRotateTransition}
                        >
                          <NciKiteMark className="h-full w-full translate-x-px drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.06)]" />
                        </motion.span>
                      </motion.span>
                    ) : null}
                    <span className="relative z-10 block truncate">
                      {item.text}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </LayoutGroup>
    </aside>
  );
}
