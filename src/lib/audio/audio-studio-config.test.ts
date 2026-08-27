import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { parseAudioStudioConfig, resolveModeBinding } from "./audio-studio-config";

describe("Audio Studio configuration", () => {
  it("normalizes valid rows, preserves disabled rows, and drops malformed rows", () => {
    const config = parseAudioStudioConfig({ assets: [
      { id: "stored", kind: "music", title: "Theme", artist: "Mogzy", source_type: "storage",
        storage_path: "music/theme.webm", mime_type: "audio/webm", relative_gain: 0.8 },
      { id: "disabled", kind: "music", title: "Disabled", source_type: "bundled",
        source_url: "/audio/disabled.mp3", mime_type: "audio/mpeg", enabled: false },
      { id: "broken", kind: "music" },
    ] });
    expect(config.assets).toHaveLength(2);
    expect(config.assets[0]).toMatchObject({ id: "stored", artist: "Mogzy", relativeGain: 0.8 });
    expect(config.assets[1]).toMatchObject({ id: "disabled", enabled: false });
  });

  it("orders playlist membership and rejects malformed positions", () => {
    const config = parseAudioStudioConfig({
      playlists: [{ id: "radio", slug: "academy-radio", name: "Academy Radio", shuffle_mode: "ordered" }],
      playlistItems: [
        { playlist_id: "radio", audio_asset_id: "second", position: 2 },
        { playlist_id: "radio", audio_asset_id: "bad", position: -1 },
        { playlist_id: "radio", audio_asset_id: "first", position: 0 },
      ],
    });
    expect(config.playlists[0].items.map((item) => item.assetId)).toEqual(["first", "second"]);
  });

  it("normalizes Ranked none and fails soft when a binding is absent", () => {
    const config = parseAudioStudioConfig({ modeBindings: [{
      mode_key: "ranked", source_type: "none", start_behavior: "restart",
      exit_behavior: "return-to-radio", default_audible: true,
    }] });
    expect(resolveModeBinding(config, "ranked")).toMatchObject({
      sourceType: "none", resolution: "canonical",
    });
    expect(resolveModeBinding(config, "missing")).toMatchObject({
      sourceType: "none", resolution: "code-fallback",
    });
  });

  it("normalizes event-binding metadata without integrating SFX playback", () => {
    const config = parseAudioStudioConfig({ eventBindings: [
      { event_key: "ui.nav-click", source_type: "asset", audio_asset_id: "click", relative_gain: 0.6 },
      { event_key: "quiz.correct", source_type: "synthesized", generator_id: "correct-tone" },
      { event_key: "bad", source_type: "asset" },
    ] });
    expect(config.eventBindings).toEqual([
      expect.objectContaining({ eventKey: "ui.nav-click", sourceType: "asset", assetId: "click", relativeGain: 0.6 }),
      expect.objectContaining({ eventKey: "quiz.correct", sourceType: "synthesized", generatorId: "correct-tone" }),
    ]);
  });
});
