/**
 * MIG — POSITIONAL ASSEMBLY (ASSIGN), as pure data.
 *
 * The board is a map from position id to card token (or null). Two
 * invariants hold after every operation here, and the primitive relies on
 * them instead of re-checking:
 *
 *   1. every position holds at most ONE card;
 *   2. every card sits in at most ONE position.
 *
 * So placing a card that is already on the board MOVES it (and if the target
 * is occupied, the two cards SWAP), and placing a card from the tray onto an
 * occupied position sends the occupant back to the tray. Nothing here knows
 * what a position means or which card belongs where: no function in this
 * file reads a reveal.
 */
import type { PositionalAssemblyPublic, PositionalAssemblyValue } from "./types";
import { snapToSocket, type SnapRect } from "./reconstruct";

export const ASSEMBLY_MIN_POSITIONS = 2;
export const ASSEMBLY_MAX_POSITIONS = 8;
export const ASSEMBLY_MAX_CARDS = 20;

export function assertPositionalAssemblyContent(
  content: Pick<PositionalAssemblyPublic, "positions" | "cards">,
): void {
  const n = content.positions.length;
  if (n < ASSEMBLY_MIN_POSITIONS || n > ASSEMBLY_MAX_POSITIONS) {
    throw new Error(`PositionalAssembly: ${n} positions; expected ${ASSEMBLY_MIN_POSITIONS}–${ASSEMBLY_MAX_POSITIONS}`);
  }
  const ids = new Set(content.positions.map((p) => p.id));
  if (ids.size !== n) throw new Error("PositionalAssembly: position ids must be distinct");
  const m = content.cards.length;
  if (m < n || m > ASSEMBLY_MAX_CARDS) {
    throw new Error(`PositionalAssembly: ${m} cards; expected ${n}–${ASSEMBLY_MAX_CARDS}`);
  }
  const tokens = new Set(content.cards.map((c) => c.token));
  if (tokens.size !== m) throw new Error("PositionalAssembly: card tokens must be distinct");
}

/** Every position empty. */
export function emptyBoard(content: Pick<PositionalAssemblyPublic, "positions">): Record<string, string | null> {
  return Object.fromEntries(content.positions.map((p) => [p.id, null]));
}

/**
 * A board with every position present, unknown tokens dropped and a token
 * that appears twice kept only at its first position (host order).
 */
export function normalizeBoard(
  content: Pick<PositionalAssemblyPublic, "positions" | "cards">,
  value: PositionalAssemblyValue | null | undefined,
): Record<string, string | null> {
  const known = new Set(content.cards.map((c) => c.token));
  const seen = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const p of content.positions) {
    const t = value?.[p.id] ?? null;
    if (t !== null && known.has(t) && !seen.has(t)) { out[p.id] = t; seen.add(t); }
    else out[p.id] = null;
  }
  return out;
}

/** The position a card sits in, or null when it is in the tray. */
export function positionOf(board: PositionalAssemblyValue, token: string): string | null {
  for (const [id, t] of Object.entries(board)) if (t === token) return id;
  return null;
}

export type PlaceOutcome =
  /** The card went into an empty position. */
  | { kind: "placed"; next: Record<string, string | null> }
  /** The card went in and the occupant went back to the tray. */
  | { kind: "replaced"; next: Record<string, string | null>; displaced: string }
  /** The card moved from one position to another empty one. */
  | { kind: "moved"; next: Record<string, string | null>; from: string }
  /** Two placed cards exchanged positions. */
  | { kind: "swapped"; next: Record<string, string | null>; from: string; other: string }
  /** It was already there. */
  | { kind: "same"; next: Record<string, string | null> }
  /** Unknown position. */
  | { kind: "invalid"; next: Record<string, string | null> };

/** THE placement: every input path (tap, drop, keyboard) ends here. */
export function placeCard(
  board: PositionalAssemblyValue, positionId: string, token: string,
): PlaceOutcome {
  const next: Record<string, string | null> = { ...board };
  if (!(positionId in next)) return { kind: "invalid", next };
  const occupant = next[positionId];
  if (occupant === token) return { kind: "same", next };
  const from = positionOf(board, token);
  next[positionId] = token;
  if (from !== null) {
    if (occupant !== null) { next[from] = occupant; return { kind: "swapped", next, from, other: occupant }; }
    next[from] = null;
    return { kind: "moved", next, from };
  }
  if (occupant !== null) return { kind: "replaced", next, displaced: occupant };
  return { kind: "placed", next };
}

/** The first empty position in host order, or null when the board is full. */
export function firstEmpty(
  content: Pick<PositionalAssemblyPublic, "positions">, board: PositionalAssemblyValue,
): string | null {
  return content.positions.find((p) => board[p.id] === null)?.id ?? null;
}

/** Empty one position. */
export function clearPosition(
  board: PositionalAssemblyValue, positionId: string,
): { next: Record<string, string | null>; removed: string | null } {
  const next: Record<string, string | null> = { ...board };
  const removed = next[positionId] ?? null;
  if (positionId in next) next[positionId] = null;
  return { next, removed };
}

export function filledCount(board: PositionalAssemblyValue): number {
  return Object.values(board).filter((t) => t !== null).length;
}

/** Every position filled: the only condition Lock has. */
export function isBoardFull(board: PositionalAssemblyValue): boolean {
  const values = Object.values(board);
  return values.length > 0 && values.every((t) => t !== null);
}

/** The tokens on the board, as a set. */
export function placedTokens(board: PositionalAssemblyValue): Set<string> {
  return new Set(Object.values(board).filter((t): t is string => t !== null));
}

// ----------------------------------------------------------------- pointer

/** How far beyond the board a drop still lands on a position (px). */
export const BOARD_DROP_SLACK = { x: 24, y: 40 } as const;
/** Pointer travel (px) before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 6;

/**
 * Which position a drop lands in: the nearest position centre inside the
 * board region grown by `slack`, or null outside it. Forgiving on purpose
 * (Reconstruct's rule): a drop between two positions still lands.
 */
export function snapToPosition(
  point: { x: number; y: number },
  positions: readonly { id: string; rect: SnapRect }[],
  slack: { x: number; y: number } = BOARD_DROP_SLACK,
): string | null {
  const i = snapToSocket(point, positions.map((p) => p.rect), slack);
  return i === null ? null : positions[i].id;
}

/** True when a point is inside a rectangle grown by `slack`. */
export function insideRect(
  point: { x: number; y: number }, rect: SnapRect, slack: { x: number; y: number },
): boolean {
  return point.x >= rect.left - slack.x && point.x <= rect.right + slack.x
    && point.y >= rect.top - slack.y && point.y <= rect.bottom + slack.y;
}

// ---------------------------------------------------------------- keyboard

/** Where an arrow / Home / End key moves a roving focus inside a grid. Null for other keys. */
export function gridMove(key: string, index: number, count: number, cols: number): number | null {
  const last = count - 1;
  const to = key === "ArrowRight" ? index + 1
    : key === "ArrowLeft" ? index - 1
    : key === "ArrowDown" ? index + cols
    : key === "ArrowUp" ? index - cols
    : key === "Home" ? 0
    : key === "End" ? last : null;
  if (to === null) return null;
  return to < 0 || to > last ? index : to;
}

/** A digit key 1..N names the N-th position; null otherwise. */
export function positionForDigit(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number(key) - 1;
  return i < count ? i : null;
}

// ------------------------------------------------------------------ reveal

/**
 * The reveal is three stages on one bounded clock (≤ 2 s):
 *
 *   marks    0 –  700 ms  each position gains its mark, position by position
 *   settle 700 – 1500 ms  each wrong position demotes the player's card to a
 *                         small "your pick" and the canonical card settles in,
 *                         position by position
 *   context 1500 – 1900   the context plate takes the tray's place
 *
 * No wrong position: no settle stage (marks, then context at 700). Reduced
 * motion: no clock at all (`instant`); the first frame is the settled frame.
 */
export type AssemblyStage = "marks" | "settle" | "context" | "done";

export const ASSEMBLY_TIMING = {
  marksEnd: 700,
  settleEnd: 1500,
  contextEnd: 1900,
  /** Per-position stagger inside the marks window. */
  markStagger: 110,
  markTween: 260,
  /** Per-position stagger inside the settle window. */
  settleStagger: 120,
  settleTween: 320,
  contextTween: 320,
} as const;

export interface AssemblyPlan {
  instant: boolean;
  stages: readonly { stage: Exclude<AssemblyStage, "done">; start: number; end: number }[];
  totalMs: number;
}

export function planAssemblyReveal({ reduced, anyWrong }: { reduced: boolean; anyWrong: boolean }): AssemblyPlan {
  if (reduced) return { instant: true, stages: [], totalMs: 0 };
  const T = ASSEMBLY_TIMING;
  const stages: { stage: Exclude<AssemblyStage, "done">; start: number; end: number }[] = [
    { stage: "marks", start: 0, end: T.marksEnd },
  ];
  let at: number = T.marksEnd;
  if (anyWrong) { stages.push({ stage: "settle", start: at, end: T.settleEnd }); at = T.settleEnd; }
  stages.push({ stage: "context", start: at, end: at + (T.contextEnd - T.settleEnd) });
  at += T.contextEnd - T.settleEnd;
  return { instant: false, stages, totalMs: at };
}

export function assemblyStageAt(plan: AssemblyPlan, elapsedMs: number): AssemblyStage {
  if (plan.instant || elapsedMs >= plan.totalMs) return "done";
  const active = plan.stages.find((s) => elapsedMs >= s.start && elapsedMs < s.end);
  return active ? active.stage : "done";
}

/** True once the canonical cards are on show (every stage after marks). */
export const showsSettled = (stage: AssemblyStage) => stage !== "marks";
/** True once the context plate is on show. */
export const showsContext = (stage: AssemblyStage) => stage === "context" || stage === "done";

/** Delay for the `index`-th position's mark tween; the last of 8 ends inside the window. */
export function markDelayMs(index: number): number {
  const T = ASSEMBLY_TIMING;
  const span = T.marksEnd - T.markTween;
  return Math.min(index * T.markStagger, Math.max(0, span));
}

/** Delay for the `index`-th WRONG position's settle tween; the last of 8 ends inside the window. */
export function settleDelayMs(index: number): number {
  const T = ASSEMBLY_TIMING;
  const span = T.settleEnd - T.marksEnd - T.settleTween;
  return Math.min(index * T.settleStagger, Math.max(0, span));
}

// ------------------------------------------------------------ plain speech

/** 1–3 characters for a card with no art: initials of up to two words. */
export function monogramFor(label: string): string {
  const words = label.replace(/\(.*?\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]).slice(0, 3);
}

export function sentenceCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
