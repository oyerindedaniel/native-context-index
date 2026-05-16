import * as React from "react";
import type { ComponentProps } from "react";

export const TERMINAL_CHROME_DISPLAY_NAME = "Terminal.Chrome";
export const TERMINAL_BODY_DISPLAY_NAME = "Terminal.Body";
export const TERMINAL_TAB_BAR_DISPLAY_NAME = "Terminal.TabBar";
export const TERMINAL_SEQUENCE_STEP_DISPLAY_NAME = "Terminal.Sequence.Step";

/** Where the per-command copy control is rendered. */
export type TerminalCommandCopyPlacement = "inline" | "floating";

export function resolveTerminalCommandCopyLayout(
  placement: TerminalCommandCopyPlacement,
  prefersReducedMotion: boolean,
) {
  return {
    showInlineCommandCopy: placement === "inline" || prefersReducedMotion,
    useFloatingCommandCopyLayout:
      placement === "floating" && !prefersReducedMotion,
  } as const;
}

export interface PartitionedTerminalLayout {
  readonly chrome: React.ReactElement | null;
  readonly tabBar: React.ReactNode;
  readonly body: React.ReactElement<TerminalBodyProps> | null;
  readonly loose: React.ReactNode[];
}

/** Monospace scrollport; renders a native `<div>`. */
export type TerminalBodyProps = ComponentProps<"div">;

/** Title bar; renders a native `<div>`. */
export type TerminalChromeProps = ComponentProps<"div"> & {
  readonly title?: string;
  readonly cwd?: string;
};

/** Marker parsed from `<Terminal.Body>` children; does not mount DOM. */
export type TerminalSequenceStepProps = Pick<
  ComponentProps<"div">,
  "children"
> & {
  readonly commandLine: string;
  readonly tone?: "default" | "muted" | "success" | "error";
};

function getComponentDisplayName(type: unknown): string | undefined {
  if (typeof type === "function" || typeof type === "object") {
    return (type as { displayName?: string }).displayName;
  }
  return undefined;
}

export function partitionTerminalLayout(
  children: React.ReactNode,
): PartitionedTerminalLayout {
  let chrome: React.ReactElement | null = null;
  let tabBar: React.ReactNode = null;
  let body: React.ReactElement<TerminalBodyProps> | null = null;
  const loose: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      if (child != null) {
        loose.push(child);
      }
      return;
    }

    const displayName = getComponentDisplayName(child.type);

    if (displayName === TERMINAL_CHROME_DISPLAY_NAME) {
      chrome = child;
      return;
    }

    if (displayName === TERMINAL_BODY_DISPLAY_NAME) {
      body = child as React.ReactElement<TerminalBodyProps>;
      return;
    }

    if (displayName === TERMINAL_TAB_BAR_DISPLAY_NAME) {
      tabBar = child;
      return;
    }

    loose.push(child);
  });

  return { chrome, tabBar, body, loose };
}

export interface ParsedSequenceStep {
  readonly commandLine: string;
  readonly output: React.ReactNode;
  readonly tone: "default" | "muted" | "success" | "error";
}

export function extractSequenceSteps(
  children: React.ReactNode,
): readonly ParsedSequenceStep[] {
  const steps: ParsedSequenceStep[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }
    if (
      getComponentDisplayName(child.type) !==
      TERMINAL_SEQUENCE_STEP_DISPLAY_NAME
    ) {
      return;
    }
    const props = child.props as TerminalSequenceStepProps;
    steps.push({
      commandLine: props.commandLine,
      output: props.children ?? null,
      tone: props.tone ?? "default",
    });
  });

  return steps;
}
