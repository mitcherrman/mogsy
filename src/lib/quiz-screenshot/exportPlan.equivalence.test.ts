/**
 * CC2 — the browser export plan and the canonical Playwright jobs agree.
 *
 * The generator captures `planCaptureJobs(...)` group → slide → format. These
 * tests build the SAME request both ways — as `runGeneration` would, and as an
 * Admin export would — and assert that every card the browser plans is the
 * capture the generator makes: count, order, slide kind, state, question (and
 * therefore correct answer), difficulty badge, harness parameters, zoom
 * sharing, file path. `captureJobs.test.ts` separately pins `planCaptureJobs`
 * to the pre-CC2 generator code, so the chain is closed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adaptScreenshotQuestions } from "./adapt";
import { planCaptureJobs } from "./captureJobs";
import type { DifficultyTier } from "./difficulty";
import { buildDailyPackagePlan, buildExportPlan, type ExportPlan } from "./exportPlan";
import { harnessUrl } from "./runBrowserExport";
import type { RenderQuestion, RenderState } from "./types";
import type { MidCtaVariantId, RepeatVariantId } from "./challenge";

const FIXTURE = join(process.cwd(), "scripts", "quiz-screenshots", "visual-qa-fixture.json");
const { adapted: FIXTURE_QUESTIONS } = adaptScreenshotQuestions(
  (JSON.parse(readFileSync(FIXTURE, "utf8")) as { questions: never[] }).questions,
);

/** Numeric stored rows (zero-padded dirs) with a spread of difficulty metadata. */
function storedQuestions(n: number): RenderQuestion[] {
  const tiers = ["gold", undefined, "diamond", "iron"];
  return Array.from({ length: n }, (_, i) => ({
    id: 500 + i,
    question_text: `Stored question ${i + 1}?`,
    choices: [{ label: "A one" }, { label: "B two" }, { label: "C three" }, { label: "D four" }],
    correct_index: i % 4,
    explanation: i % 2 ? "Because." : undefined,
    metadata: tiers[i % 4] ? { content_difficulty: tiers[i % 4] } : {},
  })) as unknown as RenderQuestion[];
}

const ALL = [...FIXTURE_QUESTIONS, ...storedQuestions(12)];
const FORMATS = ["mobile-social", "square", "vertical", "landscape"];

type Mode = "classic" | "single-question" | "answer-reveal" | "multi-question";
type Scenario = {
  name: string;
  mode: Mode;
  ids: string[];
  states?: RenderState[];
  formats?: string[];
  difficulty?: DifficultyTier;
  overrides?: Record<string, DifficultyTier>;
  challenge?: { repeatVariant?: RepeatVariantId | null; midCtaVariant?: MidCtaVariantId | null };
};

/** The question objects exactly as the generator would hold them (numeric ids stay numeric). */
function generatorQuestions(ids: string[]): RenderQuestion[] {
  return ids.map((id) => ALL.find((q) => String(q.id) === id)!);
}

function canonicalCaptures(s: Scenario) {
  const formats = s.formats ?? FORMATS;
  const plan = planCaptureJobs(
    {
      states: s.states ?? ["question", "correct"],
      post: s.mode === "single-question" || s.mode === "answer-reveal" ? s.mode : null,
      multiQuestion: s.mode === "multi-question" ? s.challenge ?? {} : null,
      difficulty: s.difficulty ?? null,
      difficultyOverrides: s.overrides,
    },
    generatorQuestions(s.ids),
  );
  const out = [];
  for (const group of plan.groups) {
    for (const job of group.jobs) {
      for (const format of formats) {
        out.push({
          questionId: String(job.question.id),
          correctLabel: job.question.choices[job.question.correct_index]?.label,
          format,
          slide: job.slide,
          state: job.state,
          slug: job.slug,
          index: job.index,
          difficulty: job.difficulty,
          extraParams: job.extraParams ?? {},
          sharesZoom: job.sharesZoom,
          path: `${group.dirSlug}/${job.fileFor(format)}`,
        });
      }
    }
  }
  return { captures: out, requestedSlugs: plan.requestedSlugs };
}

function browserPlan(s: Scenario): ExportPlan {
  return buildExportPlan({
    selection: s.ids.map((id) => ({ id, label: `#${id}` })),
    formats: s.formats ?? FORMATS,
    states: s.states ?? ["question", "correct"],
    post: null,
    mode: s.mode,
    runId: "eq",
    questions: ALL,
    difficulty: s.difficulty ?? null,
    difficultyOverrides: s.overrides,
    challenge: s.challenge,
  });
}

function browserCaptures(plan: ExportPlan) {
  const byId = new Map(ALL.map((q) => [String(q.id), q]));
  return plan.cards.map((c) => {
    const q = byId.get(c.questionId)!;
    return {
      questionId: c.questionId,
      correctLabel: q.choices[q.correct_index]?.label,
      format: c.formatKey,
      slide: c.slide,
      state: c.state,
      slug: c.slug,
      index: c.index,
      difficulty: c.difficulty,
      extraParams: c.extraParams ?? {},
      sharesZoom: c.sharesZoom,
      path: `${c.dirSlug}/${c.fileName}`,
    };
  });
}

const FIX = FIXTURE_QUESTIONS.map((q) => String(q.id));
const STORED = storedQuestions(12).map((q) => String(q.id));

const SCENARIOS: Scenario[] = [
  { name: "classic, fixture rows, two states × four formats", mode: "classic", ids: FIX.slice(0, 4) },
  { name: "classic, every state incl. explanation", mode: "classic", ids: [STORED[1], STORED[3]], states: ["question", "selected", "correct", "incorrect", "explanation"] },
  { name: "classic with a run difficulty", mode: "classic", ids: STORED.slice(0, 3), difficulty: "diamond" },
  { name: "classic with per-question overrides", mode: "classic", ids: STORED.slice(0, 4), overrides: { [STORED[1]]: "iron" } },
  { name: "single-question post", mode: "single-question", ids: [STORED[0], FIX[2]] },
  { name: "answer-reveal post", mode: "answer-reveal", ids: [STORED[2], FIX[0]] },
  { name: "challenge of 2", mode: "multi-question", ids: STORED.slice(0, 2) },
  { name: "challenge of 5, repeat + mid copy", mode: "multi-question", ids: [...STORED.slice(0, 3), FIX[0], FIX[1]], challenge: { repeatVariant: 2, midCtaVariant: 3 } },
  { name: "challenge of 7 paginates answers", mode: "multi-question", ids: STORED.slice(0, 7), challenge: { midCtaVariant: 1 } },
  { name: "challenge of 10 with difficulty", mode: "multi-question", ids: STORED.slice(0, 10), difficulty: "gold", overrides: { [STORED[4]]: "diamond" } },
];

describe("browser export plan ≡ canonical Playwright captures", () => {
  for (const s of SCENARIOS) {
    it(s.name, () => {
      const plan = browserPlan(s);
      expect(plan.errors).toEqual([]);
      const canonical = canonicalCaptures(s);
      // Count, order, kind, state, question/answer, difficulty, params, zoom, path.
      expect(browserCaptures(plan)).toEqual(canonical.captures);
      expect(plan.requestedSlugs).toEqual(canonical.requestedSlugs);
      expect(plan.mode).toBe(s.mode);
      expect(plan.questionIds).toEqual(s.ids);
    });
  }

  it("the challenge carousel has the generator's mode-specific shape", () => {
    const plan = browserPlan(SCENARIOS[8]); // 7 questions
    const one = plan.cards.filter((c) => c.formatKey === "mobile-social");
    expect(one.map((c) => c.slug)).toEqual([
      "opening", "q01", "q02", "q03", "q04", "q05", "q06", "q07", "answers-1", "answers-2", "ending",
    ]);
    expect(one.map((c) => c.slide)).toEqual([
      "opening", "quiz", "quiz", "quiz", "quiz", "quiz", "quiz", "quiz", "summary", "summary", "ending",
    ]);
    // Progress on every question slide; the mid CTA only on the midpoint (Q4 of 7).
    expect(one.filter((c) => c.slide === "quiz").map((c) => c.extraParams?.progress)).toEqual(
      ["1of7", "2of7", "3of7", "4of7", "5of7", "6of7", "7of7"],
    );
    expect(one.filter((c) => c.extraParams?.mid).map((c) => c.slug)).toEqual(["q04"]);
    // Summary pages carry the generator's paging params and question order.
    const answers = one.filter((c) => c.slide === "summary");
    expect(answers.map((c) => c.extraParams)).toEqual([
      { qids: STORED.slice(0, 6).join(","), sumStart: "0", sumPage: "1", sumPages: "2" },
      { qids: STORED[6], sumStart: "6", sumPage: "2", sumPages: "2" },
    ]);
    // One shared directory, and no slide shares a fitted zoom.
    expect(new Set(plan.cards.map((c) => c.dirSlug))).toEqual(new Set(["question_challenge"]));
    expect(plan.cards.some((c) => c.sharesZoom)).toBe(false);
    // Non-quiz slides anchor on question 1, as the harness requires.
    expect(one.filter((c) => c.slide !== "quiz").every((c) => c.questionId === STORED[0])).toBe(true);
  });

  it("the repeated-opener copy rides question 1 only", () => {
    const plan = browserPlan(SCENARIOS[7]);
    const repeated = plan.cards.filter((c) => c.extraParams?.repeat);
    expect(new Set(repeated.map((c) => c.slug))).toEqual(new Set(["q01"]));
    expect(repeated.every((c) => c.extraParams?.repeat === "2")).toBe(true);
  });

  it("difficulty badges follow override → run default → metadata, on badge slides only", () => {
    const plan = browserPlan({ name: "", mode: "answer-reveal", ids: [STORED[0], STORED[1]], formats: ["square"] });
    // STORED[0] has gold metadata; STORED[1] has none.
    expect(plan.cards.map((c) => [c.questionId, c.slug, c.difficulty])).toEqual([
      [STORED[0], "recap", "gold"],
      [STORED[0], "answer", "gold"],
      [STORED[0], "community", null],
      [STORED[1], "recap", null],
      [STORED[1], "answer", null],
      [STORED[1], "community", null],
    ]);
    const forced = browserPlan({ name: "", mode: "answer-reveal", ids: [STORED[1]], formats: ["square"], overrides: { [STORED[1]]: "diamond" } });
    expect(forced.cards.map((c) => c.difficulty)).toEqual(["diamond", "diamond", null]);
  });

  it("the harness URL carries every parameter the generator passes", () => {
    const plan = browserPlan(SCENARIOS[9]);
    const q05 = plan.cards.find((c) => c.slug === "q05" && c.formatKey === "vertical")!;
    const url = new URL(harnessUrl(q05), "http://x");
    expect(url.pathname).toBe("/dev/quiz-render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: STORED[4],
      state: "question",
      format: "vertical",
      difficulty: "diamond",
      progress: "5of10",
    });
    const answers = plan.cards.find((c) => c.slug === "answers-2" && c.formatKey === "square")!;
    const summary = Object.fromEntries(new URL(harnessUrl(answers, 2.5), "http://x").searchParams);
    expect(summary).toEqual({
      q: STORED[0],
      state: "question",
      format: "square",
      scale: "2.5",
      slide: "summary",
      qids: STORED.slice(6, 10).join(","),
      sumStart: "6",
      sumPage: "2",
      sumPages: "2",
    });
  });

  it("reports what the generator would refuse instead of planning it", () => {
    expect(browserPlan({ name: "", mode: "multi-question", ids: [STORED[0]] }).errors.join(" ")).toMatch(/2-10/);
    expect(
      browserPlan({ name: "", mode: "multi-question", ids: [STORED[0], STORED[0]] }).errors.join(" "),
    ).toMatch(/same question twice/);
    expect(
      buildExportPlan({
        selection: [{ id: STORED[0], label: "x" }],
        formats: ["square"],
        states: [],
        post: "single-question",
        mode: "multi-question",
      }).errors.join(" "),
    ).toMatch(/cannot carry a post type/);
  });

  it("keeps the pre-CC2 contract for callers that pass no mode", () => {
    const plan = buildExportPlan({
      selection: [{ id: "123", label: "#123" }],
      formats: ["mobile-social"],
      states: ["question", "correct"],
      post: null,
      runId: "legacy",
    });
    expect(plan.mode).toBe("classic");
    expect(plan.cards.map((c) => c.zipPath)).toEqual([
      "legacy/question_000123/mobile-social_question.png",
      "legacy/question_000123/mobile-social_correct.png",
    ]);
    // No questions handed in and no run tier: no badge is invented.
    expect(plan.cards.every((c) => c.difficulty === null)).toBe(true);
  });
});

describe("daily package plan ≡ runDailyPackage's three runs", () => {
  const featured = STORED[0];
  const challenge = STORED.slice(1, 5);

  it("plans post-1, post-2, post-3 with the generator's run ids, modes and questions", () => {
    const daily = buildDailyPackagePlan({
      prefix: "day-2026-10-22",
      featuredQuestionId: featured,
      challengeQuestionIds: challenge,
      reuseFeaturedAsOpener: true,
      repeatVariant: 1,
      midCtaVariant: 2,
      formats: ["mobile-social", "vertical"],
      questions: ALL,
    });
    expect(daily.errors).toEqual([]);
    expect(daily.posts.map((p) => [p.key, p.runId, p.plan.mode, p.plan.questionIds])).toEqual([
      ["post-1-single-question", "day-2026-10-22-post-1-single-question", "single-question", [featured]],
      ["post-2-answer-reveal", "day-2026-10-22-post-2-answer-reveal", "answer-reveal", [featured]],
      ["post-3-multi-question", "day-2026-10-22-post-3-multi-question", "multi-question", [featured, ...challenge]],
    ]);
    for (const post of daily.posts) {
      expect(post.plan.packageType).toBe(post.key);
      expect(post.plan.packagePrefix).toBe("day-2026-10-22");
      expect(post.plan.runDir).toBe(post.runId);
      // Each post is exactly the canonical expansion of its own run.
      const canonical = canonicalCaptures({
        name: post.key,
        mode: post.plan.mode as Mode,
        ids: post.plan.questionIds,
        formats: ["mobile-social", "vertical"],
        challenge: post.plan.challenge ?? undefined,
      });
      expect(browserCaptures(post.plan)).toEqual(canonical.captures);
    }
    expect(daily.posts[2].plan.challenge).toEqual({ repeatVariant: 1, midCtaVariant: 2 });
    expect(daily.zipFileName).toBe("day-2026-10-22-package.zip");
    expect(daily.cardCount).toBe(daily.posts.reduce((n, p) => n + p.plan.cards.length, 0));
  });

  it("drops the repeat copy when the featured question is not reused (as runDailyPackage does)", () => {
    const daily = buildDailyPackagePlan({
      prefix: "day",
      featuredQuestionId: featured,
      challengeQuestionIds: challenge,
      reuseFeaturedAsOpener: false,
      repeatVariant: 1,
      formats: ["square"],
      questions: ALL,
    });
    expect(daily.posts[2].plan.questionIds).toEqual(challenge);
    expect(daily.posts[2].plan.challenge).toEqual({ repeatVariant: null, midCtaVariant: null });
    expect(daily.posts[2].plan.cards.some((c) => c.extraParams?.repeat)).toBe(false);
  });

  it("refuses an invalid package instead of planning part of it", () => {
    const bad = buildDailyPackagePlan({
      prefix: "bad prefix!",
      featuredQuestionId: featured,
      challengeQuestionIds: challenge,
      reuseFeaturedAsOpener: true,
      formats: ["square"],
    });
    expect(bad.posts).toEqual([]);
    expect(bad.errors.join(" ")).toMatch(/Invalid package run prefix/);
    const dup = buildDailyPackagePlan({
      prefix: "dup",
      featuredQuestionId: featured,
      challengeQuestionIds: [featured, challenge[0]],
      reuseFeaturedAsOpener: true,
      formats: ["square"],
    });
    expect(dup.errors.join(" ")).toMatch(/duplicates/);
    expect(dup.cardCount).toBe(0);
  });
});
