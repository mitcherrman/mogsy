import { useMemo } from "react";
import { useSfx } from "@/lib/audio/useSfx";

/** SFX1.2 compatibility adapter; owns no context, settings, or mute state. */
export function useShopSound() {
  const sfx = useSfx();
  return useMemo(() => ({
    playPurchaseSound: () => sfx.play("shop.purchase"),
    playDiamondTap: () => sfx.play("shop.diamond.tap"),
    playPowerUpSound: () => sfx.play("shop.powerup"),
  }), [sfx]);
}
