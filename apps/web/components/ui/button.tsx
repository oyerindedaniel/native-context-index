import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap cursor-pointer rounded-3xl",
    "font-medium transition-[background-color,color,border-color,opacity] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-primary text-white focus-visible:ring-primary/35",
          "shadow-[0_2px_4px_#00000038,0_7px_13px_-3px_#00000034,inset_0_-3px_#0003,inset_0_1px_#ffffff52]",
          "hover:bg-primary/90",
        ],
        accent: [
          "bg-accent text-white focus-visible:ring-accent/35",
          "shadow-[0_2px_4px_#0006,0_7px_13px_-3px_#0000004d,inset_0_-3px_#0003,inset_0_1px_#ffffff52]",
          "hover:bg-accent/90",
        ],
        outline: [
          "border border-border bg-elevated text-ink focus-visible:ring-primary/35",
          "hover:bg-elevated/90",
        ],
        ghost: [
          "border-transparent bg-transparent text-ink focus-visible:ring-primary/35 hover:bg-surface/90",
        ],
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

Button.displayName = "Button";
