import {
  SiteMarketingHeaderDesktop,
  SiteMarketingHeaderMobileRow,
} from "@/components/site/site-marketing-header";

/**
 * Top chrome for pages outside `/docs` (Why NCI, marketing routes, etc.).
 * Docs keeps its own header and mobile drawer.
 *
 * The landing hero cannot import this component as-is: it sits in a full-viewport
 * canvas with an overlay header (no border bar). The shared rows live in
 * `site-marketing-header.tsx` so the hero and this shell stay identical without
 * nesting a bordered `<header>` inside the hero.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-elevated/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1050px] px-4 sm:px-6">
        <SiteMarketingHeaderMobileRow className="md:hidden" />

        <SiteMarketingHeaderDesktop className="hidden md:grid" logoPriority />
      </div>
    </header>
  );
}
