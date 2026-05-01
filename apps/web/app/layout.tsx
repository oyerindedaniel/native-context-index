import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "../lib/utils";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const interTight = localFont({
  src: "./fonts/InterTight-Regular.woff",
  variable: "--font-inter-tight",
  weight: "400",
});

const instrumentSerif = localFont({
  src: [
    {
      path: "./fonts/InstrumentSerif-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/InstrumentSerif-Italic.woff",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Native Context Index",
  description: "Native Context Index design system workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        inter.variable,
        interTight.variable,
        instrumentSerif.variable,
      )}
    >
      <body className="font-sans">
        {process.env.NODE_ENV === "development" && (
          <Script
            src="https://unpkg.com/@oyerinde/caliper/dist/index.global.min.js"
            data-config={JSON.stringify({
              theme: { primary: "#AC2323" },
            })}
            strategy="afterInteractive"
          />
        )}
        {children}
      </body>
    </html>
  );
}
