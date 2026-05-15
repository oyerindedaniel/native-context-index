import { HeroSection } from "../components/home/hero/hero-section";
import { HomeCliCinema } from "../components/home/home-cli-cinema";
import { FeaturesSection } from "../components/home/features/features-section";
import { IntegrationsSection } from "../components/home/integrations/integrations-section";
import { HomeFaqSection } from "../components/home/faq/home-faq-section";
import { SiteMarketingFooter } from "../components/marketing/site-marketing-footer";

export default function Home() {
  return (
    <>
      <main className="min-h-screen bg-white font-sans">
        <HeroSection />
        <HomeCliCinema />
        <FeaturesSection />
        <IntegrationsSection />
        <HomeFaqSection />
      </main>
      <SiteMarketingFooter />
    </>
  );
}
