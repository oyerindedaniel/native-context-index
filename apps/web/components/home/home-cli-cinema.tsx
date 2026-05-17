"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLongRightIcon } from "@heroicons/react/20/solid";
import { StagedDemo } from "@/components/marketing/staged-demo";
import { Terminal } from "@/components/docs/widgets/terminal";
import {
  HOME_CLI_SCENES,
  type HomeCliScene,
} from "@/lib/home/home-cli-cinema-script";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResizeObserverElementHeight } from "@/lib/hooks/use-resize-observer-element-height";

const STAGE_MIN_HEIGHT_PX = 130;

const STAGE_HEIGHT_TRANSITION = {
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1] as const,
};

const SCENE_SWITCH_MOTION = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
  },
};

const HOME_CLI_CINEMA_TABS = HOME_CLI_SCENES.map((item) => ({
  id: item.sceneKey,
  label: item.tabLabel,
}));

function HomeCliCaptionRich({ text }: { readonly text: string }) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const segments = trimmed.split(/(`[^`]+`)/g);
  return (
    <p className="mt-6 text-base sm:text-lg text-muted tracking-tight-p">
      {segments.map((segment, segmentIndex) => {
        if (
          segment.startsWith("`") &&
          segment.endsWith("`") &&
          segment.length >= 2
        ) {
          const label = segment.slice(1, -1);
          return (
            <code key={segmentIndex} className="nci-code-chip">
              {label}
            </code>
          );
        }
        return <React.Fragment key={segmentIndex}>{segment}</React.Fragment>;
      })}
    </p>
  );
}

function sceneChromeTitle(scene: HomeCliScene): string {
  return scene.variant === "npm-single" ? scene.chromeTitle : "nci";
}

export function HomeCliCinema() {
  const sceneCount = HOME_CLI_SCENES.length;
  const [activeSceneIndex, setActiveSceneIndex] = React.useState(0);
  const firstScene = HOME_CLI_SCENES[0];
  const activeScene =
    sceneCount === 0 || !firstScene
      ? null
      : (HOME_CLI_SCENES[activeSceneIndex] ?? firstScene);
  const prefersReducedMotion = useReducedMotion() === true;
  const terminalMeasureRef = React.useRef<HTMLDivElement | null>(null);
  const measuredTerminalHeightPx = useResizeObserverElementHeight(
    terminalMeasureRef,
    activeScene?.sceneKey,
  );

  const handleTabChange = React.useCallback((sceneKey: string) => {
    const nextIndex = HOME_CLI_SCENES.findIndex(
      (scene) => scene.sceneKey === sceneKey,
    );
    if (nextIndex >= 0) {
      setActiveSceneIndex(nextIndex);
    }
  }, []);

  if (!activeScene) {
    return null;
  }

  const terminalStageHeight =
    prefersReducedMotion || measuredTerminalHeightPx === null
      ? "auto"
      : Math.max(STAGE_MIN_HEIGHT_PX, measuredTerminalHeightPx);

  const frameMode =
    activeScene.variant === "nci-sequence" ? "sequence" : "single";

  return (
    <section className="border-y border-border bg-surface pt-20 pb-0">
      <div className="mx-auto max-w-[1050px] px-6">
        <div className="mb-10 max-w-2xl">
          <p className="font-inter-tight text-sm font-medium uppercase tracking-[0.11em] text-primary">
            From install to query
          </p>
          <h2 className="mt-3 font-sans text-2xl font-semibold tracking-tight-sub text-ink sm:text-3xl">
            Same path your terminal takes
          </h2>
          <HomeCliCaptionRich text={activeScene.caption} />
          <Link
            href="/docs/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "group mt-5 inline-flex gap-2",
            )}
          >
            <span>Open the full quickstart</span>
            <ArrowLongRightIcon
              className="size-4 shrink-0 text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1050px] px-6">
        <div className="w-full min-w-0 max-sm:-mx-6 max-sm:w-[calc(100%+3rem)] max-sm:max-w-none">
          <StagedDemo.Root
            surfaceTint="accent"
            className="rounded-none max-sm:rounded-none max-sm:border-x-0 max-sm:p-3"
          >
            <StagedDemo.Card className="relative overflow-hidden rounded-2xl border border-border/90 bg-elevated p-4 shadow-[0_1px_0_rgb(255_255_255_/_0.85)_inset,0_18px_48px_-28px_rgb(0_0_0_/_0.12)] max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-4 max-sm:pb-5 max-sm:pt-4 max-sm:shadow-none sm:p-5 md:p-6 lg:px-10 lg:py-9">
              <div className="mb-6 min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted/80">
                  {activeScene.eyebrow}
                </p>
                <h3 className="mt-1 font-sans text-lg font-semibold tracking-tight text-ink sm:text-xl">
                  {activeScene.title}
                </h3>
              </div>

              <Terminal.Frame
                mode={frameMode}
                className="my-0"
                commandCopyPlacement="floating"
              >
                <Terminal.Chrome
                  title={
                    activeScene.variant === "npm-single"
                      ? sceneChromeTitle(activeScene)
                      : "nci"
                  }
                  cwd={activeScene.cwdLabel}
                />
                <Terminal.TabBar
                  tabs={HOME_CLI_CINEMA_TABS}
                  activeTabId={activeScene.sceneKey}
                  onTabChange={handleTabChange}
                  ariaLabel="CLI journey"
                  layoutId="home-cli-cinema-tab"
                />
                <motion.div
                  initial={false}
                  animate={{ height: terminalStageHeight }}
                  transition={STAGE_HEIGHT_TRANSITION}
                  className="relative min-h-0 min-w-0"
                >
                  <div ref={terminalMeasureRef} className="min-h-0 min-w-0">
                    <AnimatePresence mode="popLayout">
                      <motion.div
                        key={activeScene.sceneKey}
                        {...SCENE_SWITCH_MOTION}
                        className="min-h-0 min-w-0"
                      >
                        {activeScene.variant === "npm-single" ||
                        activeScene.variant === "nci-single" ? (
                          <Terminal.Root embed inViewAmount="some">
                            <Terminal.Body>
                              <Terminal.Command>
                                {activeScene.commandLine}
                              </Terminal.Command>
                              <Terminal.Output>
                                {activeScene.outputText}
                              </Terminal.Output>
                            </Terminal.Body>
                          </Terminal.Root>
                        ) : (
                          <Terminal.Sequence.Root
                            embed
                            pauseBetweenStepsMs={240}
                            inViewAmount="some"
                          >
                            <Terminal.Body className="nci-cli-cinema-scroll-y max-h-[min(22rem,48vh)] overflow-y-auto overscroll-y-contain">
                              {activeScene.steps.map((step) => (
                                <Terminal.Sequence.Step
                                  key={step.commandLine}
                                  commandLine={step.commandLine}
                                >
                                  {step.outputText}
                                </Terminal.Sequence.Step>
                              ))}
                            </Terminal.Body>
                          </Terminal.Sequence.Root>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              </Terminal.Frame>
            </StagedDemo.Card>
          </StagedDemo.Root>
        </div>
      </div>
    </section>
  );
}
