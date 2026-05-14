"use client";

import * as React from "react";

/**
 * Tracks `offsetHeight` of a mounted element via `ResizeObserver`.
 * Uses `useEffectEvent` so the observer callback always reads the latest ref
 * without re-subscribing when unrelated render state changes.
 */
export function useResizeObserverElementHeight(
  elementRef: React.RefObject<HTMLElement | null>,
): number | null {
  const [observedHeightPx, setObservedHeightPx] = React.useState<number | null>(
    null,
  );

  const recordElementHeight = React.useEffectEvent(() => {
    const elementNode = elementRef.current;
    if (!elementNode) {
      return;
    }
    setObservedHeightPx(elementNode.offsetHeight);
  });

  React.useLayoutEffect(() => {
    const elementNode = elementRef.current;
    if (!elementNode || typeof ResizeObserver === "undefined") {
      return;
    }
    recordElementHeight();
    const resizeObserver = new ResizeObserver(() => {
      recordElementHeight();
    });
    resizeObserver.observe(elementNode);
    return () => resizeObserver.disconnect();
  }, [elementRef]);

  return observedHeightPx;
}
