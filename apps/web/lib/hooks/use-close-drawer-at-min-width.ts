"use client";

import * as React from "react";

/**
 * Closes a mobile drawer when the viewport enters desktop layout (min-width
 * matches). Use the same query as the Tailwind breakpoint that hides the
 * hamburger (e.g. after devtools closes and the window widens).
 */
export function useCloseDrawerAtMinWidth(
  minWidthQuery: string,
  onOpenChange: (open: boolean) => void,
) {
  const closeDrawer = React.useEffectEvent(() => {
    onOpenChange(false);
  });

  /* eslint-disable react-hooks/exhaustive-deps  */
  React.useEffect(() => {
    const mediaQueryList = window.matchMedia(minWidthQuery);

    const closeIfDesktop = () => {
      if (mediaQueryList.matches) {
        closeDrawer();
      }
    };

    closeIfDesktop();
    mediaQueryList.addEventListener("change", closeIfDesktop);
    return () => mediaQueryList.removeEventListener("change", closeIfDesktop);
  }, [minWidthQuery]);
  /* eslint-enable react-hooks/exhaustive-deps */
}
