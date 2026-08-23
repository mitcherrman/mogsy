/**
 * The synthetic Ranked record has to be TRUE ABOUT ITSELF.
 *
 * A demo dataset that contradicts its own semantics is worse than none: it
 * makes the surface look right while teaching the wrong lesson, and the whole
 * reason this fixture exists is to judge whether the icon and review layers
 * are any good. So these tests check the fixture the way the backend's own
 * tests check a round — internally valid answers, no answer exposed on a
 * sealed round, and an icon that agrees with what the question is actually
 * about.
 *
 * The last group is the isolation guard: production must not be able to see
 * any of this.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  SYNTHETIC_MATCH_SPECS,
  SYNTHETIC_QUESTIONS,
  SYNTHETIC_RANKED_HISTORY,
  SYNTHETIC_RANKED_REVIEWS,
  iconHintFor,
} from "./syntheticRankedHistory";
import { readMatchReview } from "@/lib/ranked-public/contracts";
import {
  questionOutcome,
  resolveQuestionIcon,
} from "@/components/quiz/workspace/questionIcons";
import { TIMELINE_PAGE_SIZE } from "@/components/quiz/workspace/QuestionTimeline";

const ROUNDS = Object.values(SYNTHETIC_RANKED_REVIEWS).flatMap((r) => r.rounds);
const QUIZ_ROUNDS = ROUNDS.filter((r) => r.kind === "quiz");

// ------------------------------------------------------- internal validity

describe("every round is internally complete", () => {
  it("has four distinct options and an in-bounds correct index", () => {
    for (const round of QUIZ_ROUNDS) {
      const q = round.question!;
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(q.options).size).toBe(q.options.length);
      if (round.revealed) {
        expect(q.correctOptionIndex).not.toBeNull();
        expect(q.correctOptionIndex!).toBeGreaterThanOrEqual(0);
        expect(q.correctOptionIndex!).toBeLessThan(q.options.length);
      }
    }
  });

  it("keeps the viewer's answer in bounds, or honestly absent", () => {
    for (const round of QUIZ_ROUNDS) {
      const a = round.viewerSubmission.answerIndex;
      if (a === null) continue;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(round.question!.options.length);
    }
  });

  it("derives is_correct from the answer rather than asserting it", () => {
    for (const round of QUIZ_ROUNDS) {
      const { answerIndex, isCorrect } = round.viewerSubmission;
      const correct = round.question!.correctOptionIndex;
      if (!round.revealed || answerIndex === null) {
        expect(isCorrect).toBeNull();
      } else {
        expect(isCorrect).toBe(answerIndex === correct);
      }
    }
  });

  it("numbers rounds 1..n in order, and finalRoundNumber is the count", () => {
    for (const review of Object.values(SYNTHETIC_RANKED_REVIEWS)) {
      expect(review.rounds.map((r) => r.roundNumber)).toEqual(
        review.rounds.map((_, i) => i + 1),
      );
      expect(review.finalRoundNumber).toBe(review.rounds.length);
      expect(review.roundCount).toBe(review.rounds.length);
    }
  });

  it("parses through the REAL contract reader, envelope and all", () => {
    // The fixture is only worth anything if it is the shape the backend sends.
    for (const [id, review] of Object.entries(SYNTHETIC_RANKED_REVIEWS)) {
      const envelope = {
        schema_version: "ranked_duel.match_review.v1",
        projection_type: "match_review",
        match_id: id,
        round_number: null,
        server_time: review.serverTime,
        payload: {
          match_id: id,
          final_round_number: review.finalRoundNumber,
          round_count: review.roundCount,
          rounds: review.rounds.map((r) => ({
            round_number: r.roundNumber,
            kind: r.kind,
            module_id: r.moduleId,
            category: r.category,
            canonical_question_ref: r.canonicalQuestionRef,
            revealed: r.revealed,
            icon_hint: r.iconHint,
            question: r.question && {
              prompt: r.question.prompt,
              options: r.question.options,
              correct_option_index: r.question.correctOptionIndex,
              explanation: r.question.explanation,
            },
            challenges: r.challenges?.map((c) => ({
              challenge_index: c.challengeIndex,
              prompt: c.prompt,
              kind: c.kind,
              entity_kind: c.entityKind,
              left: c.left,
              right: c.right,
              correct_side: c.correctSide,
              viewer_side: c.viewerSide,
              is_correct: c.isCorrect,
            })) ?? null,
            viewer_submission: {
              answer_index: r.viewerSubmission.answerIndex,
              is_correct: r.viewerSubmission.isCorrect,
              correct_count: r.viewerSubmission.correctCount,
              answered_count: r.viewerSubmission.answeredCount,
              challenge_count: r.viewerSubmission.challengeCount,
            },
          })),
        },
      };
      expect(() => readMatchReview(envelope)).not.toThrow();
    }
  });
});

// ------------------------------------------------------------ reveal safety

describe("a sealed round exposes nothing", () => {
  it("exists at all — the forfeit case has to be visible in the preview", () => {
    const sealed = ROUNDS.filter((r) => !r.revealed);
    expect(sealed.length).toBeGreaterThanOrEqual(1);
  });

  it("carries the question but neither the answer nor the explanation", () => {
    for (const round of ROUNDS.filter((r) => !r.revealed)) {
      expect(round.question!.prompt.length).toBeGreaterThan(0);
      expect(round.question!.options.length).toBeGreaterThan(0);
      expect(round.question!.correctOptionIndex).toBeNull();
      expect(round.question!.explanation).toBeNull();
      expect(round.viewerSubmission.isCorrect).toBeNull();
    }
  });
});

// -------------------------------------------------------- icon semantics

/** The declaration under test: what each question is ACTUALLY about. */
const EXPECTED_SUBJECT: Record<string, string> = {
  "malphite-r-cooldown": "champion",
  "ahri-q-cost": "champion",
  "infinity-edge-ad": "item",
  "dorans-shield-cost": "item",
  "moonstone-unique": "item",
  "flash-cooldown": "summoner_spell",
  "smite-charges": "summoner_spell",
  "conqueror-stacks": "rune",
  // Broad — a subject AREA, not an entity.
  "purchase-total": "category",
  "baron-respawn": "category",
  "dragon-soul": "category",
  "ward-duration": "category",
  "control-ward": "category",
  "caster-count": "category",
  "slow-push": "category",
  "blue-sentinel": "category",
  "ability-haste": "category",
};

describe("every question's icon agrees with its own subject", () => {
  it("covers every question in the bank, so nothing slips in unchecked", () => {
    expect(Object.keys(EXPECTED_SUBJECT).sort()).toEqual(
      Object.keys(SYNTHETIC_QUESTIONS).sort(),
    );
  });

  it.each(Object.entries(EXPECTED_SUBJECT))(
    "%s is a %s question",
    (id, kind) => {
      expect(SYNTHETIC_QUESTIONS[id].subject.kind).toBe(kind);
      expect(iconHintFor(SYNTHETIC_QUESTIONS[id]).kind).toBe(kind);
    },
  );

  it("the Flash question shows Flash", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["flash-cooldown"]));
    expect(view.specific).toBe(true);
    expect(view.label).toBe("Flash");
    expect(view.src).toContain("assets/summoner_spells/Flash.png");
  });

  it("the Malphite question shows Malphite", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["malphite-r-cooldown"]));
    expect(view.specific).toBe(true);
    expect(view.label).toBe("Malphite");
    expect(view.src).toContain("assets/champions/Malphite/icon.png");
  });

  it("the Moonstone question shows Moonstone Renewer", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["moonstone-unique"]));
    expect(view.specific).toBe(true);
    expect(view.label).toBe("Moonstone Renewer");
    expect(view.src).toContain("assets/items/6617.png");
  });

  it("the wave question shows the Waves category, not an item", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["caster-count"]));
    expect(view.specific).toBe(false);
    expect(view.src).toContain("caster-minion");
  });

  it("the objective question shows the Objectives category", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["baron-respawn"]));
    expect(view.specific).toBe(false);
    expect(view.src).toContain("elder-dragon");
  });

  it("the vision question shows the Vision category", () => {
    const view = resolveQuestionIcon(iconHintFor(SYNTHETIC_QUESTIONS["ward-duration"]));
    expect(view.specific).toBe(false);
    expect(view.src).toContain("3340");
  });

  it("the purchase TOTAL claims none of the items it names", () => {
    // The false-specificity case, stated as a fixture rule: the prompt names
    // Doran's Blade, Phage and Kindlegem, and the icon must claim no entity.
    const q = SYNTHETIC_QUESTIONS["purchase-total"];
    expect(q.prompt).toContain("Doran's Blade");
    const hint = iconHintFor(q);
    expect(hint.kind).toBe("category");
    expect(hint.icon).toBeNull();
    const view = resolveQuestionIcon(hint);
    expect(view.specific).toBe(false);
    expect(view.src).not.toContain("1055");
  });

  it("Meta Reflex gets its own mark and no borrowed entity art", () => {
    const meta = ROUNDS.filter((r) => r.kind === "meta_reflex");
    expect(meta.length).toBeGreaterThanOrEqual(1);
    for (const round of meta) {
      expect(round.iconHint).toEqual({ kind: "meta_reflex", key: null, icon: null });
      const view = resolveQuestionIcon(round.iconHint);
      expect(view.glyph).toBe("meta_reflex");
      expect(view.src).toBeUndefined();
      expect(view.label).toBe("Meta Reflex");
    }
  });

  it("never claims an entity the prompt does not name", () => {
    // The cheap version of the semantic rule, applied to every entity hint in
    // the whole set: if the icon says "Flash", the question had better say so.
    for (const round of QUIZ_ROUNDS) {
      const { kind, key } = round.iconHint;
      if (kind === "category" || kind === "generic" || key === null) continue;
      const bare = key.replace(/['’]s\b/, "").split(" ")[0];
      expect(round.question!.prompt).toContain(bare);
    }
  });
});

// --------------------------------------------------------- record coherence

describe("the record reads like a real one", () => {
  it("has a match for every history row, and no orphans", () => {
    const ids = SYNTHETIC_RANKED_HISTORY.map((e) => e.matchId).sort();
    expect(Object.keys(SYNTHETIC_RANKED_REVIEWS).sort()).toEqual(ids);
  });

  it("states a length that matches the rounds it actually has", () => {
    for (const entry of SYNTHETIC_RANKED_HISTORY) {
      expect(SYNTHETIC_RANKED_REVIEWS[entry.matchId].rounds).toHaveLength(
        entry.finalRoundNumber,
      );
    }
  });

  it("walks a coherent ladder, stepping over the voided match", () => {
    // Newest first: each match ends where the one after it began, and a void
    // moves nothing at all.
    let expectedAfter: number | null = null;
    for (const entry of SYNTHETIC_RANKED_HISTORY) {
      if (entry.ratingDelta === null) {
        expect(entry.ratingAfter).toBeNull();
        continue;
      }
      if (expectedAfter !== null) expect(entry.ratingAfter).toBe(expectedAfter);
      expectedAfter = entry.ratingAfter! - entry.ratingDelta;
    }
  });

  it("moves rating in the direction of the result", () => {
    for (const e of SYNTHETIC_RANKED_HISTORY) {
      if (e.ratingDelta === null) continue;
      if (e.viewerOutcome === "win") expect(e.ratingDelta).toBeGreaterThan(0);
      if (e.viewerOutcome === "loss") expect(e.ratingDelta).toBeLessThan(0);
    }
  });

  it("covers wins, losses, a forfeit, a void, a bot and all five roles", () => {
    const outcomes = new Set(SYNTHETIC_RANKED_HISTORY.map((e) => e.viewerOutcome));
    expect(outcomes.has("win")).toBe(true);
    expect(outcomes.has("loss")).toBe(true);
    const terminals = new Set(SYNTHETIC_RANKED_HISTORY.map((e) => e.terminalReason));
    expect(terminals.has("forfeit")).toBe(true);
    expect(terminals.has("no_contest")).toBe(true);
    expect(SYNTHETIC_RANKED_HISTORY.some((e) => e.opponentIsBot)).toBe(true);
    expect(new Set(SYNTHETIC_RANKED_HISTORY.map((e) => e.viewerRole))).toEqual(
      new Set(["top", "jungle", "mid", "adc", "support"]),
    );
  });

  it("carries no match SCORE, only a length", () => {
    // `finalRoundNumber` is the round a duel ended on. No field may pair it
    // with a second number, and nothing may render as `5-3`.
    //
    // The ISO completion stamp is excluded rather than the regex loosened:
    // `2026-08-22` is hyphenated numbers by construction and says nothing
    // about a score, and a regex tolerant enough to admit it would stop
    // catching the thing this guards.
    const scoreless = SYNTHETIC_RANKED_HISTORY.map(
      ({ completedAt: _stamp, ...rest }) => rest,
    );
    const blob = JSON.stringify(scoreless);
    expect(blob).not.toMatch(/"score"/);
    expect(blob).not.toMatch(/\b\d+\s*[-–]\s*\d+\b/);
  });

  it("covers every timeline paging case", () => {
    const lengths = SYNTHETIC_RANKED_HISTORY.map((e) => e.finalRoundNumber).sort((a, b) => a - b);
    const pages = (n: number) => Math.ceil(n / TIMELINE_PAGE_SIZE);
    // Under one page (no arrows at all), exactly one page, a second page
    // holding one, a second holding two, exactly two full pages, and three.
    expect(lengths).toContain(3);
    expect(lengths).toContain(5);
    expect(lengths).toContain(6);
    expect(lengths).toContain(7);
    expect(lengths).toContain(10);
    expect(lengths).toContain(15);
    expect(pages(3)).toBe(1);
    expect(pages(5)).toBe(1);
    expect(pages(6)).toBe(2);
    expect(pages(10)).toBe(2);
    expect(pages(15)).toBe(3);
  });

  it("gives the popover every state a reviewer needs to click", () => {
    const outcomes = QUIZ_ROUNDS.map(questionOutcome);
    expect(outcomes).toContain("correct");
    expect(outcomes).toContain("incorrect");
    expect(outcomes).toContain("unanswered");
    // A worked calculation, and a plain prose explanation.
    expect(QUIZ_ROUNDS.some((r) =>
      Array.isArray(r.question?.explanation?.calculation_steps))).toBe(true);
    expect(QUIZ_ROUNDS.some((r) =>
      typeof r.question?.explanation?.scenario_note === "string"
      && !r.question?.explanation?.calculation_steps)).toBe(true);
    // A long prompt and a long option, so the card's bounds are exercised.
    expect(QUIZ_ROUNDS.some((r) => r.question!.prompt.length > 220)).toBe(true);
    expect(QUIZ_ROUNDS.some((r) => r.question!.options.some((o) => o.length > 70))).toBe(true);
  });

  it("gives a wrong answer that is plausible, not filler", () => {
    // Every wrong pick Timmy made is an option a real player could choose —
    // asserted structurally: it is a real option of that question, and for the
    // one family that records WHY, the derivation exists for what he picked.
    const total = SYNTHETIC_MATCH_SPECS.flatMap((m) => m.rounds);
    expect(total.length).toBeGreaterThan(0);
    const purchase = QUIZ_ROUNDS.find(
      (r) => r.canonicalQuestionRef === "ranked:demo-purchase-total"
        && r.viewerSubmission.isCorrect === false,
    );
    expect(purchase).toBeDefined();
    const chosen = purchase!.question!.options[purchase!.viewerSubmission.answerIndex!];
    const derivations = purchase!.question!.explanation!
      .distractor_derivations as { value: string }[];
    expect(derivations.map((d) => d.value)).toContain(chosen);
  });
});

// -------------------------------------------------------------- isolation

describe("the fixture cannot leak into production", () => {
  it("is imported by nothing outside the preview route", () => {
    const root = resolve(__dirname, "../../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (full.includes("/pages/dev/")) continue;
          const src = readFileSync(full, "utf8");
          if (src.includes("syntheticRankedHistory")) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("performs no I/O and names no endpoint", () => {
    const src = readFileSync(resolve(__dirname, "syntheticRankedHistory.ts"), "utf8");
    for (const forbidden of [
      "fetch(", "axios", "supabase", "localStorage", "sessionStorage",
      "useAuth", "/api/", "XMLHttpRequest",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("says what it is in its own filename and its exports", () => {
    // The cheapest guard of all: nobody can import this by accident and think
    // it is real.
    expect(__filename).toMatch(/synthetic/i);
    for (const name of Object.keys({ SYNTHETIC_RANKED_HISTORY, SYNTHETIC_RANKED_REVIEWS })) {
      expect(name).toMatch(/^SYNTHETIC_/);
    }
  });
});
