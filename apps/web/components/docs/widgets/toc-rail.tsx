"use client";

import * as React from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
  const nodes = Array.from(scope.querySelectorAll<HTMLElement>(HEADING_QUERY));
  return nodes
    .filter((node) => Boolean(node.id))
    .map((node) => ({
      id: node.id,
      text: node.textContent?.trim() ?? node.id,
      level: Number.parseInt(node.tagName.substring(1), 10),
    }));
}

export function TocRail({ scopeSelector = "main", className }: TocRailProps) {
  const pathname = usePathname();
  const [items, setItems] = React.useState<TocItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

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

    const headingElements = collected
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (headingElements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              first.intersectionRatio - second.intersectionRatio,
          );
        const top = visible.at(-1);
        if (top?.target.id) {
          setActiveId(top.target.id);
        }
      },
      {
        rootMargin: "-96px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    headingElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [scopeSelector, pathname]);

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
      <p className="mb-3 px-3 text-[0.68rem] font-medium uppercase tracking-[0.11em] text-muted/70">
        On this page
      </p>
      <ul className="flex flex-col">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  "group relative block rounded-md py-1.5 pr-3 text-[0.8125rem] tracking-tight-p transition-colors duration-150 ease-out",
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
