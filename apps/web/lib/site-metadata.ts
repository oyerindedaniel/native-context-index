import type { Metadata } from "next";

export const SITE_NAME = "Native Context Index";
export const SITE_NAME_SHORT = "NCI";

const DEFAULT_SITE_URL = "https://nativecontextindex.com";

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, "")}`;
  }
  if (process.env.NODE_ENV === "development") {
    const port = process.env.PORT?.trim() || "3000";
    return `http://localhost:${port}`;
  }
  return DEFAULT_SITE_URL;
}

export const OG_IMAGE_MAIN_PATH = "/og-image-main.jpg";
export const OG_IMAGE_DOCS_PATH = "/og-image-docs.jpg";

const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

export const DEFAULT_MARKETING_DESCRIPTION =
  "Index TypeScript declarations from your node_modules. Query exact signatures, overloads, and dependency edges from the CLI or MCP.";

export const DEFAULT_DOCS_DESCRIPTION =
  "Documentation for Native Context Index — install, index, query, MCP wiring, and engine reference.";

function absoluteUrl(pathname: string): string {
  const base = getSiteUrl();
  if (pathname === "/" || pathname === "") {
    return base;
  }
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function openGraphImage(
  path: string,
  alt: string,
): NonNullable<Metadata["openGraph"]>["images"] {
  return [
    {
      url: path,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt,
    },
  ];
}

function twitterImage(path: string): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary_large_image",
    images: [path],
  };
}

export function createRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_NAME}`,
    },
    description: DEFAULT_MARKETING_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: DEFAULT_MARKETING_DESCRIPTION,
      url: absoluteUrl("/"),
      images: openGraphImage(
        OG_IMAGE_MAIN_PATH,
        `${SITE_NAME} — local TypeScript declaration index for agents and the CLI`,
      ),
    },
    twitter: {
      ...twitterImage(OG_IMAGE_MAIN_PATH),
      title: SITE_NAME,
      description: DEFAULT_MARKETING_DESCRIPTION,
    },
    alternates: {
      canonical: absoluteUrl("/"),
    },
  };
}

export interface MarketingPageMetadataInput {
  title: string;
  description: string;
  pathname: string;
}

export function createMarketingPageMetadata(
  input: MarketingPageMetadataInput,
): Metadata {
  const canonical = absoluteUrl(input.pathname);
  return {
    title: input.title,
    description: input.description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      url: canonical,
      images: openGraphImage(
        OG_IMAGE_MAIN_PATH,
        `${input.title} — ${SITE_NAME}`,
      ),
    },
    twitter: {
      ...twitterImage(OG_IMAGE_MAIN_PATH),
      title: input.title,
      description: input.description,
    },
    alternates: {
      canonical,
    },
  };
}

export interface DocsPageMetadataInput {
  title: string;
  description: string;
  pathname: string;
}

export function createDocsPageMetadata(input: DocsPageMetadataInput): Metadata {
  const canonical = absoluteUrl(input.pathname);
  const pageTitle = input.title;
  return {
    title: pageTitle,
    description: input.description,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: pageTitle,
      description: input.description,
      url: canonical,
      images: openGraphImage(
        OG_IMAGE_DOCS_PATH,
        `${pageTitle} — ${SITE_NAME} documentation`,
      ),
    },
    twitter: {
      ...twitterImage(OG_IMAGE_DOCS_PATH),
      title: pageTitle,
      description: input.description,
    },
    alternates: {
      canonical,
    },
  };
}

export function createDocsSectionMetadata(): Metadata {
  return {
    title: {
      default: "Documentation",
      template: `%s · ${SITE_NAME} Docs`,
    },
    description: DEFAULT_DOCS_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `Documentation · ${SITE_NAME}`,
      description: DEFAULT_DOCS_DESCRIPTION,
      url: absoluteUrl("/docs"),
      images: openGraphImage(OG_IMAGE_DOCS_PATH, `${SITE_NAME} documentation`),
    },
    twitter: {
      ...twitterImage(OG_IMAGE_DOCS_PATH),
      title: `Documentation · ${SITE_NAME}`,
      description: DEFAULT_DOCS_DESCRIPTION,
    },
  };
}
