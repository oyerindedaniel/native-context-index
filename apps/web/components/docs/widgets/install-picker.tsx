"use client";

import * as React from "react";
import Image from "next/image";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "motion/react";
import {
  ClipboardIcon,
  CheckIcon,
  ChevronDownIcon,
} from "@heroicons/react/20/solid";
import { SplitButton } from "@/components/ui/split-button";
import { buttonVariants } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { cn } from "@/lib/utils";

export type PackageManagerId = "npm" | "pnpm" | "yarn" | "bun";

export interface PackageManagerEntry {
  id: PackageManagerId;
  label: string;
  install: string;
  hint?: string;
}

interface InstallPickerContextValue {
  managers: PackageManagerEntry[];
  active: PackageManagerEntry;
  setActiveId: (id: PackageManagerId) => void;
}

const InstallPickerContext =
  React.createContext<InstallPickerContextValue | null>(null);

function useInstallPickerContext(): InstallPickerContextValue {
  const context = React.useContext(InstallPickerContext);
  if (!context) {
    throw new Error(
      "InstallPicker sub-components must be used inside InstallPickerRoot",
    );
  }
  return context;
}

interface InstallPickerRootProps {
  managers: PackageManagerEntry[];
  storageKey?: string;
  defaultId?: PackageManagerId;
  className?: string;
  children: React.ReactNode;
}

const STORAGE_PREFIX = "nci.install-picker:";

export function InstallPickerRoot({
  managers,
  storageKey,
  defaultId,
  className,
  children,
}: InstallPickerRootProps) {
  if (managers.length === 0) {
    throw new Error("InstallPicker.Root requires at least one manager");
  }
  const fallback = managers[0]!;
  const initialId =
    defaultId && managers.some((entry) => entry.id === defaultId)
      ? defaultId
      : fallback.id;
  const fullStorageKey = storageKey ? STORAGE_PREFIX + storageKey : null;
  const managerSync = managers.map((entry) => entry.id).join(",");
  const [activeId, setActiveId] = useLocalStorageState<PackageManagerId>(
    fullStorageKey,
    initialId,
    {
      serialize: (value) => value,
      deserialize: (raw) =>
        managers.some((entry) => entry.id === raw)
          ? (raw as PackageManagerId)
          : null,
    },
    managerSync,
  );

  const active = React.useMemo(
    () => managers.find((entry) => entry.id === activeId) ?? fallback,
    [managers, activeId, fallback],
  );

  const value = React.useMemo<InstallPickerContextValue>(
    () => ({ managers, active, setActiveId }),
    [managers, active, setActiveId],
  );

  return (
    <InstallPickerContext.Provider value={value}>
      <div className={cn("flex w-full flex-col gap-2", className)}>
        {children}
      </div>
    </InstallPickerContext.Provider>
  );
}

function PackageManagerLogo({
  id,
  variant,
  className,
}: {
  id: PackageManagerId;
  variant: "inverse" | "muted";
  className?: string;
}) {
  const src = `/package-managers/${id}.svg`;
  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center",
        variant === "inverse" &&
          "[&_img]:brightness-0 [&_img]:invert [&_img]:opacity-95",
        variant === "muted" && "opacity-90",
        className,
      )}
      aria-hidden="true"
    >
      <Image src={src} alt="" width={20} height={20} className="size-5" />
    </span>
  );
}

interface InstallPickerControlProps {
  className?: string;
}

export function InstallPickerControl({ className }: InstallPickerControlProps) {
  const { managers, active, setActiveId } = useInstallPickerContext();
  const [open, setOpen] = React.useState(false);
  const layoutId = React.useId();
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = React.useCallback(() => {
    void copy(active.install);
  }, [active.install, copy]);

  const StatusIcon = copied ? CheckIcon : ClipboardIcon;

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <div className="hidden sm:block">
        <SplitButton.Root variant="primary" size="md" className="w-full">
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <SplitButton.IconTrigger
                aria-label={`Switch package manager (current: ${active.label})`}
                className="gap-1.5 px-3"
              >
                <PackageManagerLogo id={active.id} variant="inverse" />
                <ChevronDownIcon
                  className={cn(
                    "h-3.5 w-3.5 text-white/85 transition-transform duration-150 ease-out",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </SplitButton.IconTrigger>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={10}
                className="z-50 w-56 overflow-hidden rounded-2xl border border-border bg-elevated p-1 shadow-[0_2px_4px_#00000010,0_18px_30px_-12px_#0000001f]"
              >
                <ul role="listbox" className="flex flex-col">
                  {managers.map((entry) => {
                    const isActive = entry.id === active.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            setActiveId(entry.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 ease-out",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-ink/85 hover:bg-surface-hover",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded-md",
                              isActive ? "bg-primary" : "bg-surface",
                            )}
                            aria-hidden="true"
                          >
                            <PackageManagerLogo
                              id={entry.id}
                              variant={isActive ? "inverse" : "muted"}
                            />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-sm font-semibold tracking-tight">
                              {entry.label}
                            </span>
                            {entry.hint ? (
                              <span className="text-[0.7rem] tracking-tight-p text-muted">
                                {entry.hint}
                              </span>
                            ) : null}
                          </span>
                          {isActive ? (
                            <CheckIcon
                              className="ml-auto h-4 w-4 text-primary"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <SplitButton.Main
            type="button"
            onClick={handleCopy}
            aria-label={`Copy install command for ${active.label}`}
            className="cursor-copy gap-3 px-5 font-mono"
          >
            <span className="text-white/65">$</span>
            <span className="truncate text-white">{active.install}</span>
          </SplitButton.Main>

          <SplitButton.IconTrigger
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy install command"}
          >
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
          </SplitButton.IconTrigger>
        </SplitButton.Root>
      </div>

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-elevated sm:hidden">
        <div
          role="tablist"
          aria-label="Package manager"
          className="flex flex-wrap items-center gap-1 border-b border-border bg-surface/70 px-2 py-1.5"
        >
          {managers.map((entry) => {
            const isActive = entry.id === active.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(entry.id)}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                  isActive ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId={`install-picker-tab-${layoutId}`}
                    className="absolute inset-0 -z-0 rounded-full bg-elevated shadow-[0_1px_2px_#00000010,0_6px_14px_-8px_#0000001a,inset_0_1px_#ffffff80]"
                    transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10">{entry.label}</span>
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          className="flex flex-row items-start gap-3 px-5 py-5"
        >
          <div className="flex min-h-9 min-w-0 flex-1 items-center font-mono text-sm leading-relaxed tracking-tight-p text-ink">
            <span className="break-all">
              <span className="select-none text-muted">$ </span>
              {active.install}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy install command"}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "shrink-0",
            )}
          >
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

InstallPickerRoot.displayName = "InstallPicker.Root";
InstallPickerControl.displayName = "InstallPicker.Control";

export interface InstallPickerNamespace {
  Root: typeof InstallPickerRoot;
  Control: typeof InstallPickerControl;
}

export const InstallPicker: InstallPickerNamespace = {
  Root: InstallPickerRoot,
  Control: InstallPickerControl,
};

export const defaultManagers: PackageManagerEntry[] = [
  {
    id: "npm",
    label: "npm",
    install: "npm install -g @nativecontextindex/cli",
    hint: "Node Package Manager",
  },
  {
    id: "pnpm",
    label: "pnpm",
    install: "pnpm add -g @nativecontextindex/cli",
    hint: "Fast, disk-efficient",
  },
  {
    id: "yarn",
    label: "yarn",
    install: "yarn global add @nativecontextindex/cli",
    hint: "Classic & Berry",
  },
  {
    id: "bun",
    label: "bun",
    install: "bun install -g @nativecontextindex/cli",
    hint: "All-in-one toolkit",
  },
];
