import { beforeEach, describe, expect, it, vi } from "vitest";

import { mogzyAudio } from "@/lib/audio/engine";
import type { SfxController } from "@/lib/audio/types";
import { DEFAULT_SFX, type BroadcastSfx } from "./types";
import { playBroadcastSfx, unlockBroadcastAudio } from "./sfx";

const configured = (): BroadcastSfx => ({
  ...DEFAULT_SFX,
  enabled: true,
  masterVolume: 0.5,
  sounds: {
    questionStart: { enabled: true, src: "/broadcast/question.mp3", volume: 0.8 },
    countdownTick: { enabled: true, src: "/broadcast/tick.mp3", volume: 0.7 },
    reveal: { enabled: true, src: "/broadcast/reveal.mp3", volume: 0.6 },
    correctAnswer: { enabled: true, src: "/broadcast/correct.mp3", volume: 0.5 },
    transition: { enabled: true, src: "/broadcast/transition.mp3", volume: 0.4 },
  },
});

function controller(contextState: "locked" | "running" = "running", muted = false) {
  return {
    getSnapshot: vi.fn(() => ({ muted, configReady: true, contextState })),
    subscribe: vi.fn(() => () => {}),
    play: vi.fn(),
    stop: vi.fn(),
    preload: vi.fn(),
    unlock: vi.fn(async () => true),
    refreshMute: vi.fn(),
  } satisfies SfxController;
}

beforeEach(() => vi.restoreAllMocks());

describe("Broadcast canonical SFX adapter", () => {
  it("maps every active Broadcast cue and keeps persisted asset gain private", async () => {
    const canonical = controller();
    vi.spyOn(mogzyAudio, "getSfx").mockReturnValue(canonical);
    const sfx = configured();
    const cases = [
      ["questionStart", "broadcast.question.start"],
      ["countdownTick", "broadcast.countdown.tick"],
      ["reveal", "broadcast.reveal"],
      ["correctAnswer", "broadcast.answer.correct"],
      ["transition", "broadcast.transition"],
    ] as const;

    for (const [local, semantic] of cases) {
      await expect(playBroadcastSfx(local, sfx, `session:${local}`)).resolves.toBe("played");
      expect(canonical.play).toHaveBeenLastCalledWith(semantic, {
        eventId: `session:${local}`,
        configuredAsset: {
          src: sfx.sounds[local].src,
          relativeGain: sfx.masterVolume * sfx.sounds[local].volume,
        },
      });
    }
  });

  it("honors Broadcast enable policy and the global visitor mute", async () => {
    const canonical = controller("running", true);
    vi.spyOn(mogzyAudio, "getSfx").mockReturnValue(canonical);
    const sfx = configured();
    await expect(playBroadcastSfx("reveal", sfx, "muted")).resolves.toBe("skipped");
    sfx.enabled = false;
    await expect(playBroadcastSfx("reveal", sfx, "disabled")).resolves.toBe("skipped");
    expect(canonical.play).not.toHaveBeenCalled();
  });

  it("reports a locked canonical context and delegates unlock without creating another context", async () => {
    const canonical = controller("locked");
    vi.spyOn(mogzyAudio, "getSfx").mockReturnValue(canonical);
    await expect(playBroadcastSfx("questionStart", configured(), "locked")).resolves.toBe("blocked");
    await expect(unlockBroadcastAudio()).resolves.toBe(true);
    expect(canonical.unlock).toHaveBeenCalledOnce();
    expect(canonical.play).not.toHaveBeenCalled();
  });

  it("fails soft when canonical playback is unavailable or throws", async () => {
    vi.spyOn(mogzyAudio, "getSfx").mockReturnValue(null);
    await expect(playBroadcastSfx("transition", configured(), "missing")).resolves.toBe("error");
    const canonical = controller();
    canonical.play.mockImplementation(() => { throw new Error("optional audio failed"); });
    vi.spyOn(mogzyAudio, "getSfx").mockReturnValue(canonical);
    await expect(playBroadcastSfx("transition", configured(), "throw")).resolves.toBe("error");
  });
});
