"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
} from "@heroicons/react/20/solid";
import { SplitButton } from "@/components/ui/split-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

async function fetchPageSource(pathname: string): Promise<string | null> {
  const res = await fetch(
    `/api/docs/page-source?pathname=${encodeURIComponent(pathname)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { source?: string };
  return typeof data.source === "string" ? data.source : null;
}

export function DocsPageCopy({ className }: { className?: string }) {
  const pathname = usePathname();
  const { copied, copy } = useCopyToClipboard({ resetMs: 2000 });
  const [pending, setPending] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (!pathname?.startsWith("/docs")) {
      return;
    }
    setPending(true);
    try {
      const source = await fetchPageSource(pathname);
      if (source !== null) {
        await copy(source);
      }
    } finally {
      setPending(false);
    }
  }, [pathname, copy]);

  const handleViewRaw = React.useCallback(() => {
    if (!pathname?.startsWith("/docs")) {
      return;
    }
    const url = `/api/docs/page-source?pathname=${encodeURIComponent(pathname)}&raw=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [pathname]);

  if (!pathname?.startsWith("/docs")) {
    return null;
  }

  return (
    <div className={cn("shrink-0", className)}>
      <SplitButton.Root variant="outline" size="sm">
        <SplitButton.Main
          type="button"
          onClick={() => void handleCopy()}
          disabled={pending}
          aria-label={
            copied ? "Copied page source" : "Copy page MDX source to clipboard"
          }
          className="gap-2 px-3 sm:px-4"
        >
          <CopyStatusIcon
            copied={copied}
            idle={ClipboardDocumentIcon}
            className={cn(
              "size-4 shrink-0",
              copied ? "text-accent" : "text-muted",
            )}
          />
          <span className="hidden sm:inline">
            {pending ? "Copying…" : copied ? "Copied" : "Copy page"}
          </span>
        </SplitButton.Main>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SplitButton.IconTrigger
              type="button"
              aria-label="More copy and view options"
              disabled={pending}
            >
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            </SplitButton.IconTrigger>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-72 p-1.5">
            <DropdownMenuItem
              className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
              onSelect={(event) => {
                event.preventDefault();
                void handleCopy();
              }}
            >
              <ClipboardDocumentIcon
                className="mt-0.5 size-5 shrink-0 text-muted"
                aria-hidden="true"
              />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-medium text-ink">
                  Copy page
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  Copy MDX source for LLMs and editors
                </span>
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
              onSelect={(event) => {
                event.preventDefault();
                handleViewRaw();
              }}
            >
              <DocumentTextIcon
                className="mt-0.5 size-5 shrink-0 text-muted"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  View as Markdown
                  <ArrowTopRightOnSquareIcon
                    className="size-3.5 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  Open raw{" "}
                  <code className="font-mono text-[0.85em]">page.mdx</code> in a
                  new tab
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SplitButton.Root>
    </div>
  );
}
