"use client";

import * as React from "react";
import { ClipboardIcon, CheckIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

interface CodeBlockShellProps extends React.ComponentPropsWithoutRef<"pre"> {
  children: React.ReactNode;
}

export function CodeBlockShell({
  className,
  children,
  ...rest
}: CodeBlockShellProps) {
  const codeRef = React.useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopyToClipboard();
  const StatusIcon = copied ? CheckIcon : ClipboardIcon;

  const handleCopy = React.useCallback(() => {
    const value = codeRef.current?.innerText ?? "";
    void copy(value.replace(/\n$/, ""));
  }, [copy]);

  return (
    <pre className={cn("nci-panel-stack relative my-6", className)} {...rest}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className={cn(
          "absolute right-3 top-3 z-10 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-elevated/95 text-muted/85 shadow-[0_1px_2px_#0000000a] backdrop-blur-sm transition-[background-color,color,border-color,transform] duration-150 ease-out hover:border-primary/35 hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:scale-[0.97]",
        )}
      >
        <StatusIcon
          className={cn("h-3.5 w-3.5", copied ? "text-accent" : "text-current")}
          aria-hidden="true"
        />
      </button>
      <div
        ref={codeRef}
        className="nci-panel-stack-inner overflow-x-auto px-5 py-4 font-mono text-sm leading-relaxed"
      >
        {children}
      </div>
    </pre>
  );
}
