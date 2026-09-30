/**
 * JP5 — THE CHAMPION NOTEBOOK's data (`notebook.ts`) on the REAL JP5-backend
 * captures: only what the learner has established (stated by a reached
 * premise, or learned by a reveal), in the authored state it belongs to, with
 * the served provenance — never a later state, never the open child's asked
 * value, never a value merely because the backend knows it.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { journeyKnowledge } from "./knowledge";
import { championNotebook, entryBasis, type ChampionNotebook } from "./notebook";
import type { CaptureSnapshot } from "./realFixtures";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};

/** The production path: parsed segment → K2 knowledge → the notebook at the child on screen. */
function notebookAt(n: string, label: string, side: "player" | "opponent", step?: number): ChampionNotebook {
  const seg = readPublicRound(snap(n, label).envelope).segmentState!;
  const knowledge = journeyKnowledge(seg.journey, seg.ownChallengeReveals, seg.ownCardIndex);
  const onScreen = step ?? seg.ownRevealingCardIndex ?? seg.ownCardIndex ?? seg.challengeCount - 1;
  return championNotebook(seg.journey, knowledge, side, onScreen)!;
}
const current = (nb: ChampionNotebook) => nb.checkpoints.find((c) => c.node === nb.current)!;

const REF = "jp5/zed_ahri.reference";
const PANTHEON = "jp5/pantheon.standard";

describe("the reference Journey (Zed / Ahri)", () => {
  it("Step 2: Zed's stated bonus AD 21 is in his notebook with its served sources; nothing is learned yet", () => {
    const zed = notebookAt(REF, "child1-live", "player");
    expect(zed.championName).toBe("Zed");
    expect(zed.learned).toBe(false);
    const bonus = current(zed).entries.bonus_attack_damage!;
    expect(bonus).toMatchObject({ display: "21", how: "stated", step: 2, level: 2, exact: 20.8 });
    expect(bonus.sources.map((s) => [s.kind, s.kind === "level" ? s.level : s.name, s.value])).toEqual([
      ["item", "Doran's Blade", 10], ["stat_mod", "Adaptive Force", 5.4], ["stat_mod", "Adaptive Force", 5.4]]);
    expect(entryBasis(bonus)).toBe("Lv 2 · Doran's Blade · 2 shards");
    // Only what was stated: no other row is known.
    expect(Object.keys(current(zed).entries)).toEqual(["bonus_attack_damage"]);
  });

  it("Step 3 asks Ahri's armor: while it is open her notebook does NOT know it", () => {
    for (const label of ["child2-open", "child2-live"]) {
      const ahri = notebookAt(REF, label, "opponent");
      expect(ahri.learned, label).toBe(false);
      expect(current(ahri).entries.armor, label).toBeUndefined();
    }
  });

  it("from Step 3's reveal on, Ahri's armor is LEARNED: 24, the level-2 base, as the reveal showed it", () => {
    const ahri = notebookAt(REF, "child2-reveal", "opponent");
    expect(ahri.learned).toBe(true);
    const armor = current(ahri).entries.armor!;
    expect(armor).toMatchObject({ display: "24", how: "learned", step: 3, level: 2 });
    expect(entryBasis(armor)).toBe("Lv 2 base");
    // Once the ledger lists it (the next child), the served exact rides along.
    const later = current(notebookAt(REF, "child3-live", "opponent")).entries.armor!;
    expect(later).toMatchObject({ display: "24", exact: 24.024 });
  });

  it("a WRONG answer establishes the fact the same way (the notebook never reads correctness)", () => {
    const right = current(notebookAt(REF, "child3-live", "opponent")).entries.armor;
    const wrong = current(notebookAt("jp5/zed_ahri.reference.wrong", "child3-live", "opponent")).entries.armor;
    expect(wrong).toEqual(right);
  });

  it("one authored state in the reference Journey: one checkpoint, no selector", () => {
    const zed = notebookAt(REF, "child3-live", "player");
    expect(zed.checkpoints.map((c) => c.node)).toEqual([0]);
  });
});

describe("a MODIFIED stat: Pantheon / Leona (Cloth Armor, then level 4)", () => {
  it("Step 1 teaches Leona's armor at level 3 (50); it stays in THAT state", () => {
    const leona = notebookAt(PANTHEON, "child2-live", "opponent");
    expect(leona.learned).toBe(true);
    expect(leona.checkpoints.map((c) => c.node)).toEqual([0]);
    expect(current(leona).entries.armor).toMatchObject({ display: "50", how: "learned", step: 1, level: 3 });
  });

  it("after Leona buys Cloth Armor, the current state states 65 = Lv 3 base 50.08 + Cloth Armor 15 (served)", () => {
    const leona = notebookAt(PANTHEON, "child3-live", "opponent");
    expect(leona.checkpoints.map((c) => [c.node, c.level, c.note])).toEqual([
      [0, 3, null], [1, 3, "Leona buys Cloth Armor."]]);
    expect(leona.current).toBe(1);
    const armor = current(leona).entries.armor!;
    expect(armor).toMatchObject({ display: "65", how: "stated", step: 4, level: 3, exact: 65.08 });
    expect(armor.sources).toEqual([
      { kind: "level", level: 3, value: 50.08 }, { kind: "item", itemId: 1029, name: "Cloth Armor", value: 15 }]);
    expect(entryBasis(armor)).toBe("Lv 3 · Cloth Armor");
    // The earlier state keeps what was learned in it — never overwritten.
    expect(leona.checkpoints[0].entries.armor).toMatchObject({ display: "50", how: "learned" });
  });

  it("at level 4 the current state is a third checkpoint: 69 = Lv 4 base 53.872 + Cloth Armor 15", () => {
    const leona = notebookAt(PANTHEON, "child4-live", "opponent");
    expect(leona.checkpoints.map((c) => c.node)).toEqual([0, 1, 3]);
    const armor = current(leona).entries.armor!;
    expect(armor).toMatchObject({ display: "69", level: 4, exact: 68.872 });
    expect(armor.sources[0]).toEqual({ kind: "level", level: 4, value: 53.872 });
    // Two served transitions lead into this state (the node between them is
    // never on screen): the note names both, never only the last.
    expect(current(leona).note).toBe("Both champions reach level 4. Pantheon buys a Long Sword.");
  });

  it("never a state the learner has not reached", () => {
    const leona = notebookAt(PANTHEON, "child0-live", "opponent");
    expect(leona.checkpoints.map((c) => c.node)).toEqual([0]);
    expect(current(leona).entries).toEqual({});
  });
});
