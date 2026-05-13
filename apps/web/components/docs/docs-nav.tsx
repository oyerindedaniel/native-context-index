"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { docsGroupIcons } from "@/lib/docs/icons";
import { normalizeDocsPath, type DocsIconName } from "@/lib/docs/registry";

interface DocsNavContextValue {
  activePath: string;
}

const DocsNavContext = React.createContext<DocsNavContextValue | null>(null);

function useDocsNav() {
  const context = React.useContext(DocsNavContext);
  if (!context) {
    throw new Error("DocsNav components must be used within DocsNavRoot");
  }
  return context;
}

interface DocsNavRootProps {
  children: React.ReactNode;
  className?: string;
}

export function DocsNavRoot({ children, className }: DocsNavRootProps) {
  const pathname = usePathname();

  return (
    <DocsNavContext.Provider value={{ activePath: pathname }}>
      <nav className={cn("flex flex-col gap-7", className)}>{children}</nav>
    </DocsNavContext.Provider>
  );
}

interface DocsNavGroupProps {
  title: string;
  iconName?: DocsIconName;
  children: React.ReactNode;
}

export function DocsNavGroup({ title, iconName, children }: DocsNavGroupProps) {
  const Icon = iconName ? docsGroupIcons[iconName] : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3">
        {Icon ? (
          <Icon
            className="h-3.5 w-3.5 -translate-y-px text-muted/70"
            aria-hidden="true"
          />
        ) : null}
        <h4 className="text-xs font-semibold tracking-[0.08em] uppercase text-muted/80">
          {title}
        </h4>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

interface DocsNavItemProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function DocsNavItem({ href, children, className }: DocsNavItemProps) {
  const { activePath } = useDocsNav();
  const isActive = normalizeDocsPath(activePath) === normalizeDocsPath(href);

  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        isActive
          ? "text-primary"
          : "text-ink/60 hover:bg-surface-hover hover:text-ink",
        className,
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-indicator"
          className="absolute left-0 w-0.5 h-4 bg-primary rounded-full"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      {children}
    </Link>
  );
}
