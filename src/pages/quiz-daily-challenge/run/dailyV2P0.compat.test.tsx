/**
 * DV2-P0 — FRONTEND COMPATIBILITY FOR THE DAILY V2 CONTRACT, before the
 * backend is allowed to serve it.
 *
 * Frontend only. The backend still serves the old Daily and must keep working
 * unchanged; the future snapshots below are SYNTHETIC. Nothing here presents
 * the Main / Bonus / Training hierarchy, orders stages, or claims a Daily is
 * "main complete": those arrive with the backend contract (P2).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  DAILY_STAGE_KINDS, DailyRunParseError, readDailyRun,
} from "@/lib/daily-challenge/run/contracts";
import {
  FIVE_STAGE_DAY, FOUR_STAGE_DAY, FUTURE_V5_DAY, fixtureRun, wireResult, wireRun,
} from "@/lib/daily-challenge/run/fixtures";
import { dailyStatusFrom } from "@/lib/daily-challenge/status";
import {
  DAILY_STAGE_CATEGORY, stageCategory, stageCategoryOf,
} from "@/lib/daily-challenge/run/stageCategory";
import { skippedStageNote, stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { buildDailyStageResult } from "@/lib/daily-challenge/run/stageResultModel";
import { PLAY_MODES } from "@/lib/quiz/playModes";
import { stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { DailyCompletion } from "./DailyCompletion";
import { DailyIntroBeat, StageIntroBeat } from "./DailyRunBeats";
import { DailyStageResult } from "./DailyStageResult";
import { StageLadder, StageTag } from "./StageTag";

const here = (rel: string) => resolve(process.cwd(), rel);
const source = (rel: string) => readFileSync(here(rel), "utf-8");

/** A fully played day, every stage completed (Review last). */
function finishedWire(specs: Parameters<typeof wireRun>[0]) {
  const stageOverrides: Record<number, Record<string, unknown>> = {};
  specs.forEach((_, i) => {
    stageOverrides[i] = { status: "completed", child_match_id: `m${i}`, result: wireResult() };
  });
  return wireRun(specs, { status: "completed", outcome: "reviewed", current_stage_index: null },
    stageOverrides);
}

describe("A — today's backend snapshots are unchanged", () => {
  it("parses the current five-stage and four-stage days exactly as before", () => {
    const five = readDailyRun(wireRun(FIVE_STAGE_DAY));
    expect(five.stages.map((s) => s.kind))
      .toEqual(["time_trial", "standard", "survival", "weak_areas", "review"]);
    expect(five.stages.map((s) => s.ruleset?.id))
      .toEqual(["time_trial", "standard", "survival", "standard", "standard"]);
    const four = readDailyRun(wireRun(FOUR_STAGE_DAY));
    expect(four.stages.map((s) => s.kind)).toEqual(["time_trial", "standard", "survival", "review"]);
    // The one new field reads null when the server did not state a skip reason.
    for (const s of [...five.stages, ...four.stages]) expect(s.skipReason).toBeNull();
  });

  it("reads a snapshot with no skip_reason key at all (the pre-P0 wire)", () => {
    const wire = wireRun(FIVE_STAGE_DAY);
    for (const s of wire.stages as Record<string, unknown>[]) delete s.skip_reason;
    expect(() => readDailyRun(wire)).not.toThrow();
  });

  it("renders the intro, a stage intro, a result, the ladder and the recap of today's day", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    const { unmount } = render(<MemoryRouter><DailyIntroBeat run={run} /></MemoryRouter>);
    expect(screen.getAllByTestId(/^daily-ladder-/)).toHaveLength(5);
    unmount();
    const done = readDailyRun(finishedWire(FIVE_STAGE_DAY));
    render(<MemoryRouter><DailyCompletion run={done} /></MemoryRouter>);
    expect(screen.getAllByTestId(/^daily-recap-\d$/)).toHaveLength(5);
    expect(screen.getByTestId("daily-recap-0-result")).toHaveTextContent("8 / 10");
  });

  it("the hub's 'done' state is still the run's own status", () => {
    const active = fixtureRun(FIVE_STAGE_DAY);
    expect(dailyStatusFrom(active)).toMatchObject({ completed: false, resumable: true });
    expect(dailyStatusFrom(readDailyRun(finishedWire(FIVE_STAGE_DAY))))
      .toMatchObject({ completed: true, resumable: false });
  });
});

describe("B — a future snapshot with order_forge parses and renders", () => {
  const future = () => fixtureRun(FUTURE_V5_DAY);

  it("parses the plan-v5 order, Review still last", () => {
    expect(future().stages.map((s) => s.kind)).toEqual(
      ["standard", "survival", "time_trial", "order_forge", "weak_areas", "review"]);
  });

  it("keeps order_forge in the known-kind list and out of nowhere else", () => {
    expect([...DAILY_STAGE_KINDS].sort()).toEqual(
      ["order_forge", "review", "standard", "survival", "time_trial", "weak_areas"]);
  });

  it("names it: label, bonus category, the approved rule, and nothing more", () => {
    const id = stageIdentity({ kind: "order_forge", ruleset: null });
    expect(id).toMatchObject({
      kind: "order_forge", label: "Order Forge", category: "bonus",
      rule: "Order the cards from highest to lowest by the shown stat.",
    });
  });

  it("draws the lineup, the stage intro, the tag and the ladder without crashing", () => {
    const run = future();
    const forge = run.stages[3];
    const { unmount } = render(<MemoryRouter><DailyIntroBeat run={run} /></MemoryRouter>);
    expect(screen.getByTestId("daily-ladder-3")).toHaveTextContent(/order forge/i);
    unmount();
    render(<MemoryRouter><StageIntroBeat run={run} stage={forge} /></MemoryRouter>);
    expect(screen.getByTestId("daily-stage-tag")).toHaveTextContent(/order forge/i);
    expect(screen.getByTestId("daily-stage-tag")).toHaveAttribute("data-stage-category", "bonus");
    expect(screen.getByTestId("daily-stage-intro-rule"))
      .toHaveTextContent("Order the cards from highest to lowest by the shown stat.");
    // A stage that carries no ruleset adds no secondary ruleset tag.
    expect(screen.queryByTestId("daily-stage-ruleset-tag")).toBeNull();
  });

  it("draws a settled Order Forge result with its misses, and the pending frame", () => {
    const settled = fixtureRun(FUTURE_V5_DAY, { current_stage_index: 4 }, {
      3: { status: "completed", child_match_id: "m3", result: wireResult({ misses: 2 }) } });
    const model = buildDailyStageResult(settled, settled.stages[3]);
    expect(model.headline).toBe("Stage complete");
    expect(model.snapshot?.find((s) => s.key === "misses")).toMatchObject({ label: "Missed", value: "2" });
    render(<MemoryRouter><DailyStageResult run={settled} stage={settled.stages[3]} /></MemoryRouter>);
    expect(screen.getByTestId("daily-stage-result")).toHaveAttribute("data-stage-kind", "order_forge");
    expect(screen.getByTestId("daily-stage-result-misses")).toBeInTheDocument();
  });

  it("draws the pending Order Forge result", () => {
    const run = fixtureRun(FUTURE_V5_DAY, { current_stage_index: 3 },
      { 3: { status: "in_progress", child_match_id: "m3" } });
    render(<MemoryRouter><DailyStageResult run={run} stage={run.stages[3]} /></MemoryRouter>);
    expect(screen.getByTestId("daily-stage-result-scoring")).toBeInTheDocument();
  });

  it("draws the recap of a finished future day", () => {
    const done = readDailyRun(finishedWire(FUTURE_V5_DAY));
    render(<MemoryRouter><DailyCompletion run={done} /></MemoryRouter>);
    expect(screen.getAllByTestId(/^daily-recap-\d$/)).toHaveLength(6);
    expect(within(screen.getByTestId("daily-recap-3")).getByTestId("daily-stage-tag"))
      .toHaveTextContent(/order forge/i);
  });

  it("History names the stages the same way as the live Daily", () => {
    expect(stageKindLabel("order_forge")).toBe("Order Forge");
    expect(stageKindLabel("review")).toBe("Recently Missed");
    expect(stageKindLabel("weak_areas")).toBe("Weak Areas");
  });
});

describe("C — an unsupported kind still fails closed", () => {
  const withKind = (kind: unknown) => {
    const wire = wireRun(FUTURE_V5_DAY);
    (wire.stages as Record<string, unknown>[])[3].kind = kind;
    return wire;
  };

  it("refuses a kind this client does not know", () => {
    expect(() => readDailyRun(withKind("mystery_box"))).toThrow(DailyRunParseError);
    expect(() => readDailyRun(withKind("mystery_box"))).toThrow(/kind must be one of/);
  });

  it("refuses near-misses of a known kind, and non-strings", () => {
    for (const bad of ["Order_Forge", "order-forge", "orderforge", "", null, 3, undefined]) {
      expect(() => readDailyRun(withKind(bad))).toThrow(DailyRunParseError);
    }
  });

  it("does not loosen the other invariants for the new kind", () => {
    const wire = wireRun(FUTURE_V5_DAY);
    (wire.stages as Record<string, unknown>[])[5].kind = "order_forge";
    expect(() => readDailyRun(wire)).toThrow(/Review/);
  });

  it("still refuses an unknown ruleset id", () => {
    const wire = wireRun(FUTURE_V5_DAY);
    (wire.stages as Record<string, unknown>[])[3].ruleset_id = "order_forge";
    (wire.stages as Record<string, unknown>[])[3].ruleset = { ruleset_id: "order_forge" };
    expect(() => readDailyRun(wire)).toThrow(DailyRunParseError);
  });
});

describe("the presentation category authority", () => {
  it("is the approved grouping, for every known kind", () => {
    expect(DAILY_STAGE_CATEGORY).toEqual({
      standard: "main", survival: "bonus", time_trial: "bonus", order_forge: "bonus",
      weak_areas: "training", review: "training",
    });
    for (const kind of DAILY_STAGE_KINDS) {
      expect(stageCategory(kind)).toBe(DAILY_STAGE_CATEGORY[kind]);
      expect(stageIdentity({ kind, ruleset: null }).category).toBe(stageCategory(kind));
    }
  });

  it("files no unknown kind under a group", () => {
    expect(stageCategoryOf("order_forge")).toBe("bonus");
    expect(stageCategoryOf("mystery_box")).toBeNull();
  });

  it("does not reorder today's stages: the ladder keeps the server's order", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    render(<MemoryRouter><StageLadder run={run} /></MemoryRouter>);
    expect(screen.getAllByTestId(/^daily-ladder-/).map((el) => el.getAttribute("data-stage-kind")))
      .toEqual(["time_trial", "standard", "survival", "weak_areas", "review"]);
  });
});

describe("D — Weak Areas and Recently Missed are told apart", () => {
  it("uses the approved sentences", () => {
    expect(stageIdentity({ kind: "weak_areas", ruleset: null }).rule)
      .toBe("From your history — fresh questions from areas you've struggled with before.");
    expect(stageIdentity({ kind: "review", ruleset: null }).rule)
      .toBe("From today — retry the knowledge you missed in this Daily.");
    expect(stageIdentity({ kind: "review", ruleset: null }).label).toBe("Recently Missed");
    expect(stageIdentity({ kind: "weak_areas", ruleset: null }).label).toBe("Weak Areas");
  });

  it("the stage intros print them", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    const { unmount } = render(<MemoryRouter><StageIntroBeat run={run} stage={run.stages[3]} /></MemoryRouter>);
    expect(screen.getByTestId("daily-stage-intro-rule")).toHaveTextContent(/^From your history/);
    unmount();
    render(<MemoryRouter><StageIntroBeat run={run} stage={run.stages[4]} /></MemoryRouter>);
    expect(screen.getByTestId("daily-stage-tag")).toHaveTextContent(/recently missed/i);
    expect(screen.getByTestId("daily-stage-intro-rule")).toHaveTextContent(/^From today/);
  });

  it("no longer says Review closes the day or that a stage's misses are 'saved for Review'", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    render(<MemoryRouter><DailyIntroBeat run={run} /></MemoryRouter>);
    expect(screen.getByTestId("daily-intro")).toHaveTextContent("5 stages today");
    expect(screen.getByTestId("daily-intro")).not.toHaveTextContent(/closes the day/i);
    const settled = fixtureRun(FIVE_STAGE_DAY, { current_stage_index: 1 }, {
      0: { status: "completed", child_match_id: "m0", result: wireResult({ misses: 3 }) } });
    const miss = buildDailyStageResult(settled, settled.stages[0]).snapshot!.find((s) => s.key === "misses")!;
    expect(miss).toMatchObject({ label: "Missed", value: "3", hint: "questions" });
    expect(JSON.stringify(buildDailyStageResult(settled, settled.stages[0]))).not.toMatch(/for review|saved/i);
  });

  it("History's retrospective Review sentence is not 'from today'", () => {
    const src = source("src/components/quiz/workspace/StageAnalytics.tsx");
    expect(src).toMatch(/stage\.kind === "review"\) return "From that day/);
  });

  it("the recap words a skipped stage only from the reason the server stated", () => {
    const skipped = (kind: "weak_areas" | "review", reason: string | null) => {
      const specs = kind === "review" ? FOUR_STAGE_DAY : FIVE_STAGE_DAY;
      const stageOverrides: Record<number, Record<string, unknown>> = {};
      specs.forEach((_, i) => { stageOverrides[i] = { status: "completed", result: wireResult() }; });
      const at = specs.findIndex((s) => s.kind === kind);
      stageOverrides[at] = { status: "skipped", result: null, skip_reason: reason };
      return { run: readDailyRun(wireRun(specs, { status: "completed", outcome: "reviewed",
        current_stage_index: null }, stageOverrides)), at };
    };
    const noteFor = (kind: "weak_areas" | "review", reason: string | null) => {
      const { run, at } = skipped(kind, reason);
      const { unmount } = render(<MemoryRouter><DailyCompletion run={run} /></MemoryRouter>);
      const text = screen.getByTestId(`daily-recap-${at}-result`).textContent;
      unmount();
      return text;
    };
    expect(noteFor("review", "perfect")).toBe("Nothing missed");
    expect(noteFor("review", "review_items_unavailable")).toBe("Couldn't be replayed");
    expect(noteFor("weak_areas", "weak_areas_unavailable")).toBe("Not enough past misses");
    // No reason stated, or one this client does not know: neutral, never "Not needed".
    expect(noteFor("weak_areas", null)).toBe("Not played");
    expect(noteFor("weak_areas", "some_future_reason")).toBe("Not played");
    expect(noteFor("review", "weak_areas_unavailable")).toBe("Not played");
    expect(skippedStageNote({ kind: "order_forge", skipReason: "perfect" })).toBe("Not played");
  });

  it("the guest save gate does not promise Weak Areas 'from tomorrow'", () => {
    const done = readDailyRun(finishedWire(FIVE_STAGE_DAY));
    render(<MemoryRouter><DailyCompletion run={done} saveRequired /></MemoryRouter>);
    const gate = screen.getByTestId("daily-save-gate");
    expect(gate).not.toHaveTextContent(/tomorrow/i);
    expect(gate).toHaveTextContent("Weak Areas questions drawn from your saved history");
  });

  it("no daily-run source still carries the old misleading strings", () => {
    const dir = "src/pages/quiz-daily-challenge/run";
    const files = readdirSync(here(dir)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    const all = files.map((f) => source(`${dir}/${f}`)).join("\n")
      + source("src/lib/daily-challenge/run/stageIdentity.ts")
      + source("src/lib/daily-challenge/run/stageResultModel.ts");
    for (const old of ["Review closes the day", "For Review", "Not needed", "from tomorrow",
      "Today's mistakes, one more time", "Built from what you've missed before"]) {
      expect(all).not.toContain(old);
    }
  });
});

describe("E — no Daily surface claims a streak exists", () => {
  it("the Daily's own screens print no streak", () => {
    const day = readDailyRun(finishedWire(FUTURE_V5_DAY));
    render(<MemoryRouter><DailyCompletion run={day} saveRequired /></MemoryRouter>);
    expect(document.body.textContent).not.toMatch(/streak/i);
  });

  it("the Daily run's source and its hub status never mention one", () => {
    const dir = "src/pages/quiz-daily-challenge/run";
    for (const f of readdirSync(here(dir)).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))) {
      expect(source(`${dir}/${f}`), f).not.toMatch(/streak/i);
    }
    for (const day of [FIVE_STAGE_DAY, FUTURE_V5_DAY]) {
      expect(dailyStatusFrom(fixtureRun(day)).streak).toBeNull();
    }
  });

  it("the PLAY scroll's Daily line and the house ad promise no streak", () => {
    const daily = PLAY_MODES.find((m) => m.id === "daily")!;
    expect(daily.note).not.toMatch(/streak/i);
    const ads = source("src/lib/ads/houseAds.ts");
    const dailyAd = ads.slice(ads.indexOf("const DAILY_CHALLENGE"), ads.indexOf("const QUIZ_HISTORY"));
    expect(dailyAd).toContain("Daily");
    expect(dailyAd).not.toMatch(/streak/i);
    expect(source("src/pages/admin/AdminPlatformPolicies.tsx")).not.toMatch(/still keeps streaks/);
  });
});

describe("F — no backend-dependent main-complete behaviour is invented", () => {
  it("a Standard that is complete does not make an active day 'done'", () => {
    const run = readDailyRun(wireRun(FUTURE_V5_DAY, { current_stage_index: 1 }, {
      0: { status: "completed", child_match_id: "m0", result: wireResult() } }));
    expect(run.status).toBe("active");
    expect(dailyStatusFrom(run)).toMatchObject({ completed: false, resumable: true });
  });

  it("the reader ignores a main_completed_at it was not asked to read", () => {
    const wire = wireRun(FUTURE_V5_DAY, { current_stage_index: 1,
      main_completed_at: "2026-10-07T00:00:00Z", main_complete: true }, {
      0: { status: "completed", child_match_id: "m0", result: wireResult() } });
    const run = readDailyRun(wire) as unknown as Record<string, unknown>;
    expect(run).not.toHaveProperty("mainCompletedAt");
    expect(run).not.toHaveProperty("mainComplete");
    expect(dailyStatusFrom(run as never).completed).toBe(false);
  });

  it("nothing draws the grouped hierarchy yet", () => {
    const run = fixtureRun(FIVE_STAGE_DAY);
    render(<MemoryRouter><DailyIntroBeat run={run} /></MemoryRouter>);
    expect(document.body.textContent).not.toMatch(/today's challenge|more challenges|bonus|today's review/i);
    const dir = "src/pages/quiz-daily-challenge/run";
    for (const f of readdirSync(here(dir)).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))) {
      expect(source(`${dir}/${f}`), f).not.toMatch(/More Challenges|Today's Challenge|main_completed|mainComplete/);
    }
  });
});

describe("tag chrome", () => {
  it("tags every known kind with its category", () => {
    for (const kind of DAILY_STAGE_KINDS) {
      const { unmount } = render(<StageTag stage={{ kind, ruleset: null }} />);
      expect(screen.getByTestId("daily-stage-tag")).toHaveAttribute("data-stage-category", stageCategory(kind));
      unmount();
    }
  });
});
