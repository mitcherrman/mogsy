/**
 * JLIB-HOST — the persisted match host, read verbatim on every surface the
 * backend exposes it on, and named to players only where it should be.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveMatch, isDailyHosted } from "./client";
import { readMatchHistory, readPublicRound, readResume } from "./contracts";
import { privatePlayerV2, publicRoundV2 } from "./fixtures";
import { MATCH_HOST, matchHostLabel, readMatchHost } from "./matchHost";

const T = "2026-07-18T12:00:00+00:00";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function activeMatch(host: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ active_match: { match_id: "m1", is_bot_match: true, host } }),
  } as Response));
  return getActiveMatch();
}

function publicRound(host?: unknown) {
  const env = publicRoundV2() as { payload: Record<string, unknown> };
  if (host !== undefined) env.payload.host = host;
  return env;
}

function resume(host?: unknown) {
  return {
    schema_version: "ranked_duel.resume.v1", projection_type: "resume",
    match_id: "m1", round_number: 1, server_time: T,
    payload: {
      match_status: "active", match_over: false,
      public: publicRound(host), private: privatePlayerV2("userA"),
      latest_resolved_round: null, result: null,
    },
  };
}

function history(entries: Record<string, unknown>[]) {
  return {
    schema_version: "ranked_duel.match_history.v1", projection_type: "match_history",
    match_id: null, round_number: null, server_time: T,
    payload: {
      count: entries.length,
      entries: entries.map((over, i) => ({
        match_id: `m${i}`, viewer_outcome: "win", terminal_reason: "combat",
        completion_reason: null, final_round_number: 5, completed_at: T,
        is_bot_match: true, viewer_class: "tank", opponent_class: "mage",
        opponent_display_name: null, opponent_is_bot: true,
        ...over,
      })),
    },
  };
}

describe("readMatchHost", () => {
  it("keeps every backend host verbatim and reads absence as null", () => {
    for (const host of Object.values(MATCH_HOST)) expect(readMatchHost(host)).toBe(host);
    expect(readMatchHost("future_host")).toBe("future_host");
    expect(readMatchHost(null)).toBeNull();
    expect(readMatchHost(undefined)).toBeNull();
    expect(readMatchHost("")).toBeNull();
    expect(readMatchHost(7)).toBeNull();
  });

  it("names only the Journey Library to players, never by its raw id", () => {
    expect(matchHostLabel("journey_library")).toBe("Journey Library");
    for (const host of ["daily_challenge", "study_hall", "playtest", "direct", "x", null, undefined]) {
      expect(matchHostLabel(host)).toBeNull();
    }
  });
});

describe("GET /active-match host (widened)", () => {
  it("no longer coerces a Journey Library host to null", async () => {
    expect((await activeMatch("journey_library"))?.host).toBe("journey_library");
  });

  it("keeps study_hall, playtest and direct verbatim, none of them Daily", async () => {
    for (const host of ["study_hall", "playtest", "direct"]) {
      const found = await activeMatch(host);
      expect(found?.host).toBe(host);
      expect(isDailyHosted(found)).toBe(false);
    }
  });

  it("leaves Daily and ordinary matches exactly as they were", async () => {
    const daily = await activeMatch("daily_challenge");
    expect(daily?.host).toBe("daily_challenge");
    expect(isDailyHosted(daily)).toBe(true);
    expect((await activeMatch(null))?.host).toBeNull();
    expect((await activeMatch(undefined))?.host).toBeNull();
  });
});

describe("match state and resume host", () => {
  it("reads payload.host off the match state", () => {
    expect(readPublicRound(publicRound("journey_library")).host).toBe("journey_library");
    expect(readPublicRound(publicRound(null)).host).toBeNull();
  });

  it("distinguishes 'not reported' (older backend) from a reported null", () => {
    const view = readPublicRound(publicRound());
    expect(view.host).toBeUndefined();
    expect("host" in view).toBe(false);
  });

  it("reads the resume's embedded public host", () => {
    expect(readResume(resume("journey_library")).public.host).toBe("journey_library");
    expect(readResume(resume(null)).public.host).toBeNull();
    expect(readResume(resume()).public.host).toBeUndefined();
  });
});

describe("GET /history entries[].host", () => {
  it("reads each entry's host, null when absent", () => {
    const view = readMatchHistory(history([
      { host: "journey_library" }, { host: null }, {}, { host: "study_hall" },
    ]));
    expect(view.entries.map((e) => e.host)).toEqual([
      "journey_library", null, null, "study_hall",
    ]);
  });
});
