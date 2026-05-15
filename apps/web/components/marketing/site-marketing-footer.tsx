"use client";

import Link from "next/link";
import { FooterKiteLogo } from "@/components/marketing/footer-kite-logo";
import { STAGED_DEMO_SURFACE_PATTERN_SRC } from "@/components/marketing/staged-demo";
import {
  SITE_FOOTER_GITHUB_URL,
  SITE_FOOTER_LINK_COLUMNS,
  type SiteFooterLink,
} from "@/lib/marketing/site-footer-links";

const FOOTER_PATTERN_URL = STAGED_DEMO_SURFACE_PATTERN_SRC.brightSquares;
const CURRENT_YEAR = new Date().getFullYear();

const footerLinkClass =
  "group inline-flex rounded-sm text-base font-semibold tracking-tight text-ink/80 underline decoration-transparent decoration-1 underline-offset-[0.2em] outline-none transition-[color,text-decoration-color] duration-200 ease-out hover:text-ink hover:decoration-ink/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

const footerLinkLabelClass =
  "inline-block translate-x-0 transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0";

function FooterNavLink({ link }: { link: SiteFooterLink }) {
  const label = <span className={footerLinkLabelClass}>{link.label}</span>;

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={footerLinkClass}
      >
        {label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={footerLinkClass}>
      {label}
    </Link>
  );
}

export function SiteMarketingFooter() {
  return (
    <footer
      className="relative overflow-hidden border-t border-primary/10 bg-[color-mix(in_oklch,var(--nci-color-primary)_7%,var(--nci-color-surface))]"
      aria-labelledby="site-footer-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 z-1 bg-repeat"
        style={{ backgroundImage: `url(${FOOTER_PATTERN_URL})` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[color-mix(in_oklch,var(--nci-color-surface)_78%,transparent)]"
        aria-hidden
      />

      <div className="relative z-[1] mx-auto flex min-h-[26rem] max-w-[1180px] flex-col justify-between px-6 py-16 sm:min-h-[32rem] sm:py-20 lg:min-h-[50vh] lg:py-24">
        <div className="flex flex-1 flex-col gap-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <div className="flex justify-center lg:justify-start">
            <FooterKiteLogo className="w-[min(72vw,22rem)] sm:w-[min(55vw,26rem)] lg:w-[min(42vw,32rem)]" />
          </div>

          <div>
            <h2 id="site-footer-heading" className="sr-only">
              Site footer
            </h2>
            <div className="grid gap-12 sm:grid-cols-2 sm:gap-10">
              {SITE_FOOTER_LINK_COLUMNS.map((column) => (
                <div key={column.title}>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    {column.title}
                  </p>
                  <ul className="mt-5 flex flex-col gap-3">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <FooterNavLink link={link} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-primary/10 pt-8 sm:mt-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-sans text-sm font-semibold tracking-tight text-ink">
                Native Context Index
              </p>
              <p className="mt-1 text-sm tracking-tight-p text-muted">
                Local TypeScript context for agents.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span>© {CURRENT_YEAR} Native Context Index</span>
              <span className="hidden text-border sm:inline" aria-hidden>
                ·
              </span>
              <a
                href={SITE_FOOTER_GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline decoration-transparent underline-offset-4 outline-none transition-[color,text-decoration-color] duration-200 ease-out hover:text-dark hover:decoration-primary/50 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
