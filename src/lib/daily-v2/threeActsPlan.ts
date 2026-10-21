/**
 * Daily three acts (V2) — the stage PLAN the server publishes, and the
 * set-grouped timeline projected from it (lane E).
 *
 * The server's Daily stage carries `content.composition`. For a three-act
 * Standard (an owner take behind the server flag) that composition is
 * `recipe: "three_acts"` with an ordered list of UNITS: six E/M/H sets and one
 * Meta Reflex block. It is SHAPE only — acts, set ids, bands, timers, card
 * count — the same for every player that day and published before anything is
 * served. No family, no question, no ref. That is the one thing that lets the
 * timeline say "Early · set 2 · Hard" about a FUTURE round without guessing
 * (`roundTimeline.ts` forbids deriving a round's character from its ordinal;
 * here the server stated it).
 *
 * Each set is three segments (one per band) and the Meta Reflex block is ONE
 * segment of three cards, so the plan maps segment numbers 1..19 onto units.
 */
import type { RoundTimelineView, TimelineNode } from "@/lib/ranked-core/viewTypes";

export const THREE_ACTS_RECIPE = "three_acts";
export type ThreeActsAct = "early" | "mid" | "late";
export type ThreeActsBand = "E" | "M" | "H";

export type ThreeActsUnit =
  | { kind: "set"; act: ThreeActsAct; setId: string; bands: ThreeActsBand[]; timerSeconds: number[] }
  | { kind: "meta_reflex"; cards: number; cardTimerSeconds: number };

export interface ThreeActsPlan {
  recipeId: string;
  segments: number;
  answers: number;
  units: ThreeActsUnit[];
}

const ACTS: readonly ThreeActsAct[] = ["early", "mid", "late"];
const BANDS: readonly ThreeActsBand[] = ["E", "M", "H"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The three-act plan, or null when `composition` is anything else (V1 Standard,
 * Time Trial, Survival, an older server). Throws on a three-act composition
 * that breaks its own invariants — a malformed plan must never be drawn.
 */
export function readThreeActsPlan(composition: unknown, label = "composition"): ThreeActsPlan | null {
  if (!isRecord(composition) || composition.recipe !== THREE_ACTS_RECIPE) return null;
  const fail = (msg: string): never => { throw new Error(`${label}: ${msg}`); };
  const int = (v: unknown, name: string) =>
    (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fail(`${name} must be a positive integer`));
  if (!Array.isArray(composition.units)) fail("units must be a list");
  const units = (composition.units as unknown[]).map((raw, i): ThreeActsUnit => {
    if (!isRecord(raw)) return fail(`units[${i}] must be an object`);
    if (raw.kind === "meta_reflex") {
      return { kind: "meta_reflex", cards: int(raw.cards, `units[${i}].cards`),
        cardTimerSeconds: typeof raw.card_timer_seconds === "number"
          ? raw.card_timer_seconds : fail(`units[${i}].card_timer_seconds`) };
    }
    if (raw.kind !== "set") return fail(`units[${i}].kind`);
    const act = ACTS.find((a) => a === raw.act_id) ?? fail(`units[${i}].act_id`);
    const bands = Array.isArray(raw.bands) && raw.bands.length === 3
      && raw.bands.every((b, k) => b === BANDS[k]) ? (raw.bands as ThreeActsBand[]) : fail(`units[${i}].bands`);
    const timers = Array.isArray(raw.timer_seconds) && raw.timer_seconds.length === 3
      && raw.timer_seconds.every((t) => typeof t === "number" && t > 0)
      ? (raw.timer_seconds as number[]) : fail(`units[${i}].timer_seconds`);
    const setId = typeof raw.set_id === "string" && raw.set_id ? raw.set_id : fail(`units[${i}].set_id`);
    return { kind: "set", act, setId, bands, timerSeconds: timers };
  });
  const segments = int(composition.segments, "segments");
  const answers = int(composition.answers, "answers");
  const counted = units.reduce((n, u) => n + (u.kind === "set" ? 3 : 1), 0);
  if (counted !== segments) fail(`units cover ${counted} segments, not ${segments}`);
  const graded = units.reduce((n, u) => n + (u.kind === "set" ? 3 : u.cards), 0);
  if (graded !== answers) fail(`units grade ${graded} answers, not ${answers}`);
  return {
    recipeId: typeof composition.recipe_id === "string" ? composition.recipe_id : "",
    segments, answers, units,
  };
}

// ─────────────────────────────────────────────────────── set timeline

export type SetGroupState = "done" | "current" | "upcoming";

export interface SetTimelineStep {
  roundNumber: number;
  /** The band the server published for this position (null for Meta Reflex). */
  band: ThreeActsBand | null;
  state: TimelineNode["state"];
  /** The viewer's settled verdict, verbatim from the round timeline. */
  outcome: TimelineNode["outcome"];
}

export interface SetTimelineGroup {
  key: string;
  kind: "set" | "meta_reflex";
  act: ThreeActsAct | null;
  /** Short label: "E1"… for a set (act initial + set number in act), "MR" for the sprint. */
  label: string;
  /** Spoken label: "Early, set 1" / "Meta Reflex sprint, 3 cards". */
  spoken: string;
  state: SetGroupState;
  steps: SetTimelineStep[];
}

export interface SetTimelineView {
  groups: SetTimelineGroup[];
  currentGroupIndex: number | null;
  /** 1-based position of the current round across all segments, or null. */
  currentRoundNumber: number | null;
  totalSegments: number;
}

const ACT_NAME: Record<ThreeActsAct, string> = { early: "Early", mid: "Mid", late: "Late" };

/**
 * Group the ARENA'S OWN round timeline by the server plan. Every state and
 * verdict is read from `timeline.nodes` (the single derivation of what
 * happened); this adds only the grouping the plan states.
 */
export function projectSetTimeline(timeline: RoundTimelineView, plan: ThreeActsPlan): SetTimelineView {
  const byRound = new Map<number, TimelineNode>();
  for (const node of timeline.nodes) byRound.set(node.roundNumber, node);
  const current = timeline.currentRoundNumber;
  const nodeState = (rn: number): TimelineNode["state"] => {
    const node = byRound.get(rn);
    if (node) return node.state;
    if (current === null) return "resolved";
    return rn < current ? "resolved" : rn === current ? "current" : "upcoming";
  };
  let round = 1;
  const groups: SetTimelineGroup[] = plan.units.map((unit, i) => {
    const rounds = unit.kind === "set" ? [round, round + 1, round + 2] : [round];
    round += rounds.length;
    const steps = rounds.map((rn, k): SetTimelineStep => ({
      roundNumber: rn,
      band: unit.kind === "set" ? unit.bands[k] : null,
      state: nodeState(rn),
      outcome: byRound.get(rn)?.outcome ?? null,
    }));
    const state: SetGroupState = steps.some((s) => s.state === "current") ? "current"
      : steps.every((s) => s.state === "resolved") ? "done" : "upcoming";
    if (unit.kind === "meta_reflex") {
      return { key: `mr-${i}`, kind: "meta_reflex", act: null, label: "MR",
        spoken: `Meta Reflex sprint, ${unit.cards} cards`, state, steps };
    }
    const setNumber = unit.setId.split(".")[1] ?? "";
    return { key: unit.setId, kind: "set", act: unit.act,
      label: `${ACT_NAME[unit.act][0]}${setNumber}`,
      spoken: `${ACT_NAME[unit.act]}, set ${setNumber}`, state, steps };
  });
  const currentGroupIndex = groups.findIndex((g) => g.state === "current");
  return {
    groups,
    currentGroupIndex: currentGroupIndex >= 0 ? currentGroupIndex : null,
    currentRoundNumber: current,
    totalSegments: plan.segments,
  };
}

/**
 * The phone's window: `size` consecutive groups around the current one
 * (clamped at the ends), so a 320px bar shows whole sets — "where am I in the
 * day" — instead of specks. The groups are the SAME objects, just fewer.
 */
export function windowSetTimeline(view: SetTimelineView, size: number): SetTimelineView {
  const n = view.groups.length;
  if (n <= size) return view;
  // No current group: the first unplayed one, or — once everything is done —
  // the last, so a finished day stays on its final sets.
  const pending = view.groups.findIndex((g) => g.state !== "done");
  const anchor = view.currentGroupIndex ?? (pending >= 0 ? pending : n - 1);
  const start = Math.min(Math.max(0, anchor - Math.floor(size / 2)), n - size);
  const groups = view.groups.slice(start, start + size);
  return {
    ...view,
    groups,
    currentGroupIndex: view.currentGroupIndex === null ? null : view.currentGroupIndex - start,
  };
}
