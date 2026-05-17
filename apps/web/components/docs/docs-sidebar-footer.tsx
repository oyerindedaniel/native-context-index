"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardDocumentListIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

export const DOCS_CHANGELOG_HREF = "/changelog" as const;

export function DocsSidebarFooter() {
  const pathname = usePathname();
  const isActive = pathname === DOCS_CHANGELOG_HREF;

  return (
    <div
      data-nci-docs-sidebar-footer
      className="shrink-0 border-t border-border bg-white h-docs-sidebar-footer"
    >
      <Link
        href={DOCS_CHANGELOG_HREF}
        className={cn(
          "flex h-docs-sidebar-footer w-full items-center gap-2 rounded-none px-3 text-sm font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-ink/60 hover:bg-surface-hover hover:text-ink",
        )}
      >
        <ClipboardDocumentListIcon
          className={cn(
            "size-3.5 shrink-0 -translate-y-px",
            isActive ? "text-primary" : "text-muted/70",
          )}
          aria-hidden="true"
        />
        Changelog
      </Link>
    </div>
  );
}
