/**
 * JP5 — the data layer behind the Reasoning Chain's three moments (the DOM is
 * `masterySliceModule.jp5.test.tsx`), on the REAL captures:
 *
 *   * the generic prerequisite join — `learner.relies_on` → `learner.established`
 *     → the establishing child's reveal display — with no contract change;
 *   * no current-answer leakage: a prerequisite is never the open child's fact;
 *   * a fact is reusable after its reveal whatever the verdict (right, wrong,
 *     timed out);
 *   * the live chain, the expanded derivation, the magnitude, and the unfold's
 *     division of the SERVER's reveal window;
 *   * nothing inferred: a child that publishes no `relies_on` (ability haste,
 *     cooldown comparison) has no prerequisites and no live chain.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ3, type JourneyChildContext, type JourneyPrerequisite } from "./adapter";
import type { CombatWorking } from "./combatWorking";
import type { CaptureSnapshot } from "./realFixtures";
import {
  approxTenths, approxWhole, combatReasoning, liveReasoning, reductionPercent, unfoldCompressAtMs, unfolds,
  UNFOLD_COMPRESS_AT_MS, UNFOLD_MIN_COMPRESSED_MS,
} from "./reasoning";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (name: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8"));
const REF = "jref/zed_ahri.reference";
const WRONG = "jref/zed_ahri.reference.wrong";
const TIMEOUT = "jref/zed_ahri.reference.timeout";
const PANTHEON = "m1/pantheon.standard";
const VOLI = "m1/voli.standard";
const AHRI_SURVIVAL = "m1/ahri.survival";

/** The production path: parsed segment → adapter, with the segment's own reveals. */
function children(s: CaptureSnapshot): JourneyChildContext[] {
  const seg = readPublicRound(s.envelope).segmentState;
  if (!seg?.journey) return [];
  const view = adaptJourneyJ3(seg.journey, {
    ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
  }, seg.ownChallengeReveals);
  return view?.children ?? [];
}
const at = (name: string, label: string) => {
  const s = load(name).find((x) => x.label === label);
  if (!s) throw new Error(`${name}: ${label}`);
  return s;
};
const childAt = (name: string, label: string, index: number) => children(at(name, label))[index];
const brief = (p: JourneyPrerequisite) => [p.what, p.kind, p.source, p.establishedInChild, p.display, p.value];

describe("the prerequisite join: relies_on → established → the reveal's display", () => {
  it("Zed/Ahri Step 4 LIVE: the raw damage (Step 2) and Ahri's armor (Step 3), as the learner was shown them", () => {
    const step4 = childAt(REF, "child3-live", 3);
    expect(step4.prerequisites!.map(brief)).toEqual([
      ["raw_damage", "ability_raw_damage", "revealed", 1, "85", 84.56],
      ["target_armor", "champion_stat_at_level", "revealed", 2, "24", 24.024],
    ]);
    // Whose fact each is comes from the child's own recall and the K1 context.
    expect(step4.prerequisites![0]).toMatchObject({ champion: "Zed", slot: "E" });
    expect(step4.prerequisites![1]).toMatchObject({ champion: "Ahri", stat: "armor", level: 2, slot: null });
  });

  it("is already complete when the child OPENS, before any answer (no client state, no later payload)", () => {
    for (const label of ["child3-open", "child3-live"]) {
      expect(childAt(REF, label, 3).prerequisites!.map((p) => p.display), label).toEqual(["85", "24"]);
    }
  });

  it("the display is the REVEAL's text; the ledger's canonical number is kept apart and never rounded for it", () => {
    const [raw, armor] = childAt(REF, "child3-live", 3).prerequisites!;
    expect([raw.display, raw.value]).toEqual(["85", 84.56]);
    expect([armor.display, armor.value]).toEqual(["24", 24.024]);
    // Without the segment's reveals the join still names the facts, with no display to show.
    const seg = readPublicRound(at(REF, "child3-live").envelope).segmentState!;
    const bare = adaptJourneyJ3(seg.journey!, {
      ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
    })!.children[3];
    expect(bare.prerequisites!.map((p) => [p.what, p.display])).toEqual([["raw_damage", null], ["target_armor", null]]);
    expect(liveReasoning(bare.prerequisites!, bare.asks)).toBeNull();
  });

  it("generic: the same join resurfaces Leona's learned armor in Pantheon's Step 3 (a Daily Journey)", () => {
    const step3 = childAt(PANTHEON, "child2-live", 2);
    expect(step3.prerequisites!.map(brief)).toEqual([["target_armor", "champion_stat_at_level", "revealed", 0, "50", 50.08]]);
    expect(step3.prerequisites![0]).toMatchObject({ champion: "Leona", stat: "armor", level: 3 });
  });

  it("a STATED formula is joined too, but has no reveal and so no display (it is on the card that states it)", () => {
    const step4 = childAt(PANTHEON, "child3-live", 3);
    expect(step4.prerequisites!.map((p) => [p.what, p.kind, p.source, p.display])).toEqual([
      ["ability_damage", "ability_damage_formula", "stated", null]]);
    expect(typeof step4.prerequisites![0].value).toBe("object");
  });

  it("NOTHING IS INFERRED: a child that publishes no relies_on has no prerequisites, whatever its ledger holds", () => {
    // Volibear's ability-haste child: the base cooldown IS in its ledger (learned
    // at Step 1), but the server declares no dependency on it.
    const seg = readPublicRound(at(VOLI, "child2-live").envelope).segmentState!;
    const haste = seg.journey!.children[2];
    expect(haste.asks.family).toBe("combat_cooldown");
    expect(haste.learner.established.map((e) => e.kind)).toContain("ability_cooldown");
    expect(haste.learner.reliesOn).toEqual([]);
    expect(childAt(VOLI, "child2-live", 2).prerequisites).toEqual([]);
    // Its cooldown-comparison child, and Ahri's Survival haste child, likewise.
    expect(childAt(VOLI, "child4-live", 4).prerequisites).toEqual([]);
    expect(childAt(AHRI_SURVIVAL, "child2-live", 2).prerequisites).toEqual([]);
    expect(childAt(PANTHEON, "child1-live", 1).prerequisites).toEqual([]);
  });
});

describe("no current-answer leakage", () => {
  const ANSWERS = (name: string): { index: number; correct_answer: string }[] => {
    const [dir, file] = name.split("/");
    return JSON.parse(readFileSync(join(FIX, dir, "answers", `${file}.answers.json`), "utf8"));
  };

  it("a prerequisite is always an EARLIER child's fact, never the fact the open child asks", () => {
    for (const name of [REF, WRONG, TIMEOUT, PANTHEON, VOLI, AHRI_SURVIVAL]) {
      for (const s of load(name)) {
        const seg = readPublicRound(s.envelope).segmentState;
        if (!seg?.journey) continue;
        for (const c of children(s)) {
          const wire = seg.journey.children[c.index];
          for (const p of c.prerequisites ?? []) {
            expect(p.establishedInChild, `${name} ${s.label} child ${c.index}`).toBeLessThan(c.index);
            expect(p.fact).not.toBe(wire.learner.asksFact?.fact ?? "");
          }
        }
      }
    }
  });

  it("while a child is open, its own answer is not in its ledger, its prerequisites, or its live chain", () => {
    for (const name of [REF, WRONG, TIMEOUT]) {
      const answers = ANSWERS(name);
      for (const s of load(name)) {
        const seg = readPublicRound(s.envelope).segmentState;
        if (!seg?.journey || seg.ownCardIndex === null) continue;
        const open = seg.ownCardIndex;
        const c = children(s)[open];
        if (!c) continue;                                   // its beat: not published yet
        expect(seg.ownChallengeReveals.some((r) => r.challengeIndex === open), `${name} ${s.label}`).toBe(false);
        // Every displayed prerequisite is an earlier child's own revealed answer.
        for (const p of c.prerequisites!) {
          if (p.display !== null) expect(p.display).toBe(answers[p.establishedInChild].correct_answer);
        }
        const live = liveReasoning(c.prerequisites!, c.asks);
        if (live) {
          expect(live.nodes.at(-1)).toMatchObject({ asked: true, value: "?" });
          expect(live.nodes.filter((n) => !n.asked).map((n) => n.value))
            .toEqual(c.prerequisites!.filter((p) => p.display !== null).map((p) => p.display));
        }
      }
    }
    // Step 4 specifically: 68 (and its exact 68.18) is nowhere in what the chain is built from.
    const step4 = childAt(REF, "child3-live", 3);
    expect(JSON.stringify([step4.prerequisites, liveReasoning(step4.prerequisites!, step4.asks)])).not.toMatch(/68/);
  });

  it("fails closed: a relied fact that is not an earlier child's, or is the asked fact, is dropped", () => {
    const seg = readPublicRound(at(REF, "child3-live").envelope).segmentState!;
    const cursor = { ownNextChallengeIndex: 3, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: false };
    const j = JSON.parse(JSON.stringify(seg.journey)) as NonNullable<typeof seg.journey>;
    const c3 = j.children[3];
    c3.learner.established[1].child = 3;                                     // "established" by the open child itself
    c3.learner.asksFact = { fact: c3.learner.established[2].fact, kind: "x", child: 3, object: null, context: {}, unit: null };
    c3.learner.reliesOn.push({ fact: "not:in:the:ledger", what: "raw_damage", source: "revealed", establishedInChild: 0 });
    expect(adaptJourneyJ3(j, cursor, seg.ownChallengeReveals)!.children[3].prerequisites).toEqual([]);
  });
});

describe("correct, wrong and timed out establish the SAME reusable fact", () => {
  it("Step 4's prerequisites are identical on all three paths (Step 3 answered right, wrong — and a timeout later)", () => {
    const of = (name: string) => childAt(name, "child3-live", 3).prerequisites!.map(brief);
    expect(of(WRONG)).toEqual(of(REF));
    expect(of(TIMEOUT)).toEqual(of(REF));
    // …and the wrong path really did answer Steps 1 and 3 wrong.
    const reveals = readPublicRound(at(WRONG, "child3-live").envelope).segmentState!.ownChallengeReveals;
    expect(reveals.map((r) => r.isCorrect)).toEqual([false, true, false]);
  });

  it("a child that TIMED OUT still ends with the same chain: nothing of the join reads a verdict", () => {
    const step4 = childAt(TIMEOUT, "child3-timeout-reveal", 3);
    expect(step4.prerequisites!.map((p) => p.display)).toEqual(["85", "24"]);
    const src = readFileSync(resolve(process.cwd(), "src/lib/journey/adapter.ts"), "utf8");
    expect(src).not.toMatch(/isCorrect|is_correct|playerAnswer|player_answer/);
  });
});

describe("the chain's three moments (builders)", () => {
  const working = (over: Partial<CombatWorking> = {}): CombatWorking => ({
    contract: "combat_working.v1", calculation: "physical_ability_damage", damageType: "physical",
    attacker: { side: "player", champion: "Zed" }, target: { side: "opponent", champion: "Ahri" },
    ability: { slot: "E", name: "Shadow Slash", rank: 1 },
    formula: { flat: 70, ratios: [{ stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 0.7, value: 20.8 }] },
    attackerStats: { bonus_attack_damage: 20.8 }, rawDamage: 84.56,
    targetArmor: { value: 24.024, source: "recalled", establishedInChild: 2 },
    penetration: { lethality: 0, armorPenPercent: 0, armorPenFlat: 0 },
    effectiveArmor: 24.024, mitigationMultiplier: 0.8063, finalDamage: 68.1804, answer: "68", ...over,
  });

  it("LIVE Step 4: 85 Raw damage → 24 Ahri armor → ? Final damage", () => {
    const c = childAt(REF, "child3-live", 3);
    const live = liveReasoning(c.prerequisites!, c.asks)!;
    expect(live.kind).toBe("live");
    expect(live.nodes.map((n) => [n.op ?? null, n.value, n.label, n.icon?.kind ?? null])).toEqual([
      [null, "85", "Raw damage", "ability"], ["→", "24", "Ahri armor", "stat"], ["→", "?", "Final damage", "ability"]]);
    expect(live.nodes.map((n) => [!!n.given, !!n.asked])).toEqual([[true, false], [true, false], [false, true]]);
    expect(live.exact).toBeNull();
  });

  it("LIVE Pantheon Step 3: 50 Leona armor → ? Final damage (the raw damage is not a learned fact there)", () => {
    const c = childAt(PANTHEON, "child2-live", 2);
    expect(liveReasoning(c.prerequisites!, c.asks)!.nodes.map((n) => [n.value, n.label])).toEqual([
      ["50", "Leona armor"], ["?", "Final damage"]]);
  });

  it("no live chain where there is no compact learned value: a formula, a stated premise, no dependency at all", () => {
    const none = (name: string, label: string, i: number) => {
      const c = childAt(name, label, i);
      return liveReasoning(c.prerequisites!, c.asks);
    };
    expect(none(REF, "child1-live", 1)).toBeNull();           // Step 2 relies on the FORMULA (owner: no live chain)
    expect(none(REF, "child0-live", 0)).toBeNull();
    expect(none(REF, "child2-live", 2)).toBeNull();
    expect(none(PANTHEON, "child3-live", 3)).toBeNull();      // a stated formula
    expect(none(VOLI, "child2-live", 2)).toBeNull();          // ability haste: no served dependency
    expect(none(VOLI, "child4-live", 4)).toBeNull();          // cooldown comparison
  });

  it("EXPANDED: the whole derivation; the fraction and the decimal are its detail, the share is what they fold into", () => {
    const r = combatReasoning(working(), true);
    expect(unfolds(r)).toBe(true);
    expect(r.nodes.map((n) => n.key)).toEqual(["raw", "armor", "armor-formula", "decimal", "multiplier", "final"]);
    expect(r.nodes.filter((n) => n.detail).map((n) => n.key)).toEqual(["armor-formula", "decimal"]);
    expect(r.nodes.filter((n) => n.transform).map((n) => n.key)).toEqual(["multiplier"]);
    // What Steps 2 and 3 established is `given` (on screen before the reveal).
    expect(r.nodes.filter((n) => n.given).map((n) => n.key)).toEqual(["raw", "armor"]);
    // COMPRESSED is the same list without its detail.
    expect(r.nodes.filter((n) => !n.detail).map((n) => [n.value, n.label])).toEqual([
      ["85", "Raw damage"], ["24", "Ahri armor"], ["19.4%", "Reduced"], ["68", "Final damage"]]);
  });

  it("never implies 85 × 0.806 = 68: arrows only; the exact working is 84.56 × 0.8063 ≈ 68.1804, apart", () => {
    const r = combatReasoning(working(), true);
    expect(r.nodes.map((n) => n.op ?? null)).toEqual([null, "→", "→", "→", "→", "→"]);
    expect(r.exact).toContain("84.56 × 0.8063 ≈ 68.1804");
    expect(r.exact).toContain("Shown as 68 · rounded for display");
    expect(JSON.stringify(r.nodes)).not.toMatch(/[×=]/);
  });

  it("the magnitude's ratio is the SERVED multiplier — not final ÷ raw, not the displayed numbers", () => {
    expect(combatReasoning(working(), true).magnitude).toEqual({
      ratio: 0.8063, from: "85", to: "68", fromLabel: "raw", toLabel: "final",
      percent: "19.4%", kept: "reduced", delta: "≈16 less" });
    // A working whose multiplier disagrees with its own rounded numbers: the bar follows the multiplier.
    const odd = combatReasoning(working({ mitigationMultiplier: 0.5, answer: "68" }), true);
    expect(odd.magnitude!.ratio).toBe(0.5);
    expect(odd.magnitude!.ratio).not.toBeCloseTo(68 / 85, 3);
    // Not a reduction (negative effective armor amplifies): no bar.
    expect(combatReasoning(working({ effectiveArmor: -10, mitigationMultiplier: 1.0909 }), true).magnitude).toBeNull();
    const src = readFileSync(resolve(process.cwd(), "src/lib/journey/reasoning.ts"), "utf8");
    expect(src).not.toMatch(/finalDamage\s*\/|\/\s*w\.rawDamage|Number\(w\.answer\)/);
    // Owner lock (round 5): the percent is the share REMOVED, never the share kept.
    expect(reductionPercent(0.8063)).toBe("19.4%");
    expect(reductionPercent(0.6663)).toBe("33.4%");
    expect(reductionPercent(100 / 110)).toBe("9.1%");
    expect(reductionPercent(1)).toBe("0%");
    // The flat difference is of the SERVED exact values (84.56 − 68.1804), not the
    // displayed 85 − 68 = 17; `≈` whenever it was rounded.
    expect(approxWhole(84.56 - 68.1804)).toBe("≈16");
    expect(approxWhole(20)).toBe("20");
    expect(approxTenths(12 - 12 * (100 / 110))).toBe("≈1.1");
    expect(approxTenths(1.5)).toBe("1.5");
  });

  it("a multiplier that is NOT the armor formula keeps JP4's single node: nothing to unfold", () => {
    const off = combatReasoning(working({ mitigationMultiplier: 0.5 }), true);
    expect(unfolds(off)).toBe(false);
    expect(off.nodes.map((n) => n.key)).toEqual(["raw", "armor", "multiplier", "final"]);
  });
});

describe("the unfold choreographs inside the SERVER's window for this child; it never lengthens it", () => {
  it("folds at ONE measured fixed point, only where the compact chain is left a usable stretch", () => {
    expect(UNFOLD_COMPRESS_AT_MS).toBe(3200);
    expect(unfoldCompressAtMs(1750)).toBeNull();            // a simple reveal: stays expanded
    expect(unfoldCompressAtMs(4000)).toBeNull();            // 0.8 s left: not worth folding
    expect(unfoldCompressAtMs(4400)).toBe(3200);
    expect(unfoldCompressAtMs(6000)).toBe(3200);            // the served complex window
    expect(unfoldCompressAtMs(null)).toBeNull();
    expect(unfoldCompressAtMs(0)).toBeNull();
    for (const w of [1750, 2500, 3000, 3500, 4000, 4500, 6000, 9000]) {
      const c = unfoldCompressAtMs(w);
      if (c === null) continue;
      expect(c).toBe(UNFOLD_COMPRESS_AT_MS);                // not a share of the window
      expect(c).toBeLessThan(w);                            // always inside the window
      expect(w - c).toBeGreaterThanOrEqual(UNFOLD_MIN_COMPRESSED_MS);
    }
  });

  it("no client constant holds a reveal open (the only durations are shares of the served window)", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/components/journey/JourneyReasoning.tsx"), "utf8");
    const body = hook.slice(hook.indexOf("export function useEquationUnfold"), hook.indexOf("/** The exact working behind"));
    // One timer, armed from `unfoldCompressAtMs(windowMs)`; no literal duration.
    expect(body.match(/setTimeout/g)).toHaveLength(1);
    expect(body).not.toMatch(/setTimeout\([^)]*\b\d{3,}\b/);
    expect(body).toContain("unfoldCompressAtMs(windowMs)");
  });
});
