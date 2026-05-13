"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type AgentLoopCodeLanguage = "json" | "typescript";

interface AgentLoopCodeProps {
  code: string;
  language: AgentLoopCodeLanguage;
  className?: string;
}

export function AgentLoopCode({
  code,
  language,
  className,
}: AgentLoopCodeProps) {
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const trimmed = code.trimEnd();

    void (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const out = await codeToHtml(trimmed, {
          lang: language,
          theme: "github-dark",
        });
        if (!cancelled) {
          setHtml(out);
        }
      } catch {
        if (!cancelled) {
          setHtml(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        className={cn(
          "nci-agent-loop-code block min-w-0 max-w-full overflow-x-auto rounded-xl bg-code-surface px-4 py-3",
          className,
        )}
        // Safe by construction: `code` is passed from our own MDX/JSX
        //  and Shiki's `codeToHtml` HTML-escapes the source
        // text before wrapping it in plain <pre>/<span>.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre
      className={cn(
        "block min-w-0 max-w-full overflow-x-auto whitespace-pre rounded-xl bg-code-surface px-4 py-3 font-mono text-[0.78rem] text-white/80",
        className,
      )}
    >
      {code.trimEnd()}
    </pre>
  );
}
