"use client";

import * as React from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const BAR_EASE = [0.4, 0, 0.2, 1] as const;

const TOP_BAR_OPEN = { y: 0, rotate: 45 };
const TOP_BAR_CLOSED = { y: -4, rotate: 0 };
const BOTTOM_BAR_OPEN = { y: 0, rotate: -45 };
const BOTTOM_BAR_CLOSED = { y: 4, rotate: 0 };

export interface MobileHamburgerButtonProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}

export function MobileHamburgerButton({
  open,
  onToggle,
  className,
}: MobileHamburgerButtonProps) {
  const reduceMotion = useReducedMotion();
  const transition: Transition = {
    duration: reduceMotion ? 0 : 0.22,
    ease: BAR_EASE,
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "shrink-0",
        className,
      )}
    >
      <span className="relative inline-block size-4" aria-hidden="true">
        <motion.span
          className="absolute left-0 h-[1.5px] w-full rounded-full bg-current"
          style={{ top: "calc(50% - 0.75px)", transformOrigin: "center" }}
          animate={open ? TOP_BAR_OPEN : TOP_BAR_CLOSED}
          transition={transition}
        />
        <motion.span
          className="absolute left-0 h-[1.5px] w-full rounded-full bg-current"
          style={{ top: "calc(50% - 0.75px)", transformOrigin: "center" }}
          animate={open ? BOTTOM_BAR_OPEN : BOTTOM_BAR_CLOSED}
          transition={transition}
        />
      </span>
    </button>
  );
}
