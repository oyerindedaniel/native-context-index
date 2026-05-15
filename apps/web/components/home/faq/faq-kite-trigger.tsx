"use client";

import { motion, useReducedMotion } from "motion/react";
import { NciKiteMark } from "@/components/marketing/nci-kite-mark";
import { useKiteRotateTransition } from "@/lib/hooks/use-kite-tip-up-on-scroll-up";
import { cn } from "@/lib/utils";

const KITE_CLOSED_DEG = 0;
const KITE_OPEN_DEG = 90;

export interface FaqKiteTriggerProps {
  isOpen: boolean;
  className?: string;
}

export function FaqKiteTrigger({ isOpen, className }: FaqKiteTriggerProps) {
  const reduceMotion = useReducedMotion();
  const rotateTransition = useKiteRotateTransition(isOpen, reduceMotion);

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden
    >
      <motion.span
        initial={false}
        className="flex size-full will-change-transform items-center justify-center"
        style={{ transformOrigin: "50% 50%" }}
        animate={{
          rotate: isOpen ? KITE_OPEN_DEG : KITE_CLOSED_DEG,
        }}
        transition={rotateTransition}
      >
        <NciKiteMark className="size-full drop-shadow-[0_1px_1px_rgb(0_0_0/0.06)]" />
      </motion.span>
    </span>
  );
}
