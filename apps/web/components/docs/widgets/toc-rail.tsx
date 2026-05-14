"use client";

import * as React from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { ListBulletIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { useActiveHeadingLock } from "@/lib/hooks/use-active-heading-lock";
import { useIntersectionObserverTargetsEffect } from "@/lib/hooks/use-intersection-observer-effect";

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

  // Native hash navigation handles scroll + URL hash + new-tab modifiers.
  // We only pin the click target and arm the IO lock so the active row
  // doesn't oscillate as the page passes intermediate sections. Skip when
  // the click is a "open in new tab/window" intent — the current page
  // doesn't actually scroll then.
  const handleNavigate = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      const opensElsewhere =
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey;
      if (opensElsewhere) {
        return;
      }
      setActiveId(id);
      activeLock.lock(900);
    },
    [activeLock],
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
          className="h-3.5 w-3.5 -translate-y-px"
          aria-hidden="true"
        />
        <span>On this page</span>
      </p>
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
                    layoutId="toc-active-dot"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32,
                      mass: 0.6,
                    }}
                    className={cn(
                      "absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary",
                      item.level === 3 ? "left-7" : "left-2",
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative z-10 block truncate">
                  {item.text}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
