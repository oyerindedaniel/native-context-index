import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap cursor-pointer rounded-3xl",
    "font-medium transition-[background-color,color,border-color,opacity,box-shadow,transform,filter] duration-150 ease-out",
    "outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-60",
    "active:scale-[0.97] active:blur-[1px]",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-primary text-white focus-visible:ring-primary/35",
          "nci-shadow-btn-primary",
          "hover:bg-primary/90",
        ],
        accent: [
          "bg-accent text-white focus-visible:ring-accent/35",
          "nci-shadow-btn-accent",
          "hover:bg-accent/90",
        ],
        outline: [
          "border border-border bg-elevated text-ink focus-visible:ring-primary/35",
          "shadow-[0_1px_2px_#0000000a,inset_0_-1.5px_#0000000d,inset_0_1px_#ffffff]",
          "hover:bg-surface-hover hover:border-primary/35",
        ],
        ghost: [
          "border border-transparent bg-transparent text-ink/85 focus-visible:ring-primary/35",
          "hover:bg-surface-hover hover:text-ink",
        ],
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        icon: "h-9 w-9 p-0 [&_svg]:size-4",
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
