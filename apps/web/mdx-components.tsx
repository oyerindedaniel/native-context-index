import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";
import { CodeBlockShell } from "@/components/docs/widgets/code-block";
import { Heading } from "@/components/docs/widgets/heading";
import {
  MenuPathRoot,
  MenuPathSegment,
} from "@/components/docs/widgets/menu-path";

function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//.test(href) || href.startsWith("mailto:");
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ className, children, ...rest }) => (
      <h1
        className={cn(
          "font-semibold leading-tight tracking-tight-sub text-ink mt-2 mb-3 text-[1.75rem]",
          className,
        )}
        {...rest}
      >
        {children}
      </h1>
    ),
    h2: ({ className, children, id, ...rest }) => (
      <Heading level={2} id={id} className={className} {...rest}>
        {children}
      </Heading>
    ),
    h3: ({ className, children, id, ...rest }) => (
      <Heading level={3} id={id} className={className} {...rest}>
        {children}
      </Heading>
    ),
    h4: ({ className, children, id, ...rest }) => (
      <Heading level={4} id={id} className={className} {...rest}>
        {children}
      </Heading>
    ),
    p: ({ className, children, ...rest }) => (
      <p
        className={cn(
          "text-base leading-relaxed tracking-tight-p text-muted my-4",
          className,
        )}
        {...rest}
      >
        {children}
      </p>
    ),
    a: ({ className, children, href, ...rest }) => {
      const resolvedHref = href ?? "#";
      const external = isExternalHref(resolvedHref);
      const baseClass = cn(
        "font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-dark hover:decoration-primary/70",
        className,
      );
      if (external) {
        return (
          <a
            href={resolvedHref}
            target="_blank"
            rel="noopener noreferrer"
            className={baseClass}
            {...rest}
          >
            <span className="inline-flex items-baseline gap-1">
              {children}
              <ArrowTopRightOnSquareIcon
                className="h-3 w-3 self-center text-primary/70"
                aria-hidden="true"
              />
            </span>
          </a>
        );
      }
      return (
        <Link href={resolvedHref} className={baseClass} {...rest}>
          {children}
        </Link>
      );
    },
    ul: ({ className, children, ...rest }) => (
      <ul
        className={cn(
          "my-4 ml-1 flex flex-col gap-2 text-base leading-relaxed tracking-tight-p text-muted [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-1 [&>li]:before:top-[0.7em] [&>li]:before:h-1 [&>li]:before:w-1 [&>li]:before:rounded-full [&>li]:before:bg-primary/60",
          className,
        )}
        {...rest}
      >
        {children}
      </ul>
    ),
    ol: ({ className, children, ...rest }) => (
      <ol
        className={cn(
          "my-4 ml-5 flex list-decimal flex-col gap-2 text-base leading-relaxed tracking-tight-p text-muted marker:text-primary/70 marker:font-semibold",
          className,
        )}
        {...rest}
      >
        {children}
      </ol>
    ),
    li: ({ className, children, ...rest }) => (
      <li className={cn("text-muted", className)} {...rest}>
        {children}
      </li>
    ),
    strong: ({ className, children, ...rest }) => (
      <strong className={cn("font-semibold text-ink", className)} {...rest}>
        {children}
      </strong>
    ),
    em: ({ className, children, ...rest }) => (
      <em className={cn("italic text-ink/90", className)} {...rest}>
        {children}
      </em>
    ),
    blockquote: ({ className, children, ...rest }) => (
      <blockquote
        className={cn(
          "my-6 border-l-2 border-primary/40 bg-surface/60 px-5 py-3 text-ink/85",
          className,
        )}
        {...rest}
      >
        {children}
      </blockquote>
    ),
    hr: ({ className, ...rest }) => (
      <hr className={cn("my-12 border-t border-border", className)} {...rest} />
    ),
    code: ({ className, children, ...rest }) => (
      <code
        className={cn(
          "nci-code-chip before:content-none after:content-none",
          "[pre_&]:inline-block [pre_&]:w-full [pre_&]:min-w-0 [pre_&]:border-0 [pre_&]:bg-transparent [pre_&]:p-0 [pre_&]:font-mono [pre_&]:text-sm [pre_&]:font-normal [pre_&]:leading-relaxed [pre_&]:text-ink [pre_&]:shadow-none",
          className,
        )}
        {...rest}
      >
        {children}
      </code>
    ),
    pre: ({ className, children, ...rest }) => (
      <CodeBlockShell className={className} {...rest}>
        {children}
      </CodeBlockShell>
    ),
    table: ({ className, children, ...rest }) => (
      <div className="my-6 overflow-x-auto rounded-2xl border border-border">
        <table
          className={cn(
            "min-w-full border-collapse text-sm text-ink",
            className,
          )}
          {...rest}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ className, children, ...rest }) => (
      <thead className={cn("bg-surface text-left", className)} {...rest}>
        {children}
      </thead>
    ),
    th: ({ className, children, ...rest }) => (
      <th
        className={cn(
          "border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted/85",
          className,
        )}
        {...rest}
      >
        {children}
      </th>
    ),
    td: ({ className, children, ...rest }) => (
      <td
        className={cn(
          "border-b border-border/70 px-4 py-3 text-sm tracking-tight-p text-ink/90 last:border-b-0",
          className,
        )}
        {...rest}
      >
        {children}
      </td>
    ),
    MenuPathRoot,
    MenuPathSegment,
    ...components,
  };
}
