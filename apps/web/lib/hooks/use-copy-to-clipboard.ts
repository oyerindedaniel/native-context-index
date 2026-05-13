"use client";

import * as React from "react";

interface UseCopyToClipboardOptions {
  resetMs?: number;
}

interface UseCopyToClipboardResult {
  copied: boolean;
  copy: (value: string) => Promise<boolean>;
}

const DEFAULT_RESET_MS = 1500;

export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {},
): UseCopyToClipboardResult {
  const resetMs = options.resetMs ?? DEFAULT_RESET_MS;
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), resetMs);
    return () => window.clearTimeout(timer);
  }, [copied, resetMs]);

  const copy = React.useCallback(async (value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopied(false);
      return false;
    }
    // Optimistic: flip to "copied" on the same frame as the click so the
    // icon swap starts immediately. `clipboard.writeText` is async and on
    // large payloads (full page MDX, primer text) the await alone can eat
    // 15–60ms — long enough to feel laggy on a hot action. We revert only
    // if the write actually fails.
    setCopied(true);
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      setCopied(false);
      return false;
    }
  }, []);

  return { copied, copy };
}
