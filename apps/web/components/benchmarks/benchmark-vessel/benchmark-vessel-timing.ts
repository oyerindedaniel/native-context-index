export const BENCHMARK_VESSEL_FILL_DURATION_MS = 920;

export const BENCHMARK_VESSEL_SPRING = {
  stiffness: 72,
  damping: 13,
  mass: 1.15,
} as const;

export const BENCHMARK_VESSEL_SLOSH = {
  stiffness: 220,
  damping: 11,
} as const;

export const BENCHMARK_VESSEL_NUMBER_FLOW_TIMING = {
  duration: BENCHMARK_VESSEL_FILL_DURATION_MS,
  easing: "cubic-bezier(0.34, 1.2, 0.44, 1)",
} as const;
