/**
 * Deterministic per-entity colors — pure data, shared by the interactive
 * renderer and any future Remotion composition.
 *
 * Same entity id → same {base, win} pair across replays, seeks, rebuilds and
 * configurations: the index is a stable hash of the canonical entity id
 * (provisional entities hash their stable provisional id), never rank, array
 * position, or randomness.
 *
 * Encoding: `base` (dimmer shade) paints the FULL total-games bar — the
 * un-overlaid remainder reads as losses, never as missing data; `win` (a
 * clearly lighter shade of the same hue) paints the cumulative-wins segment
 * inset from the left. All pairs keep readable white labels on `base` in
 * dark and light contexts.
 */

export interface EntityColor {
  base: string;
  win: string;
}

const PALETTE: EntityColor[] = [
  { base: "#92400e", win: "#fbbf24" }, // amber
  { base: "#075985", win: "#38bdf8" }, // sky
  { base: "#065f46", win: "#34d399" }, // emerald
  { base: "#9f1239", win: "#fb7185" }, // rose
  { base: "#5b21b6", win: "#a78bfa" }, // violet
  { base: "#155e75", win: "#22d3ee" }, // cyan
  { base: "#9a3412", win: "#fb923c" }, // orange
  { base: "#115e59", win: "#2dd4bf" }, // teal
  { base: "#86198f", win: "#e879f9" }, // fuchsia
  { base: "#3f6212", win: "#a3e635" }, // lime
  { base: "#3730a3", win: "#818cf8" }, // indigo
  { base: "#991b1b", win: "#f87171" }, // red
];

/** Stable 32-bit string hash (same recipe the Phase 1 renderer used). */
export function entityColorIndex(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) {
    h = (h * 31 + entityId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % PALETTE.length;
}

export function entityColor(entityId: string): EntityColor {
  return PALETTE[entityColorIndex(entityId)];
}
