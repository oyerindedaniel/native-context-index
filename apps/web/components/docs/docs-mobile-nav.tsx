"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { BookOpenIcon, HomeIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { GitHubMark } from "@/components/docs/github-mark";
import { buttonVariants } from "@/components/ui/button";
import { MobileHamburgerButton } from "@/components/nav/mobile-hamburger-button";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { useDocumentScrollLock } from "@/lib/hooks/use-document-scroll-lock";
import {
  docsGroups,
  normalizeDocsPath,
  type DocsGroup,
} from "@/lib/docs/registry";
import { docsGroupIcons } from "@/lib/docs/icons";

const GITHUB_URL = "https://github.com/oyerindedaniel/native-context-index";

const DRAWER_EASE = [0.16, 1, 0.3, 1] as const;
const FADE_EASE = "easeOut" as const;

interface DocsMobileNavProps {
  className?: string;
}

export function DocsMobileNav({ className }: DocsMobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname() ?? "";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <MobileHamburgerButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      <Link
        href="/"
        aria-label="Native Context Index home"
        className="inline-flex shrink-0 items-center"
      >
        <Image
          src="/nci-logo.svg"
          alt="NCI"
          width={28}
          height={28}
          className="size-6"
          priority
        />
      </Link>
      <DocsMobileDrawer
        open={open}
        onOpenChange={setOpen}
        pathname={pathname}
      />
    </div>
  );
}

interface DocsMobileDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  pathname: string;
}

function DocsMobileDrawer({
  open,
  onOpenChange,
  pathname,
}: DocsMobileDrawerProps) {
  const reduceMotion = useReducedMotion();
  const { containerRef, handleFocusBefore, handleFocusAfter } = useFocusTrap();
  const [mounted, setMounted] = React.useState(false);
  const previousPath = React.useRef(pathname);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
    duration: reduceMotion ? 0 : 0.15,
    ease: FADE_EASE,
  };
  const sheetTransition: Transition = {
    duration: reduceMotion ? 0 : 0.28,
    ease: DRAWER_EASE,
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 flex bg-ink/45 backdrop-blur-sm"
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
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={sheetTransition}
            className="flex h-dvh w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-border bg-elevated shadow-[0_24px_60px_-12px_#00000040]"
          >
            <DrawerHeader onClose={() => onOpenChange(false)} />
            <DrawerBody pathname={pathname} />
          </motion.div>
          <div tabIndex={0} onFocus={handleFocusAfter} className="sr-only" />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

interface DrawerHeaderProps {
  onClose: () => void;
}

function DrawerHeader({ onClose }: DrawerHeaderProps) {
  return (
    <div className="flex h-docs-chrome shrink-0 items-center justify-between border-b border-border px-5">
      <Link
        href="/"
        aria-label="Native Context Index home"
        className="inline-flex items-center"
      >
        <Image
          src="/nci-full-logo.svg"
          alt="NCI"
          width={80}
          height={30}
          className="h-6 w-auto"
        />
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "shrink-0",
        )}
      >
        <XMarkIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

interface DrawerBodyProps {
  pathname: string;
}

function DrawerBody({ pathname }: DrawerBodyProps) {
  const normalizedPath = normalizeDocsPath(pathname);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-3 py-6">
      <DrawerSection title="Menu">
        <DrawerLink
          href="/"
          label="Home"
          icon={HomeIcon}
          active={normalizedPath === "/"}
        />
        <DrawerLink
          href="/docs"
          label="Docs"
          icon={BookOpenIcon}
          active={normalizedPath === "/docs"}
        />
        <DrawerExternalLink
          href={GITHUB_URL}
          label="GitHub"
          leading={<GitHubMark />}
        />
      </DrawerSection>

      <DrawerSection title="Sections">
        <div className="flex flex-col gap-6">
          {docsGroups.map((group) => (
            <DrawerDocsGroup
              key={group.id}
              group={group}
              normalizedPath={normalizedPath}
            />
          ))}
        </div>
      </DrawerSection>
    </div>
  );
}

interface DrawerSectionProps {
  title: string;
  children: React.ReactNode;
}

function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="px-3 text-[0.7rem] font-semibold uppercase tracking-[0.11em] text-muted/75">
        {title}
      </h4>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

interface DrawerLinkProps {
  href: string;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  active?: boolean;
}

function DrawerLink({ href, label, icon: Icon, active }: DrawerLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        active
          ? "bg-primary/10 text-primary"
          : "text-ink/85 hover:bg-surface-hover hover:text-ink",
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "size-4 shrink-0",
            active ? "text-primary" : "text-muted/70",
          )}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}

interface DrawerExternalLinkProps {
  href: string;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  leading?: React.ReactNode;
}

function DrawerExternalLink({
  href,
  label,
  icon: Icon,
  leading,
}: DrawerExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-ink/85 outline-none transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
    >
      {leading ??
        (Icon ? (
          <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
        ) : null)}
      <span className="truncate">{label}</span>
    </a>
  );
}

interface DrawerDocsGroupProps {
  group: DocsGroup;
  normalizedPath: string;
}

function DrawerDocsGroup({ group, normalizedPath }: DrawerDocsGroupProps) {
  const GroupIcon = docsGroupIcons[group.iconName];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-3">
        <GroupIcon
          className="size-3.5 -translate-y-px text-muted/70"
          aria-hidden="true"
        />
        <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted/85">
          {group.title}
        </h5>
      </div>
      <ul className="flex flex-col gap-0.5">
        {group.pages.map((page) => {
          const isActive = normalizeDocsPath(page.slug) === normalizedPath;
          return (
            <li key={page.slug}>
              <Link
                href={page.slug}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-ink/85 hover:bg-surface-hover hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isActive ? "bg-primary" : "bg-muted/40",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{page.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

DocsMobileNav.displayName = "DocsMobileNav";
