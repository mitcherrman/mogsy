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
      // CON1 Step 5 — the three CURRENT Pro Play anchors: a scope (vq-03,
      // which replaced the hand-authored legacy-shaped row), a team (vq-11)
      // and a player (vq-12). Each carries the full presentation contract.
      "vq-11", "vq-12",
      // vq-13 is the CHAMPION-anchored Pro shape: it is the only row in the
      // set that exercises both the symmetric PLAYER subject cards and the
      // runtime champion splash — and therefore the only one that exercises
      // the Step 5 unresolved-subject-image gate.
      "vq-13",
      // RR1 pass 1 — the three rows that make the RANKED production
      // presentation path photographable. vq-14 is the GOLD STANDARD (the
      // control group for every convergence change), vq-15 is the real thin
      // Ranked item payload, vq-16 is a declared-denied premise.
      "vq-14", "vq-15", "vq-16",
      // RR1 summoner-spell convergence — the pair that pins BOTH halves of
      // the family: vq-17 is a spell with a canonical row (resolves), vq-18 is
      // one with art on disk and NO row (fails closed). The second is the more
      // valuable of the two, because it is the one a future pass would be
      // tempted to "fix" by building a path from the spell name.
      "vq-17", "vq-18",
      // MAA1 Phase 4 — the LANE MINION subject, the first depictable subject
      // whose family also asks how many of the thing there are. vq-19 melee
      // and vq-20 caster are ordinary class-stat rows; vq-21 (cannon wave
      // size) and vq-22 (super-minion wave size) are the answer-leak cases and
      // are the reason the art is a single-unit portrait. vq-23 (a generic
      // wave) and vq-24 (a STRUCTURE row in the same key prefix) carry no
      // presentation at all — both are declared refusals, not gaps.
      "vq-19", "vq-20", "vq-21", "vq-22", "vq-23", "vq-24",
    ]);
  });

  // ---- MAA1 Phase 4 — the lane minion -------------------------------------

  it.each([
    ["vq-19", "melee", "Melee Minion"],
    ["vq-20", "caster", "Caster Minion"],
    ["vq-21", "siege", "Cannon Minion"],
    ["vq-22", "super", "Super Minion"],
  ])("%s carries a minion CLASS subject and nothing countable", (id, canonicalId, name) => {
    const subject = (byId.get(id) as any).presentation.assets.subject;
    expect(subject.type).toBe("minion");
    expect(subject.id).toBe(canonicalId);
    expect(subject.name).toBe(name);
    expect(subject.icon).toBe(`assets/minions/${canonicalId}.png`);
    // Identity only. A number in this blob would be a wave size or a stat.
    expect(Object.keys(subject).sort()).toEqual(["icon", "id", "name", "type"]);
  });

  it.each([
    ["vq-21", "7"],
    ["vq-22", "8"],
  ])("%s asks for a minion COUNT and its payload holds no count", (id, answer) => {
    const row = byId.get(id) as any;
    expect(row.question_text.toLowerCase()).toContain("how many total minions");
    expect(row.choices).toContain(answer);
    expect(JSON.stringify(row.presentation)).not.toContain(answer);
  });

  it.each([["vq-23"], ["vq-24"]])(
    "%s is a DECLARED refusal and carries no presentation",
    (id) => {
      // vq-23: a generic wave — the approved wiki's only whole-wave image is a
      // countable lane scene. vq-24: a turret row, which shares the
      // environment_mechanic key prefix with minions and is still denied.
      // Neither absence is a gap to be filled by inferring a subject.
      expect((byId.get(id) as any).presentation).toBeUndefined();
    },
  );

  // ---- RR1 summoner-spell convergence -------------------------------------

  it("vq-17 is a summoner-spell SUBJECT, not an option-channel entity", () => {
    const subject = (byId.get("vq-17") as any).presentation.assets.subject;
    // `summoner_spell` is the OPTION-channel type and routes to the small
    // collectible card; the subject channel has its own type so an ordinary
    // summoner-spell question reaches the shared Ranked scenario card.
    expect(subject.type).toBe("summoner_spell_subject");
    expect(subject.spell).toBe("Barrier");
    expect(String(subject.spell_icon)).toContain("summoner_spells/Barrier.png");
    expect(subject.badge).toBe("Summoner Spell");
  });

  it("vq-17 exposes the spell and never its cooldown", () => {
    const row = byId.get("vq-17") as any;
    // The correct answer is "180 seconds" and it is the ANSWER, so no part of
    // it may appear anywhere in the frozen presentation.
    const blob = JSON.stringify(row.presentation);
    expect(blob).not.toContain("180");
    expect(blob.toLowerCase()).not.toContain("cooldown");
    // And the premise carries nothing the SSM slice needs but this question
    // does not — no sources, no haste total.
    expect(Object.keys(row.presentation.assets.subject).sort()).toEqual(
      ["badge", "spell", "spell_icon", "type"],
    );
  });

  it("vq-18 proves the registry gap still fails closed", () => {
    const row = byId.get("vq-18") as any;
    // Flash.png exists on disk; `summoner_spells` has no Flash row. The
    // backend must therefore emit NO presentation, and the question renders
    // the compact band. Four of the nine certified spells are in this state.
    expect(row.presentation).toBeNull();
  });

  // ---- RR1 pass 1 ---------------------------------------------------------

  it("vq-14 is the Combat Calculation gold standard, cinematic and complete", () => {
    const subject = (byId.get("vq-14")?.presentation as
      { assets?: { subject?: Record<string, unknown> } } | undefined)?.assets?.subject;
    // The DISCRIMINATOR. classify.ts selects CombatCalculationScenarioCard on
    // this exact string; nothing else in the payload chooses the card.
    expect(subject?.type).toBe("combat_cooldown");
    // The full-bleed splash is the single thing that separates the cinematic
    // card from a dark box — ScenarioCardFrame draws a gradient placeholder
    // for every card that passes backgroundUrl={null}.
    expect(subject?.champion_splash).toBeTruthy();
    expect(subject?.champion).toBe("Aatrox");
    expect(subject?.ability_name).toBe("Umbral Dash");
    expect(subject?.ability_slot).toBe("E");
    expect(subject?.ability_icon).toBeTruthy();
    // The two ConditionChips. No other production family emits either.
    expect(subject?.level).toBe(11);
    expect(subject?.ability_rank).toBe(3);
    // The "Loadout · Items" section.
    expect(subject?.item_icons).toHaveLength(1);
  });

  it("vq-14 carries NO family-band inputs, so it cannot be diverted", () => {
    // resolveBandProfile checks selectFamilyLayout BEFORE cinematic, and
    // selectFamilyLayout reads assets.entities / assets.premise_facts. A
    // payload that grew either would silently stop rendering the gold
    // standard while every other assertion here still passed.
    const assets = (byId.get("vq-14")?.presentation as
      { assets?: Record<string, unknown> } | undefined)?.assets;
    expect(assets).toBeTruthy();
    expect(assets).not.toHaveProperty("entities");
    expect(assets).not.toHaveProperty("premise_facts");
  });

  it("vq-15 is the THIN Ranked item payload, not the richer Daily shape", () => {
    const subject = (byId.get("vq-15")?.presentation as
      { assets?: { subject?: Record<string, unknown> } } | undefined)?.assets?.subject;
    expect(subject?.type).toBe("item");
    expect(subject?.icon).toBeTruthy();
    // What production does NOT send. getItemAnalysisSubject reads all of these
    // off `metadata`, so their absence is why the dossier and the recipe tree
    // never populate in a Ranked round — the baseline the next pass measures.
    const meta = byId.get("vq-15")?.presentation as Record<string, unknown>;
    for (const key of ["cost", "stats", "known_components", "parent_item_name"]) {
      expect(meta).not.toHaveProperty(key);
    }
  });

  it("vq-16 is a declared-denied premise and carries no presentation at all", () => {
    // presentation_for_question() returns None for this family
    // (premise_denied_reason in quiz/presentation_contract.py). The ABSENCE is
    // the contract: a correct payload, not a missing one.
    expect(byId.get("vq-16")).toBeTruthy();
    expect(byId.get("vq-16")?.presentation).toBeUndefined();
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

  it("covers the CURRENT Pro Play source, at all three anchors", () => {
    // Every Pro Play row must be a CURRENT generated specimen, never one of
    // the ~50k legacy stored rows: the legacy population carries no `context`
    // and therefore cannot render the production Pro Play card at all.
    for (const id of ["vq-03", "vq-11", "vq-12", "vq-13"]) {
      const row = byId.get(id);
      expect(row?.source_kind, id).toBe("pro_question");
      expect(String(row?.review_key), id).toMatch(/^pro:/);
      // The presentation contract, not the stored premise projection, is what
      // makes these publishable.
      expect(row?.context, id).toBeTruthy();
    }
    // The three anchor kinds the contract distinguishes, each drawn from a
    // different family, so a regression in one cannot hide behind the others.
    const anchorKind = (id: string) =>
      ((byId.get(id) as { context?: { anchor?: { kind?: string } } } | undefined)
        ?.context?.anchor?.kind);
    expect(new Set(["vq-03", "vq-11", "vq-12"].map(anchorKind))).toEqual(
      new Set(["scope", "team", "player"]),
    );
    // vq-03 is the CURRENT-season international scope: the 2026 data that
    // makes this set Worlds-relevant rather than historical.
    expect(String(byId.get("vq-03")?.question_text)).toContain("26.13");

    // vq-13 must keep the two properties it was added for: champion art to
    // resolve, and at least two ENTITY subjects (champion subjects render no
    // cards by design, so a champion-vs-champion row would not exercise them).
    const thirteen = byId.get("vq-13") as {
      context?: {
        anchor?: { media?: { kind?: string; key?: string } };
        subjects?: Array<{ kind?: string }>;
      };
    };
    expect(thirteen.context?.anchor?.media).toMatchObject({ kind: "champion" });
    expect(thirteen.context?.anchor?.media?.key).toBeTruthy();
    const entities = (thirteen.context?.subjects ?? []).filter(
      (s) => s.kind === "player" || s.kind === "team",
    );
    expect(entities.length).toBeGreaterThanOrEqual(2);
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
