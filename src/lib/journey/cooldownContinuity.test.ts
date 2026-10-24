import { describe, expect, it } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import {
  COOLDOWN_WORKING_CONTRACT,
  projectCooldownContinuity,
  readSummonerCooldownWorking,
  SUMMONER_SET_KIND,
} from "./cooldownContinuity";

/** The backend's served `cooldown_working` (ranked_public.mastery_slices). */
const working = (answer: string, multiplier: number, effective: number,
  sources: Array<[string, "rune" | "item", number]>, spell = "Flash") => ({
  source: "mastery_curriculum",
  cooldown_working: {
    contract: COOLDOWN_WORKING_CONTRACT, spell, base_cooldown: 300,
    summoner_spell_haste: sources.reduce((n, s) => n + s[2], 0),
    sources: sources.map(([name, kind, haste]) => ({ name, kind, summoner_spell_haste: haste })),
    cooldown_multiplier: multiplier, effective_cooldown: effective, unit: "seconds", answer,
  },
});
const BASE = working("300s", 1, 300, []);
const IONIAN = working("272.7s", 100 / 110, 272.72727, [["Ionian Boots of Lucidity", "item", 10]]);
const CRIMSON = working("250s", 100 / 120, 250, [["Crimson Lucidity", "item", 20]]);
const CI_IONIAN = working("234.4s", 0.78125, 234.375,
  [["Cosmic Insight", "rune", 18], ["Ionian Boots of Lucidity", "item", 10]]);

/** The server's frozen marker for the child at `position` of a set at rounds 4-6. */
const marker = (position: number, kind = SUMMONER_SET_KIND) => ({ kind, sequence: "ls_x", position, of: 3 });
const project = (position: number, settled: Record<number, object>, revealed: boolean,
  kind = SUMMONER_SET_KIND) =>
  projectCooldownContinuity({
    linkedSet: marker(position, kind), roundNumber: 3 + position,
    explanations: new Map(Object.entries(settled).map(([k, v]) => [Number(k), v as Record<string, unknown>])),
    currentRevealed: revealed,
  });

describe("reading the served working", () => {
  it("accepts the contract and refuses anything else", () => {
    expect(readSummonerCooldownWorking(IONIAN)?.answer).toBe("272.7s");
    expect(readSummonerCooldownWorking(null)).toBeNull();
    expect(readSummonerCooldownWorking({ cooldown_working: { contract: "other" } })).toBeNull();
    expect(readSummonerCooldownWorking({
      cooldown_working: { ...IONIAN.cooldown_working, sources: [{ name: "X", kind: "boots" }] },
    })).toBeNull();
  });
});

describe("activation by the explicit linked-set marker", () => {
  it("activates for a Summoner Spell set child, at its position", () => {
    const c = project(1, {}, false)!;
    expect(c.current).toBe(1);
    expect(c.stages.map((s) => s.stage)).toEqual([1, 2, 3]);
    expect(c.spell).toBeNull();
    expect(c.stages.every((s) => s.working === null)).toBe(true);
  });

  it("is not drawn without a marker or for another kind of linked set", () => {
    expect(projectCooldownContinuity({ linkedSet: null, roundNumber: 4,
      explanations: new Map([[4, BASE]]), currentRevealed: true })).toBeNull();
    expect(project(1, {}, false, "some_other_set")).toBeNull();
  });

  it("finds its siblings from the marker's position", () => {
    // Round 6 is position 3: its siblings are rounds 4 and 5.
    const c = project(3, { 4: BASE, 5: IONIAN, 7: CRIMSON }, false)!;
    expect(c.current).toBe(3);
    expect(c.stages.map((s) => s.working?.answer ?? null)).toEqual(["300s", "272.7s", null]);
  });
});

describe("the carried cooldown", () => {
  it("never reads the round on screen before its reveal", () => {
    const c = project(2, { 4: BASE, 5: IONIAN }, false)!;
    expect(c.stages[0].working?.answer).toBe("300s");
    expect(c.stages[1].working).toBeNull();
    expect(c.stages[2].working).toBeNull();
  });

  it("after a reload with a partial ledger, a missing sibling reads withheld", () => {
    // Only the latest settlement survived (resume carries the latest).
    const c = project(3, { 5: IONIAN }, false)!;
    expect(c.stages[0].working).toBeNull();
    expect(c.stages[1].working?.answer).toBe("272.7s");
    expect(c.spell).toBe("Flash");
  });

  it("adds a source after the reveal", () => {
    const c = project(2, { 4: BASE, 5: IONIAN }, true)!;
    expect(c.spell).toBe("Flash");
    expect(c.stages[1].change).toEqual({ kind: "add",
      source: { name: "Ionian Boots of Lucidity", kind: "item", summonerSpellHaste: 10 } });
  });

  it("path A: Ionian Boots are UPGRADED to Crimson Lucidity, never stacked", () => {
    const c = project(3, { 4: BASE, 5: IONIAN, 6: CRIMSON }, true)!;
    expect(c.stages[2].change).toEqual({ kind: "upgrade", from: "Ionian Boots of Lucidity",
      to: { name: "Crimson Lucidity", kind: "item", summonerSpellHaste: 20 } });
  });

  it("paths B-D: a second source stacks on the first", () => {
    expect(project(3, { 4: BASE, 5: IONIAN, 6: CI_IONIAN }, true)!.stages[2].change?.kind).toBe("add");
  });

  it("refuses a chain that mixes spells", () => {
    const ghost = working("218.2s", 100 / 110, 218.18, [["Ionian Boots of Lucidity", "item", 10]], "Ghost");
    expect(project(3, { 4: BASE, 5: ghost }, false)).toBeNull();
  });
});

describe("the segment contract carries the marker", () => {
  const withSegment = (segment: object) => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment = segment;
    return readPublicRound(body).segment;
  };
  const quiz = { module_id: "quiz", module_version: 2, challenge_count: 1, challenge_index: 0 };

  it("reads segment.linked_set", () => {
    expect(withSegment({ ...quiz, linked_set: marker(2) }).linkedSet).toEqual(marker(2));
  });

  it("adds nothing for a null marker and drops a malformed one", () => {
    expect(withSegment({ ...quiz, linked_set: null })).not.toHaveProperty("linkedSet");
    expect(withSegment({ ...quiz, linked_set: { kind: "x", sequence: "s", position: 4, of: 3 } })
      .linkedSet).toBeNull();
  });
});
