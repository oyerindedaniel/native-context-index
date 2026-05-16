import Image from "next/image";
import { cn } from "@/lib/utils";

export type PackageManagerId = "npm" | "pnpm" | "yarn" | "bun";

const PACKAGE_MANAGER_IDS = new Set<PackageManagerId>([
  "npm",
  "pnpm",
  "yarn",
  "bun",
]);

export function isPackageManagerId(value: string): value is PackageManagerId {
  return PACKAGE_MANAGER_IDS.has(value as PackageManagerId);
}

export function PackageManagerLogo({
  id,
  variant,
  className,
}: {
  id: PackageManagerId;
  variant: "colored" | "mono";
  className?: string;
}) {
  const src =
    variant === "colored"
      ? `/package-managers/colored/${id}.svg`
      : `/package-managers/${id}.svg`;

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center",
        variant === "mono" &&
          "[&_img]:brightness-0 [&_img]:invert [&_img]:opacity-95",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src={src}
        alt=""
        width={20}
        height={20}
        className="size-5"
        unoptimized
      />
    </span>
  );
}
