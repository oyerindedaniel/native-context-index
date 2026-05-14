"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { SplitButton } from "@/components/ui/split-button";
import { cn } from "@/lib/utils";

export function HomeCliCinemaNav({
  className,
  onPrevious,
  onNext,
  isFirstScene,
  isLastScene,
}: {
  readonly className?: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly isFirstScene: boolean;
  readonly isLastScene: boolean;
}) {
  return (
    <SplitButton.Root
      variant="outline"
      size="sm"
      className={cn("shrink-0", className)}
    >
      <SplitButton.IconTrigger
        onClick={onPrevious}
        disabled={isFirstScene}
        aria-label="Previous step"
      >
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
      </SplitButton.IconTrigger>
      <SplitButton.IconTrigger
        onClick={onNext}
        disabled={isLastScene}
        aria-label="Next step"
        className="border-l border-border"
      >
        <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
      </SplitButton.IconTrigger>
    </SplitButton.Root>
  );
}
