"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isSiteNavHrefActive } from "@/components/site/site-nav-active";

const linkBase =
  "inline-flex border-b-2 border-transparent pb-1 text-base font-semibold tracking-tight text-ink/75 transition-[color,border-color] duration-150 ease-out hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

const linkActive = "border-primary text-primary hover:text-dark";

export function SitePrimaryNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="flex min-w-0 items-center justify-center gap-5 sm:gap-10"
      aria-label="Primary"
    >
      <Link
        href="/why-nci"
        aria-current={
          isSiteNavHrefActive("/why-nci", pathname) ? "page" : undefined
        }
        className={cn(
          linkBase,
          isSiteNavHrefActive("/why-nci", pathname) && linkActive,
        )}
      >
        Why NCI
      </Link>
      <Link
        href="/docs"
        aria-current={
          isSiteNavHrefActive("/docs", pathname) ? "page" : undefined
        }
        className={cn(
          linkBase,
          isSiteNavHrefActive("/docs", pathname) && linkActive,
        )}
      >
        Documentation
      </Link>
    </nav>
  );
}
