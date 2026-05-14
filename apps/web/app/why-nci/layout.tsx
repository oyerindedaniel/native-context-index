import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";

export const metadata: Metadata = {
  title: "Why NCI — Native Context Index",
  description:
    "How NCI came from a real agent workflow: local types versus web docs, and what the index replaces for day-to-day work.",
};

export default function WhyNciLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <MarketingHeader />
      <main>{children}</main>
    </div>
  );
}
