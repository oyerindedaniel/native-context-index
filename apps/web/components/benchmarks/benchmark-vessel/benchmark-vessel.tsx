"use client";

import * as React from "react";
import { createContext, useContext, useRef } from "react";
import { BenchmarkVesselSvg } from "@/components/benchmarks/benchmark-vessel/benchmark-vessel-svg";
import { useBenchmarkVesselMotion } from "@/components/benchmarks/benchmark-vessel/use-benchmark-vessel-motion";
import { cn } from "@/lib/utils";

type BenchmarkVesselContextValue = ReturnType<
  typeof useBenchmarkVesselMotion
> & {
  min: number;
  max: number;
  suffix?: string;
  fillColor: string;
};

const BenchmarkVesselContext =
  createContext<BenchmarkVesselContextValue | null>(null);

function useBenchmarkVesselContext(): BenchmarkVesselContextValue {
  const context = useContext(BenchmarkVesselContext);
  if (!context) {
    throw new Error(
      "BenchmarkVessel parts must be used within BenchmarkVesselRoot",
    );
  }
  return context;
}

export type BenchmarkVesselRootProps = {
  children: React.ReactNode;
  value: number;
  max: number;
  min?: number;
  maxTiltDegrees?: number;
  sloshEnabled?: boolean;
  playOnView?: boolean;
  manualPlayback?: boolean;
  replayToken?: number;
  resetToken?: number;
  fillColor?: string;
  suffix?: string;
  className?: string;
  id?: string;
  "data-caliper-id"?: string;
  "aria-label"?: string;
};

export function BenchmarkVesselRoot({
  children,
  value,
  max,
  min = 0,
  maxTiltDegrees = 20,
  sloshEnabled = true,
  playOnView = false,
  manualPlayback = true,
  replayToken = 0,
  resetToken = 0,
  fillColor = "var(--nci-color-primary)",
  suffix,
  className,
  id,
  "data-caliper-id": dataCaliperId,
  "aria-label": ariaLabel,
}: BenchmarkVesselRootProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vesselMotion = useBenchmarkVesselMotion({
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
  });

  const contextValue = React.useMemo<BenchmarkVesselContextValue>(
    () => ({
      ...vesselMotion,
      min,
      max,
      suffix,
      fillColor,
    }),
    [vesselMotion, min, max, suffix, fillColor],
  );

  return (
    <BenchmarkVesselContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        id={id}
        data-caliper-id={dataCaliperId}
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn("flex h-full min-h-0 flex-col", className)}
      >
        {children}
      </div>
    </BenchmarkVesselContext.Provider>
  );
}

export type BenchmarkVesselChartProps = {
  className?: string;
};

export function BenchmarkVesselChart({ className }: BenchmarkVesselChartProps) {
  const {
    fillTop,
    fillHeight,
    tiltDegrees,
    surfaceOpacity,
    flowValue,
    suffix,
    fillColor,
  } = useBenchmarkVesselContext();

  return (
    <div
      data-caliper-part="benchmark-vessel-chart"
      className={cn("relative min-h-0 h-full w-full flex-1 p-0", className)}
    >
      <BenchmarkVesselSvg
        fillTop={fillTop}
        fillHeight={fillHeight}
        tiltDegrees={tiltDegrees}
        surfaceOpacity={surfaceOpacity}
        displayValue={flowValue}
        suffix={suffix}
        fillColor={fillColor}
      />
    </div>
  );
}

export type BenchmarkVesselProps = Omit<
  BenchmarkVesselRootProps,
  "children"
> & {
  chartClassName?: string;
  children?: React.ReactNode;
};

export function BenchmarkVessel({
  chartClassName,
  children,
  ...rootProps
}: BenchmarkVesselProps) {
  return (
    <BenchmarkVesselRoot {...rootProps}>
      <BenchmarkVesselChart className={chartClassName} />
      {children}
    </BenchmarkVesselRoot>
  );
}
