/**
 * HUB6 — the playback clock now lives in the neutral `@/lib/motion` module so
 * player History can reuse it without importing a Pro Play module. GRAPH1
 * keeps this path; behaviour is unchanged.
 */
export { usePlaybackClock, type PlaybackClock } from "../lib/motion/usePlaybackClock";
