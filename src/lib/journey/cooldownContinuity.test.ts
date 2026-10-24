import { describe, expect, it } from "vitest";

import { readThreeActsPlan, setRoundsFor } from "@/lib/daily-v2/threeActsPlan";
import {
  COOLDOWN_WORKING_CONTRACT,
  projectCooldownContinuity,
  readSummonerCooldownWorking,
  SUMMONER_SLICE_CATEGORY,
} from "./cooldownContinuity";

/** The backend's served `cooldown_working` (ranked_public.mastery_slices). */
const working = (answer: string, multiplier: number, effective: number,
  sources: Array<[string, "rune" | "item", number]>) => ({
  source: "mastery_curriculum",
  cooldown_working: {
    contract: COOLDOWN_WORKING_CONTRACT, spell: "Flash", base_cooldown: 300,
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

const SET = [4, 5, 6];
const project = (roundNumber: number, settled: Record<number, object>, revealed: boolean,
  category: string | null = SUMMONER_SLICE_CATEGORY) =>
  projectCooldownContinuity({
    setRounds: SET, roundNumber, category,
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

describe("the carried cooldown", () => {
  it("opens on the base question with nothing known, withheld", () => {
    const c = project(4, {}, false)!;
    expect(c.current).toBe(1);
    expect(c.spell).toBeNull();
    expect(c.stages.every((s) => s.working === null)).toBe(true);
  });

  it("is not drawn for a round that is not a summoner spell set step", () => {
    expect(project(4, {}, false, "items")).toBeNull();
    // A later stage with no settled working before it is not a set step.
    expect(project(5, {}, false)).toBeNull();
    expect(projectCooldownContinuity({ setRounds: null, roundNumber: 7, category: null,
      explanations: new Map(), currentRevealed: false })).toBeNull();
  });

  it("never reads the round on screen before its reveal", () => {
    // Its settlement is already in the ledger (the reveal beat), but the gate
    // is closed: the stage stays withheld.
    const c = project(5, { 4: BASE, 5: IONIAN }, false)!;
    expect(c.stages[0].working?.answer).toBe("300s");
    expect(c.stages[1].working).toBeNull();
    expect(c.stages[2].working).toBeNull();
  });

  it("adds a source after the reveal", () => {
    const c = project(5, { 4: BASE, 5: IONIAN }, true)!;
    expect(c.spell).toBe("Flash");
    expect(c.stages[1].working?.answer).toBe("272.7s");
    expect(c.stages[1].change).toEqual({ kind: "add",
      source: { name: "Ionian Boots of Lucidity", kind: "item", summonerSpellHaste: 10 } });
  });

  it("path A: Ionian Boots are UPGRADED to Crimson Lucidity, never stacked", () => {
    const c = project(6, { 4: BASE, 5: IONIAN, 6: CRIMSON }, true)!;
    expect(c.stages[2].change).toEqual({ kind: "upgrade", from: "Ionian Boots of Lucidity",
      to: { name: "Crimson Lucidity", kind: "item", summonerSpellHaste: 20 } });
  });

  it("paths B-D: a second source stacks on the first", () => {
    const c = project(6, { 4: BASE, 5: IONIAN, 6: CI_IONIAN }, true)!;
    expect(c.stages[2].change?.kind).toBe("add");
  });

  it("refuses a chain that mixes spells", () => {
    const ghost = { ...IONIAN, cooldown_working: { ...IONIAN.cooldown_working, spell: "Ghost" } };
    expect(project(6, { 4: BASE, 5: ghost }, false)).toBeNull();
  });
});

describe("set rounds from the plan", () => {
  const plan = readThreeActsPlan({
    recipe: "three_acts", recipe_id: "x", segments: 19, answers: 21,
    units: [
      ...[1, 2].map((n) => ({ kind: "set", act_id: "early", set_id: `early.${n}`,
        bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] })),
      { kind: "meta_reflex", cards: 3, card_timer_seconds: 6 },
      ...["mid.1", "mid.2", "late.1", "late.2"].map((id) => ({ kind: "set",
        act_id: id.split(".")[0], set_id: id, bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] })),
    ],
  })!;

  it("maps every set round to its three rounds and the sprint to none", () => {
    expect(setRoundsFor(plan, 1)).toEqual([1, 2, 3]);
    expect(setRoundsFor(plan, 6)).toEqual([4, 5, 6]);
    expect(setRoundsFor(plan, 7)).toBeNull();
    expect(setRoundsFor(plan, 8)).toEqual([8, 9, 10]);
    expect(setRoundsFor(plan, 19)).toEqual([17, 18, 19]);
    expect(setRoundsFor(plan, 20)).toBeNull();
    expect(setRoundsFor(plan, null)).toBeNull();
  });
});
