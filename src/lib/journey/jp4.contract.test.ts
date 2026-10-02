/**
 * JP4 — the contract and vocabulary behind the Journey's reasoning & state
 * language, at the data layer (the DOM is `masterySliceModule.jp4.test.tsx`):
 *
 *   * the backend's additive `stat_mods` / `stat_sources` (JP4 backend
 *     `fc95e81e`), read strictly, optional, never invented here;
 *   * the owner-locked stat mnemonics and the owner's shard art;
 *   * the Reasoning Chain builders: served numbers only, whole-number primary,
 *     exact detail apart, the armor formula drawn only when the served
 *     multiplier IS that formula.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ3, type JourneyCursor } from "./adapter";
import { readJourneyJ3 } from "./j3";
import type { CaptureSnapshot } from "./realFixtures";
import type { CombatWorking } from "./combatWorking";
import { mnemonicForMetric, mnemonicForStat, SHARD_ART_BASE, SHARD_ART_FILES, shardArtUrl, STAT_MNEMONICS } from "./statIcons";
import { combatReasoning, isArmorFormula, rawReasoning, rawWordsReasoning, rankWords, statReasoning } from "./reasoning";
import type { RawDamageWorking } from "./combatWorking";

type Wire = Record<string, unknown>;
const JREF = resolve(process.cwd(), "src/lib/journey/__fixtures__/jref");
const load = (dir: string, name: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const snap = (dir: string, name: string, label: string) => {
  const s = load(dir, name).find((x) => x.label === label);
  if (!s) throw new Error(`${name}: ${label}`);
  return s;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const journeyWire = (s: CaptureSnapshot) =>
  ((s.envelope.payload as Wire).segment_state as Wire as { challenges: { journey: Wire } }).challenges.journey;
const sideWire = (j: Wire, child: number, side: "player" | "opponent") =>
  ((j.children as Wire[])[child].state as { sides: Record<string, Wire> }).sides[side];
const cursorOf = (s: CaptureSnapshot): JourneyCursor => {
  const seg = readPublicRound(s.envelope).segmentState!;
  return { ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished };
};

describe("the backend's stat_mods / stat_sources: read strictly, optional, never invented", () => {
  const s = snap(JREF, "zed_ahri.reference", "child1-live");

  it("reads each side's authoritative shard page, in row order, with the served ids and names", () => {
    const j = readJourneyJ3(journeyWire(s));
    const zed = j.children[1].state.sides.player.statMods;
    const ahri = j.children[1].state.sides.opponent.statMods;
    expect(zed?.map(({ effects: _e, ...m }) => m)).toEqual([
      { row: "offense", id: "5008", name: "Adaptive Force" },
      { row: "flex", id: "5008", name: "Adaptive Force" },
      { row: "defense", id: "5001", name: "Health Scaling" },
    ]);
    // JPX: this capture predates `effects` (an older backend): read as absent, never invented.
    expect(zed?.map((m) => m.effects)).toEqual([null, null, null]);
    expect(ahri?.map((m) => m.id)).toEqual(["5005", "5008", "5001"]);
  });

  it("reads Zed's served bonus-AD sources; the board keeps them with the stat it explains", () => {
    const j = readJourneyJ3(journeyWire(s));
    expect(j.children[1].state.sides.player.statSources.bonus_attack_damage).toEqual([
      { kind: "item", itemId: "1055", name: "Doran's Blade", value: 10 },
      { kind: "stat_mod", row: "offense", id: "5008", name: "Adaptive Force", value: 5.4 },
      { kind: "stat_mod", row: "flex", id: "5008", name: "Adaptive Force", value: 5.4 },
    ]);
    const board = adaptJourneyJ3(j, cursorOf(s))!.board;
    const zed = board.sides[0];
    expect(zed.shards?.map((x) => x.shardId)).toEqual(["5008", "5008", "5001"]);
    const bonus = zed.stats.find((x) => x.key === "bonus_attack_damage")!;
    expect(bonus.value).toBe(20.8);
    expect(bonus.sources?.map((x) => [x.kind, x.kind === "level" ? null : x.name, x.value])).toEqual([
      ["item", "Doran's Blade", 10], ["stat_mod", "Adaptive Force", 5.4], ["stat_mod", "Adaptive Force", 5.4]]);
  });

  it("an older payload without either key reads exactly as before (no page, no sources)", () => {
    const old = clone(journeyWire(s));
    for (const c of old.children as Wire[]) {
      for (const side of Object.values((c.state as { sides: Record<string, Wire> }).sides)) {
        delete side.stat_mods; delete side.stat_sources;
      }
    }
    const j = readJourneyJ3(old);
    expect(j.children[1].state.sides.player.statMods).toBeNull();
    expect(j.children[1].state.sides.player.statSources).toEqual({});
    expect(adaptJourneyJ3(j, cursorOf(s))!.board.sides[0].shards).toBeUndefined();
  });

  it("fails closed on a malformed page or sources (the reader stays an allowlist)", () => {
    const bad = (mutate: (j: Wire) => void) => {
      const j = clone(journeyWire(s));
      mutate(j);
      return () => readJourneyJ3(j);
    };
    // Rows out of order / missing.
    expect(bad((j) => { (sideWire(j, 1, "player").stat_mods as Wire[]).reverse(); })).toThrow(/one shard per row/);
    expect(bad((j) => { (sideWire(j, 1, "player").stat_mods as Wire[]).pop(); })).toThrow(/one shard per row/);
    // An unknown key anywhere still fails the read.
    expect(bad((j) => { (sideWire(j, 1, "player").stat_mods as Wire[])[0].tier = 1; })).toThrow(/does not publish/);
    expect(bad((j) => { sideWire(j, 1, "player").stat_whatever = {}; })).toThrow(/does not publish/);
    // Sources only for a STATED stat, and a shard source must be this side's own shard.
    expect(bad((j) => {
      const side = sideWire(j, 1, "player");
      side.stat_sources = { armor: [] };
    })).toThrow(/does not state/);
    expect(bad((j) => {
      const side = sideWire(j, 1, "player");
      ((side.stat_sources as Wire).bonus_attack_damage as Wire[])[1].id = "5007";
    })).toThrow(/not one of this side's shards/);
  });
});

describe("the icon vocabulary (owner locks)", () => {
  it("stat mnemonics are the owner's items, by canonical id", () => {
    expect(Object.fromEntries(Object.entries(STAT_MNEMONICS).map(([k, v]) => [k, `${v.itemId} ${v.itemName}`]))).toEqual({
      armor: "1029 Cloth Armor",
      health: "1028 Ruby Crystal",
      attack_damage: "1036 Long Sword",
      ability_power: "1052 Amplifying Tome",
      magic_resist: "1033 Null-Magic Mantle",
      move_speed: "1001 Boots",
      attack_speed: "1042 Dagger",
      crit_chance: "1018 Cloak of Agility",
      mana: "1027 Sapphire Crystal",
      mana_regen: "1004 Faerie Charm",
      health_regen: "1006 Rejuvenation Bead",
      ability_haste: "2022 Glowing Mote",
      lethality: "2020 The Brutalizer",
      magic_penetration: "3020 Sorcerer's Shoes",
    });
    expect(mnemonicForStat("bonus_attack_damage")?.itemName).toBe("Long Sword");
    expect(mnemonicForStat("magic_penetration_percent")?.itemName).toBe("Sorcerer's Shoes");
    expect(mnemonicForStat("armor_penetration_percent")).toBeNull();
    expect(mnemonicForMetric("base_armor")?.itemName).toBe("Cloth Armor");
    expect(mnemonicForMetric("nonsense")).toBeNull();
  });

  it("every shard the vocabulary draws is the owner's own file, unchanged, at the canonical path", () => {
    expect(SHARD_ART_BASE).toBe("/assets/journey/mogzy-stat-shards");
    expect([...SHARD_ART_FILES].sort()).toEqual([
      "ability_haste", "adaptive_force", "attack_speed", "flat_health", "move_speed", "scaling_health", "tenacity"]);
    for (const f of SHARD_ART_FILES) {
      expect(existsSync(resolve(process.cwd(), `public/assets/journey/mogzy-stat-shards/${f}.png`)), f).toBe(true);
    }
    expect(shardArtUrl("5008")).toBe("/assets/journey/mogzy-stat-shards/adaptive_force.png");
    expect(shardArtUrl("5001")).toBe("/assets/journey/mogzy-stat-shards/scaling_health.png");
    expect(shardArtUrl("9999")).toBeNull();
    // Names are never defined here: they are the payload's.
    const src = readFileSync(resolve(process.cwd(), "src/lib/journey/statIcons.ts"), "utf8");
    expect(src).not.toMatch(/"Adaptive Force"|"Health Scaling"/);
  });
});

describe("Reasoning Chain builders: served numbers, League-style primary, exact apart", () => {
  const ratio = { ratio: 0.7, stat: "bonus_attack_damage", label: "bonus attack damage", value: 20.8 };

  // JP5 — Step 2 is drawn from the server's `raw_damage_working` (the served
  // contribution, never raw − flat), and the answer follows by an ARROW: the
  // shown 70 + 15 is not how 84.56 was reached.
  const rawWorking: RawDamageWorking = {
    contract: "raw_damage_working.v1", calculation: "physical_ability_raw_damage", damageType: "physical",
    attacker: { side: "player", champion: "Zed" }, ability: { slot: "E", name: "Shadow Slash", rank: 1 },
    formula: { flat: 70, ratios: [{ stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 0.7, value: 20.8 }] },
    terms: [{ term: "flat", value: 70 }, { term: "ratio", stat: "bonus_attack_damage", value: 14.56 }],
    rawDamage: 84.56, answer: "85",
  };

  it("Step 2: 70 + (70% of 21 ≈ 15) → 85, 'Rank 1', from the SERVED working", () => {
    const r = rawReasoning(rawWorking);
    expect(r.subject?.text).toBe("Shadow Slash — Rank 1");
    expect(rankWords(1)).toBe("Rank 1");
    expect(r.nodes.map((n) => [n.op ?? null, n.expression ?? null, n.value, n.label])).toEqual([
      [null, null, "70", "Base damage"],
      ["+", "70% of 21 ≈", "15", "(Bonus AD)"],
      ["→", null, "85", "Raw damage"],
    ]);
    expect(r.exact).toEqual([
      "Exact bonus AD: 20.8", "70% of 20.8 = 14.56", "70 + 14.56 = 84.56", "Shown as 85 · rounded for display"]);
    expect(JSON.stringify(r)).not.toMatch(/R1\b|× 21|rounded up|= 85/);
    // The composition bar: the served terms, weighted by their served values.
    expect(r.composition).toEqual({
      parts: [{ key: "base", value: "70", label: "base", weight: 70 },
        { key: "ratio-0", value: "15", label: "Bonus AD", weight: 14.56 }],
      total: "85", totalLabel: "raw",
    });
  });

  it("Step 2 with a whole stat and an exact term writes `=`; a taught decimal base stays a decimal", () => {
    const r = rawReasoning({ ...rawWorking,
      formula: { flat: 92.5, ratios: [{ ...rawWorking.formula.ratios[0], value: 20 }] },
      terms: [{ term: "flat", value: 92.5 }, { term: "ratio", stat: "bonus_attack_damage", value: 14 }],
      rawDamage: 106.5, answer: "107" });
    expect(r.nodes[0].value).toBe("92.5");
    expect(r.nodes[1].expression).toBe("70% of 20 =");
  });

  it("a reveal WITHOUT a served working (a backend before JP5) keeps the formula in words only", () => {
    const r = rawWordsReasoning({ champion: "Zed", slot: "E", ability: "Shadow Slash", rank: 1, flat: 70,
      ratios: [ratio], answer: "85" });
    expect(r.nodes.map((n) => [n.op ?? null, n.expression ?? null, n.value, n.label])).toEqual([
      [null, null, "70", "Base damage"], ["+", "70% of", "21", "Bonus AD"], ["→", null, "85", "Raw damage"]]);
    expect(r.composition).toBeUndefined();
    expect(r.exact).toEqual(["Exact bonus AD: 20.8"]);
  });

  it("no reveal reads a number out of its explanation prose (the JP4 regex is gone)", () => {
    for (const f of ["src/lib/journey/reasoning.ts", "src/components/journey/JourneyStageQuestion.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/explainedExact|which rounds to|exactRaw/);
    }
  });

  it("Step 3: [Ahri · Lv 2] → [Armor · 24] (no Exact line: nothing structured serves 24.024 at this reveal)", () => {
    const r = statReasoning({ champion: "Ahri", championId: "ahri", metric: "base_armor", level: 2 }, "24")!;
    expect(r.nodes.map((n) => [n.op ?? null, n.value, n.label, n.icon?.kind])).toEqual([
      [null, "Lv 2", "Ahri", "champion"], ["→", "24", "Armor", "stat"]]);
    expect(r.exact).toBeNull();
  });

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

  // JP5 supersedes JP4's merged "100 / (100 + 24) ≈ 0.806" node: the served
  // multiplier is written three ways, the first two being the chain's detail.
  it("Step 4: 85 → 24 → 100 / (100 + 24) → 0.806 → 19.4% reduced → 68, the exact working apart", () => {
    const r = combatReasoning(working(), true);
    expect(r.nodes.map((n) => [n.op ?? null, n.value, n.label])).toEqual([
      [null, "85", "Raw damage"], ["→", "24", "Ahri armor"], ["→", "", "Formula"], ["→", "0.806", "Multiplier"],
      ["→", "19.4%", "Reduced"], ["→", "68", "Final damage"]]);
    expect(r.nodes[2].fraction).toEqual({ top: "100", bottom: "100 + 24" });
    expect(r.subject).toBeNull();                    // raw recalled: nothing re-derived
    expect(r.exact).toEqual([
      "Exact raw damage: 84.56", "Ahri armor: 24.024", "100 ÷ (100 + 24.024) = 0.8063",
      "84.56 × 0.8063 ≈ 68.1804", "Shown as 68 · rounded for display"]);
  });

  it("the armor formula is drawn only when the SERVED multiplier is that formula; otherwise as served", () => {
    expect(isArmorFormula(24.024, 0.8063)).toBe(true);
    expect(isArmorFormula(68.872, 0.5922)).toBe(true);
    expect(isArmorFormula(24.024, 0.5)).toBe(false);
    expect(isArmorFormula(-10, 1.0909)).toBe(false);
    const off = combatReasoning(working({ mitigationMultiplier: 0.5 }), true);
    expect(off.nodes[2]).toMatchObject({ value: "×0.5", label: "Armor multiplier" });
    expect(off.nodes[2].fraction).toBeUndefined();
  });

  it("no second combat engine: the answer node is always the SERVED answer, whatever the other numbers say", () => {
    const r = combatReasoning(working({ answer: "999", finalDamage: 999 }), true);
    expect(r.nodes.at(-1)).toMatchObject({ value: "999", final: true });
    const src = readFileSync(resolve(process.cwd(), "src/lib/journey/reasoning.ts"), "utf8");
    // The only arithmetic: a served total laid out as its served parts, and the formula CHECK.
    expect(src.match(/\bw\.rawDamage\s*\*|\*\s*w\.mitigationMultiplier|\* r\.ratio/g)).toBeNull();
  });
});
