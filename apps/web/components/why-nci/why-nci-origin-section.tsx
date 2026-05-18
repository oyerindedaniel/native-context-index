"use client";

import { useOriginCinemaPlayback } from "@/lib/hooks/use-origin-cinema-playback";
import {
  WhyNciOriginCinema,
  type OriginCinemaVariant,
} from "@/components/why-nci/why-nci-origin-cinema";
import { WhyNciStoryBubble } from "@/components/why-nci/why-nci-story-bubble";

export interface WhyNciOriginSectionProps {
  readonly variant?: OriginCinemaVariant;
}

export function WhyNciOriginSection({
  variant = "player",
}: WhyNciOriginSectionProps) {
  const playback = useOriginCinemaPlayback();

  return (
    <>
      <div id="why-nci-origin" className="min-w-0 w-full">
        <WhyNciOriginCinema playback={playback} variant={variant} />
      </div>
      <WhyNciStoryBubble
        sceneIndex={playback.playbackCursor.sceneIndex}
        scrollArmed={playback.story.originCinemaScrollArmed}
      />
    </>
  );
}
