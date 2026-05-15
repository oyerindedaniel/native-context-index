"use client";

import * as React from "react";
import { motion, type MotionValue } from "motion/react";
import { useId } from "react";
import { BENCHMARK_VESSEL_INNER } from "@/components/benchmarks/benchmark-vessel/use-benchmark-vessel-motion";
import { cn } from "@/lib/utils";

const {
  top,
  height,
  left,
  width,
  centerX,
  viewBoxWidth,
  viewBoxHeight,
  valueLabelY,
} = BENCHMARK_VESSEL_INNER;

const VIEWBOX = `0 0 ${viewBoxWidth} ${viewBoxHeight}`;
const LID_HALF_WIDTH = width / 2;
const CAP_OVERLAP = 10;

/** Single cap: curved meniscus + lid lip (no separate ellipse layer). */
const UNIFIED_CAP_PATH = `M ${-LID_HALF_WIDTH} 0 C ${-LID_HALF_WIDTH * 0.45} -6 0 -7.5 ${LID_HALF_WIDTH * 0.45} -6 ${LID_HALF_WIDTH} 0 L ${LID_HALF_WIDTH - 3} -10 L ${-LID_HALF_WIDTH + 3} -10 Z`;

export type BenchmarkVesselSvgProps = {
  fillTop: MotionValue<number>;
  fillHeight: MotionValue<number>;
  tiltDegrees: MotionValue<number>;
  surfaceOpacity: MotionValue<number>;
  displayValue: number;
  suffix?: string;
  fillColor?: string;
  className?: string;
};

export function BenchmarkVesselSvg({
  fillTop,
  fillHeight,
  tiltDegrees,
  surfaceOpacity,
  displayValue,
  suffix,
  fillColor = "var(--nci-color-primary)",
  className,
}: BenchmarkVesselSvgProps) {
  const clipId = useId();
  const fillGradientId = useId();
  const labelText = suffix ? `${displayValue}${suffix}` : String(displayValue);

  return (
    <svg
      viewBox={VIEWBOX}
      preserveAspectRatio="none"
      className={cn("block h-full w-full", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={left} y={top} width={width} height={height} />
        </clipPath>
        <linearGradient id={fillGradientId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        className="stroke-border/70"
        strokeWidth={1}
      />

      <g clipPath={`url(#${clipId})`}>
        <motion.rect
          x={left}
          width={width}
          fill={fillColor}
          style={{
            y: fillTop,
            height: fillHeight,
          }}
        />
        <motion.rect
          x={left}
          width={width}
          fill={`url(#${fillGradientId})`}
          style={{
            y: fillTop,
            height: fillHeight,
          }}
        />

        <motion.g
          style={{
            x: centerX,
            y: fillTop,
            rotate: tiltDegrees,
            opacity: surfaceOpacity,
            transformOrigin: "0px 0px",
          }}
        >
          <motion.rect
            x={-width / 2}
            y={-CAP_OVERLAP}
            width={width}
            height={CAP_OVERLAP + 2}
            fill={fillColor}
            style={{ opacity: surfaceOpacity }}
          />
          <path d={UNIFIED_CAP_PATH} fill={fillColor} />
          <path
            d={UNIFIED_CAP_PATH}
            fill="none"
            stroke="white"
            strokeOpacity={0.35}
            strokeWidth={0.8}
          />
        </motion.g>
      </g>

      <text
        x={centerX}
        y={valueLabelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fillOpacity={0.92}
        fontSize={11}
        fontWeight={600}
        fontFamily="var(--font-geist-mono, ui-monospace, monospace)"
        style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.35)" }}
      >
        {labelText}
      </text>
    </svg>
  );
}
