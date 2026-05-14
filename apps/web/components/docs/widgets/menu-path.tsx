import * as React from "react";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

interface MenuPathRootProps extends React.HTMLAttributes<HTMLSpanElement> {
  ariaLabel?: string;
  leadingIcon?: React.ReactNode;
  trailingChevron?: boolean;
}

export function MenuPathRoot({
  ariaLabel,
  className,
  leadingIcon,
  trailingChevron = false,
  children,
  ...rest
}: MenuPathRootProps) {
  const items = React.Children.toArray(children).filter(React.isValidElement);

  return (
    <span
      role="group"
      aria-label={ariaLabel ?? "Menu path"}
      className={cn(
        "nci-menu-path inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-border/55 bg-surface/55 px-2 py-0.5 align-baseline tracking-tight-p",
        className,
      )}
      {...rest}
    >
      {leadingIcon ? (
        <>
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center text-muted"
          >
            {leadingIcon}
          </span>
          <Chevron />
        </>
      ) : null}
      {items.map((child, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={index}>
            {child}
            {!isLast || trailingChevron ? <Chevron /> : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}

function Chevron() {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      className="size-3 shrink-0 text-muted/55"
    />
  );
}

interface MenuPathSegmentProps extends React.HTMLAttributes<HTMLSpanElement> {
  current?: boolean;
}

export function MenuPathSegment({
  className,
  current,
  children,
  ...rest
}: MenuPathSegmentProps) {
  return (
    <span
      aria-current={current ? "true" : undefined}
      className={cn(
        "nci-menu-path-segment inline-flex items-baseline text-[0.85em] font-medium tracking-tight-p text-muted",
        current && "text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

MenuPathRoot.displayName = "MenuPath.Root";
MenuPathSegment.displayName = "MenuPath.Segment";

export interface MenuPathNamespace {
  Root: typeof MenuPathRoot;
  Segment: typeof MenuPathSegment;
}

export const MenuPath: MenuPathNamespace = {
  Root: MenuPathRoot,
  Segment: MenuPathSegment,
};
