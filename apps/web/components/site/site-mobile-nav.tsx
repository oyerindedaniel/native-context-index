"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MobileHamburgerButton } from "@/components/nav/mobile-hamburger-button";
import { useCloseDrawerAtMinWidth } from "@/lib/hooks/use-close-drawer-at-min-width";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { useDocumentScrollLock } from "@/lib/hooks/use-document-scroll-lock";
import { MOBILE_NAV_DESKTOP_MQ } from "@/lib/nav/mobile-drawer-breakpoints";
import { isSiteNavHrefActive } from "@/components/site/site-nav-active";

const FADE_EASE = "easeOut" as const;
const PANEL_EASE = [0.16, 1, 0.3, 1] as const;

interface SiteMobileNavProps {
  readonly className?: string;
}

/** Mobile navigation for pages outside `/docs` (home, Why NCI, etc.). */
export function SiteMobileNav({ className }: SiteMobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname() ?? "";

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      <MobileHamburgerButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      <Link
        href="/"
        aria-label="Native Context Index home"
        className="inline-flex min-w-0 max-w-[min(16rem,calc(100vw-8.5rem))] shrink items-center"
      >
        <Image
          src="/nci-full-logo.svg"
          alt=""
          width={921}
          height={346}
          className="h-7 w-auto object-contain object-left sm:h-8"
          priority
        />
      </Link>
      <SiteMobileOverlay
        open={open}
        onOpenChange={setOpen}
        pathname={pathname}
      />
    </div>
  );
}

interface SiteMobileOverlayProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  pathname: string;
}

function SiteMobileOverlay({
  open,
  onOpenChange,
  pathname,
}: SiteMobileOverlayProps) {
  const reduceMotion = useReducedMotion();
  const { containerRef, handleFocusBefore, handleFocusAfter } = useFocusTrap();
  const [mounted, setMounted] = React.useState(false);
  const previousPath = React.useRef(pathname);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useCloseDrawerAtMinWidth(MOBILE_NAV_DESKTOP_MQ, onOpenChange);

  React.useEffect(() => {
    if (previousPath.current !== pathname) {
      onOpenChange(false);
      previousPath.current = pathname;
    }
  }, [pathname, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  useDocumentScrollLock(open);

  if (!mounted) {
    return null;
  }

  const overlayTransition: Transition = {
    duration: reduceMotion ? 0 : 0.18,
    ease: FADE_EASE,
  };
  const contentTransition: Transition = {
    duration: reduceMotion ? 0 : 0.26,
    ease: PANEL_EASE,
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 flex min-h-dvh w-screen bg-ink/45 backdrop-blur-sm"
          style={{ zIndex: "var(--nci-z-mobile-drawer)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onOpenChange(false);
            }
          }}
        >
          <div tabIndex={0} onFocus={handleFocusBefore} className="sr-only" />
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={contentTransition}
            className="flex min-h-dvh min-w-0 flex-1 flex-col border-border bg-elevated/95 text-ink shadow-[0_24px_60px_-12px_#00000026] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col px-8 pt-6 sm:px-10 sm:pt-8">
              <div className="mb-10 flex shrink-0 items-center justify-between border-b border-border/80 pb-6 sm:mb-12 sm:pb-8">
                <Link
                  href="/"
                  aria-label="Native Context Index home"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex min-w-0 max-w-[min(18rem,calc(100%-3rem))] shrink items-center rounded-md opacity-90 outline-none ring-offset-2 ring-offset-elevated transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Image
                    src="/nci-full-logo.svg"
                    alt=""
                    width={921}
                    height={346}
                    className="h-8 w-auto object-contain object-left sm:h-9"
                    priority
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close menu"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "shrink-0 text-muted hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  <XMarkIcon className="size-6" aria-hidden="true" />
                </button>
              </div>

              <nav
                className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4"
                aria-label="Primary"
              >
                <SiteNavLink
                  href="/"
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                >
                  Home
                </SiteNavLink>
                <SiteNavLink
                  href="/why-nci"
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                >
                  Why NCI
                </SiteNavLink>
                <SiteNavLink
                  href="/docs"
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                >
                  Documentation
                </SiteNavLink>
                <SiteNavLink
                  href="/docs/quickstart"
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                >
                  Get started
                </SiteNavLink>
              </nav>

              <div className="mt-auto flex shrink-0 justify-end pt-10 pb-8 sm:pt-12 sm:pb-10">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "text-sm font-semibold text-muted hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
          <div tabIndex={0} onFocus={handleFocusAfter} className="sr-only" />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function SiteNavLink({
  href,
  pathname,
  children,
  onNavigate,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  const active = isSiteNavHrefActive(href, pathname);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative border-l-2 border-transparent pl-4 text-2xl font-bold leading-snug tracking-tight text-ink/90 outline-none transition-[color,border-color] duration-150 ease-out hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-4 focus-visible:ring-offset-elevated sm:text-3xl",
        active && "border-primary text-primary hover:text-dark",
      )}
    >
      {children}
    </Link>
  );
}

SiteMobileNav.displayName = "SiteMobileNav";
