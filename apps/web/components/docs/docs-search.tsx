"use client";

import * as React from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { CommandPalette } from "@/components/docs/widgets/command-palette";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DocsSearch() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isModifierK =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isModifierK) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "/" && !open) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          event.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search documentation (⌘K or /)"
        title="Search documentation — ⌘K or /"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "group max-w-full shrink justify-start gap-2 px-2.5 text-muted/85 hover:border-primary/35 hover:bg-surface hover:text-ink sm:w-52 md:w-60 lg:w-64 xl:w-[min(22rem,calc(100vw-28rem))]",
        )}
      >
        <MagnifyingGlassIcon
          className="h-4 w-4 shrink-0 text-muted/65 transition-colors duration-150 ease-out group-hover:text-primary"
          aria-hidden="true"
        />
        <span className="hidden min-w-0 flex-1 truncate text-left text-sm tracking-tight-p sm:inline">
          Search…
        </span>
        <kbd
          aria-hidden="true"
          className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded-md border border-border/80 bg-white px-1.5 font-mono text-[10px] font-medium tracking-[0.06em] text-muted/85 sm:inline-flex"
        >
          <span className="text-xs leading-none">⌘</span>K
        </kbd>
      </button>

      <CommandPalette.Root open={open} onOpenChange={setOpen}>
        <CommandPalette.Overlay>
          <CommandPalette.Input />
          <CommandPalette.PillRow />
          <CommandPalette.Results />
          <CommandPalette.Footer />
        </CommandPalette.Overlay>
      </CommandPalette.Root>
    </>
  );
}
