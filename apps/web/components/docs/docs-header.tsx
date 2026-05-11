"use client";

import * as React from "react";
import Image from "next/image";
import { StarIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsPageCopy } from "@/components/docs/docs-page-copy";
import { DocsBreadcrumbStatic } from "@/components/docs/docs-breadcrumb";
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav";
import { buttonVariants } from "@/components/ui/button";

interface DocsHeaderProps {
  className?: string;
}

const GITHUB_URL = "https://github.com/oyerindedaniel/native-context-index";

export function DocsHeader({ className }: DocsHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex h-docs-chrome min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          <DocsBreadcrumbStatic className="hidden lg:flex" />
          <DocsMobileNav className="lg:hidden" />
        </div>

        <DocsSearch />

        <DocsPageCopy />

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Native Context Index on GitHub"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "hidden shrink-0 gap-2 sm:inline-flex",
          )}
        >
          <StarIcon className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>GitHub</span>
        </a>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Native Context Index on GitHub"
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "shrink-0 sm:hidden",
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
      </div>
    </header>
  );
}
