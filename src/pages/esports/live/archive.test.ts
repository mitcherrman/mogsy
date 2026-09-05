/**
 * Pure helpers behind the match archive — the parts with real logic in them,
 * tested without a DOM.
 */
import { describe, expect, it } from "vitest";

import type { ArchiveGame } from "@/lib/live-esports/api";
import { archiveQueryString } from "@/lib/live-esports/api";
import {
  DEPTH_LABEL,
  EMPTY_FILTERS,
  QUICK_LEAGUE_CHIPS,
  asSummary,
  countActiveFilters,
  describeScope,
  featuredMatches,
  filtersFromParams,
  filtersToParams,
  groupIntoSeries,
  hasAnyFilter,
  isQuickFilterActive,
  isUnfinished,
  isUnplayed,
  quickFilters,
  recentFrom,
  seriesResult,
  sharedPatch,
  toggleQuickFilter,
  tournamentsForLeague,
} from "./archive";
import { competitionLine, matchDate, patchLabel, seriesContext } from "./lib";

const ROW: ArchiveGame = {
  game_id: "115548681803406242",
  match_id: "115548681803406239",
  scheduled_start: "2026-08-30T16:00:00Z",
  sort_ts: "2026-08-30T16:00:00Z",
  league: { slug: "lec", name: "LEC", region: "EMEA", scope: "domestic" },
  tournament: {
    id: "t-lec", name: "Summer 2026", slug: "lec_summer_2026",
    season_name: "lolesports_2026", split_name: "Summer",
  },
  stage: {
    name: "Playoffs", slug: "playoffs", section_name: "Playoffs",
    section_type: "bracket", round_name: "Finals", block_name: "Playoffs",
  },
  best_of: 5,
  game_number: 3,
  teams: {
    blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 1, kills: 18 },
    red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 1, kills: 9 },
  },
  patch_version: "16.17.810.4348",
  availability: "finished",
  final: true,
  winner: "blue",
  telemetry: { frame_count: 77, event_count: 69, depth: "full", has_timeline: true },
};

describe("asSummary", () => {
  it("feeds the viewer's own display helpers without a second code path", () => {
    const s = asSummary(ROW);
    expect(competitionLine(s)).toEqual(["LEC", "Summer 2026", "Playoffs · Finals"]);
    expect(seriesContext(s)).toBe("Bo5 · Game 3 · Series 1–1");
    expect(patchLabel(s.patch_version)).toBe("16.17");
    expect(matchDate(s)).toBeTruthy();
  });

  it("invents no elapsed time for a row that carries no frame clock", () => {
    // An archive row has no `first_frame_ts`, so the viewer's `gameClock`
    // returns null and the row shows no duration — rather than "0:00", the
    // exact false claim the match centre already had to fix.
    expect(asSummary(ROW).first_frame_ts).toBeNull();
    expect(asSummary(ROW).freshness.source_frame_ts).toBeNull();
  });

  it("marks a finished game final and an unfinished one as having no data", () => {
    expect(asSummary(ROW).freshness.label).toBe("final");
    expect(asSummary({ ...ROW, final: false }).freshness.label).toBe("no_data");
  });

  it("degrades when competition metadata was never synced", () => {
    const bare = {
      ...ROW,
      league: { slug: "nacl", name: null, region: null, scope: null },
      tournament: { id: null, name: null, slug: null, season_name: null, split_name: null },
      stage: { name: null, slug: null, section_name: null, section_type: null, round_name: null, block_name: "Week 4" },
    } as ArchiveGame;
    expect(competitionLine(asSummary(bare))).toEqual(["nacl", "Week 4"]);
  });
});

describe("depth labels", () => {
  it("promises only what the viewer can actually render", () => {
    expect(DEPTH_LABEL.full).toBe("Full timeline");
    expect(DEPTH_LABEL.final_snapshot).toBe("Final snapshot");
    expect(DEPTH_LABEL.none).toBe("No telemetry");
  });
});

describe("filter state", () => {
  it("round-trips through the URL", () => {
    const f = {
      league: "lck", tournament: "t-lck", team: "t1",
      date_from: "2026-08-20", date_to: "2026-08-31",
      status: "final" as const, depth: "full" as const,
    };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
  });

  it("writes nothing for an untouched filter", () => {
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe("");
  });

  it("drops a status or depth the backend would reject", () => {
    const p = new URLSearchParams("status=whatever&depth=sparse&league=lec");
    const f = filtersFromParams(p);
    expect(f.status).toBeNull();
    expect(f.depth).toBeNull();
    expect(f.league).toBe("lec");
  });

  it("counts what is actually set", () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, league: "lec", team: "g2" })).toBe(2);
  });
});

describe("tournament scoping", () => {
  const all = [
    { id: "a", league_slug: "lec" },
    { id: "b", league_slug: "lck" },
    { id: "c", league_slug: null },
  ];

  it("narrows to the chosen league — five tournaments share the name 'Summer 2026'", () => {
    expect(tournamentsForLeague(all, "lec").map((t) => t.id)).toEqual(["a"]);
  });

  it("shows everything when no league is chosen", () => {
    expect(tournamentsForLeague(all, null)).toHaveLength(3);
  });
});

describe("archiveQueryString", () => {
  it("sends only real values, so an untouched control never narrows the query", () => {
    expect(archiveQueryString(EMPTY_FILTERS)).toBe("");
    expect(archiveQueryString({ ...EMPTY_FILTERS, league: "lec" }, { limit: 24 }))
      .toBe("?league=lec&limit=24");
  });

  it("passes the cursor back verbatim", () => {
    const q = archiveQueryString(EMPTY_FILTERS, { cursor: "MjAyNi0wOC0zMA" });
    expect(q).toContain("cursor=MjAyNi0wOC0zMA");
  });
});

/* ── series ───────────────────────────────────────────────────────────────
 *
 * The grouping is a read of the order the backend already returned, so every
 * test here feeds it rows in that order and checks it never reorders them.
 */
function seriesGame(over: Record<string, unknown> = {}) {
  return {
    game_id: "g1",
    match_id: "m1",
    scheduled_start: "2026-09-05T16:00:00Z",
    sort_ts: "2026-09-05T16:00:00Z",
    league: { slug: "cblol-brazil", name: "CBLOL", region: "BRAZIL", scope: "domestic" },
    tournament: { id: "t1", name: "Split 2 2026", slug: null, season_name: null, split_name: null },
    stage: { name: "Playoffs", slug: null, section_name: "Playoffs", section_type: null, round_name: "Upper Bracket - Quarterfinals", block_name: null },
    best_of: 5,
    game_number: 1,
    teams: {
      blue: { name: "paiN Gaming", code: "PAIN", esports_team_id: "pain", series_wins: 0, kills: 6 },
      red: { name: "Vivo Keyd Stars", code: "VKS", esports_team_id: "vks", series_wins: 0, kills: 14 },
    },
    patch_version: "16.17.810.4348",
    availability: "finished",
    final: true,
    winner: "red",
    telemetry: { frame_count: 191, event_count: 40, depth: "full", has_timeline: true },
    ...over,
  } as unknown as ArchiveGame;
}

describe("groupIntoSeries", () => {
  it("gathers adjacent games of one match without re-sorting them", () => {
    const rows = [
      seriesGame({ game_id: "g4", game_number: 4 }),
      seriesGame({ game_id: "g3", game_number: 3 }),
      seriesGame({ game_id: "g2", game_number: 2 }),
    ];
    const [group] = groupIntoSeries(rows);
    expect(groupIntoSeries(rows).length).toBe(1);
    expect(group.games.map((g) => g.game_id)).toEqual(["g4", "g3", "g2"]);
    // The header reads its shared facts from the furthest game on the page.
    expect(group.lead.game_id).toBe("g4");
  });

  it("starts a new group at a different match", () => {
    const groups = groupIntoSeries([
      seriesGame({ game_id: "a", match_id: "m1" }),
      seriesGame({ game_id: "b", match_id: "m2" }),
    ]);
    expect(groups.map((g) => g.matchId)).toEqual(["m1", "m2"]);
  });

  it("keys a group by its lead game, so two runs of one match cannot collide", () => {
    // Three production match ids appear in two runs of the same page.
    const groups = groupIntoSeries([
      seriesGame({ game_id: "a", match_id: "m1" }),
      seriesGame({ game_id: "b", match_id: "m2" }),
      seriesGame({ game_id: "c", match_id: "m1" }),
    ]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it("never joins two runs of the same match that are not adjacent", () => {
    // Three production match ids appear in two separate runs; a header
    // spanning them would claim a series the page cannot actually show.
    const groups = groupIntoSeries([
      seriesGame({ game_id: "a", match_id: "m1" }),
      seriesGame({ game_id: "b", match_id: "m2" }),
      seriesGame({ game_id: "c", match_id: "m1" }),
    ]);
    expect(groups.length).toBe(3);
  });

  it("groups a game with no match id with nothing, including another one", () => {
    const groups = groupIntoSeries([
      seriesGame({ game_id: "a", match_id: null }),
      seriesGame({ game_id: "b", match_id: null }),
    ]);
    expect(groups.length).toBe(2);
    expect(groups.map((g) => g.key)).toEqual(["a", "b"]);
  });

  it("keeps an empty page empty", () => {
    expect(groupIntoSeries([])).toEqual([]);
  });
});

describe("seriesResult", () => {
  const of = (lead: ArchiveGame) => seriesResult(groupIntoSeries([lead])[0]);

  it("adds this game's own winner to the score it was played at", () => {
    // Bo5 game 4 at 2–1, blue wins: 3–1 ends it.
    expect(
      of(
        seriesGame({
          game_number: 4,
          winner: "blue",
          teams: {
            blue: { name: "paiN", code: "PAIN", esports_team_id: "pain", series_wins: 2, kills: 21 },
            red: { name: "VKS", code: "VKS", esports_team_id: "vks", series_wins: 1, kills: 4 },
          },
        }),
      ),
    ).toEqual({ blue: 3, red: 1, winner: "blue", bestOf: 5 });
  });

  it("claims nothing when the arithmetic does not end the series", () => {
    // 1–1 after game 2 of a Bo5. The match went on, and how it went on is not
    // on this page — "the last game we hold" is a fact about pagination.
    expect(
      of(
        seriesGame({
          game_number: 2,
          winner: "red",
          teams: {
            blue: { name: "paiN", code: "PAIN", esports_team_id: "pain", series_wins: 1, kills: 9 },
            red: { name: "VKS", code: "VKS", esports_team_id: "vks", series_wins: 0, kills: 19 },
          },
        }),
      ),
    ).toBeNull();
  });

  it("ends a best-of-three at two", () => {
    expect(
      of(
        seriesGame({
          best_of: 3,
          winner: "blue",
          teams: {
            blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 1, kills: 20 },
            red: { name: "GEN", code: "GEN", esports_team_id: "gen", series_wins: 0, kills: 9 },
          },
        }),
      ),
    ).toEqual({ blue: 2, red: 0, winner: "blue", bestOf: 3 });
  });

  it("claims nothing for a game the store will not call won", () => {
    expect(of(seriesGame({ winner: null }))).toBeNull();
  });

  it("claims nothing for a game that is not final", () => {
    expect(of(seriesGame({ final: false, availability: "scheduled" }))).toBeNull();
  });

  it("claims nothing when the frozen score is missing", () => {
    expect(
      of(
        seriesGame({
          teams: {
            blue: { name: "A", code: "A", esports_team_id: "a", series_wins: null, kills: 1 },
            red: { name: "B", code: "B", esports_team_id: "b", series_wins: null, kills: 2 },
          },
        }),
      ),
    ).toBeNull();
  });

  it("claims nothing without a best-of to measure against", () => {
    expect(of(seriesGame({ best_of: null, winner: "blue" }))).toBeNull();
  });
});

describe("sharedPatch", () => {
  const group = (patches: (string | null)[]) =>
    groupIntoSeries(patches.map((p, i) => seriesGame({ game_id: `g${i}`, patch_version: p })))[0];

  it("hoists the patch every game of the series agrees on", () => {
    expect(sharedPatch(group(["16.17.1", "16.17.1"]))).toBe("16.17.1");
  });

  it("says nothing when the games disagree, so each row keeps its own", () => {
    expect(sharedPatch(group(["16.17.1", "16.16.1"]))).toBeNull();
  });

  it("says nothing when the patch is unknown", () => {
    expect(sharedPatch(group([null, null]))).toBeNull();
  });
});

describe("isUnplayed", () => {
  it("recognises a best-of slot that was created and never played", () => {
    // Riot pre-creates every game of a series; a 2–0 leaves a game 3 behind
    // with no frames, and "No telemetry" was the wrong thing to say about it.
    expect(isUnplayed(seriesGame({ final: false, availability: "scheduled" }))).toBe(true);
  });

  it("does not confuse a thin recording with an absence", () => {
    expect(
      isUnplayed(
        seriesGame({
          telemetry: { frame_count: 1, event_count: 0, depth: "final_snapshot", has_timeline: false },
        }),
      ),
    ).toBe(false);
  });
});

/* ── featured ─────────────────────────────────────────────────────────────── */

describe("featuredMatches", () => {
  const decider = (id: string, league: string) =>
    seriesGame({
      game_id: id,
      match_id: `m-${id}`,
      league: { slug: league, name: league.toUpperCase(), region: null, scope: "domestic" },
      winner: "blue",
      teams: {
        blue: { name: "A", code: "A", esports_team_id: "a", series_wins: 2, kills: 20 },
        red: { name: "B", code: "B", esports_team_id: "b", series_wins: 1, kills: 10 },
      },
    });
  const midSeries = (id: string, league: string) =>
    seriesGame({
      game_id: id,
      match_id: `m-${id}`,
      league: { slug: league, name: league.toUpperCase(), region: null, scope: "domestic" },
      winner: "blue",
      teams: {
        blue: { name: "A", code: "A", esports_team_id: "a", series_wins: 0, kills: 20 },
        red: { name: "B", code: "B", esports_team_id: "b", series_wins: 0, kills: 10 },
      },
    });

  it("prefers the game that ended a series over one that did not", () => {
    const picks = featuredMatches([midSeries("x", "lec"), decider("y", "lck")], 1);
    expect(picks[0].game.game_id).toBe("y");
    expect(picks[0].reason).toBe("decider");
    expect(picks[0].result).toEqual({ blue: 3, red: 1, winner: "blue", bestOf: 5 });
  });

  it("shows one league at a time, so a busy region cannot take every slot", () => {
    const picks = featuredMatches(
      [decider("a", "lec"), decider("b", "lec"), decider("c", "lck")],
      2,
    );
    expect(picks.map((p) => p.game.game_id)).toEqual(["a", "c"]);
  });

  it("fills the strip anyway when only one league played", () => {
    const picks = featuredMatches([decider("a", "lec"), decider("b", "lec")], 2);
    expect(picks.map((p) => p.game.game_id)).toEqual(["a", "b"]);
  });

  it("keeps the input's own recency order between equal picks", () => {
    const picks = featuredMatches([decider("a", "lec"), decider("b", "lck")], 2);
    expect(picks.map((p) => p.game.game_id)).toEqual(["a", "b"]);
  });

  it("says a pick is a plain timeline when nothing was decided", () => {
    const picks = featuredMatches([midSeries("x", "lec")], 1);
    expect(picks[0].reason).toBe("timeline");
    expect(picks[0].result).toBeNull();
  });

  it("returns nothing from nothing rather than inventing a card", () => {
    expect(featuredMatches([])).toEqual([]);
  });

  it("counts a series once, not once per game", () => {
    const g4 = decider("s", "lec");
    const g3 = { ...midSeries("s3", "lec"), match_id: "m-s" } as ArchiveGame;
    expect(featuredMatches([g4, g3], 3).length).toBe(1);
  });
});

/* ── quick filters ────────────────────────────────────────────────────────── */

const QF_FACETS = {
  leagues: [
    { slug: "lck", name: "LCK", games: 97 },
    { slug: "lec", name: "LEC", games: 60 },
    { slug: "hitpoint_masters", name: "Hitpoint Masters", games: 46 },
    { slug: "nacl", name: "NACL", games: 45 },
    { slug: "rift_legends", name: "Rift Legends", games: 45 },
  ],
  date_range: { from: "2026-08-13", to: "2026-09-05" },
};

describe("quickFilters", () => {
  it("hardcodes no league — the chips are whichever have the most stored games", () => {
    const chips = quickFilters(QF_FACETS);
    expect(chips.map((c) => c.id)).toEqual([
      "depth:full",
      "recent",
      "league:lck",
      "league:lec",
      "league:hitpoint_masters",
      "league:nacl",
    ]);
    // The strip is a shortcut, not a second copy of the rail: it stops well
    // short of the 26 leagues the facets carry.
    expect(chips.filter((c) => c.id.startsWith("league:")).length).toBe(QUICK_LEAGUE_CHIPS);
  });

  it("anchors Recent to the newest stored day, not to the reader's clock", () => {
    // A feed that has been quiet for a fortnight must not offer a chip that
    // returns nothing at all.
    const recent = quickFilters(QF_FACETS).find((c) => c.id === "recent");
    expect(recent?.patch).toEqual({ date_from: "2026-08-29", date_to: null });
  });

  it("reads the facet date as a UTC day", () => {
    // `new Date("2026-09-05")` is the 4th in any negative-offset timezone.
    expect(recentFrom("2026-09-05")).toBe("2026-08-29");
    expect(recentFrom("2026-09-05T00:00:00Z")).toBe("2026-08-29");
  });

  it("offers no Recent chip when the store has no date range yet", () => {
    expect(recentFrom(null)).toBeNull();
    const chips = quickFilters({ leagues: [], date_range: { from: null, to: null } });
    expect(chips.map((c) => c.id)).toEqual(["depth:full"]);
  });

  it("survives facets that have not loaded", () => {
    expect(quickFilters(undefined).map((c) => c.id)).toEqual(["depth:full"]);
  });
});

describe("toggling a quick filter", () => {
  const chips = quickFilters(QF_FACETS);
  const full = chips.find((c) => c.id === "depth:full")!;
  const lck = chips.find((c) => c.id === "league:lck")!;

  it("is off until every field it owns matches the URL", () => {
    expect(isQuickFilterActive(full, EMPTY_FILTERS)).toBe(false);
    expect(isQuickFilterActive(full, { ...EMPTY_FILTERS, depth: "full" })).toBe(true);
  });

  it("turns on without disturbing an unrelated filter", () => {
    const next = toggleQuickFilter(full, { ...EMPTY_FILTERS, team: "t1" });
    expect(next).toEqual({ ...EMPTY_FILTERS, team: "t1", depth: "full" });
  });

  it("turns off by clearing only its own fields", () => {
    const next = toggleQuickFilter(full, { ...EMPTY_FILTERS, team: "t1", depth: "full" });
    expect(next).toEqual({ ...EMPTY_FILTERS, team: "t1" });
  });

  it("drops the tournament with the league it belonged to", () => {
    const next = toggleQuickFilter(lck, { ...EMPTY_FILTERS, league: "lec", tournament: "t-lec" });
    expect(next).toEqual({ ...EMPTY_FILTERS, league: "lck" });
  });

  it("reads as active when the same league arrived from the rail", () => {
    expect(isQuickFilterActive(lck, { ...EMPTY_FILTERS, league: "lck" })).toBe(true);
    expect(isQuickFilterActive(lck, { ...EMPTY_FILTERS, league: "lec" })).toBe(false);
  });
});

/* ── the current scope ────────────────────────────────────────────────────── */

describe("describeScope", () => {
  const FACETS = {
    leagues: [{ slug: "lec", name: "LEC" }],
    tournaments: [{ id: "t-lec", name: "Summer 2026", league_slug: "lec" }],
    teams: [{ id: "g2", name: "G2 Esports", code: "G2" }],
  };

  it("names ids the reader never typed", () => {
    const chips = describeScope(
      { ...EMPTY_FILTERS, league: "lec", tournament: "t-lec", team: "g2" },
      FACETS,
    );
    expect(chips.map((c) => [c.kind, c.value])).toEqual([
      ["League", "LEC"],
      ["Tournament", "Summer 2026"],
      ["Team", "G2 Esports"],
    ]);
  });

  it("shows an id the facets do not carry rather than hiding what is narrowing the page", () => {
    const [chip] = describeScope({ ...EMPTY_FILTERS, team: "999" }, FACETS);
    expect(chip.value).toBe("999");
    expect(chip.field).toBe("team");
  });

  it("puts the telemetry and date filters in words too", () => {
    const chips = describeScope(
      { ...EMPTY_FILTERS, depth: "full", status: "final", date_from: "2026-08-29" },
      FACETS,
    );
    expect(chips.map((c) => c.value)).toEqual(["2026-08-29", "Full timeline", "Finished"]);
  });

  it("is empty when nothing is filtered", () => {
    expect(describeScope(EMPTY_FILTERS, FACETS)).toEqual([]);
  });

  it("survives facets that have not loaded", () => {
    expect(describeScope({ ...EMPTY_FILTERS, league: "lec" }, undefined)).toEqual([
      { field: "league", kind: "League", value: "lec" },
    ]);
  });
});

describe("isUnfinished", () => {
  it("marks a game the store has not finalised", () => {
    expect(isUnfinished(seriesGame({ final: false, availability: "live" }))).toBe(true);
  });

  it("does not call a scheduled slot unfinished — it is unplayed", () => {
    expect(isUnfinished(seriesGame({ final: false, availability: "scheduled" }))).toBe(false);
  });

  it("leaves a finished game alone", () => {
    expect(isUnfinished(seriesGame())).toBe(false);
  });
});
