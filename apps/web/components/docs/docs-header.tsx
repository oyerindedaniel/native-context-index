"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRightIcon, StarIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { getBreadcrumb } from "@/lib/docs/registry";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsPageCopy } from "@/components/docs/docs-page-copy";
import { Button } from "@/components/ui/button";

interface DocsHeaderProps {
  className?: string;
}

const GITHUB_URL = "https://github.com/oyerindedaniel/native-context-index";

function openGithub() {
  window.open(GITHUB_URL, "_blank", "noopener,noreferrer");
}

export function DocsHeader({ className }: DocsHeaderProps) {
  const pathname = usePathname();
  const breadcrumbItems = getBreadcrumb(pathname);
  const lastIndex = breadcrumbItems.length - 1;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex h-docs-chrome items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium"
        >
          {breadcrumbItems.map((crumb, breadcrumbIndex) => {
            const isLast = breadcrumbIndex === lastIndex;
            const Separator =
              breadcrumbIndex > 0 ? (
                <ChevronRightIcon
                  className="h-3.5 w-3.5 shrink-0 text-muted/50"
                  aria-hidden="true"
                />
              ) : null;

            const labelClass = cn(
              "truncate",
              isLast ? "text-ink" : "text-muted/80",
            );

            const labelNode =
              crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className={cn(labelClass, "transition-colors hover:text-ink")}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={labelClass}>{crumb.label}</span>
              );

            return (
              <React.Fragment key={`${crumb.label}-${breadcrumbIndex}`}>
                {Separator}
                {labelNode}
              </React.Fragment>
            );
          })}
        </nav>

        <DocsSearch />

        <DocsPageCopy />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden shrink-0 gap-2 sm:inline-flex"
          onClick={openGithub}
          aria-label="Open Native Context Index on GitHub"
        >
          <StarIcon className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>GitHub</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 sm:hidden"
          onClick={openGithub}
          aria-label="Open Native Context Index on GitHub"
        >
          <StarIcon className="h-4 w-4 text-accent" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
