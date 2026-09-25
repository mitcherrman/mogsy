/**
 * JOURNEY5 — the `combat_working.v1` reader: the real shape parses, anything
 * off-contract is refused as "no working" (never a throw), and the strict
 * Ranked readers carry it on reveal rows without ever failing the match.
 */
import { describe, expect, it } from "vitest";
import { readCombatWorking } from "./combatWorking";
import { readMatchReview, readPublicRound } from "@/lib/ranked-public/contracts";
import {
  PANTHEON_E_WORKING_RECALLED, ZED_E_WORKING_LETHALITY, pantheonStandardChild3RevealWithWorking,
  pantheonStandardFinalWindow,
} from "./__fixtures__/j5/finalWindow";

const wire = () => structuredClone(PANTHEON_E_WORKING_RECALLED) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("readCombatWorking — the real shape", () => {
  it("parses the backend's Pantheon E example, every served number intact", () => {
    const w = readCombatWorking(wire())!;
    expect(w).not.toBeNull();
    expect(w.ability).toEqual({ slot: "E", name: "Aegis Assault", rank: 1 });
    expect(w.formula.flat).toBe(55);
    expect(w.formula.ratios).toEqual([
      { stat: "attack_damage", label: "attack damage", ratio: 1, value: 68.8675 },
      { stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 1.5, value: 0 },
    ]);
    expect(w.rawDamage).toBe(123.8675);
    expect(w.targetArmor).toEqual({ value: 50.08, source: "recalled", establishedInChild: 0 });
    expect(w.penetration).toEqual({ lethality: 0, armorPenPercent: 0, armorPenFlat: 0 });
    expect(w.effectiveArmor).toBe(50.08);
    expect(w.mitigationMultiplier).toBe(0.6663);
    expect(w.finalDamage).toBe(82.5343);
    expect(w.answer).toBe("83");
  });

  it("parses the Zed E example (stated armor, lethality)", () => {
    const w = readCombatWorking(structuredClone(ZED_E_WORKING_LETHALITY))!;
    expect(w.targetArmor).toEqual({ value: 27.195, source: "stated", establishedInChild: null });
    expect(w.penetration.lethality).toBe(10);
    expect(w.effectiveArmor).toBe(17.195);
  });

  it("absent → null", () => {
    expect(readCombatWorking(undefined)).toBeNull();
    expect(readCombatWorking(null)).toBeNull();
  });
});

describe("readCombatWorking — fails closed to null, never throws", () => {
  const cases: [string, (w: Record<string, any>) => unknown][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    ["an unknown top-level key", (w) => { w.extra = 1; return w; }],
    ["an unknown nested key (formula)", (w) => { w.formula.note = "x"; return w; }],
    ["an unknown ratio key", (w) => { w.formula.ratios[0].scaled = 68.8675; return w; }],
    ["an unknown penetration key", (w) => { w.penetration.magic_pen = 0; return w; }],
    ["a missing field", (w) => { delete w.effective_armor; return w; }],
    ["another contract", (w) => { w.contract = "combat_working.v2"; return w; }],
    ["a numeric string", (w) => { w.raw_damage = "123.8675"; return w; }],
    ["a non-finite number", (w) => { w.final_damage = Number.NaN; return w; }],
    ["an unknown armor source", (w) => { w.target_armor.source = "guessed"; return w; }],
    ["recalled armor without its teaching child", (w) => { delete w.target_armor.established_in_child; return w; }],
    ["stated armor naming a teaching child", (w) => { w.target_armor.source = "stated"; return w; }],
    ["ratios not a list", (w) => { w.formula.ratios = {}; return w; }],
    ["a non-object", () => "combat_working"],
    ["an array", () => []],
  ];
  for (const [name, mutate] of cases) {
    it(name, () => {
      expect(() => readCombatWorking(mutate(wire()))).not.toThrow();
      expect(readCombatWorking(mutate(wire()))).toBeNull();
    });
  }
});

describe("the strict Ranked readers carry it", () => {
  it("own_challenge_reveals: parsed on the reveal it belongs to, absent elsewhere", () => {
    const round = readPublicRound(pantheonStandardFinalWindow("correct").envelope);
    const reveals = round.segmentState!.ownChallengeReveals;
    expect(reveals.map((r) => r.challengeIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(reveals[2].combatWorking?.answer).toBe("83");
    expect(reveals[4].combatWorking?.finalDamage).toBe(89.6978);
    expect(reveals[0].combatWorking ?? null).toBeNull();
    expect(reveals[3].combatWorking ?? null).toBeNull();
  });

  it("the final window parses: own_finished with the last child's reveal and the server's window", () => {
    const seg = readPublicRound(pantheonStandardFinalWindow("timeout").envelope).segmentState!;
    expect(seg.ownFinished).toBe(true);
    expect(seg.ownRevealingCardIndex).toBe(4);
    expect(seg.ownRevealUntil).not.toBeNull();
    expect(seg.ownCardDeadline).toBeNull();
    const last = seg.ownChallengeReveals[4];
    expect(last.playerAnswer).toBeNull();
    expect(last.isCorrect).toBe(false);
    expect(last.correctAnswer).toBe("90");
  });

  it("a malformed block does not fail the segment: the reveal parses with no working", () => {
    const s = pantheonStandardChild3RevealWithWorking();
    s.envelope.payload.segment_state.own_challenge_reveals[2].combat_working.formula.flat = "55";
    const round = readPublicRound(s.envelope);
    expect(round.segmentState!.ownChallengeReveals[2].combatWorking ?? null).toBeNull();
    expect(round.segmentState!.ownChallengeReveals[2].explanation).toMatch(/rounds to 83/);
  });

  it("match review: a revealed Journey Combat row carries it; an unrevealed round carrying it is refused", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      challenge_index: 2, prompt: "Pantheon Aegis Assault (rank 1) — …", interaction_kind: "atomic_recall",
      question_family: null, answer_type: "single_choice", answer_options: ["53", "83", "63", "73"],
      prompt_semantics: null, comparison_semantics: null, correct_answer: "83",
      explanation: "…: 82.534 damage, which rounds to 83 for this question.", viewer_answer: "83",
      is_correct: true, combat_working: wire(), ...over,
    });
    const env = (revealed: boolean, r: unknown) => ({
      schema_version: "ranked_duel.match_review.v1", projection_type: "match_review", match_id: "m1",
      round_number: null, server_time: "2026-09-25T12:00:00+00:00",
      payload: { match_id: "m1", final_round_number: 1, round_count: 1, rounds: [{
        round_number: 1, kind: "mastery_slice", module_id: "mastery_slice", category: null,
        canonical_question_ref: null, revealed, icon_hint: { kind: "generic", key: null, icon: null },
        question: null, challenges: [r],
        viewer_submission: { answer_index: null, is_correct: null, correct_count: 1, answered_count: 1, challenge_count: 1 },
      }] },
    });
    const review = readMatchReview(env(true, row()));
    expect(review.rounds[0].masteryChallenges![0].combatWorking?.targetArmor.value).toBe(50.08);
    const malformed = readMatchReview(env(true, row({ combat_working: { contract: "combat_working.v1" } })));
    expect(malformed.rounds[0].masteryChallenges![0].combatWorking ?? null).toBeNull();
    expect(() => readMatchReview(env(false, row({ correct_answer: null, explanation: null }))))
      .toThrow(/not revealed/);
  });
});
