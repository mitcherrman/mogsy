/**
 * DCGI1 — the media client asks for league marks and splits a large screen
 * (a 12-team, 60-player field) into requests under the backend's cap.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { MEDIA_BATCH_MAX, fetchProPlayMedia } from "@/lib/pro-play/mediaApi";

function respond(urls: string[], fail = -1) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const index = call++;
      if (index === fail) return { ok: false, status: 500, json: async () => ({}) } as Response;
      const params = new URL(String(url), "http://x").searchParams;
      const results = [...params.entries()].map(([type, key]) => ({
        entity_type: type,
        entity_key: key,
        state: "fallback",
      }));
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, contract_version: "pro_media_v1", count: results.length, identity_available: true, results }),
      } as Response;
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchProPlayMedia", () => {
  it("sends league slugs as league=", async () => {
    const urls: string[] = [];
    respond(urls);
    const batch = await fetchProPlayMedia({ teams: ["Team WE"], leagues: ["demacia_cup"] });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("team=Team+WE");
    expect(urls[0]).toContain("league=demacia_cup");
    expect(batch?.results.map((r) => r.entity_type)).toEqual(["team", "league"]);
  });

  it("splits more than the cap into several requests and merges them", async () => {
    const urls: string[] = [];
    respond(urls);
    const players = Array.from({ length: 60 }, (_, i) => `P${i}`);
    const teams = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const batch = await fetchProPlayMedia({ teams, players, leagues: ["demacia_cup"] });
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect([...new URL(url, "http://x").searchParams.keys()].length).toBeLessThanOrEqual(MEDIA_BATCH_MAX);
    }
    expect(batch?.count).toBe(73);
    expect(batch?.results.filter((r) => r.entity_type === "league")).toHaveLength(1);
  });

  it("fails the whole answer when one chunk fails", async () => {
    const urls: string[] = [];
    respond(urls, 1);
    const players = Array.from({ length: 50 }, (_, i) => `P${i}`);
    expect(await fetchProPlayMedia({ players })).toBeNull();
  });
});
