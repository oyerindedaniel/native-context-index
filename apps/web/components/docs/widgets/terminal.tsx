"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ClipboardIcon, CommandLineIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

type UseInViewOptionsArg = NonNullable<Parameters<typeof useInView>[1]>;
/** `amount` accepted by Motion’s `useInView` (from `motion/react` → `framer-motion`). */
export type TerminalInViewAmount = NonNullable<UseInViewOptionsArg["amount"]>;

interface TerminalContextValue {
  command: string;
  registerCommand: (command: string) => void;
  isPlaying: boolean;
  revealedCommand: string;
  isCommandComplete: boolean;
  shouldRenderOutput: boolean;
  /** When false, `TerminalCommand` omits its trailing copy control (used with floating copy). */
  showInlineCommandCopy: boolean;
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
  /**
   * `floating`: single copy control pinned to the bottom-right of the body (home
   * cinema). Inline copy per command is used when reduced motion is on.
   */
  commandCopyPlacement?: "inline" | "floating";
  inViewAmount?: TerminalInViewAmount;
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
  commandCopyPlacement = "inline",
  inViewAmount = 0.4,
  children,
}: TerminalRootProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inViewOptions = React.useMemo(
    () => ({ once: true as const, amount: inViewAmount }),
    [inViewAmount],
  );
  const inView = useInView(containerRef, inViewOptions);
  const prefersReducedMotion = useReducedMotion() === true;
  const showInlineCommandCopy =
    commandCopyPlacement === "inline" || prefersReducedMotion;
  const useFloatingCommandCopyLayout =
    commandCopyPlacement === "floating" && !prefersReducedMotion;

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

    let characterIndex = 0;
    const typingIntervalId = window.setInterval(() => {
      characterIndex += 1;
      setRevealedCommand(command.slice(0, characterIndex));
      if (characterIndex >= command.length) {
        window.clearInterval(typingIntervalId);
        window.setTimeout(() => setShouldRenderOutput(true), outputDelayMs);
      }
    }, typeMs);

    return () => window.clearInterval(typingIntervalId);
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
      showInlineCommandCopy,
    }),
    [
      command,
      registerCommand,
      isPlaying,
      revealedCommand,
      isCommandComplete,
      shouldRenderOutput,
      showInlineCommandCopy,
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
          "my-6 overflow-hidden rounded-2xl border border-ink/10 bg-code-surface text-code-ink shadow-[0_2px_4px_#00000038,0_18px_30px_-12px_#00000033,inset_0_1px_#ffffff14] [will-change:transform]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-tight-p text-white/65">
            <CommandLineIcon className="size-3.5" aria-hidden="true" />
            <span>{title}</span>
            {cwd ? (
              <>
                <span className="text-white/30">·</span>
                <span className="font-mono text-white/55">{cwd}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-[#FF5F56]" />
            <span className="size-2 rounded-full bg-[#FFBD2E]" />
            <span className="size-2 rounded-full bg-[#27C93F]" />
          </div>
        </div>
        <div
          className={cn(
            "relative px-4 py-3 font-mono text-[0.825rem] leading-relaxed",
            useFloatingCommandCopyLayout && "pb-11",
          )}
        >
          {children}
          {useFloatingCommandCopyLayout && command && isCommandComplete ? (
            <TerminalFloatingCommandCopy commandText={command} />
          ) : null}
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

function TerminalFloatingCommandCopy({
  commandText,
}: {
  readonly commandText: string;
}) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-3 flex justify-end">
      <button
        type="button"
        onClick={() => {
          void copy(commandText);
        }}
        aria-label={copied ? "Copied" : "Copy command"}
        className="pointer-events-auto inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/8 text-white/75 shadow-[0_2px_10px_-2px_rgb(0_0_0/0.55)] transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.99]"
      >
        <CopyStatusIcon
          copied={copied}
          idle={ClipboardIcon}
          className="size-3.5"
        />
      </button>
    </div>
  );
}

export function TerminalCommand({
  prompt = "$",
  children,
  className,
}: TerminalCommandProps) {
  const {
    registerCommand,
    revealedCommand,
    isPlaying,
    isCommandComplete,
    showInlineCommandCopy,
  } = useTerminalContext();
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
      {showInlineCommandCopy ? (
        <button
          type="button"
          onClick={() => {
            void copy(children);
          }}
          aria-label={copied ? "Copied" : "Copy command"}
          className="ml-auto inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/70 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.99] active:blur-[0.5px]"
        >
          <CopyStatusIcon
            copied={copied}
            idle={ClipboardIcon}
            className="size-3.5"
          />
        </button>
      ) : (
        <span className="ml-auto shrink-0" aria-hidden="true" />
      )}
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
        return "text-accent";
      case "error":
        return "text-[color:var(--nci-color-cli-error)]";
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

export interface TerminalSequenceStep {
  readonly commandLine: string;
  readonly output: React.ReactNode;
}

const DEFAULT_PAUSE_BETWEEN_STEPS_MS = 520;

interface TerminalSequenceRootProps {
  readonly className?: string;
  readonly title?: string;
  readonly cwd?: string;
  readonly typeMs?: number;
  readonly outputDelayMs?: number;
  /** Extra delay after output appears before advancing to the next step. */
  readonly pauseBetweenStepsMs?: number;
  readonly commandCopyPlacement?: "inline" | "floating";
  /**
   * `useInView` `amount` for the typing gate (default `0.35`). Pass `"some"` when the
   * sequence sits in a height-animated shell (home CLI cinema).
   */
  readonly inViewAmount?: TerminalInViewAmount;
  readonly steps: readonly TerminalSequenceStep[];
}

/**
 * Multi-command terminal: types each command in order, reveals output, then
 * advances. For a single command, prefer `TerminalRoot` + `TerminalCommand`.
 */
export function TerminalSequenceRoot({
  className,
  title = "nci",
  cwd,
  typeMs = DEFAULT_TYPE_MS,
  outputDelayMs = DEFAULT_OUTPUT_DELAY_MS,
  pauseBetweenStepsMs = DEFAULT_PAUSE_BETWEEN_STEPS_MS,
  commandCopyPlacement = "inline",
  inViewAmount = 0.35,
  steps,
}: TerminalSequenceRootProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inViewOptions = React.useMemo(
    () => ({ once: true as const, amount: inViewAmount }),
    [inViewAmount],
  );
  const inView = useInView(containerRef, inViewOptions);
  const prefersReducedMotion = useReducedMotion() === true;
  const showInlineCommandCopy =
    commandCopyPlacement === "inline" || prefersReducedMotion;
  const useFloatingCommandCopyLayout =
    commandCopyPlacement === "floating" && !prefersReducedMotion;

  const [activeStepIndex, setActiveStepIndex] = React.useState(0);
  const [revealedCommandPrefix, setRevealedCommandPrefix] = React.useState("");
  const [outputVisibleStepIndex, setOutputVisibleStepIndex] = React.useState<
    number | null
  >(null);

  const { copied: copiedCommand, copy: copyCommand } = useCopyToClipboard();

  const activeStep = steps[activeStepIndex];
  const activeCommandLine = activeStep?.commandLine ?? "";

  React.useEffect(() => {
    if (!inView || steps.length === 0) {
      return;
    }
    if (!activeCommandLine) {
      return;
    }
    if (prefersReducedMotion) {
      setRevealedCommandPrefix(activeCommandLine);
      setOutputVisibleStepIndex(activeStepIndex);
      return;
    }

    setRevealedCommandPrefix("");
    setOutputVisibleStepIndex(null);

    let characterIndex = 0;
    const typingIntervalId = window.setInterval(() => {
      characterIndex += 1;
      setRevealedCommandPrefix(activeCommandLine.slice(0, characterIndex));
      if (characterIndex >= activeCommandLine.length) {
        window.clearInterval(typingIntervalId);
        window.setTimeout(() => {
          setOutputVisibleStepIndex(activeStepIndex);
        }, outputDelayMs);
      }
    }, typeMs);

    return () => window.clearInterval(typingIntervalId);
  }, [
    inView,
    activeStepIndex,
    activeCommandLine,
    prefersReducedMotion,
    typeMs,
    outputDelayMs,
    steps.length,
  ]);

  React.useEffect(() => {
    if (!inView || prefersReducedMotion) {
      return;
    }
    if (outputVisibleStepIndex !== activeStepIndex) {
      return;
    }
    if (activeStepIndex >= steps.length - 1) {
      return;
    }

    const advanceTimeoutId = window.setTimeout(() => {
      setActiveStepIndex((previousIndex) => previousIndex + 1);
    }, pauseBetweenStepsMs);

    return () => window.clearTimeout(advanceTimeoutId);
  }, [
    inView,
    prefersReducedMotion,
    outputVisibleStepIndex,
    activeStepIndex,
    steps.length,
    pauseBetweenStepsMs,
  ]);

  if (steps.length === 0) {
    return null;
  }

  const renderOutputBlock = (
    body: React.ReactNode,
    tone: "default" | "muted" | "success" | "error" = "default",
    visible: boolean,
  ) => {
    const toneClass = (() => {
      switch (tone) {
        case "muted":
          return "text-white/55";
        case "success":
          return "text-accent";
        case "error":
          return "text-[color:var(--nci-color-cli-error)]";
        default:
          return "text-white/85";
      }
    })();

    return (
      <motion.pre
        initial={{ opacity: 0, y: 4 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cn(
          "mt-2 whitespace-pre-wrap text-[0.78rem] leading-relaxed",
          toneClass,
        )}
      >
        {body}
      </motion.pre>
    );
  };

  if (prefersReducedMotion) {
    return (
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "my-6 overflow-hidden rounded-2xl border border-ink/10 bg-code-surface text-code-ink shadow-[0_2px_4px_#00000038,0_18px_30px_-12px_#00000033,inset_0_1px_#ffffff14] [will-change:transform]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-tight-p text-white/65">
            <CommandLineIcon className="size-3.5" aria-hidden="true" />
            <span>{title}</span>
            {cwd ? (
              <>
                <span className="text-white/30">·</span>
                <span className="font-mono text-white/55">{cwd}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-[#FF5F56]" />
            <span className="size-2 rounded-full bg-[#FFBD2E]" />
            <span className="size-2 rounded-full bg-[#27C93F]" />
          </div>
        </div>
        <div className="space-y-5 px-4 py-3 font-mono text-[0.825rem] leading-relaxed">
          {steps.map((step, stepIndex) => (
            <div key={`${step.commandLine}-${stepIndex}`}>
              <div className="flex items-start gap-3 whitespace-pre-wrap break-all">
                <span className="select-none text-[#7A63F5]" aria-hidden="true">
                  $
                </span>
                <span className="flex-1 text-white/95">{step.commandLine}</span>
                {showInlineCommandCopy ? (
                  <button
                    type="button"
                    onClick={() => {
                      void copyCommand(step.commandLine);
                    }}
                    aria-label={copiedCommand ? "Copied" : "Copy command"}
                    className="ml-auto inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/70 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.99] active:blur-[0.5px]"
                  >
                    <CopyStatusIcon
                      copied={copiedCommand}
                      idle={ClipboardIcon}
                      className="size-3.5"
                    />
                  </button>
                ) : (
                  <span className="ml-auto shrink-0" aria-hidden="true" />
                )}
              </div>
              {renderOutputBlock(step.output, "default", true)}
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const typingCompleteForActiveStep =
    activeCommandLine.length > 0 &&
    revealedCommandPrefix.length === activeCommandLine.length;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "my-6 overflow-hidden rounded-2xl border border-ink/10 bg-code-surface text-code-ink shadow-[0_2px_4px_#00000038,0_18px_30px_-12px_#00000033,inset_0_1px_#ffffff14] [will-change:transform]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium tracking-tight-p text-white/65">
          <CommandLineIcon className="size-3.5" aria-hidden="true" />
          <span>{title}</span>
          {cwd ? (
            <>
              <span className="text-white/30">·</span>
              <span className="font-mono text-white/55">{cwd}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-[#FF5F56]" />
          <span className="size-2 rounded-full bg-[#FFBD2E]" />
          <span className="size-2 rounded-full bg-[#27C93F]" />
        </div>
      </div>
      <div
        className={cn(
          "relative space-y-5 px-4 py-3 font-mono text-[0.825rem] leading-relaxed",
          useFloatingCommandCopyLayout && "pb-11",
        )}
      >
        {steps.map((step, stepIndex) => {
          if (stepIndex > activeStepIndex) {
            return null;
          }

          const isPast = stepIndex < activeStepIndex;
          const isOutputVisible =
            isPast || outputVisibleStepIndex === stepIndex;
          const showTypingCursor =
            !isPast && outputVisibleStepIndex !== stepIndex;

          return (
            <div key={stepIndex}>
              <div
                className={cn(
                  "group/command flex items-start gap-3 whitespace-pre-wrap break-all",
                  !isPast && "relative",
                )}
              >
                <span className="select-none text-[#7A63F5]" aria-hidden="true">
                  $
                </span>
                <span className="flex-1 text-white/95">
                  {isPast ? (
                    step.commandLine
                  ) : (
                    <>
                      {revealedCommandPrefix}
                      {showTypingCursor ? (
                        <span
                          className="ml-0.5 inline-block h-4 w-1.5 translate-y-[2px] animate-[pulse_1.1s_ease-in-out_infinite] bg-white/85"
                          aria-hidden="true"
                        />
                      ) : null}
                    </>
                  )}
                </span>
                {showInlineCommandCopy ? (
                  <button
                    type="button"
                    onClick={() => {
                      void copyCommand(step.commandLine);
                    }}
                    aria-label={copiedCommand ? "Copied" : "Copy command"}
                    className="ml-auto inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/70 transition-[background-color,color,transform,filter] duration-150 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45 active:scale-[0.99] active:blur-[0.5px]"
                  >
                    <CopyStatusIcon
                      copied={copiedCommand}
                      idle={ClipboardIcon}
                      className="size-3.5"
                    />
                  </button>
                ) : (
                  <span className="ml-auto shrink-0" aria-hidden="true" />
                )}
              </div>
              {renderOutputBlock(step.output, "default", isOutputVisible)}
            </div>
          );
        })}
        {useFloatingCommandCopyLayout &&
        activeCommandLine &&
        typingCompleteForActiveStep ? (
          <TerminalFloatingCommandCopy commandText={activeCommandLine} />
        ) : null}
      </div>
    </motion.div>
  );
}

TerminalRoot.displayName = "Terminal.Root";
TerminalCommand.displayName = "Terminal.Command";
TerminalOutput.displayName = "Terminal.Output";
TerminalSequenceRoot.displayName = "Terminal.SequenceRoot";

export interface TerminalNamespace {
  Root: typeof TerminalRoot;
  Command: typeof TerminalCommand;
  Output: typeof TerminalOutput;
  SequenceRoot: typeof TerminalSequenceRoot;
}

export const Terminal: TerminalNamespace = {
  Root: TerminalRoot,
  Command: TerminalCommand,
  Output: TerminalOutput,
  SequenceRoot: TerminalSequenceRoot,
};
