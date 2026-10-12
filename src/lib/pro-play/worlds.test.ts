/**
 * PW1 — Worlds identity and fixture rules. Pure, so pinned without a page.
 *
 * Fixtures follow the real `/api/live-esports/upcoming` shape (captured from
 * production 2026-10-12: `league.slug "worlds"`, name "Worlds", Play-Ins).
 */
import { describe, expect, it } from "vitest";

import type { LiveGameSummary, UpcomingMatch } from "@/lib/live-esports/api";
import {
  WORLDS_FIXTURE_GRACE_MS,
  isWorldsGame,
  isWorldsLeague,
  nextWorldsFixture,
  startMs,
  withWorldsYear,
  worldsFixtures,
  worldsYear,
} from "./worlds";

const NOW = Date.parse("2026-10-12T01:15:00Z");
const at = (iso: string) => iso;

function fixture(id: string, slug: string | null, start: string | null, over: Partial<UpcomingMatch> = {}): UpcomingMatch {
  return {
    match_id: id,
    scheduled_start: start as string,
    league: { slug, name: slug === "worlds" ? "Worlds" : "Other", region: "INTERNATIONAL", scope: "international" },
    block_name: "Play-Ins",
    best_of: 5,
    teams: {
      a: { name: "FUR", code: "FUR", resolved_page: "FURIA", tbd: false },
      b: { name: "MVK", code: "MVK", resolved_page: "Movistar KOI", tbd: false },
    },
    ...over,
  };
}

describe("isWorldsLeague / isWorldsGame", () => {
  it("matches upstream's league slug exactly, and nothing else", () => {
    expect(isWorldsLeague({ slug: "worlds" })).toBe(true);
    expect(isWorldsLeague({ slug: " Worlds " })).toBe(true);
    expect(isWorldsLeague({ slug: "worlds_qualifying" })).toBe(false);
    expect(isWorldsLeague({ slug: "msi" })).toBe(false);
    expect(isWorldsLeague({ slug: null })).toBe(false);
    expect(isWorldsLeague(null)).toBe(false);
    expect(isWorldsLeague(undefined)).toBe(false);
  });

  it("reads a game's competition league first, its row league second", () => {
    const base = { league: { slug: "lck", name: "LCK" }, competition: null } as Pick<LiveGameSummary, "league" | "competition">;
    expect(isWorldsGame(base)).toBe(false);
    expect(isWorldsGame({ ...base, league: { slug: "worlds", name: "Worlds" } })).toBe(true);
    expect(
      isWorldsGame({
        ...base,
        competition: { league: { slug: "worlds", name: "Worlds", region: "INTERNATIONAL", scope: "international" } },
      } as Pick<LiveGameSummary, "league" | "competition">),
    ).toBe(true);
    // The competition block is the more specific identity.
    expect(
      isWorldsGame({
        league: { slug: "worlds", name: "Worlds" },
        competition: { league: { slug: "lck", name: "LCK", region: "KOREA", scope: "domestic" } },
      } as Pick<LiveGameSummary, "league" | "competition">),
    ).toBe(false);
  });
});

describe("nextWorldsFixture", () => {
  it("is the soonest Worlds fixture, whatever the feed's order and other leagues", () => {
    const list = [
      fixture("lck", "lck", at("2026-10-12T06:00:00Z")),
      fixture("late", "worlds", at("2026-10-15T23:00:00Z")),
      fixture("early", "worlds", at("2026-10-15T18:00:00Z")),
    ];
    expect(nextWorldsFixture(list, NOW)?.match_id).toBe("early");
  });

  it("is null when upstream names no Worlds fixture", () => {
    expect(nextWorldsFixture([fixture("a", "lck", at("2026-10-13T06:00:00Z"))], NOW)).toBeNull();
    expect(nextWorldsFixture([], NOW)).toBeNull();
  });

  it("keeps a fixture whose sides are still TBD — a scheduled match, not an invented one", () => {
    const tbd = fixture("slot", "worlds", at("2026-11-03T18:00:00Z"), {
      block_name: "Quarterfinals",
      teams: {
        a: { name: "TBD", code: "TBD", resolved_page: null, tbd: true },
        b: { name: "TBD", code: "TBD", resolved_page: null, tbd: true },
      },
    });
    expect(nextWorldsFixture([tbd], NOW)?.match_id).toBe("slot");
  });

  it("never features a fixture with no parseable start", () => {
    const list = [fixture("nope", "worlds", null), fixture("junk", "worlds", "soon-ish")];
    expect(nextWorldsFixture(list, NOW)).toBeNull();
  });

  it("drops a stale schedule entry, but forgives a few minutes of poll lag", () => {
    const justStarted = fixture("lag", "worlds", new Date(NOW - 5 * 60_000).toISOString());
    const stale = fixture("stale", "worlds", new Date(NOW - WORLDS_FIXTURE_GRACE_MS - 60_000).toISOString());
    const later = fixture("later", "worlds", at("2026-10-15T18:00:00Z"));
    expect(nextWorldsFixture([stale, justStarted, later], NOW)?.match_id).toBe("lag");
    expect(nextWorldsFixture([stale, later], NOW)?.match_id).toBe("later");
  });

  it("breaks a tie by the feed's own order, and ignores rows without an id", () => {
    const t = at("2026-10-15T18:00:00Z");
    const list = [fixture("", "worlds", t), fixture("first", "worlds", t), fixture("second", "worlds", t)];
    expect(worldsFixtures(list, NOW).map((m) => m.match_id)).toEqual(["first", "second"]);
  });
});

describe("worldsYear / withWorldsYear", () => {
  it("reads the year from the match's own start, never a constant", () => {
    expect(worldsYear("2026-10-15T18:00:00Z")).toBe(2026);
    expect(worldsYear("2027-10-09T18:00:00Z")).toBe(2027);
    expect(worldsYear(null)).toBeNull();
    expect(worldsYear("nonsense")).toBeNull();
    expect(startMs("2026-10-15T18:00:00Z")).toBe(Date.parse("2026-10-15T18:00:00Z"));
  });

  it("puts the year on the bare league name only", () => {
    expect(withWorldsYear(["Worlds", "Play-Ins"], 2026)).toEqual(["Worlds 2026", "Play-Ins"]);
    // Already carries a year: left alone.
    expect(withWorldsYear(["Worlds", "Worlds 2026", "Play-Ins"], 2026)).toEqual(["Worlds", "Worlds 2026", "Play-Ins"]);
    // Not the bare league name, or no year known: left alone.
    expect(withWorldsYear(["Worlds Qualifying", "Finals"], 2026)).toEqual(["Worlds Qualifying", "Finals"]);
    expect(withWorldsYear(["Worlds", "Play-Ins"], null)).toEqual(["Worlds", "Play-Ins"]);
    expect(withWorldsYear([], 2026)).toEqual([]);
  });
});
