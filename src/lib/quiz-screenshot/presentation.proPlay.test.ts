/**
 * CON1 Step 5 — Pro Play reaches the picture, and the gate is unchanged.
 *
 * THE BUG THESE TESTS DESCRIBE. Since Step 1D every Pro Play capture failed
 * `presentation-incomplete`, and the verdict was correct about the wrong
 * question. `resolveScenarioPresentation` asked the SCENARIO BAND path what it
 * would draw — and Pro Play has never rendered through a scenario band in
 * production. `ProPlayQuiz` composes `ProPlayQuestionCard` from
 * `question.context`, and `selectFamilyLayout` has no Pro Play entry because
 * it was never meant to. So the band fell back to `compact`, the status read
 * `text-only`, and the gate refused a card whose premise had a production
 * renderer all along.
 *
 * WHAT IS ASSERTED, and what deliberately is NOT. There is no test here that
 * says "Pro Play passes". Every test below is about the RULE:
 *
 *  - a payload the PRODUCTION narrower accepts routes to the Pro Play card;
 *  - a payload it rejects still goes down the band path and still fails;
 *  - the gate's own set of failing statuses is untouched;
 *  - the legacy stored Pro Play shape — the ~50k rows with a `presentation`
 *    and no `context` — still fails, which is the proof that nothing was
 *    exempted by family.
 */
import { describe, expect, it } from "vitest";

import { adaptScreenshotQuestion } from "./adapt";
import {
  evaluatePresentationGate,
  presentationIsIncomplete,
} from "./presentationGate";
import {
  RENDERED_PRESENTATION_STATUSES,
  rendersThroughProPlayCard,
  rendersThroughScenarioSurface,
  resolveScenarioPresentation,
} from "./presentation";
import { evaluateContentReadiness } from "./readiness";
import PRO_PLAY_SAMPLES from "@/lib/pro-play/__fixtures__/proPlaySamples";
import fixture from "../../../scripts/quiz-screenshots/visual-qa-fixture.json";

type Row = Record<string, unknown>;
const rows = (fixture as { questions: Row[] }).questions;
const byId = new Map(rows.map((q) => [String(q.id), q]));

/** The three CURRENT Pro Play specimens in the visual QA set — resolver
 *  output, copied verbatim, never hand-written. */
const PRO_ROWS = ["vq-03", "vq-11", "vq-12", "vq-13"];

const adapt = (row: Row) => {
  const adapted = adaptScreenshotQuestion(row as never);
  if (typeof adapted === "string") throw new Error(`adapter refused: ${adapted}`);
  return adapted;
};

/**
 * The legacy stored shape, reconstructed from the fixture's own current row:
 * the same premise projection the backend has always emitted for this family,
 * with the presentation contract REMOVED. That is exactly what a row in
 * `quiz_questions` carries — those 50k rows predate `question_context` and
 * have no `context` column to carry.
 */
function legacyShapeOf(id: string): Row {
  const { context: _dropped, review_key: _rk, source_kind: _sk, ...rest } =
    byId.get(id) as Row;
  return { ...rest, id: 4142, question_key: "pro_champion_scope_comparison:worlds:4.14:picks" };
}

describe("Pro Play presentation — the production card, not the band", () => {
  it.each(PRO_ROWS)("%s resolves to pro-context", (id) => {
    const result = resolveScenarioPresentation(adapt(byId.get(id)!));
    expect(result.status).toBe("pro-context");
    expect(result.proContext).not.toBeNull();
    expect(rendersThroughProPlayCard(result)).toBe(true);
    // Mutually exclusive with the band path: a card cannot render twice.
    expect(rendersThroughScenarioSurface(result)).toBe(false);
  });

  it("carries the context the card actually needs", () => {
    const result = resolveScenarioPresentation(adapt(byId.get("vq-11")!));
    const ctx = result.proContext!;
    // The four things a short Pro stem leaves out, which is the entire reason
    // the contract exists.
    expect(ctx.relationship.label).toBeTruthy();
    expect(ctx.metric.label).toBeTruthy();
    expect(ctx.scope_tags.length).toBeGreaterThan(0);
    expect(ctx.subjects.length).toBeGreaterThanOrEqual(2);
    // Symmetric: the same key set on every compared subject. An asymmetric
    // card is a signal about the option that got the extra field.
    const shapes = ctx.subjects.map((s) => Object.keys(s).sort().join("|"));
    expect(new Set(shapes).size).toBe(1);
  });

  it("is a RENDERED status, so the gate lets it publish", () => {
    expect(RENDERED_PRESENTATION_STATUSES).toContain("pro-context");
    expect(presentationIsIncomplete("pro-context")).toBe(false);
    expect(
      evaluatePresentationGate({
        status: "pro-context",
        band: null,
        questionId: "pro:x",
        format: "mobile-social",
        state: "question",
        allowIncomplete: false,
      }).failed,
    ).toBe(false);
  });

  it.each(PRO_ROWS)("%s is content-ready", (id) => {
    const readiness = evaluateContentReadiness(byId.get(id) as never);
    expect(readiness.state).toBe("ready");
    expect(readiness.blocking).toBe(false);
    expect(readiness.blockers).toEqual([]);
  });

  it("accepts a REAL production payload, not only the fixture", () => {
    // The samples were captured from /api/pro-play/quiz/* in production. If
    // the harness only accepted the CON1 resolver's output, this step would
    // have integrated with itself rather than with Pro Play.
    for (const [name, sample] of Object.entries(PRO_PLAY_SAMPLES)) {
      const question = sample.question as unknown as Record<string, unknown>;
      if (!question.context) continue;
      const result = resolveScenarioPresentation({
        id: String(question.question_id),
        question_text: String(question.question_text),
        choices: (question.choices as string[]).map((label) => ({ label })),
        correct_index: 0,
        explanation: "",
        format: "multiple_choice",
        context: question.context,
      } as never);
      expect(result.status, name).toBe("pro-context");
    }
  });
});

describe("the gate is not weakened", () => {
  it("still fails the LEGACY stored Pro Play shape", () => {
    // The whole point. These rows have a safe `presentation` and no
    // presentation contract, so no production component draws their premise —
    // and that has not changed. If this test ever passes as `pro-context`,
    // something started inferring a context, which would be a fabrication.
    const legacy = legacyShapeOf("vq-03");
    expect(legacy.context).toBeUndefined();
    const result = resolveScenarioPresentation(adapt(legacy));
    expect(result.status).toBe("text-only");
    expect(presentationIsIncomplete(result.status)).toBe(true);
    expect(evaluateContentReadiness(legacy as never).state).toBe(
      "presentation-incomplete",
    );
  });

  it("refuses a MALFORMED context rather than passing it for being present", () => {
    // Presence is not the test — the production narrower is. Each of these is
    // rejected by `asQuestionContext` and therefore falls through to the band
    // path, where the legacy verdict still applies.
    for (const bad of [
      {},
      { relationship: {}, metric: { label: "WINS" } },
      { relationship: { label: "Team" } },
      { relationship: { label: "Team" }, metric: {} },
      "a string",
      42,
      null,
    ]) {
      const row = { ...legacyShapeOf("vq-03"), context: bad };
      expect(resolveScenarioPresentation(adapt(row)).status).toBe("text-only");
    }
  });

  it("keeps the failing statuses exactly as Step 1D set them", () => {
    for (const status of ["text-only", "no-scenario", "unreadable"] as const) {
      expect(presentationIsIncomplete(status)).toBe(true);
    }
    // And absent still passes, which was always its designed behaviour.
    expect(presentationIsIncomplete("absent")).toBe(false);
  });

  it("does not name a family, a key or a source kind anywhere", async () => {
    // The structural guarantee behind "no allow-list". If this file ever
    // needs a family name to make Pro Play pass, the fix moved to the wrong
    // layer.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/quiz-screenshot/presentation.ts", "utf8"),
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "pro_champion_scope_comparison",
      "pro_player_champion_comparison",
      "pro_team_champion_comparison",
      "pro_question",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("routes a NON-Pro question exactly as it did before", () => {
    // The regression guard: every other row in the visual set must reach the
    // same status it reached in Step 4.
    const expected: Record<string, string> = {
      "vq-01": "absent",
      "vq-05": "cinematic",
      "vq-06": "family",
      "vq-07": "family",
      "vq-08": "absent",
    };
    for (const [id, status] of Object.entries(expected)) {
      expect(resolveScenarioPresentation(adapt(byId.get(id)!)).status, id).toBe(
        status,
      );
    }
  });
});
