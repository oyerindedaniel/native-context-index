import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function DocsNotFound() {
  return (
    <div className="flex flex-col items-start py-8">
      <Image
        src="/nci-logo.svg"
        alt=""
        width={40}
        height={40}
        className="mb-6 size-10 opacity-90"
        aria-hidden
      />
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
        404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight-sub text-ink">
        Documentation page not found
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-muted">
        That doc path does not exist. Return to the introduction or use the
        sidebar to pick a page.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/docs"
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          Docs home
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
    </div>
  );
}
