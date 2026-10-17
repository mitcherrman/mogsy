/**
 * MISC-W1B F08 — `statedAbilityReferences`, as pure semantics, on EVERY
 * snapshot of every K1-contract capture: the disclosure window, the served
 * value verbatim, one control per ability, and the reached prefix only.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { journeyViewFor } from "./adapter";
import { journeyKnowledge } from "./knowledge";
import { statedAbilityReferences, statedLabel } from "./abilityReference";
import type { CaptureSnapshot } from "./realFixtures";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const CAPTURES = ["jattn1", "jp5", "k1", "m1", "jext", "jref"].flatMap((dir) =>
  readdirSync(join(FIX, dir)).filter((f) => f.endsWith(".json")).map((f) => `${dir}/${f.replace(/\.json$/, "")}`));
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));

/** Every Journey snapshot of a capture, as the board sees it. */
function boards(n: string) {
  return load(n).flatMap((s) => {
    const state = readPublicRound(s.envelope).segmentState;
    if (!state?.journey) return [];
    const view = journeyViewFor(state.journey, {
      ownNextChallengeIndex: state.ownNextChallengeIndex, ownCardStartedAt: state.ownCardStartedAt,
      ownFinished: state.ownFinished,
    }, state.ownChallengeReveals);
    if (!view) return [];
    const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
    const step = view.board.step.index;
    return [{ label: s.label, journey: state.journey, knowledge, step,
      refs: statedAbilityReferences(state.journey, step, knowledge) }];
  });
}

describe("statedAbilityReferences on real captures", () => {
  it("covers the K1 captures (sanity)", () => {
    expect(CAPTURES).toContain("jattn1/pantheon.standard");
    expect(CAPTURES.length).toBeGreaterThan(15);
  });

  it.each(CAPTURES)("%s: only a formula a REACHED child ≤ the step stated, verbatim, never a revealed one", (n) => {
    for (const b of boards(n)) {
      for (const [key, ref] of b.refs) {
        expect(ref.child, `${b.label} ${key}`).toBeLessThanOrEqual(b.step);
        const stating = b.journey.children.find((c) => c.index === ref.child)!;
        const served = stating.learner.states.find((s) => s.fact === ref.fact);
        expect(served?.value, `${b.label} ${key}`).toEqual(ref.formula);
        expect(served?.knowledge?.object?.key).toBe(key);
        // One control per ability: a taught formula is K2's `!`, not a reference.
        expect(b.knowledge.get(key)?.facts.some((f) => f.kind === "ability_damage_formula") ?? false).toBe(false);
      }
    }
  });

  it("Pantheon S-A: c1 / c2 none; from c3's open (child index 2) Pantheon E, stated Step 3", () => {
    const all = boards("jattn1/pantheon.standard");
    for (const b of all) {
      const ids = [...b.refs.keys()];
      if (b.step < 2) expect(ids, b.label).toEqual([]);
      else {
        expect(ids, b.label).toEqual(["player:pantheon:E"]);
        expect(statedLabel(b.refs.get("player:pantheon:E")!.child)).toBe("stated Step 3");
      }
    }
    // The window opens exactly at the stating child's open, not at the beat before it.
    expect(all.find((b) => b.label === "child1-reveal-end")!.refs.size).toBe(0);
    expect(all.find((b) => b.label === "child2-open")!.refs.size).toBe(1);
  });

  it("never reads ahead: the same finished block, asked at an earlier step, offers nothing later", () => {
    const fin = boards("jattn1/pantheon.standard").find((b) => b.label === "finished")!;
    expect(statedAbilityReferences(fin.journey, 1, fin.knowledge).size).toBe(0);
    expect(statedAbilityReferences(fin.journey, 2, fin.knowledge).size).toBe(1);
  });

  it("a restated formula cites its latest statement (Volibear Q: Steps 2 and 4)", () => {
    const b = boards("jattn1/voli.standard").find((x) => x.label === "child4-live")!;
    expect(b.refs.get("player:volibear:Q")?.child).toBe(3);
  });

  it("no block, a re-ask block, or a pre-K1 contract → nothing", () => {
    const fin = boards("jattn1/pantheon.standard").find((b) => b.label === "finished")!;
    expect(statedAbilityReferences(null, 4, fin.knowledge).size).toBe(0);
    expect(statedAbilityReferences({ ...fin.journey, reask: true } as typeof fin.journey, 4, fin.knowledge).size).toBe(0);
    expect(statedAbilityReferences({ ...fin.journey, knowledgeContract: null } as unknown as typeof fin.journey, 4, fin.knowledge).size).toBe(0);
  });
});
