/** Thin semantic adapter from persisted Broadcast config to canonical SFX. */

import { mogzyAudio } from "@/lib/audio/engine";
import type { SfxEvent } from "@/lib/audio/sfx-registry";
import type { BroadcastSfx, BroadcastSfxEvent } from "./types";

export type SfxPlayResult = "played" | "blocked" | "error" | "skipped";

const EVENT_MAP = {
  questionStart: "broadcast.question.start",
  countdownTick: "broadcast.countdown.tick",
  reveal: "broadcast.reveal",
  correctAnswer: "broadcast.answer.correct",
  transition: "broadcast.transition",
} as const satisfies Record<BroadcastSfxEvent, SfxEvent>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * Play one sound effect once. Resolves (never rejects) with what happened:
 *  - "skipped": empty src
 *  - "blocked": browser autoplay policy refused playback (needs user gesture)
 *  - "error":   file missing / unsupported / any other failure
 */
export function playBroadcastSfx(
  event: BroadcastSfxEvent,
  config: BroadcastSfx,
  eventId: string,
): Promise<SfxPlayResult> {
  try {
    const item = config.sounds[event];
    if (!config.enabled || !item?.enabled || !item.src.trim()) return Promise.resolve("skipped");
    const controller = mogzyAudio.getSfx();
    if (!controller) return Promise.resolve("error");
    const snapshot = controller.getSnapshot();
    if (snapshot.muted) return Promise.resolve("skipped");
    if (snapshot.contextState !== "running") return Promise.resolve("blocked");
    controller.play(EVENT_MAP[event], {
      eventId,
      configuredAsset: {
        src: item.src,
        relativeGain: clamp01(config.masterVolume) * clamp01(item.volume),
      },
    });
    return Promise.resolve("played");
  } catch {
    return Promise.resolve("error");
  }
}

/**
 * Prime audio from within a user gesture (click) so subsequent
 * programmatic playback is allowed. Safe to call repeatedly.
 */
export async function unlockBroadcastAudio(): Promise<boolean> {
  try {
    return await (mogzyAudio.getSfx()?.unlock() ?? Promise.resolve(false));
  } catch {
    return false;
  }
}
