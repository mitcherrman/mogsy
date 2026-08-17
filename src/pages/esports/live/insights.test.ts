/**
 * LIVE1 Phase 4B2 — match insight presentation.
 *
 * The backend owns the arithmetic (and tests it against controlled gold
 * histories); these tests own the wording, the omissions and the story
 * assembly rules. Every fixture below is a hand-built payload, so a change
 * to a sentence rule fails here rather than quietly re-describing matches.
 */
import { describe, expect, it } from "vitest";

import type {
  LiveGameSummary,
  MatchInsightsResponse,
  ObjectiveTally,
  RoleGap,
} from "@/lib/live-esports/api";

import {
  buildStory,
  durationLabel,
  emptyInsightReason,
  insightRows,
  playerHandle,
  primaryMomentum,
  primaryWindow,
  roleGapText,
  tallyPhrase,
  timesLabel,
  windowLabel,
} from "./insights";

/* ── fixtures ──────────────────────────────────────────────────────────────── */

const GAME = {
  game_id: "G1",
  match_id: "M1",
  league: { slug: "lck", name: "LCK" },
  block_name: null,
  best_of: 3,
  game_number: 2,
  teams: {
    blue: { name: "KT Rolster", code: "KT", esports_team_id: "1", resolved_page: null, series_wins: 1 },
    red: { name: "Hanwha Life", code: "HLE", esports_team_id: "2", resolved_page: null, series_wins: 0 },
  },
  patch_version: "16.15",
  game_state: "finished",
  availability: "finished",
  availability_detail: null,
  scheduled_start: null,
  first_frame_ts: "2026-08-12T11:00:00Z",
  freshness: {
    label: "final",
    seconds_since_success: 10,
    source_frame_ts: null,
    last_attempt_at: null,
    last_success_at: null,
  },
} as unknown as LiveGameSummary;

const tally = (t: Partial<ObjectiveTally> = {}): ObjectiveTally => ({
  kills: 0, towers: 0, inhibitors: 0, dragons: 0, barons: 0, ...t,
});

const player = (name: string, side: "blue" | "red", role: string, gold: number, cs = 200) => ({
  participant_id: side === "blue" ? 1 : 6,
  side, role, name, summoner_name: `T ${name}`, champion: "Sivir",
  total_gold: gold, creep_score: cs,
});

function payload(over: Record<string, unknown> = {}): MatchInsightsResponse {
  return {
    enabled: true,
    generated_at: "2026-08-12T12:00:00.000Z",
    game_id: "G1",
    availability: "finished",
    freshness: GAME.freshness,
    retention: "full",
    final: true,
    definitions: {
      min_lead_gold: 400,
      swing_window_seconds: 480,
      min_swing_gold: 2500,
      recent_windows_seconds: [180, 300],
      objective_event_types: [],
      time_basis: "seconds since the first stored telemetry frame",
      window_anchor: "latest stored telemetry frame",
    },
    coverage: {
      gold_samples: 200, first_frame_ts: "2026-08-12T11:00:00Z",
      last_frame_ts: "2026-08-12T11:33:20Z", elapsed_seconds: 2000, events: 90,
    },
    gold: {
      current_lead: { diff: 3200, side: "blue", gold: 3200, even: false, t: 2000, frame_ts: "x" },
      largest_lead: {
        blue: { gold: 6800, t: 1122, frame_ts: "x", meaningful: true },
        red: { gold: 2100, t: 400, frame_ts: "x", meaningful: true },
      },
      biggest_swing: {
        side: "red", gold: 5100, from_t: 1122, to_t: 1502,
        from_frame_ts: "x", to_frame_ts: "y", duration_seconds: 380,
        from_diff: 6800, to_diff: 1700,
      },
      momentum: [
        { window_seconds: 180, partial: false, covered_seconds: 175, diff: 900, side: "blue", gold: 900, even: false, from_t: 1825, to_t: 2000 },
        { window_seconds: 300, partial: false, covered_seconds: 295, diff: 2700, side: "blue", gold: 2700, even: false, from_t: 1705, to_t: 2000 },
      ],
      lead_changes: [{ t: 1440, frame_ts: "x", to_side: "red" }],
    },
    objectives: [
      { window_seconds: 180, events: 2, usable: true, blue: tally({ towers: 2 }), red: tally() },
      { window_seconds: 300, events: 6, usable: true, blue: tally({ barons: 1, towers: 2 }), red: tally({ kills: 3 }) },
    ],
    players: {
      top_gold: player("Bdd", "blue", "mid", 12400),
      role_gaps: [],
      biggest_role_gap: {
        role: "mid", gold_diff: 1800, side: "blue", gold: 1800, cs_diff: 22,
        blue: player("Bdd", "blue", "mid", 12400),
        red: player("Zeka", "red", "mid", 10600),
      } as unknown as RoleGap,
      role_mapping_complete: true,
      roles_compared: 5,
    },
    ...over,
  } as MatchInsightsResponse;
}

const rowFor = (data: MatchInsightsResponse, key: string) =>
  insightRows(data, GAME).find((r) => r.key === key);

/* ── formatters ────────────────────────────────────────────────────────────── */

describe("formatters", () => {
  it.each([
    [380, "6m 20s"],
    [360, "6m"],
    [45, "45s"],
    [0, "0s"],
  ])("durationLabel(%i) is %s", (input, expected) => {
    expect(durationLabel(input)).toBe(expected);
  });

  it("durationLabel refuses absent and nonsensical spans", () => {
    expect(durationLabel(null)).toBeNull();
    expect(durationLabel(undefined)).toBeNull();
    expect(durationLabel(-5)).toBeNull();
  });

  it.each([[1, "once"], [2, "twice"], [3, "3 times"]])(
    "timesLabel(%i) is %s", (n, expected) => expect(timesLabel(n)).toBe(expected),
  );

  it("windowLabel renders whole minutes", () => {
    expect(windowLabel(300)).toBe("Last 5m");
    expect(windowLabel(180)).toBe("Last 3m");
    expect(windowLabel(90)).toBe("Last 90s");
  });

  it("playerHandle drops the canonical disambiguator", () => {
    expect(playerHandle(player("Lucid (Choi Yong-hyeok)", "blue", "jungle", 1))).toBe("Lucid");
    expect(playerHandle(player("Bdd", "blue", "mid", 1))).toBe("Bdd");
  });

  it("playerHandle falls back to the in-game name, then to nothing", () => {
    expect(playerHandle({ ...player("x", "blue", "mid", 1), name: null })).toBe("T x");
    expect(playerHandle({ ...player("x", "blue", "mid", 1), name: null, summoner_name: null })).toBeNull();
    expect(playerHandle(null)).toBeNull();
  });
});

describe("tallyPhrase", () => {
  it("orders objectives by weight and singularises correctly", () => {
    expect(tallyPhrase(tally({ barons: 1, towers: 2, kills: 3 })))
      .toBe("Baron · 2 towers · 3 kills");
  });

  it("pluralises the big objectives too", () => {
    expect(tallyPhrase(tally({ dragons: 2, towers: 1 }))).toBe("2 Dragons · 1 tower");
  });

  it("is null when nothing was taken", () => {
    expect(tallyPhrase(tally())).toBeNull();
    expect(tallyPhrase(null)).toBeNull();
  });
});

/* ── window selection ──────────────────────────────────────────────────────── */

describe("window selection", () => {
  it("prefers the widest usable objective window", () => {
    expect(primaryWindow(payload())?.window_seconds).toBe(300);
  });

  it("skips windows the backend marked unusable", () => {
    const data = payload({
      objectives: [
        { window_seconds: 180, events: 0, usable: true, blue: tally(), red: tally() },
        { window_seconds: 300, events: 0, usable: false, blue: tally(), red: tally() },
      ],
    });
    expect(primaryWindow(data)?.window_seconds).toBe(180);
  });

  it("is null when no window is usable", () => {
    const data = payload({
      objectives: [{ window_seconds: 300, events: 0, usable: false, blue: tally(), red: tally() }],
    });
    expect(primaryWindow(data)).toBeNull();
  });

  it("prefers the widest momentum window, and copes when only a narrow one exists", () => {
    expect(primaryMomentum(payload())?.window_seconds).toBe(300);
    const short = payload({ gold: { ...payload().gold, momentum: [] } });
    expect(primaryMomentum(short)).toBeNull();
  });
});

/* ── insight rows ──────────────────────────────────────────────────────────── */

describe("insightRows", () => {
  it("produces four to six scannable rows for a complete game", () => {
    const rows = insightRows(payload(), GAME);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.length).toBeLessThanOrEqual(6);
    expect(rows.map((r) => r.key)).toEqual([
      "current", "largest", "swing", "momentum", "objectives", "leader",
    ]);
  });

  it("names the current leader by team code", () => {
    expect(rowFor(payload(), "current")).toMatchObject({
      label: "Final gold lead", value: "KT +3.2k", side: "blue",
    });
  });

  it("says the gold is even rather than quoting a noisy number", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        current_lead: { diff: 120, side: "blue", gold: 120, even: true, t: 2000, frame_ts: "x" },
      },
    });
    const row = rowFor(data, "current");
    expect(row?.value).toBe("Gold is even");
    expect(row?.side).toBeNull();
    expect(row?.detail).toBe("Within 400");
  });

  it("labels a live game's lead without the word final", () => {
    expect(rowFor(payload({ final: false }), "current")?.label).toBe("Gold lead");
  });

  it("reports both peak leads when both sides held one", () => {
    expect(rowFor(payload(), "largest")).toMatchObject({
      value: "KT +6.8k",
      detail: "at 18:42 · HLE +2.1k at 6:40",
    });
  });

  it("reports one peak when only one side ever led meaningfully", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        largest_lead: {
          blue: { gold: 6800, t: 1122, frame_ts: "x", meaningful: true },
          red: { gold: 150, t: 60, frame_ts: "x", meaningful: false },
        },
      },
    });
    expect(rowFor(data, "largest")?.detail).toBe("at 18:42");
  });

  it("omits the peak row entirely when no lead was ever meaningful", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        largest_lead: { blue: { gold: 200, t: 10, frame_ts: "x", meaningful: false }, red: null },
      },
    });
    expect(rowFor(data, "largest")).toBeUndefined();
  });

  it("shows the swing with its interval", () => {
    expect(rowFor(payload(), "swing")).toMatchObject({
      value: "HLE +5.1k",
      detail: "over 6m 20s · 18:42–25:02",
      side: "red",
    });
  });

  it("omits the swing row when the backend found none", () => {
    const data = payload({ gold: { ...payload().gold, biggest_swing: null } });
    expect(rowFor(data, "swing")).toBeUndefined();
  });

  it("shows momentum as the change in the gold difference", () => {
    expect(rowFor(payload(), "momentum")).toMatchObject({
      label: "Last 5m", value: "KT +2.7k",
    });
  });

  it("flags a short game's momentum as partial telemetry", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        momentum: [{
          window_seconds: 300, partial: true, covered_seconds: 95, diff: 900,
          side: "blue", gold: 900, even: false, from_t: 0, to_t: 95,
        }],
      },
    });
    expect(rowFor(data, "momentum")?.detail).toBe("only 1m 35s of telemetry");
  });

  it("says gold held level rather than naming a side", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        momentum: [{
          window_seconds: 300, partial: false, covered_seconds: 295, diff: 40,
          side: "blue", gold: 40, even: true, from_t: 1705, to_t: 2000,
        }],
      },
    });
    expect(rowFor(data, "momentum")).toMatchObject({ value: "Gold held level", side: null });
  });

  it("summarises recent objectives per side", () => {
    expect(rowFor(payload(), "objectives")).toMatchObject({
      label: "Last 5m objectives",
      value: "KT Baron · 2 towers",
      detail: "HLE 3 kills",
    });
  });

  it("says nothing was taken rather than hiding an empty window", () => {
    const data = payload({
      objectives: [{ window_seconds: 300, events: 0, usable: true, blue: tally(), red: tally() }],
    });
    expect(rowFor(data, "objectives")).toMatchObject({ value: "Nothing taken" });
  });

  it("tints a one-sided window and stays neutral when both sides scored", () => {
    const oneSided = payload({
      objectives: [{ window_seconds: 300, events: 1, usable: true, blue: tally({ barons: 1 }), red: tally() }],
    });
    expect(rowFor(oneSided, "objectives")?.side).toBe("blue");
    expect(rowFor(payload(), "objectives")?.side).toBeNull();
  });

  it("shows the gold leader with the widest lane gap beneath it", () => {
    expect(rowFor(payload(), "leader")).toMatchObject({
      value: "Bdd — 12.4k",
      detail: "Mid Bdd +1.8k vs Zeka",
      side: "blue",
    });
  });

  it("explains a missing lane matchup instead of omitting it silently", () => {
    const data = payload({
      players: { ...payload().players, biggest_role_gap: null, role_mapping_complete: false, roles_compared: 3 },
    });
    expect(rowFor(data, "leader")?.detail)
      .toBe("Lane matchups unavailable — roles not published for every player");
  });

  it("adds no lane line when the roles mapped but every lane is level", () => {
    const data = payload({
      players: { ...payload().players, biggest_role_gap: null, role_mapping_complete: true },
    });
    expect(rowFor(data, "leader")?.detail).toBeUndefined();
  });

  it("omits the leader row when player gold is absent", () => {
    const data = payload({ players: { ...payload().players, top_gold: null } });
    expect(rowFor(data, "leader")).toBeUndefined();
  });

  it("returns nothing at all for a game with no telemetry", () => {
    const empty = payload({
      coverage: { gold_samples: 0, first_frame_ts: null, last_frame_ts: null, elapsed_seconds: null, events: 0 },
      gold: { current_lead: null, largest_lead: { blue: null, red: null }, biggest_swing: null, momentum: [], lead_changes: [] },
      objectives: [{ window_seconds: 300, events: 0, usable: false, blue: tally(), red: tally() }],
      players: { top_gold: null, role_gaps: [], biggest_role_gap: null, role_mapping_complete: false, roles_compared: 0 },
    });
    expect(insightRows(empty, GAME)).toEqual([]);
    expect(insightRows(null, GAME)).toEqual([]);
    expect(insightRows(undefined, GAME)).toEqual([]);
  });

  it("still labels sides when the game summary is missing", () => {
    const rows = insightRows(payload(), null);
    expect(rows.find((r) => r.key === "current")?.value).toBe("+3.2k");
  });
});

describe("roleGapText", () => {
  it("names the lane, the leader, the gap and the opponent", () => {
    expect(roleGapText(payload().players.biggest_role_gap)).toBe("Mid Bdd +1.8k vs Zeka");
  });

  it("is null for a level lane or an unnamed player", () => {
    expect(roleGapText(null)).toBeNull();
    expect(roleGapText({ ...payload().players.biggest_role_gap!, side: null })).toBeNull();
  });
});

/* ── game story ────────────────────────────────────────────────────────────── */

describe("buildStory", () => {
  it("assembles peak, lead changes, swing and close, in that order", () => {
    expect(buildStory(payload(), GAME)).toEqual([
      "KT led by 6.8k at 18:42, after HLE had been 2.1k up at 6:40.",
      "The lead changed hands once.",
      "HLE swung 5.1k their way between 18:42 and 25:02.",
      "KT finished 3.2k ahead.",
    ]);
  });

  it("suppresses the peak sentence when the peak IS the ending", () => {
    // Peak at 1990s in a 2000s game: the closing sentence already says it.
    const data = payload({
      gold: {
        ...payload().gold,
        largest_lead: {
          blue: { gold: 13200, t: 1990, frame_ts: "x", meaningful: true },
          red: null,
        },
        lead_changes: [],
        biggest_swing: null,
      },
    });
    expect(buildStory(data, GAME)).toEqual([]);   // one sentence is not a story
  });

  it("suppresses the peak sentence when the swing already closes on it", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        largest_lead: { blue: { gold: 6800, t: 1122, frame_ts: "x", meaningful: true }, red: null },
        biggest_swing: {
          side: "blue", gold: 5100, from_t: 742, to_t: 1122, from_frame_ts: "x",
          to_frame_ts: "y", duration_seconds: 380, from_diff: 1700, to_diff: 6800,
        },
      },
    });
    expect(buildStory(data, GAME)).toEqual([
      "The lead changed hands once.",
      "KT swung 5.1k their way between 12:22 and 18:42.",
      "KT finished 3.2k ahead.",
    ]);
  });

  it("speaks in the present tense for a live game", () => {
    const story = buildStory(payload({ final: false }), GAME);
    expect(story[story.length - 1]).toBe("KT are 3.2k ahead right now.");
  });

  it("says a game finished level rather than naming a winner", () => {
    const data = payload({
      gold: {
        ...payload().gold,
        current_lead: { diff: 90, side: "blue", gold: 90, even: true, t: 2000, frame_ts: "x" },
      },
    });
    expect(buildStory(data, GAME).pop()).toBe("It finished level on gold.");
  });

  it("never uses the word comeback", () => {
    const text = buildStory(payload(), GAME).join(" ").toLowerCase();
    expect(text).not.toContain("comeback");
    expect(text).not.toContain("dominant");
  });

  it("is empty when there is only one sentence to tell", () => {
    const data = payload({
      gold: {
        current_lead: { diff: 3200, side: "blue", gold: 3200, even: false, t: 200, frame_ts: "x" },
        largest_lead: { blue: null, red: null },
        biggest_swing: null,
        momentum: [],
        lead_changes: [],
      },
    });
    expect(buildStory(data, GAME)).toEqual([]);
  });

  it("is empty without a current lead to close on", () => {
    expect(buildStory(payload({ gold: { ...payload().gold, current_lead: null } }), GAME)).toEqual([]);
    expect(buildStory(null, GAME)).toEqual([]);
  });
});

/* ── empty states ──────────────────────────────────────────────────────────── */

describe("emptyInsightReason", () => {
  it("names an absent feed and a barely-started game differently", () => {
    const none = payload({ coverage: { ...payload().coverage, gold_samples: 0 } });
    expect(emptyInsightReason(none)).toBe("No gold telemetry was published for this game.");
    const one = payload({ coverage: { ...payload().coverage, gold_samples: 1 } });
    expect(emptyInsightReason(one)).toContain("Only one frame");
  });

  it("is null once there is a history to compare against", () => {
    expect(emptyInsightReason(payload())).toBeNull();
    expect(emptyInsightReason(null)).toBeNull();
  });
});
