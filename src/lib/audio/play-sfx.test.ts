import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SOUND_DEFAULTS } from "@/hooks/useSoundSettings";

const canonical = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), preload: vi.fn() }));
vi.mock("./useSfx", () => ({ useSfx: () => canonical }));

import { mogzyAudio } from "./engine";
import { PLAY_SFX_CUES, playSfxEngine } from "./play-sfx";
import { LEGACY_PLAY_SFX_EVENT, SFX_REGISTRY } from "./sfx-registry";
import { PLAY_SFX_SETTING_KEY, usePlaySfx } from "./usePlaySfx";

beforeEach(() => vi.clearAllMocks());

describe("PLAY1 canonical compatibility", () => {
  it("maps every legacy cue to one semantic event and one persisted setting", () => {
    expect(PLAY_SFX_CUES).toHaveLength(11);
    expect(Object.keys(LEGACY_PLAY_SFX_EVENT).sort()).toEqual([...PLAY_SFX_CUES].sort());
    expect(Object.keys(PLAY_SFX_SETTING_KEY).sort()).toEqual([...PLAY_SFX_CUES].sort());
    expect(new Set(Object.values(PLAY_SFX_SETTING_KEY)).size).toBe(PLAY_SFX_CUES.length);
    for (const cue of PLAY_SFX_CUES) {
      expect(SFX_REGISTRY[LEGACY_PLAY_SFX_EVENT[cue]].legacySettingKey).toBe(PLAY_SFX_SETTING_KEY[cue]);
      expect(SOUND_DEFAULTS).toHaveProperty(PLAY_SFX_SETTING_KEY[cue]);
    }
  });

  it("routes the React adapter through canonical semantics", () => {
    const { result } = renderHook(() => usePlaySfx());
    result.current.play("scrollOpen");
    result.current.play("roleStep");
    result.current.play("opponentFound");
    expect(canonical.play.mock.calls).toEqual([
      ["ranked.record.open"],
      ["ranked.role.step"],
      ["ranked.opponent.found"],
    ]);
  });

  it("keeps its adapter identity stable", () => {
    const { result, rerender } = renderHook(() => usePlaySfx());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("routes the non-React/Admin adapter through the same controller", () => {
    const spy = vi.spyOn(mogzyAudio, "playSfx").mockImplementation(() => {});
    playSfxEngine.play("bookRuffle");
    expect(spy).toHaveBeenCalledWith("hub.book.open", { bypassLegacySetting: true });
  });

  it("never throws into an application action", () => {
    canonical.play.mockImplementation(() => { throw new Error("audio failed"); });
    const { result } = renderHook(() => usePlaySfx());
    expect(() => result.current.play("modeConfirm")).not.toThrow();
  });

  it("preserves the proven per-cue replay intervals", () => {
    expect(SFX_REGISTRY["ranked.role.step"].minReplayMs).toBe(40);
    expect(SFX_REGISTRY["ui.button.press"].minReplayMs).toBe(40);
    expect(SFX_REGISTRY["ranked.record.open"].minReplayMs).toBe(250);
    expect(SFX_REGISTRY["ranked.queue.start"].minReplayMs).toBe(400);
    expect(SFX_REGISTRY["ranked.opponent.found"].minReplayMs).toBe(400);
    expect(SFX_REGISTRY["hub.book.land"].minReplayMs).toBe(40);
    expect(SFX_REGISTRY["hub.book.open"].minReplayMs).toBe(220);
  });
});
