import { useCallback, useMemo } from "react";
import { LEGACY_ANIMATION_SFX_EVENT } from "@/lib/audio/sfx-registry";
import { useSfx } from "@/lib/audio/useSfx";

/** SFX1.2 compatibility adapter; sampled and synthesized voices are canonical. */
export function useAnimationSound() {
  const sfx = useSfx();
  const playAnimationSound = useCallback((animationId: string) => {
    const event = LEGACY_ANIMATION_SFX_EVENT[animationId as keyof typeof LEGACY_ANIMATION_SFX_EVENT];
    if (event) sfx.play(event);
  }, [sfx]);
  return useMemo(() => ({
    playAnimationSound,
    preloadSounds: () => sfx.preload("card.animation.paper-rip"),
  }), [playAnimationSound, sfx]);
}
