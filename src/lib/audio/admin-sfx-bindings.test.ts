import { describe, expect, it } from "vitest";

import { parseAudioStudioConfig } from "./audio-studio-config";
import {
  buildAdminSfxReplacementPlan,
  readAdminSfxReplacements,
} from "./admin-sfx-bindings";

describe("Admin canonical SFX replacements", () => {
  it("prefers an Audio Studio binding and treats a compatible legacy URL as migration input", () => {
    const config = parseAudioStudioConfig({
      assets: [{
        id: "bound", kind: "sfx", title: "Bound", source_type: "external",
        source_url: "https://cdn.test/bound.mp3", mime_type: "audio/mpeg",
      }],
      eventBindings: [{
        event_key: "landing.enter", source_type: "asset", audio_asset_id: "bound",
      }],
    });
    const result = readAdminSfxReplacements(config, {
      launch_chime: "https://old.test/ignored.mp3",
      swipe_tap: "https://old.test/swipe.wav",
    });
    expect(result.urls.launch_chime).toBe("https://cdn.test/bound.mp3");
    expect(result.urls.swipe_tap).toBe("https://old.test/swipe.wav");
    expect(result.migratedLegacyKeys).toEqual(["swipe_tap"]);
  });

  it("does not resurrect a legacy URL over an explicit disabled binding", () => {
    const config = parseAudioStudioConfig({
      eventBindings: [{ event_key: "swipe.action", source_type: "disabled", enabled: true }],
    });
    const result = readAdminSfxReplacements(config, {
      swipe_tap: "https://old.test/swipe.mp3",
    });
    expect(result.urls.swipe_tap).toBeUndefined();
    expect(result.migratedLegacyKeys).toEqual([]);
  });

  it("plans an asset plus canonical binding and consumes only compatible legacy data", () => {
    const plan = buildAdminSfxReplacementPlan({
      config: parseAudioStudioConfig({}),
      replacements: { swipe_tap: "https://old.test/swipe.wav" },
      removedKeys: new Set(),
      legacyUrls: {
        swipe_tap: "https://old.test/swipe.wav",
        bubble_tap: "https://old.test/unmapped.mp3",
      },
      labelFor: () => "Swipe Tap",
      createId: () => "asset-1",
    });
    expect(plan.assets).toEqual([expect.objectContaining({
      id: "asset-1", kind: "sfx", source_url: "https://old.test/swipe.wav",
      mime_type: "audio/wav",
    })]);
    expect(plan.bindings).toEqual([expect.objectContaining({
      event_key: "swipe.action", source_type: "asset", audio_asset_id: "asset-1", enabled: true,
    })]);
    expect(plan.remainingLegacyUrls).toEqual({ bubble_tap: "https://old.test/unmapped.mp3" });
  });

  it("removes the explicit binding so the canonical built-in can resume", () => {
    const plan = buildAdminSfxReplacementPlan({
      config: parseAudioStudioConfig({}),
      replacements: {},
      removedKeys: new Set(["play_book_ruffle"]),
      legacyUrls: {},
      labelFor: () => "Book Page Ruffle",
      createId: () => "unused",
    });
    expect(plan.bindings).toEqual([]);
    expect(plan.removeBindings).toEqual(["hub.book.open"]);
  });
});
