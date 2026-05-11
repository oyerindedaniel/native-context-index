"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import {
  ArrowLongRightIcon,
  RocketLaunchIcon,
  CommandLineIcon,
  RectangleStackIcon,
  LinkIcon,
} from "@heroicons/react/20/solid";
import { buttonVariants } from "@/components/ui/button";
import {
  InstallPickerRoot,
  InstallPickerControl,
  defaultManagers,
} from "@/components/docs/widgets/install-picker";
import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type DocTile = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  Icon: Icon;
};

const docTiles: DocTile[] = [
  {
    href: "/docs/quickstart",
    eyebrow: "5 minutes",
    title: "Quickstart",
    description:
      "Install the CLI, initialise your project, then index and query against your own tree.",
    Icon: RocketLaunchIcon,
  },
  {
    href: "/docs/indexing",
    eyebrow: "Engine",
    title: "How indexing works",
    description:
      "Walk through scan, filter, parse, resolve, and store, the five pipeline stages.",
    Icon: RectangleStackIcon,
  },
  {
    href: "/docs/mcp",
    eyebrow: "Agents",
    title: "Wire up MCP",
    description:
      "Tool catalog, message envelopes, and ready-to-paste configs for Claude Desktop and Cursor.",
    Icon: LinkIcon,
  },
  {
    href: "/docs/cli",
    eyebrow: "Reference",
    title: "Browse the CLI",
    description:
      "Every command, flag, and exit code, generated from the source and copy-ready.",
    Icon: CommandLineIcon,
  },
];

export function DocsIntroHero() {
  return (
    <section className="flex flex-col gap-12 pb-8">
      <div className="flex flex-col gap-5">
        <span className="text-sm font-medium uppercase tracking-[0.11em] text-primary">
          Documentation
        </span>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight-sub text-ink sm:text-5xl">
          Real signatures.
          <br />
          Indexed locally.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed tracking-tight-p text-muted sm:text-xl">
          NCI reads the actual <code className="nci-code-chip">.d.ts</code> on
          your disk and serves agents a structured index they can query in
          milliseconds.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted/85">
          Install the CLI
        </span>
        <InstallPickerRoot
          managers={defaultManagers}
          storageKey="docs-intro"
          defaultId="pnpm"
        >
          <InstallPickerControl />
        </InstallPickerRoot>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href="/docs/quickstart"
          className={cn(
            buttonVariants({ variant: "accent", size: "md" }),
            "w-full gap-2 sm:w-auto",
          )}
        >
          <RocketLaunchIcon className="h-4 w-4" aria-hidden="true" />
          Start the Quickstart
          <ArrowLongRightIcon
            className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
        <Link
          href="/docs/cli"
          className={cn(
            buttonVariants({ variant: "outline", size: "md" }),
            "w-full gap-2 sm:w-auto",
          )}
        >
          <CommandLineIcon className="h-4 w-4" aria-hidden="true" />
          Browse the CLI
        </Link>
      </div>

      <div className="grid gap-4 pt-6 sm:grid-cols-2">
        {docTiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={cn(
              "group relative flex min-h-60 flex-col gap-5 rounded-2xl border border-border bg-elevated p-7 transition-colors duration-150 ease-out",
              "hover:border-primary/35",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
            )}
          >
            <tile.Icon
              className="size-7 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-[0.7rem] font-medium uppercase tracking-[0.1em] text-muted/85">
                {tile.eyebrow}
              </span>
              <span className="flex items-start justify-between gap-3 text-lg font-semibold tracking-tight-sub text-ink">
                <span>{tile.title}</span>
                <ArrowLongRightIcon
                  className="mt-1 h-4 w-4 shrink-0 text-muted/70 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </span>
              <p className="text-base leading-relaxed tracking-tight-p text-muted">
                {tile.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
