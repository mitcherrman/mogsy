/**
 * DV2-P2B — the History reader and the headline authority against the B2
 * wire (`main` / `parent`), and against today's production (neither field).
 *
 * `dv2-b2-history.json` is REAL backend output: `history.daily.project` at
 * backend `ec3500d0` (DV2-B2 + B1.1), run over the B2 suite's own schema
 * helpers for one player — two v4 Dailies, then one v5 Daily seen at three
 * moments: Standard settled (parent active), Time Trial settled too
 * (Survival in progress, so not sent), and every stage settled (parent
 * completed). See DAILY_V2_P2B_HISTORY_HANDOFF.md for the generator.
 * `hub2-history-v1.golden.json` is the pre-B2 production shape.
 */
import { describe, expect, it } from "vitest";
import { HistoryContractError, readHistoryPage, type DailyHistoryRecord } from "@/lib/history/contracts";
import {
  OPTIONAL_ACTIVITIES_COPY,
  dailyHeadline,
  optionalActivities,
  runOverviewWithheld,
} from "@/components/quiz/workspace/dailyHeadline";
import golden from "@/lib/history/__fixtures__/hub2-history-v1.golden.json";
import b2 from "@/lib/history/__fixtures__/dv2-b2-history.json";

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const V5 = "v5-run";
const read = (page: unknown) => readHistoryPage(clone(page));
const v5Of = (page: unknown): DailyHistoryRecord => read(page).items.find((r) => r.runId === V5)!;
/** The same page as today's production backend would send it. */
const withoutB2 = (page: { items: Json[] }) => {
  const p = clone(page);
  for (const item of p.items) {
    delete item.main;
    delete item.parent;
  }
  return p;
};
const DAY = new Date("2026-10-03T23:00:00Z");
const LATER = new Date("2026-10-04T00:00:01Z");

describe("DV2-P2B reader — today's production payload (no main, no parent)", () => {
  const pages = Object.entries(golden).filter(([, v]) => v && typeof v === "object" && "items" in (v as Json));

  it("every golden page still parses, with main and parent null", () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const [, wire] of pages) {
      for (const item of (wire as { items: Json[] }).items) expect("main" in item || "parent" in item).toBe(false);
      for (const record of read(wire).items) {
        expect(record.main).toBeNull();
        expect(record.parent).toBeNull();
      }
    }
  });

  it("the headline is exactly `basic`, and nothing is withheld or annotated", () => {
    for (const [, wire] of pages) {
      for (const record of read(wire).items) {
        const { score, correct, answered, accuracy } = record.basic;
        expect(dailyHeadline(record)).toEqual({ source: "legacy", score, correct, answered, accuracy });
        expect(runOverviewWithheld(record)).toBe(false);
        expect(optionalActivities(record, DAY)).toBeNull();
      }
    }
  });

  it("a legacy not_applicable run (no parent) keeps its existing Run analysis behaviour", () => {
    const wire = clone(golden.free_page_1);
    (wire.items[0] as Json).analytics_capability = { state: "not_applicable", reason_code: null };
    expect(runOverviewWithheld(read(wire).items[0])).toBe(false);
  });
});

describe("DV2-P2B reader — B2 legacy records (main null, parent completed)", () => {
  it("parse to the same record as the pre-B2 payload, plus main null and the parent facts", () => {
    for (const name of ["legacy_only", "open_standard", "completed"] as const) {
      const page = b2[name];
      const now = read(page).items.filter((r) => r.runId !== V5);
      const before = read(withoutB2(page)).items.filter((r) => r.runId !== V5);
      expect(now.length).toBe(2);
      now.forEach((record, i) => {
        expect(record.main).toBeNull();
        expect(record.parent).toEqual({ status: "completed", completedAt: record.completedAt });
        const { main: _m, parent: _p, ...rest } = record;
        const { main: _m0, parent: _p0, ...legacy } = before[i];
        expect(rest).toEqual(legacy);
        expect(dailyHeadline(record)).toEqual(dailyHeadline(before[i]));
        expect(dailyHeadline(record).source).toBe("legacy");
        expect(runOverviewWithheld(record)).toBe(false);
        expect(optionalActivities(record, DAY)).toBeNull();
      });
    }
  });
});

describe("DV2-P2B reader — v5 records", () => {
  it("an open v5 parent parses: main pair, parent active, only the settled stages", () => {
    const record = v5Of(b2.open_standard);
    expect(record.main).toEqual({ completedAt: "2026-10-03T10:00:00.000000+00:00", dailyScore: 17 });
    expect(record.parent).toEqual({ status: "active", completedAt: null });
    expect(record.completedAt).toBe(record.main!.completedAt);
    // stageCount > stages.length is valid; nothing stands in for the rest.
    expect(record.stageCount).toBe(5);
    expect(record.stages.map((s) => s.kind)).toEqual(["standard"]);
    expect(record.capability).toEqual({ state: "not_applicable", reasonCode: "parent_activities_incomplete" });
    expect(record.analytics).toBeNull();
    // The settled Standard keeps its own analysis.
    expect(record.stages[0].capability.state).toBe("available");
    expect(record.stages[0].analytics).not.toBeNull();
  });

  it("a partial v5 parent: an in-progress optional stage is simply absent", () => {
    const record = v5Of(b2.open_partial);
    expect(record.stageCount).toBe(5);
    expect(record.stages.map((s) => [s.order, s.kind])).toEqual([[0, "standard"], [1, "time_trial"]]);
    expect(record.stages.every((s) => s.status === "completed")).toBe(true);
  });

  it("a completed v5 parent parses with every stage", () => {
    const record = v5Of(b2.completed);
    expect(record.parent).toEqual({ status: "completed", completedAt: "2026-10-03T22:00:00.000000+00:00" });
    expect(record.main!.dailyScore).toBe(17);
    expect(record.stages.length).toBe(record.stageCount);
    expect(record.capability.state).toBe("available");
  });
});

describe("DV2-P2B headline — main.daily_score and Standard, never the aggregate", () => {
  it("v5 headline score = main.daily_score; C/A and accuracy = the Standard stage's own", () => {
    const record = v5Of(b2.open_partial);
    const standard = record.stages.find((s) => s.kind === "standard")!;
    const h = dailyHeadline(record);
    expect(h).toEqual({
      source: "main",
      score: 17,
      correct: standard.basic.correct,
      answered: standard.basic.answered,
      accuracy: standard.basic.accuracy,
    });
    // The aggregate genuinely differs here — and is not what leads.
    expect(record.basic.score).toBe(19);
    expect([record.basic.correct, record.basic.answered]).not.toEqual([h.correct, h.answered]);
  });

  it("the headline score is main's even if the Standard stage's own score differed", () => {
    const wire = clone(b2.open_partial);
    const item = wire.items.find((i) => i.run_id === V5) as Json;
    (item.main as Json).daily_score = 23;
    expect(dailyHeadline(read(wire).items.find((r) => r.runId === V5)!).score).toBe(23);
  });

  it("settling more stages adds rows and grows basic, and never moves the headline", () => {
    const moments = [b2.open_standard, b2.open_partial, b2.completed].map(v5Of);
    expect(moments.map((r) => r.stages.length)).toEqual([1, 2, 5]);
    expect(moments.map((r) => r.basic.score)).toEqual([17, 19, 25]);
    expect(new Set(moments.map((r) => r.basic.answered)).size).toBe(3);
    const headlines = moments.map(dailyHeadline);
    expect(headlines[1]).toEqual(headlines[0]);
    expect(headlines[2]).toEqual(headlines[0]);
    expect(new Set(moments.map((r) => r.completedAt)).size).toBe(1);
  });

  it("fails neutral when a main record has no single Standard stage — never the aggregate", () => {
    const record = v5Of(b2.open_partial);
    for (const stages of [record.stages.filter((s) => s.kind !== "standard"), [record.stages[0], record.stages[0]]]) {
      const h = dailyHeadline({ ...record, stages });
      expect(h).toEqual({ source: "main", score: 17, correct: null, answered: null, accuracy: null });
    }
  });
});

describe("DV2-P2B parent — optional activities and the withheld Overview", () => {
  it("an open parent today: 'still open'; an earlier day's: 'were left open'", () => {
    const record = v5Of(b2.open_standard);
    expect(optionalActivities(record, DAY)).toBe("open");
    expect(optionalActivities(record, LATER)).toBe("left_open");
    expect(OPTIONAL_ACTIVITIES_COPY.open).toBe("Optional challenges still open");
    expect(OPTIONAL_ACTIVITIES_COPY.left_open).toBe("Optional challenges were left open");
  });

  it("an earlier day's partly played bundle reads the same — never 'not played'", () => {
    const record = v5Of(b2.open_partial);
    // Time Trial settled before the day ended; the bundle was still open.
    expect(record.stages.find((s) => s.kind === "time_trial")?.status).toBe("completed");
    expect(optionalActivities(record, LATER)).toBe("left_open");
    expect(OPTIONAL_ACTIVITIES_COPY[optionalActivities(record, LATER)!]).toBe("Optional challenges were left open");
  });

  it("no copy implies an incomplete Daily, nothing played, or a resumable bundle", () => {
    for (const copy of Object.values(OPTIONAL_ACTIVITIES_COPY)) {
      expect(copy).not.toMatch(/incomplete|unfinished|not played|unplayed|skipped|stage \d+ of|daily/i);
    }
    expect(OPTIONAL_ACTIVITIES_COPY.left_open).not.toMatch(/still|available|resume|continue/i);
  });

  it("a completed parent says nothing and keeps its Run analysis", () => {
    const record = v5Of(b2.completed);
    expect(optionalActivities(record, DAY)).toBeNull();
    expect(runOverviewWithheld(record)).toBe(false);
  });

  it("the Overview is withheld only for the server's open-parent not_applicable", () => {
    expect(runOverviewWithheld(v5Of(b2.open_standard))).toBe(true);
    expect(runOverviewWithheld(v5Of(b2.open_partial))).toBe(true);
    // A free reader's open parent: the server's paywall wins, as before.
    const free = v5Of(b2.open_partial_free);
    expect(free.capability.state).toBe("upgrade_required");
    expect(runOverviewWithheld(free)).toBe(false);
    expect(optionalActivities(free, DAY)).toBe("open");
  });

  it("only the exact B2 reason withholds it: not_applicable + parent_activities_incomplete + active", () => {
    const withCapability = (page: unknown, capability: Json) => {
      const wire = clone(page) as { items: Json[] };
      (wire.items.find((i) => i.run_id === V5) as Json).analytics_capability = capability;
      return read(wire).items.find((r) => r.runId === V5)!;
    };
    const open = v5Of(b2.open_partial);
    expect(open.capability).toEqual({ state: "not_applicable", reasonCode: "parent_activities_incomplete" });
    expect(runOverviewWithheld(open)).toBe(true);
    // Any other not_applicable reason on the same open parent: no inference.
    for (const reason of ["some_future_reason", "missing_question_or_ruleset_provenance", null]) {
      expect(runOverviewWithheld(withCapability(b2.open_partial, { state: "not_applicable", reason_code: reason }))).toBe(false);
    }
    // An outage on an open parent keeps the existing retry.
    const outage = withCapability(b2.open_partial, {
      state: "temporarily_unavailable", reason_code: "analytics_dependency_unavailable" });
    expect(runOverviewWithheld(outage)).toBe(false);
    // The exact reason on a completed parent is not the open-parent case.
    expect(runOverviewWithheld(withCapability(b2.completed, {
      state: "not_applicable", reason_code: "parent_activities_incomplete" }))).toBe(false);
  });
});

describe("DV2-P2B reader — fails closed on a malformed main / parent", () => {
  const mutate = (fn: (item: Json) => void) => {
    const wire = clone(b2.open_standard);
    fn(wire.items.find((i) => i.run_id === V5) as Json);
    return () => readHistoryPage(wire);
  };
  it.each([
    ["half a main pair (no score)", (i: Json) => delete (i.main as Json).daily_score],
    ["half a main pair (no time)", (i: Json) => delete (i.main as Json).completed_at],
    ["a non-integer score", (i: Json) => ((i.main as Json).daily_score = 17.5)],
    ["a string score", (i: Json) => ((i.main as Json).daily_score = "17")],
    ["a non-object main", (i: Json) => (i.main = 17)],
    ["an unknown parent status", (i: Json) => ((i.parent as Json).status = "abandoned")],
    ["an active parent with a completion time", (i: Json) => ((i.parent as Json).completed_at = "2026-10-03T22:00:00Z")],
    ["a completed parent without one", (i: Json) => (i.parent = { status: "completed", completed_at: null })],
    ["an active parent without a main Daily", (i: Json) => (i.main = null)],
  ])("refuses %s", (_, fn) => {
    expect(mutate(fn)).toThrow(HistoryContractError);
  });

  it("an absent parent is null (older backend), never 'active'", () => {
    const wire = clone(b2.completed);
    for (const item of wire.items as Json[]) delete item.parent;
    const record = read(wire).items.find((r) => r.runId === V5)!;
    expect(record.parent).toBeNull();
    expect(optionalActivities(record, DAY)).toBeNull();
    expect(runOverviewWithheld(record)).toBe(false);
  });
});
