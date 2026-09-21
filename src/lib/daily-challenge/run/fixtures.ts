/**
 * DCMOD-E — Daily run FIXTURES, in B's wire shape.
 *
 * Built as snake_case snapshots and read through `readDailyRun`, so every
 * fixture exercises the same parser the real API will. `createFixtureTransport`
 * is a small in-memory model of B's state machine (pending → launching →
 * in_progress → completed; Review skipped when nothing was missed) — enough
 * to drive the whole presentation end to end without B's code.
 */
import type { DailyRun, DailyStageKind } from "./contracts";
import { readDailyRun } from "./contracts";
import { DailyRunApiError, type DailyRunTransport } from "./client";

export const FIXTURE_RUN_ID = "dr_fixture0000000000000000";

type Wire = Record<string, unknown>;

export interface FixtureStageSpec {
  kind: DailyStageKind;
  ruleset?: { ruleset_id: string; time_bank_ms?: number | null; max_strikes?: number | null } | null;
  content?: { title: string; focus: string | null } | null;
}

/** The first-run shape: three reusable stages, then Review. */
export const FOUR_STAGE_DAY: FixtureStageSpec[] = [
  { kind: "time_trial", ruleset: { ruleset_id: "time_trial", time_bank_ms: 90_000 },
    content: { title: "Champion Mastery", focus: "Ahri" } },
  { kind: "standard", ruleset: { ruleset_id: "standard" },
    content: { title: "Items", focus: "Mythic Build Paths" } },
  { kind: "survival", ruleset: { ruleset_id: "survival", max_strikes: 3 },
    content: { title: "Matchups", focus: "Mid Lane" } },
  { kind: "review", ruleset: { ruleset_id: "standard" }, content: { title: "Today's Mistakes", focus: null } },
];

/** The eligible shape: + Weak Areas before Review. */
export const FIVE_STAGE_DAY: FixtureStageSpec[] = [
  ...FOUR_STAGE_DAY.slice(0, 3),
  { kind: "weak_areas", ruleset: { ruleset_id: "standard" },
    content: { title: "Weak Areas", focus: "Jungle Timers" } },
  FOUR_STAGE_DAY[3],
];

/** Real DCMOD-C ids, as B freezes them (Review is not a content set). */
const FIXTURE_CONTENT_SET: Record<DailyStageKind, string | null> = {
  time_trial: "champion_fundamentals",
  standard: "champion_mastery",
  survival: "item_fundamentals",
  weak_areas: "weak_areas",
  review: null,
};

export function wireStage(spec: FixtureStageSpec, index: number, overrides: Wire = {}): Wire {
  return {
    stage_index: index,
    stage_id: `${FIXTURE_RUN_ID}:${index}:${spec.kind}`,
    kind: spec.kind,
    ruleset_id: spec.ruleset?.ruleset_id ?? null,
    ruleset: spec.ruleset
      ? { time_bank_ms: null, max_strikes: null, ...spec.ruleset } : null,
    content_set_id: FIXTURE_CONTENT_SET[spec.kind],
    content: spec.content ?? null,
    status: "pending",
    child_match_id: null,
    live: null,
    result: null,
    ...overrides,
  };
}

export function wireRun(specs: FixtureStageSpec[], overrides: Wire = {},
                        stageOverrides: Record<number, Wire> = {}): Wire {
  return {
    schema_version: 1,
    run_id: FIXTURE_RUN_ID,
    policy: "official",
    plan_date: "2026-09-21",
    plan_version: 1,
    status: "active",
    outcome: null,
    current_stage_index: 0,
    weak_areas_eligible: specs.some((s) => s.kind === "weak_areas"),
    server_now: new Date().toISOString(),
    stages: specs.map((s, i) => wireStage(s, i, stageOverrides[i])),
    review_items: [],
    ...overrides,
  };
}

export const fixtureRun = (specs: FixtureStageSpec[], overrides: Wire = {},
                           stageOverrides: Record<number, Wire> = {}): DailyRun =>
  readDailyRun(wireRun(specs, overrides, stageOverrides));

/** A finished stage's result, in wire shape. */
export const wireResult = (r: Partial<{
  correct: number; answered: number; score: number | null; ended_by: string; misses: number;
}> = {}): Wire => ({ correct: 8, answered: 10, score: 16, ended_by: "completed", misses: 2, ...r });

// ── the in-memory B ─────────────────────────────────────────────────────────

export interface FixtureTransport extends DailyRunTransport {
  /** The server's current wire snapshot (mutable, for tests). */
  wire(): Wire;
  /** Mark the ACTIVE child as finished with this result; the next sync advances. */
  finishActiveChild(result?: Wire): void;
  /** Set the active stage's live ruleset state. */
  setLive(live: Wire | null): void;
  calls: string[];
  /** Make the next launch fail with DAILY_RUN_CHILD_UNAVAILABLE. */
  failNextLaunch: boolean;
}

export function createFixtureTransport(
  specs: FixtureStageSpec[], opts: { existing?: Wire | null } = {},
): FixtureTransport {
  let state: Wire | null = opts.existing === undefined ? null : opts.existing;
  const finished = new Map<string, Wire>();
  const calls: string[] = [];
  const stamp = () => { if (state) state.server_now = new Date().toISOString(); };
  const snap = (): DailyRun => { stamp(); return readDailyRun(structuredClone(state)); };
  const stages = () => (state!.stages as Wire[]);

  const t: FixtureTransport = {
    calls,
    failNextLaunch: false,
    wire: () => state!,
    async readToday() {
      calls.push("readToday");
      return state ? snap() : null;
    },
    async startToday() {
      calls.push("startToday");
      if (!state) state = wireRun(specs);
      return snap();
    },
    async readRun() {
      calls.push("readRun");
      return snap();
    },
    async launchStage(_runId, index) {
      calls.push(`launch:${index}`);
      if (t.failNextLaunch) {
        t.failNextLaunch = false;
        throw new DailyRunApiError("backend", 503, "child unavailable", "DAILY_RUN_CHILD_UNAVAILABLE");
      }
      const s = stages()[index];
      if (state!.current_stage_index !== index) {
        throw new DailyRunApiError("backend", 409, "not current", "DAILY_RUN_CONFLICT");
      }
      if (s.status === "pending" || s.status === "launching") {
        s.status = "in_progress";
        s.child_match_id = `child-${index}`;
      }
      return snap();
    },
    async syncRun() {
      calls.push("sync");
      const i = state!.current_stage_index as number | null;
      if (i === null) return snap();
      const s = stages()[i];
      const result = s.child_match_id ? finished.get(s.child_match_id as string) : undefined;
      if (s.status !== "in_progress" || !result) return snap();
      s.status = "completed";
      s.result = result;
      s.live = null;
      const next = i + 1;
      const all = stages();
      if (next >= all.length) {
        state!.status = "completed";
        state!.outcome = "reviewed";
        state!.current_stage_index = null;
        return snap();
      }
      if (all[next].kind === "review") {
        const misses = all.slice(0, next).reduce(
          (n, st) => n + (((st.result as Wire | null)?.misses as number | undefined) ?? 0), 0);
        state!.review_items = Array.from({ length: misses }, (_, k) => ({ ordinal: k }));
        if (misses === 0) {
          all[next].status = "skipped";
          state!.status = "completed";
          state!.outcome = "perfect";
          state!.current_stage_index = null;
          return snap();
        }
      }
      state!.current_stage_index = next;
      return snap();
    },
    finishActiveChild(result = wireResult()) {
      const i = state!.current_stage_index as number;
      const id = stages()[i].child_match_id as string;
      finished.set(id, result);
    },
    setLive(live) {
      const i = state!.current_stage_index as number;
      stages()[i].live = live;
    },
  };
  return t;
}
