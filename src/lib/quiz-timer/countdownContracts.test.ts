/**
 * MISC W2D — the audio and stylesheet contracts behind the countdown:
 * built-in, audible-by-default voices under the shared controls, and a pulse
 * that never lays out and that reduced motion stills.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getSfxGenerator, getSfxRegistryEntry, SFX_REGISTRY } from "@/lib/audio/sfx-registry";
import { SFX_GENERATORS } from "@/lib/audio/sfx-renderers";
import { COUNTDOWN_SFX_EVENT } from "./useCountdownFeedback";

function fakeContext() {
  let oscillators = 0;
  let lastStop = 0;
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn() });
  const context = {
    sampleRate: 48000,
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: "", Q: param(), frequency: param() }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, playbackRate: param(),
      start: vi.fn(), stop: vi.fn((t: number) => { lastStop = Math.max(lastStop, t); }) }),
    createOscillator: () => ({ ...node(), type: "sine", frequency: param(),
      start: vi.fn(() => { oscillators += 1; }), stop: vi.fn((t: number) => { lastStop = Math.max(lastStop, t); }) }),
  } as unknown as AudioContext;
  return { context, counts: () => ({ oscillators, lastStop }) };
}

describe("countdown voices", () => {
  it("are built in (audible by default), unlike the silent broadcast tick seam", () => {
    for (const event of [...Object.values(COUNTDOWN_SFX_EVENT), "quiz.answer.timeout"] as const) {
      const entry = getSfxRegistryEntry(event)!;
      expect(entry.group).toBe("quiz");
      expect(getSfxGenerator(entry.builtInGeneratorId)).not.toBeNull();
      // No legacy per-browser toggle: the global mute and Audio Studio govern it.
      expect(entry.legacySettingKey).toBeUndefined();
    }
    expect(getSfxRegistryEntry("broadcast.countdown.tick")?.builtInGeneratorId).toBeUndefined();
  });

  it("escalate in weight: warn < strong < final, and TIME'S UP sits below a match result", () => {
    const g = (e: keyof typeof SFX_REGISTRY) => SFX_REGISTRY[e].relativeGain;
    expect(g("quiz.countdown.tick")).toBeLessThan(g("quiz.countdown.urgent"));
    expect(g("quiz.countdown.urgent")).toBeLessThan(g("quiz.countdown.final"));
    expect(g("quiz.answer.timeout")).toBeLessThan(g("ranked.match.victory"));
  });

  it("each knock ends well inside its second, so consecutive beats never overlap", () => {
    for (const id of ["sfx.quiz.countdown-tick", "sfx.quiz.countdown-urgent", "sfx.quiz.countdown-final"] as const) {
      const { context, counts } = fakeContext();
      SFX_GENERATORS[id](context, context.createGain(), 0);
      expect(counts().oscillators).toBeGreaterThanOrEqual(1);
      expect(counts().lastStop).toBeLessThan(0.25);
    }
    const timeout = fakeContext();
    SFX_GENERATORS["sfx.quiz.answer-timeout"](timeout.context, timeout.context.createGain(), 0);
    expect(timeout.counts().oscillators).toBe(3);
    expect(timeout.counts().lastStop).toBeLessThan(0.6);
  });

  it("the replay window is shorter than a second (beats) and a full second for TIME'S UP", () => {
    for (const e of Object.values(COUNTDOWN_SFX_EVENT)) expect(SFX_REGISTRY[e].minReplayMs).toBeLessThan(1000);
    expect(SFX_REGISTRY["quiz.answer.timeout"].minReplayMs).toBeGreaterThanOrEqual(1000);
  });
});

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");
const block = (() => {
  const start = CSS.indexOf("/* ===== MISC W2D (F11/F12)");
  const end = CSS.indexOf("/* ===== RG — the round timeline");
  return CSS.slice(start, end);
})();

describe("countdown stylesheet", () => {
  it("exists, between the urgent breath and the round timeline", () => {
    expect(block.length).toBeGreaterThan(200);
    expect(CSS.indexOf(".ranked-timer-urgent {")).toBeLessThan(CSS.indexOf("/* ===== MISC W2D (F11/F12)"));
  });

  it("animates only transform and paint — never a property that lays out", () => {
    const keyframes = block.match(/@keyframes [\s\S]*?\n}\n/g) ?? [];
    expect(keyframes.length).toBe(2);
    for (const k of keyframes) {
      expect(k).not.toMatch(/\b(width|height|margin|padding|top|left|right|bottom|font-size|line-height|inset)\s*:/);
    }
  });

  it("escalates 5–4 < 3–2 < 1 in scale", () => {
    const scale = (i: string) => Number(new RegExp(`\\[data-countdown-intensity="${i}"\\][^}]*--qc-scale:\\s*([\\d.]+)`).exec(block)?.[1]);
    expect(scale("warn")).toBeLessThan(scale("strong"));
    expect(scale("strong")).toBeLessThan(scale("final"));
  });

  it("honours BOTH reduced-motion switches: the OS query and the app's html.reduce-motion", () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-countdown\] > \.quiz-countdown-digits \{\s*animation: none;\s*transform: none;/);
    expect(block).toMatch(/html\.reduce-motion \[data-countdown\] > \.quiz-countdown-digits \{\s*animation: none !important;\s*transform: none;/);
  });

  it("stamps the timeout only from the settlement attributes", () => {
    expect(block).toContain('.ranked-result-stamp[data-timeout="true"]');
    expect(block).toContain('[data-testid="central-result-verdict"][data-timeout="true"]');
  });
});
