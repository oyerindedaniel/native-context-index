"use client";

import { useEffect } from "react";
import Link from "next/link";

import { SiteMarketingFooter } from "@/components/marketing/site-marketing-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Segment error boundary — keeps root layout (fonts, styles).
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ink">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <RouteErrorContent error={error} reset={reset} />
      </main>
      <SiteMarketingFooter />
    </div>
  );
}

function RouteErrorContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col items-center text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
        Error
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight-sub text-ink sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
        This page hit an unexpected error. Try again or head back to a known
        route.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          Try again
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
