/**
 * Combat Theater adapter — playback correctness and data provenance against
 * the committed real captures (`sim_1v1_trace_full.json`, Ashe vs Garen, and
 * `sim_2v2_calculation.json`, which carries Lux Q's formula bindings).
 *
 * Every expected number below is read from the fixture at test time, not
 * restated, so a re-captured fixture cannot drift from what the theater shows.
 */
import { describe, expect, it } from "vitest";

import {
  REAL_2V2_CALCULATION,
  REAL_TRACE_LEVELS,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import type { TeamSimEvent } from "@/lib/combat-lab/team-sim/contract";
import {
  beatIndexAt,
  buildTheaterScript,
  explainBeat,
  stateAfterBeat,
  stateAt,
  stepBeatIndex,
  tokenizeFormula,
  type MathStep,
} from "./theater";

const full = REAL_TRACE_LEVELS.full;
const calc = REAL_2V2_CALCULATION;

function actionRows(events: TeamSimEvent[]) {
  return events.filter((e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed"));
}

function primaryOf(e: TeamSimEvent) {
  const meta = e.meta as Record<string, unknown>;
  const acc = meta.damage_accounting as { by_scope: Record<string, { hp_before: number; hp_after: number; applied_hp_damage: number }> };
  return acc.by_scope.PRIMARY;
}

function step<T extends MathStep["id"]>(steps: MathStep[], id: T): Extract<MathStep, { id: T }> {
  const found = steps.find((s) => s.id === id);
  if (!found) throw new Error(`missing step ${id}`);
  return found as Extract<MathStep, { id: T }>;
}

describe("buildTheaterScript — Ashe vs Garen (sim_1v1_trace_full)", () => {
  const script = buildTheaterScript(full);

  it("places team A on the left and team B on the right with authoritative HP scales", () => {
    expect(script.left.map((c) => c.id)).toEqual(["A1"]);
    expect(script.right.map((c) => c.id)).toEqual(["B1"]);
    expect(script.left[0].champion).toBe("Ashe");
    expect(script.right[0].champion).toBe("Garen");
    // Bar scale is max_hp, initial fill is starting_hp (prep handoff H5).
    expect(script.left[0].startingHp).toBe(full.effective_builds.A1.starting_hp);
    expect(script.left[0].maxHp).toBe(full.effective_builds.A1.max_hp);
    expect(script.right[0].maxHp).toBe(full.effective_builds.B1.max_hp);
    expect(script.right[0].deathTime).toBe(full.combatant_summaries.B1.death_time);
  });

  it("emits one beat per scheduler action, in seq order, at the event's own time", () => {
    const rows = actionRows(full.events);
    expect(script.beats).toHaveLength(rows.length);
    script.beats.forEach((beat, i) => {
      expect(beat.seq).toBe(rows[i].seq);
      expect(beat.time).toBe(rows[i].time);
      expect(beat.actorId).toBe(rows[i].actor_id);
      expect(beat.index).toBe(i);
    });
    expect(script.beats.every((b) => b.kind === "basic_attack")).toBe(true);
    expect(script.duration).toBeCloseTo(full.duration, 9);
  });

  it("reads each beat's HP transition straight from damage_accounting (never subtracts)", () => {
    const rows = actionRows(full.events);
    script.beats.forEach((beat, i) => {
      const primary = primaryOf(rows[i]);
      expect(beat.hp).toEqual({
        targetId: rows[i].target_id,
        before: primary.hp_before,
        after: primary.hp_after,
        applied: primary.applied_hp_damage,
      });
    });
  });

  it("marks the killing blow from the death event's cause_action_seq and confirms the victim", () => {
    const death = full.events.find((e) => e.type === "death")!;
    const killing = script.beats.filter((b) => b.killingBlow);
    expect(killing).toHaveLength(1);
    expect(killing[0].seq).toBe((death.meta as Record<string, unknown>).cause_action_seq);
    expect(killing[0].killedId).toBe("B1");
    expect(script.deaths[0].time).toBe(full.combatant_summaries.B1.death_time);
  });

  it("carries each damage packet's reported magnitudes, including the overkill on the last hit", () => {
    const last = script.beats[script.beats.length - 1];
    const packet = full.events.find((e) => e.type === "damage_packet" && e.seq === last.seq + 1)!;
    const payload = packet.payload as Record<string, number>;
    expect(last.hits[0].seq).toBe(packet.seq);
    expect(last.hits[0].finalDamage).toBe(payload.final_damage);
    expect(last.hits[0].rawDamage).toBe(payload.raw_damage);
    expect(last.hits[0].finalDamage!).toBeGreaterThan(last.hp!.applied);
  });
});

describe("deterministic state reconstruction", () => {
  const script = buildTheaterScript(full);
  const rows = actionRows(full.events);

  it("starts both champions at starting_hp before the first beat", () => {
    const s = stateAfterBeat(script, -1);
    expect(s.beatIndex).toBe(-1);
    expect(s.combatants.A1.hp).toBe(full.effective_builds.A1.starting_hp);
    expect(s.combatants.B1.hp).toBe(full.effective_builds.B1.starting_hp);
    expect(s.combatants.A1.hpSource).toEqual({ kind: "starting_hp" });
    expect(s.combatants.B1.alive).toBe(true);
  });

  it("after beat k, every combatant's HP is the hp_after of the last beat that hit it", () => {
    for (let k = 0; k < script.beats.length; k++) {
      const s = stateAfterBeat(script, k);
      const expected: Record<string, number> = {
        A1: full.effective_builds.A1.starting_hp,
        B1: full.effective_builds.B1.starting_hp,
      };
      for (let i = 0; i <= k; i++) expected[rows[i].target_id as string] = primaryOf(rows[i]).hp_after;
      expect(s.combatants.A1.hp).toBe(expected.A1);
      expect(s.combatants.B1.hp).toBe(expected.B1);
    }
  });

  it("maps a clock instant to the last beat at or before it", () => {
    expect(beatIndexAt(script, -0.001)).toBe(-1);
    expect(beatIndexAt(script, 0)).toBe(0);
    rows.forEach((row, i) => {
      expect(beatIndexAt(script, row.time)).toBe(i);
      expect(beatIndexAt(script, row.time - 1e-6)).toBe(i - 1);
    });
    expect(beatIndexAt(script, full.duration)).toBe(rows.length - 1);
  });

  it("scrubbing backward reconstructs the exact earlier state (pure function of time)", () => {
    const forward = [0.5, 2.4, 5.0, 7.2].map((t) => stateAt(script, t));
    const backward = [7.2, 5.0, 2.4, 0.5].map((t) => stateAt(script, t)).reverse();
    expect(backward).toEqual(forward);
    // Concretely: Garen is at the seq-10 hp_after between 2.388 s and 4.776 s
    // whichever direction the scrubber arrived from.
    const seq10 = rows.find((r) => r.seq === 10)!;
    expect(stateAt(script, 3.0).combatants.B1.hp).toBe(primaryOf(seq10).hp_after);
    expect(stateAt(script, 3.0).combatants.B1.hpSource).toEqual({ kind: "hp_after", seq: 10 });
  });

  it("marks the victim dead exactly from the killing beat onward", () => {
    const deathTime = full.combatant_summaries.B1.death_time as number;
    expect(stateAt(script, deathTime - 1e-6).combatants.B1.alive).toBe(true);
    expect(stateAt(script, deathTime).combatants.B1.alive).toBe(false);
    expect(stateAt(script, deathTime).combatants.B1.hp).toBe(0);
    expect(stateAt(script, full.duration).combatants.A1.hp).toBe(full.combatant_summaries.A1.final_hp);
  });

  it("steps clamp at both ends, with -1 as the pre-fight state", () => {
    expect(stepBeatIndex(script, 0, -1)).toBe(-1);
    expect(stepBeatIndex(script, -1, -1)).toBe(-1);
    expect(stepBeatIndex(script, -1, 1)).toBe(0);
    expect(stepBeatIndex(script, script.beats.length - 1, 1)).toBe(script.beats.length - 1);
    expect(stepBeatIndex(script, 2, 1)).toBe(3);
  });
});

describe("same-instant beats (sim_2v2_calculation)", () => {
  const script = buildTheaterScript(calc);

  it("keeps every t = 0 action as its own beat and applies them in seq order", () => {
    const atZero = script.beats.filter((b) => b.time === 0);
    expect(atZero.length).toBeGreaterThan(1);
    expect(beatIndexAt(script, 0)).toBe(atZero.length - 1);
    // Stepping through the t = 0 run one beat at a time changes state each step.
    const hpAfterEach = atZero.map((b) => stateAfterBeat(script, b.index).combatants[b.hp!.targetId].hp);
    atZero.forEach((b, i) => expect(hpAfterEach[i]).toBe(b.hp!.after));
  });

  it("identifies Lux Q as a formula-priced ability beat", () => {
    const luxQ = script.beats.find((b) => b.actorId === "A2" && b.actionId === "Q")!;
    expect(luxQ.kind).toBe("ability");
    expect(luxQ.slot).toBe("Q");
    expect(luxQ.damageType).toBe("magic");
  });
});

describe("explainBeat — Lux Q (authoritative formula substitution)", () => {
  const script = buildTheaterScript(calc);
  const luxQ = script.beats.find((b) => b.actorId === "A2" && b.actionId === "Q")!;
  const abilityEvent = calc.events.find((e) => e.seq === luxQ.seq + 1 && e.type === "champion_ability")!;
  const payload = abilityEvent.payload as Record<string, unknown>;
  const metadata = payload.metadata as Record<string, unknown>;
  const explanation = explainBeat(script, luxQ);

  it("renders the seven steps in order", () => {
    expect(explanation.steps.map((s) => s.id)).toEqual([
      "identity",
      "formula",
      "substitution",
      "mitigation",
      "shield",
      "final",
      "hp",
    ]);
  });

  it("identifies the ability from the kernel payload", () => {
    const identity = step(explanation.steps, "identity");
    expect(identity.ability).toBe(payload.source);
    expect(identity.state).toBe(payload.state);
    expect(identity.damageType).toBe("magic");
  });

  it("shows formula_text verbatim — decimal comma preserved, never parsed", () => {
    const formula = step(explanation.steps, "formula");
    expect(formula.status).toBe("ok");
    expect(formula.formulaText).toBe(metadata.formula_text);
    expect(formula.formulaText).toContain("0,75 * AP");
    expect(formula.bindings).toEqual(
      Object.entries(metadata.formula_bindings as Record<string, number>).map(([name, value]) => ({ name, value }))
    );
    expect(formula.rank).toBe(metadata.generic_rank);
  });

  it("substitutes only bound identifiers and takes the result from raw_damage", () => {
    const sub = step(explanation.steps, "substitution");
    const identifiers = sub.tokens.filter((t) => t.kind === "identifier");
    expect(identifiers.map((t) => t.kind === "identifier" && t.name)).toEqual(["P_Q", "AP", "MOD_Magic"]);
    expect(sub.tokens.map((t) => t.text).join("")).toBe(metadata.formula_text);
    expect(sub.result).toEqual({ value: payload.raw_damage, field: "payload.raw_damage" });
    expect(sub.result!.value).toBe(240);
  });

  it("reports mitigation from the effective magic resist and post-mitigation fields", () => {
    const mit = step(explanation.steps, "mitigation");
    expect(mit.status).toBe("ok");
    expect(mit.before).toEqual({ value: metadata.raw_damage_before_pipeline, field: "payload.metadata.raw_damage_before_pipeline" });
    expect(mit.resistance).toEqual({ kind: "magic_resist", value: metadata.effective_magic_resist, field: "payload.metadata.effective_magic_resist" });
    expect(mit.after).toEqual({ value: metadata.post_mitigation_damage, field: "payload.metadata.post_mitigation_damage" });
    expect(mit.modifiers.map((m) => m.value.value)).toEqual([
      metadata.post_outgoing_amp_damage,
      metadata.post_amp_damage,
      metadata.target_damage_after_reduction,
    ]);
  });

  it("reports the (zero) shield trio instead of hiding it", () => {
    const shield = step(explanation.steps, "shield");
    expect(shield.status).toBe("ok");
    expect(shield.before?.value).toBe(0);
    expect(shield.absorbed?.value).toBe(0);
    expect(shield.after?.value).toBe(0);
    expect(shield.note).toMatch(/No shield/);
  });

  it("closes with final damage and the authoritative HP before/after", () => {
    const fin = step(explanation.steps, "final");
    expect(fin.finalDamage?.value).toBe(payload.final_damage);
    expect(fin.appliedHpDamage?.value).toBe(metadata.applied_hp_damage);
    expect(fin.overkill).toBeNull();
    const hp = step(explanation.steps, "hp");
    const primary = primaryOf(calc.events.find((e) => e.seq === luxQ.seq)!);
    expect(hp.before?.value).toBe(primary.hp_before);
    expect(hp.after?.value).toBe(primary.hp_after);
    expect(hp.maxHp).toEqual({ value: calc.effective_builds.B2.max_hp, field: "effective_builds.B2.max_hp" });
    expect(explanation.limitations).toEqual([
      "Penetration and lethality inputs are not on the wire; only the effective resistance is reported.",
    ]);
  });
});

describe("explainBeat — basic attack (limitations instead of fabricated values)", () => {
  const script = buildTheaterScript(full);
  const first = script.beats[0];
  const packet = full.events.find((e) => e.seq === first.seq + 1 && e.type === "damage_packet")!;
  const payload = packet.payload as Record<string, unknown>;
  const metadata = payload.metadata as Record<string, unknown>;
  const explanation = explainBeat(script, first);

  it("declares the formula unavailable rather than inventing one", () => {
    const formula = step(explanation.steps, "formula");
    expect(formula.status).toBe("limited");
    expect(formula.formulaText).toBeNull();
    expect(explanation.limitations).toContain("No formula text or bindings exist for basic attacks.");
  });

  it("lists the engine's reported attack-model inputs as reported inputs, not a formula", () => {
    const sub = step(explanation.steps, "substitution");
    expect(sub.tokens).toEqual([]);
    const model = metadata.ashe_attack_model as Record<string, unknown>;
    expect(sub.reportedInputs.find((i) => i.name === "ad")?.value).toBe(model.ad);
    expect(sub.reportedInputs.find((i) => i.name === "frost_multiplier")?.value).toBe(model.frost_multiplier);
    expect(sub.result?.value).toBe(payload.raw_damage);
  });

  it("uses payload.raw_damage as the pre-mitigation figure and flags the H1 labeling hazard", () => {
    const mit = step(explanation.steps, "mitigation");
    expect(mit.status).toBe("ok");
    expect(metadata.raw_damage_before_pipeline).toBe(payload.final_damage); // the hazard, as captured
    expect(mit.before).toEqual({ value: payload.raw_damage, field: "payload.raw_damage" });
    expect(mit.resistance).toEqual({ kind: "armor", value: metadata.effective_armor, field: "payload.metadata.effective_armor" });
    expect(mit.after?.value).toBe(metadata.post_mitigation_damage);
    expect(mit.note).toMatch(/labeling hazard/);
  });

  it("surfaces the overkill on the killing blow", () => {
    const last = script.beats[script.beats.length - 1];
    const fin = step(explainBeat(script, last).steps, "final");
    // The accounting's applied_hp_damage (what left the pool) is the authority,
    // not the packet's unclamped metadata.applied_hp_damage.
    expect(fin.appliedHpDamage).toEqual({
      value: last.hp!.applied,
      field: "meta.damage_accounting.by_scope.PRIMARY.applied_hp_damage",
    });
    expect(fin.overkill).toBeCloseTo(fin.finalDamage!.value - last.hp!.applied, 9);
    expect(fin.overkill!).toBeGreaterThan(0);
    expect(fin.note).toMatch(/exceeded/);
    expect(fin.note).toMatch(/unclamped/);
  });
});

describe("tokenizeFormula", () => {
  it("matches whole identifiers only and leaves everything else verbatim", () => {
    const tokens = tokenizeFormula("(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic + APX", { P_Q: 5, AP: 0, MOD_Magic: 1 });
    expect(tokens.map((t) => t.text).join("")).toBe("(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic + APX");
    expect(tokens.filter((t) => t.kind === "identifier").map((t) => t.text)).toEqual(["P_Q", "AP", "MOD_Magic"]);
  });

  it("returns a single text token when there are no bindings", () => {
    expect(tokenizeFormula("40 * AP", {})).toEqual([{ kind: "text", text: "40 * AP" }]);
  });
});
