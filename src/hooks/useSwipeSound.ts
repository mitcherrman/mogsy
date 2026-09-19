import { useMemo } from "react";
import { useSfx } from "@/lib/audio/useSfx";

/** SFX1.2 compatibility adapter; owns no context, settings, or mute state. */
export function useSwipeSound() {
  const sfx = useSfx();
  return useMemo(() => ({
    playSwipeSound: () => sfx.play("swipe.action"),
    playCorrectSound: () => sfx.play("swipe.elo.correct"),
    playWrongSound: () => sfx.play("swipe.elo.wrong"),
  }), [sfx]);
}
