"use client";

import { cn } from "@/lib/utils";

interface FeatureCardProps {
  title: string;
  body: string;
  className?: string;
  icon?: React.ReactNode;
}

export function FeatureCard({
  title,
  body,
  className,
  icon,
}: FeatureCardProps) {
  return (
    <div
      className={cn("group relative flex flex-col transition-all", className)}
    >
      <div className="mb-6 text-primary">
        {icon || <div className="h-6 w-6 rounded-md bg-border/50" />}
      </div>

      <h3 className="text-xl font-semibold tracking-tight-sub text-ink">
        {title}
      </h3>

      <p className="mt-3 text-base leading-relaxed text-muted tracking-tight-p">
        {body}
      </p>
    </div>
  );
}
