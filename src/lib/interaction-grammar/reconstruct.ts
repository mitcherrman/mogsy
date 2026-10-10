/**
 * MIG — RECONSTRUCT's pure helpers. Unordered multiset assembly knows tokens,
 * socket counts and placement limits, and nothing else: no domain, no data, no
 * League words, no points.
 *
 * Placement only (`normalizePlacement`, `placeFromTray` over `placeToken`,
 * `clearSlot`, `countUses`, `snapToSocket`): it keeps the board within the
 * host's limits and never asks whether a placement is right.
 *
 * GM1-R1: there is deliberately NO grader here. STUDIO3-S2's `gradeAssembly`
 * was ported to the server (`ranked_modules/reconstruct.py::grade_assembly`),
 * which owns correctness, the per-socket marks and the settled sockets. The
 * browser only displays what the server returns, so it cannot compute recipe
 * truth even by accident.
 */
import type { AssemblyOption, ReconstructPublic } from "./types";

export const RECONSTRUCT_MIN_SLOTS = 2;
export const RECONSTRUCT_MAX_SLOTS = 4;
export const RECONSTRUCT_MIN_OPTIONS = 2;
export const RECONSTRUCT_MAX_OPTIONS = 8;

/** The placement limit for one option: `maxUses`, defaulting to 1. */
export function maxUsesOf(option: Pick<AssemblyOption, "maxUses">): number {
  return option.maxUses ?? 1;
}

/**
 * Throws on a configuration the primitive cannot honour (fail loudly, never
 * clamp a bad config: the `assertScrubRange` precedent).
 */
export function assertReconstructContent(content: Pick<ReconstructPublic, "slotCount" | "options">): void {
  const { slotCount, options } = content;
  if (!Number.isInteger(slotCount) || slotCount < RECONSTRUCT_MIN_SLOTS || slotCount > RECONSTRUCT_MAX_SLOTS) {
    throw new Error(
      `Reconstruct: slotCount (${slotCount}) must be an integer from ${RECONSTRUCT_MIN_SLOTS} to ${RECONSTRUCT_MAX_SLOTS}`);
  }
  if (options.length < RECONSTRUCT_MIN_OPTIONS || options.length > RECONSTRUCT_MAX_OPTIONS) {
    throw new Error(
      `Reconstruct: ${options.length} options; the tray holds ${RECONSTRUCT_MIN_OPTIONS} to ${RECONSTRUCT_MAX_OPTIONS}`);
  }
  const seen = new Set<string>();
  let capacity = 0;
  for (const o of options) {
    if (!o.token) throw new Error("Reconstruct: an option has an empty token");
    if (seen.has(o.token)) throw new Error(`Reconstruct: duplicate option token "${o.token}" (the tray holds each option once)`);
    seen.add(o.token);
    const max = maxUsesOf(o);
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`Reconstruct: maxUses for "${o.token}" (${max}) must be a positive integer`);
    }
    capacity += Math.min(max, slotCount);
  }
  if (capacity < slotCount) {
    throw new Error(`Reconstruct: the options can fill at most ${capacity} of ${slotCount} sockets, so Lock could never enable`);
  }
}

/** How many sockets each token fills. Nulls are skipped. */
export function countUses(value: readonly (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of value) if (t !== null) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

/**
 * The board the primitive draws, whatever the caller passed: exactly
 * `slotCount` sockets, only tokens the tray dealt, no token beyond its
 * `maxUses` (the later sockets are emptied). A stale, short or over-limit value
 * can therefore never break a limit or hide a socket.
 */
export function normalizePlacement(
  content: Pick<ReconstructPublic, "slotCount" | "options">,
  value: readonly (string | null)[],
): (string | null)[] {
  const limit = new Map(content.options.map((o) => [o.token, maxUsesOf(o)]));
  const used = new Map<string, number>();
  const out: (string | null)[] = [];
  for (let i = 0; i < content.slotCount; i++) {
    const t = value[i] ?? null;
    const max = t === null ? undefined : limit.get(t);
    if (t === null || max === undefined || (used.get(t) ?? 0) >= max) { out.push(null); continue; }
    used.set(t, (used.get(t) ?? 0) + 1);
    out.push(t);
  }
  return out;
}

export type PlaceOutcome =
  | { kind: "placed"; next: (string | null)[] }
  | { kind: "replaced"; next: (string | null)[]; previous: string }
  /** The socket already holds this token: nothing to do. */
  | { kind: "same"; next: (string | null)[] }
  | { kind: "at-limit"; next: (string | null)[]; used: number; max: number }
  /** No socket was named and none is empty. */
  | { kind: "full"; next: (string | null)[] }
  | { kind: "invalid"; next: (string | null)[] };

/**
 * Put `token` into socket `slot` of an already-normalised board. Replacing
 * frees the old occupant first, so swapping never needs a free use of the new
 * token's old socket and never exceeds a limit.
 */
export function placeToken(
  content: Pick<ReconstructPublic, "slotCount" | "options">,
  board: readonly (string | null)[],
  slot: number,
  token: string,
): PlaceOutcome {
  const next = [...board];
  const option = content.options.find((o) => o.token === token);
  if (!option || !Number.isInteger(slot) || slot < 0 || slot >= content.slotCount) return { kind: "invalid", next };
  const current = board[slot] ?? null;
  if (current === token) return { kind: "same", next };
  const used = countUses(board).get(token) ?? 0;
  const max = maxUsesOf(option);
  if (used >= max) return { kind: "at-limit", next, used, max };
  next[slot] = token;
  return current === null ? { kind: "placed", next } : { kind: "replaced", next, previous: current };
}

/** The first empty socket, or -1 on a full board. Position carries no meaning. */
export function nextEmptySlot(board: readonly (string | null)[]): number {
  return board.findIndex((t) => t === null);
}

/**
 * THE placement every input path calls (R2): a tap or click on a tray choice,
 * Enter/Space on one (no `slot`: it goes into the next empty socket, because
 * order is irrelevant) and a pointer drop (`slot`: the socket the drop snapped
 * to, replacing its occupant). One function, so every path produces the same
 * board and therefore the same submitted `{placement}`.
 */
export function placeFromTray(
  content: Pick<ReconstructPublic, "slotCount" | "options">,
  board: readonly (string | null)[],
  token: string,
  slot?: number,
): PlaceOutcome {
  const target = slot ?? nextEmptySlot(board);
  if (target < 0) return { kind: "full", next: [...board] };
  return placeToken(content, board, target, token);
}

/** A screen rectangle (client pixels). */
export interface SnapRect { left: number; top: number; right: number; bottom: number }

/**
 * Which socket a pointer drop lands in (R2). Forgiving on purpose: the drop
 * zone is the whole assembly region — the sockets' bounding box grown by
 * `slack` on every side — and inside it the NEAREST socket centre wins, so a
 * drop between two sockets or just below the row still lands. Outside the
 * region: null (the drag is cancelled, nothing changes).
 */
export function snapToSocket(
  point: { x: number; y: number },
  sockets: readonly SnapRect[],
  slack: { x: number; y: number },
): number | null {
  if (sockets.length === 0) return null;
  const region = {
    left: Math.min(...sockets.map((r) => r.left)) - slack.x,
    right: Math.max(...sockets.map((r) => r.right)) + slack.x,
    top: Math.min(...sockets.map((r) => r.top)) - slack.y,
    bottom: Math.max(...sockets.map((r) => r.bottom)) + slack.y,
  };
  if (point.x < region.left || point.x > region.right
    || point.y < region.top || point.y > region.bottom) return null;
  let best = 0;
  let bestDistance = Infinity;
  sockets.forEach((r, i) => {
    const dx = point.x - (r.left + r.right) / 2;
    const dy = point.y - (r.top + r.bottom) / 2;
    const d = dx * dx + dy * dy;
    if (d < bestDistance) { best = i; bestDistance = d; }
  });
  return best;
}

/** Empty one socket. Returns the removed token (null when it was already empty). */
export function clearSlot(
  board: readonly (string | null)[], slot: number,
): { next: (string | null)[]; removed: string | null } {
  const next = [...board];
  const removed = board[slot] ?? null;
  if (slot >= 0 && slot < next.length) next[slot] = null;
  return { next, removed };
}

/** Every socket filled: the only condition Lock has. */
export function isBoardFull(board: readonly (string | null)[]): boolean {
  return board.length > 0 && board.every((t) => t !== null);
}

// ---------------------------------------------------------------- Plain speech

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** 0–8 as words ("two"), digits beyond; screen readers say both well, words read as speech. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Two of three parts filled." plus the lock hint once the board is full. */
export function filledSummary(filled: number, total: number): string {
  const base = `${sentence(numberWord(filled))} of ${numberWord(total)} parts filled.`;
  return filled === total ? `${base} Lock is available.` : base;
}
