import { SiteMarketingFooter } from "@/components/marketing/site-marketing-footer";
import { createMarketingPageMetadata } from "@/lib/site-metadata";
import { SiteHeader } from "@/components/site/site-header";
import { WhyNciShell } from "@/components/why-nci/why-nci-shell";
import { WhyNciStoryProvider } from "@/components/why-nci/why-nci-story-context";

export const metadata = createMarketingPageMetadata({
  title: "Why NCI",
  description:
    "How NCI came from a real agent workflow: local types versus web docs, and what the index replaces for day-to-day work.",
  pathname: "/why-nci",
});

export default function WhyNciLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <SiteHeader />
      <main>
        <WhyNciStoryProvider>
          <WhyNciShell>{children}</WhyNciShell>
        </WhyNciStoryProvider>
      </main>
      <SiteMarketingFooter />
    </div>
  );
}
