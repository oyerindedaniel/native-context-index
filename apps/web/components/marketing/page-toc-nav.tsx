"use client";

import * as React from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ListBulletIcon } from "@heroicons/react/20/solid";
import { useActiveHeadingLock } from "@/lib/hooks/use-active-heading-lock";
import { useIntersectionObserverTargetsEffect } from "@/lib/hooks/use-intersection-observer-effect";
import {
  computeKiteRotationPointsUp,
  KITE_SPRING,
  useKiteRotateTransition,
  useKiteTipUpOnScrollUp,
} from "@/lib/hooks/use-kite-tip-up-on-scroll-up";
import { TocActiveKiteMarker } from "@/components/marketing/toc-active-kite-marker";
import { cn } from "@/lib/utils";

export interface PageTocLinkItem {
  readonly id: string;
  readonly label: string;
  /** 0 = primary row (matches docs h2 indent), 1 = nested (matches docs h3 indent). */
  readonly depth?: 0 | 1;
}

export interface PageTocNavProps {
  readonly items: readonly PageTocLinkItem[];
  readonly className?: string;
  readonly heading?: string;
  readonly marker?: "dot" | "kite";
}

export function PageTocNav({
  items,
  className,
  heading = "On this page",
  marker = "dot",
}: PageTocNavProps) {
  const reduceMotion = useReducedMotion();
  const { kiteTipUp, resetKiteTipUp } = useKiteTipUpOnScrollUp(
    marker === "kite",
  );

  const layoutGroupId = React.useId().replace(/:/g, "");
  const firstId = items[0]?.id;
  const [activeId, setActiveId] = React.useState<string | null>(
    firstId ?? null,
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
    if (firstId && activeId === null) {
      setActiveId(firstId);
    }
  }, [firstId, activeId]);

  useIntersectionObserverTargetsEffect(
    true,
    {
      rootMargin: "-40% 0px -45% 0px",
      threshold: [0, 0.12, 0.25],
    },
    () => {
      const sectionNodes: HTMLElement[] = [];
      for (const item of items) {
        const node = document.getElementById(item.id);
        if (node) {
          sectionNodes.push(node);
        }
      }
      return sectionNodes;
    },
    [items],
    (entries) => {
      if (isLockedRef.current()) {
        return;
      }
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (first, second) => second.intersectionRatio - first.intersectionRatio,
        );
      const top = visible[0]?.target;
      if (top instanceof HTMLElement && top.id) {
        setActiveId(top.id);
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
      if (
        marker === "kite" &&
        firstId != null &&
        activeId === firstId &&
        id !== firstId
      ) {
        resetKiteTipUp();
      }
      setActiveId(id);
      activeLock.lock(900);
    },
    [activeLock, activeId, firstId, marker, resetKiteTipUp],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={heading}
      className={cn("hidden md:block md:justify-self-start", className)}
    >
      <div className="sticky top-28 w-[11.5rem]">
        <div className="mb-3 flex items-center gap-1.5 px-3 text-[0.68rem] font-medium uppercase tracking-[0.11em] text-muted/70">
          <ListBulletIcon
            className="size-3.5 -translate-y-px shrink-0"
            aria-hidden="true"
          />
          <span>{heading}</span>
        </div>
        <LayoutGroup id={`page-toc-${layoutGroupId}`}>
          <div className="relative">
            {marker === "kite" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-1 bottom-1 left-3 w-px bg-gradient-to-b from-primary/25 via-primary/12 to-primary/25"
              />
            ) : null}
            <ul className="flex flex-col">
              {items.map((item) => {
                const isActive = item.id === activeId;
                const depth = item.depth ?? 0;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(event) => handleNavigate(event, item.id)}
                      className={cn(
                        "group relative block rounded-md py-1.5 pr-3 text-[0.8125rem] tracking-tight-p outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                        depth === 1 ? "pl-12" : "pl-7",
                        isActive
                          ? "font-medium text-primary"
                          : "text-muted/85 hover:text-ink",
                      )}
                    >
                      {isActive ? (
                        marker === "kite" ? (
                          <TocActiveKiteMarker
                            layoutId={`page-toc-active-dot-${layoutGroupId}`}
                            kiteRotationPointsUp={kiteRotationPointsUp}
                            kiteRotateTransition={kiteRotateTransition}
                          />
                        ) : (
                          <motion.span
                            layoutId={`page-toc-active-dot-${layoutGroupId}`}
                            transition={KITE_SPRING}
                            className={cn(
                              "absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary",
                              depth === 1 ? "left-7" : "left-2",
                            )}
                            aria-hidden="true"
                          />
                        )
                      ) : null}
                      <span className="relative z-10 block truncate">
                        {item.label}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </LayoutGroup>
      </div>
    </nav>
  );
}
