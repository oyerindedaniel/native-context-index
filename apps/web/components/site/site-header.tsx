import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SiteMobileNav } from "@/components/site/site-mobile-nav";
import { SitePrimaryNav } from "@/components/site/site-primary-nav";

const getStartedClassName = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
);

/**
 * Top chrome for pages outside `/docs` (home, Why NCI, and future routes).
 * Docs keeps its own header and mobile drawer.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-elevated/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1050px] px-4 sm:px-6">
        <div className="flex h-docs-chrome items-center justify-between gap-3 sm:gap-4 lg:hidden">
          <SiteMobileNav />
          <Link
            href="/docs/quickstart"
            className={cn(
              getStartedClassName,
              "hidden shrink-0 sm:inline-flex",
            )}
          >
            Get started
          </Link>
        </div>

        <div className="hidden h-docs-chrome grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-center gap-3 sm:gap-4 lg:grid">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-3 opacity-90 transition-opacity hover:opacity-100 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            aria-label="Native Context Index home"
          >
            <Image
              src="/nci-full-logo.svg"
              alt=""
              width={921}
              height={346}
              className="h-8 w-auto sm:h-9"
              priority
            />
          </Link>

          <SitePrimaryNav />

          <div className="justify-self-end">
            <Link href="/docs/quickstart" className={getStartedClassName}>
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
