"use client";

import * as React from "react";

const NARRATION_HOLD_MS = 1400;

export type WhyNciStoryBridge = {
  readonly narrationSceneIndex: number | null;
  readonly timelineSuspended: boolean;
  /** Autoplay armed once the origin cinema block has intersected the viewport. */
  readonly originCinemaScrollArmed: boolean;
  readonly setOriginCinemaScrollArmed: (armed: boolean) => void;
  /** User pause / resume for the origin cinema surface (not between-scene narration hold). */
  readonly originCinemaUserPaused: boolean;
  readonly setOriginCinemaUserPaused: (paused: boolean) => void;
  /** After a scene completes, show narration then run `thenAdvance` (next scene). */
  readonly scheduleBetweenScenes: (
    completedSceneIndex: number,
    thenAdvance: () => void,
  ) => void;
  readonly clearBetweenScenes: () => void;
};

const WhyNciStoryContext = React.createContext<WhyNciStoryBridge | null>(null);

export function WhyNciStoryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [narrationSceneIndex, setNarrationSceneIndex] = React.useState<
    number | null
  >(null);
  const [timelineSuspended, setTimelineSuspended] = React.useState(false);
  const [originCinemaScrollArmed, setOriginCinemaScrollArmed] =
    React.useState(false);
  const [originCinemaUserPaused, setOriginCinemaUserPaused] =
    React.useState(false);
  const narrationTimerRef = React.useRef<number | null>(null);

  const clearBetweenScenes = React.useCallback(() => {
    if (narrationTimerRef.current !== null) {
      window.clearTimeout(narrationTimerRef.current);
      narrationTimerRef.current = null;
    }
    setNarrationSceneIndex(null);
    setTimelineSuspended(false);
  }, []);

  const scheduleBetweenScenes = React.useCallback(
    (completedSceneIndex: number, thenAdvance: () => void) => {
      if (narrationTimerRef.current !== null) {
        window.clearTimeout(narrationTimerRef.current);
        narrationTimerRef.current = null;
      }
      setNarrationSceneIndex(completedSceneIndex);
      setTimelineSuspended(true);
      narrationTimerRef.current = window.setTimeout(() => {
        thenAdvance();
        setNarrationSceneIndex(null);
        setTimelineSuspended(false);
        narrationTimerRef.current = null;
      }, NARRATION_HOLD_MS);
    },
    [],
  );

  React.useEffect(() => () => clearBetweenScenes(), [clearBetweenScenes]);

  const value = React.useMemo<WhyNciStoryBridge>(
    () => ({
      narrationSceneIndex,
      timelineSuspended,
      originCinemaScrollArmed,
      setOriginCinemaScrollArmed,
      originCinemaUserPaused,
      setOriginCinemaUserPaused,
      scheduleBetweenScenes,
      clearBetweenScenes,
    }),
    [
      narrationSceneIndex,
      timelineSuspended,
      originCinemaScrollArmed,
      originCinemaUserPaused,
      scheduleBetweenScenes,
      clearBetweenScenes,
    ],
  );

  return (
    <WhyNciStoryContext.Provider value={value}>
      {children}
    </WhyNciStoryContext.Provider>
  );
}

export function useWhyNciStory(): WhyNciStoryBridge {
  const context = React.useContext(WhyNciStoryContext);
  if (!context) {
    throw new Error(
      "useWhyNciStory must be used within a WhyNciStoryProvider. Wrap Why NCI routes (or the component tree) with WhyNciStoryProvider from why-nci-story-context.",
    );
  }
  return context;
}
