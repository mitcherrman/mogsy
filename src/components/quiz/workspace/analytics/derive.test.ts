/**
 * HUB6.3E — the analytics room's pure view models, on the Analytics Lab's
 * real HUB6.3C golden. Membership is exact (server ids), nothing is
 * inferred, and the words follow the owner's terminology.
 */
import { describe, expect, it } from "vitest";
import { readHistoryPage, type DailyHistoryRecord, type HistoryStage } from "@/lib/history/contracts";
import { buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { accuracyComparison, questionsPlayedDelta } from "@/components/quiz/workspace/historyComparisons";
import { ANALYTICS_LAB_GOLDEN, type AnalyticsLabScenario } from "@/pages/dev/lobby-preview/history/analyticsLabSource";
import {
  CORE_KINDS,
  courseModules,
  coreStreak,
  dailyDonut,
  questionContext,
  recordOf,
  reviewDonut,
  reviewLinks,
  stageCategoryDonut,
  streakIds,
  survivalFloors,
} from "./derive";
import { binLabel, cohortReason, ordinal, percentileNumber, signed, strongestReason } from "./copy";
import { categoryInk, categoryName, CATEGORY_ORDER } from "./ink";

function records(scenario: AnalyticsLabScenario = "lab_premium"): DailyHistoryRecord[] {
  return ANALYTICS_LAB_GOLDEN.scenarios[scenario].flatMap((page) => readHistoryPage(page).items);
}
const run = (n: number, s: AnalyticsLabScenario = "lab_premium") =>
  records(s).find((r) => r.runId === `lab-run-${String(n).padStart(2, "0")}`)!;
const stage = (n: number, kind: string, s: AnalyticsLabScenario = "lab_premium"): HistoryStage =>
  run(n, s).stages.find((x) => x.kind === kind)!;

describe("Time Trial 23 / 29 → 25 / 28 (L3 → L4)", () => {
  it("the server's previous and delta, worded to the owner's terms", () => {
    const p = stage(4, "time_trial").analytics!.personalFacts.personal!;
    expect([p.current!.correct, p.current!.questionsPlayed, p.previous!.correct, p.previous!.questionsPlayed]).toEqual([25, 28, 23, 29]);
    expect(signed(p.delta!.correct)).toBe("+2");
    expect(questionsPlayedDelta(p.delta!.questionsPlayed)).toBe("1 fewer question played");
    const a = accuracyComparison(p.current!.accuracy!, p.previous!.accuracy!);
    expect(a.versus).toBe("89% vs 79%");
    expect(a.change).toBe("10 points higher");
    expect(p.delta!.longestStreak).toBe(3);
    expect(recordOf(p, "correct")!.status).toBe("new_record");
  });
});

describe("nested donut — exact membership", () => {
  it("Time Trial: outcome ids are the server's; each outer slice is category × outcome; every question once", () => {
    for (const n of [4, 5, 14]) {
      const s = stage(n, "time_trial");
      const d = stageCategoryDonut(s);
      const server = s.analytics!.personalFacts.outcomes!;
      for (const inner of d.inner) expect(new Set(inner.ids)).toEqual(new Set(server[inner.outcome].questionResultIds));
      const all = d.outer.flatMap((o) => o.ids);
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBe(s.basic.questionsPlayed);
      for (const o of d.outer) {
        const cat = s.analytics!.personalFacts.categories.find((c) => c.publicCategory.key === o.group)!;
        expect(new Set(o.ids)).toEqual(new Set(cat.idsByOutcome[o.outcome]));
      }
      // Outer slices within an outcome add up to the inner slice.
      for (const inner of d.inner) {
        expect(d.outer.filter((o) => o.outcome === inner.outcome).reduce((a, o) => a + o.count, 0)).toBe(inner.count);
      }
    }
  });

  it("the timeout-heavy Time Trial (L5) has a timed-out inner slice of 6", () => {
    expect(stageCategoryDonut(stage(5, "time_trial")).inner.find((i) => i.outcome === "timeout")!.count).toBe(6);
  });

  it("a group carries this attempt's C / played and the earlier stages' totals (current excluded) — facts, no verdict", () => {
    const s = stage(4, "time_trial");
    const d = stageCategoryDonut(s);
    const item = d.groups.find((g) => g.group === "itemization")!;
    const hist = s.analytics!.personalFacts.personal!.categoryHistory.find((h) => h.publicCategory.key === "itemization")!;
    expect(item.history).toEqual({ correct: hist.correct, played: hist.questionsPlayed, accuracy: hist.accuracy, attempts: hist.priorAttempts });
    expect(Object.keys(item)).not.toContain("weakness");
  });

  it("the Daily donut (result × stage) covers every exact question of the Daily once", () => {
    const r = run(14);
    const d = dailyDonut(r, "stage");
    expect(d.total).toBe(r.basic.questionsPlayed);
    expect(d.groups.map((g) => g.group)).toEqual(r.stages.map((s) => s.stageId));
    const correct = d.inner.find((i) => i.outcome === "correct")!;
    expect(correct.count).toBe(r.basic.correct);
    // Each group's ids live in exactly that stage.
    for (const g of d.groups) {
      const vm = buildStageViewModel(r.stages.find((s) => s.stageId === g.group)!);
      expect(g.ids.every((id) => vm.byOccurrence.has(id))).toBe(true);
    }
  });

  it("labels are public categories only — never a raw family id", () => {
    for (const r of records()) {
      for (const s of r.stages) {
        for (const g of stageCategoryDonut(s).groups) {
          expect(g.label).not.toMatch(/_|:|@/);
          expect(CATEGORY_ORDER).toContain(g.group);
        }
      }
    }
    expect(categoryName("general", "Question")).toBe("General");
    expect(categoryName("runes", "Runes")).toBe("Runes");
    expect(categoryInk("unknown-key")).toBe(categoryInk("general"));
  });
});

describe("streaks and records", () => {
  it("Core streak: the server's Core current, with every tied stage", () => {
    expect(coreStreak(run(14))).toMatchObject({ length: 15, kinds: ["standard"] });
    expect(coreStreak(run(1))!.kinds.sort()).toEqual(["survival", "time_trial"]);
  });

  it("Free Core streak equals the Premium one (max of the core stages' Free streaks)", () => {
    for (const r of records("lab_free")) {
      const premium = coreStreak(run(Number(r.runId.slice(-2))))!;
      expect(coreStreak(r)!.length).toBe(premium.length);
    }
  });

  it("a stage's streak ids are its exact span, in rail order", () => {
    const s = stage(10, "time_trial");
    const ids = streakIds(s);
    expect(ids).toHaveLength(25);
    expect(ids[0]).toBe(s.basic.longestStreakSpan!.startQuestionResultId);
    expect(ids[24]).toBe(s.basic.longestStreakSpan!.endQuestionResultId);
  });

  it("Core records: most correct and longest streak — never the raw Daily score", () => {
    for (const r of records()) {
      const core = r.analytics!.personal!.core!;
      expect(core.records.map((x) => x.metric).sort()).toEqual(["correct", "longest_streak"]);
    }
    expect(recordOf(run(1).analytics!.personal!.core, "correct")!.status).toBe("first_attempt");
  });
});

describe("Standard course — the real production recipe", () => {
  it("ten modules: Splash ×4, Meta Reflex, Splash ×3, Meta Reflex, Journey — never Slice", () => {
    for (const n of [12, 14]) {
      const m = courseModules(stage(n, "standard"));
      expect(m.map((x) => x.unit)).toEqual([
        "splash", "splash", "splash", "splash", "meta_reflex", "splash", "splash", "splash", "meta_reflex", "journey",
      ]);
      expect(m.map((x) => x.unit)).not.toContain("slice");
    }
  });

  it("the Journey has five children (L12), or four when its clock ran out (L14); Meta Reflex five cards", () => {
    expect(courseModules(stage(12, "standard"))[9]).toMatchObject({ played: 5, correct: 5 });
    expect(courseModules(stage(14, "standard"))[9].played).toBe(4);
    expect(courseModules(stage(14, "standard"))[4].played).toBe(5);
    // A module's ids are exactly its questions on the rail.
    const m = courseModules(stage(14, "standard"))[9];
    expect(m.round!.occurrences.map((o) => o.occurrenceId)).toEqual(m.ids);
  });
});

describe("Survival — exact strike positions", () => {
  it("L11: strikes 1/2/3 on the server's own questions (rail 22 / 28 / 31)", () => {
    const s = stage(11, "survival");
    const floors = survivalFloors(s);
    const strikes = floors.filter((f) => f.strikeIndex !== null);
    expect(strikes.map((f) => f.strikeIndex)).toEqual([1, 2, 3]);
    expect(strikes.map((f) => f.railPosition)).toEqual([22, 28, 31]);
    // The Free markers are the Premium list, question for question.
    expect(strikes.map((f) => f.occurrence.occurrenceId)).toEqual(s.analytics!.personalFacts.strikes!.map((x) => x.questionResultId));
    expect(floors).toHaveLength(s.basic.depth!);
  });

  it("the Free record carries the same strike positions (no Premium needed)", () => {
    const floors = survivalFloors(stage(11, "survival", "lab_free"));
    expect(floors.filter((f) => f.strikeIndex !== null).map((f) => f.railPosition)).toEqual([22, 28, 31]);
  });
});

describe("Review — exact source → replay", () => {
  it("L14: each replay links to its exact source miss, with the source's stage and rail position", () => {
    const r = run(14);
    const links = reviewLinks(r, stage(14, "review"));
    expect(links).toHaveLength(3);
    const sources = stage(14, "review").analytics!.personalFacts.reviewSources;
    for (const l of links) {
      const src = sources.find((x) => x.questionResultId === l.replayId)!;
      expect(l.source!.questionResultId).toBe(src.source.questionResultId);
      expect(l.source!.stageKind).toBe(src.source.stageKind);
      const sourceStage = r.stages.find((s) => s.stageId === src.source.stageId)!;
      const vm = buildStageViewModel(sourceStage);
      expect(vm.rounds[l.source!.position! - 1].occurrences.some((o) => o.occurrenceId === src.source.questionResultId)).toBe(true);
    }
    expect(links.map((l) => l.source!.stageKind)).toEqual(["time_trial", "survival", "weak_areas"]);
    expect(reviewDonut(r, links).total).toBe(3);
  });

  it("a replay without a stored link says so; nothing is matched by content or order", () => {
    const r = run(14);
    const review = stage(14, "review");
    const stripped: HistoryStage = {
      ...review,
      analytics: { ...review.analytics!, personalFacts: { ...review.analytics!.personalFacts, reviewSources: [] } },
    };
    expect(reviewLinks(r, stripped).every((l) => l.source === null)).toBe(true);
  });
});

describe("Weak Areas — no invented provenance", () => {
  it("the selection has slots, cutoff and policy only — no source question, miss count or last-missed date", () => {
    const sel = stage(14, "weak_areas").analytics!.personalFacts.selection!;
    expect(sel.evidenceCutoff).toBeTruthy();
    expect(sel.policyVersion).toBe("weak-areas-v2");
    for (const slot of sel.slots) {
      expect(Object.keys(slot).sort()).toEqual(["questionResultIds", "roundNumber", "slotIndex", "slotPublicCategory"]);
    }
  });
});

describe("question context", () => {
  it("Premium: exact prior attempts and earlier-stage category totals; Free: category and this stage's count", () => {
    const r = run(4);
    const s = stage(4, "time_trial");
    const o = buildStageViewModel(s).rounds[1].occurrences[0];
    const ctx = questionContext(r, s, o);
    expect(ctx.prior).not.toBeNull();
    expect(ctx.categoryHistory).not.toBeNull();
    expect(ctx.stageCategory).not.toBeNull();
    const free = run(4, "lab_free");
    const fs = stage(4, "time_trial", "lab_free");
    const f = questionContext(free, fs, buildStageViewModel(fs).rounds[1].occurrences[0]);
    expect(f.prior).toBeNull();
    expect(f.categoryHistory).toBeNull();
    expect(f.stageCategory).toEqual(ctx.stageCategory);
  });

  it("a Review replay names the exact miss it re-asked; the miss names its replay's result", () => {
    const r = run(14);
    const review = stage(14, "review");
    const replay = buildStageViewModel(review).rounds[0].occurrences[0];
    expect(questionContext(r, review, replay).replays).toMatchObject({ stageKind: "time_trial", position: 7, outcome: "incorrect" });
    const tt = stage(14, "time_trial");
    const miss = buildStageViewModel(tt).rounds[6].occurrences[0];
    expect(questionContext(r, tt, miss).replayedAs).toBe("correct");
  });

  it("Survival strikes are Free context", () => {
    const s = stage(11, "survival", "lab_free");
    const floor = survivalFloors(s).find((f) => f.strikeIndex === 2)!;
    expect(questionContext(run(11, "lab_free"), s, floor.occurrence)).toMatchObject({ strikeIndex: 2, maxStrikes: 3 });
  });
});

describe("copy", () => {
  it("ordinals and percentiles never read 0th or 100th", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 87, 99].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "87th", "99th"]);
    expect(percentileNumber(0.9997)).toBe(99);
    expect(percentileNumber(0.001)).toBe(1);
    expect(percentileNumber(0.874)).toBe(87);
  });

  it("insufficiency and not-built are worded facts", () => {
    expect(cohortReason({ type: "rolling_28d", status: "insufficient", reasonCode: "insufficient_population", users: 40, sufficiency: { status: "insufficient", observed: 40, required: 100, reasonCode: "insufficient_population" }, metrics: {}, asOf: null, windowDays: 28, observations: 40, generatedAt: null }))
      .toBe("Not enough players yet — 40 of the 100 needed.");
    expect(strongestReason("margin_below_threshold")).toMatch(/10 points/);
    expect(strongestReason("mode_population_insufficient")).toMatch(/enough players/);
  });

  it("bin labels: integer ranges, open ends and tenths", () => {
    expect(binLabel({ lower: 10, upper: 12, lowerOpen: false, upperOpen: false, upperInclusive: false, count: 5 }, false)).toBe("10–11");
    expect(binLabel({ lower: null, upper: 6, lowerOpen: true, upperOpen: false, upperInclusive: false, count: 5 }, false)).toBe("under 6");
    expect(binLabel({ lower: 18, upper: null, lowerOpen: false, upperOpen: true, upperInclusive: false, count: 5 }, false)).toBe("18 or more");
    expect(binLabel({ lower: 0.8, upper: 1, lowerOpen: false, upperOpen: false, upperInclusive: true, count: 5 }, true)).toBe("80–100%");
  });

  it("CORE_KINDS is Standard, Time Trial, Survival", () => {
    expect(CORE_KINDS).toEqual(["standard", "time_trial", "survival"]);
  });
});
