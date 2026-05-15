"use client";

import * as React from "react";
import type { Transition } from "motion/react";

const SCROLL_DIR_THRESHOLD_PX = 8;

export const KITE_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.6,
};

export const KITE_ROTATE_SPRING = {
  type: "spring" as const,
  stiffness: 440,
  damping: 30,
  mass: 0.45,
};

export function computeKiteRotationPointsUp(
  kiteTipUp: boolean,
  firstId: string | null | undefined,
  activeId: string | null,
): boolean {
  return (
    kiteTipUp && !(firstId != null && activeId != null && activeId === firstId)
  );
}

export function useKiteRotateTransition(
  rotatePointsUp: boolean,
  reduceMotion: boolean | null,
): Transition {
  const prevRef = React.useRef(rotatePointsUp);
  const justFlipped = prevRef.current !== rotatePointsUp;
  React.useLayoutEffect(() => {
    prevRef.current = rotatePointsUp;
  }, [rotatePointsUp]);

  return reduceMotion
    ? { duration: 0 }
    : justFlipped
      ? KITE_ROTATE_SPRING
      : { type: "tween", duration: 0 };
}

export function useKiteTipUpOnScrollUp(enabled: boolean) {
  const [tipUp, setTipUp] = React.useState(false);
  const lastY = React.useRef(0);
  const resetKiteTipUp = React.useCallback(() => {
    setTipUp(false);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (delta < -SCROLL_DIR_THRESHOLD_PX) {
        setTipUp((prev) => (prev ? prev : true));
      } else if (delta > SCROLL_DIR_THRESHOLD_PX) {
        setTipUp((prev) => (!prev ? prev : false));
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return { kiteTipUp: tipUp, resetKiteTipUp };
}
