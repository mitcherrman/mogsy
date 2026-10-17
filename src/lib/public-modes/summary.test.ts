/**
 * MC-UX2 — the player-summary contract and its words. The fixtures are REAL
 * backend bodies: `GET /api/game-modes/me/summary` computed by
 * `public_game_modes.history` after games were played through the backend's
 * own routes (a full Match Grid bonus game, public session locks, Daily stage
 * rows), and the same route for a first-time player.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import returning from "./__fixtures__/playerSummary.json";
import empty from "./__fixtures__/playerSummaryEmpty.json";

const h = vi.hoisted(() => ({ token: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/backend-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/backend-auth")>();
  return { ...actual, getExistingBackendAuthToken: h.token, ensureBackendAuthToken: h.ensure };
});

import {
  PlayerSummaryError, PlayerSummaryParseError, TRACKING_NEWS_DAYS, fetchPlayerSummary, modeHistoryEmptyText,
  modeHistoryParts, readPlayerSummary, relativeDay, summaryOwner,
} from "./summary";

const NOW = new Date("2026-10-22T18:00:00Z");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("MC-UX2 — readPlayerSummary", () => {
  it("reads the backend's own body: overall and every mode", () => {
    const s = readPlayerSummary(clone(returning));
    expect(s.gamesPlayed).toBe(returning.overall.games_played);
    expect(s.favoriteModeId).toBe(returning.overall.favorite_mode_id);
    expect(s.lastPlayed?.modeId).toBe(returning.overall.last_played.mode_id);
    expect(s.streakDays).toBe(returning.overall.streak_days);
    expect(Object.keys(s.modes)).toHaveLength(13);
    expect(s.modes.match_grid).toMatchObject({ kind: "boards", played: 2,
      bestBoards: returning.modes.match_grid.best, wins: returning.modes.match_grid.wins });
    expect(s.modes.time_trial).toMatchObject({ kind: "daily_stage", bestCorrect: 17, lastCorrect: 12 });
    expect(s.modes.rangefinder?.bestHits).toEqual(returning.modes.rangefinder.best);
    expect(s.modes.perfect_timing?.closestMs).toBe(returning.modes.perfect_timing.closest.abs_error_ms);
    expect(s.modes.combat_estimate).toMatchObject({ estimateUnit: "damage",
      meanError: returning.modes.combat_estimate.mean.abs_error });
    expect(s.modes.stat_drop).toMatchObject({ estimateUnit: "relative",
      bestError: returning.modes.stat_drop.best.relative_error });
  });

  it("reads a first-time player as zero games and no favourite", () => {
    const s = readPlayerSummary(clone(empty));
    expect(s).toMatchObject({ gamesPlayed: 0, favoriteModeId: null, lastPlayed: null, streakDays: 0 });
    for (const m of Object.values(s.modes)) expect(modeHistoryParts(m, NOW)).toEqual([]);
  });

  it("refuses a body it cannot trust", () => {
    expect(() => readPlayerSummary({ ...clone(returning), contract: "x" })).toThrow(PlayerSummaryParseError);
    const bad = clone(returning) as { overall: { games_played: unknown } };
    bad.overall.games_played = -1;
    expect(() => readPlayerSummary(bad)).toThrow(PlayerSummaryParseError);
    const kind = clone(returning) as { modes: { match_grid: { kind: unknown } } };
    kind.modes.match_grid.kind = "elo";
    expect(() => readPlayerSummary(kind)).toThrow(PlayerSummaryParseError);
  });
});

describe("MC-UX2 — the words on a card", () => {
  const s = readPlayerSummary(clone(returning));
  it("says how much, the best, and when — per mode kind", () => {
    expect(modeHistoryParts(s.modes.match_grid, NOW)).toEqual(["Played 2", "Best 3/3 boards", "Last yesterday"]);
    expect(modeHistoryParts(s.modes.time_trial, NOW)).toEqual(["Played 3", "Best 17 correct", "Last yesterday"]);
    const rf = s.modes.rangefinder!;
    expect(modeHistoryParts(rf, NOW)).toEqual(
      ["2 sessions", `Best ${rf.bestHits!.hits}/${rf.bestHits!.of} exact`, "Last 2 days ago"]);
    expect(modeHistoryParts(s.modes.perfect_timing, NOW)).toEqual(["1 session", "Closest 0.18s off", "Last today"]);
    expect(modeHistoryParts(s.modes.combat_estimate, NOW)[0]).toBe("18 hits");
    expect(modeHistoryParts(s.modes.combat_estimate, NOW)[1]).toBe(`Avg ${Math.round(returning.modes.combat_estimate.mean.abs_error)} damage off`);
    expect(modeHistoryParts(s.modes.stat_drop, NOW)[1]).toBe(`Avg ${Math.round(returning.modes.stat_drop.mean.relative_error * 100)}% off`);
    expect(modeHistoryParts(s.modes.roster_lock, NOW)).toEqual([]);
  });

  it("dates read as today / yesterday / N days ago / a date", () => {
    // The player's own calendar day (local time), not UTC's.
    const local = (d: number, hour: number) => new Date(2026, 9, d, hour).toISOString();
    const now = new Date(2026, 9, 22, 18);
    expect(relativeDay(local(22, 0), now)).toBe("today");
    expect(relativeDay(local(21, 23), now)).toBe("yesterday");
    expect(relativeDay(local(18, 12), now)).toBe("4 days ago");
    expect(relativeDay(local(1, 12), now)).toMatch(/Oct/);
    expect(relativeDay(null, now)).toBeNull();
    expect(relativeDay("not a date", now)).toBeNull();
  });
});

describe("MC-UX2 — fetchPlayerSummary is a read: it never mints an identity", () => {
  const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("no session: no request, no record", async () => {
    h.token.mockResolvedValue(null);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await fetchPlayerSummary()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("a session: GET with its own bearer", async () => {
    h.token.mockResolvedValue("tok-1");
    const fetch = vi.fn(() => ok(returning));
    vi.stubGlobal("fetch", fetch);
    const s = await fetchPlayerSummary();
    expect(s?.gamesPlayed).toBe(returning.overall.games_played);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/game-modes\/me\/summary$/);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("a session the backend refuses reads as no record; a server error is an error", async () => {
    h.token.mockResolvedValue("tok-1");
    vi.stubGlobal("fetch", vi.fn(() => ok({}, 401)));
    expect(await fetchPlayerSummary()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => ok({}, 500)));
    await expect(fetchPlayerSummary()).rejects.toBeInstanceOf(PlayerSummaryError);
  });
});

describe("MC-UX2 corrections — honest scope and tracking", () => {
  it("a session is a dealt run with a lock; how many were finished is read too", () => {
    const s = readPlayerSummary(clone(returning));
    expect(s.modes.rangefinder?.sessionsCompleted).toBe(returning.modes.rangefinder.sessions_completed);
    expect(s.modes.match_grid?.sessionsCompleted).toBeNull();
  });

  it("a board best read from only the latest games says how many", () => {
    const w = clone(returning) as { modes: { match_grid: { best_window: unknown } } };
    w.modes.match_grid.best_window = 200;
    const mg = readPlayerSummary(w).modes.match_grid;
    expect(mg?.bestWindow).toBe(200);
    expect(modeHistoryParts(mg, NOW)[1]).toBe("Best 3/3 boards (last 200)");
    expect(modeHistoryParts(readPlayerSummary(clone(returning)).modes.match_grid, NOW)[1]).toBe("Best 3/3 boards");
  });

  it("session games say tracking starts now in its first weeks, then 'No games tracked yet'", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const body = clone(empty) as { modes: Record<string, { tracked_since?: string }> };
    body.modes.stat_drop.tracked_since = at(2);
    body.modes.rangefinder.tracked_since = at(TRACKING_NEWS_DAYS + 5);
    const s = readPlayerSummary(body);
    expect(modeHistoryEmptyText(s.modes.stat_drop, now)).toBe("History tracking starts now");
    expect(modeHistoryEmptyText(s.modes.rangefinder, now)).toBe("No games tracked yet");
    // Board games and Daily stages were always recorded.
    expect(modeHistoryEmptyText(s.modes.match_grid, now)).toBe("No games yet");
    expect(modeHistoryEmptyText(s.modes.time_trial, now)).toBe("No games yet");
    expect(modeHistoryEmptyText(undefined, now)).toBe("No games yet");
    expect(s.sessionTrackingStartedAt).toBe(empty.session_tracking_started_at);
  });

  it("caches per identity: a JWT's sub, a hash for any other token, never the token itself", () => {
    const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.y`;
    expect(summaryOwner(jwt("user-a"))).toBe("sub:user-a");
    expect(summaryOwner(jwt("user-b"))).not.toBe(summaryOwner(jwt("user-a")));
    expect(summaryOwner(null)).toBe("none");
    expect(summaryOwner("opaque-token")).toMatch(/^tok:/);
    expect(summaryOwner("opaque-token")).not.toContain("opaque");
  });
});
