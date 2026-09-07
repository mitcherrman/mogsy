/**
 * CON1 Step 4 — the deterministic VISUAL QA fixture set is a contract, and
 * this is where it is held.
 *
 * `scripts/quiz-screenshots/visual-qa-fixture.json` is the offline input to
 * the before/after runs, so the value of a before/after comparison depends
 * entirely on the two runs having covered the same shapes. A fixture file
 * nobody checks quietly loses a case — the recipe row, the 2-option row, the
 * long-prompt row — and the next run reports "0 failures" over a narrower set
 * than the last one.
 *
 * So the assertions here are about COVERAGE and about the fixture staying a
 * faithful stand-in for real rows: every case the step is measured against is
 * present, every row survives the real adapter, and the two rows whose whole
 * purpose is to be un-summarisable (the long prompt, the long explanation)
 * stay long.
 *
 * Deliberately NOT asserted: pixel output. The repo has no golden-image
 * infrastructure and Step 4 did not introduce any — the visual evidence is the
 * contact sheet a human opens, and the machine-checkable part is the geometry
 * and completeness gates the capture runner already enforces.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adaptScreenshotQuestions, type ScreenshotSourceQuestion } from "./adapt";
import { answerPromptCopy } from "./cta";
import { deriveRecipe } from "./recipe";

const FIXTURE_PATH = resolve("scripts/quiz-screenshots/visual-qa-fixture.json");

const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  questions: ScreenshotSourceQuestion[];
};
const rows = raw.questions;
const byId = new Map(rows.map((q) => [String(q.id), q]));

describe("visual QA fixture — coverage", () => {
  it("carries every case Step 4 is measured against", () => {
    expect(rows.map((q) => String(q.id))).toEqual([
      "vq-01", "vq-02", "vq-03", "vq-04", "vq-05",
      "vq-06", "vq-07", "vq-08", "vq-09", "vq-10",
    ]);
  });

  it("spans the option counts the CTA has to answer for", () => {
    const counts = new Set(rows.map((q) => (q.choices ?? []).length));
    expect(counts).toContain(2); // the row the old constant CTA got wrong
    expect(counts).toContain(4);
  });

  it("covers text-only, item-recipe, cinematic and family premises", () => {
    // No premise at all — the plain stored MCQ.
    expect(byId.get("vq-01")?.presentation).toBeUndefined();
    // A recipe visual, derived from metadata by the factory.
    expect(byId.get("vq-04")?.metadata?.recipe_type).toBe("missing_component");
    // A champion/ability premise with no family layout — the cinematic band.
    expect(byId.get("vq-05")?.presentation).toMatchObject({ champion_name: "Aatrox" });
    // Two family-band premises: combat, and a lifecycle transaction.
    expect(byId.get("vq-06")?.presentation).toHaveProperty("assets.premise_facts");
    const lifecycleItems = (
      byId.get("vq-07")?.presentation as
        | { assets?: { entities?: { items?: Array<{ status?: string }> } } }
        | undefined
    )?.assets?.entities?.items;
    expect(new Set(lifecycleItems?.map((i) => i.status))).toEqual(
      new Set(["retained", "purchased", "sold"]),
    );
  });

  it("covers the two GENERATED sources the factory ships", () => {
    expect(byId.get("vq-08")?.source_kind).toBe("mastery_slice");
    expect(byId.get("vq-08")?.review_key).toMatch(/^mastery:/);
    expect(byId.get("vq-09")?.source_kind).toBe("daily_card");
    expect(byId.get("vq-09")?.review_key).toMatch(/^daily:/);
    // The Daily row is the one that must carry real frozen media — a frozen
    // card with no artwork would not exercise the band the redesign is about.
    expect(byId.get("vq-09")?.presentation).toHaveProperty("assets.subject.icon");
  });

  it("keeps a long prompt and a long explanation genuinely long", () => {
    // These two rows exist to be the readability worst case. If someone
    // tidies them the set silently stops testing what it was built for.
    expect((byId.get("vq-02")?.question_text ?? "").length).toBeGreaterThan(200);
    expect(
      Math.min(...(byId.get("vq-02")?.choices ?? []).map((c) => String(c).length)),
    ).toBeGreaterThan(40);
    expect((byId.get("vq-10")?.explanation ?? "").length).toBeGreaterThan(250);
  });

  it("gives every row an explanation, so the explanation state is never skipped", () => {
    // `resolveAnswerPlan` skips the explanation state — with a recorded
    // reason — for a row that has none, which would silently shrink the run.
    for (const q of rows) expect(q.explanation?.trim()).toBeTruthy();
  });
});

describe("visual QA fixture — the rows are real enough to be evidence", () => {
  const { adapted, skipped } = adaptScreenshotQuestions(rows);

  it("passes the REAL adapter with nothing skipped", () => {
    expect(skipped).toEqual([]);
    expect(adapted).toHaveLength(rows.length);
  });

  it("carries presentation and provenance through untouched", () => {
    const daily = adapted.find((q) => String(q.id) === "vq-09")!;
    expect(daily.presentation).toEqual(byId.get("vq-09")!.presentation);
    expect(daily.provenance?.materialization).toBe("frozen_snapshot");
  });

  it("derives a recipe from the item row, and leaks no answer before reveal", () => {
    const item = adapted.find((q) => String(q.id) === "vq-04")!;
    const unrevealed = deriveRecipe(item, false);
    const revealed = deriveRecipe(item, true);
    expect(unrevealed?.mode).toBe("missing_component");
    expect(unrevealed?.missing).toBeNull();
    expect(revealed?.missing?.name).toBe(item.choices[item.correct_index].label);
  });

  it("asks each row for the letters it actually has", () => {
    for (const q of adapted) {
      // The letters only — the word "Comment" has a C in it.
      const asked = answerPromptCopy(q.choices.length).replace(/^Comment /, "");
      const absent = String.fromCharCode(65 + q.choices.length); // the first letter it lacks
      if (q.choices.length < 4) expect(asked).not.toContain(absent);
    }
  });
});
