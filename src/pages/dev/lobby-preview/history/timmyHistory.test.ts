/**
 * HUB5 — Timmy's History fixtures: fixed time, one identity, raw facts, and a
 * golden that HUB2.1's real route produced from exactly those facts.
 *
 * What is asserted here is the FIXTURE's truthfulness. The History UI's own
 * behaviour is certified against these fixtures in
 * `LobbyPreviewPage.history.test.tsx`.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readHistoryPage, type DailyHistoryRecord, type HistoryPage } from "@/lib/history/contracts";
import { HISTORY_PAGE_SIZE } from "@/lib/history/historyApi";
import { readMatchReview } from "@/lib/ranked-public/contracts";
import { FIXTURE_ANCHOR, fixtureDate, fixtureInstant } from "./fixtureClock";
import {
  buildDailyAccount,
  canonicalJson,
  FixtureFactError,
  type DailyAccountFacts,
  type RunFact,
} from "./dailyFixtureBuilder";
import { GOLDEN_PAGE_SIZE } from "./goldenPageSize";
import { ALL_FIXTURE_REFS, identityOf, quizContentOf, quizRef, rankedRef, refNamespace } from "./questionIdentity";
import { FIRST_DAILY_FACTS, TIMMY_DAILY_FACTS } from "./timmyDailyFacts";
import { FIRST_DAILY, TIMMY_DAILY, timmyHistoryInput } from "./timmyHistoryInput";
import { TIMMY_HISTORY_GOLDEN, TIMMY_HISTORY_SOURCES, type TimmyHistoryScenario } from "./timmyHistorySource";
import { SYNTHETIC_RANKED_HISTORY, SYNTHETIC_RANKED_REVIEWS } from "../syntheticRankedHistory";
import {
  LOBBY_PREVIEW_STATES,
  TIMMY_MATCH_HISTORY,
  TIMMY_QUESTION_LIBRARY,
} from "../lobbyPreviewFixtures";
import { TIMMY_MISSED_PREMIUM, TIMMY_PRACTICE_SESSIONS } from "../timmyPractice";

const pages = (s: TimmyHistoryScenario): HistoryPage[] =>
  TIMMY_HISTORY_GOLDEN.scenarios[s].map((p) => readHistoryPage(p));
const records = (s: TimmyHistoryScenario): DailyHistoryRecord[] => pages(s).flatMap((p) => p.items);
const run = (s: TimmyHistoryScenario, n: number) => {
  const r = records(s).find((x) => x.runId === `timmy-run-${String(n).padStart(2, "0")}`);
  if (!r) throw new Error(`no run ${n} in ${s}`);
  return r;
};
const signalsFor = (r: DailyHistoryRecord, type: string) =>
  (r.analytics?.learningSignals ?? []).filter((s) => s.type === type).map((s) => s.questionResultId);
const questionById = (r: DailyHistoryRecord, id: string | null) =>
  r.stages.flatMap((s) => s.questions).find((q) => q.questionResultId === id)!;

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────── fixed time

describe("fixed anchor — no fixture reads the clock", () => {
  it("anchors every instant at 2026-09-15T18:00:00Z, in UTC", () => {
    expect(FIXTURE_ANCHOR).toBe("2026-09-15T18:00:00.000Z");
    expect(fixtureInstant(0)).toBe(FIXTURE_ANCHOR);
    expect(fixtureInstant(3, 9, 30)).toBe("2026-09-12T09:30:00.000Z");
    expect(fixtureDate(fixtureInstant(10, 23, 59))).toBe("2026-09-05");
  });

  it("refuses an instant after the anchor or an invalid offset", () => {
    expect(() => fixtureInstant(0, 19)).toThrow(/after its anchor/);
    expect(() => fixtureInstant(-1)).toThrow();
    expect(() => fixtureInstant(1, 24)).toThrow();
  });

  it("produces byte-identical fixtures on another day (the clock is ignored)", async () => {
    const today = timmyHistoryInput();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-02-03T04:05:06Z"));
    vi.resetModules();
    const later = await import("./timmyHistoryInput");
    const laterFixtures = await import("../lobbyPreviewFixtures");
    expect(later.timmyHistoryInput()).toBe(today);
    expect(canonicalJson(laterFixtures.TIMMY_MATCH_HISTORY)).toBe(canonicalJson(TIMMY_MATCH_HISTORY));
    expect(canonicalJson(laterFixtures.TIMMY_QUESTION_LIBRARY)).toBe(canonicalJson(TIMMY_QUESTION_LIBRARY));
    expect(canonicalJson(laterFixtures.LOBBY_PREVIEW_STATES.timmy.entitlements))
      .toBe(canonicalJson(LOBBY_PREVIEW_STATES.timmy.entitlements));
  });

  it("names no clock or local-time API anywhere in the preview's fixture sources", () => {
    const dir = resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(full);
      }
    };
    walk(dir);
    const offenders = files.filter((f) =>
      /Date\.now\(|new Date\(\)|\.setHours\(|\.setDate\(|\.getDate\(|Math\.random\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("dates every Daily run, Ranked match and Practice session at or before the anchor", () => {
    const instants = [
      ...TIMMY_DAILY_FACTS.runs.map((r) => r.completedAt),
      ...TIMMY_MATCH_HISTORY.map((m) => m.completedAt),
      ...TIMMY_PRACTICE_SESSIONS.map((s) => s.completed_at!),
      ...TIMMY_MISSED_PREMIUM.results.map((m) => m.missed_at),
    ];
    for (const at of instants) expect(at <= FIXTURE_ANCHOR, at).toBe(true);
    expect(TIMMY_HISTORY_GOLDEN.scenarios.timmy_premium[0].as_of).toBe("2026-09-15T18:00:00+00:00");
  });
});

// ─────────────────────────────────────────────────────────── golden provenance

describe("the golden is HUB2.1's projection of THESE facts", () => {
  it("was generated from byte-identical input rows", () => {
    const sha = createHash("sha256").update(timmyHistoryInput(), "utf8").digest("hex");
    expect(sha).toBe(TIMMY_HISTORY_GOLDEN.input_sha256);
  });

  it("names the HUB2.3 backend commit that projected it", () => {
    expect(TIMMY_HISTORY_GOLDEN.hub2_commit).toBe("1ffa624cf7c2c0e429770226aef7806ad87fda67");
  });

  it("is cut at the page size the real History hook requests", () => {
    expect(GOLDEN_PAGE_SIZE).toBe(HISTORY_PAGE_SIZE);
  });

  it("states each record's own C/A exactly as the facts do", () => {
    for (const built of [TIMMY_DAILY, FIRST_DAILY]) {
      const projected = [...records("timmy_premium"), ...records("first_daily")];
      for (const row of built.rows.daily_run_stages) {
        const results = built.rows.ranked_segment_child_results.filter((q) => q.match_id === row.child_match_id);
        const record = projected.find((r) => r.runId === row.run_id)!;
        const stage = record.stages.find((s) => s.order === row.stage_index)!;
        expect(stage.basic.answered).toBe(results.length);
        expect(stage.basic.correct).toBe(results.filter((q) => q.outcome === "correct").length);
        expect(stage.basic.score).toBe(JSON.parse(row.result_json).score);
      }
    }
  });

  it("parses through the production parser identically in every scenario", () => {
    for (const s of Object.keys(TIMMY_HISTORY_GOLDEN.scenarios) as TimmyHistoryScenario[]) {
      expect(() => pages(s)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────── the source

describe("the offline History source", () => {
  it("walks the server's own cursor: 10 runs, then the 11th", async () => {
    const source = TIMMY_HISTORY_SOURCES.timmy_premium;
    const first = await source.page({ cursor: null, limit: HISTORY_PAGE_SIZE });
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();
    const second = await source.page({ cursor: first.nextCursor, limit: HISTORY_PAGE_SIZE });
    expect(second.items.map((r) => r.runId)).toEqual(["timmy-run-01"]);
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a page size or cursor the golden was not cut at", async () => {
    await expect(TIMMY_HISTORY_SOURCES.timmy_premium.page({ cursor: null, limit: 20 })).rejects.toThrow();
    await expect(TIMMY_HISTORY_SOURCES.timmy_premium.page({ cursor: "made-up", limit: 10 })).rejects.toThrow();
  });

  it("serves the newcomer an empty page, not an error", async () => {
    const page = await TIMMY_HISTORY_SOURCES.newcomer.page({ cursor: null, limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── identity

describe("one identity factory", () => {
  it("mints all three namespaces and resolves every one back", () => {
    const namespaces = new Set(ALL_FIXTURE_REFS.map(refNamespace));
    expect([...namespaces].sort()).toEqual(["mastery", "quiz", "ranked"]);
    for (const ref of ALL_FIXTURE_REFS) expect(identityOf(ref).canonicalRef).toBe(ref);
    expect(() => identityOf("ranked:demo-not-a-question")).toThrow();
  });

  it("gives only quiz refs an exact key, and never parses other namespaces as quiz keys", () => {
    for (const ref of ALL_FIXTURE_REFS) {
      const id = identityOf(ref);
      if (id.namespace === "quiz") expect(id.exactKey).toBe(ref.slice("quiz:".length));
      else expect(id.exactKey).toBeNull();
    }
  });

  it("uses ONE ref per question on every surface: Ranked, Daily, Owned, Missed, History", () => {
    const refs = new Set<string>();
    for (const review of [...Object.values(SYNTHETIC_RANKED_REVIEWS), ...Object.values(TIMMY_DAILY.reviews)]) {
      for (const round of review.rounds) if (round.canonicalQuestionRef) refs.add(round.canonicalQuestionRef);
    }
    for (const e of TIMMY_QUESTION_LIBRARY.entries) refs.add(e.canonicalQuestionRef);
    for (const r of records("timmy_premium")) {
      for (const q of r.stages.flatMap((s) => s.questions)) refs.add(q.canonicalRef!);
    }
    for (const ref of refs) expect(() => identityOf(ref), ref).not.toThrow();
    // The pre-HUB5 mismatch: the collection wrote `ranked:<id>` while the
    // reviews wrote `ranked:demo-<id>`. Every ranked ref is now minted once.
    for (const ref of refs) if (ref.startsWith("ranked:")) expect(ref).toMatch(/^ranked:demo-/);
  });

  it("shows one question the same way in Practice (Missed), a Daily stage and Owned", () => {
    const ref = quizRef("rabadon-ap");
    const content = quizContentOf(ref);
    const missed = TIMMY_MISSED_PREMIUM.results.filter((m) => m.question_id === identityOf(ref).quizQuestionId);
    expect(missed.length).toBeGreaterThan(0);
    for (const m of missed) {
      expect(m.question_text).toBe(content.prompt);
      expect(m.correct_answer).toBe(content.options[content.correctIndex]);
    }
    const dailyRounds = Object.values(TIMMY_DAILY.reviews).flatMap((r) => r.rounds)
      .filter((r) => r.canonicalQuestionRef === ref);
    expect(dailyRounds.length).toBeGreaterThan(3);
    for (const r of dailyRounds) expect(r.question!.prompt).toBe(content.prompt);
    const owned = TIMMY_QUESTION_LIBRARY.entries.filter((e) => e.canonicalQuestionRef === ref);
    expect(owned).toHaveLength(1);
    expect(owned[0].question!.prompt).toBe(content.prompt);
  });

  it("keeps the occurrence apart from the learning identity", () => {
    // Run 11's Survival asks one Mastery concept twice: two occurrences, one
    // learning identity, two different generated instances.
    const survival = run("timmy_premium", 11).stages.find((s) => s.kind === "survival")!;
    const annie = survival.questions.filter((q) => q.canonicalRef === "mastery:annie-q-raw-damage");
    expect(annie.map((q) => [q.roundNumber, q.challengeIndex])).toEqual([[1, 0], [2, 1]]);
    expect(new Set(annie.map((q) => q.questionResultId)).size).toBe(2);
    const review = TIMMY_DAILY.reviews[run("timmy_premium", 11).stages.find((s) => s.kind === "survival")!.reviewMatchId!];
    const prompts = [review.rounds[0].masteryChallenges![0].prompt, review.rounds[1].masteryChallenges![1].prompt];
    expect(prompts[0]).not.toBe(prompts[1]);
  });
});

// ─────────────────────────────────────────────────────────── scenario matrix

describe("4-stage and 5-stage Dailies, in saved order", () => {
  it("B — a first Daily has exactly four persisted stages and no Weak Areas", () => {
    const [first] = records("first_daily");
    expect(first.stageCount).toBe(4);
    expect(first.stages.map((s) => s.kind)).toEqual(["time_trial", "standard", "survival", "review"]);
    const timmyFirst = run("timmy_premium", 1);
    expect(timmyFirst.stages).toHaveLength(4);
    expect(timmyFirst.stages.some((s) => s.kind === "weak_areas")).toBe(false);
  });

  it("C — later Dailies have five stages, Weak Areas included, Review last, none repeated", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const r = run("timmy_premium", n);
      const kinds = r.stages.map((s) => s.kind);
      expect(kinds).toHaveLength(5);
      expect(new Set(kinds).size).toBe(5);
      expect(kinds).toContain("weak_areas");
      expect(kinds[4]).toBe("review");
      expect(r.stages.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("C — keeps each day's saved shuffle rather than one canonical order", () => {
    expect(run("timmy_premium", 2).stages.map((s) => s.kind))
      .toEqual(["survival", "weak_areas", "standard", "time_trial", "review"]);
    expect(run("timmy_premium", 3).stages.map((s) => s.kind))
      .toEqual(["standard", "time_trial", "weak_areas", "survival", "review"]);
    expect(run("timmy_premium", 11).stages.map((s) => s.kind))
      .toEqual(["time_trial", "standard", "survival", "weak_areas", "review"]);
  });

  it("C — every Weak Areas selection was missed in an earlier run (its provenance)", () => {
    const occ = TIMMY_DAILY.occurrences;
    for (const o of occ.filter((x) => x.stageKind === "weak_areas")) {
      const earlier = occ.filter((x) => x.completedAt < o.completedAt && x.ref === o.ref && x.outcome !== "correct");
      expect(earlier.length, `${o.runId} ${o.ref}`).toBeGreaterThan(0);
    }
  });
});

describe("HUB2.1 occurrences", () => {
  it("Q — several challenges in one round, and a ref repeated across occurrences, are never collapsed", () => {
    const survival = run("timmy_premium", 11).stages.find((s) => s.kind === "survival")!;
    expect(survival.rounds!.map((r) => r.questions.length)).toEqual([2, 2, 2, 2]);
    expect(survival.questions).toHaveLength(8);
    const refs = survival.questions.map((q) => q.canonicalRef);
    expect(new Set(refs).size).toBeLessThan(refs.length);
  });

  it("R — rows authored out of order display by round_number, then challenge_index", () => {
    const survivalRun = TIMMY_DAILY.rows.daily_run_stages.find((s) => s.run_id === "timmy-run-11" && s.stage_kind === "survival")!;
    const rawOrder = TIMMY_DAILY.rows.ranked_segment_child_results
      .filter((q) => q.match_id === survivalRun.child_match_id)
      .map((q) => [q.round_number, q.challenge_index]);
    const sorted = rawOrder.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(rawOrder).not.toEqual(sorted);
    const shown = run("timmy_premium", 11).stages.find((s) => s.kind === "survival")!
      .questions.map((q) => [q.roundNumber, q.challengeIndex]);
    expect(shown).toEqual(sorted);
  });

  it("R — the parser orders by ordinals even when the wire array is reversed", () => {
    const wire = JSON.parse(JSON.stringify(TIMMY_HISTORY_GOLDEN.scenarios.timmy_premium[0]));
    for (const item of wire.items) for (const stage of item.stages) stage.questions.reverse();
    const reversed = readHistoryPage(wire).items;
    const original = pages("timmy_premium")[0].items;
    expect(reversed.map((r) => r.stages.map((s) => s.questions.map((q) => q.questionResultId))))
      .toEqual(original.map((r) => r.stages.map((s) => s.questions.map((q) => q.questionResultId))));
  });

  it("gives every stage one timeline position per round, matching its frozen review", () => {
    for (const r of records("timmy_premium")) {
      for (const s of r.stages) {
        const review = TIMMY_DAILY.reviews[s.reviewMatchId!];
        expect(s.rounds!.length).toBe(review.roundCount);
        for (const round of s.rounds!) {
          const reviewRound = review.rounds[round.roundNumber - 1];
          const count = reviewRound.masteryChallenges?.length ?? 1;
          expect(round.questions.length).toBe(count);
        }
      }
    }
  });

  it("freezes every stage review in the real review contract", () => {
    for (const review of [...Object.values(TIMMY_DAILY.reviews), ...Object.values(FIRST_DAILY.reviews)]) {
      const wire = {
        schema_version: review.schemaVersion, projection_type: "match_review", match_id: review.matchId,
        round_number: null, server_time: review.serverTime,
        payload: {
        match_id: review.matchId, final_round_number: review.finalRoundNumber, round_count: review.roundCount,
        rounds: review.rounds.map((r) => ({
          round_number: r.roundNumber, kind: r.kind, module_id: r.moduleId, category: r.category,
          canonical_question_ref: r.canonicalQuestionRef, revealed: r.revealed,
          icon_hint: r.iconHint,
          question: r.question && {
            prompt: r.question.prompt, options: r.question.options,
            correct_option_index: r.question.correctOptionIndex, explanation: r.question.explanation,
          },
          challenges: r.masteryChallenges?.map((c) => ({
            challenge_index: c.challengeIndex, prompt: c.prompt, interaction_kind: c.interactionKind,
            question_family: c.questionFamily, answer_type: c.answerType, answer_options: c.answerOptions,
            prompt_semantics: c.promptSemantics, comparison_semantics: c.comparisonSemantics,
            correct_answer: c.correctAnswer, explanation: c.explanation, viewer_answer: c.viewerAnswer,
            is_correct: c.isCorrect,
          })) ?? null,
          viewer_submission: {
            answer_index: r.viewerSubmission.answerIndex, is_correct: r.viewerSubmission.isCorrect,
            correct_count: r.viewerSubmission.correctCount, answered_count: r.viewerSubmission.answeredCount,
            challenge_count: r.viewerSubmission.challengeCount,
          },
        })),
        },
      };
      expect(() => readMatchReview(wire), review.matchId).not.toThrow();
    }
  });
});

describe("Review recovery provenance", () => {
  const items = TIMMY_DAILY.rows.daily_run_review_items;
  const results = new Map(TIMMY_DAILY.rows.ranked_segment_child_results.map((q) => [q.question_result_id, q]));

  it("links every served replay to its exact source miss, by result id, never by ref", () => {
    for (const item of items) {
      const source = results.get(item.source_question_result_id)!;
      expect(source.outcome).toBe("incorrect");
      expect(source.canonical_question_ref).toBe(item.question_ref);
      if (item.review_question_result_id === null) continue;
      const replay = results.get(item.review_question_result_id)!;
      expect(replay.canonical_question_ref).toBe(item.question_ref);
      expect(replay.outcome).toBe(item.review_outcome);
      expect(replay.match_id).toBe(item.review_match_id);
      // The replay is a new occurrence, not the source again.
      expect(replay.question_result_id).not.toBe(source.question_result_id);
    }
  });

  it("I — a successful replay: run 11 recovered all three attempted misses", () => {
    expect(run("timmy_premium", 11).analytics!.reviewRecoveryRate.value)
      .toEqual({ correct: 3, attempted: 3, rate: 1 });
  });

  it("J — a failed replay, and an unserved allocation that is not counted as a failure", () => {
    const nine = items.filter((i) => i.run_id === "timmy-run-09");
    expect(nine).toHaveLength(4);
    expect(nine[3].review_outcome).toBeNull();
    expect(nine[0].review_outcome).toBe("incorrect");
    expect(run("timmy_premium", 9).analytics!.reviewRecoveryRate.value)
      .toEqual({ correct: 1, attempted: 3, rate: 1 / 3 });
  });

  it("does not treat misses that were never allocated as Review failures", () => {
    const nine = run("timmy_premium", 9);
    const missesBeforeReview = nine.stages.slice(0, 4).flatMap((s) => s.questions).filter((q) => q.outcome !== "correct");
    expect(missesBeforeReview.length).toBeGreaterThan(4);
    expect(nine.analytics!.reviewRecoveryRate.value!.attempted).toBe(3);
  });
});

describe("learning signals (HUB2 decides; the fixture only supplies exposures)", () => {
  it("G — recurring weakness for Baron respawn, in the poor run and the latest run", () => {
    for (const n of [9, 11]) {
      const r = run("timmy_premium", n);
      const refs = signalsFor(r, "recurring_weakness").map((id) => questionById(r, id).canonicalRef);
      expect(refs).toContain(rankedRef("baron-respawn"));
    }
    const nine = run("timmy_premium", 9);
    expect(signalsFor(nine, "repeated_miss").map((id) => questionById(nine, id).canonicalRef))
      .toContain(rankedRef("baron-respawn"));
  });

  it("H — recovered weakness for Rabadon's Deathcap AP after three misses and two corrects", () => {
    const outcomes = TIMMY_DAILY.occurrences.filter((o) => o.ref === quizRef("rabadon-ap")).map((o) => o.outcome);
    expect(outcomes.slice(0, 3)).toEqual(["incorrect", "incorrect", "incorrect"]);
    for (const n of [6, 11]) {
      const r = run("timmy_premium", n);
      const recovered = signalsFor(r, "recovered_weakness").map((id) => questionById(r, id));
      const rabadon = recovered.filter((q) => q.canonicalRef === quizRef("rabadon-ap"));
      expect(rabadon.length).toBeGreaterThan(0);
      expect(rabadon.every((q) => q.outcome === "correct")).toBe(true);
    }
  });

  it("first exposure — a first Daily's every question is first in available history", () => {
    const [first] = records("first_daily");
    const questions = first.stages.flatMap((s) => s.questions);
    const firsts = signalsFor(first, "first_in_available_history");
    // HUB2.2: exposures form one chronological stream, so only the FIRST
    // occurrence of each ref is first — a Review replay or a repeated concept
    // later in the same run already has a previous exposure.
    const firstOccurrences = new Map<string, string>();
    for (const q of first.stages.flatMap((s) => s.questions)) {
      if (!firstOccurrences.has(q.canonicalRef!)) firstOccurrences.set(q.canonicalRef!, q.questionResultId!);
    }
    expect(questions.length).toBeGreaterThan(firstOccurrences.size);
    expect(firsts.slice().sort()).toEqual([...firstOccurrences.values()].sort());
  });
});

describe("HUB2.2 regressions for the two HUB5 findings", () => {
  it("projects truthful mixed provenance: curated null and generated named versions in one stage", () => {
    const eleven = run("timmy_premium", 11);
    const wire = TIMMY_HISTORY_GOLDEN.scenarios.timmy_premium[0] as unknown as {
      items: Array<{ run_id: string; stages: Array<{ kind: string; questions: Array<{ generator_version: string | null }> }> }>;
    };
    const standard = wire.items.find((i) => i.run_id === "timmy-run-11")!.stages.find((s) => s.kind === "standard")!;
    const versions = new Set(standard.questions.map((q) => q.generator_version));
    expect(versions.has(null)).toBe(true);
    expect(versions.has("mastery-gen-4")).toBe(true);
    expect(eleven.stages.find((s) => s.kind === "standard")!.capability.state).toBe("available");
  });

  // HUB5 found run 11's Baron Review replay flagged recurring AND recovered,
  // because HUB2.1 ignored the same-run source miss. HUB2.2 orders exposures
  // across runs, stages, rounds and challenges; the source miss now precedes
  // the replay, so one correct replay cannot establish recovery.
  it("sees the same-run source miss before the Review replay; the replay is not recovered", () => {
    const eleven = run("timmy_premium", 11);
    const replayId = "timmy-qr-11-4-1-0";
    const types = eleven.analytics!.learningSignals.filter((s) => s.questionResultId === replayId).map((s) => s.type);
    expect(questionById(eleven, replayId).canonicalRef).toBe(rankedRef("baron-respawn"));
    expect(types).not.toContain("recovered_weakness");
    const previous = eleven.analytics!.learningSignals.find((s) => s.questionResultId === replayId)!.previous!;
    expect(previous.outcome).toBe("incorrect");
    expect(previous.completedAt).toBe(eleven.completedAt);
  });
});

describe("capability-state matrix", () => {
  const states = (s: TimmyHistoryScenario) => ({
    run: new Set(records(s).map((r) => r.capability.state)),
    stage: new Set(records(s).flatMap((r) => r.stages.map((x) => x.capability.state))),
  });

  it("Premium: available, insufficient evidence and not applicable, each from HUB2", () => {
    const { run: runStates, stage } = states("timmy_premium");
    expect([...runStates].sort()).toEqual(["available", "insufficient_evidence"]);
    expect([...stage].sort()).toEqual(["available", "insufficient_evidence", "not_applicable"]);
  });

  it("M — insufficient evidence carries counts, never a paywall reason", () => {
    const [first] = records("first_daily");
    expect(first.capability).toEqual({ state: "insufficient_evidence", reasonCode: "insufficient_compatible_history" });
    expect(first.analytics!.historicalAverage.sufficiency).toMatchObject({ status: "insufficient", observed: 0, required: 3 });
    expect(run("timmy_premium", 1).capability.reasonCode).toBe("missing_frozen_compatibility");
  });

  it("N — Free: every run is upgrade_required with no analytics, and the basic record is whole", () => {
    for (const r of records("timmy_free")) {
      expect(r.capability.state).toBe("upgrade_required");
      expect(r.analytics).toBeNull();
      const premium = run("timmy_premium", Number(r.runId.slice(-2)));
      expect(r.basic).toEqual(premium.basic);
      expect(r.stages.map((s) => s.questions.length)).toEqual(premium.stages.map((s) => s.questions.length));
    }
  });

  it("O — entitlement unavailable: temporarily_unavailable, never upgrade_required", () => {
    const { run: runStates, stage } = states("timmy_unavailable");
    expect([...runStates]).toEqual(["temporarily_unavailable"]);
    expect(stage.has("upgrade_required")).toBe(false);
  });

  it("P — a stage with no frozen ruleset is not_applicable in every entitlement", () => {
    for (const s of ["timmy_premium", "timmy_free", "timmy_unavailable"] as const) {
      const survival = run(s, 1).stages.find((x) => x.kind === "survival")!;
      expect(survival.capability.state).toBe("not_applicable");
      expect(survival.analytics).toBeNull();
    }
  });

  it("A — the newcomer's History is empty, with no analytics to fake", () => {
    expect(records("newcomer")).toEqual([]);
  });
});

describe("trends and comparisons (HUB2's thresholds, not the fixture's)", () => {
  it("F — up, down and stable all occur, each fitted over five compatible runs", () => {
    const direction = (n: number) => run("timmy_premium", n).analytics!.trajectory.value?.direction ?? null;
    expect([8, 9, 10, 11].map(direction)).toEqual(["up", "down", "stable", "up"]);
    for (const n of [8, 9, 10, 11]) expect(run("timmy_premium", n).analytics!.trajectory.value!.values).toHaveLength(5);
    // Fewer than five compatible runs: no trend at all, never a guess.
    expect(run("timmy_premium", 5).analytics!.trajectory.value).toBeNull();
  });

  it("D — the strong latest run ties its personal best, earliest date kept", () => {
    const best = run("timmy_premium", 11).analytics!.personalBest.value!;
    expect(best).toMatchObject({ isCurrent: true, tied: true, earliestRunId: "timmy-run-08" });
    expect(run("timmy_premium", 11).basic.accuracy).toBeGreaterThan(0.85);
  });

  it("E — the poor run is materially worse than the one before it", () => {
    const poor = run("timmy_premium", 9);
    expect(poor.analytics!.previousRunDeltaPp.value!).toBeLessThan(-20);
    expect(poor.basic.accuracy!).toBeLessThan(poor.analytics!.historicalAverage.value!);
  });

  it("C — HUB2.3: stage order does not split cohorts; runs 2–11 compare, run 1 stands alone", () => {
    // Runs 2 and 3 keep their own day's shuffle, yet join runs 4–11: the run
    // key is now an order-independent multiset of stage keys.
    for (let n = 2; n <= 11; n++) {
      expect(run("timmy_premium", n).analytics!.previousRunDeltaPp.sufficiency.observed).toBe(n - 2);
    }
    expect(run("timmy_premium", 1).capability.reasonCode).toBe("missing_frozen_compatibility");
  });
});

describe("ruleset semantics", () => {
  it("K — Time Trial: completed, or ended by the bank on one timed-out question", () => {
    const tt = (n: number) => run("timmy_premium", n).stages.find((s) => s.kind === "time_trial")!;
    expect(tt(9).basic.endedBy).toBe("time_bank_exhausted");
    expect(tt(9).questions.at(-1)!.outcome).toBe("timeout");
    expect(tt(11).basic.endedBy).toBe("completed");
    expect(tt(11).questions.every((q) => q.outcome !== "timeout")).toBe(true);
    // Settled questions, and nothing about speed.
    expect(tt(9).basic.answered).toBe(6);
    expect(tt(9).ruleset.timeBankMs).toBe(90_000);
  });

  it("L — Survival: ended on its third strike, strikes shown only in Premium analysis", () => {
    const surv = (s: TimmyHistoryScenario) => run(s, 9).stages.find((x) => x.kind === "survival")!;
    expect(surv("timmy_premium").basic.endedBy).toBe("strikes_exhausted");
    expect(surv("timmy_premium").basic.answered - surv("timmy_premium").basic.correct).toBe(3);
    expect(surv("timmy_premium").analytics!.strikesUsed).toBe(3);
    expect(surv("timmy_free").analytics).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── the builder

describe("the builder refuses contradictory facts", () => {
  const base = (): DailyAccountFacts => JSON.parse(JSON.stringify(FIRST_DAILY_FACTS));
  const firstRun = (f: DailyAccountFacts): RunFact => f.runs[0];

  it("accepts the authored facts", () => {
    expect(() => buildDailyAccount(base())).not.toThrow();
  });

  it("refuses a Review item that replays a question that was answered correctly", () => {
    const f = base();
    firstRun(f).review[0].source = { stage: 0, round: 1, challenge: 0 };
    expect(() => buildDailyAccount(f)).toThrow(FixtureFactError);
  });

  it("refuses authored Review questions (they are derived from allocations)", () => {
    const f = base();
    firstRun(f).stages[3].occurrences = [{ round: 1, challenge: 0, ref: rankedRef("flash-cooldown"), outcome: "correct" }];
    expect(() => buildDailyAccount(f)).toThrow(/derived/);
  });

  it("refuses an unserved allocation ahead of a served one", () => {
    const f = base();
    firstRun(f).review[0].outcome = null;
    expect(() => buildDailyAccount(f)).toThrow(/trail/);
  });

  it("refuses a Weak Areas stage on a first run, and a stage out of the Daily shape", () => {
    const f = base();
    firstRun(f).stages.splice(3, 0, { ...firstRun(f).stages[1], kind: "weak_areas" });
    expect(() => buildDailyAccount(f)).toThrow(FixtureFactError);
    const g = base();
    firstRun(g).stages.reverse();
    expect(() => buildDailyAccount(g)).toThrow(/Review must be the last/);
  });

  it("refuses two questions at one (round, challenge), and a gap in the rounds", () => {
    const f = base();
    firstRun(f).stages[0].occurrences![2].round = 1; // R3 is not a Review source
    expect(() => buildDailyAccount(f)).toThrow(/two questions/);
    const g = base();
    firstRun(g).stages[0].occurrences![5].round = 9;
    expect(() => buildDailyAccount(g)).toThrow(/without gaps/);
  });

  it("refuses a Survival that ended on strikes without three misses, or a bank-out without a time-out", () => {
    const f = base();
    firstRun(f).stages[2].endedBy = "strikes_exhausted";
    expect(() => buildDailyAccount(f)).toThrow(/Survival ends/);
    const g = base();
    firstRun(g).stages[0].endedBy = "time_bank_exhausted";
    expect(() => buildDailyAccount(g)).toThrow(/exhausted bank/);
  });

  it("refuses an unknown ref — a typo cannot become a second identity", () => {
    const f = base();
    firstRun(f).stages[0].occurrences![0].ref = "ranked:demo-flash-cooldwn";
    expect(() => buildDailyAccount(f)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────── coexistence

describe("Daily, Ranked and Practice coexist without duplication", () => {
  const dailyChildren = new Set(TIMMY_DAILY.rows.daily_run_stages.map((s) => s.child_match_id));

  it("never lists a Daily child match as an ordinary Ranked row", () => {
    for (const m of [...LOBBY_PREVIEW_STATES.timmy.rankedRecord, ...TIMMY_MATCH_HISTORY]) {
      expect(dailyChildren.has(m.matchId)).toBe(false);
    }
    // …while every Daily child's review is still openable from its stage.
    for (const id of dailyChildren) expect(LOBBY_PREVIEW_STATES.timmy.reviews[id]).toBeDefined();
  });

  it("keeps the ordinary Ranked record chronological, with one continuous rating ladder", () => {
    const rows = TIMMY_MATCH_HISTORY;
    for (let i = 1; i < rows.length; i++) expect(rows[i].completedAt < rows[i - 1].completedAt).toBe(true);
    let expectedAfter: number | null = null;
    for (const row of rows) {
      if (row.ratingDelta === null || row.ratingAfter === null) continue;
      if (expectedAfter !== null) expect(row.ratingAfter).toBe(expectedAfter);
      expectedAfter = row.ratingAfter - row.ratingDelta;
    }
    expect(rows[0].ratingAfter).toBe(LOBBY_PREVIEW_STATES.timmy.progression!.rating);
    // A void moves nothing.
    for (const row of rows.filter((r) => r.terminalReason === "no_contest")) expect(row.ratingDelta).toBeNull();
  });

  it("keeps the synthetic Ranked record the same nine matches", () => {
    expect(TIMMY_MATCH_HISTORY.slice(0, 9)).toEqual(SYNTHETIC_RANKED_HISTORY);
  });
});

describe("Owned & Missed agree with the record", () => {
  it("owns exactly the refs of submitted single-answer rounds, one entry per ref", () => {
    const refs = TIMMY_QUESTION_LIBRARY.entries.map((e) => e.canonicalQuestionRef);
    expect(new Set(refs).size).toBe(refs.length);
    let answered = 0;
    let correct = 0;
    for (const review of Object.values(LOBBY_PREVIEW_STATES.timmy.reviews)) {
      for (const r of review.rounds) {
        if (r.kind !== "quiz" || !r.canonicalQuestionRef || r.viewerSubmission.answerIndex === null) continue;
        answered += 1;
        if (r.viewerSubmission.isCorrect) correct += 1;
        expect(refs).toContain(r.canonicalQuestionRef);
      }
    }
    expect(TIMMY_QUESTION_LIBRARY.summary.totalAnswered).toBe(answered);
    expect(TIMMY_QUESTION_LIBRARY.summary.totalCorrect).toBe(correct);
  });

  it("owns a question discovered ONLY in Daily, and none a time-out never submitted", () => {
    const rankedRefs = new Set(Object.values(SYNTHETIC_RANKED_REVIEWS).flatMap((r) => r.rounds.map((x) => x.canonicalQuestionRef)));
    const dailyOnly = TIMMY_QUESTION_LIBRARY.entries.filter((e) => !rankedRefs.has(e.canonicalQuestionRef));
    expect(dailyOnly.length).toBeGreaterThan(0);
    expect(dailyOnly.every((e) => TIMMY_DAILY.reviews[e.firstMatchId!])).toBe(true);
    // `quiz:first-strike-window` was only ever asked as run 9's timed-out question.
    const timedOutOnly = TIMMY_DAILY.occurrences.filter((o) => o.ref === quizRef("first-strike-window"));
    expect(timedOutOnly.map((o) => o.outcome)).toEqual(["timeout"]);
    expect(TIMMY_QUESTION_LIBRARY.entries.some((e) => e.canonicalQuestionRef === quizRef("first-strike-window"))).toBe(false);
  });

  it("counts a repeated learning identity into ONE consistent ownership entry", () => {
    const ref = quizRef("rabadon-ap");
    const entry = TIMMY_QUESTION_LIBRARY.entries.find((e) => e.canonicalQuestionRef === ref)!;
    const submitted = TIMMY_DAILY.occurrences.filter((o) => o.ref === ref && o.outcome !== "timeout");
    expect(entry.timesAnswered).toBe(submitted.length);
    expect(entry.timesCorrect).toBe(submitted.filter((o) => o.outcome === "correct").length);
    expect(entry.firstSeenAt <= entry.lastSeenAt).toBe(true);
  });

  it("fills the Premium Missed bank's first page from Practice misses only", () => {
    expect(TIMMY_MISSED_PREMIUM.results).toHaveLength(25);
    const misses = TIMMY_PRACTICE_SESSIONS.reduce((n, s) => n + s.total_questions - s.score, 0);
    expect(TIMMY_MISSED_PREMIUM.total_count).toBe(misses);
    for (const m of TIMMY_MISSED_PREMIUM.results) {
      expect(m.selected_answer).not.toBe(m.correct_answer);
    }
    const stamps = TIMMY_MISSED_PREMIUM.results.map((m) => m.missed_at);
    expect(stamps).toEqual(stamps.slice().sort().reverse());
  });
});
