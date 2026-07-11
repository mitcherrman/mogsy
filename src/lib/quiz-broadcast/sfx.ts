/**
 * Broadcast SFX playback helpers.
 * --------------------------------------------------------------------------
 * Presentation-only: nothing here touches the engine, session, or channel.
 * All failures are soft — a missing/invalid audio file or an autoplay block
 * must never crash the broadcast.
 */

export type SfxPlayResult = "played" | "blocked" | "error" | "skipped";

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Play one sound effect once. Resolves (never rejects) with what happened:
 *  - "skipped": empty src
 *  - "blocked": browser autoplay policy refused playback (needs user gesture)
 *  - "error":   file missing / unsupported / any other failure
 */
export function playBroadcastSfx(src: string, volume: number): Promise<SfxPlayResult> {
  if (!src || !src.trim()) return Promise.resolve("skipped");
  try {
    const audio = new Audio(src.trim());
    audio.volume = clamp01(volume);
    const p = audio.play();
    if (!p || typeof p.then !== "function") return Promise.resolve("played");
    return p.then(
      () => "played" as const,
      (err: unknown) =>
        (err as { name?: string } | null)?.name === "NotAllowedError" ? ("blocked" as const) : ("error" as const),
    );
  } catch {
    return Promise.resolve("error");
  }
}

let sharedCtx: AudioContext | null = null;

/**
 * Prime audio from within a user gesture (click) so subsequent
 * programmatic playback is allowed. Safe to call repeatedly.
 */
export async function unlockBroadcastAudio(): Promise<boolean> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return true; // nothing to unlock; let <audio> playback try again
    sharedCtx = sharedCtx ?? new Ctor();
    if (sharedCtx.state === "suspended") await sharedCtx.resume();
    // Play one silent buffer to fully satisfy gesture-activation heuristics.
    const buffer = sharedCtx.createBuffer(1, 1, 22050);
    const source = sharedCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(sharedCtx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}
