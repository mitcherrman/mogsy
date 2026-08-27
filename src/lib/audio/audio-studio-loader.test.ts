import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

import { loadAudioStudioConfig } from "./audio-studio-config";

describe("Audio Studio Supabase loader", () => {
  beforeEach(() => mocks.from.mockReset());

  it("reads all five runtime authorities without writes", async () => {
    const select = vi.fn(async () => ({ data: [], error: null }));
    mocks.from.mockReturnValue({ select });
    await loadAudioStudioConfig();
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "audio_assets",
      "audio_playlists",
      "audio_playlist_items",
      "audio_event_bindings",
      "audio_mode_bindings",
    ]);
    expect(select).toHaveBeenCalledTimes(5);
    expect(select).toHaveBeenCalledWith("*");
  });

  it("fails the aggregate load when any authority is unavailable", async () => {
    mocks.from.mockImplementation((table: string) => ({
      select: async () => table === "audio_playlists"
        ? { data: null, error: { message: "playlist unavailable" } }
        : { data: [], error: null },
    }));
    await expect(loadAudioStudioConfig()).rejects.toThrow("playlist unavailable");
  });
});
