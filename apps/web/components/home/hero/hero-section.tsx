"use client";

import { motion } from "motion/react";
import {
  SiteMarketingHeaderDesktop,
  SiteMarketingHeaderMobileRow,
} from "@/components/site/site-marketing-header";
import { HeroCanvas } from "./hero-canvas";

export function HeroSection() {
  return (
    <section className="relative h-screen overflow-hidden bg-elevated text-ink">
      <div className="absolute inset-0">
        <HeroCanvas />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="pointer-events-auto mx-auto max-w-[1050px] px-4 sm:px-6">
          <SiteMarketingHeaderMobileRow className="md:hidden" />
          <SiteMarketingHeaderDesktop className="hidden md:grid" logoPriority />
        </div>
      </header>

      <motion.div
        className="pointer-events-none relative z-10 flex min-h-screen w-full flex-col items-end justify-end text-right px-4 sm:px-6 pb-6 sm:pb-14"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              delayChildren: 0.48,
              staggerChildren: 0.16,
            },
          },
        }}
      >
        <div className="mx-auto w-full max-w-[1050px]">
          <div className="flex max-w-xl flex-col ml-auto">
            <span className="font-inter-tight text-sm font-medium tracking-[0.11em] uppercase text-ink/90 sm:text-base mb-3">
              Native Context Index
            </span>
            <motion.h1
              className="font-sans text-2xl font-semibold leading-tight tracking-tight-sub text-ink sm:text-3xl lg:text-[2.125rem]"
              variants={{
                hidden: { opacity: 0, y: 26, filter: "blur(10px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            >
              Indexed TypeScript for agents
            </motion.h1>

            <motion.p
              className="mt-3 text-base leading-snug text-muted sm:text-lg tracking-tight-p"
              variants={{
                hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            >
              NCI indexes symbols, dependencies, and versions across packages so
              agents move quickly with context that matches the latest APIs you
              ship against.
            </motion.p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
