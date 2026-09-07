/**
 * PT1.9 — the demo client and its `TrendsSource` adapter.
 *
 * The page test substitutes this adapter (ESM live bindings make mocking the
 * transport alone insufficient), so the real one is exercised here, against a
 * stubbed `fetch`. What matters: it names only what it was given, it carries
 * an admin credential and never a consumer one, and it never turns a refusal
 * into an empty report.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer token" })),
}));
const adminKey = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/lib/knowledge-admin/key", () => ({
  getAdminKey: () => adminKey.value,
}));

import {
  DemoPreviewError,
  demoAnalyticsApi,
  demoTrendsSource,
} from "./demoAnalyticsApi";

const CAPABILITY = {
  can_view_trends: true,
  trend_windows: [7, 30, 90],
  can_build: true,
  reason: "premium",
};

let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  adminKey.value = null;
  fetchMock = vi.fn(async () => ok({ capability: CAPABILITY, current: {} }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = (call: number) => String(fetchMock.mock.calls[call][0]);
const headersOf = (call: number) =>
  (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

describe("PT1.9 — the demo client", () => {
  it("reads the target list from the admin route", async () => {
    await demoAnalyticsApi.targets();
    expect(urlOf(0)).toContain("/api/admin/demo-analytics/targets");
  });

  it("carries the admin bearer, and the fallback key only when one is set", async () => {
    await demoAnalyticsApi.targets();
    expect(headersOf(0).Authorization).toBe("Bearer token");
    expect(headersOf(0)["X-Admin-Key"]).toBeUndefined();

    adminKey.value = "explicit-key";
    await demoAnalyticsApi.targets();
    expect(headersOf(1)["X-Admin-Key"]).toBe("explicit-key");
  });

  it("sends the target and the presentation, url-encoded", async () => {
    await demoAnalyticsApi.read("demo::timmy", "premium", 30);
    const url = urlOf(0);
    expect(url).toContain("target=demo%3A%3Atimmy");
    expect(url).toContain("preview=premium");
    expect(url).toContain("window=30");
  });

  it("omits the window when none was chosen, so the server picks", async () => {
    await demoAnalyticsApi.read("demo::timmy", "free");
    expect(urlOf(0)).not.toContain("window=");
  });

  it("issues only GETs — there is no write on this surface", async () => {
    await demoAnalyticsApi.targets();
    await demoAnalyticsApi.read("demo::timmy", "premium", 7);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
    }
  });

  it("surfaces a refusal as an error rather than as an empty record", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 403, statusText: "Forbidden",
      text: async () => "Admin authorization required",
      json: async () => ({}),
    });
    await expect(demoAnalyticsApi.targets()).rejects.toBeInstanceOf(
      DemoPreviewError);
  });
});

describe("PT1.9 — the TrendsSource adapter", () => {
  it("hands the pane a Free capability that stops it asking for a report", async () => {
    fetchMock.mockResolvedValue(ok({
      capability: { can_view_trends: false, trend_windows: [], can_build: false, reason: "free" },
      refusal: { code: "PREMIUM_REQUIRED", message: "no" },
    }));
    const source = demoTrendsSource("demo::timmy", "free");
    const answer = await source.capability();
    expect(answer.capability.can_view_trends).toBe(false);
    expect(answer.capability.trend_windows).toEqual([]);
  });

  it("returns the report for Premium", async () => {
    fetchMock.mockResolvedValue(ok({
      capability: CAPABILITY, window_days: 30, current: { attempts: 96 },
    }));
    const report = await demoTrendsSource("demo::timmy", "premium").trends(30);
    expect(report.window_days).toBe(30);
  });

  it("refuses to render a refusal as a report", async () => {
    // Unreachable through the pane — the hook asks for a report only after the
    // capability said yes — but a server answering a refusal here must not be
    // drawn as "you have studied nothing".
    fetchMock.mockResolvedValue(ok({
      capability: CAPABILITY,
      refusal: { code: "PREMIUM_REQUIRED", message: "no" },
    }));
    await expect(
      demoTrendsSource("demo::timmy", "premium").trends(7),
    ).rejects.toBeInstanceOf(DemoPreviewError);
  });

  it("never names anything but the subject it was constructed with", async () => {
    await demoTrendsSource("demo::timmy", "premium").capability();
    await demoTrendsSource("demo::timmy", "premium").trends(90);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("target=demo%3A%3Atimmy");
    }
  });
});
