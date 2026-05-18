"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import {
  ORIGIN_SCENES,
  type OriginBeat,
  type OriginCardBeat,
  type OriginMonoBeat,
} from "@/lib/why-nci/origin-cinema-script";
import { useWhyNciStory } from "@/components/why-nci/why-nci-story-context";
import { useResizeObserverElementHeight } from "@/lib/hooks/use-resize-observer-element-height";
import { useIntersectionObserverEffect } from "@/lib/hooks/use-intersection-observer-effect";

const DEFAULT_TYPING_MS_PER_CHAR = 11;
const CARD_TITLE_MS_PER_CHAR = 10;
const MONO_HOLD_MS = 420;
const PILL_DWELL_MS = 560;
const CARD_TITLE_HOLD_MS = 380;
const CARD_BODY_DWELL_MS = 2200;

export const ORIGIN_CINEMA_STAGE_MIN_HEIGHT_PX = 130;

export const ORIGIN_CINEMA_INTERSECTION_ROOT_MARGIN = "120px 0px 50% 0px";
export const ORIGIN_CINEMA_INTERSECTION_THRESHOLD = 0;

type PlaybackCursorState = {
  sceneIndex: number;
  beatIndex: number;
};

function computePlaybackOutcomeAfterBeatCompletes(
  previousCursor: PlaybackCursorState,
): {
  nextCursor: PlaybackCursorState;
  pendingBetweenScenesSceneIndex: number | null;
  markCinemaComplete: boolean;
} {
  const { sceneIndex, beatIndex } = previousCursor;
  const scene = ORIGIN_SCENES[sceneIndex];
  if (!scene) {
    return {
      nextCursor: previousCursor,
      pendingBetweenScenesSceneIndex: null,
      markCinemaComplete: false,
    };
  }
  const nextBeatIndex = beatIndex + 1;
  if (nextBeatIndex < scene.beats.length) {
    return {
      nextCursor: { sceneIndex, beatIndex: nextBeatIndex },
      pendingBetweenScenesSceneIndex: null,
      markCinemaComplete: false,
    };
  }
  if (sceneIndex + 1 < ORIGIN_SCENES.length) {
    return {
      nextCursor: { sceneIndex, beatIndex: scene.beats.length },
      pendingBetweenScenesSceneIndex: sceneIndex,
      markCinemaComplete: false,
    };
  }
  return {
    nextCursor: { sceneIndex, beatIndex: scene.beats.length },
    pendingBetweenScenesSceneIndex: null,
    markCinemaComplete: true,
  };
}

export function useOriginCinemaPlayback() {
  const prefersReducedMotion = useReducedMotion();
  const story = useWhyNciStory();

  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const measuredStageHeight = useResizeObserverElementHeight(measureRef);

  const intersectionObserverSupported =
    typeof IntersectionObserver !== "undefined";

  useIntersectionObserverEffect(
    rootRef,
    intersectionObserverSupported && !story.originCinemaScrollArmed,
    ORIGIN_CINEMA_INTERSECTION_ROOT_MARGIN,
    ORIGIN_CINEMA_INTERSECTION_THRESHOLD,
    (entry) => {
      if (entry.isIntersecting) {
        story.setOriginCinemaScrollArmed(true);
        story.setOriginCinemaUserPaused(false);
      }
    },
  );

  React.useEffect(() => {
    if (!intersectionObserverSupported) {
      story.setOriginCinemaScrollArmed(true);
    }
  }, [intersectionObserverSupported, story]);

  const [playbackCursor, setPlaybackCursor] = React.useState({
    sceneIndex: 0,
    beatIndex: 0,
  });

  const [pendingBetweenScenesSceneIndex, setPendingBetweenScenesSceneIndex] =
    React.useState<number | null>(null);

  const [settledEntries, setSettledEntries] = React.useState<OriginBeat[]>([]);
  const [monoRevealLength, setMonoRevealLength] = React.useState(0);
  const [cardTitleRevealLength, setCardTitleRevealLength] = React.useState(0);
  const [cardBodyVisible, setCardBodyVisible] = React.useState(false);
  const [cinemaComplete, setCinemaComplete] = React.useState(false);

  const currentScene = ORIGIN_SCENES[playbackCursor.sceneIndex];
  const currentBeat =
    currentScene && playbackCursor.beatIndex < currentScene.beats.length
      ? currentScene.beats[playbackCursor.beatIndex]
      : undefined;

  const resetPartials = React.useCallback(() => {
    setMonoRevealLength(0);
    setCardTitleRevealLength(0);
    setCardBodyVisible(false);
  }, []);

  React.useEffect(() => {
    if (pendingBetweenScenesSceneIndex === null) {
      return;
    }
    const sceneIndex = pendingBetweenScenesSceneIndex;
    setPendingBetweenScenesSceneIndex(null);
    story.scheduleBetweenScenes(sceneIndex, () => {
      setPlaybackCursor({
        sceneIndex: sceneIndex + 1,
        beatIndex: 0,
      });
      setSettledEntries([]);
      resetPartials();
    });
  }, [pendingBetweenScenesSceneIndex, story, resetPartials]);

  const timelineRunning =
    story.originCinemaScrollArmed &&
    !prefersReducedMotion &&
    !cinemaComplete &&
    !story.timelineSuspended &&
    !story.originCinemaUserPaused;

  const appendSettledAndAdvance = React.useEffectEvent(
    (completedBeat: OriginBeat) => {
      setSettledEntries((previous) => [...previous, completedBeat]);
      const outcome = computePlaybackOutcomeAfterBeatCompletes(playbackCursor);
      setPlaybackCursor(outcome.nextCursor);
      if (outcome.pendingBetweenScenesSceneIndex !== null) {
        setPendingBetweenScenesSceneIndex(
          outcome.pendingBetweenScenesSceneIndex,
        );
      }
      if (outcome.markCinemaComplete) {
        setCinemaComplete(true);
      }
    },
  );

  const jumpToScene = React.useCallback(
    (targetSceneIndex: number) => {
      story.clearBetweenScenes();
      setPendingBetweenScenesSceneIndex(null);
      const clampedIndex = Math.max(
        0,
        Math.min(targetSceneIndex, ORIGIN_SCENES.length - 1),
      );
      setPlaybackCursor({ sceneIndex: clampedIndex, beatIndex: 0 });
      setSettledEntries([]);
      resetPartials();
      setCinemaComplete(false);
    },
    [resetPartials, story],
  );

  const restartFromBeginning = React.useCallback(() => {
    jumpToScene(0);
    story.setOriginCinemaScrollArmed(true);
    story.setOriginCinemaUserPaused(false);
  }, [jumpToScene, story]);

  const stepSceneBackward = React.useCallback(() => {
    jumpToScene(playbackCursor.sceneIndex - 1);
  }, [jumpToScene, playbackCursor.sceneIndex]);

  const stepSceneForward = React.useCallback(() => {
    const nextSceneIndex = playbackCursor.sceneIndex + 1;
    if (nextSceneIndex >= ORIGIN_SCENES.length) {
      const lastScene = ORIGIN_SCENES[ORIGIN_SCENES.length - 1];
      story.clearBetweenScenes();
      setPendingBetweenScenesSceneIndex(null);
      setPlaybackCursor({
        sceneIndex: ORIGIN_SCENES.length - 1,
        beatIndex: lastScene?.beats.length ?? 0,
      });
      setSettledEntries(lastScene?.beats ? [...lastScene.beats] : []);
      resetPartials();
      setCinemaComplete(true);
      return;
    }
    jumpToScene(nextSceneIndex);
  }, [jumpToScene, playbackCursor.sceneIndex, resetPartials, story]);

  const togglePlayPause = React.useCallback(() => {
    if (cinemaComplete) {
      restartFromBeginning();
      return;
    }
    story.setOriginCinemaUserPaused(!story.originCinemaUserPaused);
  }, [cinemaComplete, restartFromBeginning, story]);

  React.useLayoutEffect(() => {
    resetPartials();
  }, [playbackCursor.sceneIndex, playbackCursor.beatIndex, resetPartials]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "mono") {
      return;
    }
    const monoBeat = currentBeat as OriginMonoBeat;
    if (monoRevealLength >= monoBeat.text.length) {
      return;
    }
    const delayMs = monoBeat.typingMsPerChar ?? DEFAULT_TYPING_MS_PER_CHAR;
    const timeoutId = window.setTimeout(() => {
      setMonoRevealLength((previous) => previous + 1);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, monoRevealLength]);

  /* eslint-disable react-hooks/exhaustive-deps -- `appendSettledAndAdvance` is `useEffectEvent`; omit from deps */
  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "mono") {
      return;
    }
    const monoBeat = currentBeat as OriginMonoBeat;
    if (monoRevealLength < monoBeat.text.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(monoBeat);
    }, MONO_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, monoRevealLength]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "pill") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(currentBeat);
    }, PILL_DWELL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    if (cardTitleRevealLength >= cardBeat.title.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCardTitleRevealLength((previous) => previous + 1);
    }, CARD_TITLE_MS_PER_CHAR);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardTitleRevealLength, cardBodyVisible]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    if (cardTitleRevealLength < cardBeat.title.length) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCardBodyVisible(true);
    }, CARD_TITLE_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardTitleRevealLength, cardBodyVisible]);

  React.useEffect(() => {
    if (!timelineRunning) {
      return;
    }
    if (!currentBeat || currentBeat.beatKind !== "card") {
      return;
    }
    if (!cardBodyVisible) {
      return;
    }
    const cardBeat = currentBeat as OriginCardBeat;
    const timeoutId = window.setTimeout(() => {
      appendSettledAndAdvance(cardBeat);
    }, CARD_BODY_DWELL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [timelineRunning, currentBeat, cardBodyVisible]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const partialMonoText =
    currentBeat?.beatKind === "mono"
      ? (currentBeat as OriginMonoBeat).text.slice(0, monoRevealLength)
      : "";

  const partialCardTitle =
    currentBeat?.beatKind === "card"
      ? (currentBeat as OriginCardBeat).title.slice(0, cardTitleRevealLength)
      : "";

  const settledForDisplay =
    currentBeat?.beatKind === "pill" &&
    settledEntries.length > 0 &&
    settledEntries[settledEntries.length - 1]!.beatKind === "mono"
      ? settledEntries.slice(0, -1)
      : settledEntries;

  const monoTailForPillOverlay =
    currentBeat?.beatKind === "pill" &&
    settledEntries.length > 0 &&
    settledEntries[settledEntries.length - 1]!.beatKind === "mono"
      ? (settledEntries[settledEntries.length - 1] as OriginMonoBeat).text
      : null;

  const targetStageHeight =
    measuredStageHeight === null
      ? "auto"
      : Math.max(ORIGIN_CINEMA_STAGE_MIN_HEIGHT_PX, measuredStageHeight);

  const isFirstScene = playbackCursor.sceneIndex === 0;
  const isLastScene =
    cinemaComplete || playbackCursor.sceneIndex >= ORIGIN_SCENES.length - 1;

  return {
    prefersReducedMotion,
    rootRef,
    measureRef,
    playbackCursor,
    currentBeat,
    settledForDisplay,
    monoTailForPillOverlay,
    partialMonoText,
    partialCardTitle,
    cardBodyVisible,
    cinemaComplete,
    targetStageHeight,
    story,
    restartFromBeginning,
    togglePlayPause,
    stepSceneBackward,
    stepSceneForward,
    isFirstScene,
    isLastScene,
  };
}

export type OriginCinemaPlayback = ReturnType<typeof useOriginCinemaPlayback>;
