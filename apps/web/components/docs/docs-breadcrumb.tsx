"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { TargetAndTransition } from "motion/react";
import {
  BookOpenIcon,
  BookmarkSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CommandLineIcon,
  LightBulbIcon,
  RectangleStackIcon,
  RocketLaunchIcon,
  TableCellsIcon,
} from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import {
  getAdjacentPages,
  getBreadcrumb,
  type DocsGroup,
  type DocsIconName,
  type DocsPage,
} from "@/lib/docs/registry";
import { useActiveHeadingLock } from "@/lib/hooks/use-active-heading-lock";

const GROUP_ICONS: Record<
  DocsIconName,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  RocketLaunchIcon,
  LightBulbIcon,
  BookOpenIcon,
  CommandLineIcon,
  RectangleStackIcon,
  BookmarkSquareIcon,
  TableCellsIcon,
};

function useBreadcrumbContext(): {
  pathname: string;
  current?: DocsPage;
  group?: DocsGroup;
} {
  const pathname = usePathname() ?? "";
  const { current, group } = getAdjacentPages(pathname);
  return { pathname, current, group };
}

interface DocsBreadcrumbStaticProps {
  className?: string;
}

export function DocsBreadcrumbStatic({ className }: DocsBreadcrumbStaticProps) {
  const { pathname } = useBreadcrumbContext();
  const items = getBreadcrumb(pathname);

  if (items.length === 0) {
    return null;
  }

  const lastIndex = items.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium",
        className,
      )}
    >
      {items.map((crumb, index) => {
        const isLast = index === lastIndex;
        const label = (
          <span
            className={cn("truncate", isLast ? "text-ink" : "text-muted/80")}
          >
            {crumb.label}
          </span>
        );
        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? (
              <ChevronRightIcon
                className="h-3.5 w-3.5 shrink-0 text-muted/50"
                aria-hidden="true"
              />
            ) : null}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="truncate text-muted/80 transition-colors hover:text-ink"
              >
                {crumb.label}
              </Link>
            ) : (
              label
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

interface DocsBreadcrumbInlineProps {
  className?: string;
  scopeSelector?: string;
}

type CSSVarStyle = React.CSSProperties & Record<`--${string}`, string | number>;

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 0.6, 1] as const;

const reducedInitial: TargetAndTransition = { opacity: 1 };
const reducedAnimate: TargetAndTransition = { opacity: 1 };
const reducedExit: TargetAndTransition = { opacity: 0 };

const animatedInitial: TargetAndTransition = {
  "--mask-pos": "0%",
  opacity: 0,
  filter: "blur(6px)",
  y: -3,
};

const animatedAnimate: TargetAndTransition = {
  "--mask-pos": "112%",
  opacity: 1,
  filter: "blur(0px)",
  y: 0,
};

const animatedExit: TargetAndTransition = {
  "--mask-pos": "0%",
  opacity: 0,
  filter: "blur(6px) drop-shadow(0 6px 10px rgba(17,19,24,0.45))",
  y: 4,
};

interface ActiveHeading {
  id: string;
  text: string;
}

interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const HEADING_QUERY = "h2[id], h3[id]";

function useDocsMainToc(
  scopeSelector: string,
  pathname: string,
): {
  headings: TocHeading[];
  activeHeading: ActiveHeading | null;
  pinActiveHeading: (id: string, lockMs?: number) => void;
} {
  const [headings, setHeadings] = React.useState<TocHeading[]>([]);
  const [activeHeading, setActiveHeading] =
    React.useState<ActiveHeading | null>(null);
  const activeLock = useActiveHeadingLock();
  const isLockedRef = React.useRef(activeLock.isLocked);
  isLockedRef.current = activeLock.isLocked;

  React.useEffect(() => {
    setActiveHeading(null);
    setHeadings([]);
    const scope = document.querySelector<HTMLElement>(scopeSelector);
    if (!scope) {
      return;
    }
    const nodes = Array.from(
      scope.querySelectorAll<HTMLElement>(HEADING_QUERY),
    ).filter((node) => Boolean(node.id));
    if (nodes.length === 0) {
      return;
    }

    setHeadings(
      nodes.map((node) => ({
        id: node.id,
        text: node.textContent?.trim() ?? node.id,
        level: node.tagName === "H3" ? 3 : 2,
      })),
    );

    const firstHeading = nodes[0];
    if (!firstHeading) {
      return;
    }

    let aboveFirst = true;

    const sentinelObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }
        aboveFirst = entry.boundingClientRect.top > 0;
        if (aboveFirst && !isLockedRef.current()) {
          setActiveHeading(null);
        }
      },
      { rootMargin: "0px 0px -100% 0px", threshold: [0] },
    );
    sentinelObserver.observe(firstHeading);

    const observer = new IntersectionObserver(
      (entries) => {
        if (aboveFirst || isLockedRef.current()) {
          return;
        }
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              first.intersectionRatio - second.intersectionRatio,
          );
        const top = visible.at(-1);
        const target = top?.target;
        if (target instanceof HTMLElement && target.id) {
          setActiveHeading({
            id: target.id,
            text: target.textContent?.trim() ?? target.id,
          });
        }
      },
      {
        rootMargin: "-96px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    nodes.forEach((node) => observer.observe(node));

    return () => {
      sentinelObserver.disconnect();
      observer.disconnect();
    };
  }, [scopeSelector, pathname]);

  const headingsRef = React.useRef(headings);
  headingsRef.current = headings;

  const pinActiveHeading = React.useCallback(
    (id: string, lockMs?: number) => {
      const fromList = headingsRef.current.find((heading) => heading.id === id);
      if (fromList) {
        setActiveHeading({ id: fromList.id, text: fromList.text });
      } else {
        const headingEl = document.getElementById(id);
        setActiveHeading({
          id,
          text: headingEl?.textContent?.trim() ?? id,
        });
      }
      if (lockMs && lockMs > 0) {
        activeLock.lock(lockMs);
      }
    },
    [activeLock],
  );

  return { headings, activeHeading, pinActiveHeading };
}

export function DocsBreadcrumbInline({
  className,
  scopeSelector = "#docs-main",
}: DocsBreadcrumbInlineProps) {
  const { pathname, current, group } = useBreadcrumbContext();
  const reduceMotion = useReducedMotion();
  const [openSide, setOpenSide] = React.useState<"pages" | "headings" | null>(
    null,
  );
  const panelId = React.useId();
  const navRef = React.useRef<HTMLElement>(null);
  const { headings, activeHeading, pinActiveHeading } = useDocsMainToc(
    scopeSelector,
    pathname,
  );

  React.useEffect(() => {
    setOpenSide(null);
  }, [current?.slug]);

  React.useEffect(() => {
    if (openSide === null) {
      return;
    }
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !navRef.current?.contains(target)) {
        setOpenSide(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSide(null);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openSide]);

  const scrollToHeading = React.useCallback(
    (id: string) => {
      const targetEl = document.getElementById(id);
      if (!targetEl) {
        setOpenSide(null);
        return;
      }
      const wasOpen = openSide !== null;
      setOpenSide(null);
      const closeBufferMs = wasOpen && !reduceMotion ? 240 : 0;
      // Pin + lock the active row so the IntersectionObserver doesn't
      // oscillate between intermediate sections during smooth scroll.
      // Lock window covers panel-collapse + a generous smooth-scroll budget.
      pinActiveHeading(id, reduceMotion ? 0 : closeBufferMs + 900);
      const run = () => {
        targetEl.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
        window.history.replaceState(
          null,
          "",
          `${pathname}${window.location.search}#${id}`,
        );
      };
      if (closeBufferMs === 0) {
        run();
      } else {
        window.setTimeout(run, closeBufferMs);
      }
    },
    [reduceMotion, openSide, pathname, pinActiveHeading],
  );

  if (!group || !current) {
    return null;
  }

  const GroupIcon = GROUP_ICONS[group.iconName] ?? BookOpenIcon;
  const displayLabel = activeHeading?.text ?? current.title;
  const displayKey = activeHeading?.id ?? `__page__:${current.slug}`;
  const hasToc = headings.length > 0;

  const labelMaskStyle: CSSVarStyle = {
    WebkitMaskImage:
      "linear-gradient(90deg, black calc(var(--mask-pos) - 18%), transparent var(--mask-pos))",
    maskImage:
      "linear-gradient(90deg, black calc(var(--mask-pos) - 18%), transparent var(--mask-pos))",
    willChange: "mask, filter, transform, opacity",
    "--mask-pos": "112%",
  };

  const panelOpen = openSide !== null;

  const panelContent =
    openSide === "pages" ? (
      <ul
        role="listbox"
        aria-label={`Pages in ${group.title}`}
        className="flex flex-col gap-0.5 px-1.5 py-1.5"
      >
        {group.pages.map((page) => {
          const isActive = page.slug === current.slug;
          return (
            <li key={page.slug}>
              <Link
                href={page.slug}
                role="option"
                aria-selected={isActive}
                tabIndex={openSide === "pages" ? 0 : -1}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-ink/85 hover:bg-surface-hover hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isActive ? "bg-primary" : "bg-muted/40",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{page.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : openSide === "headings" ? (
      <ul
        role="listbox"
        aria-label="On this page"
        className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-1.5 py-1.5"
      >
        {headings.map((heading) => {
          const isActive = heading.id === activeHeading?.id;
          return (
            <li key={heading.id}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                tabIndex={openSide === "headings" ? 0 : -1}
                onClick={() => scrollToHeading(heading.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                  heading.level === 3 && "pl-6",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-ink/85 hover:bg-surface-hover hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isActive ? "bg-primary" : "bg-muted/40",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{heading.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <nav
      ref={navRef}
      aria-label="Page location"
      className={cn(
        // Sticky bar. Note: no `overflow-hidden` here — the panel below is
        // absolutely-positioned so it overlays content rather than reserving
        // flow space. Reserving flow space would shift content downstream
        // when the nav is pinned.
        // Bottom corners flatten when open so the abs panel reads as one card.
        "sticky top-[calc(var(--spacing-docs-chrome)+0.5rem)] z-20 mb-6 max-w-full rounded-2xl border border-border bg-elevated/85 shadow-[0_1px_2px_#0000000a,inset_0_1px_#ffffff] backdrop-blur-md transition-[border-radius] duration-200 ease-out",
        panelOpen && "rounded-b-none",
        className,
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium">
        <button
          type="button"
          onClick={() =>
            setOpenSide((value) => (value === "pages" ? null : "pages"))
          }
          aria-expanded={openSide === "pages"}
          aria-controls={panelId}
          className={cn(
            "inline-flex min-w-0 max-w-[45%] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 outline-none transition-[background-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
            openSide === "pages"
              ? "bg-primary/10 text-primary"
              : "text-muted/85 hover:bg-surface-hover hover:text-ink",
          )}
        >
          <GroupIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{group.title}</span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200 ease-out",
              openSide === "pages" && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        <ChevronRightIcon
          className="size-3.5 shrink-0 text-muted/50"
          aria-hidden="true"
        />
        {hasToc ? (
          <button
            type="button"
            onClick={() =>
              setOpenSide((value) => (value === "headings" ? null : "headings"))
            }
            aria-expanded={openSide === "headings"}
            aria-controls={panelId}
            className={cn(
              "relative isolate flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-1 text-left text-ink outline-none transition-[background-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
              openSide === "headings"
                ? "bg-primary/10 text-primary"
                : "hover:bg-surface-hover/80",
            )}
            aria-current="page"
          >
            <span className="relative isolate min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={displayKey}
                  className="block w-full truncate"
                  style={labelMaskStyle}
                  initial={reduceMotion ? reducedInitial : animatedInitial}
                  animate={reduceMotion ? reducedAnimate : animatedAnimate}
                  exit={reduceMotion ? reducedExit : animatedExit}
                  transition={{
                    duration: reduceMotion ? 0 : 0.28,
                    ease: EXIT_EASE,
                  }}
                >
                  {displayLabel}
                </motion.span>
              </AnimatePresence>
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200 ease-out",
                openSide === "headings" && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span
            className="relative isolate flex min-w-0 flex-1 items-center overflow-hidden text-ink"
            aria-current="page"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={displayKey}
                className="block w-full truncate"
                style={labelMaskStyle}
                initial={reduceMotion ? reducedInitial : animatedInitial}
                animate={reduceMotion ? reducedAnimate : animatedAnimate}
                exit={reduceMotion ? reducedExit : animatedExit}
                transition={{
                  duration: reduceMotion ? 0 : 0.28,
                  ease: EXIT_EASE,
                }}
              >
                {displayLabel}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {panelOpen ? (
          <motion.div
            id={panelId}
            key="panel"
            // Absolute child of the sticky nav. Pinned-stickies act as the
            // containing block for abs descendants, so `top-full` and the
            // outset `-inset-x-px` align the overlay flush with the nav's
            // outer border at every scroll position — no document reflow.
            className="absolute -inset-x-px top-full z-10 overflow-hidden rounded-b-2xl border-x border-b border-border bg-elevated/95 shadow-[0_8px_18px_-10px_#0000001f,inset_0_-1px_#0000000a] backdrop-blur-md"
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, clipPath: "inset(0% 0% 100% 0%)" }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, clipPath: "inset(0% 0% 100% 0%)" }
            }
            transition={{
              duration: reduceMotion ? 0 : 0.24,
              ease: ENTER_EASE,
            }}
            aria-hidden={!panelOpen}
          >
            {panelContent}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}

DocsBreadcrumbStatic.displayName = "DocsBreadcrumb.Static";
DocsBreadcrumbInline.displayName = "DocsBreadcrumb.Inline";
