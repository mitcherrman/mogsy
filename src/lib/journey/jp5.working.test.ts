/**
 * JP5 — ONE CARRIER, TYPED CALCULATIONS: `readJourneyWorking` on the REAL JP5
 * captures (backend `jp5/journey-structured-working`), and its fail-closed
 * allowlists. Every Journey working arrives under the one wire key
 * `combat_working`; `contract` decides the shape. An unknown or off-contract
 * block is "no working" — never a throw, never a partial read.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { readCombatWorking, readJourneyWorking } from "./combatWorking";
import type { CaptureSnapshot } from "./realFixtures";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__/jp5");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const snap = (n: string, label: string) => load(n).find((x) => x.label === label)!;
type Wire = Record<string, unknown>;
const revealWire = (s: CaptureSnapshot, index: number) =>
  ((s.envelope.payload as { segment_state: Wire }).segment_state.own_challenge_reveals as Wire[])
    .find((r) => r.challenge_index === index)!;
const served = (n: string, label: string, index: number) =>
  structuredClone(revealWire(snap(n, label), index).combat_working) as Wire;

describe("the real JP5 reveals, through the production parser", () => {
  it("Zed/Ahri Step 2 carries `raw_damage_working.v1`: the flat base, the served contribution, the raw total", () => {
    const seg = readPublicRound(snap("zed_ahri.reference", "child1-reveal").envelope).segmentState!;
    const reveal = seg.ownChallengeReveals.find((r) => r.challengeIndex === 1)!;
    expect(reveal.combatWorking).toBeUndefined();          // not an after-armor working
    expect(reveal.working).toEqual({
      contract: "raw_damage_working.v1", calculation: "physical_ability_raw_damage", damageType: "physical",
      attacker: { side: "player", champion: "Zed" }, ability: { slot: "E", name: "Shadow Slash", rank: 1 },
      formula: { flat: 70, ratios: [{ stat: "bonus_attack_damage", label: "bonus attack damage", ratio: 0.7, value: 20.8 }] },
      terms: [{ term: "flat", value: 70 }, { term: "ratio", stat: "bonus_attack_damage", value: 14.56 }],
      rawDamage: 84.56, answer: "85",
    });
    expect(seg.ownRevealWindowMs).toBe(4000);
  });

  it("Zed/Ahri Step 4 is the same after-armor working as before, read by both readers", () => {
    const seg = readPublicRound(snap("zed_ahri.reference", "child3-reveal").envelope).segmentState!;
    const reveal = seg.ownChallengeReveals.find((r) => r.challengeIndex === 3)!;
    expect(reveal.working).toEqual(reveal.combatWorking);
    expect(reveal.working?.contract).toBe("combat_working.v1");
    expect(seg.ownRevealWindowMs).toBe(6000);
  });

  it("Volibear's haste child carries `cooldown_working.v1`: base, haste, THE multiplier, effective", () => {
    const seg = readPublicRound(snap("voli.standard", "child2-reveal").envelope).segmentState!;
    const reveal = seg.ownChallengeReveals.find((r) => r.challengeIndex === 2)!;
    expect(reveal.working).toEqual({
      contract: "cooldown_working.v1", calculation: "cooldown_under_haste",
      champion: { side: "player", champion: "Volibear" }, ability: { slot: "Q", name: "Thundering Smash", rank: 1 },
      baseCooldown: 12, abilityHaste: 10, cooldownMultiplier: 0.9091, effectiveCooldown: 10.9091,
      unit: "seconds", answer: "11",
    });
    expect(seg.ownRevealWindowMs).toBe(6000);
  });

  it("a simple child has no working and keeps the base window", () => {
    const seg = readPublicRound(snap("zed_ahri.reference", "child2-reveal").envelope).segmentState!;
    expect(seg.ownChallengeReveals.find((r) => r.challengeIndex === 2)!.working).toBeUndefined();
    expect(seg.ownRevealWindowMs).toBe(1750);
    expect(seg.revealWindowMs).toBe(1750);
  });

  it("no working is served before its child settles: the live snapshots carry none", () => {
    for (const [n, label] of [["zed_ahri.reference", "child1-live"], ["voli.standard", "child2-live"]] as const) {
      const text = JSON.stringify(snap(n, label).envelope);
      expect(text, label).not.toMatch(/raw_damage_working|cooldown_working|"terms"|14\.56|10\.9091/);
    }
  });
});

describe("fail closed: anything off-contract is no working", () => {
  const raw = () => served("zed_ahri.reference", "child1-reveal", 1);
  const cd = () => served("voli.standard", "child2-reveal", 2);

  it("an unknown contract, or a known contract read by the wrong reader, is null", () => {
    expect(readJourneyWorking({ ...raw(), contract: "raw_damage_working.v2" })).toBeNull();
    expect(readJourneyWorking({ contract: "shield_working.v1" })).toBeNull();
    expect(readCombatWorking(raw())).toBeNull();
    expect(readCombatWorking(cd())).toBeNull();
    expect(readJourneyWorking(null)).toBeNull();
    expect(readJourneyWorking([raw()])).toBeNull();
  });

  it("raw: terms that do not add up to the served total are refused (nothing is re-derived)", () => {
    const w = raw();
    (w.terms as Wire[])[1].value = 15;
    expect(readJourneyWorking(w)).toBeNull();
  });

  it("raw: terms out of formula order, a missing term, or an extra key are refused", () => {
    const swapped = raw();
    swapped.terms = [...(swapped.terms as Wire[])].reverse();
    expect(readJourneyWorking(swapped)).toBeNull();
    const missing = raw();
    missing.terms = (missing.terms as Wire[]).slice(0, 1);
    expect(readJourneyWorking(missing)).toBeNull();
    expect(readJourneyWorking({ ...raw(), note: "x" })).toBeNull();
  });

  it("cooldown: a multiplier that is not a reduction, a non-number, or a missing field is refused", () => {
    expect(readJourneyWorking({ ...cd(), cooldown_multiplier: 1.2 })).toBeNull();
    expect(readJourneyWorking({ ...cd(), cooldown_multiplier: 0 })).toBeNull();
    expect(readJourneyWorking({ ...cd(), base_cooldown: "12" })).toBeNull();
    const { unit: _unit, ...noUnit } = cd();
    expect(readJourneyWorking(noUnit)).toBeNull();
  });
});
