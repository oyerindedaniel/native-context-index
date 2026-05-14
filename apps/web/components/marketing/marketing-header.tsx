import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-elevated/95 backdrop-blur-sm">
      <div className="mx-auto grid max-w-[1050px] grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-center gap-3 px-6 py-4 sm:gap-4">
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

        <nav
          className="flex min-w-0 items-center justify-center gap-5 sm:gap-10"
          aria-label="Primary"
        >
          <Link
            href="/why-nci"
            className="text-base font-semibold text-ink/75 transition-colors hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Why NCI
          </Link>
          <Link
            href="/docs"
            className="text-base font-semibold text-ink/75 transition-colors hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Documentation
          </Link>
        </nav>

        <div className="shrink-0 justify-self-end">
          <Link
            href="/get-started"
            className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
