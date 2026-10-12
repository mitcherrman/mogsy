/**
 * MIG — GLYPH PRESS (SPELL): the pure instrument.
 *
 * Everything here is presentation arithmetic — how a phrase's sockets are
 * laid into the forme, how the cursor steps between the sockets the player
 * may fill, where the drum sits for a glyph, how a reveal is clocked. None of
 * it knows an answer: a ledger says which sockets are engraved, a reveal says
 * what the glyphs are, and this module only arranges what it is handed.
 */
import type {
  GlyphPressCell, GlyphPressLedger, GlyphPressPublic, GlyphPressReveal, GlyphPressSounding, GlyphPressStructure, GlyphPressValue,
} from "./types";

export const GLYPH_PRESS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The drum's clearing tile: sits before the first glyph. */
export const CLEAR_TILE = "⌫";

export function assertGlyphPressContent(content: GlyphPressPublic): void {
  const { structure, alphabet, soundingsAllowed } = content;
  if (!structure.cells.length) throw new Error("glyph press: the structure is empty");
  const glyphs = structure.cells.filter((c): c is Extract<GlyphPressCell, { kind: "glyph" }> => c.kind === "glyph");
  if (glyphs.length !== structure.glyphCount) throw new Error("glyph press: glyphCount disagrees with the cells");
  glyphs.forEach((g, i) => { if (g.index !== i) throw new Error("glyph press: socket indices must run 0..n-1 in reading order"); });
  if (!alphabet.length || new Set(alphabet).size !== alphabet.length) throw new Error("glyph press: the alphabet must be non-empty and distinct");
  if (alphabet !== alphabet.toUpperCase()) throw new Error("glyph press: the alphabet must be uppercase");
  if (!Number.isInteger(soundingsAllowed) || soundingsAllowed < 0) throw new Error("glyph press: soundingsAllowed must be a non-negative integer");
}

// --------------------------------------------------------------- the forme

export interface FormeBox { width: number; height: number }

export type PlacedItem =
  | { kind: "glyph"; index: number; x: number; y: number; w: number; row: number }
  | { kind: "mark"; text: string; x: number; y: number; w: number; row: number }
  /** A continuation tick where a word had to break across rows. */
  | { kind: "break"; x: number; y: number; w: number; row: number };

export interface FormeLayout {
  /** The socket's side in px. */
  cell: number;
  gap: number;
  rowPitch: number;
  /** The block's extent; the component centres it in the forme. */
  width: number;
  height: number;
  rows: number;
  items: readonly PlacedItem[];
  /** True when even the smallest socket could not fit: the block overflows the box. */
  overflow: boolean;
}

export const FORME_CELL_SIZES: readonly number[] = [44, 40, 36, 32, 28, 24, 20];

type Word = readonly GlyphPressCell[];

function words(structure: GlyphPressStructure): Word[] {
  const out: GlyphPressCell[][] = [];
  let cur: GlyphPressCell[] = [];
  for (const c of structure.cells) {
    if (c.kind === "gap") { if (cur.length) out.push(cur); cur = []; }
    else cur.push(c);
  }
  if (cur.length) out.push(cur);
  return out;
}

interface Metrics { cell: number; gap: number; wordGap: number; markW: number; breakW: number; rowPitch: number }

function metricsFor(cell: number): Metrics {
  return {
    cell,
    gap: Math.max(3, Math.round(cell * 0.14)),
    wordGap: Math.round(cell * 0.55),
    markW: Math.round(cell * 0.5),
    breakW: Math.round(cell * 0.4),
    rowPitch: cell + Math.max(6, Math.round(cell * 0.3)),
  };
}

const itemWidth = (c: GlyphPressCell, m: Metrics) => (c.kind === "glyph" ? m.cell : m.markW);

/** A null cell is a break tick; a `gap` cell is the spacer between two words on one row. */
type Piece = { cell: GlyphPressCell | null; w: number };

/** Flows words into rows no wider than `maxW`; a word wider than a row breaks with a tick. */
function flow(ws: Word[], m: Metrics, maxW: number): { rows: Piece[][]; widest: number } {
  const rows: Piece[][] = [];
  let row: Piece[] = [];
  let widest = 0;
  const widthOf = (pieces: Piece[]) => pieces.reduce((s, p) => s + p.w, 0) + Math.max(0, pieces.length - 1) * m.gap;
  const close = () => { if (row.length) { rows.push(row); widest = Math.max(widest, widthOf(row)); } row = []; };
  // The spacer plus the two inter-piece gaps around it add up to one word gap.
  const spacer = (): Piece => ({ cell: { kind: "gap" }, w: Math.max(0, m.wordGap - 2 * m.gap) });
  for (const w of ws) {
    const pieces: Piece[] = w.map((c) => ({ cell: c, w: itemWidth(c, m) }));
    const wW = widthOf(pieces);
    if (wW <= maxW) {
      const need = row.length ? widthOf([...row, spacer(), ...pieces]) : wW;
      if (row.length && need > maxW) close();
      if (row.length) row.push(spacer());
      row.push(...pieces);
      continue;
    }
    // The word is wider than a row: break it into chunks that fit, each ending in a tick.
    close();
    let chunk: Piece[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const last = i === pieces.length - 1;
      const trial = [...chunk, p];
      const trialW = widthOf(trial) + (last ? 0 : m.gap + m.breakW);
      if (chunk.length && trialW > maxW) {
        const withTick = [...chunk, { cell: null, w: m.breakW }];
        rows.push(withTick);
        widest = Math.max(widest, widthOf(withTick));
        chunk = [p];
      } else chunk = trial;
    }
    if (chunk.length) { rows.push(chunk); widest = Math.max(widest, widthOf(chunk)); }
  }
  close();
  return { rows, widest };
}

/**
 * Lays the phrase into the box: the largest socket in `sizes` whose rows fit
 * both the width and the height. Rows are centred; the block is centred by
 * the component. Deterministic for a (structure, box) pair, so a round's
 * geometry is fixed the moment the forme is measured.
 */
export function layoutForme(structure: GlyphPressStructure, box: FormeBox, sizes: readonly number[] = FORME_CELL_SIZES): FormeLayout {
  const ws = words(structure);
  let chosen: { m: Metrics; rows: Piece[][]; widest: number; overflow: boolean } | null = null;
  for (const size of sizes) {
    const m = metricsFor(size);
    const { rows, widest } = flow(ws, m, Math.max(1, box.width));
    const blockH = rows.length * m.rowPitch - (m.rowPitch - m.cell);
    const fits = widest <= box.width && blockH <= box.height;
    chosen = { m, rows, widest, overflow: !fits };
    if (fits) break;
  }
  if (!chosen) throw new Error("glyph press: no socket sizes");
  const { m, rows, widest, overflow } = chosen;
  const items: PlacedItem[] = [];
  rows.forEach((row, r) => {
    const rowW = row.reduce((s, p) => s + p.w, 0) + Math.max(0, row.length - 1) * m.gap;
    let x = Math.round((widest - rowW) / 2);
    const y = r * m.rowPitch;
    for (const p of row) {
      if (p.cell === null) items.push({ kind: "break", x, y, w: p.w, row: r });
      else if (p.cell.kind === "glyph") items.push({ kind: "glyph", index: p.cell.index, x, y, w: p.w, row: r });
      else if (p.cell.kind === "mark") items.push({ kind: "mark", text: p.cell.text, x, y, w: p.w, row: r });
      // a `gap` piece only advances x
      x += p.w + m.gap;
    }
  });
  return {
    cell: m.cell, gap: m.gap, rowPitch: m.rowPitch, width: widest,
    height: rows.length * m.rowPitch - (m.rowPitch - m.cell), rows: rows.length, items, overflow,
  };
}

// -------------------------------------------------------------- the cursor

/** Sockets the player may fill: those the ledger has not engraved. */
export function openSockets(ledger: GlyphPressLedger): number[] {
  const out: number[] = [];
  ledger.engraved.forEach((g, i) => { if (g === null) out.push(i); });
  return out;
}

/** The first open socket that is still blank; or the first open socket; or null when nothing is open. */
export function firstBlankSocket(value: GlyphPressValue, ledger: GlyphPressLedger): number | null {
  const open = openSockets(ledger);
  return open.find((i) => !value[i]) ?? open[0] ?? null;
}

/** The next open socket from `from` in `dir`; clamps at the ends (no wrap). `from` may be engraved. */
export function stepSocket(from: number | null, dir: 1 | -1, ledger: GlyphPressLedger): number | null {
  const open = openSockets(ledger);
  if (!open.length) return null;
  if (from === null) return dir > 0 ? open[0] : open[open.length - 1];
  const after = dir > 0 ? open.filter((i) => i > from) : open.filter((i) => i < from);
  if (!after.length) return open.includes(from) ? from : dir > 0 ? open[open.length - 1] : open[0];
  return dir > 0 ? after[0] : after[after.length - 1];
}

/** How many open sockets are still blank. */
export function blankCount(value: GlyphPressValue, ledger: GlyphPressLedger): number {
  return openSockets(ledger).filter((i) => !value[i]).length;
}

/**
 * The player's value reconciled with a new ledger: an engraved socket drops
 * the player's glyph, and a glyph a sounding has fully placed vanishes from
 * any socket it does not own (the instrument corrects a contradicted guess).
 */
export function reconcileValue(value: GlyphPressValue, ledger: GlyphPressLedger): GlyphPressValue {
  const placed = new Set(ledger.soundings.map((s) => s.glyph));
  return ledger.engraved.map((g, i) => {
    if (g !== null) return null;
    const v = value[i] ?? null;
    return v && placed.has(v) ? null : v;
  });
}

/** The full response: engraved glyphs where the ledger has them, the player's elsewhere. */
export function responseGlyphs(value: GlyphPressValue, ledger: GlyphPressLedger): (string | null)[] {
  return ledger.engraved.map((g, i) => g ?? value[i] ?? null);
}

// ---------------------------------------------------------------- the drum

export type GlyphState = "free" | "sounded" | "tarnished" | "pending";

export function glyphState(glyph: string, soundings: readonly GlyphPressSounding[], pending: string | null): GlyphState {
  if (pending === glyph) return "pending";
  const s = soundings.find((x) => x.glyph === glyph);
  if (!s) return "free";
  return s.hits > 0 ? "sounded" : "tarnished";
}

/** The drum's tiles: the clearing tile, then the alphabet. */
export function drumTiles(alphabet: string): string[] {
  return [CLEAR_TILE, ...alphabet.split("")];
}

/** Tile index of a glyph on the drum (the clearing tile is 0); -1 when the drum lacks it. */
export function drumIndexOf(glyph: string, alphabet: string): number {
  const i = alphabet.indexOf(glyph);
  return i < 0 ? -1 : i + 1;
}

export function clampDrum(index: number, alphabet: string): number {
  return Math.max(0, Math.min(alphabet.length, Math.round(index)));
}

/** The translation that centres tile `index` (fractional while dragging) in a window of `windowW`. */
export function drumOffsetPx(index: number, windowW: number, tileW: number, gap: number): number {
  return windowW / 2 - (index * (tileW + gap) + tileW / 2);
}

/** The glyph the player typed, as a drum glyph; null for anything the drum does not carry. */
export function keyToGlyph(key: string, alphabet: string): string | null {
  if (key.length !== 1) return null;
  const g = key.toUpperCase();
  return alphabet.includes(g) ? g : null;
}

/** How many soundings remain. */
export function soundingsLeft(content: GlyphPressPublic, ledger: GlyphPressLedger): number {
  return Math.max(0, content.soundingsAllowed - ledger.soundings.length);
}

// -------------------------------------------------------------- the reveal

export type GlyphPressStage = "ink" | "verdict" | "done";

export interface GlyphPressPlan {
  instant: boolean;
  inkMs: number;
  verdictMs: number;
  totalMs: number;
}

/**
 * The press inks left to right across the forme (`ink`), the plaque turns
 * (`verdict`), then the instrument is at rest (`done`). Reduced motion: no
 * clock at all; the first revealed frame is the settled frame.
 */
export function planGlyphPressReveal({ reduced, budgetMs = 1800, glyphCount }: { reduced: boolean; budgetMs?: number; glyphCount: number }): GlyphPressPlan {
  if (reduced) return { instant: true, inkMs: 0, verdictMs: 0, totalMs: 0 };
  const scale = budgetMs / 1800;
  const inkMs = Math.round(Math.min(1200, 520 + glyphCount * 42) * scale);
  const verdictMs = Math.round(520 * scale);
  return { instant: false, inkMs, verdictMs, totalMs: inkMs + verdictMs };
}

export function stageAt(plan: GlyphPressPlan, elapsed: number): GlyphPressStage {
  if (plan.instant || elapsed >= plan.totalMs) return "done";
  if (elapsed >= plan.inkMs) return "verdict";
  return "ink";
}

/** 0..1 across the forme's width: the ink's leading edge. */
export function inkProgress(plan: GlyphPressPlan, elapsed: number): number {
  if (plan.instant || plan.inkMs <= 0) return 1;
  const t = Math.max(0, Math.min(1, elapsed / plan.inkMs));
  // Ease-out: the roller lands softly.
  return 1 - (1 - t) * (1 - t);
}

/** Whether the ink has reached a socket whose centre sits at `cx` of a block `width` wide. */
export function inkReached(progress: number, cx: number, width: number): boolean {
  if (width <= 0) return progress >= 1;
  // A little lead so the last socket resolves before the ink stage ends.
  return progress * (width + 24) >= cx;
}

export function showsVerdict(stage: GlyphPressStage): boolean {
  return stage === "verdict" || stage === "done";
}

export function verdictWord(reveal: GlyphPressReveal): string {
  return reveal.verdict === "solved" ? "Solved" : reveal.verdict === "partial" ? "Partly set" : "Missed";
}
