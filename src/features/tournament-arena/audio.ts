/**
 * Arena cue ids. All playback goes through `useSfx()`; the voices live in
 * `src/lib/audio/sfx-registry.ts` (built-in synth generators, no assets, no
 * second engine). Callers pass a stable `eventId` so a cue never replays on a
 * poll, a re-render or a revisit.
 */
import type { SfxEvent } from "@/lib/audio/sfx-registry";

export const ARENA_SFX = {
  reveal: "arena.bracket.reveal",
  advance: "arena.advance",
  roundComplete: "arena.round.complete",
  champion: "arena.champion",
  launch: "arena.launch",
  ready: "arena.ready",
  versus: "arena.versus",
} as const satisfies Record<string, SfxEvent>;

export const arenaEventId = (eventId: string, beat: string, key: string | number) => `arena:${eventId}:${beat}:${key}`;
