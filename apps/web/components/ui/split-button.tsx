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
  "inline-flex overflow-hidden rounded-3xl transition-[box-shadow,border-color] duration-150 ease-out",
  {
    variants: {
      variant: {
        primary: "nci-shadow-btn-primary",
        accent: "nci-shadow-btn-accent",
        outline:
          "border border-border bg-elevated shadow-[0_1px_2px_#0000000a,inset_0_-1.5px_#0000000d,inset_0_1px_#ffffff] hover:border-primary/35",
        ghost: "border border-transparent",
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
      return "border-x border-white/30";
    case "outline":
      return "border-x border-border";
    case "ghost":
      return "border-x border-ink/10";
  }
}

function segmentVariantClass(
  variant: NonNullable<VariantProps<typeof splitButtonRootVariants>["variant"]>,
): string {
  // Inset bevel (top highlight + bottom darken) lives on the colored segments,
  // not the root: filled segments paint on top of the root and would otherwise
  // hide the wrapper's insets. Outline/ghost segments are transparent, so the
  // root's own inset highlight already shows through and no segment bevel is
  // needed.
  switch (variant) {
    case "primary":
      return "bg-primary text-white hover:bg-primary/90 shadow-[inset_0_1px_rgb(255_255_255/0.38),inset_0_-2px_rgb(0_0_0/0.12)]";
    case "accent":
      return "bg-accent text-white hover:bg-accent/90 shadow-[inset_0_1px_rgb(255_255_255/0.38),inset_0_-2px_rgb(0_0_0/0.14)]";
    case "outline":
      return "bg-transparent text-ink hover:bg-surface-hover";
    case "ghost":
      return "bg-transparent text-ink/85 hover:bg-surface-hover hover:text-ink";
  }
}

function segmentFocusVisibleClass(
  variant: NonNullable<VariantProps<typeof splitButtonRootVariants>["variant"]>,
): string {
  switch (variant) {
    case "primary":
      return "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/35";
    case "accent":
      return "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent/35";
    case "outline":
      return "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/35";
    case "ghost":
      return "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/35";
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
        "inline-flex min-w-0 flex-1 cursor-pointer items-center justify-start font-medium whitespace-nowrap transition-[background-color,color,border-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-60",
        size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-sm",
        dividerClass(variant),
        segmentVariantClass(variant),
        segmentFocusVisibleClass(variant),
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
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium transition-[background-color,color,border-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
        size === "sm"
          ? "h-9 min-w-9 px-0 text-sm"
          : "h-11 min-w-11 px-0 text-sm",
        segmentVariantClass(variant),
        segmentFocusVisibleClass(variant),
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
