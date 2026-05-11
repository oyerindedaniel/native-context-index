"use client";

import { useCallback, useRef } from "react";

export const useFocusTrap = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getFocusable = useCallback(
    (container: HTMLElement | null): HTMLElement[] => {
      if (!container) return [];

      const elements = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );

      return Array.from(elements).filter(
        (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"),
      );
    },
    [],
  );

  const handleFocusBefore = useCallback(() => {
    const focusables = getFocusable(containerRef.current);
    if (focusables.length > 0) {
      focusables[focusables.length - 1]!.focus();
    }
  }, [getFocusable]);

  const handleFocusAfter = useCallback(() => {
    const focusables = getFocusable(containerRef.current);
    if (focusables.length > 0) {
      focusables[0]!.focus();
    }
  }, [getFocusable]);

  return {
    containerRef,
    handleFocusBefore,
    handleFocusAfter,
  };
};
