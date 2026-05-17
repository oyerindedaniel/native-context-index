import type { Metadata } from "next";
import { ChangelogShell } from "@/components/changelog/changelog-shell";
import { SiteMarketingFooter } from "@/components/marketing/site-marketing-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Changelog — Native Context Index",
  description: "Release notes and updates for Native Context Index.",
};

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
