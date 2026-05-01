"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type SplitButtonContextValue = {
  variant: NonNullable<VariantProps<typeof splitButtonRootVariants>["variant"]>;
  size: NonNullable<VariantProps<typeof splitButtonRootVariants>["size"]>;
  disabled?: boolean;
};

const SplitButtonContext = createContext<SplitButtonContextValue | null>(null);

function useSplitButtonContext() {
  const context = useContext(SplitButtonContext);
  if (!context) {
    throw new Error(
      "SplitButton components must be used within SplitButton.Root",
    );
  }
  return context;
}

const splitButtonRootVariants = cva(
  "inline-flex overflow-hidden rounded-3xl focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "shadow-[0_2px_4px_#00000038,0_7px_13px_-3px_#00000034,inset_0_-3px_#0003,inset_0_1px_#ffffff52] focus-within:ring-primary/35",
        accent:
          "shadow-[0_2px_4px_#0006,0_7px_13px_-3px_#0000004d,inset_0_-3px_#0003,inset_0_1px_#ffffff52] focus-within:ring-accent/35",
        outline: "border border-border focus-within:ring-primary/35",
        ghost: "focus-within:ring-primary/35",
      },
      size: {
        sm: "",
        md: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function dividerClass(
  variant: NonNullable<VariantProps<typeof splitButtonRootVariants>["variant"]>,
): string {
  switch (variant) {
    case "primary":
    case "accent":
      return "border-r border-black/15";
    case "outline":
      return "border-r border-border";
    case "ghost":
      return "border-r border-ink/10";
  }
}

function segmentVariantClass(
  variant: NonNullable<VariantProps<typeof splitButtonRootVariants>["variant"]>,
): string {
  switch (variant) {
    case "primary":
      return "bg-primary text-white hover:bg-primary/90";
    case "accent":
      return "bg-accent text-white hover:bg-accent/90";
    case "outline":
      return "bg-elevated text-ink hover:bg-elevated/90";
    case "ghost":
      return "bg-transparent text-ink hover:bg-surface/90";
  }
}

function SplitButtonRoot({
  className,
  variant,
  size,
  disabled,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof splitButtonRootVariants> & {
    disabled?: boolean;
  }) {
  const resolvedVariant = variant ?? "primary";
  const resolvedSize = size ?? "md";
  return (
    <SplitButtonContext.Provider
      value={{ variant: resolvedVariant, size: resolvedSize, disabled }}
    >
      <div
        className={cn(
          splitButtonRootVariants({
            variant: resolvedVariant,
            size: resolvedSize,
          }),
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SplitButtonContext.Provider>
  );
}

SplitButtonRoot.displayName = "SplitButton.Root";

function SplitButtonMain({
  ref,
  className,
  disabled: disabledFromProps,
  ...props
}: React.ComponentPropsWithRef<"button">) {
  const {
    variant,
    size,
    disabled: disabledFromContext,
  } = useSplitButtonContext();
  const isDisabled = disabledFromProps ?? disabledFromContext;
  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      className={cn(
        "inline-flex min-w-0 flex-1 cursor-pointer items-center justify-start font-medium whitespace-nowrap transition-[background-color,color,border-color,opacity] duration-150 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
        size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-sm",
        dividerClass(variant),
        segmentVariantClass(variant),
        className,
      )}
      {...props}
    />
  );
}

SplitButtonMain.displayName = "SplitButton.Main";

export type SplitButtonIconTriggerProps = Omit<
  React.ComponentPropsWithRef<"button">,
  "children"
> & {
  children: React.ReactNode;
};

function SplitButtonIconTrigger({
  ref,
  className,
  children,
  disabled: disabledFromProps,
  ...props
}: SplitButtonIconTriggerProps) {
  const {
    variant,
    size,
    disabled: disabledFromContext,
  } = useSplitButtonContext();
  const isDisabled = disabledFromProps ?? disabledFromContext;
  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium transition-[background-color,color,border-color,opacity] duration-150 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
        size === "sm"
          ? "h-9 min-w-9 px-0 text-sm"
          : "h-11 min-w-11 px-0 text-sm",
        segmentVariantClass(variant),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

SplitButtonIconTrigger.displayName = "SplitButton.IconTrigger";

export const SplitButton = {
  Root: SplitButtonRoot,
  Main: SplitButtonMain,
  IconTrigger: SplitButtonIconTrigger,
};
