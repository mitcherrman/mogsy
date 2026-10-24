import { describe, expect, it } from "vitest";

import { safeHttpsUrl, safeImageSrc, cleanText, parseInstant } from "./partner-validate";
import { decideLive, formatViewers, parseTwitchChannelUrl } from "./twitch";
import { parseYouTubeUrl, youtubeDurationLabel } from "./youtube";

const ID = "dQw4w9WgXcQ";
const NOW = Date.parse("2026-10-24T12:00:30Z");

describe("YouTube URLs", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, "video"],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`, "video"],
    [`https://m.youtube.com/watch?v=${ID}`, "video"],
    [`https://youtu.be/${ID}?si=abc`, "video"],
    [`https://www.youtube.com/embed/${ID}`, "video"],
    [`https://www.youtube-nocookie.com/embed/${ID}`, "video"],
    [`https://www.youtube.com/live/${ID}`, "video"],
    [`https://youtube.com/shorts/${ID}`, "short"],
    [`https://www.youtube.com/shorts/${ID}?feature=share`, "short"],
  ])("%s → id and %s", (url, format) => {
    const ref = parseYouTubeUrl(url);
    expect(ref).not.toBeNull();
    expect(ref!.videoId).toBe(ID);
    expect(ref!.format).toBe(format);
    expect(ref!.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(ref!.watchUrl).toBe(format === "short" ? `https://www.youtube.com/shorts/${ID}` : `https://www.youtube.com/watch?v=${ID}`);
  });

  it.each([
    `http://www.youtube.com/watch?v=${ID}`, // not https
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`, // short id
    `https://www.youtube.com/watch?v=${ID}x`, // long id
    `https://www.youtube.com/watch?v=dQw4w9WgX%3C`, // bad characters
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@somechannel",
    `https://www.youtube.com.evil.net/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://user:pw@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `https://youtu.be/${ID}/extra`,
    `javascript:alert(1)//youtu.be/${ID}`,
    ` https://youtu.be/${ID}`,
    "not a url",
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  it("labels durations without inventing one", () => {
    expect(youtubeDurationLabel("video", 754)).toBe("12:34");
    expect(youtubeDurationLabel("video", 3725)).toBe("1:02:05");
    expect(youtubeDurationLabel("video", 9)).toBe("0:09");
    expect(youtubeDurationLabel("video", undefined)).toBe("Video");
    expect(youtubeDurationLabel("video", -3)).toBe("Video");
    expect(youtubeDurationLabel("video", 1.5)).toBe("Video");
    expect(youtubeDurationLabel("short", 40)).toBe("Short");
  });
});

describe("Twitch channels", () => {
  it("reduces a channel URL to its lowercase login", () => {
    expect(parseTwitchChannelUrl("https://www.twitch.tv/Some_Streamer")).toBe("some_streamer");
    expect(parseTwitchChannelUrl("https://twitch.tv/abcd")).toBe("abcd");
    expect(parseTwitchChannelUrl("https://m.twitch.tv/abcd/")).toBe("abcd");
  });

  it.each([
    "http://www.twitch.tv/abcd",
    "https://www.twitch.tv/abc", // 3 chars
    "https://www.twitch.tv/" + "a".repeat(26),
    "https://www.twitch.tv/bad-name",
    "https://www.twitch.tv/abcd/videos",
    "https://www.twitch.tv/directory",
    "https://www.twitch.tv/videos",
    "https://clips.twitch.tv/abcd",
    "https://www.twitch.tv.evil.net/abcd",
  ])("rejects %s", (url) => {
    expect(parseTwitchChannelUrl(url)).toBeNull();
  });
});

describe("Twitch live evidence", () => {
  const helix = new Set(["twitch-helix-streams" as const]);
  const live = { login: "abcd", state: "live" as const, source: "twitch-helix-streams" as const, observedAt: "2026-10-24T12:00:00Z", viewerCount: 1234 };

  it("trusts nothing by default, so nothing is ever LIVE", () => {
    expect(decideLive("abcd", [live], { now: NOW })).toEqual({ live: false, reason: "untrusted", validUntil: null });
  });

  it("no evidence makes no claim", () => {
    expect(decideLive("abcd", [], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "no-evidence" });
    expect(decideLive("other", [live], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "no-evidence" });
  });

  it("fresh trusted evidence shows LIVE with its own viewer count, and says when it expires", () => {
    const d = decideLive("abcd", [live], { now: NOW, trustedSources: helix });
    expect(d).toEqual({ live: true, viewersLabel: "1.2K watching", validUntil: Date.parse(live.observedAt) + 90_000 });
  });

  it("without a viewer count it never invents one", () => {
    const { viewerCount: _drop, ...noCount } = live;
    expect(decideLive("abcd", [noCount], { now: NOW, trustedSources: helix })).toMatchObject({ live: true, viewersLabel: "now" });
    expect(decideLive("abcd", [{ ...live, viewerCount: -1 }], { now: NOW, trustedSources: helix })).toMatchObject({ viewersLabel: "now" });
  });

  it("stale, expired, future-dated and malformed evidence is not LIVE", () => {
    expect(decideLive("abcd", [live], { now: NOW + 120_000, trustedSources: helix })).toMatchObject({ live: false, reason: "stale" });
    expect(decideLive("abcd", [{ ...live, expiresAt: "2026-10-24T12:00:20Z" }], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "stale" });
    expect(decideLive("abcd", [{ ...live, observedAt: "2026-10-24T13:00:00Z" }], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "malformed" });
    expect(decideLive("abcd", [{ ...live, observedAt: "2026-10-24 12:00" }], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "malformed" });
  });

  it("the newest observation wins: a later offline beats an earlier live", () => {
    const off = { ...live, state: "offline" as const, observedAt: "2026-10-24T12:00:20Z" };
    expect(decideLive("abcd", [live, off], { now: NOW, trustedSources: helix })).toMatchObject({ live: false, reason: "offline" });
  });

  it("rounds viewer counts down", () => {
    expect(formatViewers(842)).toBe("842");
    expect(formatViewers(1000)).toBe("1K");
    expect(formatViewers(1299)).toBe("1.2K");
    expect(formatViewers(12_999)).toBe("12K");
    expect(formatViewers(1_480_000)).toBe("1.4M");
  });
});

describe("shared validation", () => {
  it("matches hosts exactly and refuses unsafe URLs", () => {
    expect(safeHttpsUrl("https://example.com/a?b=1", ["example.com"])?.href).toBe("https://example.com/a?b=1");
    expect(safeHttpsUrl("https://EXAMPLE.com/a", ["example.com"])).not.toBeNull();
    for (const bad of ["https://sub.example.com/", "https://example.com.evil.net/", "https://evil-example.com/", "http://example.com/", "https://u:p@example.com/", "https://example.com:444/", "https://1.2.3.4/", "javascript:alert(1)", "data:text/html,x"]) {
      expect(safeHttpsUrl(bad, ["example.com", "1.2.3.4"])).toBeNull();
    }
  });

  it("allows same-origin paths and allowlisted image hosts only", () => {
    expect(safeImageSrc("/mogsy-logo.png")).toBe("/mogsy-logo.png");
    expect(safeImageSrc("https://i.ytimg.com/vi/x/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/x/hqdefault.jpg");
    for (const bad of ["//evil.net/x.png", "/../secret", "/a\\b", "https://evil.net/x.png", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      expect(safeImageSrc(bad)).toBeNull();
    }
  });

  it("cleans display text", () => {
    expect(cleanText("  Two   words ", 20)).toBe("Two words");
    expect(cleanText("", 20)).toBeNull();
    expect(cleanText("x".repeat(21), 20)).toBeNull();
    expect(cleanText("bidi‮override", 40)).toBeNull();
    expect(cleanText(42, 20)).toBeNull();
  });

  it("requires an explicit offset on timestamps", () => {
    expect(parseInstant("2026-10-24T12:00:00Z")).toBe(Date.parse("2026-10-24T12:00:00Z"));
    expect(parseInstant("2026-10-24T14:00:00+02:00")).toBe(Date.parse("2026-10-24T12:00:00Z"));
    expect(parseInstant("2026-10-24T12:00:00")).toBeNull();
    expect(parseInstant("2026-10-24")).toBeNull();
  });
});
