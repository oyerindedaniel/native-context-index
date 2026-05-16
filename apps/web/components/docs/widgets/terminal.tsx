"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ClipboardIcon, CommandLineIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { mergeRefs } from "@/lib/merge-refs";
import { cn } from "@/lib/utils";
import {
  extractSequenceSteps,
  partitionTerminalLayout,
  resolveTerminalCommandCopyLayout,
  TERMINAL_BODY_DISPLAY_NAME,
  TERMINAL_CHROME_DISPLAY_NAME,
  TERMINAL_SEQUENCE_STEP_DISPLAY_NAME,
  TERMINAL_TAB_BAR_DISPLAY_NAME,
  type ParsedSequenceStep,
  type TerminalBodyProps,
  type TerminalChromeProps,
  type TerminalCommandCopyPlacement,
  type TerminalSequenceStepProps,
} from "@/components/docs/widgets/terminal-layout";

type UseInViewOptionsArg = NonNullable<Parameters<typeof useInView>[1]>;
export type TerminalInViewAmount = NonNullable<UseInViewOptionsArg["amount"]>;

export interface TerminalTabItem {
  readonly id: string;
  readonly label: string;
  /** Active tab shows a live dot when true (default true). */
  readonly showLiveDot?: boolean;
}

type TerminalTabBarProps = React.ComponentProps<"div"> & {
  readonly tabs: readonly TerminalTabItem[];
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly ariaLabel?: string;
};

type TerminalMode = "single" | "sequence";

interface TerminalShellContextValue {
  readonly mode: TerminalMode;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly useFloatingCommandCopyLayout: boolean;
  readonly showInlineCommandCopy: boolean;
  readonly chromeless: boolean;
}

const TerminalShellContext =
  React.createContext<TerminalShellContextValue | null>(null);

function useTerminalShellContext(): TerminalShellContextValue {
  const context = React.useContext(TerminalShellContext);
  if (!context) {
    throw new Error(
      "Terminal shell components must be used inside Terminal.Root or Terminal.Sequence.Root",
    );
  }
  return context;
}

interface TerminalSingleContextValue {
  readonly command: string;
  readonly registerCommand: (command: string) => void;
  readonly isPlaying: boolean;
  readonly revealedCommand: string;
  readonly isCommandComplete: boolean;
  readonly shouldRenderOutput: boolean;
  readonly showInlineCommandCopy: boolean;
}

const TerminalSingleContext =
  React.createContext<TerminalSingleContextValue | null>(null);

function useTerminalSingleContext(): TerminalSingleContextValue {
  const context = React.useContext(TerminalSingleContext);
  if (!context) {
    throw new Error(
      "Terminal.Command and Terminal.Output must be used inside Terminal.Root",
    );
  }
  return context;
}

interface TerminalSequenceContextValue {
  readonly activeCommandLine: string;
  readonly showFloatingCommandCopy: boolean;
}

const TerminalSequenceContext =
  React.createContext<TerminalSequenceContextValue | null>(null);

const DEFAULT_TYPE_MS = 22;
const DEFAULT_OUTPUT_DELAY_MS = 280;
const DEFAULT_PAUSE_BETWEEN_STEPS_MS = 520;

function TerminalWindowChrome({
  title,
  cwd,
  className,
  ...props
}: TerminalChromeProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="size-2 rounded-full bg-[#FF5F56]" />
        <span className="size-2 rounded-full bg-[#FFBD2E]" />
        <span className="size-2 rounded-full bg-[#27C93F]" />
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium tracking-tight-p text-white/55">
        <CommandLineIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{title ?? "nci"}</span>
        {cwd ? (
          <>
            <span className="text-white/30">·</span>
            <span className="truncate font-mono text-white/50">{cwd}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TerminalChrome({
  title = "nci",
  cwd,
  className,
  ...props
}: TerminalChromeProps) {
  return (
    <TerminalWindowChrome
      title={title}
      cwd={cwd}
      className={className}
      {...props}
    />
  );
}
TerminalChrome.displayName = TERMINAL_CHROME_DISPLAY_NAME;

function TerminalBody({ className, children, ...props }: TerminalBodyProps) {
  const { mode, useFloatingCommandCopyLayout } = useTerminalShellContext();

  return (
    <div
      className={cn(
        "relative min-h-0 font-mono text-[0.825rem] leading-relaxed",
        mode === "sequence" ? "space-y-5 px-4 py-3" : "px-4 py-3",
        useFloatingCommandCopyLayout && "pb-11",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
TerminalBody.displayName = TERMINAL_BODY_DISPLAY_NAME;

function TerminalTabBar({
  tabs,
  activeTabId,
  onTabChange,
  className,
  ariaLabel = "Terminal sessions",
  ...props
}: TerminalTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-white/5 bg-[#0c0e13] px-3 py-2",
        className,
      )}
      {...props}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const showLiveDot = tab.showLiveDot !== false;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium tracking-tight outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#7A63F5]/45",
              isActive
                ? "bg-white/10 text-white/92"
                : "text-white/45 hover:bg-white/[0.04] hover:text-white/70",
            )}
          >
            {isActive && showLiveDot ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-[#5a9cf5] shadow-[0_0_6px_#5a9cf580]"
                aria-hidden="true"
              />
            ) : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
TerminalTabBar.displayName = TERMINAL_TAB_BAR_DISPLAY_NAME;

function TerminalFloatingCommandCopy({
  commandText,
}: {
  readonly commandText: string;
}) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-3 z-10 flex justify-end">
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
TerminalFloatingCommandCopy.displayName = "Terminal.Copy";

type TerminalShellProps = React.ComponentProps<"div"> & {
  readonly children: React.ReactNode;
  readonly chromeless?: boolean;
};

function TerminalShell({
  children,
  className,
  chromeless = false,
  ref,
  ...props
}: TerminalShellProps) {
  const { containerRef, chromeless: chromelessFromContext } =
    useTerminalShellContext();

  return (
    <div
      ref={mergeRefs(containerRef, ref)}
      className={cn(
        "relative flex flex-col overflow-hidden",
        !chromeless &&
          !chromelessFromContext &&
          "my-6 rounded-2xl border border-ink/10 bg-code-surface text-code-ink shadow-[0_2px_4px_#00000038,0_18px_30px_-12px_#00000033,inset_0_1px_#ffffff14]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function TerminalShellFloatingCopy() {
  const { mode, useFloatingCommandCopyLayout } = useTerminalShellContext();
  const single = React.useContext(TerminalSingleContext);
  const sequence = React.useContext(TerminalSequenceContext);

  if (!useFloatingCommandCopyLayout) {
    return null;
  }

  if (mode === "single" && single?.isCommandComplete && single.command) {
    return <TerminalFloatingCommandCopy commandText={single.command} />;
  }

  if (mode === "sequence" && sequence?.showFloatingCommandCopy) {
    return (
      <TerminalFloatingCommandCopy commandText={sequence.activeCommandLine} />
    );
  }

  return null;
}

type TerminalRootProps = Omit<React.ComponentProps<"div">, "children"> & {
  readonly children: React.ReactNode;
  readonly typeMs?: number;
  readonly outputDelayMs?: number;
  /**
   * `floating`: single copy control pinned to the bottom-right of the shell (home
   * cinema). Inline copy per command is used when reduced motion is on.
   */
  readonly commandCopyPlacement?: TerminalCommandCopyPlacement;
  readonly inViewAmount?: TerminalInViewAmount;
  /** Docs shorthand when omitting `<Terminal.Chrome />`. */
  readonly title?: string;
  readonly cwd?: string;
};

function TerminalRoot({
  className,
  title = "nci",
  cwd,
  typeMs = DEFAULT_TYPE_MS,
  outputDelayMs = DEFAULT_OUTPUT_DELAY_MS,
  commandCopyPlacement = "inline",
  inViewAmount = 0.4,
  children,
  ref,
  ...shellProps
}: TerminalRootProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inViewOptions = React.useMemo(
    () => ({ once: true as const, amount: inViewAmount }),
    [inViewAmount],
  );
  const inView = useInView(containerRef, inViewOptions);
  const prefersReducedMotion = useReducedMotion() === true;
  const { showInlineCommandCopy, useFloatingCommandCopyLayout } =
    resolveTerminalCommandCopyLayout(
      commandCopyPlacement,
      prefersReducedMotion,
    );

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

  const singleValue = React.useMemo<TerminalSingleContextValue>(
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

  const layout = partitionTerminalLayout(children);
  const chrome = layout.chrome ?? <TerminalChrome title={title} cwd={cwd} />;
  const tabBar = layout.tabBar;
  const body =
    layout.body ??
    (layout.loose.length > 0 ? (
      <TerminalBody>{layout.loose}</TerminalBody>
    ) : (
      <TerminalBody />
    ));

  const shellValue = React.useMemo<TerminalShellContextValue>(
    () => ({
      mode: "single",
      containerRef,
      useFloatingCommandCopyLayout,
      showInlineCommandCopy,
      chromeless: false,
    }),
    [useFloatingCommandCopyLayout, showInlineCommandCopy],
  );

  return (
    <TerminalShellContext.Provider value={shellValue}>
      <TerminalSingleContext.Provider value={singleValue}>
        <TerminalShell className={className} ref={ref} {...shellProps}>
          {chrome}
          {tabBar}
          {body}
          <TerminalShellFloatingCopy />
        </TerminalShell>
      </TerminalSingleContext.Provider>
    </TerminalShellContext.Provider>
  );
}
TerminalRoot.displayName = "Terminal.Root";

type TerminalCommandProps = Omit<React.ComponentProps<"div">, "children"> & {
  readonly children: string;
  readonly prompt?: string;
};

function TerminalCommand({
  prompt = "$",
  children,
  className,
  ...props
}: TerminalCommandProps) {
  const {
    registerCommand,
    revealedCommand,
    isPlaying,
    isCommandComplete,
    showInlineCommandCopy,
  } = useTerminalSingleContext();
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
      {...props}
    >
      <span className="select-none text-[#7A63F5]" aria-hidden="true">
        {prompt}
      </span>
      <span className="flex-1 text-white/95">
        {revealedCommand}
        {showCursor ? (
          <span
            className="ml-0.5 inline-block h-4 w-1.5 translate-y-[2px] animate-[pulse_1.1s_ease-in-out_infinite] bg-white/85 motion-reduce:animate-none"
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
TerminalCommand.displayName = "Terminal.Command";

type TerminalOutputProps = React.ComponentProps<typeof motion.pre> & {
  readonly tone?: "default" | "muted" | "success" | "error";
};

function TerminalOutput({
  children,
  className,
  tone = "default",
  ...props
}: TerminalOutputProps) {
  const { shouldRenderOutput } = useTerminalSingleContext();
  const reduceMotion = useReducedMotion() === true;

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
      initial={false}
      animate={
        shouldRenderOutput
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: reduceMotion ? 0 : 4 }
      }
      transition={{
        duration: reduceMotion ? 0 : 0.25,
        ease: "easeOut",
      }}
      className={cn(
        "mt-2 whitespace-pre-wrap text-[0.78rem] leading-relaxed",
        toneClass,
        className,
      )}
      {...props}
    >
      {children}
    </motion.pre>
  );
}
TerminalOutput.displayName = "Terminal.Output";

/**
 * Declarative step slot for `Terminal.Sequence.Root`. Renders nothing; the root
 * reads `commandLine` / children via `extractSequenceSteps` (see home CLI cinema).
 */
function TerminalSequenceStep(props: TerminalSequenceStepProps) {
  void props;
  return null;
}
TerminalSequenceStep.displayName = TERMINAL_SEQUENCE_STEP_DISPLAY_NAME;

type TerminalSequenceRootProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  readonly children: React.ReactNode;
  readonly typeMs?: number;
  readonly outputDelayMs?: number;
  readonly pauseBetweenStepsMs?: number;
  readonly commandCopyPlacement?: TerminalCommandCopyPlacement;
  readonly inViewAmount?: TerminalInViewAmount;
  readonly chromeless?: boolean;
  /** Docs shorthand when omitting `<Terminal.Chrome />`. */
  readonly title?: string;
  readonly cwd?: string;
};

function TerminalSequenceAnimatedBody({
  steps,
  typeMs,
  outputDelayMs,
  pauseBetweenStepsMs,
  inViewAmount = 0.35,
}: {
  readonly steps: readonly ParsedSequenceStep[];
  readonly typeMs: number;
  readonly outputDelayMs: number;
  readonly pauseBetweenStepsMs: number;
  readonly inViewAmount?: TerminalInViewAmount;
}) {
  const { containerRef, showInlineCommandCopy, useFloatingCommandCopyLayout } =
    useTerminalShellContext();
  const inViewOptions = React.useMemo(
    () => ({ once: true as const, amount: inViewAmount }),
    [inViewAmount],
  );
  const inView = useInView(containerRef, inViewOptions);
  const prefersReducedMotion = useReducedMotion() === true;
  const showInline = showInlineCommandCopy;

  const [activeStepIndex, setActiveStepIndex] = React.useState(0);
  const [revealedCommandPrefix, setRevealedCommandPrefix] = React.useState("");
  const [outputVisibleStepIndex, setOutputVisibleStepIndex] = React.useState<
    number | null
  >(null);

  const { copied: copiedCommand, copy: copyCommand } = useCopyToClipboard();

  const activeStep = steps[activeStepIndex];
  const activeCommandLine = activeStep?.commandLine ?? "";

  React.useEffect(() => {
    if (!inView || steps.length === 0 || !activeCommandLine) {
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

  const typingCompleteForActiveStep =
    activeCommandLine.length > 0 &&
    revealedCommandPrefix.length === activeCommandLine.length;

  const sequenceValue = React.useMemo<TerminalSequenceContextValue>(
    () => ({
      activeCommandLine,
      showFloatingCommandCopy:
        useFloatingCommandCopyLayout &&
        activeCommandLine.length > 0 &&
        (prefersReducedMotion || typingCompleteForActiveStep),
    }),
    [
      activeCommandLine,
      useFloatingCommandCopyLayout,
      prefersReducedMotion,
      typingCompleteForActiveStep,
    ],
  );

  const renderOutputBlock = (
    body: React.ReactNode,
    tone: ParsedSequenceStep["tone"],
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
        initial={false}
        animate={
          visible
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: prefersReducedMotion ? 0 : 4 }
        }
        transition={{
          duration: prefersReducedMotion ? 0 : 0.25,
          ease: "easeOut",
        }}
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
      <TerminalSequenceContext.Provider value={sequenceValue}>
        {steps.map((step, stepIndex) => (
          <div key={`${step.commandLine}-${stepIndex}`}>
            <div className="flex items-start gap-3 whitespace-pre-wrap break-all">
              <span className="select-none text-[#7A63F5]" aria-hidden="true">
                $
              </span>
              <span className="flex-1 text-white/95">{step.commandLine}</span>
              {showInline ? (
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
            {renderOutputBlock(step.output, step.tone, true)}
          </div>
        ))}
      </TerminalSequenceContext.Provider>
    );
  }

  return (
    <TerminalSequenceContext.Provider value={sequenceValue}>
      {steps.map((step, stepIndex) => {
        if (stepIndex > activeStepIndex) {
          return null;
        }

        const isPast = stepIndex < activeStepIndex;
        const isOutputVisible = isPast || outputVisibleStepIndex === stepIndex;
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
                        className="ml-0.5 inline-block h-4 w-1.5 translate-y-[2px] animate-[pulse_1.1s_ease-in-out_infinite] bg-white/85 motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : null}
                  </>
                )}
              </span>
              {showInline ? (
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
            {renderOutputBlock(step.output, step.tone, isOutputVisible)}
          </div>
        );
      })}
    </TerminalSequenceContext.Provider>
  );
}

function TerminalSequenceRoot({
  className,
  title = "nci",
  cwd,
  typeMs = DEFAULT_TYPE_MS,
  outputDelayMs = DEFAULT_OUTPUT_DELAY_MS,
  pauseBetweenStepsMs = DEFAULT_PAUSE_BETWEEN_STEPS_MS,
  commandCopyPlacement = "inline",
  inViewAmount = 0.35,
  chromeless = false,
  children,
  ref,
  ...shellProps
}: TerminalSequenceRootProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  const { showInlineCommandCopy, useFloatingCommandCopyLayout } =
    resolveTerminalCommandCopyLayout(
      commandCopyPlacement,
      prefersReducedMotion,
    );

  const layout = partitionTerminalLayout(children);
  const chrome = layout.chrome ?? <TerminalChrome title={title} cwd={cwd} />;
  const tabBar = layout.tabBar;

  const bodyFromLayout = layout.body;
  const stepsFromChildren = bodyFromLayout
    ? extractSequenceSteps(bodyFromLayout.props.children)
    : extractSequenceSteps(layout.loose);

  const steps = stepsFromChildren;

  const shellValue = React.useMemo<TerminalShellContextValue>(
    () => ({
      mode: "sequence",
      containerRef,
      useFloatingCommandCopyLayout,
      showInlineCommandCopy,
      chromeless,
    }),
    [useFloatingCommandCopyLayout, showInlineCommandCopy, chromeless],
  );

  if (steps.length === 0) {
    return null;
  }

  const bodyClassNameMerged = bodyFromLayout?.props.className;

  const animatedBody = (
    <TerminalSequenceAnimatedBody
      steps={steps}
      typeMs={typeMs}
      outputDelayMs={outputDelayMs}
      pauseBetweenStepsMs={pauseBetweenStepsMs}
      inViewAmount={inViewAmount}
    />
  );

  const body = (
    <TerminalBody className={bodyClassNameMerged}>{animatedBody}</TerminalBody>
  );

  return (
    <TerminalShellContext.Provider value={shellValue}>
      <TerminalShell
        className={className}
        chromeless={chromeless}
        ref={ref}
        {...shellProps}
      >
        {chrome}
        {tabBar}
        {body}
        <TerminalShellFloatingCopy />
      </TerminalShell>
    </TerminalShellContext.Provider>
  );
}
TerminalSequenceRoot.displayName = "Terminal.Sequence.Root";

export type {
  TerminalBodyProps,
  TerminalChromeProps,
  TerminalCommandCopyPlacement,
  TerminalSequenceStepProps,
} from "@/components/docs/widgets/terminal-layout";

export {
  TerminalRoot,
  TerminalChrome,
  TerminalTabBar,
  TerminalBody,
  TerminalCommand,
  TerminalOutput,
  TerminalSequenceRoot,
  TerminalSequenceStep,
  TerminalFloatingCommandCopy,
};

export interface TerminalNamespace {
  Root: typeof TerminalRoot;
  Chrome: typeof TerminalChrome;
  TabBar: typeof TerminalTabBar;
  Body: typeof TerminalBody;
  Command: typeof TerminalCommand;
  Output: typeof TerminalOutput;
  Copy: typeof TerminalFloatingCommandCopy;
  SequenceRoot: typeof TerminalSequenceRoot;
  Sequence: {
    Root: typeof TerminalSequenceRoot;
    Step: typeof TerminalSequenceStep;
  };
}

export const Terminal: TerminalNamespace = {
  Root: TerminalRoot,
  Chrome: TerminalChrome,
  TabBar: TerminalTabBar,
  Body: TerminalBody,
  Command: TerminalCommand,
  Output: TerminalOutput,
  Copy: TerminalFloatingCommandCopy,
  SequenceRoot: TerminalSequenceRoot,
  Sequence: {
    Root: TerminalSequenceRoot,
    Step: TerminalSequenceStep,
  },
};
