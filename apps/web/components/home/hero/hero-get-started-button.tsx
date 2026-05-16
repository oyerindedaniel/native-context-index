"use client";

import { ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { CopyStatusIcon } from "@/components/docs/widgets/copy-status-icon";
import { SplitButton } from "@/components/ui/split-button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

export const HERO_NPM_INSTALL_COMMAND =
  "npm install -g @nativecontextindex/cli" as const;

export function HeroGetStartedButton({ className }: { className?: string }) {
  const router = useRouter();
  const { copied, copy } = useCopyToClipboard({ resetMs: 2000 });

  return (
    <SplitButton.Root
      variant="primary"
      size="lg"
      className={cn("pointer-events-auto", className)}
    >
      <SplitButton.Main
        type="button"
        onClick={() => router.push("/docs/quickstart")}
      >
        Get started
      </SplitButton.Main>
      <SplitButton.IconTrigger
        type="button"
        onClick={() => void copy(HERO_NPM_INSTALL_COMMAND)}
        aria-label={
          copied ? "Copied install command" : "Copy npm install command"
        }
      >
        <CopyStatusIcon
          copied={copied}
          idle={ClipboardDocumentIcon}
          className="text-white/90"
        />
      </SplitButton.IconTrigger>
    </SplitButton.Root>
  );
}
