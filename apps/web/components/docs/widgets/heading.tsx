"use client";

import * as React from "react";
import { LinkIcon } from "@heroicons/react/20/solid";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { cn } from "@/lib/utils";

type HeadingLevel = 2 | 3 | 4;

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: HeadingLevel;
  id?: string;
}

const SINGLE_VS_DOUBLE_MS = 280;

const LEVEL_CLASS: Record<HeadingLevel, string> = {
  2: "text-2xl font-semibold leading-tight tracking-tight-sub text-ink mt-16 mb-4",
  3: "text-xl font-semibold tracking-tight-sub text-ink mt-10 mb-3",
  4: "text-base font-semibold tracking-tight-p text-ink mt-8 mb-2",
};

export function Heading({
  level,
  id,
  className,
  children,
  ...rest
}: HeadingProps) {
  const { copied, copy } = useCopyToClipboard();
  const clickTimerRef = React.useRef<number | null>(null);

  const clearPendingClick = React.useCallback(() => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearPendingClick, [clearPendingClick]);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLHeadingElement>) => {
      if (!id) {
        return;
      }
      // Don't hijack clicks on nested links, buttons, code blocks, etc.
      const interactive = (event.target as HTMLElement | null)?.closest(
        "a, button, input, textarea, select, [role='button']",
      );
      if (interactive && interactive !== event.currentTarget) {
        return;
      }

      // `detail >= 2` is the actual double-click — `dblclick` is unreliable here.
      if (event.detail >= 2) {
        clearPendingClick();
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        void copy(url);
        return;
      }

      // If a previous single-click is still pending, a second click arrived too
      // soon — cancel the timer; the `detail >= 2` branch above runs next.
      if (clickTimerRef.current !== null) {
        clearPendingClick();
        return;
      }

      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#${id}`,
        );
      }, SINGLE_VS_DOUBLE_MS);
    },
    [id, clearPendingClick, copy],
  );

  const interactive = Boolean(id);

  const headingProps: React.HTMLAttributes<HTMLHeadingElement> & {
    id?: string;
  } = {
    id,
    onClick: interactive ? handleClick : undefined,
    className: cn(
      "group",
      LEVEL_CLASS[level],
      interactive && "cursor-pointer select-none",
      className,
    ),
    ...rest,
  };

  const content = (
    <>
      {children}
      {interactive ? (
        <span
          aria-hidden="true"
          className={cn(
            "ml-2 inline-flex h-6 w-6 shrink-0 -translate-y-px items-center justify-center rounded-md text-muted opacity-0 transition-[opacity,color] duration-150 ease-out group-hover:text-primary group-hover:opacity-100",
            copied && "text-accent opacity-100 group-hover:text-accent",
          )}
        >
          <CopyStatusIcon copied={copied} idle={LinkIcon} className="h-4 w-4" />
        </span>
      ) : null}
    </>
  );

  if (level === 2) {
    return <h2 {...headingProps}>{content}</h2>;
  }
  if (level === 3) {
    return <h3 {...headingProps}>{content}</h3>;
  }
  return <h4 {...headingProps}>{content}</h4>;
}
