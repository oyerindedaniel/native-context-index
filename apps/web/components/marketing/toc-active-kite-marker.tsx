"use client";

import { motion, type Transition } from "motion/react";
import { NciKiteMark } from "@/components/marketing/nci-kite-mark";
import { KITE_SPRING } from "@/lib/hooks/use-kite-tip-up-on-scroll-up";

interface TocActiveKiteMarkerProps {
  layoutId: string;
  kiteRotationPointsUp: boolean;
  kiteRotateTransition: Transition;
}

export function TocActiveKiteMarker({
  layoutId,
  kiteRotationPointsUp,
  kiteRotateTransition,
}: TocActiveKiteMarkerProps) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={KITE_SPRING}
      className="absolute top-1/2 left-[calc(0.75rem+0.85px)] z-[1] -mt-[0.525rem] -ml-2 flex h-[1.05rem] w-4 items-center justify-center"
      aria-hidden="true"
    >
      <motion.span
        initial={false}
        className="flex size-full origin-center items-center justify-center will-change-transform"
        animate={{
          rotate: kiteRotationPointsUp ? 180 : 0,
        }}
        transition={kiteRotateTransition}
      >
        <NciKiteMark className="h-full w-full translate-x-px drop-shadow-[0_1px_1px_rgb(0_0_0/0.06)]" />
      </motion.span>
    </motion.span>
  );
}
