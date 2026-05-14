"use client";

import * as React from "react";

export type IntersectionObserverTargetsOptions = {
  root?: Element | Document | null;
  rootMargin: string;
  threshold: number | number[];
};

function serializeThreshold(threshold: number | number[]): string {
  return Array.isArray(threshold) ? threshold.join(",") : String(threshold);
}

/**
 * Subscribes to `IntersectionObserver` while `effectIsEnabled` is true.
 * The handler always sees the latest `onIntersect` via `useEffectEvent`
 * without widening effect deps (stable subscription for fixed options).
 */
export function useIntersectionObserverEffect(
  elementRef: React.RefObject<Element | null>,
  effectIsEnabled: boolean,
  rootMargin: string,
  threshold: number | number[],
  onIntersect: (entry: IntersectionObserverEntry) => void,
): void {
  const handleIntersect = React.useEffectEvent(onIntersect);
  const thresholdKey = serializeThreshold(threshold);

  /* eslint-disable react-hooks/exhaustive-deps -- `handleIntersect` is `useEffectEvent`; omit from deps */
  React.useEffect(() => {
    if (!effectIsEnabled) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const elementNode = elementRef.current;
    if (!elementNode) {
      return;
    }
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const primaryEntry = entries[0];
        if (primaryEntry) {
          handleIntersect(primaryEntry);
        }
      },
      { root: null, rootMargin, threshold },
    );
    intersectionObserver.observe(elementNode);
    return () => intersectionObserver.disconnect();
  }, [effectIsEnabled, elementRef, rootMargin, thresholdKey, threshold]);
  /* eslint-enable react-hooks/exhaustive-deps */
}

/**
 * One observer observing multiple targets.
 * `onTargetEntries` receives the entry list for each observer callback (often
 * a batch of targets). `dependencyList` must include everything `getTargets`
 * reads so subscriptions stay in sync when the DOM set changes.
 */
export function useIntersectionObserverTargetsEffect(
  effectIsEnabled: boolean,
  observerOptions: IntersectionObserverTargetsOptions,
  getTargets: () => readonly Element[],
  dependencyList: React.DependencyList,
  onTargetEntries: (entries: readonly IntersectionObserverEntry[]) => void,
): void {
  const handleTargetEntries = React.useEffectEvent(onTargetEntries);
  const root = observerOptions.root ?? null;
  const { rootMargin, threshold } = observerOptions;
  const thresholdKey = serializeThreshold(threshold);

  /* eslint-disable react-hooks/exhaustive-deps -- `dependencyList` is the contract for
   * `getTargets`/DOM deps; `handleTargetEntries` is `useEffectEvent`; spread deps are intentional. */
  React.useEffect(() => {
    if (!effectIsEnabled) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const targets = getTargets();
    if (targets.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        handleTargetEntries(entries);
      },
      { root, rootMargin, threshold },
    );
    for (const target of targets) {
      observer.observe(target);
    }
    return () => observer.disconnect();
  }, [
    effectIsEnabled,
    root,
    rootMargin,
    thresholdKey,
    threshold,
    ...dependencyList,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */
}
