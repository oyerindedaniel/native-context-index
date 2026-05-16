"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { LayoutGroup } from "motion/react";
import { cn } from "@/lib/utils";

type FeatureCardHoverGroupContextValue = {
  layoutId: string;
  activeCardId: string | null;
  setActiveCardId: (cardId: string | null) => void;
};

const FeatureCardHoverGroupContext =
  createContext<FeatureCardHoverGroupContextValue | null>(null);

export function useFeatureCardHoverGroup() {
  return useContext(FeatureCardHoverGroupContext);
}

export function FeatureCardHoverGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const groupId = useId();
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  return (
    <FeatureCardHoverGroupContext.Provider
      value={{
        layoutId: `feature-card-hover-${groupId}`,
        activeCardId,
        setActiveCardId,
      }}
    >
      <LayoutGroup id={`feature-card-hover-group-${groupId}`}>
        <div
          className={cn(className)}
          onPointerLeave={() => setActiveCardId(null)}
        >
          {children}
        </div>
      </LayoutGroup>
    </FeatureCardHoverGroupContext.Provider>
  );
}
