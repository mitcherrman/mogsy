/**
 * SCRUB — the Wave / XP adapter over the REAL `scrub.v1` wire (SCRUB-S2).
 *
 * Every figure is the server's, the pre-reveal content carries nothing that
 * names the answer, and the reveal (verdict included) is read off the server's
 * own `ScrubChallengeReveal`. Ported from SCRUB-S1, whose same assertions ran
 * against the prototype capture.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import capture from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";
import {
  readOwnChallengeReveal, readPrivatePlayer, type ScrubBlockView, type ScrubChallengeReveal,
} from "@/lib/ranked-public/contracts";
import { levelFill, lockedTokenOf, toChronoscopePublic, toChronoscopeReveal, toWaveXpScene } from "./waveXpChronoscope";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;

function blockOf(body: unknown): ScrubBlockView {
  const block = readPrivatePlayer(body).segmentState!.block;
  if (block?.contract !== "scrub") throw new Error("not a scrub block");
  return block;
}
function revealOf(ack: any): ScrubChallengeReveal {
  return readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "scrub").scrub!;
}

const seg1 = blockOf(C.private_before_bot_lock_correct);
const seg2 = blockOf(C.private_before_bot_lock_wrong);
const right = revealOf(C.submit_accepted_bot_settled_correct);
const wrong = revealOf(C.submit_accepted_bot_settled_wrong);

describe("pre-reveal content", () => {
  const pub = toChronoscopePublic(seg1);

  it("has one checkpoint per served checkpoint, in rail order, with the server's strings", () => {
    expect(pub.checkpoints).toHaveLength(15);
    pub.checkpoints.forEach((c, i) => {
      const cp = seg1.checkpoints[i];
      expect(c.token).toBe(cp.token);
      expect(c.label).toBe(`Wave ${cp.waveNumber}`);
      expect(c.clock).toBe(cp.spawnTimeDisplay);
      expect(c.emphasised).toBe(cp.isCannonWave);
      expect(c.reading).toEqual([
        { label: "Level", value: String(cp.level) }, { label: "XP", value: cp.cumulativeXp }]);
      expect(c.scene.xpDisplay).toBe(cp.cumulativeXp);
      expect(c.scene.waveXpDisplay).toBe(`+${cp.waveXp}`);
      expect(c.scene.nextLevelXpDisplay).toBe(cp.levelCeilingXp);
      expect(c.scene.melee).toBe(cp.meleeCount);
      expect(c.scene.cannon).toBe(cp.cannonCount);
      expect(c.scene.lane).toBe(seg1.objective.lane);
    });
    expect(pub.prompt).toBe(seg1.prompt);
    expect(pub.eyebrow).toBe(`Chronoscope · ${seg1.objective.lane === "duo" ? "Duo" : "Solo"} lane · Patch 26.15`);
    expect(pub.footnote).toBe(seg1.footnote);
  });

  it("NEVER carries the answer, a breakpoint note, a satisfied flag or the proof", () => {
    for (const [block, reveal] of [[seg1, right], [seg2, wrong]] as const) {
      const text = JSON.stringify(toChronoscopePublic(block));
      expect(text).not.toMatch(/canonical|satisfied|breakpoint|threshold|proof|traverse/i);
      for (const r of [reveal.proof.before, reveal.proof.after]) {
        if (r?.breakpointNote) expect(text).not.toContain(r.breakpointNote);
      }
      const keys = new Set(toChronoscopePublic(block).checkpoints.map((c) => Object.keys(c).sort().join(",")));
      expect(keys.size).toBe(1);
    }
  });

  it("marks every cannon wave alike and only cannon waves", () => {
    expect(pub.checkpoints.map((c) => c.emphasised)).toEqual(seg1.checkpoints.map((c) => c.isCannonWave));
    expect(pub.checkpoints.filter((c) => c.emphasised)).toHaveLength(5);
  });

  it("rail marks sit on real checkpoints", () => {
    expect(pub.railMarks?.map((m) => [m.index, m.text])).toEqual([[0, "0:30"], [4, "2:30"], [9, "5:00"], [14, "7:30"]]);
  });
});

describe("the gauge ratio", () => {
  it("is the only arithmetic, and only draws", () => {
    expect(levelFill("774.15", "660", "1140")).toBeCloseTo((774.15 - 660) / 480, 6);
    expect(levelFill("0", "0", "280")).toBe(0);
    expect(levelFill("5", "0", null)).toBe(1);
    expect(levelFill("5", "10", "10")).toBe(1);
    const scene = toWaveXpScene(seg1.checkpoints[3], seg1.objective.lane);
    expect(scene.levelFill).toBeGreaterThan(0);
    expect(scene.levelFill).toBeLessThan(1);
  });

  it("the adapter does not sum XP, derive a level or grade (source contract)", () => {
    const src = readFileSync(path.resolve("src/lib/scrub/waveXpChronoscope.ts"), "utf8");
    expect((src.match(/Number\(/g) ?? []).length).toBeLessThanOrEqual(5);
    expect(src).not.toMatch(/\+\s*Number\(|Number\([^)]*\)\s*\+/);
    // The verdict is the server's: no token comparison decides correctness.
    expect(src).not.toMatch(/isCorrect\s*[:=]\s*[^,;\n]*===/);
    expect(src).toMatch(/isCorrect: reveal\.isCorrect/);
  });
});

describe("the reveal", () => {
  it("an exact lock confirms without travel and proves the first checkpoint", () => {
    const r = toChronoscopeReveal(seg1, right);
    expect(r.lockedToken).toBe(C.meta.canonical["1"]);
    expect(r.canonicalToken).toBe(C.meta.canonical["1"]);
    expect(r.isCorrect).toBe(true);
    expect(r.note).toBeNull();
    expect(r.proof.after).toMatchObject({ token: right.proof.after.token, satisfied: true });
    expect(r.proof.after.lines[1].value).toBe(right.proof.after.cumulativeXp);
    if (right.proof.before) {
      expect(r.proof.before).toMatchObject({ token: right.proof.before.token, satisfied: false });
      expect(r.proof.before!.lines[1].value).toBe(right.proof.before.cumulativeXp);
    }
    expect(r.proof.thresholdLine).toContain(right.proof.thresholdXp!);
  });

  it("a wrong lock keeps the chosen marker, names the canonical one and teaches", () => {
    const r = toChronoscopeReveal(seg2, wrong);
    expect(r.lockedToken).toBe(C.meta.submitted["2"]);
    expect(lockedTokenOf(wrong)).toBe(C.meta.submitted["2"]);
    expect(r.canonicalToken).toBe(C.meta.canonical["2"]);
    expect(r.isCorrect).toBe(false);
    const lockedWave = Number(String(C.meta.submitted["2"]).slice(1));
    const canonWave = Number(String(C.meta.canonical["2"]).slice(1));
    expect(r.note).toBe(wrong.satisfiedCheckpoints.includes(C.meta.submitted["2"])
      ? `Wave ${lockedWave} reaches it too — wave ${canonWave} was first.`
      : expect.any(String));
  });

  it("teaches an early lock, a late lock and a non-cannon lock in the host's words", () => {
    const early = { ...wrong, checkpoint: "w2", traversePath: ["w2"], satisfiedCheckpoints: wrong.satisfiedCheckpoints };
    const lv = seg2.checkpoints[1].level;
    expect(toChronoscopeReveal(seg2, early).note).toBe(`At wave 2 the lane was still Level ${lv}.`);
    const cannon = { ...wrong, checkpoint: "w4", traversePath: ["w4"], satisfiedCheckpoints: ["w6", "w9"],
      proof: { ...wrong.proof, cannonOnly: true } };
    expect(toChronoscopeReveal(seg2, cannon).note).toBe("Wave 4 is not a cannon wave.");
  });

  it("the verdict is the server's even if a client would compare tokens differently", () => {
    const disagree = { ...right, isCorrect: false };
    expect(toChronoscopeReveal(seg1, disagree).isCorrect).toBe(false);
  });
});
