import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  DocsNavRoot,
  DocsNavGroup,
  DocsNavItem,
} from "@/components/docs/docs-nav";
import { DocsHeader } from "@/components/docs/docs-header";
import { DocsBreadcrumbInline } from "@/components/docs/docs-breadcrumb";
import { DocsScrollToTop } from "@/components/docs/docs-scroll-to-top";
import { PrevNext } from "@/components/docs/widgets/prev-next";
import { TocRail } from "@/components/docs/widgets/toc-rail";
import { docsGroups } from "@/lib/docs/registry";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <DocsScrollToTop />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-docs-sidebar flex-col border-r border-border bg-white lg:flex">
        <div className="flex h-docs-chrome shrink-0 items-center border-b border-border px-5">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/nci-full-logo.svg"
              alt="NCI Logo"
              width={80}
              height={30}
              className="h-6 w-auto"
            />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-6">
          <DocsNavRoot>
            {docsGroups.map((group) => (
              <DocsNavGroup
                key={group.id}
                title={group.title}
                iconName={group.iconName}
              >
                {group.pages.map((page) => (
                  <DocsNavItem key={page.slug} href={page.slug}>
                    {page.title}
                  </DocsNavItem>
                ))}
              </DocsNavGroup>
            ))}
          </DocsNavRoot>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:pl-docs-sidebar">
        <DocsHeader />
        <div className="mx-auto flex w-full max-w-docs-shell gap-12 px-4 py-6 lg:px-8">
          <main id="docs-main" className="min-w-0 flex-1">
            <article className="docs-prose mx-auto w-full min-w-0 max-w-docs-content">
              <DocsBreadcrumbInline className="xl:hidden" />
              <div className="mb-12">{children}</div>
              <PrevNext />
            </article>
          </main>
          <TocRail scopeSelector="#docs-main" />
        </div>
      </div>
    </div>
  );
}
