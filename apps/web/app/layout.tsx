import { Analytics } from "@vercel/analytics/next";
import { Inter, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";

import { createRootMetadata } from "@/lib/site-metadata";
import { cn } from "../lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const interTight = localFont({
  src: "./fonts/InterTight-Regular.woff",
  variable: "--font-inter-tight",
  weight: "400",
});

export const metadata = createRootMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(inter.variable, geistMono.variable, interTight.variable)}
    >
      <body className="font-sans">
        {process.env.NODE_ENV === "development" && (
          <Script
            src="https://unpkg.com/@oyerinde/caliper/dist/index.global.js"
            data-config={JSON.stringify({
              bridge: { enabled: true },
            })}
            strategy="afterInteractive"
          />
        )}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
