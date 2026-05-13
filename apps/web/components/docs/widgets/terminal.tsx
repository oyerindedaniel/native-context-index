"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ClipboardIcon, CommandLineIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

interface TerminalContextValue {
  command: string;
  registerCommand: (command: string) => void;
  isPlaying: boolean;
  revealedCommand: string;
  isCommandComplete: boolean;
  shouldRenderOutput: boolean;
}

const TerminalContext = React.createContext<TerminalContextValue | null>(null);

function useTerminalContext(): TerminalContextValue {
  const context = React.useContext(TerminalContext);
  if (!context) {
    throw new Error("Terminal sub-components must be used inside TerminalRoot");
  }
  return context;
}

interface TerminalRootProps {
  className?: string;
  title?: string;
  cwd?: string;
  typeMs?: number;
  outputDelayMs?: number;
  children: React.ReactNode;
}

const DEFAULT_TYPE_MS = 22;
const DEFAULT_OUTPUT_DELAY_MS = 280;

export function TerminalRoot({
  className,
  title = "nci",
  cwd,
  typeMs = DEFAULT_TYPE_MS,
  outputDelayMs = DEFAULT_OUTPUT_DELAY_MS,
  children,
}: TerminalRootProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, amount: 0.4 });
  const prefersReducedMotion = useReducedMotion();

  const [command, setCommand] = React.useState("");
  const [revealedCommand, setRevealedCommand] = React.useState("");
  const [shouldRenderOutput, setShouldRenderOutput] = React.useState(false);

  const registerCommand = React.useCallback((nextCommand: string) => {
    setCommand((current) => (current === nextCommand ? current : nextCommand));
  }, []);

  React.useEffect(() => {
    if (!command) {
      return;
    }
    if (!inView) {
      return;
    }
    if (prefersReducedMotion) {
      setRevealedCommand(command);
      setShouldRenderOutput(true);
      return;
    }

    setRevealedCommand("");
    setShouldRenderOutput(false);

    let charIndex = 0;
    const timer = window.setInterval(() => {
      charIndex += 1;
      setRevealedCommand(command.slice(0, charIndex));
      if (charIndex >= command.length) {
        window.clearInterval(timer);
        window.setTimeout(() => setShouldRenderOutput(true), outputDelayMs);
      }
    }, typeMs);

    return () => window.clearInterval(timer);
  }, [command, inView, prefersReducedMotion, typeMs, outputDelayMs]);

  const isCommandComplete =
    command.length > 0 && revealedCommand.length === command.length;
  const isPlaying = inView && command.length > 0 && !isCommandComplete;

  const value = React.useMemo<TerminalContextValue>(
    () => ({
      command,
      registerCommand,
      isPlaying,
      revealedCommand,
      isCommandComplete,
      shouldRenderOutput,
    }),
    [
      command,
      registerCommand,
      isPlaying,
      revealedCommand,
      isCommandComplete,
      shouldRenderOutput,
    ],
  );

  return (
    <TerminalContext.Provider value={value}>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "my-6 overflow-hidden rounded-2xl border border-ink/10 bg-[#0F1116] text-[#E8ECF4] shadow-[0_2px_4px_#00000038,0_18px_30px_-12px_#00000033,inset_0_1px_#ffffff14] [will-change:transform]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-tight-p text-white/65">
            <CommandLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{title}</span>
            {cwd ? (
              <>
                <span className="text-white/30">·</span>
                <span className="font-mono text-white/55">{cwd}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-[#FF5F56]" />
            <span className="h-2 w-2 rounded-full bg-[#FFBD2E]" />
            <span className="h-2 w-2 rounded-full bg-[#27C93F]" />
          </div>
        </div>
        <div className="px-4 py-3 font-mono text-[0.825rem] leading-relaxed">
          {children}
        </div>
      </motion.div>
    </TerminalContext.Provider>
  );
}

interface TerminalCommandProps {
  prompt?: string;
  children: string;
  className?: string;
}

export function TerminalCommand({
  prompt = "$",
  children,
  className,
}: TerminalCommandProps) {
  const { registerCommand, revealedCommand, isPlaying, isCommandComplete } =
    useTerminalContext();
  const { copied, copy } = useCopyToClipboard();

  React.useEffect(() => {
    registerCommand(children);
  }, [children, registerCommand]);

  const showCursor = isPlaying || !isCommandComplete;

  return (
    <div
      className={cn(
        "group/command flex items-start gap-3 whitespace-pre-wrap break-all",
        className,
      )}
    >
      <span className="select-none text-[#7A63F5]" aria-hidden="true">
        {prompt}
      </span>
      <span className="flex-1 text-white/95">
        {revealedCommand}
        {showCursor ? (
          <span
            className="ml-0.5 inline-block h-4 w-1.5 translate-y-[2px] animate-[pulse_1.1s_ease-in-out_infinite] bg-white/85"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => {
          void copy(children);
        }}
        aria-label={copied ? "Copied" : "Copy command"}
        className="ml-auto inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/70 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.97] active:blur-[1px]"
      >
        <CopyStatusIcon
          copied={copied}
          idle={ClipboardIcon}
          className="h-3.5 w-3.5"
        />
      </button>
    </div>
  );
}

interface TerminalOutputProps {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "muted" | "success" | "error";
}

export function TerminalOutput({
  children,
  className,
  tone = "default",
}: TerminalOutputProps) {
  const { shouldRenderOutput } = useTerminalContext();

  const toneClass = (() => {
    switch (tone) {
      case "muted":
        return "text-white/55";
      case "success":
        return "text-[#7BD88F]";
      case "error":
        return "text-[#FF8C8C]";
      default:
        return "text-white/85";
    }
  })();

  return (
    <motion.pre
      initial={{ opacity: 0, y: 4 }}
      animate={shouldRenderOutput ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "mt-2 whitespace-pre-wrap text-[0.78rem] leading-relaxed",
        toneClass,
        className,
      )}
    >
      {children}
    </motion.pre>
  );
}

TerminalRoot.displayName = "Terminal.Root";
TerminalCommand.displayName = "Terminal.Command";
TerminalOutput.displayName = "Terminal.Output";

export interface TerminalNamespace {
  Root: typeof TerminalRoot;
  Command: typeof TerminalCommand;
  Output: typeof TerminalOutput;
}

export const Terminal: TerminalNamespace = {
  Root: TerminalRoot,
  Command: TerminalCommand,
  Output: TerminalOutput,
};
