import { describe, expect, it } from "vitest";
import capture from "./__fixtures__/combatAuthorityCapture.json";
import {
  CAPTURE_CONTRACT, DEV_CLOSENESS_BANDS, definitionOf, devClosenessLabel, exactText, gradeEstimate,
  readCapturedScenario, readCombatAuthorityCapture, roundHalfUp, splitScenario, type CapturedScenario,
} from "./contract";
import { readJourneyWorking } from "@/lib/journey/combatWorking";

const CAPTURE = readCombatAuthorityCapture(capture);
const BACKEND_MASTER = "8829fc3c942d1e81b7817187716c57da4459473a";
const SEAM = "combat_calculations.physical_ability_damage.v1";

const byId = (id: string): CapturedScenario => {
  const s = CAPTURE.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("the frozen authority capture", () => {
  it("is the certified seam's output at the verified backend master", () => {
    expect(CAPTURE.contract).toBe(CAPTURE_CONTRACT);
    expect(CAPTURE.backend.commit).toBe(BACKEND_MASTER);
    expect(CAPTURE.backend.dirty).toBe(false);
    expect(CAPTURE.authorities.implementation).toBe(SEAM);
    expect(CAPTURE.authorities.calculation).toBe("ability_damage.physical.post_mitigation.v1");
    expect(CAPTURE.scale_policy.development_only).toBe(true);
    for (const s of CAPTURE.scenarios) {
      expect(s.kind).toBe("certified");
      expect(new Map(s.provenance).get("implementation")).toBe(SEAM);
      expect(new Map(s.provenance).get("raw_authority")).toBe("generic_ability_damage.resolve_generic_ability_damage");
    }
  });
  it("holds the demonstration set the brief asks for", () => {
    const ids = CAPTURE.scenarios.map((s) => s.id);
    expect(ids).toHaveLength(12);
    // the pinned Applied-Chain case, reproduced to the last bit
    const pinned = byId("jarvan-q-r3-l5-dirk-vs-olaf");
    expect(pinned.result.raw_damage).toBe(199);
    expect(pinned.result.post_mitigation_damage).toBe(144.22589108408587);
    expect(pinned.answer.whole).toBe(144);
    // a higher-armor target (Malphite + Chain Vest), penetration (lethality and percent), ranks and levels apart
    expect(byId("jhin-w-r5-l13-dirk-pickaxe-vs-malphite-chainvest").target.armor).toBeGreaterThan(130);
    expect(byId("olaf-q-r5-l11-lastwhisper-vs-jarvan").penetration.armor_pen_percent).toBe(18);
    expect(byId("leesin-r-r2-l11-brutalizer-vs-sett").penetration.lethality).toBeGreaterThan(0);
    expect(byId("jarvan-q-r5-l11-noitems-vs-olaf").attacker.items).toEqual([]);
    expect(byId("pantheon-e-r5-l13-dirk-vs-garen").ability.component).toBe("unempowered cast (no Mortal Will)");
    // a small and a large result
    const wholes = CAPTURE.scenarios.map((s) => s.answer.whole);
    expect(Math.min(...wholes)).toBeLessThan(80);
    expect(Math.max(...wholes)).toBeGreaterThan(450);
    // the before-armor variation
    expect(CAPTURE.scenarios.filter((s) => s.metric === "raw").map((s) => s.id)).toEqual([
      "zed-q-r3-l7-longsword-vs-ahri-raw", "jarvan-r-r3-l16-dirk-vs-olaf-raw",
    ]);
  });
  it("records the seam's own refusal rather than answering it", () => {
    const refused = CAPTURE.refused.find((r) => r.id === "jarvan-q-r5-l11-ldr-vs-olaf");
    expect(refused?.reason).toBe("item_effect_unmodelled");
    expect(refused?.detail).toMatch(/Giant Slayer/);
    expect(CAPTURE.scenarios.some((s) => s.id === "jarvan-q-r5-l11-ldr-vs-olaf")).toBe(false);
  });
  it("carries a working block the Journey reader accepts for every scenario", () => {
    for (const s of CAPTURE.scenarios) {
      const w = readJourneyWorking(s.working);
      expect(w, s.id).not.toBeNull();
      if (s.metric === "raw") {
        expect(w?.contract).toBe("raw_damage_working.v1");
        expect(w && "rawDamage" in w ? w.rawDamage : null).toBe(Number(s.result.raw_damage.toFixed(4)));
      } else {
        expect(w?.contract).toBe("combat_working.v1");
        expect(w && "finalDamage" in w ? w.finalDamage : null).toBe(Number(s.result.post_mitigation_damage.toFixed(4)));
        expect(w && "answer" in w ? w.answer : null).toBe(String(s.answer.whole));
      }
    }
  });
  it("keeps every answer on its public, answer-independent beam", () => {
    for (const s of CAPTURE.scenarios) {
      expect(s.scale.policy).toBe("ce1.scale.four_times_attack_damage.dev-v0");
      expect(s.scale.max % s.scale.coarse_step).toBe(0);
      expect(s.answer.exact).toBeGreaterThanOrEqual(0);
      expect(s.answer.exact).toBeLessThan(s.scale.max);
      // the beam is a function of the attacker's public attack damage only
      const expected = Math.max(400, Math.min(1000, Math.ceil((4 * s.attacker.stats.attack_damage) / 100) * 100));
      expect(s.scale.max).toBe(expected);
    }
  });
});

describe("readCapturedScenario fails closed", () => {
  const pinned = () => clone(byId("jarvan-q-r3-l5-dirk-vs-olaf"));
  it("accepts the real scenario", () => { expect(() => readCapturedScenario(pinned())).not.toThrow(); });
  it("refuses an answer that is not the authority's number", () => {
    const s = pinned(); s.answer.exact = 150;
    expect(() => readCapturedScenario(s)).toThrow(/authority's number/);
  });
  it("refuses a mis-rounded whole answer", () => {
    const s = pinned(); s.answer.whole = 145;
    expect(() => readCapturedScenario(s)).toThrow(/mis-rounded/);
  });
  it("refuses an answer off the beam", () => {
    const s = pinned(); s.scale.max = 100;
    expect(() => readCapturedScenario(s)).toThrow(/off the beam/);
  });
  it("refuses a non-physical row", () => {
    const s = pinned(); s.result.damage_type = "magic";
    expect(() => readCapturedScenario(s)).toThrow(/not physical/);
  });
  it("refuses a scenario another implementation produced", () => {
    const s = pinned(); s.provenance = s.provenance.map(([k, v]) => (k === "implementation" ? [k, "other.v9"] : [k, v]));
    expect(() => readCapturedScenario(s)).toThrow(/certified seam/);
  });
  it("refuses anything not marked certified", () => {
    const s = pinned(); (s as { kind: string }).kind = "synthetic";
    expect(() => readCapturedScenario(s)).toThrow(/not certified/);
  });
  it("refuses an off-contract working block", () => {
    const s = pinned(); (s.working as { contract: string }).contract = "mystery.v1";
    expect(() => readCapturedScenario(s)).toThrow(/working/);
  });
  it("refuses a capture with a duplicate id or no commit", () => {
    const c = clone(capture) as typeof capture;
    c.scenarios.push(clone(c.scenarios[0]));
    expect(() => readCombatAuthorityCapture(c)).toThrow(/duplicate/);
    const d = clone(capture) as { backend: { commit: string } };
    d.backend.commit = "";
    expect(() => readCombatAuthorityCapture(d)).toThrow(/commit/);
  });
});

describe("the public / private split", () => {
  it("puts no answer, raw damage, effective armor or multiplier in the public scenario", () => {
    for (const s of CAPTURE.scenarios) {
      const { scenario, secret } = splitScenario(s, CAPTURE.backend.commit);
      const text = JSON.stringify(scenario);
      expect(text).not.toMatch(/raw_damage|rawDamage|effective|multiplier|post_mitigation_damage|"exact"|"whole"|working|answer/i);
      // effective armor is private unless it IS the stated armor (no penetration at all)
      if (s.result.effective_armor !== s.result.target_armor) expect(text).not.toContain(String(s.result.effective_armor));
      expect(text).not.toContain(String(s.result.mitigation_multiplier));
      expect(secret.whole).toBe(s.answer.whole);
      expect(secret.exact).toBe(s.answer.exact);
      expect(scenario.certification.kind).toBe("certified");
      expect(scenario.certification.label).toContain(CAPTURE.backend.commit.slice(0, 8));
      expect(scenario.assumptions.length).toBeGreaterThan(0);
    }
  });
  it("names exactly what is estimated", () => {
    expect(definitionOf(byId("jarvan-q-r3-l5-dirk-vs-olaf"))).toBe(
      "One Dragon Strike hit at rank 3, after Olaf's armor — physical damage actually dealt.");
    expect(definitionOf(byId("zed-q-r3-l7-longsword-vs-ahri-raw"))).toMatch(/before Ahri's armor — the ability's raw physical damage/);
    expect(definitionOf(byId("pantheon-e-r5-l13-dirk-vs-garen"))).toMatch(/Aegis Assault \(unempowered cast \(no Mortal Will\)\)/);
  });
});

describe("gradeEstimate", () => {
  const secretOf = (id: string) => splitScenario(byId(id), CAPTURE.backend.commit).secret;
  it("rounds the way the game displays (half up)", () => {
    expect(roundHalfUp(144.5)).toBe(145);
    expect(roundHalfUp(144.4999)).toBe(144);
    expect(roundHalfUp(72.5666)).toBe(73);
  });
  it("calls the whole-number answer exact, with the exact value beside it", () => {
    const r = gradeEstimate(secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), 144, "src");
    expect(r.verdict).toBe("exact");
    expect(r.error.signed).toBe(0);
    expect(r.error.signedText).toBe("0");
    expect(r.error.absolute).toBe(0);
    expect(r.error.relativeText).toBe("Exact");
    expect(r.closeness).toEqual({ label: "Exact", development: true });
    expect(r.truth).toEqual({ value: 144, valueText: "144", exactText: "144.2259", label: "Final damage" });
    expect(r.lockedValue).toBe(144);
  });
  it("signs an overestimate and measures it against the exact value", () => {
    const r = gradeEstimate(secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), 161, "src");
    expect(r.verdict).toBe("over");
    expect(r.error.signed).toBe(17);
    expect(r.error.signedText).toBe("+17");
    expect(r.error.absoluteText).toBe("17");
    expect(r.error.relative).toBeCloseTo((161 - 144.22589108408587) / 144.22589108408587, 12);
    expect(r.error.relativeText).toBe("12% over");
    expect(r.closeness?.label).toBe("Within 20%");
  });
  it("signs an underestimate", () => {
    const r = gradeEstimate(secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), 100, "src");
    expect(r.verdict).toBe("under");
    expect(r.error.signedText).toBe("−44");
    expect(r.error.relativeText).toBe("31% under");
    expect(r.closeness?.label).toBe("Within 35%");
  });
  it("shows a sub-percent miss to one decimal", () => {
    const r = gradeEstimate(secretOf("jarvan-r-r3-l16-dirk-vs-olaf-raw"), 488, "src");
    expect(r.truth.exactText).toBeNull();
    expect(r.error.relativeText).toBe("0.4% over");
    expect(r.closeness?.label).toBe("Within 2%");
  });
  it("has no relative error against a zero truth", () => {
    const zero = { ...secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), exact: 0, whole: 0 };
    const r = gradeEstimate(zero, 5, "src");
    expect(r.error.relative).toBeNull();
    expect(r.error.relativeText).toBeNull();
    expect(r.verdict).toBe("over");
    expect(r.closeness?.label).toBe("No relative error");
  });
  it("refuses a non-whole or negative estimate", () => {
    expect(() => gradeEstimate(secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), 1.5, "src")).toThrow();
    expect(() => gradeEstimate(secretOf("jarvan-q-r3-l5-dirk-vs-olaf"), -1, "src")).toThrow();
  });
  it("describes closeness in relative bands that treat every magnitude alike", () => {
    expect(DEV_CLOSENESS_BANDS[0]).toEqual({ upTo: 0, label: "Exact" });
    expect(devClosenessLabel(0.05)).toBe("Within 5%");
    expect(devClosenessLabel(0.0501)).toBe("Within 10%");
    expect(devClosenessLabel(0.9)).toBe("Wide of the mark");
    // ±5 points is 10% of 50 but 0.5% of 1 000 — the band says so rather than hiding it.
    expect(devClosenessLabel(5 / 50)).toBe("Within 10%");
    expect(devClosenessLabel(5 / 1000)).toBe("Within 2%");
  });
  it("trims the exact value to four places", () => {
    expect(exactText(170, 170)).toBeNull();
    expect(exactText(144.22589108408587, 144)).toBe("144.2259");
  });
});
