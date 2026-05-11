import * as React from "react";
import { cn } from "@/lib/utils";

interface PageEyebrowProps {
  className?: string;
  children: React.ReactNode;
}

export function PageEyebrow({ className, children }: PageEyebrowProps) {
  return (
    <span
      className={cn(
        "text-[0.68rem] font-medium uppercase tracking-[0.13em] text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface PageLedeProps {
  className?: string;
  children: React.ReactNode;
}

export function PageLede({ className, children }: PageLedeProps) {
  return (
    <div
      className={cn(
        "max-w-2xl text-lg leading-relaxed tracking-tight-p text-muted sm:text-xl",
        "[&_p]:m-0 [&_p]:text-inherit [&_p]:leading-inherit [&_p]:tracking-inherit",
        className,
      )}
    >
      {children}
    </div>
  );
}
