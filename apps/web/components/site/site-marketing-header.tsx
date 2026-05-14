"use client";

import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SiteMobileNav } from "@/components/site/site-mobile-nav";
import { SitePrimaryNav } from "@/components/site/site-primary-nav";

const GITHUB_URL = "https://github.com/oyerindedaniel/native-context-index";

const getStartedClassName = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
);

function MarketingGitHubIconLink({ className }: { className?: string }) {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Native Context Index on GitHub"
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "shrink-0",
        className,
      )}
    >
      <Image
        src="/github.svg"
        alt=""
        width={16}
        height={16}
        className="size-4 opacity-90"
        aria-hidden
      />
    </a>
  );
}

export function SiteMarketingHeaderMobileRow({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-docs-chrome items-center justify-between gap-2 sm:gap-4",
        className,
      )}
    >
      <SiteMobileNav />
      <div className="flex shrink-0 items-center gap-2">
        <MarketingGitHubIconLink />
        <Link
          href="/docs/quickstart"
          className={cn(getStartedClassName, "inline-flex shrink-0")}
        >
          Get started
        </Link>
      </div>
    </div>
  );
}

/**
 * Large-viewport chrome: logo | primary nav | GitHub + Get started. Shared by
 * {@link SiteHeader} and the landing hero overlay.
 */
export function SiteMarketingHeaderDesktop({
  className,
  logoPriority = false,
}: {
  readonly className?: string;
  readonly logoPriority?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid h-docs-chrome grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-center gap-3 sm:gap-4",
        className,
      )}
    >
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
          priority={logoPriority}
        />
      </Link>

      <SitePrimaryNav />

      <div className="flex items-center justify-end justify-self-end gap-2">
        <MarketingGitHubIconLink />
        <Link href="/docs/quickstart" className={getStartedClassName}>
          Get started
        </Link>
      </div>
    </div>
  );
}
