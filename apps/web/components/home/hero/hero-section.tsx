"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeroCanvas } from "./hero-canvas";

export function HeroSection() {
  return (
    <section className="relative h-screen overflow-hidden bg-elevated text-ink">
      <div className="absolute inset-0">
        <HeroCanvas />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto grid max-w-[1050px] grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-3 opacity-90 transition-opacity hover:opacity-100 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            aria-label="Native Context Index home"
          >
            <Image
              src="/nci-full-logo.svg"
              alt=""
              width={921}
              height={346}
              className="h-8 w-auto sm:h-9"
              priority
            />
          </Link>

          <nav
            className="pointer-events-auto flex min-w-0 items-center justify-center gap-5 sm:gap-10"
            aria-label="Primary"
          >
            <Link
              href="/search"
              className="text-base font-semibold text-ink/75 transition-colors hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Search
            </Link>
            <Link
              href="/benchmark"
              className="text-base font-semibold text-ink/75 transition-colors hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Benchmark
            </Link>
            <Link
              href="/docs"
              className="text-base font-semibold text-ink/75 transition-colors hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Documentation
            </Link>
          </nav>

          <div className="pointer-events-auto shrink-0 justify-self-end">
            <Link
              href="/get-started"
              className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
            >
              Get started
            </Link>
          </div>
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
              className="font-instrument-serif leading-[0.88] text-ink text-3xl lg:text-4xl"
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
