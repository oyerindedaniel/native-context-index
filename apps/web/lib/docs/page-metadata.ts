import type { Metadata } from "next";

import { createDocsPageMetadata } from "@/lib/site-metadata";

import { docsPagesBySlug, normalizeDocsPath } from "./registry";

/**
 * Build-time metadata for a docs route from the central registry (single source of truth).
 * Import and export from each `page.mdx` so titles/descriptions stay in sync with nav + search.
 */
export function metadataForDocsPath(pathname: string): Metadata {
  const slug = normalizeDocsPath(pathname);
  const page = docsPagesBySlug[slug];
  if (!page) {
    return {};
  }
  return createDocsPageMetadata({
    title: page.title,
    description: page.summary,
    pathname: page.slug,
  });
}
