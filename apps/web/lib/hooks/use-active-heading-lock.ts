"use client";

import * as React from "react";

interface ActiveHeadingLock {
  /**
   * Whether observer-driven active-heading updates should currently be
   * ignored. IntersectionObserver callbacks should bail when this returns
   * true, so the highlighted entry doesn't churn through every section the
   * page crosses while a programmatic smooth scroll is in flight.
   *
   * NOTE: this does not freeze page scrolling — the page keeps scrolling
   * normally; only the active-state updates are paused.
   */
  isLocked: () => boolean;
  /**
   * Pause observer-driven updates until the page settles (`scrollend`) or
   * the `maxMs` fallback elapses, whichever comes first. Safe to call
   * repeatedly — calling again resets the window.
   */
  lock: (maxMs?: number) => void;
}

const DEFAULT_MAX_MS = 900;

/**
 * Suppresses active-heading churn during a click-driven smooth scroll.
 * Typical flow: a user clicks a TOC entry → caller sets the active row to
 * the click target → caller calls `lock(...)` → the IntersectionObserver
 * (which would otherwise oscillate as the page passes intermediate
 * sections) bails until the page settles. Then it resumes naturally.
 */
export function useActiveHeadingLock(): ActiveHeadingLock {
  const lockedUntilRef = React.useRef(0);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const release = React.useCallback(() => {
    lockedUntilRef.current = 0;
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  const lock = React.useCallback(
    (maxMs: number = DEFAULT_MAX_MS) => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      lockedUntilRef.current = now + maxMs;

      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      if (typeof window === "undefined") {
        return;
      }

      const supportsScrollEnd = "onscrollend" in window;
      const onScrollEnd = () => release();
      const timeoutId = window.setTimeout(release, maxMs);

      if (supportsScrollEnd) {
        window.addEventListener("scrollend", onScrollEnd, { once: true });
      }

      cleanupRef.current = () => {
        window.clearTimeout(timeoutId);
        if (supportsScrollEnd) {
          window.removeEventListener("scrollend", onScrollEnd);
        }
      };
    },
    [release],
  );

  const isLocked = React.useCallback(() => {
    if (lockedUntilRef.current === 0) {
      return false;
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    return now < lockedUntilRef.current;
  }, []);

  React.useEffect(() => () => release(), [release]);

  return { isLocked, lock };
}
