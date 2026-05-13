"use client";

import * as React from "react";

const LOCK_CLASS = "nci-scroll-locked";

/**
 * Toggles the global `nci-scroll-locked` class on `<html>` while `active` is
 * true. Pair with the matching CSS in `globals.css`. Use for overlays that
 * should freeze page scrolling — custom dialogs, drawers, and Radix popovers
 * whose default scrollbar compensation does not match our custom scrollbar.
 */
export function useDocumentScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }
    const html = document.documentElement;
    html.classList.add(LOCK_CLASS);
    return () => {
      html.classList.remove(LOCK_CLASS);
    };
  }, [active]);
}
