import { describe, expect, it } from "vitest";
import type { RoleChallengeStatus } from "./contracts";
import {
  championAssetKey, championIconUrlPath, eligibilityView, filterChampions,
  hubModeFromSearch, resetCountdown,
} from "./presentation";

const NOW = new Date("2026-10-14T18:48:00Z");

function status(over: Partial<RoleChallengeStatus> = {}): RoleChallengeStatus {
  return {
    serverNow: NOW.toISOString(),
    challengeDate: "2026-10-14",
    resetsAt: "2026-10-15T00:00:00+00:00",
    answerCount: 12,
    dailySlot: { used: false, run: null },
    activeRun: null,
    otherActiveMatch: false,
    nextStart: { slotKind: "daily", allowed: true, reason: null },
    ...over,
  };
}

describe("RC8 champion art key", () => {
  it("uses the catalog's Data Dragon id, never the lowercase catalog id", () => {
    expect(championIconUrlPath({ name: "Wukong", riotId: "MonkeyKing" }))
      .toBe("assets/champions/MonkeyKing/icon.png");
    expect(championAssetKey({ name: "K'Sante", riotId: "KSante" })).toBe("KSante");
  });
  it("falls back to the Data Dragon key rule when riot_id is absent", () => {
    expect(championAssetKey({ name: "Aatrox", riotId: null })).toBe("Aatrox");
    expect(championAssetKey({ name: "Kai'Sa", riotId: null })).toBe("Kaisa");
    expect(championAssetKey({ name: "Rek'Sai", riotId: null })).toBe("RekSai");
    expect(championAssetKey({ name: "Dr. Mundo", riotId: null })).toBe("DrMundo");
    expect(championAssetKey({ name: "Wukong", riotId: null })).toBe("MonkeyKing");
    expect(championAssetKey({ name: "Nunu & Willump", riotId: null })).toBe("Nunu");
  });
});

describe("RC8 champion search", () => {
  const roster = [
    { id: "kaisa", name: "Kai'Sa" }, { id: "aatrox", name: "Aatrox" },
    { id: "monkeyking", name: "Wukong" },
  ];
  it("ignores case and punctuation and matches ids", () => {
    expect(filterChampions(roster, "kai sa").map((c) => c.id)).toEqual(["kaisa"]);
    expect(filterChampions(roster, "MONKEY").map((c) => c.id)).toEqual(["monkeyking"]);
    expect(filterChampions(roster, "  ")).toHaveLength(3);
  });
});

describe("RC8 reset countdown", () => {
  it("counts to the next UTC reset", () => {
    expect(resetCountdown("2026-10-15T00:00:00+00:00", NOW)).toBe("5h 12m");
    expect(resetCountdown("2026-10-14T18:58:30Z", NOW)).toBe("10m");
    expect(resetCountdown("2026-10-14T18:48:20Z", NOW)).toBe("under a minute");
    expect(resetCountdown("not a date", NOW)).toBeNull();
  });
});

describe("RC8 eligibility — the server decides, Premium only picks words", () => {
  it("Free with an unused daily slot may start", () => {
    const view = eligibilityView(status(), "free", NOW);
    expect(view.canStart).toBe(true);
    expect(view.planLabel).toBe("Free · 1 start per UTC day");
  });
  it("Free with the slot used is refused, offered Premium and told when it resets", () => {
    const view = eligibilityView(status({
      dailySlot: { used: true, run: null },
      nextStart: { slotKind: "premium", allowed: false, reason: "daily_limit_reached" },
    }), "free", NOW);
    expect(view.canStart).toBe(false);
    expect(view.offerUpgrade).toBe(true);
    expect(view.message).toContain("Resets in 5h 12m");
  });
  it("Premium beyond the daily slot may start again", () => {
    const view = eligibilityView(status({
      nextStart: { slotKind: "premium", allowed: true, reason: null },
    }), "premium", NOW);
    expect(view.canStart).toBe(true);
    expect(view.planLabel).toContain("Unlimited");
  });
  it("a client that THINKS it is Premium cannot start when the server refuses", () => {
    const view = eligibilityView(status({
      nextStart: { slotKind: "premium", allowed: false, reason: "daily_limit_reached" },
    }), "premium", NOW);
    expect(view.canStart).toBe(false);
  });
  it("unknown entitlement is neither Free nor Premium: retry, no start", () => {
    const view = eligibilityView(status({
      nextStart: { slotKind: "premium", allowed: null, reason: "entitlement_unavailable" },
    }), "unknown", NOW);
    expect(view.canStart).toBe(false);
    expect(view.offerRetry).toBe(true);
  });
  it("an active match elsewhere blocks a start", () => {
    const view = eligibilityView(status({
      otherActiveMatch: true,
      nextStart: { slotKind: null, allowed: false, reason: "active_match" },
    }), "free", NOW);
    expect(view.canStart).toBe(false);
    expect(view.message).toMatch(/active match/i);
  });
});

describe("RC8 hub mode from the URL", () => {
  it("defaults to Daily and honours ?mode=", () => {
    expect(hubModeFromSearch("")).toBe("daily");
    expect(hubModeFromSearch("?mode=role")).toBe("role");
    expect(hubModeFromSearch("?mode=ranked")).toBe("ranked");
    expect(hubModeFromSearch("?mode=bogus")).toBe("daily");
  });
  it("a request to open the Ranked entry record lands on Ranked", () => {
    expect(hubModeFromSearch("?play=1", true)).toBe("ranked");
  });
});
