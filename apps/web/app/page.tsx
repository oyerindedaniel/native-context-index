import type { Metadata } from "next";

import {
  createMarketingPageMetadata,
  DEFAULT_MARKETING_DESCRIPTION,
} from "@/lib/site-metadata";

import { HeroSection } from "../components/home/hero/hero-section";
import { HomeCliCinema } from "../components/home/home-cli-cinema";
import { FeaturesSection } from "../components/home/features/features-section";
import { HomeBenchmarkSection } from "../components/home/benchmark/home-benchmark-section";
import { IntegrationsSection } from "../components/home/integrations/integrations-section";
import { HomeFaqSection } from "../components/home/faq/home-faq-section";
import { SiteMarketingFooter } from "../components/marketing/site-marketing-footer";

export const metadata: Metadata = createMarketingPageMetadata({
  title: "Native Context Index",
  description: DEFAULT_MARKETING_DESCRIPTION,
  pathname: "/",
});

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-white font-sans">
        <HeroSection />
        <HomeCliCinema />
        <FeaturesSection />
        <IntegrationsSection />
        <HomeBenchmarkSection />
        <HomeFaqSection />
      </main>
      <SiteMarketingFooter />
    </>
  );
}
