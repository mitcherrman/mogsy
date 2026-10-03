/**
 * JLIB-FE — the two Journey Library calls on the shared Ranked client: the
 * public list, and the exact-version launch that answers `matched`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-jwt" }),
}));

import { launchJourney, listJourneys, RankedApiError } from "@/lib/ranked-public/client";
import { journeyLaunchMatched, journeyLibraryList } from "./__fixtures__/journeyLibrary";

const calls: { url: string; init: RequestInit }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stub(handler: () => Response) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler();
  }) as unknown as typeof fetch);
}

afterEach(() => vi.unstubAllGlobals());

describe("Journey Library client", () => {
  it("lists with a plain GET to /api/journeys", async () => {
    stub(() => json(journeyLibraryList()));
    const view = await listJourneys();
    expect(calls[0].url).toMatch(/\/api\/journeys$/);
    expect(calls[0].init.method).toBe("GET");
    expect(view.journeys.length).toBeGreaterThan(0);
  });

  it("launches the EXACT recipe id and version, with no body, and reads `matched`", async () => {
    stub(() => json(journeyLaunchMatched("rkb_abc", "jungle.volibear_vs_leesin", 3)));
    const status = await launchJourney("jungle.volibear_vs_leesin", 3);
    expect(calls[0].url).toMatch(/\/api\/journeys\/jungle\.volibear_vs_leesin\/3\/launch$/);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect(status.status).toBe("matched");
    expect(status.matchId).toBe("rkb_abc");
  });

  it("surfaces the backend's typed refusal codes", async () => {
    stub(() => json({ detail: { code: "JOURNEY_VERSION_NOT_ACTIVE", message: "stale",
      active_version: 2 } }, 409));
    const err = await launchJourney("mid.zed_vs_ahri", 1).catch((e) => e);
    expect(err).toBeInstanceOf(RankedApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("JOURNEY_VERSION_NOT_ACTIVE");
  });
});
