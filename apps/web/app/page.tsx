import { HeroSection } from "../components/home/hero/hero-section";
import { FeaturesSection } from "../components/home/features/features-section";
import { IntegrationsSection } from "../components/home/integrations/integrations-section";

export default function Home() {
  return (
    <main className="min-h-screen bg-white font-sans">
      <HeroSection />
      <FeaturesSection />
      <IntegrationsSection />
    </main>
  );
}
