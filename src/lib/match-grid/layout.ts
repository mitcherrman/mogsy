/**
 * MATCH GRID — reserved geometry. Pure: given the instrument's pixel box and
 * the counts, it returns where every seal, seat and well socket sits, so the
 * component only paints. Positions depend on COUNTS and the box, never on
 * which entity sits where, so placing, locking and revealing never move the
 * frame (the VISCONT1 / OF4 continuity rule).
 *
 * Two compositions, one semantics:
 *   * "constellation" (wide boxes): seals along the lower band, each seat a
 *     fixed point on a fan above its seal (ring 1, then ring 2 …), threads
 *     drawn seal → seat.
 *   * "ledger" (narrow boxes): one row per group, seal at the left, seats on a
 *     wire to its right.
 */

export type Composition = "constellation" | "ledger";

export interface Point { x: number; y: number }

export interface SealGeometry extends Point {
  /** Seal radius (px). */
  r: number;
  /** The forgiving drop zone around this seal and its seats (instrument px). */
  zone: { left: number; top: number; right: number; bottom: number };
}

export interface InstrumentLayout {
  composition: Composition;
  width: number;
  height: number;
  /** Sigil diameter (px). ≥ 44 always. */
  sigil: number;
  seals: readonly SealGeometry[];
  /** The centre of seat `seat` of group index `g`. Fixed per (g, seat). */
  seat: (g: number, seat: number) => Point;
}

export type HeightTier = "compact" | "normal" | "tall";

export interface LayoutOptions {
  width: number;
  height: number;
  groupCount: number;
  /** Height tier chosen by the component from the viewport. */
  tier: HeightTier;
}

export const LEDGER_MAX_WIDTH = 719;

/**
 * The narrowest seal pitch at which ring 1's top and two shoulder seats of
 * neighbouring fans clear each other (MG-P3: measured in the real arena, whose
 * desktop stage is ~690px, not the lab's full width).
 */
export function minConstellationPitch(tier: HeightTier): number {
  const { sigil, sealR } = constellationSizes(tier);
  const ring1 = sealR + sigil / 2 + 18;
  return Math.ceil(2 * Math.cos((38 * Math.PI) / 180) * ring1 + sigil + 8);
}

/**
 * Constellation only where the fan honestly fits: wider than a phone AND a
 * seal pitch that keeps neighbouring fans apart. Otherwise the ledger, M1's
 * own composition for a narrow board. (`groupCount`/`tier` omitted = the M1
 * breakpoint alone.)
 */
export function compositionFor(width: number, groupCount?: number, tier: HeightTier = "normal"): Composition {
  if (groupCount === undefined) return width <= LEDGER_MAX_WIDTH ? "ledger" : "constellation";
  if (width < PHONE_MAX_WIDTH + 1) return "ledger";
  return width / groupCount < minConstellationPitch(tier) ? "ledger" : "constellation";
}

/** Below this the board is a phone's: always the ledger. */
export const PHONE_MAX_WIDTH = 479;

/** Instrument height per composition and tier: fixed per round, never per state. */
export function instrumentHeight(composition: Composition, groupCount: number, tier: HeightTier): number {
  if (composition === "ledger") return groupCount * (tier === "compact" ? 66 : 76);
  // Ring 1's top seat, its caption above it, a margin, then the seal and its
  // name: the field is exactly as tall as a full first ring needs. Ring 2 fans
  // sideways (see FAN) so it never rises above ring 1.
  return tier === "compact" ? 206 : tier === "tall" ? 268 : 236;
}

/** Sigil and seal sizes per tier (constellation). The ledger composition is fixed at 44 / 27. */
export function constellationSizes(tier: HeightTier): { sigil: number; sealR: number; captionBand: number } {
  if (tier === "compact") return { sigil: 46, sealR: 36, captionBand: 22 };
  if (tier === "tall") return { sigil: 58, sealR: 50, captionBand: 28 };
  return { sigil: 52, sealR: 44, captionBand: 26 };
}

/**
 * Fan seats, as (ring, angleDeg) from the seal centre, −90° straight up.
 * Ring 1 holds five (top, two shoulders, two wings), ring 2 holds five more
 * between them, ring 3 the rest. Fixed per index so a seat never moves when a
 * neighbour empties.
 */
const FAN: readonly { ring: number; deg: number }[] = [
  { ring: 1, deg: -90 }, { ring: 1, deg: -142 }, { ring: 1, deg: -38 }, { ring: 1, deg: -172 }, { ring: 1, deg: -8 },
  { ring: 2, deg: -128 }, { ring: 2, deg: -52 }, { ring: 2, deg: -160 }, { ring: 2, deg: -20 }, { ring: 2, deg: -180 }, { ring: 2, deg: 0 },
  { ring: 3, deg: -150 }, { ring: 3, deg: -30 },
];

export function computeLayout(opts: LayoutOptions): InstrumentLayout {
  const { width, height, groupCount } = opts;
  const composition = compositionFor(width, groupCount, opts.tier);
  if (composition === "ledger") return ledgerLayout(opts);

  const compact = opts.tier === "compact";
  const { sigil, sealR, captionBand } = constellationSizes(opts.tier);
  const pitch = width / groupCount;
  const sealY = height - captionBand - sealR - 2;
  // Ring 1 clears the seal rim by a visible thread length; it scales down with
  // a tight pitch so neighbouring fans never collide.
  const ring1 = Math.max(sealR + sigil / 2 + 18, Math.min(sealR + sigil / 2 + (compact ? 28 : 32), pitch * 0.40));
  const step = sigil + (compact ? 22 : 26);
  const seals: SealGeometry[] = Array.from({ length: groupCount }, (_, g) => {
    const x = pitch * (g + 0.5);
    return {
      x, y: sealY, r: sealR,
      zone: { left: pitch * g, top: 0, right: pitch * (g + 1), bottom: height },
    };
  });
  const seat = (g: number, index: number): Point => {
    const s = seals[Math.max(0, Math.min(groupCount - 1, g))];
    const f = FAN[Math.min(index, FAN.length - 1)];
    const extra = Math.max(0, index - (FAN.length - 1));
    const d = ring1 + (f.ring - 1) * step + extra * step;
    const rad = (f.deg * Math.PI) / 180;
    // A wing seat on the first or last seal is kept inside the board, caption included.
    const margin = 48;
    const x = Math.max(margin, Math.min(width - margin, s.x + Math.cos(rad) * d));
    return { x, y: s.y + Math.sin(rad) * d };
  };
  return { composition, width, height, sigil, seals, seat };
}

function ledgerLayout(opts: LayoutOptions): InstrumentLayout {
  const { width, height, groupCount } = opts;
  const sigil = 44;
  const sealR = opts.tier === "compact" ? 24 : 27;
  const rowH = height / groupCount;
  // The seal column is wide enough for the longest discipline name under the
  // seal at the ledger's small caps; the wire starts past it.
  const sealColumn = 92;
  // Centred in its column so the name beneath it (84px) never clips at the
  // board's left edge (MG-P3: clipped inside the arena card).
  const sealX = sealColumn / 2;
  const firstSeatX = sealColumn + sigil / 2;
  const pitchX = sigil + 10;
  const perRow = Math.max(1, Math.floor((width - firstSeatX - sigil / 2 - 6) / pitchX) + 1);
  const seals: SealGeometry[] = Array.from({ length: groupCount }, (_, g) => ({
    x: sealX, y: rowH * (g + 0.5), r: sealR,
    zone: { left: 0, top: rowH * g, right: width, bottom: rowH * (g + 1) },
  }));
  const seat = (g: number, index: number): Point => {
    const s = seals[Math.max(0, Math.min(groupCount - 1, g))];
    const col = index % perRow;
    const overflow = Math.floor(index / perRow);
    // Beyond one wire the seats stack slightly up and right: a degenerate,
    // honest pile rather than a reflow of the row.
    return { x: firstSeatX + col * pitchX + overflow * 8, y: s.y - overflow * 10 };
  };
  return { composition: "ledger", width, height, sigil, seals, seat };
}

/** Well sockets: a fixed grid of `count` resting places, filled left to right, top to bottom. */
export function wellSockets(count: number, width: number, pitch: number): { cols: number; rows: number; at: (i: number) => Point } {
  const cols = Math.max(1, Math.min(count, Math.floor(width / pitch)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const left = (width - cols * pitch) / 2;
  return {
    cols, rows,
    at: (i) => ({ x: left + (i % cols) * pitch + pitch / 2, y: Math.floor(i / cols) }),
  };
}
