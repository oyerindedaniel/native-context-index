"use client";

import * as React from "react";

/**
 * Tracks the element’s laid-out **visible** height via `ResizeObserver` (`border-box`).
 *
 * Uses **`clientHeight`**: for `overflow: auto` + `max-height` shells it tracks the
 * scrollport (clipped) height; **`offsetHeight`** is fine for plain blocks but can
 * disagree slightly around scrollbars / subpixel layout.
 *
 * **`_resetKey`**: reserved for a future stale-height reset (callers may pass e.g.
 * scene keys); not read yet.
 */
export function useResizeObserverElementHeight(
  elementRef: React.RefObject<HTMLElement | null>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for callers; not read yet
  _resetKey?: string,
): number | null {
  const [observedHeightPx, setObservedHeightPx] = React.useState<number | null>(
    null,
  );

  const recordElementHeight = React.useEffectEvent(() => {
    const elementNode = elementRef.current;
    if (!elementNode) {
      return;
    }
    const nextHeightPx = elementNode.clientHeight;
    setObservedHeightPx(
      Number.isFinite(nextHeightPx) && nextHeightPx >= 0 ? nextHeightPx : null,
    );
  });

  /* eslint-disable react-hooks/exhaustive-deps -- `recordElementHeight` is `useEffectEvent`; omit from deps */
  React.useLayoutEffect(() => {
    // setObservedHeightPx(null);
    const elementNode = elementRef.current;
    if (!elementNode || typeof ResizeObserver === "undefined") {
      return;
    }
    const measureFrameId = requestAnimationFrame(() => {
      recordElementHeight();
    });
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        recordElementHeight();
      });
    });
    resizeObserver.observe(elementNode, { box: "border-box" });
    return () => {
      cancelAnimationFrame(measureFrameId);
      resizeObserver.disconnect();
    };
  }, [elementRef]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return observedHeightPx;
}
