import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { SiteMarketingFooter } from "@/components/marketing/site-marketing-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you requested does not exist on Native Context Index.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ink">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <NotFoundContent />
      </main>
      <SiteMarketingFooter />
    </div>
  );
}

function NotFoundContent() {
  return (
    <div className="flex max-w-lg flex-col items-center text-center">
      <Image
        src="/nci-logo.svg"
        alt=""
        width={56}
        height={56}
        className="mb-8 size-14 opacity-90"
        aria-hidden
      />
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
        404
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight-sub text-ink sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
        That URL is not part of this site. Head home or open the documentation.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={cn(buttonVariants({ variant: "primary" }))}>
          Back to home
        </Link>
        <Link
          href="/docs"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Documentation
        </Link>
      </div>
    </div>
  );
}
