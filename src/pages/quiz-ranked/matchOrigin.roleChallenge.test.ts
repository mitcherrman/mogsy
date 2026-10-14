import { describe, expect, it } from "vitest";
import { MATCH_HOST, matchHostLabel, readMatchHost } from "@/lib/ranked-public/matchHost";
import {
  ROLE_CHALLENGE_ROUTE, originForHost, readMatchOrigin, resolveMatchOrigin,
} from "./matchOrigin";

describe("RC6 Role Challenge origin", () => {
  it("keeps canonical backend host and player-facing label", () => {
    expect(readMatchHost("role_challenge")).toBe(MATCH_HOST.roleChallenge);
    expect(matchHostLabel(MATCH_HOST.roleChallenge)).toBe("Role Challenge");
  });
  it("returns canonical Role Challenge matches to Leaguecraft", () => {
    expect(originForHost(MATCH_HOST.roleChallenge)).toMatchObject({
      href: ROLE_CHALLENGE_ROUTE,
      navLabel: "Role Challenge",
      returnLabel: "Back to Role Challenge",
    });
    expect(ROLE_CHALLENGE_ROUTE).toBe("/quiz");
  });
  it("accepts router hint only before backend provenance arrives", () => {
    const hint = readMatchOrigin({ origin: MATCH_HOST.roleChallenge });
    expect(hint?.id).toBe(MATCH_HOST.roleChallenge);
    expect(resolveMatchOrigin(undefined, hint)).toBe(hint);
    expect(resolveMatchOrigin(null, hint)).toBeNull();
    expect(resolveMatchOrigin(MATCH_HOST.journeyLibrary, hint)?.id).toBe(MATCH_HOST.journeyLibrary);
  });
  it("keeps unknown and other hosts without a Role Challenge return route", () => {
    for (const host of [null, "playtest", "daily_challenge", "study_hall", "future_host"]) {
      expect(originForHost(host)).toBeNull();
    }
  });
});
