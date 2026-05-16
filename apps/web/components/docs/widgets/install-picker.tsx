"use client";

import * as React from "react";
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
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import {
  PackageManagerLogo,
  type PackageManagerId,
} from "@/components/docs/widgets/package-manager-logo";
import { cn } from "@/lib/utils";

export interface PackageManagerEntry {
  id: PackageManagerId;
  label: string;
  install: string;
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

interface InstallPickerControlProps {
  className?: string;
}

export function InstallPickerControl({ className }: InstallPickerControlProps) {
  const { managers, active, setActiveId } = useInstallPickerContext();
  const [open, setOpen] = React.useState(false);
  const layoutId = React.useId();
  const { copied, copy } = useCopyToClipboard();
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleCopy = React.useCallback(() => {
    void copy(active.install);
  }, [active.install, copy]);

  const focusOptionAt = React.useCallback(
    (index: number) => {
      const total = managers.length;
      if (total === 0) {
        return;
      }
      const wrapped = ((index % total) + total) % total;
      optionRefs.current[wrapped]?.focus();
    },
    [managers.length],
  );

  // Roving-tabindex listbox: arrow keys cycle focus, Home/End jump to ends.
  // Enter / Space fire the option button's native onClick (which commits the
  // selection and closes the popover), so we don't intercept them here.
  const handleListKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      if (managers.length === 0) {
        return;
      }
      const currentIndex = optionRefs.current.findIndex(
        (button) => button === document.activeElement,
      );
      const fallbackIndex = managers.findIndex(
        (entry) => entry.id === active.id,
      );
      const base = currentIndex >= 0 ? currentIndex : fallbackIndex;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusOptionAt(base + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focusOptionAt(base - 1);
          break;
        case "Home":
          event.preventDefault();
          focusOptionAt(0);
          break;
        case "End":
          event.preventDefault();
          focusOptionAt(managers.length - 1);
          break;
        default:
          break;
      }
    },
    [managers, active.id, focusOptionAt],
  );

  const activeIndex = React.useMemo(
    () => managers.findIndex((entry) => entry.id === active.id),
    [managers, active.id],
  );

  // When the popover opens, land focus on the currently-selected option so
  // arrow keys feel like they originate from the right place. RAF defers
  // until after the Radix Portal has mounted.
  React.useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, activeIndex]);

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
                <PackageManagerLogo id={active.id} variant="mono" />
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-white/85 transition-transform duration-150 ease-out",
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
                className="nci-radix-surface z-50 w-56 overflow-hidden rounded-2xl border border-border bg-elevated p-1 shadow-[0_2px_4px_#00000010,0_18px_30px_-12px_#0000001f]"
              >
                <ul
                  role="listbox"
                  aria-label="Package manager"
                  className="flex flex-col"
                  onKeyDown={handleListKeyDown}
                >
                  {managers.map((entry, index) => {
                    const isActive = entry.id === active.id;
                    return (
                      <li key={entry.id}>
                        <button
                          ref={(element) => {
                            optionRefs.current[index] = element;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          tabIndex={isActive ? 0 : -1}
                          onClick={() => {
                            setActiveId(entry.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-ink/85 hover:bg-surface-hover",
                          )}
                        >
                          <PackageManagerLogo id={entry.id} variant="colored" />
                          <span className="text-sm font-semibold tracking-tight">
                            {entry.label}
                          </span>
                          {isActive ? (
                            <CheckIcon
                              className="ml-auto size-4 text-primary"
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
            <CopyStatusIcon
              copied={copied}
              idle={ClipboardIcon}
              className="size-4"
            />
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
                    className="absolute inset-0 -z-0 rounded-full bg-surface-hover ring-1 ring-border/70"
                    transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10">{entry.label}</span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" className="flex flex-row items-start gap-3 p-5">
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
            <CopyStatusIcon
              copied={copied}
              idle={ClipboardIcon}
              className="size-4"
            />
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
  },
  {
    id: "pnpm",
    label: "pnpm",
    install: "pnpm add -g @nativecontextindex/cli",
  },
  {
    id: "yarn",
    label: "yarn",
    install: "yarn global add @nativecontextindex/cli",
  },
  {
    id: "bun",
    label: "bun",
    install: "bun install -g @nativecontextindex/cli",
  },
];
