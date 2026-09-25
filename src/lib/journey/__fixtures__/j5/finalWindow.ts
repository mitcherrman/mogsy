/**
 * JOURNEY5 — HAND-DERIVED fixtures for the backend's journey5/release shape.
 *
 * NOT real captures. Every envelope below is DERIVED, by the explicit edits in
 * this file, from a REAL capture under `../j4/` (JOURNEY4 @ a273a216, see
 * `../j4/CAPTURE.md`). No capture file is modified; each function reads the
 * named real snapshot and applies only the J5 contract changes:
 *
 *   * the FINAL reveal window — after the last reached child settles, the
 *     server holds the block open one frozen reveal window (1750 ms):
 *     `own_finished: true`, `own_card_index/started_at/deadline: null`,
 *     `active_time_running: false`, `own_revealing_card_index: <last child>`,
 *     `own_reveal_until` set, and the last child's reveal in
 *     `own_challenge_reveals` (a TIMED-OUT child too: `player_answer: null`,
 *     `is_correct: false`);
 *   * `combat_working` on Combat reveals. Child 3 (index 2) of
 *     `pantheon.standard` is EXACTLY the backend's real example (Pantheon E →
 *     Leona, armor recalled: 83). Index 4's working is derived from that
 *     child's served premise in the same shape;
 *   * the Combat premise pair `["ability_component",
 *     "unempowered cast (no Mortal Will)"]` on Pantheon E's children.
 *
 * Source snapshots: `j4/pantheon.standard.json` › `child4-live` (Standard) and
 * `j4/pantheon.survival.json` › `child2-live` (Survival).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface DerivedSnapshot {
  label: string;
  at: string;
  derivedFrom: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  envelope: Record<string, any>;
}

const J4 = resolve(process.cwd(), "src/lib/journey/__fixtures__/j4");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snap = { label: string; at: string; envelope: Record<string, any> };
const real = (file: string, label: string): Snap => {
  const all = JSON.parse(readFileSync(join(J4, `${file}.json`), "utf8")) as Snap[];
  const s = all.find((x) => x.label === label);
  if (!s) throw new Error(`${file}: ${label}`);
  return structuredClone(s);
};

export const PANTHEON_COMPONENT = "unempowered cast (no Mortal Will)";

/** The backend's REAL example (journey5/release), verbatim: Pantheon E → Leona, armor recalled. */
export const PANTHEON_E_WORKING_RECALLED = {
  contract: "combat_working.v1", calculation: "physical_ability_damage", damage_type: "physical",
  attacker: { side: "player", champion: "Pantheon" }, target: { side: "opponent", champion: "Leona" },
  ability: { slot: "E", name: "Aegis Assault", rank: 1 },
  formula: { flat: 55, ratios: [
    { stat: "attack_damage", label: "attack damage", ratio: 1, value: 68.8675 },
    { stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 1.5, value: 0 }] },
  attacker_stats: { attack_damage: 68.8675, bonus_attack_damage: 0 },
  raw_damage: 123.8675,
  target_armor: { value: 50.08, source: "recalled", established_in_child: 0 },
  penetration: { lethality: 0, armor_pen_percent: 0, armor_pen_flat: 0 },
  effective_armor: 50.08, mitigation_multiplier: 0.6663, final_damage: 82.5343, answer: "83",
} as const;

/** DERIVED (same shape) from `pantheon.standard` child 5's served premise: armor stated. */
export const PANTHEON_E_WORKING_STATED = {
  contract: "combat_working.v1", calculation: "physical_ability_damage", damage_type: "physical",
  attacker: { side: "player", champion: "Pantheon" }, target: { side: "opponent", champion: "Leona" },
  ability: { slot: "E", name: "Aegis Assault", rank: 1 },
  formula: { flat: 55, ratios: [
    { stat: "attack_damage", label: "attack damage", ratio: 1, value: 81.4745 },
    { stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 1.5, value: 10 }] },
  attacker_stats: { attack_damage: 81.4745, bonus_attack_damage: 10 },
  raw_damage: 151.4745,
  target_armor: { value: 68.872, source: "stated" },
  penetration: { lethality: 0, armor_pen_percent: 0, armor_pen_flat: 0 },
  effective_armor: 68.872, mitigation_multiplier: 0.5922, final_damage: 89.6978, answer: "90",
} as const;

/** The backend's second REAL example (Zed E with lethality), attacker/target names from `zed.standard`. */
export const ZED_E_WORKING_LETHALITY = {
  contract: "combat_working.v1", calculation: "physical_ability_damage", damage_type: "physical",
  attacker: { side: "player", champion: "Zed" }, target: { side: "opponent", champion: "Ahri" },
  ability: { slot: "E", name: "Shadow Slash", rank: 1 },
  formula: { flat: 70, ratios: [
    { stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 0.7, value: 20 }] },
  attacker_stats: { bonus_attack_damage: 20 },
  raw_damage: 84,
  target_armor: { value: 27.195, source: "stated" },
  penetration: { lethality: 10, armor_pen_percent: 0, armor_pen_flat: 0 },
  effective_armor: 17.195, mitigation_multiplier: 0.8533, final_damage: 71.6754, answer: "72",
} as const;

const CHILD4_EXPLANATION = "Pantheon Aegis Assault (rank 1) ability physical damage after armor at Leona "
  + "target, 4 target level, Cloth Armor target items, 68.872 target armor, 4 attacker level, Long Sword "
  + "attacker items, 10 bonus attack damage, 81.4745 attack damage, 0 lethality, 0 armor penetration "
  + "percent: 89.698 damage, which rounds to 90 for this question.";

export type FinalOutcome = "correct" | "incorrect" | "timeout";

/** The answer each outcome submits on child 5 (options: 90 130 120 110; correct 90). */
const PICK: Record<FinalOutcome, string | null> = { correct: "90", incorrect: "110", timeout: null };

// The capture's own instant for child 5's settlement, and one frozen window after.
export const STANDARD_FINAL_AT = "2026-09-25T12:00:57.900000+00:00";
export const STANDARD_FINAL_UNTIL = "2026-09-25T12:00:59.650000+00:00";
/** The pool's frozen remainder at that instant (child 5 was open 8.5 s of 118 s). */
export const STANDARD_FINAL_REMAINING_MS = 109_500;

/**
 * Standard, `pantheon.standard`: child 5 (index 4) has just settled and the
 * server is holding the FINAL reveal window. Derived from `child4-live`.
 */
export function pantheonStandardFinalWindow(outcome: FinalOutcome = "correct"): DerivedSnapshot {
  const s = real("pantheon.standard", "child4-live");
  const env = s.envelope;
  env.server_time = STANDARD_FINAL_AT;
  const p = env.payload;
  const seg = p.segment_state;
  for (const i of [2, 3, 4]) {
    seg.challenges.challenges[i].prompt_semantics.scenario.push(["ability_component", PANTHEON_COMPONENT]);
  }
  const pick = PICK[outcome];
  Object.assign(seg, {
    own_next_challenge_index: 5,
    own_finished: true,
    own_card_index: null,
    own_card_started_at: null,
    own_card_deadline: null,
    active_time_running: false,
    active_time_remaining_ms: STANDARD_FINAL_REMAINING_MS,
    own_revealing_card_index: 4,
    own_reveal_until: STANDARD_FINAL_UNTIL,
  });
  seg.own_submitted_choices[4] = pick === null ? null : { selected: pick };
  seg.own_timed_out_challenges[4] = outcome === "timeout";
  seg.own_challenge_reveals[2].combat_working = structuredClone(PANTHEON_E_WORKING_RECALLED);
  seg.own_challenge_reveals.push({
    challenge_index: 4,
    player_answer: pick,
    is_correct: outcome === "correct",
    correct_answer: "90",
    explanation: CHILD4_EXPLANATION,
    answer_type: "single_choice",
    answer_options: ["90", "130", "120", "110"],
    correct_answer_display: null,
    combat_working: structuredClone(PANTHEON_E_WORKING_STATED),
  });
  Object.assign(p.segment, {
    card_started_at: null, card_deadline: null,
    timed_out_challenges: [...seg.own_timed_out_challenges],
    active_time_remaining_ms: STANDARD_FINAL_REMAINING_MS, active_time_running: false,
  });
  return { label: `child4-final-window-${outcome}`, at: STANDARD_FINAL_AT,
    derivedFrom: "j4/pantheon.standard.json#child4-live", envelope: env };
}

/** The SAME final-window snapshot, read after `own_reveal_until` (a stale read). */
export function pantheonStandardFinalWindowStale(): DerivedSnapshot {
  const s = pantheonStandardFinalWindow("correct");
  const at = "2026-09-25T12:01:00.400000+00:00";
  s.envelope.server_time = at;
  return { ...s, label: "child4-final-window-stale", at };
}

export const SURVIVAL_FINAL_AT = "2026-09-25T12:01:02.400000+00:00";
export const SURVIVAL_FINAL_UNTIL = "2026-09-25T12:01:04.150000+00:00";

/**
 * Survival, `pantheon.survival`: the Journey's LAST child (child 3, index 2)
 * has settled without a third strike, and the server holds the final reveal
 * window. Derived from `child2-live`. With `strikeOut`, that same answer is
 * strike 3 instead: NO final hold (`own_revealing_card_index` stays null) and
 * the ruleset's `own_stage_finished` flips at once.
 */
export function pantheonSurvivalFinalChild(opts: { strikeOut?: boolean } = {}): DerivedSnapshot {
  const s = real("pantheon.survival", "child2-live");
  const env = s.envelope;
  env.server_time = SURVIVAL_FINAL_AT;
  const p = env.payload;
  const seg = p.segment_state;
  const challenge = seg.challenges.challenges[2];
  // The capture's private answer for child 3 (`j4/answers/pantheon.survival.answers.json`).
  const correct = "75";
  const wrong = "65";
  Object.assign(seg, {
    own_next_challenge_index: 3,
    own_finished: true,
    own_card_index: null,
    own_card_started_at: null,
    own_card_deadline: null,
    own_revealing_card_index: opts.strikeOut ? null : 2,
    own_reveal_until: opts.strikeOut ? null : SURVIVAL_FINAL_UNTIL,
  });
  if (seg.active_time_running !== undefined && seg.active_time_running !== null) seg.active_time_running = false;
  seg.own_submitted_choices[2] = { selected: opts.strikeOut ? wrong : correct };
  seg.own_challenge_reveals.push({
    challenge_index: 2,
    player_answer: opts.strikeOut ? wrong : correct,
    is_correct: !opts.strikeOut,
    correct_answer: correct,
    explanation: "Pantheon Aegis Assault (rank 1) ability physical damage after armor at Leona target, "
      + "3 target level, Cloth Armor target items, 65.08 target armor, 3 attacker level, none attacker items, "
      + "0 bonus attack damage, 68.8675 attack damage, 0 lethality, 0 armor penetration percent: 75.035 "
      + "damage, which rounds to 75 for this question.",
    answer_type: "single_choice",
    answer_options: challenge.answer_options,
    correct_answer_display: null,
  });
  Object.assign(p.segment, { card_started_at: null, card_deadline: null });
  p.ruleset = {
    ruleset_id: "survival", version: 1, time_bank_ms: null, time_bank_remaining_ms: null,
    time_bank_draining: false, max_strikes: 3, strikes: opts.strikeOut ? 2 : 1, questions_settled: 5,
    stage_ended: false, ended_reason: null, live_strikes: opts.strikeOut ? 3 : 1,
    own_stage_finished: opts.strikeOut === true, as_of: SURVIVAL_FINAL_AT,
  };
  return { label: opts.strikeOut ? "child2-strike3" : "child2-final-window", at: SURVIVAL_FINAL_AT,
    derivedFrom: "j4/pantheon.survival.json#child2-live", envelope: env };
}

/**
 * Standard, `pantheon.standard`: child 3 (index 2, recalled armor) during its
 * ordinary mid-Journey reveal, with the backend's real `combat_working`
 * example on its reveal. Derived from `child2-reveal`.
 */
export function pantheonStandardChild3RevealWithWorking(): DerivedSnapshot {
  const s = real("pantheon.standard", "child2-reveal");
  const seg = s.envelope.payload.segment_state;
  seg.challenges.challenges[2].prompt_semantics.scenario.push(["ability_component", PANTHEON_COMPONENT]);
  seg.own_challenge_reveals[2].combat_working = structuredClone(PANTHEON_E_WORKING_RECALLED);
  return { label: "child2-reveal-working", at: s.at,
    derivedFrom: "j4/pantheon.standard.json#child2-reveal", envelope: s.envelope };
}
