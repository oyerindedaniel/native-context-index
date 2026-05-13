"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Workaround for vercel/next.js#45187: App Router does not reliably scroll
 * to the top after forward navigation when the layout contains a sticky
 * element (here, `DocsHeader`). Symptom: the page lands just short of
 * `scrollY=0`, intermittently — Next.js's internal scroll command races
 * against final layout while the sticky element is recomputing.
 *
 * Strategy: on every pathname change, force a synchronous scroll to (0, 0).
 *
 * Two important guards keep this from regressing other behaviour:
 *   - `popstate`: back/forward navigation already triggers Next.js scroll
 *     restoration. We must not stomp on it, so we mark "the next pathname
 *     change came from the browser" and skip our forced scroll for that one.
 *   - `location.hash`: navigating to `/page#anchor` should land on the
 *     anchor, not the top.
 *
 * Bypassing `scroll-behavior: smooth`: the root has CSS smooth scroll for
 * native hash jumps. Without overriding it here, a user gesture mid-flight
 * cancels the smooth animation and we end up short of the top (the exact
 * symptom we're fixing). We temporarily set inline `scroll-behavior: auto`,
 * issue the scroll, and clear the inline style on the next frame.
 */
export function DocsScrollToTop() {
  const pathname = usePathname();
  const isPopStateRef = React.useRef(false);

  React.useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    if (window.location.hash) {
      return;
    }
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    const raf = window.requestAnimationFrame(() => {
      html.style.scrollBehavior = previous;
    });
    return () => {
      window.cancelAnimationFrame(raf);
      html.style.scrollBehavior = previous;
    };
  }, [pathname]);

  return null;
}

DocsScrollToTop.displayName = "DocsScrollToTop";
