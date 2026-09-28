/**
 * HUB4 — History's Daily → Stage → Question hierarchy, mounted in the REAL
 * hub composition, fed through the REAL parser from HUB2-shaped wire JSON.
 *
 * The golden pages are HUB2's own route output (see contracts.test.ts); the
 * builders below only produce the variants the golden does not cover
 * (not_applicable, a mismatched stage_count, specific metric values), in the
 * same wire shape.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import { readHistoryPage } from "@/lib/history/contracts";
import type { HistorySource } from "@/lib/history/historyApi";
import type { QuizHistoryResponse } from "@/lib/quiz/api";
import type { TrendsSource } from "@/components/quiz/trends/usePerformanceTrends";
import type { MatchHistoryEntryView, MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";
import golden from "@/lib/history/__fixtures__/hub2-history-v1.golden.json";

const getMatchReview = vi.fn();
vi.mock("@/lib/ranked-public/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranked-public/client")>();
  return { ...actual, getMatchReview: (...args: unknown[]) => getMatchReview(...args) };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { id: "u1" }, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
  getExistingBackendAuthToken: vi.fn().mockResolvedValue("token"),
}));

// ------------------------------------------------------------ wire builders

type Json = Record<string, unknown>;
type Cap = { state: string; reason_code: string | null };
interface StageOver {
  score?: number;
  correct?: number;
  answered?: number;
  ended_by?: string;
  capability?: Cap;
  analytics?: Json;
  /** HUB2.1 occurrences as [round_number, challenge_index] per question, in
   *  wire order. Default: one question per round. */
  occurrences?: [number, number][];
  /** Canonical refs per question, in wire order. */
  refs?: string[];
}
interface RunOver {
  stages?: StageOver[];
  stageCapability?: Cap;
  planDate?: string;
  completedAt?: string;
  stageCount?: number;
  score?: number;
  capability?: Cap;
  analytics?: Json | null;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const RULESET: Record<string, string> = { standard: "standard", time_trial: "time_trial", survival: "survival", weak_areas: "standard", review: "standard" };

function wireStage(runId: string, order: number, kind: string, over: StageOver = {}) {
  const answered = over.occurrences?.length ?? over.answered ?? 3;
  const correct = over.correct ?? 2;
  return {
    stage_id: `${runId}:${order}:${kind}`,
    order,
    kind,
    ruleset: {
      id: RULESET[kind] ?? kind,
      version: 1,
      config: { time_bank_ms: kind === "time_trial" ? 60000 : null, max_strikes: kind === "survival" ? 3 : null },
      compatibility_key: `stg1_${kind}deadbeefdeadbeef`,
    },
    review_identity: { match_id: `m-${runId}-${order}` },
    basic: {
      score: over.score ?? 10 + order,
      correct,
      answered,
      accuracy: answered ? correct / answered : null,
      ended_by: over.ended_by ?? "completed",
    },
    questions: Array.from({ length: answered }, (_, i) => ({
      question_result_id: `qr-${runId}-${order}-${i}`,
      canonical_ref: over.refs?.[i] ?? `quiz:secret_family.key${i}`,
      outcome: i < correct ? "correct" : "incorrect",
      review_position: i + 1,
      round_number: over.occurrences ? over.occurrences[i][0] : i + 1,
      challenge_index: over.occurrences ? over.occurrences[i][1] : 0,
      exact_question_key: `secret_family.key${i}`,
      family: "secret_family",
      concept: null,
      category: "Champion Base Stats",
      subject: { kind: "champion", key: "annie", label: "Annie" },
      generator_version: "gen-1",
      source_version: "src-1",
      source_artifact_id: "artifact-1",
      learning_compatibility_key: `lrn1_${runId}${order}${i}`,
    })),
    analytics_capability: over.capability ?? { state: "upgrade_required", reason_code: "premium_required" },
    analytics: over.analytics ?? null,
  };
}

const FIVE = ["standard", "time_trial", "survival", "weak_areas", "review"];
const FOUR = ["standard", "time_trial", "survival", "review"];

function wireRun(runId: string, kinds: string[], over: RunOver = {}) {
  const stages = kinds.map((k, i) => wireStage(runId, i, k, over.stages?.[i] ?? { capability: over.stageCapability }));
  const correct = stages.reduce((a, s) => a + s.basic.correct, 0);
  const answered = stages.reduce((a, s) => a + s.basic.answered, 0);
  return {
    record_type: "daily",
    run_id: runId,
    plan_date: over.planDate ?? "2026-09-20",
    completed_at: over.completedAt ?? "2026-09-20T18:00:00+00:00",
    status: "completed",
    stage_count: over.stageCount ?? kinds.length,
    basic: {
      score: over.score ?? stages.reduce((a, s) => a + s.basic.score, 0),
      correct,
      answered,
      accuracy: answered ? correct / answered : null,
    },
    composition: stages.map((s) => ({ stage_id: s.stage_id, order: s.order, kind: s.kind })),
    analytics_capability: over.capability ?? { state: "upgrade_required", reason_code: "premium_required" },
    analytics: over.analytics ?? null,
    population: null,
    stages,
  };
}

const page = (items: unknown[], next_cursor: string | null = null) => ({ schema_version: 1, as_of: "2026-09-25T00:00:00+00:00", items, next_cursor });

/** A source that serves wire pages by cursor, through the real parser. */
function sourceOf(pages: Record<string, unknown | Error>) {
  const calls: { cursor: string | null; limit: number }[] = [];
  const source: HistorySource = {
    page: vi.fn(async (req) => {
      calls.push(req);
      const wire = pages[req.cursor ?? "first"];
      if (wire instanceof Error) throw wire;
      return readHistoryPage(wire);
    }),
  };
  return { source, calls };
}

// ------------------------------------------------------------ review wire

function quizRound(n: number): ReviewRound {
  return {
    roundNumber: n, kind: "quiz", moduleId: "quiz", category: "Champion Base Stats",
    canonicalQuestionRef: `ranked:c${n}`, revealed: true,
    iconHint: { kind: "champion", key: "Annie", icon: null }, topic: null,
    question: { prompt: `Daily prompt ${n}`, options: ["A", "B", "C", "D"], correctOptionIndex: 0, explanation: null },
    challenges: null, masteryChallenges: null,
    viewerSubmission: { answerIndex: 0, isCorrect: true, correctCount: null, answeredCount: null, challengeCount: null },
  };
}
const reviewOf = (matchId: string, count: number): MatchReviewView => ({
  schemaVersion: "ranked_duel.match_review.v1", serverTime: "2026-09-25T00:00:00+00:00",
  matchId, finalRoundNumber: count, roundCount: count,
  rounds: Array.from({ length: count }, (_, i) => quizRound(i + 1)),
});

// ------------------------------------------------------------ harness

const HISTORY = {
  ok: true, is_pro: false, total_count: 2, limited: false, free_limit: 10, entitlement_status: "ok",
  results: [
    { session_id: 2, date: "2026-09-10 10:00:00", completed_at: "2026-09-10 10:00:00", mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10, accuracy: 80, duration_seconds: 125 },
    { session_id: 1, date: "2026-09-09 09:00:00", completed_at: "2026-09-09 09:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60, duration_seconds: 45 },
  ],
} as unknown as QuizHistoryResponse;
const RANKED: MatchHistoryEntryView[] = [{
  matchId: "ordinary-1", viewerOutcome: "win", terminalReason: "combat", completionReason: "segments_complete",
  finalRoundNumber: 5, completedAt: "2026-09-11 11:00:00", isBotMatch: false, viewerClass: "mage",
  opponentClass: "marksman", viewerRole: "mid", opponentRole: null, opponentDisplayName: "Nocturnaut",
  opponentIsBot: false, ratingDelta: 12, ratingAfter: 1300,
}];
const INERT_ANALYTICS = {
  capability: () => new Promise(() => {}),
  trends: () => new Promise(() => {}),
} as unknown as TrendsSource;

function renderHub(
  source: HistorySource | undefined,
  over: Partial<React.ComponentProps<typeof LeaguecraftHub>> = {},
  entry = "/quiz",
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LeaguecraftHub
        progress={{ rank_name: "Bronze" }}
        ranked={{ placementMatchesRemaining: 0, isPlaced: true, estimatedGain: 20, estimatedLoss: 15 }}
        onPlayRanked={() => true}
        onCommitRole={() => true}
        onEnterMatch={() => {}}
        onPlayDailyChallenge={() => {}}
        playModes={{ ranked: true, daily: true, invite: true }}
        sets={[]}
        setsLoading={false}
        onSelectSet={() => {}}
        onRefreshSets={() => {}}
        history={HISTORY}
        historyLoading={false}
        historyError={null}
        rankedProgression={null}
        analyticsSource={INERT_ANALYTICS}
        dailyHistorySource={source}
        {...over}
      />
    </MemoryRouter>,
  );
}

let coarse = false;
beforeEach(() => {
  coarse = false;
  getMatchReview.mockReset();
  getMatchReview.mockImplementation(() => new Promise(() => {}));
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(pointer: coarse)" ? coarse : false,
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const runs = () => screen.getAllByTestId("daily-run-row");
const stagesOf = (run: HTMLElement) => within(run).getAllByTestId("daily-stage-row");

/** HUB6.2 — select a stage by its own row (expanding the Daily if needed) and
 *  return the run: the selected row's quick facts and the analytics region
 *  are both inside it. Selecting the already-selected stage would return to
 *  the Daily, so an already-lit row is left as it is. */
function openStage(run: HTMLElement, kind: string): HTMLElement {
  const row = stagesOf(run).find((s) => s.dataset.stageKind === kind)!;
  if (row.dataset.selected !== "true") fireEvent.click(within(row).getByTestId("stage-analysis-toggle"));
  return run;
}

// ============================================================ DAILY

describe("HUB4 Daily — the persisted hierarchy", () => {
  it("renders a 4-stage run as exactly 4 stages and a 5-stage run as exactly 5", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE), wireRun("r4", FOUR, { completedAt: "2026-09-19T18:00:00+00:00" })]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(2));
    expect(stagesOf(runs()[0]).length).toBe(5);
    expect(stagesOf(runs()[1]).length).toBe(4);
  });

  it("never renders a fake fifth stage, even if stage_count disagrees with the stages sent", async () => {
    const { source } = sourceOf({ first: page([wireRun("r4", FOUR, { stageCount: 5 })]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    const stages = stagesOf(runs()[0]);
    expect(stages.length).toBe(4);
    expect(stages.map((s) => s.dataset.stageKind)).not.toContain("weak_areas");
    expect(runs()[0].textContent).not.toMatch(/Weak Areas/);
  });

  it("keeps the persisted order, from the stage's own order field", async () => {
    const wire = wireRun("r5", FIVE);
    wire.stages.reverse();
    const { source } = sourceOf({ first: page([wire]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    expect(stagesOf(runs()[0]).map((s) => s.dataset.stageKind)).toEqual(FIVE);
    expect(stagesOf(runs()[0]).map((s) => within(s).getByTestId("daily-stage-kind").textContent)).toEqual([
      "1Standard", "2Time Trial", "3Survival", "4Weak Areas", "5Review",
    ]);
  });

  it("shows the Free basic facts — date, score, C/A, accuracy — with no expansion", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE, { planDate: "2026-09-20", score: 42 })]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    const run = runs()[0];
    expect(within(run).getByTestId("daily-run-date").textContent).toBe("Sep 20");
    expect(within(run).getByTestId("daily-run-score").textContent).toBe("42");
    expect(within(run).getByTestId("daily-run-basic").textContent).toContain("10/15");
    expect(within(run).getByTestId("daily-run-accuracy").textContent).toBe("67%");
    expect(within(run).queryByTestId("daily-analysis")).toBeNull();
  });

  it("puts question icons on every stage before anything is expanded", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE)]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    for (const stage of stagesOf(runs()[0])) {
      expect(within(stage).getAllByTestId("timeline-icon").length).toBeGreaterThan(0);
    }
    expect(screen.queryByTestId("daily-analysis")).toBeNull();
    expect(screen.queryByTestId("stage-analysis")).toBeNull();
  });

  it("does not repeat a Daily child match as an ordinary Ranked row", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE)]) });
    renderHub(source, { matchHistory: RANKED });
    await waitFor(() => expect(runs().length).toBe(1));
    const ranked = screen.getAllByTestId("ranked-match-row");
    expect(ranked.length).toBe(1);
    const dailyMatchIds = within(screen.getByTestId("daily-history"))
      .getAllByTestId("question-timeline")
      .map((t) => t.dataset.matchId);
    expect(dailyMatchIds).toEqual(["m-r5-0", "m-r5-1", "m-r5-2", "m-r5-3", "m-r5-4"]);
    for (const row of ranked) {
      expect(dailyMatchIds).not.toContain(within(row).getByTestId("question-timeline").dataset.matchId);
    }
  });
});

// ============================================================ STAGE

describe("HUB4 Stage — one component, ruleset-aware facts", () => {
  const load = async (over = {}) => {
    const wire = wireRun("r5", FIVE, {
      stages: [
        { score: 44, correct: 4, answered: 5 },
        { correct: 6, answered: 8, ended_by: "time_bank_exhausted", capability: { state: "available", reason_code: null }, analytics: stageAnalytics("time_trial") },
        { correct: 7, answered: 9, ended_by: "strikes_exhausted", capability: { state: "available", reason_code: null }, analytics: stageAnalytics("survival", { strikes_used: 2 }) },
        { correct: 2, answered: 3, capability: { state: "available", reason_code: null }, analytics: stageAnalytics("weak_areas", { selected_themes: ["cooldown_comparison"] }) },
        { correct: 1, answered: 2 },
      ],
      capability: { state: "insufficient_evidence", reason_code: "insufficient_compatible_history" },
      ...over,
    });
    const { source } = sourceOf({ first: page([wire]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    return stagesOf(runs()[0]);
  };

  it("Standard: score leads, then C/A, and no terminal note", async () => {
    const [standard] = await load();
    const result = within(standard).getByTestId("daily-stage-result");
    expect(within(result).getByTestId("daily-stage-score").textContent).toContain("44");
    expect(result.textContent).toContain("4/5");
    expect(within(standard).queryByTestId("daily-stage-ended")).toBeNull();
  });

  it("Time Trial: settled C/A, the bank's own ending, the server's settled count, no speed claim", async () => {
    const [, tt] = await load();
    const result = within(tt).getByTestId("daily-stage-result");
    expect(result.textContent).toContain("6/8");
    expect(within(tt).getByTestId("daily-stage-ended").textContent).toContain("bank ran out");
    expect(within(tt).queryByTestId("daily-stage-score")).toBeNull();
    const focus = openStage(runs()[0], "time_trial");
    // HUB6.3E: without HUB6.3B analytics the stage lists its exact questions
    // (HUB6.2's lane is gone — one analytics system).
    expect(within(focus).getAllByTestId("stage-question-card")).toHaveLength(8);
    expect(within(focus).queryByTestId("stage-lane")).toBeNull();
    // HUB6.3D: the row's quick facts say "questions played", never "settled".
    const facts = within(runs()[0]).getByTestId("stage-local-facts");
    expect(within(facts).getByTestId("stage-fact-played").textContent).toContain("6 / 8");
    expect(facts.textContent).not.toMatch(/settled/i);
    expect(focus.textContent).not.toMatch(/\bms\b|speed|faster|slower|response time/i);
  });

  it("Survival: its own ending, depth, and strikes used against the frozen limit — never pinned to an occurrence", async () => {
    const [, , survival] = await load();
    expect(within(survival).getByTestId("daily-stage-ended").textContent).toContain("out of mistakes");
    const focus = openStage(runs()[0], "survival");
    expect(within(focus).queryByTestId("stage-survival-path")).toBeNull();
    expect(within(focus).getAllByTestId("stage-question-card").length).toBeGreaterThan(0);
    expect(within(focus).getByTestId("stage-analysis-strikes").textContent).toContain("2 of 3");
    expect(within(focus).getByTestId("stage-analysis-depth").textContent).toContain("9");
    // The DTO does not say which occurrence produced a strike: nothing claims it.
    expect(focus.textContent).not.toMatch(/strike \d|struck/i);
  });

  it("Weak Areas: C/A and its exact questions — no broad themes, no conversion", async () => {
    const [, , , weak] = await load();
    expect(within(weak).getByTestId("daily-stage-result").textContent).toContain("2/3");
    const focus = openStage(runs()[0], "weak_areas");
    expect(within(focus).getAllByTestId("stage-question-card").length).toBe(3);
    expect(focus.textContent).not.toContain("Cooldown comparison");
    expect(focus.textContent).not.toContain("cooldown_comparison");
    expect(focus.textContent).not.toMatch(/conver|weakness/i);
  });

  it("Review: correct over attempted, nothing more", async () => {
    const [, , , , review] = await load();
    expect(within(review).getByTestId("daily-stage-result").textContent).toBe("1/2");
    expect(within(review).queryByTestId("daily-stage-ended")).toBeNull();
  });
});

function stageAnalytics(kind: string, over: Json = {}): Json {
  return {
    kind,
    historical_samples: 3,
    category_performance: [],
    family_performance: [],
    concept_performance: [],
    comparison_sufficiency: { status: "sufficient", observed: 3, required: 1, reason_code: null },
    ...(kind === "survival" ? { depth: 9, strikes_used: 2, terminal: "strikes_exhausted" } : {}),
    ...(kind === "time_trial" ? { settled_questions: 8, terminal: "time_bank_exhausted" } : {}),
    ...(kind === "weak_areas" ? { selected_themes: [] } : {}),
    ...over,
  };
}

// ============================================================ QUESTION

describe("HUB4 Question — HUB3's QuestionTimeline, fed by review_identity", () => {
  it("loads each stage's child-match review through review_identity, and fills its icons", async () => {
    getMatchReview.mockImplementation(async (matchId: string) => reviewOf(matchId, 3));
    const { source } = sourceOf({ first: page([wireRun("r4", FOUR)]) });
    renderHub(source, { signedIn: true, hasAccount: true });
    await waitFor(() => expect(runs().length).toBe(1));
    await waitFor(() => expect(getMatchReview).toHaveBeenCalledTimes(4));
    expect(getMatchReview.mock.calls.map((c) => c[0])).toEqual(["m-r4-0", "m-r4-1", "m-r4-2", "m-r4-3"]);
    await waitFor(() =>
      expect(
        within(runs()[0]).getAllByTestId("timeline-icon").every((i) => i.dataset.loaded === "true"),
      ).toBe(true),
    );
  });

  it("uses frozen reviews and reads nothing when a host supplies them", async () => {
    const frozen = { "m-r4-0": reviewOf("m-r4-0", 3) };
    const { source } = sourceOf({ first: page([wireRun("r4", FOUR)]) });
    renderHub(source, { rankedReviewPreview: frozen });
    await waitFor(() => expect(runs().length).toBe(1));
    expect(getMatchReview).not.toHaveBeenCalled();
    const first = stagesOf(runs()[0])[0];
    expect(within(first).getAllByTestId("timeline-icon").every((i) => i.dataset.loaded === "true")).toBe(true);
  });

  it("desktop (fine pointer): the icon is the Popover trigger, and no sheet exists", async () => {
    const frozen = { "m-r4-0": reviewOf("m-r4-0", 3) };
    const { source } = sourceOf({ first: page([wireRun("r4", FOUR)]) });
    renderHub(source, { rankedReviewPreview: frozen });
    await waitFor(() => expect(runs().length).toBe(1));
    const icon = within(stagesOf(runs()[0])[0]).getAllByTestId("timeline-icon")[0];
    // Radix PopoverTrigger owns aria-expanded; the touch branch never sets it.
    expect(icon.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("question-review-sheet")).toBeNull();
  });

  it("touch (coarse pointer): the SAME card opens in HUB3's bottom sheet, with 44px targets", async () => {
    coarse = true;
    const frozen = { "m-r4-0": reviewOf("m-r4-0", 3) };
    const { source } = sourceOf({ first: page([wireRun("r4", FOUR)]) });
    renderHub(source, { rankedReviewPreview: frozen });
    await waitFor(() => expect(runs().length).toBe(1));
    const icon = within(stagesOf(runs()[0])[0]).getAllByTestId("timeline-icon")[0];
    // HUB6.3D: History's track sizes by rem so 200% text grows it; 44px+.
    expect(parseFloat(icon.style.width) * 16).toBeGreaterThanOrEqual(44);
    expect(parseFloat(icon.style.height) * 16).toBeGreaterThanOrEqual(44);
    expect(icon.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(icon);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Daily prompt 1");
  });
});

// ============================================================ HUB4.1 OCCURRENCES

describe("HUB4.1 — timeline positions are HUB2.1 round occurrences, not question results", () => {
  const positions = (stage: HTMLElement) => within(stage).getAllByTestId("timeline-icon");
  const totalOf = (stage: HTMLElement) =>
    Number(within(stage).getByTestId("question-timeline").dataset.total);

  it("Standard: five question results in three rounds hold three positions before the review loads", async () => {
    const run = wireRun("s", ["standard"], {
      stages: [{ occurrences: [[1, 0], [1, 1], [2, 0], [3, 0], [3, 1]], correct: 3 }],
    });
    const { source } = sourceOf({ first: page([run]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    const stage = stagesOf(runs()[0])[0];
    expect(totalOf(stage)).toBe(3);
    expect(positions(stage).length).toBe(3);
    expect(positions(stage).every((i) => i.dataset.loaded === "false")).toBe(true);
    // The Free C/A stays question-grain.
    expect(within(stage).getByTestId("daily-stage-result").textContent).toContain("3/5");
  });

  it("Survival: several questions in one round are one position", async () => {
    const run = wireRun("v", ["survival"], {
      stages: [{ occurrences: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2]], correct: 7 }],
    });
    const { source } = sourceOf({ first: page([run]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    expect(totalOf(stagesOf(runs()[0])[0])).toBe(6);
  });

  it("repeated refs in different occurrences are not collapsed into fewer positions", async () => {
    const run = wireRun("r", ["standard"], {
      stages: [{
        occurrences: [[2, 0], [1, 0], [3, 0]],
        refs: ["quiz:same", "quiz:same", "quiz:same"],
        correct: 2,
      }],
    });
    const { source } = sourceOf({ first: page([run]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    expect(totalOf(stagesOf(runs()[0])[0])).toBe(3);
  });

  it("the loaded review replaces the placeholders on the SAME canonical timeline", async () => {
    getMatchReview.mockImplementation(async (matchId: string) => reviewOf(matchId, 3));
    const run = wireRun("s", ["standard"], {
      stages: [{ occurrences: [[1, 0], [1, 1], [2, 0], [3, 0], [3, 1]], correct: 3 }],
    });
    const { source } = sourceOf({ first: page([run]) });
    renderHub(source, { signedIn: true, hasAccount: true });
    await waitFor(() => expect(runs().length).toBe(1));
    const stage = () => stagesOf(runs()[0])[0];
    await waitFor(() => expect(positions(stage()).every((i) => i.dataset.loaded === "true")).toBe(true));
    expect(getMatchReview.mock.calls[0][0]).toBe("m-s-0");
    expect(totalOf(stage())).toBe(3);
    expect(within(stage()).getByTestId("question-timeline").dataset.matchId).toBe("m-s-0");
  });

  it("a stage without round ordinals holds no invented positions", async () => {
    const run = wireRun("x", ["standard"]);
    for (const q of run.stages[0].questions as Json[]) {
      delete q.round_number;
      delete q.challenge_index;
    }
    const { source } = sourceOf({ first: page([run]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    expect(within(stagesOf(runs()[0])[0]).queryByTestId("question-timeline")).toBeNull();
  });
});

// ============================================================ CAPABILITY

describe("HUB4 capability — five states, five treatments", () => {
  const openRun = async (record: unknown) => {
    const { source } = sourceOf({ first: page([record]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    return runs()[0];
  };

  it("available: the run analysis opens onto the server's analytics", async () => {
    const record = clone(golden.premium_page_1.items[0]);
    const run = await openRun(record);
    const toggle = within(run).getByTestId("daily-analysis-toggle");
    expect(toggle.dataset.state).toBe("available");
    fireEvent.click(toggle);
    const analysis = within(run).getByTestId("daily-analysis");
    expect(analysis.dataset.state).toBe("available");
    expect(within(analysis).getByTestId("daily-analysis-average")).toBeTruthy();
    expect(within(analysis).queryByRole("link", { name: /Premium/ })).toBeNull();
  });

  it("upgrade_required: basic record stays, the one invitation is on the run, not on every stage", async () => {
    const run = await openRun(clone(golden.free_page_1.items[0]));
    expect(within(run).getByTestId("daily-run-score")).toBeTruthy();
    expect(within(run).getAllByTestId("timeline-icon").length).toBeGreaterThan(0);
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    const invite = within(run).getByTestId("daily-analysis-upgrade");
    expect(within(invite).getByRole("link", { name: /Upgrade to Mogzy Premium/ }).getAttribute("href")).toBe("/lol/premium");
    // HUB6.1: every stage is still navigable; a stage that inherits the run's
    // upsell repeats no invitation and keeps its exact questions.
    for (const nav of within(run).getAllByTestId("stage-analysis-toggle")) {
      fireEvent.click(nav);
      const focus = within(run).getByTestId("stage-analytics");
      expect(within(focus).queryByTestId("stage-analysis-upgrade")).toBeNull();
      expect(within(focus).queryByRole("link", { name: /Premium/ })).toBeNull();
      expect(within(run).getByTestId("stage-analytics")).toBeTruthy();
    }
  });

  it("insufficient_evidence: factual counts, and never a paywall", async () => {
    const run = await openRun(clone(golden.premium_newcomer.items[0]));
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    const analysis = within(run).getByTestId("daily-analysis");
    expect(analysis.dataset.state).toBe("insufficient_evidence");
    expect(analysis.textContent).toContain("0 of 3 matching runs");
    expect(analysis.textContent).not.toMatch(/Premium|Upgrade/);
    // Stages open from the Focus navigator, also without a paywall.
    for (const nav of within(run).getAllByTestId("stage-analysis-toggle")) {
      fireEvent.click(nav);
      expect(within(run).getByTestId("stage-analytics").textContent).not.toMatch(/Premium|Upgrade/);
    }
  });

  it("names each stage's entry for its stage (HUB6.1)", async () => {
    const run = await openRun(clone(golden.premium_newcomer.items[0]));
    const entry = within(stagesOf(run)[0]).getByTestId("stage-analysis-toggle");
    expect(entry).toHaveAccessibleName(/stage analysis$/);
    fireEvent.click(entry);
    const focus = within(run).getByTestId("stage-analytics");
    expect(focus.dataset.stageOrder).toBe("0");
  });

  it("temporarily_unavailable: a restrained retry, never an upsell", async () => {
    const record = clone(golden.unavailable_page_1.items[0]);
    const { source } = sourceOf({ first: page([record]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    const box = screen.getByTestId("daily-analysis-unavailable");
    expect(box.textContent).toContain("unavailable");
    expect(box.textContent).not.toMatch(/Premium|Upgrade|subscribe/i);
    fireEvent.click(screen.getByTestId("daily-analysis-unavailable-retry"));
    await waitFor(() => expect(source.page).toHaveBeenCalledTimes(2));
    // The basic record survives the retry.
    await waitFor(() => expect(runs().length).toBe(1));
  });

  it("not_applicable: no analytics surface at all, and the record stays navigable", async () => {
    const run = await openRun(
      wireRun("r4", FOUR, {
        capability: { state: "not_applicable", reason_code: null },
        stageCapability: { state: "not_applicable", reason_code: "missing_question_or_ruleset_provenance" },
      }),
    );
    // The Free record is whole.
    expect(stagesOf(run).length).toBe(4);
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    expect(within(run).queryByTestId("daily-analysis")).toBeNull();
    for (const nav of within(run).getAllByTestId("stage-analysis-toggle")) {
      fireEvent.click(nav);
      expect(within(run).queryByTestId("stage-analysis")).toBeNull();
      expect(within(run).getByTestId("stage-analytics")).toBeTruthy();
    }
  });
});

// ============================================================ ANALYTICS

describe("HUB4 analytics — the server's numbers, and only them", () => {
  // Wire JSON is patched in place, exactly as it would arrive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withAnalytics = async (patch: (a: any) => void) => {
    const record = clone(golden.premium_page_1.items[0]);
    patch(record.analytics as unknown);
    const { source } = sourceOf({ first: page([record]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    return screen.getByTestId("daily-analysis");
  };

  it("prints the server's metric, not one derived from the basic record", async () => {
    // A value no arithmetic over this run's basic facts could produce.
    const analysis = await withAnalytics((a) => {
      a.historical_average.value = 0.123;
      a.previous_run_delta_pp.value = -33.333333333333336;
    });
    expect(within(analysis).getByTestId("daily-analysis-average").textContent).toContain("12%");
    expect(within(analysis).getByTestId("daily-analysis-average").textContent).toContain("4 earlier runs");
    expect(within(analysis).getByTestId("daily-analysis-delta").textContent).toContain("−33 points");
    // HUB6.3E: the raw Daily score is never shown as a personal best.
    expect(within(analysis).queryByTestId("daily-analysis-best")).toBeNull();
    // HUB6.1: Review recovery is not a Daily headline figure.
    expect(within(analysis).queryByTestId("daily-analysis-recovery")).toBeNull();
    const line = within(analysis).getByTestId("history-trajectory");
    // HUB6.3E: no Up / Down / Stable verdict on the line.
    expect(line.dataset.direction).toBeUndefined();
    expect(within(line).getByRole("img").getAttribute("aria-label")).toContain("33%, 67%, 67%, 100%, 67%");
  });

  it("keeps a null metric's place, dormant, with the server's counts (HUB6)", async () => {
    const analysis = await withAnalytics((a) => {
      a.trajectory = { value: null, sufficiency: { status: "insufficient", observed: 2, required: 5, reason_code: "insufficient_compatible_history" } };
      a.historical_average = { value: null, sufficiency: { status: "insufficient", observed: 2, required: 3, reason_code: "insufficient_compatible_history" } };
    });
    // No value is drawn or printed for either…
    expect(within(analysis).queryByTestId("history-trajectory")).toBeNull();
    expect(within(analysis).queryByTestId("daily-analysis-average")).toBeNull();
    // …but each keeps its place, with the server's count.
    const trend = within(analysis).getByTestId("history-pending-trend");
    expect(trend).toHaveTextContent("Trend");
    expect(trend).toHaveTextContent("2 of 5 matching runs");
    const slots = within(trend).getAllByTestId("history-trajectory-slot");
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.dataset.filled === "true")).toHaveLength(2);
    const average = within(analysis).getByTestId("history-pending-average");
    expect(average).toHaveTextContent("Average accuracy");
    expect(average).toHaveTextContent("2 of 3 matching runs");
    expect(average).toHaveTextContent("—");
    // The dormant chart plots only what is known: this run, on its 0–100%
    // axis. No line, and no value for the runs it is still waiting on.
    expect(within(trend).getAllByTestId("history-trajectory-current")).toHaveLength(1);
    expect(trend.querySelector("polyline")).toBeNull();
    expect(average.textContent).not.toMatch(/\b0%|zero|bad|weak|declin/i);
    expect(trend.textContent).not.toMatch(/zero|bad|weak|declin/i);
    // The sufficient figures beside them are unchanged.
    expect(within(analysis).getByTestId("daily-analysis-delta")).toBeTruthy();
  });

  it("HUB6.1 — the Daily Overview shows no category bars, learning signals or Review recovery", async () => {
    const analysis = await withAnalytics((a) => {
      a.category_performance = [
        { category: "Champion Base Stats", correct: 4, answered: 5, accuracy: 0.8, sufficiency: { status: "sufficient", observed: 5, required: 3, reason_code: null } },
      ];
      a.learning_signals = [
        { type: "recurring_weakness", question_result_id: null, previous: null, sufficiency: { status: "sufficient", observed: 3, required: 3, reason_code: null } },
        { type: "recovered_weakness", question_result_id: null, previous: null, sufficiency: { status: "sufficient", observed: 3, required: 3, reason_code: null } },
      ];
    });
    expect(within(analysis).queryByTestId("history-categories")).toBeNull();
    expect(within(analysis).queryByTestId("history-bar")).toBeNull();
    expect(within(analysis).queryByTestId("history-signals")).toBeNull();
    expect(within(analysis).queryByTestId("daily-analysis-recovery")).toBeNull();
    const text = screen.getByTestId("daily-history").textContent!;
    expect(text).not.toMatch(/Champion Base Stats|Learning signals|Recurring weakness|Recovered|Review recovery/);
  });

  it("prints no opaque id, key, ref or version anywhere in the record", async () => {
    const record = clone(golden.premium_page_1.items[0]);
    const { source } = sourceOf({ first: page([record]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    let text = screen.getByTestId("daily-history").textContent!;
    for (const nav of within(runs()[0]).getAllByTestId("stage-analysis-toggle")) {
      fireEvent.click(nav);
      text += screen.getByTestId("daily-history").textContent!;
    }
    for (const opaque of ["stg1_", "lrn1_", "run1_", "run-00", "qr-", "quiz:", "match-6", "gen-1", "source-1", "artifact", "history-daily-v1"]) {
      expect(text).not.toContain(opaque);
    }
  });

  it("renders no population UI while population is null", async () => {
    const record = clone(golden.premium_page_1.items[0]);
    expect(record.population).toBeNull();
    const { source } = sourceOf({ first: page([record]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    expect(screen.getByTestId("daily-history").textContent).not.toMatch(/percentile|median|population|cohort|other players/i);
  });
});

// ============================================================ OTHER HISTORY

describe("HUB4 — ordinary Ranked and Practice stay in History", () => {
  it("keeps the Ranked rows and the Practice ledger beneath the Daily runs", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE)]) });
    renderHub(source, { matchHistory: RANKED });
    await waitFor(() => expect(runs().length).toBe(1));
    expect(screen.getAllByTestId("ranked-match-row").length).toBe(1);
    expect(screen.getAllByTestId("study-history-row").length).toBe(2);
    expect(screen.getByTestId("history-stream-filter")).toBeTruthy();
    // Daily leads the record.
    const daily = screen.getByTestId("daily-history");
    const ledger = screen.getByTestId("study-history");
    expect(daily.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an empty Daily record adds nothing — the ledger's own empty state still owns it", async () => {
    const { source } = sourceOf({ first: page([]) });
    renderHub(source, { history: { ...HISTORY, results: [], total_count: 0 } });
    await waitFor(() => expect(screen.getByTestId("study-history-empty")).toBeTruthy());
    expect(screen.queryByTestId("daily-history")).toBeNull();
    expect(screen.queryByTestId("daily-history-error")).toBeNull();
  });

  it("a failed Daily read is stated with a retry and leaves the rest of History intact", async () => {
    const { source } = sourceOf({ first: new Error("Quiz API 503: down") });
    renderHub(source);
    await waitFor(() => expect(screen.getByTestId("daily-history-error")).toBeTruthy());
    expect(screen.getAllByTestId("study-history-row").length).toBe(2);
  });

  it("a signed-out reader gets no Daily error — History's sign-in state is the ledger's", async () => {
    const err = new Error('Quiz API 403: {"code":"ACCOUNT_REQUIRED"}');
    const { source } = sourceOf({ first: err });
    renderHub(source);
    await waitFor(() => expect(source.page).toHaveBeenCalled());
    expect(screen.queryByTestId("daily-history-error")).toBeNull();
  });

  it("does not read History for a guest when no host source is supplied", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderHub(undefined, { signedIn: false });
    expect(screen.queryByTestId("daily-history-loading")).toBeNull();
    expect(spy.mock.calls.some((c) => String(c[0]).includes("/api/history/v1"))).toBe(false);
  });

  it("/lol/history stays the Practice ledger it was: no Daily loader is mounted there", () => {
    const page = readFileSync(resolve(__dirname, "../../../pages/LolHistory.tsx"), "utf8");
    expect(page).toContain("StudyHistoryLedger");
    expect(page).not.toMatch(/useDailyHistory|DailyHistorySection|historyApi/);
  });
});

// ============================================================ LAYOUT

describe("HUB4 layout — HUB3's self-sizing row pattern", () => {
  it("Daily and Stage rows are inline-size containers that wrap narrow and never fix a page width", async () => {
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE)]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    const run = runs()[0];
    expect(run.className).toContain("[container-type:inline-size]");
    for (const stage of stagesOf(run)) {
      expect(stage.className).toContain("[container-type:inline-size]");
      // The ruled line holds the stage's name (HUB6.2: the row's first child
      // is now its selection wash).
      const line = within(stage).getByTestId("stage-analysis-toggle").parentElement as HTMLElement;
      expect(line.className).toContain("flex-wrap");
      expect(line.className).toContain("[@container(min-width:34rem)]:flex-nowrap");
      const timeline = within(stage).getByTestId("question-timeline");
      expect(timeline.className).toContain("basis-full");
    }
    // HUB3 replaced the fixed `w-[13rem]` track with a `max-w-[13rem]` cap;
    // nothing in a Daily row may reintroduce a fixed width.
    expect(run.innerHTML).not.toMatch(/(^|[\s"])w-\[13rem\]|min-w-\[\d{3,}px\]/);
  });

  it("uses the wider stacking threshold on touch, where targets are 44px", async () => {
    coarse = true;
    const { source } = sourceOf({ first: page([wireRun("r5", FIVE)]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    const line = within(stagesOf(runs()[0])[0]).getByTestId("stage-analysis-toggle").parentElement as HTMLElement;
    expect(line.className).toContain("[@container(min-width:44rem)]:flex-nowrap");
    expect(within(runs()[0]).getAllByTestId("daily-analysis-toggle")[0].className).toContain("min-h-[44px]");
  });
});

// ============================================================ PAGINATION

describe("HUB4 pagination — the server's cursor", () => {
  const P1 = page([wireRun("a", FIVE, { completedAt: "2026-09-22T18:00:00+00:00" }), wireRun("b", FIVE, { completedAt: "2026-09-21T18:00:00+00:00" })], "CUR-1");
  const P2 = page([wireRun("b", FIVE, { completedAt: "2026-09-21T18:00:00+00:00" }), wireRun("c", FOUR, { completedAt: "2026-09-20T18:00:00+00:00" })], null);

  it("asks for one bounded first page", async () => {
    const { source, calls } = sourceOf({ first: P1 });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(2));
    expect(calls).toEqual([{ cursor: null, limit: 10 }]);
  });

  it("loads more with the server's cursor, prints no run twice, and stops at the terminal cursor", async () => {
    const { source, calls } = sourceOf({ first: P1, "CUR-1": P2 });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(2));
    fireEvent.click(screen.getByTestId("daily-history-load-more"));
    await waitFor(() => expect(runs().length).toBe(3));
    expect(calls[1]).toEqual({ cursor: "CUR-1", limit: 10 });
    expect(runs().map((r) => within(r).getByTestId("daily-run-date").textContent)).toEqual(["Sep 20", "Sep 20", "Sep 20"]);
    expect(screen.queryByTestId("daily-history-load-more")).toBeNull();
  });

  it("a failed later page keeps every row already shown, and offers a retry", async () => {
    const { source } = sourceOf({ first: P1, "CUR-1": new Error("Quiz API 503") });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(2));
    await act(async () => {
      fireEvent.click(screen.getByTestId("daily-history-load-more"));
    });
    await waitFor(() => expect(screen.getByTestId("daily-history-more-error")).toBeTruthy());
    expect(runs().length).toBe(2);
    expect(screen.getByTestId("daily-history-load-more").textContent).toBe("Try again");
  });

  it("shows a first-load placeholder, not an empty record, while the first page is on its way", async () => {
    const source: HistorySource = { page: () => new Promise(() => {}) };
    renderHub(source);
    expect(await screen.findByTestId("daily-history-loading")).toBeTruthy();
    expect(screen.queryByTestId("daily-history")).toBeNull();
  });
});

// ============================================================ #trends

describe("HUB4 — the legacy #trends link lands on the newest run's analysis", () => {
  it("opens and focuses it once the first page arrives, then canonicalises", async () => {
    const { source } = sourceOf({ first: page([clone(golden.premium_page_1.items[0]), clone(golden.premium_page_1.items[1])]) });
    renderHub(source, {}, "/quiz#trends");
    await waitFor(() => expect(runs().length).toBe(2));
    await waitFor(() => expect(within(runs()[0]).getByTestId("daily-analysis")).toBeTruthy());
    expect(document.activeElement).toBe(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    expect(within(runs()[1]).queryByTestId("daily-analysis")).toBeNull();
  });
});

// ============================================================ HUB6.1 MULTI-LAYER

describe("HUB6.2 — one Daily entry that grows: History → Daily → Stage → Question", () => {
  const load = async (records: unknown[], over: Partial<React.ComponentProps<typeof LeaguecraftHub>> = {}) => {
    const { source } = sourceOf({ first: page(records) });
    renderHub(source, over);
    await waitFor(() => expect(runs().length).toBe(records.length));
  };
  const expanded = () => runs().filter((r) => r.dataset.focused === "true");
  /** Every stage row of a run, each with its question rail — the backbone. */
  const backbone = (run: HTMLElement) =>
    stagesOf(run).map((s) => ({
      kind: s.dataset.stageKind,
      icons: within(s).getAllByTestId("timeline-icon").length,
    }));

  it("1, 2 — collapsed and expanded, the entry holds every stage and every stage's question icons, in place", async () => {
    await load([wireRun("a", FIVE, { capability: { state: "available", reason_code: null }, analytics: goldenAnalytics() })]);
    const run = runs()[0];
    const collapsed = backbone(run);
    expect(collapsed.map((s) => s.kind)).toEqual(FIVE);
    expect(collapsed.every((s) => s.icons > 0)).toBe(true);
    const rowsBefore = stagesOf(run);
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    // The SAME row elements — nothing was rebuilt elsewhere.
    expect(stagesOf(run)).toEqual(rowsBefore);
    expect(backbone(run)).toEqual(collapsed);
    // …and the new room holds the Daily's analytics.
    expect(within(run).getByTestId("daily-analytics-region").dataset.view).toBe("overview");
    expect(within(run).getByTestId("daily-analysis")).toBeTruthy();
    // No second stage representation (HUB6.1's navigator strip is gone).
    expect(within(run).queryByTestId("daily-focus-nav")).toBeNull();
  });

  it("3, 4, 5 — selecting any stage keeps every other stage and its icons; the chosen row is lit in place with its quick facts", async () => {
    await load([wireRun("a", FIVE, {
      stages: FIVE.map((k) => ({ capability: { state: "available", reason_code: null }, analytics: stageAnalytics(k) })),
    })]);
    const run = runs()[0];
    const collapsed = backbone(run);
    for (const kind of FIVE) {
      openStage(run, kind);
      expect(backbone(run)).toEqual(collapsed);
      const rows = stagesOf(run);
      const lit = rows.filter((r) => r.dataset.selected === "true");
      expect(lit.map((r) => r.dataset.stageKind)).toEqual([kind]);
      expect(within(lit[0]).getByTestId("stage-analysis-toggle")).toHaveAttribute("aria-pressed", "true");
      expect(within(lit[0]).getByTestId("stage-local-facts")).toBeTruthy();
      // Only the selected row carries quick facts.
      expect(within(run).getAllByTestId("stage-local-facts")).toHaveLength(1);
    }
  });

  it("6, 7 — the analytics region switches Daily → stage → Daily in ONE region, without collapsing", async () => {
    await load([wireRun("a", FIVE, { capability: { state: "available", reason_code: null }, analytics: goldenAnalytics() })]);
    const run = runs()[0];
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    const region = within(run).getByTestId("daily-analytics-region");
    for (const kind of FIVE) {
      openStage(run, kind);
      expect(within(run).getAllByTestId("daily-analytics-region")).toEqual([region]);
      expect(region.dataset.view).toBe("stage");
      expect(region.dataset.stageKind).toBe(kind);
      expect(within(run).getAllByTestId("stage-analytics")).toHaveLength(1);
      expect(within(run).queryByTestId("daily-analysis")).toBeNull();
    }
    fireEvent.click(within(run).getByTestId("daily-overview-return"));
    expect(region.dataset.view).toBe("overview");
    expect(within(run).getByTestId("daily-analysis")).toBeTruthy();
    expect(stagesOf(run).every((r) => r.dataset.selected === "false")).toBe(true);
    expect(run.dataset.focused).toBe("true");
    // Selecting the lit stage again also returns to the Daily.
    openStage(run, "survival");
    fireEvent.click(within(stagesOf(run).find((r) => r.dataset.stageKind === "survival")!).getByTestId("stage-analysis-toggle"));
    expect(region.dataset.view).toBe("overview");
    expect(run.dataset.focused).toBe("true");
  });

  it("10 — only one Daily is expanded: opening another collapses the first", async () => {
    await load([wireRun("a", FIVE), wireRun("b", FOUR, { completedAt: "2026-09-19T18:00:00+00:00" })]);
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    expect(expanded()).toEqual([runs()[0]]);
    openStage(runs()[1], "survival");
    expect(expanded()).toEqual([runs()[1]]);
    expect(screen.getAllByTestId("daily-analytics-region")).toHaveLength(1);
    fireEvent.click(within(runs()[1]).getByTestId("daily-analysis-toggle"));
    expect(expanded()).toHaveLength(0);
    expect(screen.queryByTestId("daily-analytics-region")).toBeNull();
    expect(backbone(runs()[1]).map((s) => s.kind)).toEqual(FOUR);
  });

  it("11, 12 — a first Daily stays four stages and a normal Daily five, at every layer", async () => {
    await load([wireRun("a", FIVE), wireRun("b", FOUR, { completedAt: "2026-09-19T18:00:00+00:00" })]);
    for (const [run, kinds] of [[runs()[0], FIVE], [runs()[1], FOUR]] as const) {
      expect(backbone(run).map((s) => s.kind)).toEqual(kinds);
      openStage(run, "review");
      expect(backbone(run).map((s) => s.kind)).toEqual(kinds);
    }
    expect(backbone(runs()[1]).map((s) => s.kind)).not.toContain("weak_areas");
  });

  // Radix's popper is slow in jsdom (HUB3 documented it); three open/close
  // cycles need more than the default budget under a parallel run.
  it("8, 9 — the Popover opens from a collapsed rail, a selected stage's analytics and another stage's rail; closing keeps the view", { timeout: 240_000 }, async () => {
    const frozen = { "m-a-4": reviewOf("m-a-4", 3), "m-a-0": reviewOf("m-a-0", 3) };
    await load([wireRun("a", FIVE)], { rankedReviewPreview: frozen });
    const run = runs()[0];
    const openAndClose = async (trigger: HTMLElement) => {
      fireEvent.click(trigger);
      expect(await screen.findByTestId("question-review-popover")).toBeTruthy();
      fireEvent.keyDown(screen.getByTestId("question-review-popover"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByTestId("question-review-popover")).toBeNull());
    };
    const railIcon = (kind: string) =>
      within(stagesOf(run).find((s) => s.dataset.stageKind === kind)!).getAllByTestId("timeline-icon")[0];
    // Collapsed.
    await openAndClose(railIcon("review"));
    expect(run.dataset.focused).toBe("false");
    // A stage selected: from the analytics region, and from ANOTHER stage's
    // rail — which stays live while Review is selected. (Expanded-overview
    // rails are the same elements; the one-canvas test proves that.)
    openStage(run, "review");
    await openAndClose(within(within(run).getByTestId("stage-analytics")).getAllByTestId("inspector-question")[0]);
    await openAndClose(railIcon("standard"));
    expect(run.dataset.view).toBe("stage");
    expect(within(run).getByTestId("stage-analytics").dataset.stageKind).toBe("review");
  });

  it("8, 9 — on touch the same questions open in HUB3's Sheet, and closing it keeps the view", async () => {
    coarse = true;
    const frozen = { "m-a-3": reviewOf("m-a-3", 3) };
    await load([wireRun("a", FIVE)], { rankedReviewPreview: frozen });
    const run = runs()[0];
    openStage(run, "weak_areas");
    const question = within(within(run).getByTestId("stage-analytics")).getAllByTestId("inspector-question")[0];
    expect(question.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(question);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Daily prompt 1");
    fireEvent.click(screen.getByTestId("question-review-sheet-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(run).getByTestId("stage-analytics").dataset.stageKind).toBe("weak_areas");
    expect(stagesOf(run).find((r) => r.dataset.selected === "true")?.dataset.stageKind).toBe("weak_areas");
  });

  it("16 — no removed analytics reappear: no question-type/category bars, signals or recovery tile, anywhere", async () => {
    const analytics = (kind: string) => ({
      ...stageAnalytics(kind),
      family_performance: [
        { family: "ability_cooldown", correct: 3, answered: 6, run_count: 5, accuracy: 0.5, sufficiency: { status: "sufficient", observed: 6, required: 3, reason_code: null } },
      ],
      category_performance: [
        { category: "Champion Base Stats", correct: 4, answered: 5, accuracy: 0.8, sufficiency: { status: "sufficient", observed: 5, required: 3, reason_code: null } },
      ],
    });
    await load([
      wireRun("a", FIVE, {
        capability: { state: "available", reason_code: null },
        analytics: goldenAnalytics(),
        stages: FIVE.map((k) => ({ capability: { state: "available", reason_code: null }, analytics: analytics(k) })),
      }),
    ]);
    const run = runs()[0];
    fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
    const texts = [run.textContent!];
    for (const kind of FIVE) {
      openStage(run, kind);
      texts.push(run.textContent!);
      expect(within(run).queryByTestId("history-bar")).toBeNull();
    }
    for (const t of texts) {
      expect(t).not.toMatch(/Question types|Ability cooldown|Champion Base Stats|Learning signals|Recurring weakness|Recovered|Review recovery|Compared with/);
    }
  });

  it("Standard's questions follow HUB2.1 rounds: one card per round, module questions kept together, no points", async () => {
    await load([
      wireRun("a", ["standard"], {
        stages: [{ occurrences: [[1, 0], [2, 0], [2, 1], [3, 0]], correct: 3, capability: { state: "available", reason_code: null }, analytics: stageAnalytics("standard") }],
      }),
    ]);
    openStage(runs()[0], "standard");
    // A HUB2.3-shaped stage (no HUB6.3B analytics): its exact questions, one
    // card per round; the module's two questions stay one card.
    const cards = within(runs()[0]).getAllByTestId("stage-question-card");
    expect(cards).toHaveLength(3);
    expect(cards[1].dataset.outcome).toBe("correct");
    expect(cards[2].dataset.outcome).toBe("incorrect");
    expect(within(runs()[0]).getByTestId("stage-analytics").textContent).not.toMatch(/\bpts\b|points/i);
  });
});

/** A sufficient Daily analytics block, as HUB2 sends it. */
function goldenAnalytics(): Json {
  return clone(golden.premium_page_1.items[0].analytics as Json);
}

describe("HUB6.1 — reduced motion", () => {
  // An animating environment whose element is never seen: without reduced
  // motion the reveal waits at 0; with it, the final state is drawn at once.
  const stubMotion = () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("reduce-motion");
  });
  const openFocus = async () => {
    const { source } = sourceOf({ first: page([clone(golden.premium_page_1.items[0])]) });
    renderHub(source);
    await waitFor(() => expect(runs().length).toBe(1));
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    return within(runs()[0]).getByTestId("daily-analysis");
  };
  const currentScale = (analysis: HTMLElement) =>
    (within(analysis).getByTestId("history-trajectory-current") as HTMLElement).style.transform;

  it("withholds the reveal until seen when motion is allowed", async () => {
    stubMotion();
    const analysis = await openFocus();
    expect(currentScale(analysis)).toContain("scale(0)");
  });

  it("renders every final state immediately under the app's Reduce Motion", async () => {
    stubMotion();
    document.documentElement.classList.add("reduce-motion");
    const analysis = await openFocus();
    expect(currentScale(analysis)).toContain("scale(1)");
    expect(within(analysis).getByTestId("daily-analysis-delta").textContent).toMatch(/\d+ points?/);
  });

  it("HUB6.2 — with motion, the region mounts closed and grows open on the next frame", async () => {
    stubMotion();
    await openFocus();
    const region = () => within(runs()[0]).getByTestId("daily-analytics-region").closest("[data-open]") as HTMLElement;
    // The first frame is the closed state the transition grows from…
    expect(region().dataset.open).toBe("false");
    // …and the next frame opens it.
    await waitFor(() => expect(region().dataset.open).toBe("true"));
  });

  it("HUB6.2 — under Reduce Motion the region is open at once, and collapsing removes it at once", async () => {
    stubMotion();
    document.documentElement.classList.add("reduce-motion");
    await openFocus();
    const region = within(runs()[0]).getByTestId("daily-analytics-region").closest("[data-open]") as HTMLElement;
    expect(region.dataset.open).toBe("true");
    fireEvent.click(within(runs()[0]).getByTestId("daily-analysis-toggle"));
    expect(within(runs()[0]).queryByTestId("daily-analytics-region")).toBeNull();
  });
});
