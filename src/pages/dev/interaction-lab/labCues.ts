/**
 * MIG1.2 — the Interaction Lab's sound cues, through the EXISTING SFX engine.
 *
 * What it is: a thin lab-only wrapper over `useSfx()` that maps the lab's own
 * moments to existing registry cues (all built-in synth generators — no asset,
 * no fetch):
 *
 *   pick a Data Duel side  → leaguecraft.record.selection
 *   lock                   → ranked.answer.lock
 *   Data Duel reveal       → ranked.answer.correct / ranked.answer.incorrect
 *   Stat Drop reveal       → combat.simulation.resolve (neutral: no verdict exists)
 *
 * WHY NO DOUBLE CUES. The arena plays nothing itself — Ranked's settlement
 * cues live in `useRankedMatchSfx`, which the lab does not mount — so each lab
 * moment produces exactly one cue. Every play carries a per-round `eventId`,
 * so the engine's own dedupe drops a re-render's second call.
 *
 * PREFERENCES. The global mute (Settings / HUD, `mogsy-sounds-muted`) is
 * honoured by the engine's master gain, as it is for every Mogzy cue; Audio
 * Studio policy still decides whether a built-in may sound at all. On top of
 * that the lab has its own per-viewer switch, persisted in localStorage, so a
 * reviewer can silence the lab without touching the global preference.
 *
 * No analytics, no network, no activity tracking: the SFX engine has none.
 */
import { useCallback, useState } from "react";
import { useSfx, useSfxSnapshot } from "@/lib/audio/useSfx";
import type { SfxEvent } from "@/lib/audio/sfx-registry";

export const LAB_CUES_STORAGE_KEY = "mogzy.mig-lab.cues";

export type LabCue = "select" | "lock" | "correct" | "incorrect" | "resolve";

export const LAB_CUE_EVENTS: Record<LabCue, SfxEvent> = {
  select: "leaguecraft.record.selection",
  lock: "ranked.answer.lock",
  correct: "ranked.answer.correct",
  incorrect: "ranked.answer.incorrect",
  resolve: "combat.simulation.resolve",
};

function readEnabled(): boolean {
  try { return window.localStorage.getItem(LAB_CUES_STORAGE_KEY) !== "0"; } catch { return true; }
}

export function useLabCues() {
  const sfx = useSfx();
  const { muted } = useSfxSnapshot();
  const [enabled, setEnabled] = useState(readEnabled);
  const toggle = useCallback(() => {
    setEnabled((on) => {
      try { window.localStorage.setItem(LAB_CUES_STORAGE_KEY, on ? "0" : "1"); } catch { /* per-viewer nicety */ }
      return !on;
    });
  }, []);
  const cue = useCallback((which: LabCue, eventId: string) => {
    if (enabled) sfx.play(LAB_CUE_EVENTS[which], { eventId: `mig-lab:${eventId}` });
  }, [enabled, sfx]);
  return { enabled, toggle, cue, globallyMuted: muted };
}
