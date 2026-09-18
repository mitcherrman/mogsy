/**
 * RE1 — THE HEAD-TO-HEAD MODULE AXIS.
 *
 * The end screen compares the two duelists module by module: the viewer's
 * bubble for Module 3 sits directly above the opponent's bubble for Module 3.
 * That comparison is only honest if both rows are placed on ONE canonical axis
 * of module numbers, never zipped by array index — a reconnect or a partial
 * backfill can leave either log with a hole, and an index-zipped row would
 * slide every later module one column left and pair Module 5 with Module 4.
 *
 * So the axis is built first (1..length), and each player's settlement is
 * dropped into the slot its OWN `roundNumber` names. A slot nobody filled
 * stays a slot.
 *
 * WHAT THIS DOES NOT DO
 * ─────────────────────
 * * It never scores. The final score is the result row's
 *   (`result.scoring.final_scores`); these slots explain it and are never
 *   summed into it.
 * * It never merges base and bonus. Both halves travel through untouched, for
 *   `ModuleBubble` to render as a number and a dot.
 * * It never fills a hole with `0`. A missing settlement is `null`, which the
 *   bubble draws neutral — a zero is a claim the backend did not make.
 */
import type { RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";

/** One player's award for one module, exactly as the settlement published it. */
export interface ModuleDuelCell {
  basePoints: number | null;
  speedBonusPoints: number | null;
}

/**
 * Why a slot looks the way it does. Observable for tests and for styling; the
 * bubble itself only ever sees `basePoints` / `speedBonusPoints`.
 *
 * * `scored`   — the settlement published an award for this player.
 * * `unscored` — the settlement exists but carried no award (an hp round, a
 *                backend that predates `module_points`).
 * * `missing`  — this client holds no settlement for the module although the
 *                match played it (reconnect / partial backfill).
 * * `unplayed` — the match ended before this module (a forfeit at module 6 of
 *                10): the slot exists on the axis and was never contested.
 */
export type ModuleDuelSlotState = "scored" | "unscored" | "missing" | "unplayed";

export interface ModuleDuelSlot {
  /** The canonical module number — the column's identity. 1-based. */
  module: number;
  viewer: ModuleDuelCell | null;
  opponent: ModuleDuelCell | null;
  viewerState: ModuleDuelSlotState;
  opponentState: ModuleDuelSlotState;
}

export interface ModuleDuelInput {
  /** `scoring.match_length` — the frozen format's module count, or null. */
  matchLength: number | null;
  /** `scoring.modules_played` — how many modules the match actually played. */
  modulesPlayed: number | null;
  viewer: readonly RoundHistoryEntry[];
  opponent: readonly RoundHistoryEntry[];
}

/**
 * How many columns the axis has.
 *
 * The configured match length when the result states one — never a hard-coded
 * ten. Without it, the modules the result says were played; without that, the
 * highest module either log names. It is also never SHORTER than a module a
 * log actually holds, so a surprising settlement is shown, not dropped.
 */
export function moduleAxisLength(input: ModuleDuelInput): number {
  const seen = Math.max(0,
    ...input.viewer.map((e) => e.roundNumber),
    ...input.opponent.map((e) => e.roundNumber));
  const declared = input.matchLength ?? input.modulesPlayed ?? 0;
  return Math.max(declared, seen);
}

function cellFor(entry: RoundHistoryEntry | undefined): ModuleDuelCell | null {
  if (!entry) return null;
  return {
    basePoints: entry.basePoints ?? null,
    speedBonusPoints: entry.speedBonusPoints ?? null,
  };
}

function stateFor(
  cell: ModuleDuelCell | null, module: number, modulesPlayed: number | null,
): ModuleDuelSlotState {
  if (cell) return cell.basePoints === null ? "unscored" : "scored";
  return modulesPlayed !== null && module > modulesPlayed ? "unplayed" : "missing";
}

function byModule(entries: readonly RoundHistoryEntry[]): Map<number, RoundHistoryEntry> {
  const out = new Map<number, RoundHistoryEntry>();
  for (const e of entries) {
    // A settlement is settled once; if a log somehow carries a module twice,
    // the later copy (the log is oldest-first) is the one kept.
    if (Number.isInteger(e.roundNumber) && e.roundNumber >= 1) out.set(e.roundNumber, e);
  }
  return out;
}

export function buildModuleDuel(input: ModuleDuelInput): ModuleDuelSlot[] {
  const length = moduleAxisLength(input);
  const viewer = byModule(input.viewer);
  const opponent = byModule(input.opponent);
  const slots: ModuleDuelSlot[] = [];
  for (let module = 1; module <= length; module += 1) {
    const v = cellFor(viewer.get(module));
    const o = cellFor(opponent.get(module));
    slots.push({
      module,
      viewer: v,
      opponent: o,
      viewerState: stateFor(v, module, input.modulesPlayed),
      opponentState: stateFor(o, module, input.modulesPlayed),
    });
  }
  return slots;
}
