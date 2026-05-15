"use client";

import * as React from "react";
import {
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import {
  resolveDisplayValue,
  resolveFillRatio,
  resolveFillTop,
  resolveTiltDegrees,
} from "@/components/benchmarks/benchmark-vessel/benchmark-vessel-math";
import {
  BENCHMARK_VESSEL_SLOSH,
  BENCHMARK_VESSEL_SPRING,
} from "@/components/benchmarks/benchmark-vessel/benchmark-vessel-timing";

const INNER_TOP = 0;
const INNER_HEIGHT = 100;
const VESSEL_CENTER_X = 50;
const SURFACE_VISIBLE_RATIO = 0.04;

export const BENCHMARK_VESSEL_INNER = {
  top: INNER_TOP,
  height: INNER_HEIGHT,
  left: 0,
  width: 100,
  centerX: VESSEL_CENTER_X,
  viewBoxWidth: 100,
  viewBoxHeight: 100,
  valueLabelY: INNER_HEIGHT - 8,
} as const;

export type BenchmarkVesselMotionInput = {
  value: number;
  min: number;
  max: number;
  maxTiltDegrees: number;
  sloshEnabled: boolean;
  playOnView: boolean;
  manualPlayback: boolean;
  replayToken: number;
  resetToken: number;
  containerRef: React.RefObject<HTMLElement | null>;
};

export function useBenchmarkVesselMotion({
  value,
  min,
  max,
  maxTiltDegrees,
  sloshEnabled,
  playOnView,
  manualPlayback,
  replayToken,
  resetToken,
  containerRef,
}: BenchmarkVesselMotionInput) {
  const reduceMotion = useReducedMotion() === true;
  const inView = useInView(containerRef, {
    once: true,
    amount: 0.15,
    margin: "0px 0px -5% 0px",
  });

  const targetRatio = resolveFillRatio({ value, min, max });
  const autoPlayAllowed =
    !manualPlayback && !reduceMotion && (!playOnView || inView);
  const shouldHoldAtEmpty =
    !reduceMotion &&
    (manualPlayback ? replayToken === 0 : playOnView && !inView);

  const fillRatioSpring = useSpring(
    shouldHoldAtEmpty ? 0 : reduceMotion ? targetRatio : 0,
    BENCHMARK_VESSEL_SPRING,
  );

  const fillVelocity = useVelocity(fillRatioSpring);
  const sloshSpring = useSpring(0, BENCHMARK_VESSEL_SLOSH);

  React.useEffect(() => {
    if (reduceMotion) {
      fillRatioSpring.set(targetRatio);
      return;
    }

    if (autoPlayAllowed) {
      fillRatioSpring.set(targetRatio);
    }
  }, [autoPlayAllowed, fillRatioSpring, targetRatio, reduceMotion]);

  const previousResetTokenRef = React.useRef(resetToken);
  const previousReplayTokenRef = React.useRef(replayToken);

  React.useEffect(() => {
    if (reduceMotion || previousResetTokenRef.current === resetToken) {
      return;
    }

    previousResetTokenRef.current = resetToken;
    fillRatioSpring.set(0);
    sloshSpring.set(0);
  }, [resetToken, fillRatioSpring, sloshSpring, reduceMotion]);

  React.useEffect(() => {
    if (reduceMotion || previousReplayTokenRef.current === replayToken) {
      return;
    }

    previousReplayTokenRef.current = replayToken;
    fillRatioSpring.set(targetRatio);
  }, [replayToken, fillRatioSpring, targetRatio, reduceMotion]);

  React.useEffect(() => {
    if (!sloshEnabled || reduceMotion) {
      sloshSpring.set(0);
      return;
    }

    const unsubscribe = fillVelocity.on("change", (velocity) => {
      if (Math.abs(velocity) < 0.35) {
        return;
      }

      const sloshImpulse = Math.max(-4.5, Math.min(4.5, velocity * 14));
      sloshSpring.set(sloshImpulse);
      window.setTimeout(() => sloshSpring.set(0), 280);
    });

    return () => unsubscribe();
  }, [sloshEnabled, reduceMotion, fillVelocity, sloshSpring]);

  const baseTilt = useTransform(fillRatioSpring, (ratio) =>
    resolveTiltDegrees(ratio, maxTiltDegrees),
  );

  const tiltDegrees = useTransform(
    [baseTilt, sloshSpring],
    ([baseValue, sloshValue]: Array<number | undefined>) =>
      (baseValue ?? 0) + (sloshValue ?? 0),
  );

  const fillTop = useTransform(fillRatioSpring, (ratio) =>
    resolveFillTop(INNER_TOP, INNER_HEIGHT, ratio),
  );

  const fillHeight = useTransform(
    fillRatioSpring,
    (ratio) => ratio * INNER_HEIGHT,
  );

  const surfaceOpacity = useTransform(fillRatioSpring, (ratio) => {
    if (ratio < SURFACE_VISIBLE_RATIO) {
      return 0;
    }
    return Math.min(1, (ratio - SURFACE_VISIBLE_RATIO) / 0.1);
  });

  const [flowValue, setFlowValue] = React.useState(() =>
    resolveDisplayValue(shouldHoldAtEmpty ? 0 : targetRatio, min, max),
  );

  useMotionValueEvent(fillRatioSpring, "change", (latestRatio) => {
    setFlowValue(resolveDisplayValue(latestRatio, min, max));
  });

  React.useEffect(() => {
    if (reduceMotion) {
      setFlowValue(value);
    }
  }, [reduceMotion, value]);

  return {
    fillRatioSpring,
    fillTop,
    fillHeight,
    tiltDegrees,
    surfaceOpacity,
    flowValue: reduceMotion ? value : flowValue,
    reduceMotion,
    inView,
  };
}
