import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./audio-studio-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audio-studio-config")>();
  return { ...actual, loadAudioStudioConfig: mocks.load };
});

import { parseAudioStudioConfig } from "./audio-studio-config";
import {
  clampEffectiveVolume,
  getAudioStudioRuntimeSnapshot,
  invalidateAudioStudioRuntime,
  loadAudioStudioRuntime,
  refreshAudioStudioRuntime,
  resetAudioStudioRuntimeForTests,
  resolveModeSoundtrack,
  resolveRuntimeAsset,
  resolveRuntimePlaylist,
  storagePublicUrl,
} from "./audio-studio-runtime";

const config = () => parseAudioStudioConfig({
  assets: [
    { id: "bundled", kind: "music", title: "Bundled", source_type: "bundled",
      source_url: "/audio/music/a.webm", mime_type: "audio/webm", relative_gain: 0.8 },
    { id: "stored", kind: "music", title: "Stored", artist: "Artist", source_type: "storage",
      storage_path: "music/ranked theme.mp3", artwork_storage_path: "art/ranked.png",
      mime_type: "audio/mpeg", duration_ms: 120000 },
    { id: "external", kind: "music", title: "External", source_type: "external",
      source_url: "https://cdn.example/music.ogg", artwork_url: "https://cdn.example/art.png",
      mime_type: "audio/ogg" },
    { id: "disabled", kind: "music", title: "Disabled", source_type: "bundled",
      source_url: "/audio/disabled.mp3", mime_type: "audio/mpeg", enabled: false },
    { id: "traversal", kind: "music", title: "Traversal", source_type: "storage",
      storage_path: "music/../secret.mp3", mime_type: "audio/mpeg" },
    { id: "bad-bundled", kind: "music", title: "Bad", source_type: "bundled",
      source_url: "/audio/../secret.mp3", mime_type: "audio/mpeg" },
  ],
  playlists: [
    { id: "radio", slug: "academy-radio", name: "Academy Radio", shuffle_mode: "ordered" },
    { id: "empty", slug: "empty", name: "Empty", shuffle_mode: "ordered" },
  ],
  playlistItems: [
    { playlist_id: "radio", audio_asset_id: "stored", position: 2 },
    { playlist_id: "radio", audio_asset_id: "disabled", position: 1 },
    { playlist_id: "radio", audio_asset_id: "bundled", position: 0 },
    { playlist_id: "radio", audio_asset_id: "external", position: 3, enabled: false },
    { playlist_id: "empty", audio_asset_id: "traversal", position: 0 },
  ],
  modeBindings: [
    { mode_key: "ranked", source_type: "none", start_behavior: "restart", exit_behavior: "return-to-radio" },
    { mode_key: "asset-mode", source_type: "asset", audio_asset_id: "stored",
      start_behavior: "restart", exit_behavior: "fade" },
    { mode_key: "playlist-mode", source_type: "playlist", playlist_id: "radio",
      start_behavior: "random", exit_behavior: "stop" },
  ],
});

beforeEach(() => {
  resetAudioStudioRuntimeForTests();
  mocks.load.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
});
afterEach(() => vi.unstubAllEnvs());

describe("Audio Studio runtime", () => {
  it("shares concurrent loading and reuses the successful cache", async () => {
    let resolve!: (value: ReturnType<typeof config>) => void;
    mocks.load.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = loadAudioStudioRuntime();
    const concurrent = loadAudioStudioRuntime();
    expect(first).toBe(concurrent);
    expect(mocks.load).toHaveBeenCalledOnce();
    resolve(config());
    expect((await first).status).toBe("available");
    expect((await loadAudioStudioRuntime()).fromCache).toBe(true);
    expect(mocks.load).toHaveBeenCalledOnce();
  });

  it("fails soft and retains the last good config as stale", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    expect(await loadAudioStudioRuntime()).toMatchObject({ status: "unavailable", reason: "offline" });
    mocks.load.mockResolvedValueOnce(config());
    expect((await refreshAudioStudioRuntime()).status).toBe("available");
    mocks.load.mockRejectedValueOnce(new Error("offline again"));
    const stale = await refreshAudioStudioRuntime();
    expect(stale.status).toBe("stale");
    expect(stale.config.assets.length).toBeGreaterThan(0);
    invalidateAudioStudioRuntime();
    expect(getAudioStudioRuntimeSnapshot().status).toBe("idle");
  });

  it("normalizes supported sources and rejects disabled or unsafe assets", () => {
    const rows = config();
    expect(resolveRuntimeAsset(rows, "bundled")?.sources[0].src).toBe("/audio/music/a.webm");
    expect(resolveRuntimeAsset(rows, "stored")).toMatchObject({
      artist: "Artist", durationMs: 120000,
      artworkUrl: "https://project.supabase.co/storage/v1/object/public/audio-studio/art/ranked.png",
      sources: [{ src: "https://project.supabase.co/storage/v1/object/public/audio-studio/music/ranked%20theme.mp3" }],
    });
    expect(resolveRuntimeAsset(rows, "external")?.artworkUrl).toBe("https://cdn.example/art.png");
    for (const id of ["disabled", "traversal", "bad-bundled", "missing"]) {
      expect(resolveRuntimeAsset(rows, id)).toBeNull();
    }
    expect(storagePublicUrl("/absolute.mp3")).toBeNull();
    expect(storagePublicUrl("music//empty.mp3")).toBeNull();
  });

  it("preserves playlist order while filtering disabled and invalid entries", () => {
    expect(resolveRuntimePlaylist(config(), "academy-radio")?.tracks.map((track) => track.id))
      .toEqual(["bundled", "stored"]);
    expect(resolveRuntimePlaylist(config(), "empty")).toBeNull();
  });

  it("resolves Ranked none and valid future binding forms", () => {
    const rows = config();
    expect(resolveModeSoundtrack("ranked", rows)).toEqual({ sourceType: "none", reason: "configured" });
    expect(resolveModeSoundtrack("asset-mode", rows)).toMatchObject({ sourceType: "asset", asset: { id: "stored" } });
    expect(resolveModeSoundtrack("playlist-mode", rows)).toMatchObject({ sourceType: "playlist" });
    expect(resolveModeSoundtrack("missing", rows)).toEqual({ sourceType: "none", reason: "missing" });
  });

  it("clamps channel volume after relative gain", () => {
    expect(clampEffectiveVolume(0.25, 2)).toBe(0.5);
    expect(clampEffectiveVolume(0.8, 4)).toBe(1);
    expect(clampEffectiveVolume(0.5, -2)).toBe(0);
  });
});
