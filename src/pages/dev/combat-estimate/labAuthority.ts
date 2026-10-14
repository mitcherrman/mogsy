/**
 * CE1 — the lab's STAND-IN SERVER for Combat Estimate rounds. DEVELOPMENT ONLY.
 *
 * It plays the part the backend will play: it reads the frozen authority
 * capture (every number the certified seam produced, with its provenance),
 * issues a round whose public content carries no answer, keeps the authority's
 * result in a secret the primitive never receives, and grades a response into
 * an `EstimateReveal` plus the authority's own working. Nothing here is
 * imported by the primitive, and the source test pins that.
 *
 * It also carries ONE SYNTHETIC round, unmistakably labelled, so the lab can
 * show what a visual-only fixture looks like beside the certified ones. Its
 * numbers are invented; it has no working; it is never served unless asked
 * for by id.
 */
import capture from "@/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json";
import {
  readCombatAuthorityCapture, splitScenario,
  type CapturedScenario, type CombatEstimateScenario, type CombatEstimateSecret,
} from "@/lib/combat-estimate/contract";
// NUM-REC2: the capture-free pieces (prompt, content, reveal formatting) moved
// to rounds.ts so the owner lab can build identical rounds without the capture.
import { contentFor, promptFor, revealFor, type RoundGrade } from "@/lib/combat-estimate/rounds";
import type { EstimatePublic, EstimateResponse, EstimateReveal } from "@/lib/interaction-grammar/types";

export const COMBAT_CAPTURE = readCombatAuthorityCapture(capture);

export const SYNTHETIC_ROUND_ID = "synthetic-demo";

export interface LabSecret {
  secret: CombatEstimateSecret | null;
  /** The synthetic round's invented answer; null for a certified round. */
  synthetic: { whole: number } | null;
}

export interface LabRound {
  id: string;
  content: EstimatePublic;
  scenario: CombatEstimateScenario;
  secret: LabSecret;
}

export type LabGrade = RoundGrade;
export { promptFor };

export function findCaptured(id: string): CapturedScenario | null {
  return COMBAT_CAPTURE.scenarios.find((s) => s.id === id) ?? null;
}

export function buildLabRound(captured: CapturedScenario): LabRound {
  const { scenario, secret } = splitScenario(captured, COMBAT_CAPTURE.backend.commit);
  const content = contentFor(scenario, COMBAT_CAPTURE.authorities.implementation as string);
  return { id: scenario.id, content, scenario, secret: { secret, synthetic: null } };
}

/** The one visual-only round. Its numbers are made up and say so everywhere. */
export function buildSyntheticRound(): LabRound {
  const scenario: CombatEstimateScenario = {
    id: SYNTHETIC_ROUND_ID, metric: "post_mitigation", difficulty: "middle",
    attacker: { champion: "Garen", level: 9, items: [{ name: "Long Sword" }], attackDamage: 111, bonusAttackDamage: 10, abilityPower: 0 },
    ability: { slot: "Q", name: "Decisive Strike", rank: 3, maxRank: 5, component: null },
    target: { champion: "Darius", level: 9, items: [], armor: 60 },
    penetration: { lethality: 0, armorPenFlat: 0, armorPenPercent: 0 },
    scale: { max: 500, coarseStep: 50, figureEvery: 100 },
    definition: "SYNTHETIC: invented numbers for layout only. Not a combat calculation.",
    assumptions: ["This round is a visual stand-in. Nothing here was calculated by the combat authority."],
    certification: { kind: "certified", label: "", backendCommit: "" },
  };
  const content: EstimatePublic = {
    prompt: promptFor(scenario),
    measureLabel: "Combat Estimate · Final damage",
    unitLabel: "damage",
    definition: scenario.definition,
    scale: scenario.scale,
    certification: { kind: "synthetic", label: "SYNTHETIC — not certified" },
    footnote: "Synthetic round: invented numbers, no authority, no working.",
  };
  return { id: SYNTHETIC_ROUND_ID, content, scenario, secret: { secret: null, synthetic: { whole: 123 } } };
}

/** The server's grader. The reveal carries the host's verdict and errors; the working is the authority's. */
export function gradeLabRound(round: LabRound, response: EstimateResponse): LabGrade {
  if (!Number.isInteger(response.estimate) || response.estimate < 0 || response.estimate >= round.content.scale.max) {
    throw new Error("lab: response names a value this round's beam cannot hold");
  }
  if (round.secret.secret) {
    return revealFor(round.scenario, round.secret.secret, response.estimate, COMBAT_CAPTURE.backend.commit);
  }
  const whole = round.secret.synthetic?.whole ?? 0;
  const signed = response.estimate - whole;
  const verdict: EstimateReveal["verdict"] = signed === 0 ? "exact" : signed < 0 ? "under" : "over";
  return {
    reveal: {
      lockedValue: response.estimate,
      truth: { value: whole, valueText: String(whole), exactText: null, label: "Synthetic value" },
      verdict,
      error: { signed, signedText: signed > 0 ? `+${signed}` : signed < 0 ? `−${Math.abs(signed)}` : "0", absolute: Math.abs(signed),
        absoluteText: String(Math.abs(signed)), relative: Math.abs(signed) / whole, relativeText: verdict === "exact" ? "Exact" : `${Math.round((Math.abs(signed) / whole) * 100)}% ${verdict}` },
      closeness: null,
      note: "SYNTHETIC — this number was invented for layout.",
      source: { label: "No authority" },
    },
    working: null,
    sourceLine: "SYNTHETIC — no combat authority, no working.",
  };
}

/** A deterministic 32-bit hash (FNV-1a) for a seeded round order. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** A deterministic order through the certified pool for a seed. */
export function roundOrder(seed: string): CapturedScenario[] {
  return [...COMBAT_CAPTURE.scenarios].sort((a, b) => fnv(`${seed}:${a.id}`) - fnv(`${seed}:${b.id}`));
}
