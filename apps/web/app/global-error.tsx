"use client";

import { useEffect } from "react";
import Link from "next/link";

import "./globals.css";

/**
 * Root error boundary — must define its own <html> and <body> (replaces root layout).
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
            Error
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight-sub text-ink">
            Something went wrong
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#5f6675]">
            An unexpected error stopped this page from loading. You can try
            again or return to the home page.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-[#5f6675]">
              Reference: {error.digest}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 cursor-pointer items-center justify-center rounded-3xl bg-[#5a3cf0] px-5 text-sm font-medium text-white transition-colors hover:bg-[#5a3cf0]/90"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-3xl border border-[#dfe3ec] bg-white px-5 text-sm font-medium text-[#111318] transition-colors hover:bg-[#eef1f9]"
            >
              Back to home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
