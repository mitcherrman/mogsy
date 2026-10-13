/**
 * MPE — the reward cues in the registry: their own voices, their place in the
 * hierarchy, and that each renders a short phrase through the shared helpers.
 */
import { describe, expect, it, vi } from "vitest";
import { SFX_REGISTRY, getSfxGenerator, type SfxEvent } from "./sfx-registry";
import { SFX_GENERATORS } from "./sfx-renderers";

/** The smallest AudioContext the voice helpers need, recording what they schedule. */
function fakeContext() {
  let lastStop = 0;
  let oscillators = 0;
  let noises = 0;
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBiquadFilter: () => ({ type: "", Q: param(), frequency: param(), connect: vi.fn() }),
    createBuffer: (_c: number, length: number) => ({
      duration: length / 48000, getChannelData: () => new Float32Array(length),
    }),
    createOscillator: () => ({
      type: "sine", frequency: param(), connect: vi.fn(),
      start: vi.fn(() => { oscillators += 1; }),
      stop: vi.fn((at: number) => { lastStop = Math.max(lastStop, at); }),
    }),
    createBufferSource: () => ({
      buffer: null, loop: false, playbackRate: param(), connect: vi.fn(),
      start: vi.fn(() => { noises += 1; }),
      stop: vi.fn((at: number) => { lastStop = Math.max(lastStop, at); }),
    }),
  } as unknown as AudioContext;
  return { context, counts: () => ({ oscillators, noises, lastStop }) };
}

const gain = (event: SfxEvent) => SFX_REGISTRY[event].relativeGain;

describe("the reward cues", () => {
  it("give the discovery its OWN voice, not the per-module award phrase", () => {
    const entry = SFX_REGISTRY["ranked.discovery.reveal"];
    expect(entry.builtInGeneratorId).toBe("sfx.reward.discovery");
    expect(getSfxGenerator(entry.builtInGeneratorId)).toBe(SFX_GENERATORS["sfx.reward.discovery"]);
    expect(getSfxGenerator(entry.builtInGeneratorId))
      .not.toBe(SFX_GENERATORS["sfx.ranked.points-awarded"]);
  });

  it("give earned Academy XP its own voice, with a replay window that absorbs a double mount", () => {
    const entry = SFX_REGISTRY["reward.xp.earned"];
    expect(entry.builtInGeneratorId).toBe("sfx.reward.xp-earned");
    expect(getSfxGenerator(entry.builtInGeneratorId)).toBe(SFX_GENERATORS["sfx.reward.xp-earned"]);
    expect(entry.minReplayMs).toBeGreaterThanOrEqual(1000);
  });

  it("sit below the match result and above a module award", () => {
    expect(gain("ranked.match.victory")).toBeGreaterThan(gain("ranked.discovery.reveal"));
    expect(gain("ranked.discovery.reveal")).toBeGreaterThan(gain("reward.xp.earned"));
    expect(gain("reward.xp.earned")).toBeGreaterThan(gain("ranked.points.awarded"));
  });

  it("each renders a short phrase — several voices, finished well inside a second", () => {
    for (const id of ["sfx.reward.discovery", "sfx.reward.xp-earned"] as const) {
      const { context, counts } = fakeContext();
      const output = context.createGain();
      SFX_GENERATORS[id](context, output, 0);
      const after = counts();
      expect(after.oscillators).toBeGreaterThanOrEqual(3);
      expect(after.lastStop).toBeGreaterThan(0.4);
      expect(after.lastStop).toBeLessThan(1.1);
    }
  });

  it("the discovery cue carries the page's paper breath; the XP cue is tones only", () => {
    const discovery = fakeContext();
    SFX_GENERATORS["sfx.reward.discovery"](discovery.context, discovery.context.createGain(), 0);
    expect(discovery.counts().noises).toBe(1);
    const xp = fakeContext();
    SFX_GENERATORS["sfx.reward.xp-earned"](xp.context, xp.context.createGain(), 0);
    expect(xp.counts().noises).toBe(0);
  });
});
