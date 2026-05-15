export type FillRatioInput = {
  value: number;
  min?: number;
  max: number;
};

export function resolveFillRatio({
  value,
  min = 0,
  max,
}: FillRatioInput): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }

  const rawRatio = (value - min) / (max - min);
  return Math.min(1, Math.max(0, rawRatio));
}

/** Tilt ramps earlier than fill so the cap feels buoyant, not like a load bar. */
export function resolveTiltDegrees(
  fillRatio: number,
  maxTiltDegrees: number,
): number {
  const clampedRatio = Math.min(1, Math.max(0, fillRatio));
  const buoyantCurve = Math.pow(clampedRatio, 0.62);
  return buoyantCurve * maxTiltDegrees;
}

export function resolveFillHeight(
  fillRatio: number,
  innerHeight: number,
): number {
  return fillRatio * innerHeight;
}

export function resolveFillTop(
  innerTop: number,
  innerHeight: number,
  fillRatio: number,
): number {
  const fillHeight = resolveFillHeight(fillRatio, innerHeight);
  return innerTop + innerHeight - fillHeight;
}

export function resolveDisplayValue(
  fillRatio: number,
  min: number,
  max: number,
): number {
  return Math.round(min + fillRatio * (max - min));
}
