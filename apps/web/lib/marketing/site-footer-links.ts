export type SiteFooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type SiteFooterLinkColumn = {
  title: string;
  links: readonly SiteFooterLink[];
};

export const SITE_FOOTER_LINK_COLUMNS: readonly SiteFooterLinkColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Why NCI", href: "/why-nci" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Docs & code",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      {
        label: "GitHub",
        href: "https://github.com/oyerindedaniel/native-context-index",
        external: true,
      },
    ],
  },
] as const;

export const SITE_FOOTER_GITHUB_URL =
  "https://github.com/oyerindedaniel/native-context-index" as const;
