"use client";

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
  defaultPackageManagerId,
} from "@/components/docs/widgets/install-picker";
import {
  DocIntroTileGrid,
  type DocIntroTileData,
} from "@/components/docs/doc-intro-tile";
import { cn } from "@/lib/utils";

const docTiles: DocIntroTileData[] = [
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
          milliseconds. For the background that led here, read{" "}
          <Link
            href="/why-nci"
            className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-dark hover:decoration-primary/70"
          >
            Why NCI
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted/85">
          Install the CLI
        </span>
        <InstallPickerRoot
          managers={defaultManagers}
          storageKey="docs-intro"
          defaultId={defaultPackageManagerId}
        >
          <InstallPickerControl />
        </InstallPickerRoot>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href="/docs/quickstart"
          className={cn(
            buttonVariants({ variant: "accent", size: "md" }),
            "group w-full gap-2 sm:w-auto",
          )}
        >
          <RocketLaunchIcon className="size-4" aria-hidden="true" />
          Start the Quickstart
          <ArrowLongRightIcon
            className="size-4 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
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
          <CommandLineIcon className="size-4" aria-hidden="true" />
          Browse the CLI
        </Link>
      </div>

      <DocIntroTileGrid tiles={docTiles} />
    </section>
  );
}
