"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  PackageManagerLogo,
  isPackageManagerId,
} from "@/components/docs/widgets/package-manager-logo";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { cn } from "@/lib/utils";

interface InstallTabsContextValue {
  activeKey: string;
  setActiveKey: (next: string) => void;
  layoutId: string;
}

const InstallTabsContext = React.createContext<InstallTabsContextValue | null>(
  null,
);

function useInstallTabsContext(): InstallTabsContextValue {
  const context = React.useContext(InstallTabsContext);
  if (!context) {
    throw new Error(
      "InstallTabs sub-components must be used inside InstallTabsRoot",
    );
  }
  return context;
}

interface InstallTabsRootProps {
  storageKey?: string;
  defaultKey: string;
  className?: string;
  children: React.ReactNode;
}

const STORAGE_PREFIX = "nci.install-tabs:";

export function InstallTabsRoot({
  storageKey,
  defaultKey,
  className,
  children,
}: InstallTabsRootProps) {
  const layoutId = React.useId();
  const fullStorageKey = storageKey ? STORAGE_PREFIX + storageKey : null;
  const [activeKey, setActiveKey] = useLocalStorageState(
    fullStorageKey,
    defaultKey,
    {
      serialize: (value) => value,
      deserialize: (raw) => (raw.length > 0 ? raw : null),
    },
  );

  const value = React.useMemo<InstallTabsContextValue>(
    () => ({ activeKey, setActiveKey, layoutId }),
    [activeKey, setActiveKey, layoutId],
  );

  return (
    <InstallTabsContext.Provider value={value}>
      <div
        className={cn(
          "my-6 overflow-hidden rounded-2xl border border-border bg-elevated",
          className,
        )}
      >
        {children}
      </div>
    </InstallTabsContext.Provider>
  );
}

interface InstallTabsListProps {
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}

export function InstallTabsList({
  className,
  children,
  ariaLabel = "Install method",
}: InstallTabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-border bg-surface/70 px-2 py-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface InstallTabsTriggerProps {
  tabKey: string;
  children: React.ReactNode;
  className?: string;
}

export function InstallTabsTrigger({
  tabKey,
  children,
  className,
}: InstallTabsTriggerProps) {
  const { activeKey, setActiveKey, layoutId } = useInstallTabsContext();
  const isActive = activeKey === tabKey;
  const packageManager = isPackageManagerId(tabKey) ? tabKey : null;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveKey(tabKey)}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
        isActive ? "text-ink" : "text-muted hover:text-ink",
        className,
      )}
    >
      {isActive ? (
        <motion.span
          layoutId={`install-tabs-active-${layoutId}`}
          className="absolute inset-0 -z-0 rounded-full bg-surface-hover ring-1 ring-border/70"
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {packageManager ? (
          <PackageManagerLogo id={packageManager} variant="colored" />
        ) : null}
        {children}
      </span>
    </button>
  );
}

interface InstallTabsPanelProps {
  tabKey: string;
  className?: string;
  children: React.ReactNode;
}

export function InstallTabsPanel({
  tabKey,
  className,
  children,
}: InstallTabsPanelProps) {
  const { activeKey } = useInstallTabsContext();
  if (activeKey !== tabKey) {
    return null;
  }
  return (
    <div
      role="tabpanel"
      className={cn(
        "px-5 py-5 text-sm leading-relaxed tracking-tight-p text-ink/90 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

InstallTabsRoot.displayName = "InstallTabs.Root";
InstallTabsList.displayName = "InstallTabs.List";
InstallTabsTrigger.displayName = "InstallTabs.Trigger";
InstallTabsPanel.displayName = "InstallTabs.Panel";

export interface InstallTabsNamespace {
  Root: typeof InstallTabsRoot;
  List: typeof InstallTabsList;
  Trigger: typeof InstallTabsTrigger;
  Panel: typeof InstallTabsPanel;
}

export const InstallTabs: InstallTabsNamespace = {
  Root: InstallTabsRoot,
  List: InstallTabsList,
  Trigger: InstallTabsTrigger,
  Panel: InstallTabsPanel,
};
