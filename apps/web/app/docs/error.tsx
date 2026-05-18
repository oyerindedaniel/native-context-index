"use client";

import { useEffect } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Docs segment error boundary — keeps docs chrome from layout.tsx */
export default function DocsError({
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
    <div className="flex flex-col items-start py-8">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
        Error
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight-sub text-ink">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-muted">
        This documentation page failed to render. Try again or return to the
        docs home.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          Try again
        </button>
        <Link
          href="/docs"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Docs home
        </Link>
      </div>
    </div>
  );
}
