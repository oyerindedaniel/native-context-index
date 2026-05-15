import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Changelog — Native Context Index",
  description: "Release notes and updates for Native Context Index.",
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-prose px-6 py-20 sm:py-28">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
          Changelog
        </p>
        <h1 className="mt-3 font-sans text-3xl font-semibold tracking-tight-sub text-ink sm:text-4xl">
          Coming soon
        </h1>
        <p className="mt-6 text-base tracking-tight-p text-muted sm:text-lg">
          Release notes for the CLI, MCP server, and indexer will live here.
          Check back after the next ship.
        </p>
        <Link
          href="/docs/quickstart"
          className={cn(
            buttonVariants({ variant: "primary", size: "sm" }),
            "mt-10 inline-flex",
          )}
        >
          Get started
        </Link>
      </main>
    </div>
  );
}
