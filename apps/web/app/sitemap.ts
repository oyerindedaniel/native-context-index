import type { MetadataRoute } from "next";

import { docsPagesOrder } from "@/lib/docs/registry";
import { getSiteUrl } from "@/lib/site-metadata";

const MARKETING_ROUTES = ["/", "/why-nci", "/changelog"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  const marketing = MARKETING_ROUTES.map((pathname) => ({
    url: `${siteUrl}${pathname === "/" ? "" : pathname}`,
    lastModified,
    changeFrequency:
      pathname === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: pathname === "/" ? 1 : 0.7,
  }));

  const docs = docsPagesOrder.map((page, index) => ({
    url: `${siteUrl}${page.slug}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: page.slug === "/docs" ? 0.9 : Math.max(0.5, 0.85 - index * 0.01),
  }));

  return [...marketing, ...docs];
}
