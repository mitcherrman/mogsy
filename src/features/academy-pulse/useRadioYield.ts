/**
 * Academy Pulse — make Academy Radio yield while a video plays.
 *
 * Uses the radio store's mode suppression: the element is silenced without
 * touching the visitor's Play/Mute choice, volume or live clock, and lifting
 * the suppression brings the station back exactly as it was. Released on
 * unmount, so closing the viewer (or leaving the page) never strands a muted
 * radio.
 */
import { useEffect } from "react";

import { setRadioSuppressedByMode } from "@/lib/audio/academy-radio";

export function useRadioYield(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    setRadioSuppressedByMode(true);
    return () => setRadioSuppressedByMode(false);
  }, [active]);
}
