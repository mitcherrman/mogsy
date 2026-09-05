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
  asSummary,
  countActiveFilters,
  filtersFromParams,
  filtersToParams,
  hasAnyFilter,
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
