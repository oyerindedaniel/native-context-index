"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
} from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { getAdjacentPages, type DocsPage } from "@/lib/docs/registry";

interface PrevNextProps {
  className?: string;
}

interface PagerCardProps {
  page: DocsPage;
  direction: "prev" | "next";
}

function PagerCard({ page, direction }: PagerCardProps) {
  const isPrev = direction === "prev";
  const Icon = isPrev ? ArrowLongLeftIcon : ArrowLongRightIcon;
  const directionLabel = isPrev ? "Previous" : "Next";

  return (
    <Link
      href={page.slug}
      className={cn(
        "group relative flex flex-1 flex-col gap-2 rounded-2xl border border-border bg-elevated p-5 transition-colors duration-150 ease-out hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        isPrev ? "items-start text-left" : "items-end text-right",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted/80",
          isPrev ? "flex-row" : "flex-row-reverse",
        )}
      >
        <Icon
          className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          aria-hidden="true"
        />
        {directionLabel}
      </span>
      <span className="text-base font-semibold tracking-tight-sub text-ink">
        {page.title}
      </span>
    </Link>
  );
}

export function PrevNext({ className }: PrevNextProps) {
  const pathname = usePathname();
  const { prev, next } = getAdjacentPages(pathname);

  if (!prev && !next) {
    return null;
  }

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "mt-16 flex flex-col gap-4 border-t border-border pt-10 sm:flex-row",
        className,
      )}
    >
      {prev ? (
        <PagerCard page={prev} direction="prev" />
      ) : (
        <div className="flex-1" aria-hidden="true" />
      )}
      {next ? (
        <PagerCard page={next} direction="next" />
      ) : (
        <div className="flex-1" aria-hidden="true" />
      )}
    </nav>
  );
}
