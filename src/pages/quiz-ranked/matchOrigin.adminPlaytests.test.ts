import { describe, expect, it } from "vitest";
import { MATCH_HOST } from "@/lib/ranked-public/matchHost";
import {
  ADMIN_PLAYTESTS_ORIGIN_ID, ADMIN_PLAYTESTS_ROUTE, originForHost, readMatchOrigin, resolveMatchOrigin,
} from "./matchOrigin";

describe("UGMP admin Playtests origin", () => {
  const hint = readMatchOrigin({ matchId: "m", origin: ADMIN_PLAYTESTS_ORIGIN_ID });

  it("is read from the hub's router state and returns to Ranked → Playtests", () => {
    expect(hint).toMatchObject({
      id: "admin_playtests", href: ADMIN_PLAYTESTS_ROUTE, returnLabel: "Back to Playtests", navLabel: "Playtests",
    });
    expect(ADMIN_PLAYTESTS_ROUTE).toBe("/admin/leaguecraft?section=ranked&view=playtests");
  });

  it("refines a persisted `playtest` host and nothing else", () => {
    expect(resolveMatchOrigin(undefined, hint)).toBe(hint);
    expect(resolveMatchOrigin(MATCH_HOST.playtest, hint)).toBe(hint);
    // a contradicting host still wins, and an ordinary match drops the hint
    expect(resolveMatchOrigin(MATCH_HOST.journeyLibrary, hint)?.id).toBe(MATCH_HOST.journeyLibrary);
    expect(resolveMatchOrigin(null, hint)).toBeNull();
    expect(resolveMatchOrigin(MATCH_HOST.direct, hint)).toBeNull();
  });

  it("is never implied by a host: the public guided Playtest keeps the ordinary result actions", () => {
    expect(originForHost(MATCH_HOST.playtest)).toBeNull();
    expect(originForHost(ADMIN_PLAYTESTS_ORIGIN_ID)).toBeNull();
    expect(resolveMatchOrigin(MATCH_HOST.playtest, null)).toBeNull();
  });
});
