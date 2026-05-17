"use client";

import { motion } from "motion/react";
import {
  SiteMarketingHeaderDesktop,
  SiteMarketingHeaderMobileRow,
} from "@/components/site/site-marketing-header";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { HERO_BELOW_MD_MEDIA, HeroCanvas } from "./hero-canvas";
import { HeroGetStartedButton } from "./hero-get-started-button";

const COPY_ENTRANCE_EASE = [0.16, 1, 0.3, 1] as const;

const SECTION_SHELL = "mx-auto w-full max-w-[1050px] px-6";

export function HeroSection() {
  const isBelowMd = useMediaQuery(HERO_BELOW_MD_MEDIA);
  const isDesktopLayout = !isBelowMd;

  return (
    <div className="relative bg-elevated text-ink">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className={cn("pointer-events-auto", SECTION_SHELL)}>
          <SiteMarketingHeaderMobileRow className="md:hidden" />
          <SiteMarketingHeaderDesktop className="hidden md:grid" logoPriority />
        </div>
      </header>

      <section className="relative min-h-screen overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 md:inset-y-0 md:left-[44%] md:right-0",
            "md:[mask-image:linear-gradient(to_right,transparent_0%,#000_16%,#000_100%)]",
            "md:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,#000_16%,#000_100%)]",
          )}
          aria-hidden
        >
          <HeroCanvas />
        </div>

        <motion.div
          className={cn(
            "pointer-events-none relative z-10 flex min-h-screen w-full flex-col pb-6 sm:pb-14",
            "items-end justify-end text-right",
            "md:items-start md:justify-center md:pb-0 md:text-left",
          )}
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                delayChildren: isDesktopLayout ? 0.22 : 0.48,
                staggerChildren: 0.14,
              },
            },
          }}
        >
          <div className={cn("flex flex-col", SECTION_SHELL)}>
            <div className="ml-auto flex w-full max-w-xl flex-col md:ml-0">
              <motion.span
                className="mb-3 font-inter-tight text-sm font-medium tracking-[0.11em] text-ink/90 uppercase sm:text-base"
                variants={{
                  hidden: isDesktopLayout
                    ? { opacity: 0, x: -18, filter: "blur(6px)" }
                    : { opacity: 0, y: 14, filter: "blur(6px)" },
                  visible: {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.72, ease: COPY_ENTRANCE_EASE },
                  },
                }}
              >
                Native Context Index
              </motion.span>
              <motion.h1
                className="font-sans text-2xl font-semibold leading-tight tracking-tight-sub text-ink sm:text-3xl lg:text-[2.125rem] xl:text-[2.5rem]"
                variants={{
                  hidden: isDesktopLayout
                    ? { opacity: 0, x: -28, filter: "blur(10px)" }
                    : { opacity: 0, y: 26, filter: "blur(10px)" },
                  visible: {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.88, ease: COPY_ENTRANCE_EASE },
                  },
                }}
              >
                <span className="block text-balance">
                  Local TypeScript context
                </span>
                <span className="block">for agents</span>
              </motion.h1>

              <motion.p
                className="mt-3 max-w-[34rem] text-base text-pretty leading-relaxed tracking-tight-p text-muted sm:text-lg"
                variants={{
                  hidden: isDesktopLayout
                    ? { opacity: 0, x: -22, filter: "blur(8px)" }
                    : { opacity: 0, y: 18, filter: "blur(8px)" },
                  visible: {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.8, ease: COPY_ENTRANCE_EASE },
                  },
                }}
              >
                NCI indexes symbols, dependencies, and versions across
                packages—so agents move quickly with context that matches the
                latest APIs you ship against.
              </motion.p>

              <motion.div
                className="mt-6 hidden md:block"
                variants={{
                  hidden: isDesktopLayout
                    ? { opacity: 0, x: -20, filter: "blur(6px)" }
                    : { opacity: 0 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.76, ease: COPY_ENTRANCE_EASE },
                  },
                }}
              >
                <HeroGetStartedButton />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
