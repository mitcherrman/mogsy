/**
 * CON1 Step 1D — the presentation-completeness gate.
 *
 * Two halves, deliberately:
 *
 *  1. the POLICY (`evaluatePresentationGate`) over the two structured signals
 *     the render page stamps, and
 *  2. the SEMANTICS those signals carry (`resolveScenarioPresentation`) for the
 *     real families that project a presentation today.
 *
 * The second half is the part that keeps the first honest. The gate's whole
 * safety property is that it reads the production layout outcome rather than
 * knowing anything about families, so the tests assert what the production path
 * actually answers for the corpus — including the two cases that would have
 * been mis-gated by the obvious rule.
 */

import { describe, expect, it } from "vitest";
import {
  evaluatePresentationGate,
  presentationIsIncomplete,
  INCOMPLETE_PRESENTATION_CODE,
} from "./presentationGate";
import { resolveScenarioPresentation } from "./presentation";
import {
  COMBAT_SCENARIO,
  COOLDOWN_HASTE,
  LIFECYCLE_SCENARIO,
  MINION_EXACT,
  MINION_WAVE,
  PLAIN_MCQ,
  PRO_SCOPE_COMPARISON,
  UNREADABLE_PRESENTATION_QUESTION,
} from "./presentationFixtures";

const gate = (over: Partial<Parameters<typeof evaluatePresentationGate>[0]>) =>
  evaluatePresentationGate({
    status: null,
    band: null,
    questionId: 123,
    format: "mobile-social",
    state: "question",
    allowIncomplete: false,
    ...over,
  });

// ─────────────────────────────────────────────────────────────────────────────
// 1. What the production path actually answers, per family
// ─────────────────────────────────────────────────────────────────────────────

describe("presentation semantics — measured against the production path", () => {
  it("1 — a plain MCQ with no presentation is `absent`, and absent is not a defect", () => {
    const r = resolveScenarioPresentation(PLAIN_MCQ);
    expect(r.status).toBe("absent");
    expect(r.band).toBeNull();
    expect(presentationIsIncomplete(r.status)).toBe(false);
  });

  it("2 — a combat scenario with a valid band is `family`", () => {
    const r = resolveScenarioPresentation(COMBAT_SCENARIO);
    expect(r.status).toBe("family");
    expect(r.band).toBe("family");
    expect(r.familyLayout?.kind).toBe("combat");
    expect(presentationIsIncomplete(r.status)).toBe(false);
  });

  it("3 — a lifecycle scenario with a valid band is `family`", () => {
    const r = resolveScenarioPresentation(LIFECYCLE_SCENARIO);
    expect(r.status).toBe("family");
    expect(r.band).toBe("family");
    expect(r.familyLayout?.kind).toBe("lifecycle");
    expect(presentationIsIncomplete(r.status)).toBe(false);
  });

  it("4 — `ability_cooldown_haste` has NO family layout and still renders a band", () => {
    // The counter-example the gate is designed around: a real, active family
    // whose safe premise the family authority declines and the cinematic
    // classifier accepts. Failing on `familyLayout === null` would condemn it.
    const r = resolveScenarioPresentation(COOLDOWN_HASTE);
    expect(r.familyLayout).toBeNull();
    expect(r.band).toBe("cinematic");
    expect(r.status).toBe("cinematic");
    expect(presentationIsIncomplete(r.status)).toBe(false);
  });

  it("5 — a presentation the envelope cannot shape is `unreadable`, with a reason", () => {
    const r = resolveScenarioPresentation(UNREADABLE_PRESENTATION_QUESTION);
    expect(r.status).toBe("unreadable");
    expect(r.model).toBeNull();
    expect(r.reason).toBeTruthy();
    expect(presentationIsIncomplete(r.status)).toBe(true);
  });

  it("6 — Minion XP `exact_minion` is `text-only`: its premise reaches no band", () => {
    // The safe nine fields DO reach the layout authority; it declines, and the
    // band falls back to the category-only compact strip. This is a statement
    // about the unmerged MinionXpBand dependency, not about the bridge.
    const r = resolveScenarioPresentation(MINION_EXACT);
    expect(r.model?.scenarioSource?.metadata).toEqual(MINION_EXACT.presentation);
    expect(r.band).toBe("compact");
    expect(r.status).toBe("text-only");
    expect(presentationIsIncomplete(r.status)).toBe(true);
  });

  it("7 — `pro_champion_scope_comparison` is `text-only` too", () => {
    // A family that emits a presentation which is scope/metric/candidate
    // identity, not scenario content. It reaches no band today, so the gate
    // reports it as incomplete rather than special-casing the family.
    const r = resolveScenarioPresentation(PRO_SCOPE_COMPARISON);
    expect(r.band).toBe("compact");
    expect(r.status).toBe("text-only");
  });

  it("8 — Minion XP `wave` has no presentation, so it is `absent`, not incomplete", () => {
    // The row's raw metadata is complete and answer-bearing; nothing reads it.
    const r = resolveScenarioPresentation(MINION_WAVE);
    expect(MINION_WAVE.metadata?.breakpoint_wave_number).toBeDefined();
    expect(r.status).toBe("absent");
    expect(r.model).toBeNull();
    expect(presentationIsIncomplete(r.status)).toBe(false);
  });

  it("9 — a variant with no media band reports text-only, not a false pass", () => {
    const r = resolveScenarioPresentation(COMBAT_SCENARIO, "speed");
    expect(r.band).toBe("none");
    expect(r.status).toBe("text-only");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The policy
// ─────────────────────────────────────────────────────────────────────────────

describe("presentation completeness gate — default policy", () => {
  it("absent passes", () => {
    expect(gate({ status: "absent" })).toEqual({
      findings: [],
      failed: false,
      overridden: false,
    });
  });

  it.each(["family", "cinematic"])("a rendered presentation (%s) passes", (status) => {
    expect(gate({ status, band: status }).failed).toBe(false);
  });

  it("a non-null presentation that renders text-only FAILS", () => {
    const r = gate({ status: "text-only", band: "compact" });
    expect(r.failed).toBe(true);
    expect(r.overridden).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe("failure");
    expect(r.findings[0].code).toBe(INCOMPLETE_PRESENTATION_CODE);
  });

  it("an unreadable presentation FAILS", () => {
    expect(gate({ status: "unreadable" }).failed).toBe(true);
  });

  it("a readable presentation that produced no scenario source FAILS", () => {
    expect(gate({ status: "no-scenario" }).failed).toBe(true);
  });

  it("a slide with no presentation marker at all is not judged", () => {
    // End slides (app-cta, community, summary…) render no question card. An
    // absent attribute is absence of evidence, never a manufactured failure.
    expect(gate({ status: null }).findings).toEqual([]);
    expect(gate({ status: "  " }).findings).toEqual([]);
  });

  it("names the question, key, status, band, format and state in the failure", () => {
    const [finding] = gate({
      status: "text-only",
      band: "compact",
      reason: "the layout authority draws no scenario for it",
      questionId: 8821,
      questionKey: "minion_xp_level_breakpoint:exact_minion:w4",
      format: "vertical",
      state: "correct",
    }).findings;
    expect(finding.message).toContain("8821");
    expect(finding.message).toContain("minion_xp_level_breakpoint:exact_minion:w4");
    expect(finding.message).toContain("presentation=text-only");
    expect(finding.message).toContain("band=compact");
    expect(finding.message).toContain("format=vertical");
    expect(finding.message).toContain("state=correct");
    expect(finding.message).toContain("the layout authority draws no scenario for it");
    expect(finding.format).toBe("vertical");
    expect(finding.state).toBe("correct");
  });

  it("still identifies the question when the row carried no question_key", () => {
    const [finding] = gate({ status: "text-only", band: "compact", questionId: 42 }).findings;
    expect(finding.message).toContain("question 42");
  });
});

describe("presentation completeness gate — diagnostic override", () => {
  it("lets a text-only capture through", () => {
    const r = gate({ status: "text-only", band: "compact", allowIncomplete: true });
    expect(r.failed).toBe(false);
    expect(r.overridden).toBe(true);
  });

  it("records a WARNING, never silence", () => {
    const r = gate({ status: "text-only", band: "compact", allowIncomplete: true });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe("warning");
    expect(r.findings[0].code).toBe(INCOMPLETE_PRESENTATION_CODE);
    expect(r.findings[0].message).toContain("--allow-incomplete-presentation");
    expect(r.findings[0].message).toContain("not a publishable capture");
  });

  it("does not invent a warning for a complete or absent presentation", () => {
    expect(gate({ status: "absent", allowIncomplete: true }).findings).toEqual([]);
    expect(gate({ status: "family", band: "family", allowIncomplete: true }).findings).toEqual([]);
  });

  it("downgrades an unreadable presentation too, rather than exempting it", () => {
    const r = gate({ status: "unreadable", allowIncomplete: true });
    expect(r.failed).toBe(false);
    expect(r.findings[0].severity).toBe("warning");
  });
});

describe("the gate holds no family knowledge", () => {
  it("decides identically for two different families with the same band outcome", () => {
    const minion = resolveScenarioPresentation(MINION_EXACT);
    const pro = resolveScenarioPresentation(PRO_SCOPE_COMPARISON);
    const call = (r: ReturnType<typeof resolveScenarioPresentation>, id: string) =>
      gate({ status: r.status, band: r.band, questionId: id }).failed;
    expect(call(minion, "minion")).toBe(call(pro, "pro"));
  });

  it("would pass the SAME question the moment its band renders", () => {
    // The transition Minion XP makes when MinionXpBand merges upstream: the
    // gate reads `band`, so nothing here changes — the input does.
    expect(gate({ status: "text-only", band: "compact" }).failed).toBe(true);
    expect(gate({ status: "family", band: "family" }).failed).toBe(false);
  });
});
