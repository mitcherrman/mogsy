/**
 * LIVE1 Phase 4B1 — match context and status language.
 *
 * The behaviour under test is mostly about restraint: what the viewer says
 * when metadata is present, and what it stays silent about when it is not.
 * A "Regular Season" that upstream never published is a bug here, not a
 * nicety, so the missing-metadata cases are as load-bearing as the happy
 * ones.
 */
import { describe, expect, it } from "vitest";

import type { LiveCompetition, LiveGameSummary } from "@/lib/live-esports/api";
import {
  competitionLine,
  gameClock,
  matchDate,
  matchDateShort,
  matchDateTitle,
  matchInstant,
  matchLine,
  patchLabel,
  scopeLabel,
  seriesContext,
  stageLabel,
  statusLabel,
  statusTone,
} from "./lib";

function competition(over: Partial<LiveCompetition> = {}): LiveCompetition {
  return {
    league: { slug: "lck", name: "LCK", region: "KOREA", scope: "domestic" },
    tournament: {
      id: "115548147890329817",
      name: "Split 3 2026",
      slug: "lck_split_3_2026",
      season_name: "lolesports_2026",
      split_name: "Split 3",
    },
    stage: {
      name: null,
      slug: null,
      section_name: null,
      section_type: null,
      round_name: null,
      block_name: "Week 12",
    },
    ...over,
  };
}

function game(over: Partial<LiveGameSummary> = {}): LiveGameSummary {
  return {
    game_id: "g1",
    match_id: "m1",
    league: { slug: "lck", name: "LCK" },
    block_name: "Week 12",
    competition: competition(),
    best_of: 3,
    game_number: 3,
    teams: {
      blue: { name: "KT Rolster", code: "KT", esports_team_id: null, resolved_page: null, series_wins: 1 },
      red: { name: "BRO", code: "BRO", esports_team_id: null, resolved_page: null, series_wins: 1 },
    },
    patch_version: "16.15",
    game_state: "finished",
    availability: "finished",
    availability_detail: null,
    scheduled_start: "2026-08-16T10:00:00Z",
    first_frame_ts: "2026-08-16T12:38:39.215Z",
    freshness: {
      label: "final",
      seconds_since_success: 120,
      source_frame_ts: "2026-08-16T13:17:07.000Z",
      last_attempt_at: null,
      last_success_at: null,
    },
    ...over,
  };
}

describe("status language", () => {
  it("says DONE, never FINAL, for a completed game", () => {
    expect(statusLabel({ label: "final" } as never)).toBe("DONE");
    expect(statusLabel({ label: "final" } as never)).not.toBe("FINAL");
    expect(statusTone({ label: "final" } as never)).toBe("done");
  });

  it("says LIVE only while frames are actually fresh", () => {
    expect(statusLabel({ label: "live_fresh" } as never)).toBe("LIVE");
    expect(statusTone({ label: "live_fresh" } as never)).toBe("live");
  });

  it("keeps the honest in-between states distinct from LIVE and DONE", () => {
    expect(statusLabel({ label: "stale" } as never)).toBe("STALE");
    expect(statusLabel({ label: "delayed" } as never)).toBe("DELAYED");
    expect(statusLabel({ label: "no_stats" } as never)).toBe("NO STATS");
    expect(statusLabel(null)).toBe("NO DATA");
  });
});

describe("match date", () => {
  it("prefers the scheduled start — the slot the match belongs to", () => {
    const instant = matchInstant(game());
    expect(instant?.source).toBe("scheduled");
    expect(instant?.date.toISOString()).toBe("2026-08-16T10:00:00.000Z");
  });

  it("falls back to the first telemetry frame when there is no schedule", () => {
    const instant = matchInstant(game({ scheduled_start: null }));
    expect(instant?.source).toBe("first_frame");
    expect(instant?.date.toISOString()).toBe("2026-08-16T12:38:39.215Z");
  });

  it("renders a calendar date rather than a raw timestamp", () => {
    // Formatted in the runner's own locale/zone; the point is that it is a
    // real calendar date derived from the UTC instant, not the ISO string.
    const rendered = matchDate(game());
    expect(rendered).toBeTruthy();
    expect(rendered).not.toContain("T");
    expect(rendered).not.toContain("Z");
    expect(new Date("2026-08-16T10:00:00Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })).toBe(rendered);
  });

  it("uses a year-free short form on the cards, with the full date in the tooltip", () => {
    const g = game();
    expect(matchDateShort(g)).not.toMatch(/2026/);
    expect(matchDateShort(g)).toBe(
      new Date("2026-08-16T10:00:00Z").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
    expect(matchDate(g)).toMatch(/2026/);
    expect(matchDateShort(game({ scheduled_start: null, first_frame_ts: null }))).toBeNull();
  });

  it("names the timezone conversion in the tooltip rather than hiding it", () => {
    const title = matchDateTitle(game());
    expect(title).toContain("your local time");
    expect(title).toContain("scheduled start");
    expect(matchDateTitle(game({ scheduled_start: null }))).toContain(
      "first telemetry frame",
    );
  });

  it("returns nothing at all when the game has no timestamps", () => {
    const g = game({ scheduled_start: null, first_frame_ts: null });
    expect(matchInstant(g)).toBeNull();
    expect(matchDate(g)).toBeNull();
    expect(matchDateTitle(g)).toBeUndefined();
  });

  it("ignores an unparseable timestamp instead of rendering Invalid Date", () => {
    const g = game({ scheduled_start: "not-a-date" });
    expect(matchInstant(g)?.source).toBe("first_frame");
  });
});

describe("series context", () => {
  it("spells out best-of, game number and the score entering the game", () => {
    expect(seriesContext(game())).toBe("Bo3 · Game 3 · Series 1–1");
  });

  it("has a compact form for the selector cards", () => {
    expect(seriesContext(game(), true)).toBe("Bo3 · G3 · 1–1");
  });

  it("formats Bo1 and Bo5 the same way", () => {
    expect(seriesContext(game({ best_of: 1, game_number: 1 }))).toContain("Bo1");
    expect(seriesContext(game({ best_of: 5, game_number: 4 }))).toContain("Bo5");
    expect(seriesContext(game({ best_of: 5, game_number: 4 }))).toContain("Game 4");
  });

  it("omits a score it does not have rather than showing 0–0", () => {
    const g = game();
    g.teams.blue.series_wins = null;
    g.teams.red.series_wins = null;
    expect(seriesContext(g)).toBe("Bo3 · Game 3");
  });

  it("is null when nothing about the series is known", () => {
    const g = game({ best_of: null, game_number: null });
    g.teams.blue.series_wins = null;
    g.teams.red.series_wins = null;
    expect(seriesContext(g)).toBeNull();
  });
});

describe("competition scope", () => {
  it("labels an international competition from the upstream region", () => {
    const c = competition({
      league: { slug: "worlds", name: "Worlds", region: "INTERNATIONAL", scope: "international" },
    });
    expect(scopeLabel(c)).toBe("International");
  });

  it("labels a domestic league", () => {
    expect(scopeLabel(competition())).toBe("Domestic");
  });

  it("says nothing when the region was never synced", () => {
    const c = competition({
      league: { slug: "lck", name: "LCK", region: null, scope: null },
    });
    expect(scopeLabel(c)).toBeNull();
    expect(scopeLabel(null)).toBeNull();
    expect(scopeLabel(undefined)).toBeNull();
  });
});

describe("stage label", () => {
  it("shows the bracket stage and round for a knockout game", () => {
    const c = competition({
      stage: {
        name: "Playoffs",
        slug: "playoffs",
        section_name: "Playoffs",
        section_type: "bracket",
        round_name: "Finals",
        block_name: "Playoffs",
      },
    });
    expect(stageLabel(c)).toBe("Playoffs · Finals");
  });

  it("never repeats the same word twice", () => {
    const c = competition({
      stage: {
        name: "Play-Ins",
        slug: "play_ins",
        section_name: "Play-Ins",
        section_type: "bracket",
        round_name: null,
        block_name: "Play-Ins",
      },
    });
    expect(stageLabel(c)).toBe("Play-Ins");
  });

  it("falls back to the schedule block for a group-stage game", () => {
    // LCK's Groups stage publishes rankings, not match ids, so there is no
    // bracket row — and "Week 12" is NOT promoted to "Regular Season".
    expect(stageLabel(competition())).toBe("Week 12");
    expect(stageLabel(competition())).not.toContain("Regular Season");
  });

  it("is null when no stage metadata exists at all", () => {
    const c = competition({
      stage: {
        name: null, slug: null, section_name: null, section_type: null,
        round_name: null, block_name: null,
      },
    });
    expect(stageLabel(c)).toBeNull();
  });
});

describe("competition line", () => {
  it("reads league, tournament and stage for a domestic regular-season game", () => {
    expect(competitionLine(game())).toEqual(["LCK", "Split 3 2026", "Week 12"]);
  });

  it("reads the knockout stage for an international game", () => {
    const g = game({
      league: { slug: "worlds", name: "Worlds" },
      block_name: "Knockouts",
      competition: competition({
        league: { slug: "worlds", name: "Worlds", region: "INTERNATIONAL", scope: "international" },
        tournament: {
          id: "1", name: "World Championship 2026", slug: "worlds_2026",
          season_name: "lolesports_2026", split_name: "Worlds",
        },
        stage: {
          name: "Knockout Stage", slug: "knockouts", section_name: "Knockouts",
          section_type: "bracket", round_name: "Semifinals", block_name: "Knockouts",
        },
      }),
    });
    expect(competitionLine(g)).toEqual([
      "Worlds",
      "World Championship 2026",
      "Knockout Stage · Semifinals",
    ]);
    expect(scopeLabel(g.competition)).toBe("International");
  });

  it("degrades to the league alone when the backend sends no competition", () => {
    expect(competitionLine(game({ competition: null, block_name: null }))).toEqual([
      "LCK",
    ]);
    expect(competitionLine(game({ competition: undefined, block_name: null }))).toEqual([
      "LCK",
    ]);
  });

  it("still shows the schedule block when only the league is known", () => {
    expect(competitionLine(game({ competition: null }))).toEqual(["LCK", "Week 12"]);
  });

  it("is empty rather than partial when nothing is known", () => {
    expect(
      competitionLine(
        game({ competition: null, block_name: null, league: { slug: null, name: null } }),
      ),
    ).toEqual([]);
  });
});

describe("match line", () => {
  it("carries tagged parts so the date's tooltip never depends on locale", () => {
    const parts = matchLine(game());
    expect(parts.map((p) => p.kind)).toEqual(["date", "series", "clock", "patch"]);
    expect(parts[0].title).toContain("your local time");
    expect(parts[1].text).toBe("Bo3 · Game 3 · Series 1–1");
    expect(parts[3].text).toBe("Patch 16.15");
  });

  it("drops the clock when the game produced no frames", () => {
    const parts = matchLine(game({ first_frame_ts: null }));
    expect(parts.map((p) => p.kind)).not.toContain("clock");
  });

  it("is empty for an absent game", () => {
    expect(matchLine(null)).toEqual([]);
  });
});


/* ── what we do NOT know ─────────────────────────────────────────────────── */

describe("gameClock", () => {
  const span = (first: string | null, latest: string | null) =>
    ({
      first_frame_ts: first,
      freshness: { source_frame_ts: latest },
    }) as unknown as LiveGameSummary;

  it("reports the elapsed span between the first and latest stored frame", () => {
    expect(gameClock(span("2026-09-04T17:00:00Z", "2026-09-04T17:38:28Z"))).toBe("38:28");
  });

  it("says nothing when the store holds a single frame", () => {
    // The common production shape: a finished game whose only telemetry is
    // the poller's last capture. "0:00" would claim the game lasted no time.
    expect(gameClock(span("2026-09-04T17:45:50.080Z", "2026-09-04T17:45:50.080Z"))).toBeNull();
  });

  it("says nothing when either end of the span is missing", () => {
    expect(gameClock(span(null, "2026-09-04T17:38:28Z"))).toBeNull();
    expect(gameClock(span("2026-09-04T17:00:00Z", null))).toBeNull();
  });

  it("keeps a completed match line usable without a clock", () => {
    const g = game({
      first_frame_ts: "2026-09-04T17:45:50.080Z",
      freshness: { ...game().freshness, source_frame_ts: "2026-09-04T17:45:50.080Z" },
    });
    const kinds = matchLine(g).map((p) => p.kind);
    expect(kinds).not.toContain("clock");
    expect(kinds).toContain("date");
  });
});

describe("patchLabel", () => {
  it("reduces the upstream game version to the patch a reader knows", () => {
    expect(patchLabel("16.17.810.4348")).toBe("16.17");
  });

  it("leaves an already-short patch alone", () => {
    expect(patchLabel("16.15")).toBe("16.15");
  });

  it("shows an unrecognisable version verbatim rather than truncating it", () => {
    // Better a long true string than a short invented one.
    expect(patchLabel("preseason")).toBe("preseason");
    expect(patchLabel("v16.17")).toBe("v16.17");
  });

  it("is silent when there is no patch", () => {
    expect(patchLabel(null)).toBeNull();
    expect(patchLabel("")).toBeNull();
  });

  it("keeps the full version available as the segment tooltip", () => {
    const g = game({ patch_version: "16.17.810.4348" });
    const patch = matchLine(g).find((p) => p.kind === "patch");
    expect(patch?.text).toBe("Patch 16.17");
    expect(patch?.title).toBe("16.17.810.4348");
  });
});
