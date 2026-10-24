import { describe, expect, it } from "vitest";

import { embedUrl, platformUrl, youtubeThumbnail } from "./pulse-embed";
import { PULSE_PREVIEW_STORAGE_KEY, pulseFlagMode, resolvePulseEnabled } from "./pulse-flag";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("the Pulse flag", () => {
  it("a production build without the variable is OFF, whatever the URL says", () => {
    const mode = pulseFlagMode(undefined, false);
    expect(mode).toBe("off");
    expect(resolvePulseEnabled(mode, "?pulse=1", memoryStorage())).toBe(false);
  });

  it("the dev server is a preview: on only with ?pulse=1, remembered for the tab, forgotten with ?pulse=0", () => {
    const mode = pulseFlagMode(undefined, true);
    const store = memoryStorage();
    expect(mode).toBe("preview");
    expect(resolvePulseEnabled(mode, "", store)).toBe(false);
    expect(resolvePulseEnabled(mode, "?pulse=1", store)).toBe(true);
    expect(store.m.get(PULSE_PREVIEW_STORAGE_KEY)).toBe("1");
    expect(resolvePulseEnabled(mode, "", store)).toBe(true);
    expect(resolvePulseEnabled(mode, "?pulse=0", store)).toBe(false);
    expect(resolvePulseEnabled(mode, "", store)).toBe(false);
  });

  it("explicit values win over the dev default", () => {
    expect(pulseFlagMode("off", true)).toBe("off");
    expect(pulseFlagMode("preview", false)).toBe("preview");
    expect(pulseFlagMode(" ON ", false)).toBe("on");
    expect(resolvePulseEnabled("on", "?pulse=0", null)).toBe(true);
  });

  it("a storage that throws still honours the URL", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(resolvePulseEnabled("preview", "?pulse=1", broken)).toBe(true);
    expect(resolvePulseEnabled("preview", "", broken)).toBe(false);
  });
});

describe("external players are built only for real, well-formed ids", () => {
  const yt = (videoId: string | null) => ({ platform: "youtube" as const, videoId, title: "t", durationLabel: "1:00", thumbnailUrl: null });
  const tw = (channel: string | null) => ({ platform: "twitch" as const, channel, title: "t", live: true, viewersLabel: "", thumbnailUrl: null });

  it("YouTube uses the privacy-enhanced host", () => {
    expect(embedUrl(yt("dQw4w9WgXcQ"), "mogzy.lol")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1&playsinline=1",
    );
    expect(platformUrl(yt("dQw4w9WgXcQ"))).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(youtubeThumbnail("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("Twitch names this site as the parent", () => {
    expect(embedUrl(tw("some_channel"), "mogzy.lol")).toBe("https://player.twitch.tv/?channel=some_channel&parent=mogzy.lol&autoplay=true");
    expect(embedUrl(tw("some_channel"), "")).toBeNull();
  });

  it("a sample (null) or a malformed id never yields a player or a link", () => {
    for (const m of [yt(null), yt("short"), yt("bad id with spaces"), tw(null), tw("x"), tw("evil.com/?")]) {
      expect(embedUrl(m, "mogzy.lol")).toBeNull();
      expect(platformUrl(m)).toBeNull();
    }
    expect(youtubeThumbnail(null)).toBeNull();
  });
});
