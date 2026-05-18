import { ChangelogShell } from "@/components/changelog/changelog-shell";
import { createMarketingPageMetadata } from "@/lib/site-metadata";
import { SiteMarketingFooter } from "@/components/marketing/site-marketing-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata = createMarketingPageMetadata({
  title: "Changelog",
  description: "Release notes and updates for Native Context Index.",
  pathname: "/changelog",
});

export default function ChangelogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <SiteHeader />
      <main>
        <ChangelogShell>{children}</ChangelogShell>
      </main>
      <SiteMarketingFooter />
    </div>
  );
}
