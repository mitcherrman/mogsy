/**
 * Featured content: the cards are the discovery surface, so they must all be
 * valid selections, must lead with major-pro without hiding the rest, and must
 * never assert a conclusion the graph has not proven.
 */
import { describe, expect, it } from "vitest";

import { defaultCardFor, FEATURED_GRAPHS } from "./featured";
import { findCombination, metricsFor } from "./builder";

describe("featured cards", () => {
  it("ships a restrained, non-empty set", () => {
    expect(FEATURED_GRAPHS.length).toBeGreaterThanOrEqual(8);
    expect(FEATURED_GRAPHS.length).toBeLessThanOrEqual(12);
    expect(new Set(FEATURED_GRAPHS.map((c) => c.id)).size).toBe(
      FEATURED_GRAPHS.length,
    );
  });

  it("is every one a valid combination, mode and metric", () => {
    for (const card of FEATURED_GRAPHS) {
      const combination = findCombination(card.focus, card.compare);
      expect(combination, card.id).toBeDefined();
      if (card.mode === "bans") expect(combination!.modes, card.id).toBeDefined();
      expect(
        metricsFor(combination!, card.mode).map((m) => m.id),
        card.id,
      ).toContain(card.metric);
      expect(card.entityId, card.id).toBeTruthy();
    }
  });

  it("covers all four entity combinations and both draft actions", () => {
    const pairs = new Set(FEATURED_GRAPHS.map((c) => `${c.focus}->${c.compare}`));
    expect(pairs).toEqual(
      new Set([
        "player->champions",
        "team->champions",
        "champion->players",
        "champion->teams",
      ]),
    );
    expect(FEATURED_GRAPHS.some((c) => c.mode === "bans")).toBe(true);
    // At least one ratio card, so a reader meets the board without hunting.
    expect(
      FEATURED_GRAPHS.some((c) => ["winrate", "share", "banrate"].includes(c.metric)),
    ).toBe(true);
  });

  it("lets major-pro dominate while keeping broader pro reachable", () => {
    const broad = FEATURED_GRAPHS.filter((c) =>
      ["GAM Esports", "Anubis Gaming"].includes(c.entityId),
    );
    // Mogzy's corpus is not four regions; a surface showing only majors would
    // say otherwise. These two are content, not filler — do not drop them.
    expect(broad.length).toBeGreaterThanOrEqual(1);
    expect(broad.length).toBeLessThan(FEATURED_GRAPHS.length / 2);
  });

  it("uses exact canonical scope values, never friendly labels", () => {
    // `league: "LCK"` matches nothing in the backend.
    const leagues = FEATURED_GRAPHS.map((c) => c.scope.league).filter(Boolean);
    expect(leagues).not.toContain("LCK");
    expect(leagues).not.toContain("Worlds");
    expect(new Set(leagues)).toEqual(
      new Set(["LoL Champions Korea", "World Championship", "Mid-Season Invitational"]),
    );
  });

  it("asks questions and never hardcodes a factual conclusion", () => {
    for (const card of FEATURED_GRAPHS) {
      // "Faker dominates Azir" would go stale silently the next time the data
      // moved. Only the graph may claim a fact.
      expect(card.title, card.id).not.toMatch(
        /\bdominat|\bbest\b|\bgreatest|\bmost successful|\bking\b|\bnumber one/i,
      );
    }
  });

  it("never names an internal policy, universe or family id", () => {
    const text = JSON.stringify(FEATURED_GRAPHS);
    expect(text).not.toMatch(
      /MAJOR_PRO|PRO_TEAM|pro_broad|apply_policy|player-champions|champion-teams/,
    );
  });
});

describe("defaults", () => {
  it("lands every focus on a verified, unscoped card", () => {
    for (const focus of ["player", "team", "champion"] as const) {
      const card = defaultCardFor(focus);
      expect(card, focus).toBeDefined();
      expect(card!.scope.league).toBeUndefined();
      expect(card!.scope.major).toBe(false);
    }
  });

  it("has a default for each of the champion counterparts", () => {
    expect(defaultCardFor("champion", "players")?.entityId).toBe("azir");
    expect(defaultCardFor("champion", "teams")?.entityId).toBe("kaisa");
  });
});
