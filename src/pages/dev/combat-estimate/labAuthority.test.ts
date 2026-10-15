import { describe, expect, it } from "vitest";
import {
  buildLabRound, buildSyntheticRound, COMBAT_CAPTURE, findCaptured, gradeLabRound, promptFor, roundOrder, SYNTHETIC_ROUND_ID,
} from "./labAuthority";

describe("the lab's stand-in server", () => {
  it("serves every certified scenario with public content that carries no answer", () => {
    for (const captured of COMBAT_CAPTURE.scenarios) {
      const round = buildLabRound(captured);
      const whole = round.secret.secret?.whole;
      expect(whole).toBe(captured.answer.whole);
      const text = JSON.stringify(round.content) + JSON.stringify(round.scenario);
      // the answer never appears as a number token in anything the primitive or the board is handed
      expect(text, round.id).not.toMatch(new RegExp(`(^|[^\\d.])${whole}([^\\d]|$)`));
      expect(text).not.toMatch(/raw_damage|rawDamage|effective|multiplier|post_mitigation_damage|"exact"|"whole"|answer|working/i);
      expect(round.content.certification.kind).toBe("certified");
      expect(round.content.scale.max).toBe(captured.scale.max);
      expect(round.content.definition).toContain(captured.ability.name);
    }
  });

  it("words the prompt by the metric, and names the target only after armor", () => {
    expect(promptFor(buildLabRound(findCaptured("jarvan-q-r3-l5-dirk-vs-olaf")!).scenario)).toBe(
      "How much physical damage does Dragon Strike deal to Olaf after armor?");
    expect(promptFor(buildLabRound(findCaptured("zed-q-r3-l7-longsword-vs-ahri-raw")!).scenario)).toBe(
      "How much physical damage does Razor Shuriken deal before armor?");
  });

  it("grades a response into the host's reveal and the authority's working", () => {
    const round = buildLabRound(findCaptured("jarvan-q-r3-l5-dirk-vs-olaf")!);
    const grade = gradeLabRound(round, { estimate: 161 });
    expect(grade.reveal.verdict).toBe("over");
    expect(grade.reveal.truth.valueText).toBe("144");
    expect(grade.reveal.lockedValue).toBe(161);
    expect(grade.working?.contract).toBe("combat_working.v1");
    expect(grade.sourceLine).toContain("combat_calculations.physical_ability_damage.v1");
    expect(grade.sourceLine).toContain(COMBAT_CAPTURE.backend.commit.slice(0, 8));
    expect(grade.sourceLine).toContain("Serrated Dirk@4065930");
  });

  it("names the modelled component on the reveal when the row has one", () => {
    const round = buildLabRound(findCaptured("pantheon-e-r5-l13-dirk-vs-garen")!);
    expect(gradeLabRound(round, { estimate: 200 }).reveal.note).toBe("Modelled component: unempowered cast (no Mortal Will).");
    expect(gradeLabRound(buildLabRound(findCaptured("jarvan-q-r3-l5-dirk-vs-olaf")!), { estimate: 200 }).reveal.note).toBeNull();
  });

  it("refuses a response the beam cannot hold", () => {
    const round = buildLabRound(findCaptured("jarvan-q-r3-l5-dirk-vs-olaf")!);
    expect(() => gradeLabRound(round, { estimate: 400 })).toThrow(/cannot hold/);
    expect(() => gradeLabRound(round, { estimate: -1 })).toThrow(/cannot hold/);
    expect(() => gradeLabRound(round, { estimate: 1.5 })).toThrow(/cannot hold/);
  });

  it("serves the one synthetic round as unmistakably synthetic", () => {
    const round = buildSyntheticRound();
    expect(round.id).toBe(SYNTHETIC_ROUND_ID);
    expect(round.content.certification.kind).toBe("synthetic");
    expect(round.content.certification.label).toMatch(/SYNTHETIC/);
    expect(round.secret.secret).toBeNull();
    const grade = gradeLabRound(round, { estimate: 100 });
    expect(grade.working).toBeNull();
    expect(grade.reveal.note).toMatch(/SYNTHETIC/);
    expect(grade.sourceLine).toMatch(/SYNTHETIC/);
    expect(COMBAT_CAPTURE.scenarios.some((s) => s.id === SYNTHETIC_ROUND_ID)).toBe(false);
  });

  it("orders the pool deterministically for a seed and covers it", () => {
    const a = roundOrder("academy").map((s) => s.id);
    const b = roundOrder("academy").map((s) => s.id);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(COMBAT_CAPTURE.scenarios.map((s) => s.id).sort());
    expect(roundOrder("other").map((s) => s.id)).not.toEqual(a);
  });
});
