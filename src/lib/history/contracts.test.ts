/**
 * HUB4 — the History parser, certified against HUB2's REAL output.
 *
 * `__fixtures__/hub2-history-v1.golden.json` is not hand-written: it is the
 * JSON HUB2's own `GET /api/history/v1` route returned (FastAPI TestClient
 * over `routes/history.py` → `history/daily.project`, backend
 * `codex/history-analytics-b` @ HUB2.1 59cceea2) for seeded in-memory Daily runs —
 * Free, Premium, entitlement-unavailable, newcomer, empty, a three-page
 * cursor walk and an invalid cursor. See HUB4_HANDOFF.md for how to
 * regenerate it.
 */
import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/hub2-history-v1.golden.json";
import {
  HistoryContractError,
  readHistoryPage,
  type DailyHistoryRecord,
} from "@/lib/history/contracts";
import { historyPath, isHistorySignedOut } from "@/lib/history/historyApi";

type Wire = Record<string, unknown> & { items: Record<string, unknown>[]; next_cursor: string | null };
const G = golden as unknown as Record<string, Wire>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("HUB4 parser — every real HUB2 page parses", () => {
  for (const key of [
    "premium_page_1",
    "premium_page_2",
    "premium_page_3",
    "free_page_1",
    "unavailable_page_1",
    "premium_newcomer",
    "empty",
    "occurrences",
  ]) {
    it(key, () => {
      const page = readHistoryPage(G[key]);
      expect(page.schemaVersion).toBe(1);
      expect(page.items.length).toBe(G[key].items.length);
      expect(page.nextCursor).toBe(G[key].next_cursor);
    });
  }
});

describe("HUB4 parser — Daily structure is the server's, never inferred", () => {
  const all: DailyHistoryRecord[] = ["premium_page_1", "premium_page_2", "premium_page_3"].flatMap(
    (k) => readHistoryPage(G[k]).items,
  );

  it("keeps a 4-stage first run at 4 and later runs at 5", () => {
    const first = all.find((r) => r.runId === "run-001")!;
    expect(first.stageCount).toBe(4);
    expect(first.stages.map((s) => s.kind)).toEqual(["standard", "time_trial", "survival", "review"]);
    const later = all.find((r) => r.runId === "run-006")!;
    expect(later.stages.map((s) => s.kind)).toEqual([
      "standard", "time_trial", "survival", "weak_areas", "review",
    ]);
  });

  it("keeps persisted stage order", () => {
    for (const record of all) {
      expect(record.stages.map((s) => s.order)).toEqual(record.stages.map((_, i) => i));
    }
  });

  it("carries review_identity as the stage's review match id", () => {
    const stage = all.find((r) => r.runId === "run-006")!.stages[2];
    expect(stage.reviewMatchId).toBe("match-6-2");
  });

  it("reads the ruleset version as an opaque string even when the wire sends a number", () => {
    const stage = all.find((r) => r.runId === "run-006")!.stages[2];
    expect(stage.ruleset).toEqual({ id: "survival", version: "1", timeBankMs: null, maxStrikes: 3 });
  });

  it("carries terminal reasons verbatim", () => {
    const run = all.find((r) => r.runId === "run-006")!;
    expect(run.stages[1].basic.endedBy).toBe("time_bank_exhausted");
    expect(run.stages[2].basic.endedBy).toBe("strikes_exhausted");
  });

  it("walks the cursor with no duplicate and no gap", () => {
    expect(all.map((r) => r.runId)).toEqual(["run-006", "run-005", "run-004", "run-003", "run-002", "run-001"]);
    expect(G.premium_page_3.next_cursor).toBeNull();
  });
});

describe("HUB4 parser — analytics are the server's numbers, not recomputed", () => {
  const record = readHistoryPage(G.premium_page_1).items[0];
  const wire = G.premium_page_1.items[0].analytics as Record<string, { value: unknown }>;

  it("passes every metric value through untouched", () => {
    const a = record.analytics!;
    expect(a.historicalAverage.value).toBe(wire.historical_average.value);
    expect(a.previousRunDeltaPp.value).toBe(wire.previous_run_delta_pp.value);
    expect(a.trajectory.value!.values).toEqual((wire.trajectory.value as { values: number[] }).values);
    expect(a.trajectory.value!.direction).toBe("up");
    expect(a.personalBest.value).toMatchObject({ score: 60, isCurrent: true, tied: true });
    expect(a.reviewRecoveryRate.value).toEqual({ correct: 2, attempted: 3, rate: 2 / 3 });
  });

  it("keeps the server's capability state per run and per stage", () => {
    expect(record.capability).toEqual({ state: "available", reasonCode: null });
    const free = readHistoryPage(G.free_page_1).items[0];
    expect(free.capability.state).toBe("upgrade_required");
    expect(free.analytics).toBeNull();
    expect(free.stages.every((s) => s.capability.state === "upgrade_required")).toBe(true);
    // The Free basic record is complete without analytics.
    expect(free.basic).toEqual(record.basic);
    const down = readHistoryPage(G.unavailable_page_1).items[0];
    expect(down.capability).toEqual({
      state: "temporarily_unavailable", reasonCode: "analytics_dependency_unavailable",
    });
    const newcomer = readHistoryPage(G.premium_newcomer).items[0];
    expect(newcomer.capability.state).toBe("insufficient_evidence");
    expect(newcomer.analytics!.historicalAverage).toEqual({
      value: null,
      sufficiency: { status: "insufficient", observed: 0, required: 3, reasonCode: "insufficient_compatible_history" },
    });
  });

  it("reads stage analytics per ruleset", () => {
    const survival = record.stages[2].analytics!;
    expect(survival.kind).toBe("survival");
    expect(survival.strikesUsed).toBe(1);
    expect(survival.historicalSamples).toBe(5);
    const weak = record.stages[3].analytics!;
    expect(weak.selectedThemes).toEqual(["family"]);
  });
});

type Q = Record<string, unknown>;
const occStage = (wire: Wire) => (wire.items[0].stages as { questions: Q[] }[])[0].questions;

describe("HUB4.1 parser — HUB2.1 round/challenge occurrences (real route output)", () => {
  const stages = readHistoryPage(G.occurrences).items[0].stages;

  it("reads round_number and challenge_index on every question", () => {
    for (const stage of stages) {
      expect(stage.questions.map((q) => [q.roundNumber, q.challengeIndex])).toEqual([
        [1, 0], [1, 1], [2, 0], [3, 0], [3, 1],
      ]);
    }
  });

  it("groups by round ascending, challenge ascending: Standard and Survival alike", () => {
    expect(stages.map((s) => s.kind)).toEqual(["standard", "survival"]);
    for (const stage of stages) {
      expect(stage.rounds!.map((r) => [r.roundNumber, r.questions.map((q) => q.challengeIndex)])).toEqual([
        [1, [0, 1]], [2, [0]], [3, [0, 1]],
      ]);
      // Five question results, three module occurrences.
      expect(stage.questions.length).toBe(5);
      expect(stage.rounds!.length).toBe(3);
    }
  });

  it("keeps a repeated canonical ref as two occurrences", () => {
    const [first, second] = stages[0].rounds![0].questions;
    expect(first.canonicalRef).toBe("quiz:repeat");
    expect(second.canonicalRef).toBe("quiz:repeat");
    expect(first.questionResultId).not.toBe(second.questionResultId);
  });

  it("orders by the ordinals, not by the array it was given", () => {
    const wire = clone(G.occurrences);
    occStage(wire).reverse();
    const stage = readHistoryPage(wire).items[0].stages[0];
    expect(stage.questions.map((q) => [q.roundNumber, q.challengeIndex])).toEqual([
      [1, 0], [1, 1], [2, 0], [3, 0], [3, 1],
    ]);
    expect(stage.rounds!.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
  });

  it("orders rounds numerically (10 after 9), and a ref repeated across rounds stays twice", () => {
    const wire = clone(G.occurrences);
    const qs = occStage(wire);
    qs[0].round_number = 10;
    qs[2].round_number = 9;
    qs[0].canonical_ref = "quiz:again";
    qs[4].canonical_ref = "quiz:again";
    const stage = readHistoryPage(wire).items[0].stages[0];
    expect(stage.rounds!.map((r) => r.roundNumber)).toEqual([1, 3, 9, 10]);
    expect(stage.questions.filter((q) => q.canonicalRef === "quiz:again").length).toBe(2);
  });

  it("refuses two results claiming one occurrence", () => {
    const wire = clone(G.occurrences);
    occStage(wire)[1].challenge_index = 0;
    expect(() => readHistoryPage(wire)).toThrow(/repeat round 1 challenge 0/);
  });

  it("the older scenarios carry the ordinals too (one question per round there)", () => {
    const stage = readHistoryPage(G.premium_page_1).items[0].stages[0];
    expect(stage.rounds!.length).toBe(stage.questions.length);
  });
});

describe("HUB4 parser — refusals and tolerance", () => {
  it("refuses a schema version it does not know", () => {
    const wire = clone(G.premium_page_1);
    wire.schema_version = 2;
    expect(() => readHistoryPage(wire)).toThrow(HistoryContractError);
  });

  it("refuses a malformed BASIC record rather than inventing one", () => {
    const wire = clone(G.free_page_1);
    (wire.items[0].basic as Record<string, unknown>).correct = "ten";
    expect(() => readHistoryPage(wire)).toThrow(/basic.correct/);
  });

  it("refuses an unknown capability state", () => {
    const wire = clone(G.free_page_1);
    (wire.items[0].analytics_capability as Record<string, unknown>).state = "maybe";
    expect(() => readHistoryPage(wire)).toThrow(/state is unknown/);
  });

  it("keeps the basic record when an ANALYTICS block is unreadable, and never calls that a paywall", () => {
    const wire = clone(G.premium_page_1);
    (wire.items[0].analytics as Record<string, unknown>).trajectory = "garbled";
    const record = readHistoryPage(wire).items[0];
    expect(record.analytics).toBeNull();
    expect(record.capability).toEqual({ state: "temporarily_unavailable", reasonCode: "analytics_unreadable" });
    expect(record.stages.length).toBe(5);
    expect(record.basic.score).toBe(60);
  });

  it("skips a record type this client does not know", () => {
    const wire = clone(G.free_page_1);
    wire.items.push({ record_type: "population_cohort" });
    expect(readHistoryPage(wire).items.length).toBe(2);
  });

  it("keeps a zero-denominator accuracy null, never 0", () => {
    const wire = clone(G.free_page_1);
    Object.assign(wire.items[0].basic as Record<string, unknown>, { correct: 0, answered: 0, accuracy: null });
    expect(readHistoryPage(wire).items[0].basic.accuracy).toBeNull();
  });
});

describe("HUB4 client — the request and its failure classes", () => {
  it("passes the server's cursor back verbatim", () => {
    expect(historyPath({ cursor: null, limit: 10 })).toBe("/api/history/v1?limit=10");
    const cursor = G.premium_page_1.next_cursor!;
    expect(historyPath({ cursor, limit: 10 })).toBe(
      `/api/history/v1?limit=10&cursor=${encodeURIComponent(cursor)}`,
    );
  });

  it("treats no session, 401 and the anonymous 403 as signed-out, anything else as an error", () => {
    const noSession = new Error("x");
    noSession.name = "QuizAuthRequiredError";
    expect(isHistorySignedOut(noSession)).toBe(true);
    expect(isHistorySignedOut(new Error('Quiz API 401: {"code":"AUTH_REQUIRED"}'))).toBe(true);
    expect(isHistorySignedOut(new Error('Quiz API 403: {"code":"ACCOUNT_REQUIRED"}'))).toBe(true);
    expect(isHistorySignedOut(new Error("Quiz API 503: down"))).toBe(false);
    expect(isHistorySignedOut(new Error("Quiz API 400: INVALID_HISTORY_CURSOR"))).toBe(false);
  });
});
