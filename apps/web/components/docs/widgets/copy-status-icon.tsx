"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { CheckIcon } from "@heroicons/react/20/solid";

type IconComponent = React.ComponentType<
  React.PropsWithoutRef<React.SVGProps<SVGSVGElement>> & {
    title?: string;
    titleId?: string;
  }
>;

interface CopyStatusIconProps {
  copied: boolean;
  /** Idle-state icon (Clipboard, ClipboardDocument, Link, …). */
  idle: IconComponent;
  /** Forwarded to whichever icon is currently rendered. */
  className?: string;
}

// Matches Tailwind's `duration-150 ease-out` on the surrounding copy buttons:
// 150ms.
const TRANSITION: Transition = { duration: 0.15, ease: [0, 0, 0.2, 1] };

const VARIANTS: Variants = {
  initial: { opacity: 0, filter: "blur(4px)", scale: 0.5 },
  animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
  exit: { opacity: 0, filter: "blur(4px)", scale: 0.5 },
};

export function CopyStatusIcon({
  copied,
  idle: Idle,
  className,
}: CopyStatusIconProps) {
  const reduceMotion = useReducedMotion();
  const Icon = copied ? CheckIcon : Idle;

  if (reduceMotion) {
    return <Icon className={className} aria-hidden="true" />;
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={copied ? "copied" : "idle"}
        className="inline-flex"
        variants={VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={TRANSITION}
      >
        <Icon className={className} aria-hidden="true" />
      </motion.span>
    </AnimatePresence>
  );
}
