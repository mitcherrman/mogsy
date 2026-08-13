import { afterEach, describe, expect, it, vi } from "vitest";

import { capturePageUrl, captureClientMeta, pickAllowedKeys } from "./diagnostics";
import { FEEDBACK_LIMITS } from "./contract";

/**
 * Diagnostics are collected without asking, so the tests that matter are the
 * ones proving we collect nothing beyond the allow-list.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickAllowedKeys", () => {
  it("keeps only the three sanctioned fields", () => {
    expect(
      pickAllowedKeys({
        ua: "Mozilla/5.0",
        viewport: "1280x800",
        app_version: "1.2.3",
        email: "someone@example.com",
        ip: "203.0.113.7",
        user_id: "abc",
        session: "tok",
      }),
    ).toEqual({ ua: "Mozilla/5.0", viewport: "1280x800", app_version: "1.2.3" });
  });

  it("drops empty and non-string values rather than storing nulls", () => {
    expect(pickAllowedKeys({ ua: "", viewport: 1280, app_version: null })).toEqual({});
  });
});

describe("captureClientMeta", () => {
  it("captures viewport rather than physical screen size", () => {
    vi.stubGlobal("window", { innerWidth: 1279.5, innerHeight: 800, screen: { width: 3840 } });
    const meta = captureClientMeta();
    expect(meta.viewport).toBe("1280x800");
    expect(JSON.stringify(meta)).not.toContain("3840");
  });

  it("truncates a hostile user-agent string", () => {
    vi.stubGlobal("navigator", { userAgent: "x".repeat(5000) });
    expect(captureClientMeta().ua!.length).toBeLessThanOrEqual(400);
  });

  it("never emits a key outside the allow-list", () => {
    const meta = captureClientMeta();
    for (const key of Object.keys(meta)) {
      expect(["ua", "viewport", "app_version"]).toContain(key);
    }
  });

  it("does not throw when browser APIs are missing", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(() => captureClientMeta()).not.toThrow();
  });
});

describe("capturePageUrl", () => {
  it("strips query strings, which is where room and invite codes live", () => {
    expect(capturePageUrl("/quiz/stat-check/room/ABC123?invite=SECRET")).toBe(
      "/quiz/stat-check/room/ABC123",
    );
    expect(capturePageUrl("/quiz/ranked?token=abc")).toBe("/quiz/ranked");
  });

  it("strips the hash fragment", () => {
    expect(capturePageUrl("/lol/glossary#term-armor")).toBe("/lol/glossary");
  });

  it("keeps a plain path intact", () => {
    expect(capturePageUrl("/combat-lab")).toBe("/combat-lab");
  });

  it("falls back to root for an empty path", () => {
    expect(capturePageUrl("")).toBe("/");
  });

  it("respects the column length cap", () => {
    expect(capturePageUrl("/" + "a".repeat(2000)).length).toBeLessThanOrEqual(
      FEEDBACK_LIMITS.pageUrl,
    );
  });
});
