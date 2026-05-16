import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

type GitHubMarkProps = Omit<ImageProps, "src" | "alt">;

export function GitHubMark({
  className,
  width = 16,
  height = 16,
  ...imageProps
}: GitHubMarkProps) {
  return (
    <Image
      src="/github.svg"
      alt=""
      width={width}
      height={height}
      className={cn("size-4 shrink-0 opacity-90", className)}
      aria-hidden
      {...imageProps}
    />
  );
}
