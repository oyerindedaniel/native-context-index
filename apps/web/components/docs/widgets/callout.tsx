import * as React from "react";
import {
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import type { IconComponent } from "@/lib/docs/icons";

type CalloutVariant = "info" | "tip" | "warning" | "success";

interface CalloutRootProps {
  variant?: CalloutVariant;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<
  CalloutVariant,
  { container: string; iconWrap: string; icon: IconComponent }
> = {
  info: {
    container: "border-primary/25 bg-primary/[0.05] text-ink",
    iconWrap: "bg-primary/10 text-primary",
    icon: InformationCircleIcon,
  },
  tip: {
    container: "border-accent/25 bg-accent/[0.05] text-ink",
    iconWrap: "bg-accent/10 text-accent",
    icon: LightBulbIcon,
  },
  warning: {
    container: "border-amber-300/40 bg-amber-50/70 text-ink",
    iconWrap: "bg-amber-100 text-amber-700",
    icon: ExclamationTriangleIcon,
  },
  success: {
    container: "border-emerald-300/40 bg-emerald-50/70 text-ink",
    iconWrap: "bg-emerald-100 text-emerald-700",
    icon: ShieldCheckIcon,
  },
};

export function CalloutRoot({
  variant = "info",
  className,
  children,
}: CalloutRootProps) {
  const { container, iconWrap, icon: Icon } = variantStyles[variant];

  return (
    <aside
      role="note"
      className={cn(
        "my-6 flex gap-4 rounded-2xl border px-5 py-4",
        container,
        className,
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          iconWrap,
        )}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </aside>
  );
}

interface CalloutTitleProps {
  className?: string;
  children: React.ReactNode;
}

export function CalloutTitle({ className, children }: CalloutTitleProps) {
  return (
    <p
      className={cn("text-sm font-semibold tracking-tight text-ink", className)}
    >
      {children}
    </p>
  );
}

interface CalloutBodyProps {
  className?: string;
  children: React.ReactNode;
}

export function CalloutBody({ className, children }: CalloutBodyProps) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed tracking-tight-p text-ink/85 [&>p]:my-0 [&>p+p]:mt-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

CalloutRoot.displayName = "CalloutRoot";
CalloutTitle.displayName = "CalloutTitle";
CalloutBody.displayName = "CalloutBody";

export const Callout = {
  Root: CalloutRoot,
  Title: CalloutTitle,
  Body: CalloutBody,
};
