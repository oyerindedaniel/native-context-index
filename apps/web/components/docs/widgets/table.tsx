import * as React from "react";
import { cn } from "@/lib/utils";

interface TableRootProps extends React.ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
}

export function TableRoot({ className, children, ...rest }: TableRootProps) {
  return (
    <div
      className={cn(
        "my-6 overflow-hidden rounded-2xl border border-border bg-elevated shadow-[0_1px_2px_#0000000a,inset_0_1px_#ffffff]",
        className,
      )}
      {...rest}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

type TableHeaderProps = React.ComponentPropsWithoutRef<"thead">;

export function TableHeader({
  className,
  children,
  ...rest
}: TableHeaderProps) {
  return (
    <thead className={cn("bg-surface/70 text-muted/85", className)} {...rest}>
      {children}
    </thead>
  );
}

type TableBodyProps = React.ComponentPropsWithoutRef<"tbody">;

export function TableBody({ className, children, ...rest }: TableBodyProps) {
  return (
    <tbody className={cn("divide-y divide-border/60", className)} {...rest}>
      {children}
    </tbody>
  );
}

type TableRowProps = React.ComponentPropsWithoutRef<"tr">;

export function TableRow({ className, children, ...rest }: TableRowProps) {
  return (
    <tr className={cn("align-top", className)} {...rest}>
      {children}
    </tr>
  );
}

interface TableHeaderCellProps extends React.ComponentPropsWithoutRef<"th"> {
  align?: "left" | "right";
}

export function TableHeaderCell({
  className,
  align = "left",
  children,
  ...rest
}: TableHeaderCellProps) {
  return (
    <th
      className={cn(
        "border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TableCellProps extends React.ComponentPropsWithoutRef<"td"> {
  variant?: "default" | "code" | "muted";
  align?: "left" | "right";
}

export function TableCell({
  className,
  variant = "default",
  align = "left",
  children,
  ...rest
}: TableCellProps) {
  const variantClass =
    variant === "code"
      ? "font-mono text-xs text-ink/85"
      : variant === "muted"
        ? "text-sm tracking-tight-p text-muted"
        : "text-sm tracking-tight-p text-ink/85";
  return (
    <td
      className={cn(
        "px-4 py-3",
        align === "right" ? "text-right" : "text-left",
        variantClass,
        "[&_code]:rounded-md [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

TableRoot.displayName = "TableRoot";
TableHeader.displayName = "TableHeader";
TableBody.displayName = "TableBody";
TableRow.displayName = "TableRow";
TableHeaderCell.displayName = "TableHeaderCell";
TableCell.displayName = "TableCell";

export interface TableNamespace {
  Root: typeof TableRoot;
  Header: typeof TableHeader;
  Body: typeof TableBody;
  Row: typeof TableRow;
  HeaderCell: typeof TableHeaderCell;
  Cell: typeof TableCell;
}

export const Table: TableNamespace = {
  Root: TableRoot,
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  HeaderCell: TableHeaderCell,
  Cell: TableCell,
};
