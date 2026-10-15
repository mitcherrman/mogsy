/**
 * MATCH GRID — reserved geometry. Pure: given the board's pixel box and the
 * counts, it returns where every seal, seat and well socket sits, so the
 * component only paints. Positions depend on COUNTS, the box and the dealt
 * names, never on which entity sits where, so placing, locking and revealing
 * never move the frame (the VISCONT1 / OF4 continuity rule).
 *
 * Two compositions, one semantics:
 *   * "constellation" (wide boxes, few groups): seals along the lower band,
 *     each seat a fixed point on a fan above its seal, threads seal → seat.
 *   * "ledger" (narrow boxes, or four and more groups): one ROW per group,
 *     seal at the left with its name beneath, seats on a wire to its right.
 *     Inside a host's height budget (the Ranked arena) the rows and the well
 *     sit side by side — the RAIL arrangement — and are sized to the budget.
 *
 * MG-UX1: every size here is chosen so a dealt name is READ, not guessed:
 * captions are 10–11px, wrap to two lines where the row has the room, and are
 * never narrower than the pitch between neighbours, so no two captions touch.
 * `planBoard` searches the few sizes that fit the budget and keeps the one that
 * shows the most names in full; whatever it cannot show in full the component
 * names on hover, focus and hold.
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

/** One group row of the ledger composition. */
export interface RowsGeometry {
  rowH: number;
  /** Width of the seal column (the seal and its name beneath). */
  sealCol: number;
  sealR: number;
  /** Distance between neighbouring seats on a wire (≥ one caption's width). */
  seatPitch: number;
  sigil: number;
  /** The seal / seat centre line, from the row's top. */
  lineY: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  groupCount: number;
  /** Height tier chosen by the component from the viewport. */
  tier: HeightTier;
  /** The ledger's rows, sized by `planBoard`. Omitted: the M1 ledger rows. */
  rows?: RowsGeometry;
}

// ---------------------------------------------------------------- captions

/** How a sigil's name is set under (or above) it. `lines: 0` = no caption (named on hover/focus/hold). */
export interface CaptionSpec {
  lines: 0 | 1 | 2;
  /** Caption box width (px); never wider than the pitch to its neighbour. */
  width: number;
  font: number;
  /** Line height (px). */
  line: number;
  /** Vertical room the caption takes beside the sigil: gap + lines. */
  band: number;
}

const CAPTION_GAP = 3;

/**
 * The caption for a given neighbour pitch. Measured (Inter 600): every
 * certified rune name sets in two lines no wider than 85px at 11px, 81px at
 * 10.5px ("Transcendence", the longest word) and 77px at 10px; the longest
 * whole name ("Hextech Flashtraption") is 114px at 10.5px on one line.
 */
export function captionSpec(pitch: number, lines: 0 | 1 | 2): CaptionSpec {
  const width = Math.max(0, Math.min(lines === 1 ? 124 : 100, pitch - 4));
  const font = width >= 88 ? 11 : width >= 82 ? 10.5 : 10;
  const line = font >= 11 ? 13 : 12;
  return { lines, width, font, line, band: lines === 0 ? 0 : lines === 1 ? CAPTION_GAP - 1 + line : CAPTION_GAP + 2 * line };
}

/** Inter 600 advance widths (em), measured in the browser; anything else counts as a wide glyph. */
const ADVANCE: Readonly<Record<string, number>> = {
  a: 0.57, b: 0.62, c: 0.58, d: 0.62, e: 0.59, f: 0.39, g: 0.63, h: 0.61, i: 0.26, j: 0.26, k: 0.57, l: 0.26, m: 0.9,
  n: 0.61, o: 0.61, p: 0.62, q: 0.62, r: 0.4, s: 0.55, t: 0.35, u: 0.61, v: 0.59, w: 0.84, x: 0.57, y: 0.59, z: 0.57,
  A: 0.73, B: 0.66, C: 0.74, D: 0.72, E: 0.61, F: 0.59, G: 0.75, H: 0.75, I: 0.28, J: 0.58, K: 0.7, L: 0.57, M: 0.92,
  N: 0.76, O: 0.77, P: 0.65, Q: 0.77, R: 0.65, S: 0.65, T: 0.66, U: 0.74, V: 0.73, W: 1.02, X: 0.72, Y: 0.71, Z: 0.65,
  " ": 0.25, ":": 0.32, "'": 0.33, "’": 0.29, "-": 0.47, ".": 0.32, ",": 0.32, "&": 0.66,
};

/** A width estimate (px) of `text` in the caption face (Inter 600, 0.01em tracking) at `font` px, with a 1% margin. */
export function estimateTextWidth(text: string, font: number): number {
  let em = 0;
  for (const ch of text) em += (ADVANCE[ch] ?? 0.75) + 0.01;
  return em * font * 1.01;
}

/** Whether `label` sets in full inside `spec` (greedy word wrap). */
export function captionFits(label: string, spec: CaptionSpec): boolean {
  if (spec.lines === 0) return false;
  const words = label.split(/\s+/).filter(Boolean);
  let lines = 0;
  let current = 0;
  const space = estimateTextWidth(" ", spec.font);
  for (const w of words) {
    const ww = estimateTextWidth(w, spec.font);
    if (ww > spec.width) return false;
    if (lines === 0 || current + space + ww > spec.width) { lines += 1; current = ww; } else current += space + ww;
  }
  return lines <= spec.lines;
}

const truncatedCount = (labels: readonly string[], spec: CaptionSpec) =>
  labels.reduce((n, l) => n + (captionFits(l, spec) ? 0 : 1), 0);

// ---------------------------------------------------------------- compositions

export const LEDGER_MAX_WIDTH = 719;

/** Below this the board is a phone's: always the ledger. */
export const PHONE_MAX_WIDTH = 479;

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

/** Sigil and seal sizes per tier (constellation). */
export function constellationSizes(tier: HeightTier): { sigil: number; sealR: number; captionBand: number } {
  if (tier === "compact") return { sigil: 46, sealR: 36, captionBand: 22 };
  if (tier === "tall") return { sigil: 58, sealR: 50, captionBand: 28 };
  return { sigil: 52, sealR: 44, captionBand: 26 };
}

/**
 * MG-UX1 — the constellation's fan, sized by its captions. Seat 0 rises
 * straight above the seal; seats 1 and 2 are its shoulders, set just far
 * enough out that a shoulder's two-line caption clears the top sigil, and low
 * enough that it sits under the top seat's caption. The caption width is the
 * room half a seal's column leaves, so neighbouring fans never touch.
 */
export interface ConstellationGeometry {
  sigil: number;
  sealR: number;
  /** The seal name's band under the seal. */
  nameBand: number;
  caption: CaptionSpec;
  /** Shoulder offset (x) and height (y) above the seal centre; the top seat's height. */
  shoulderX: number;
  shoulderY: number;
  top: number;
  /** The instrument height this fan needs. */
  instrH: number;
}

export function constellationGeometry(tier: HeightTier, pitch: number): ConstellationGeometry {
  const { sigil, sealR, captionBand: nameBand } = constellationSizes(tier);
  const capW = Math.max(60, Math.min(96, Math.floor(pitch / 2 - sigil / 2 - 6)));
  const caption = captionSpec(capW + 4, 2);
  const shoulderX = sigil / 2 + 3 + caption.width / 2;
  // A visible thread: every seat clears the seal rim by at least 12px.
  const minR = sealR + sigil / 2 + 12;
  const shoulderY = Math.max(sigil / 2, Math.sqrt(Math.max(0, minR * minR - shoulderX * shoulderX)));
  const top = Math.max(minR, shoulderY + caption.band + 3);
  const instrH = Math.ceil(top + sigil / 2 + caption.band + 8 + sealR + nameBand + 2);
  return { sigil, sealR, nameBand, caption, shoulderX, shoulderY, top, instrH };
}

export function computeLayout(opts: LayoutOptions): InstrumentLayout {
  const { width, height, groupCount } = opts;
  if (opts.rows) return rowsLayout(width, groupCount, opts.rows);
  const composition = compositionFor(width, groupCount, opts.tier);
  if (composition === "ledger") return rowsLayout(width, groupCount, phoneRows(width, height / groupCount));

  const pitch = width / groupCount;
  const c = constellationGeometry(opts.tier, pitch);
  const { sigil, sealR } = c;
  const sealY = height - c.nameBand - sealR - 2;
  const seals: SealGeometry[] = Array.from({ length: groupCount }, (_, g) => {
    const x = pitch * (g + 0.5);
    return {
      x, y: sealY, r: sealR,
      zone: { left: pitch * g, top: 0, right: pitch * (g + 1), bottom: height },
    };
  });
  // Seats 0–2 are the fan; 3 and 4 sit above the shoulders; beyond that an
  // honest pile above the top seat. Fixed per index: a seat never moves when a
  // neighbour empties.
  const offsets = (index: number): Point => {
    if (index === 0) return { x: 0, y: -c.top };
    if (index <= 2) return { x: (index === 1 ? -1 : 1) * c.shoulderX, y: -c.shoulderY };
    if (index <= 4) return { x: (index === 3 ? -1 : 1) * c.shoulderX, y: -(c.shoulderY + sigil + c.caption.band + 4) };
    const k = index - 4;
    return { x: 8 * k, y: -c.top - 10 * k };
  };
  const margin = c.caption.width / 2 + 2;
  const seat = (g: number, index: number): Point => {
    const s = seals[Math.max(0, Math.min(groupCount - 1, g))];
    const o = offsets(index);
    // A seat on the first or last seal is kept inside the board, caption included.
    return { x: Math.max(margin, Math.min(width - margin, s.x + o.x)), y: Math.max(sigil / 2 + 2, s.y + o.y) };
  };
  return { composition, width, height, sigil, seals, seat };
}

/** The group name under a row's seal: one line of 10px small caps plus a gap. */
export const SEAL_NAME_BAND = 14;

function rowsLayout(width: number, groupCount: number, g: RowsGeometry): InstrumentLayout {
  const seals: SealGeometry[] = Array.from({ length: groupCount }, (_, i) => ({
    x: g.sealCol / 2, y: g.rowH * i + g.lineY, r: g.sealR,
    zone: { left: 0, top: g.rowH * i, right: width, bottom: g.rowH * (i + 1) },
  }));
  const perRow = Math.max(1, Math.floor((width - g.sealCol) / g.seatPitch));
  const seat = (gi: number, index: number): Point => {
    const s = seals[Math.max(0, Math.min(groupCount - 1, gi))];
    const col = index % perRow;
    const overflow = Math.floor(index / perRow);
    // Beyond one wire (more than the deal ever puts in a group) the seats sit
    // between the wire's own, raised: a crowded but legible overflow, never a
    // reflow of the row.
    if (overflow === 0) return { x: g.sealCol + g.seatPitch * (col + 0.5), y: s.y };
    const x = g.sealCol + g.seatPitch * (col + 1) + (overflow - 1) * 8;
    return { x: Math.min(width - g.sigil / 2 - 2, x), y: s.y - Math.min(g.sigil / 2, 14) - (overflow - 1) * 8 };
  };
  return { composition: "ledger", width, height: g.rowH * groupCount, sigil: g.sigil, seals, seat };
}

/** Where the seal / seat line sits in a row so seal+name and sigil+caption are centred together. */
function lineYFor(rowH: number, sigil: number, sealR: number, band: number): number {
  const block = Math.max(sigil + band, 2 * sealR + SEAL_NAME_BAND);
  return Math.round((rowH - block) / 2 + Math.max(sigil, 2 * sealR) / 2);
}

/** Phone rows: three seats per wire, as wide as the board allows. */
function phoneRows(width: number, rowH?: number): RowsGeometry {
  const sealCol = width < 340 ? 78 : 86;
  const seatPitch = Math.max(76, Math.min(104, Math.floor((width - sealCol - 2) / 3)));
  const cap = captionSpec(seatPitch, 2);
  const sigil = 44;
  const sealR = 24;
  // No padding between phone rows: a phone board must stay as short as M1's.
  const need = Math.max(sigil + cap.band, 2 * sealR + SEAL_NAME_BAND);
  const h = Math.max(need, rowH ?? need);
  return { rowH: h, sealCol, sealR, seatPitch, sigil, lineY: lineYFor(h, sigil, sealR, cap.band) };
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

// ---------------------------------------------------------------- the ledger's room

export type LedgerMode = "rich" | "medium" | "compact";

export interface LedgerFit {
  /**
   * rich: name / "→ group · fact" / "was in …" (three lines);
   * medium: name / "→ group · was …" (two lines); compact: "name → group" (one line).
   */
  mode: LedgerMode;
  cols: number;
  itemH: number;
  gap: number;
  /** Total height the ledger needs for `count` corrections at this fit. */
  need: number;
}

export const LEDGER = { head: 34, pad: 8 } as const;
const LEDGER_ITEM: Record<LedgerMode, { h: number; gap: number; minW: number }> = {
  rich: { h: 46, gap: 4, minW: 196 },
  medium: { h: 29, gap: 3, minW: 140 },
  compact: { h: 22, gap: 2, minW: 176 },
};

function ledgerAt(mode: LedgerMode, count: number, w: number): LedgerFit {
  const { h: itemH, gap, minW } = LEDGER_ITEM[mode];
  const cols = Math.max(1, Math.min(3, count, Math.floor((w - 2 * LEDGER.pad + gap) / (minW + gap))));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { mode, cols, itemH, gap, need: LEDGER.head + 2 * LEDGER.pad + rows * itemH + (rows - 1) * gap };
}

/**
 * The richest arrangement of `count` corrections that fits a `w`×`h` box
 * (compact if none does). `withFacts`: the third (fact) line has something to say.
 */
export function ledgerFit(count: number, w: number, h: number, withFacts = true): LedgerFit {
  const modes: readonly LedgerMode[] = withFacts ? ["rich", "medium", "compact"] : ["medium", "compact"];
  const fits = modes.map((m) => ledgerAt(m, count, w));
  return fits.find((f) => f.need <= h) ?? fits.reduce((a, b) => (b.need < a.need ? b : a));
}

/** The height the ledger is OWED: every dealt entity corrected, in its shortest arrangement. Reserved at open. */
export function ledgerNeed(count: number, w: number): number {
  return Math.min(ledgerAt("medium", count, w).need, ledgerAt("compact", count, w).need);
}

// ---------------------------------------------------------------- the whole board

export interface WellPlan {
  x: number;
  top: number;
  w: number;
  h: number;
  pad: number;
  pitch: number;
  /** One socket row: sigil, caption, breathing room. */
  rowH: number;
  cols: number;
  rows: number;
  caption: CaptionSpec;
}

export interface BoardPlan {
  composition: Composition;
  /** The tier the board is drawn at (a host budget may afford a bigger one than the viewport's). */
  tier: HeightTier;
  rail: boolean;
  width: number;
  boardH: number;
  instrW: number;
  instrH: number;
  sigil: number;
  /** Seated captions (constellation: above the sigil; rows: below). */
  seatCaption: CaptionSpec;
  well: WellPlan;
  /** The ledger's box (board px): the well's footprint, never beyond it. */
  ledger: { x: number; top: number; w: number; h: number };
  rows: RowsGeometry | null;
  /** Head (prompt) and foot heights; the rail sets its prompt in the foot (headH 0). */
  headH: number;
  footH: number;
  /** Names the plan could not set in full (shown on hover/focus/hold instead). */
  truncated: number;
}

export interface PlanInput {
  width: number;
  /** The tallest the whole board may be (host stage), or undefined (grows with content). */
  maxHeight?: number;
  groupCount: number;
  labels: readonly string[];
  tier: HeightTier;
  /** The host shows a context line above the prompt. */
  hasContext?: boolean;
}

export const GAP_INSTRUMENT_WELL = 12;
/** Phones: a tighter seam between the rows and the well, and a footer just tall enough for two status lines and Lock. */
const PHONE_GAP = 6;
const PHONE_FOOT = 52;
const WELL_PAD = 8;
const RAIL_GAP = 10;
const RAIL_FOOT = 56;
/** The narrowest frame the rail is laid out in (seal column, three seats, a two-column well). */
export const RAIL_MIN_WIDTH = 520;

function headFor(tier: HeightTier, rowsOnPhone: boolean, hasContext: boolean): number {
  if (hasContext) return tier === "compact" ? 58 : tier === "tall" ? 72 : 66;
  if (rowsOnPhone) return 46;
  return tier === "compact" ? 44 : tier === "tall" ? 54 : 48;
}

function footFor(tier: HeightTier): number {
  return tier === "compact" ? 56 : tier === "tall" ? 68 : 64;
}

function wellFor(count: number, x: number, top: number, w: number, sigil: number, pitch: number, lines: 0 | 1 | 2, minH = 0): WellPlan {
  const cols = Math.max(1, Math.min(count, Math.floor((w - 2 * WELL_PAD) / pitch)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const caption = captionSpec(pitch, lines);
  const rowH = sigil + caption.band + 6;
  const h = Math.max(rows * rowH + 2 * WELL_PAD, minH);
  return { x, top, w, h, pad: WELL_PAD, pitch, rowH, cols, rows, caption };
}

/** The centre of well socket `i` (board px). Sockets sit centred in the well's reserved box. */
export function wellSocket(well: WellPlan, i: number): Point {
  const used = well.rows * well.rowH;
  const top = well.top + Math.max(WELL_PAD, (well.h - used) / 2);
  const left = well.x + (well.w - well.cols * well.pitch) / 2;
  const sigil = well.rowH - well.caption.band - 6;
  return { x: left + (i % well.cols) * well.pitch + well.pitch / 2, y: top + Math.floor(i / well.cols) * well.rowH + 3 + sigil / 2 };
}

/** The constellation, stacked over its well, at the host's tier. */
function constellationPlan(input: PlanInput): BoardPlan {
  const { width, groupCount: K, labels, tier } = input;
  const N = labels.length;
  const geo = constellationGeometry(tier, width / K);
  const { sigil } = geo;
  const instrH = geo.instrH;
  const seatCaption = geo.caption;
  // The well in as few rows as keep every name in two lines.
  let well: WellPlan | null = null;
  for (let r = 1; r <= N; r++) {
    const pitch = Math.min(112, Math.floor((width - 2 * WELL_PAD) / Math.ceil(N / r)));
    const cand = wellFor(N, 0, instrH + GAP_INSTRUMENT_WELL, width, sigil, pitch, 2);
    if (truncatedCount(labels, cand.caption) === 0 || r === N) { well = cand; break; }
    if (!well) well = cand;
  }
  const owed = ledgerNeed(N, width - 12);
  well = { ...well!, h: Math.max(well!.h, owed) };
  const headH = headFor(tier, false, Boolean(input.hasContext));
  const footH = footFor(tier);
  return {
    composition: "constellation", tier, rail: false, width, boardH: instrH + GAP_INSTRUMENT_WELL + well.h,
    instrW: width, instrH, sigil, seatCaption, well,
    ledger: { x: 6, top: well.top, w: width - 12, h: well.h },
    rows: null, headH, footH,
    truncated: truncatedCount(labels, seatCaption) + truncatedCount(labels, well.caption),
  };
}

/** Phone / unbudgeted rows: wires stacked over the well, sized for two-line names. */
function stackedRowsPlan(input: PlanInput): BoardPlan {
  const { width, groupCount: K, labels, tier } = input;
  const N = labels.length;
  const rows = phoneRows(width);
  const seatCaption = captionSpec(rows.seatPitch, 2);
  const instrH = rows.rowH * K;
  const gap = PHONE_GAP;
  // The well as wide as 76px sockets allow: on a phone, height is the scarce
  // thing (M1's board fits the screen); a name too long for its two lines is
  // named whole on tap.
  const avail = width - 2 * WELL_PAD;
  const owed = ledgerNeed(N, width - 12);
  const cols = Math.max(1, Math.min(N, Math.floor(avail / 76)));
  // Dense five-tree phone boards otherwise push Ranked's lower controls far
  // below the fold. Keep two-line captions on every SEATED rune; in the
  // waiting well allow a single line (full names remain available on tap/hold).
  // The well still reserves the full worst-case correction ledger height.
  const wellLines: 1 | 2 = K >= 5 && width <= 420 ? 1 : 2;
  const well = wellFor(N, 0, instrH + gap, width, rows.sigil, Math.min(104, Math.floor(avail / cols)), wellLines, owed);
  return {
    composition: "ledger", tier, rail: false, width, boardH: instrH + gap + well.h,
    instrW: width, instrH, sigil: rows.sigil, seatCaption, well,
    ledger: { x: 6, top: well.top, w: width - 12, h: well.h },
    rows, headH: headFor(tier, true, Boolean(input.hasContext)), footH: PHONE_FOOT,
    truncated: truncatedCount(labels, seatCaption) + truncatedCount(labels, well.caption),
  };
}

interface RailCandidate { plan: BoardPlan; score: number[] }

/**
 * The RAIL: rows and well side by side inside the host's budget. Searches the
 * caption form, sigil size and pitches that fit, and keeps the one that sets
 * the most names in full (then the larger sigil, then the larger type).
 */
function railPlan(input: PlanInput, budget: number): BoardPlan | null {
  const { width, groupCount: K, labels } = input;
  const N = labels.length;
  const boardBudget = budget - RAIL_FOOT - 2;
  const sealCol = 92;
  // A tall, wide arena should not leave most of its parchment unused.
  // Only expand when the stage genuinely offers room: short-desktop and
  // phone plans retain their certified footprints and hit target sizes.
  const roomyRail = budget >= 600 && width >= 640;
  let best: RailCandidate | null = null;
  for (const seatLines of [2, 1, 0] as const) {
    for (const sigil of (roomyRail ? [58, 52, 48, 44] : [52, 48, 44])) {
      for (const seatPitch of [112, 104, 96, 88, 80]) {
        const seatCaption = captionSpec(seatPitch, seatLines);
        if (seatLines === 0 && seatPitch > 80) continue;
        const wiresW = sealCol + 3 * seatPitch;
        const wellW = width - wiresW - RAIL_GAP;
        if (wellW < 2 * 72 + 2 * WELL_PAD) continue;
        // Rows: the biggest seal that still fits the budget (≥ 44px target),
        // with breathing room between rows if the budget has it.
        let rowNeed = 0;
        let sealR = 0;
        search: for (const pad of [4, 0]) {
          for (const r of [26, 24, 22]) {
            const need = Math.max(sigil + seatCaption.band, 2 * r + SEAL_NAME_BAND) + pad;
            if (need * K <= boardBudget) { rowNeed = need; sealR = r; break search; }
          }
        }
        if (!sealR) continue;
        for (const wellLines of [2, 1] as const) {
          for (let cols = Math.max(1, Math.floor((wellW - 2 * WELL_PAD) / 120)); cols <= Math.floor((wellW - 2 * WELL_PAD) / 72); cols++) {
            const pitch = Math.min(120, Math.floor((wellW - 2 * WELL_PAD) / cols));
            const owed = ledgerNeed(N, wellW - 4) + 4;
            const well = wellFor(N, wiresW + RAIL_GAP, 0, wellW, sigil, pitch, wellLines, owed);
            if (well.h > boardBudget) continue;
            // Larger desktop stages get broader rhythm and (when names fit)
            // 58px rune art, while never exceeding the measured stage budget.
            // Short desktops preserve MG-UX1's 24px cap.
            const breathing = roomyRail ? 88 : 24;
            const rowH = Math.max(rowNeed, Math.min(Math.floor(boardBudget / K), rowNeed + breathing));
            const finalBoardH = Math.max(rowH * K, well.h);
            const fullWell = { ...well, h: finalBoardH };
            const truncated = (seatLines === 0 ? N : truncatedCount(labels, seatCaption)) + truncatedCount(labels, well.caption);
            const plan: BoardPlan = {
              composition: "ledger", tier: input.tier, rail: true, width, boardH: finalBoardH,
              instrW: wiresW, instrH: rowH * K, sigil, seatCaption, well: fullWell,
              ledger: { x: fullWell.x + 2, top: 2, w: wellW - 4, h: finalBoardH - 4 },
              rows: { rowH, sealCol, sealR, seatPitch, sigil, lineY: lineYFor(rowH, sigil, sealR, seatCaption.band) },
              headH: 0, footH: RAIL_FOOT, truncated,
            };
            // Most names in full; then no seat caption hidden; then type, sigil, seal.
            const score = [-truncated, seatLines === 0 ? 0 : 1, seatCaption.font + well.caption.font, sigil, sealR, -finalBoardH];
            if (!best || better(score, best.score)) best = { plan, score };
          }
        }
      }
    }
  }
  return best?.plan ?? null;
}

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function planHeight(plan: BoardPlan): number {
  return plan.headH + plan.boardH + plan.footH + 2;
}

/**
 * The board for a box, a budget and a deal. Constellation where it honestly
 * fits (wide enough per seal, and inside the budget); otherwise the ledger's
 * rows — side by side with the well (RAIL) when a host budget exists and the
 * frame is wide enough, stacked over it (phones) when not.
 */
export function planBoard(input: PlanInput): BoardPlan {
  const { width, groupCount: K, tier, maxHeight } = input;
  // Inside a host budget the biggest constellation that fits is drawn,
  // whatever the viewport's own tier; without one, the host's tier.
  const tiers: readonly HeightTier[] = maxHeight === undefined ? [tier] : ["tall", "normal", "compact"];
  let fan: BoardPlan | null = null;
  for (const t of tiers) {
    if (compositionFor(width, K, t) !== "constellation") continue;
    const c = constellationPlan({ ...input, tier: t });
    if (maxHeight !== undefined && planHeight(c) > maxHeight) continue;
    // The tier that names the most in full; the bigger one on a tie.
    if (!fan || c.truncated < fan.truncated) fan = c;
  }
  if (fan) return fan;
  if (compositionFor(width, K, tier) === "constellation" && width < RAIL_MIN_WIDTH) return constellationPlan(input);
  if (maxHeight !== undefined && width >= RAIL_MIN_WIDTH) {
    const r = railPlan(input, maxHeight);
    if (r) return r;
  }
  return stackedRowsPlan(input);
}
