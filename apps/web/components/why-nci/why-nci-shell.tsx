"use client";

import * as React from "react";
import {
  PageTocNav,
  type PageTocLinkItem,
} from "@/components/marketing/page-toc-nav";

const TOC_ITEMS: readonly PageTocLinkItem[] = [
  { id: "why-nci-origin", label: "Origin" },
  { id: "why-nci-exists", label: "Why it exists" },
  { id: "why-nci-audience", label: "Who it is for" },
  { id: "why-nci-replaces", label: "What it replaces" },
] as const;

export function WhyNciShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-14 sm:py-20">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)] md:gap-x-6 lg:gap-x-10 md:gap-y-0">
        <PageTocNav items={TOC_ITEMS} marker="kite" />

        <div className="min-w-0 w-full max-w-prose justify-self-start">
          {children}
        </div>
      </div>
    </div>
  );
}
