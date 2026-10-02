/**
 * Series and match state for the Pro Play hub (PPH3). Pure, so every rule is
 * tested without a page.
 *
 * THE FEED IS PER GAME; A READER THINKS PER MATCH. Games of one series share a
 * `match_id`, and without grouping a Bo5 reads as five unrelated fixtures. The
 * hub groups them here and draws ONE rail entry per series.
 *
 * WHO WON EACH GAME — ONLY FROM WHAT THE FEED ALREADY SAYS:
 *
 * - `series_wins` on a game is the score ENTERING that game (LIVE1 freezes it
 *   when the game stops being current). So for any game followed by another
 *   one in the feed, its winner is the team whose count went up by one.
 * - The last game of a series has no successor. Its winner comes from its own
 *   final team state through `isWinner` — the live page's rule and the
 *   archive's `winning_side`, the same rule — and stays unknown when that rule
 *   abstains. An unknown result is never guessed from kills.
 *
 * Teams are matched across games by identity, never by side: blue and red
 * swap between games of a series.
 *
 * WHAT COUNTS AS A GAME. A `scheduled` row is a game that never started — in
 * production, the unplayed Game 4/5 of a series that ended early. It is not a
 * played game and never an upcoming match; it is dropped here, and a series
 * made only of such rows is not drawn at all.
 */
import type { LiveGameSummary, LiveTeamState, LiveTeamSummary } from "@/lib/live-esports/api";
import { isWinner, statusTone } from "@/pages/esports/live/lib";

type Side = "blue" | "red";
export type TeamStates = Partial<Record<Side, LiveTeamState>> | null | undefined;

/** The three states a reader is shown. Anything else (a stale or failing
 *  feed) keeps the live page's own honest pill. */
export type MatchState = "live" | "completed" | "upcoming";

/** A team's identity across the games of one series. */
export function teamIdentity(t: LiveTeamSummary | null | undefined): string | null {
  return t?.esports_team_id || t?.resolved_page || t?.code || t?.name || null;
}

export type SeriesGame = {
  game: LiveGameSummary;
  live: boolean;
  /** Identity of the team that won, or null when the feed cannot say. */
  winner: string | null;
};

export type HubSeries = {
  /** `match_id`, or the game id for a row without one. */
  key: string;
  /** Played games, Game 1 first. */
  games: SeriesGame[];
  /** The game the series opens on: the live one, else the latest played. */
  focus: LiveGameSummary;
  bestOf: number | null;
  /** Ordered as the focus game draws them: a = blue, b = red. */
  a: { team: LiveTeamSummary; id: string | null };
  b: { team: LiveTeamSummary; id: string | null };
  /** Series score. `known` is false when the last finished game's winner
   *  could not be established, so the score may be one game short. */
  score: { a: number; b: number; known: boolean };
  decided: boolean;
  state: Extract<MatchState, "live" | "completed">;
};

const played = (g: LiveGameSummary) => g.availability !== "scheduled";

/** Wins entering a game, keyed by team identity. Null when not published. */
function entering(g: LiveGameSummary): Map<string, number> | null {
  const bw = g.teams.blue?.series_wins;
  const rw = g.teams.red?.series_wins;
  const bid = teamIdentity(g.teams.blue);
  const rid = teamIdentity(g.teams.red);
  if (bw == null || rw == null || !bid || !rid) return null;
  return new Map([
    [bid, bw],
    [rid, rw],
  ]);
}

function winnerFromStates(g: LiveGameSummary, states: TeamStates): string | null {
  if (g.availability !== "finished" || !states) return null;
  if (isWinner(states, "blue")) return teamIdentity(g.teams.blue);
  if (isWinner(states, "red")) return teamIdentity(g.teams.red);
  return null;
}

/**
 * Group feed games into series, in rail order: series with a live game first
 * (in the feed's live order), then the rest by their most recent game.
 *
 * `finalStates` maps game id → its final team state, for the games whose
 * winner cannot be read from a successor (in practice, each series' last
 * game). Missing entries simply leave that result unknown.
 */
export function groupSeries(
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
  finalStates: Record<string, TeamStates> = {},
): HubSeries[] {
  const liveIds = new Set(live.map((g) => g.game_id));
  const order: string[] = [];
  const buckets = new Map<string, LiveGameSummary[]>();
  for (const g of [...live, ...recent]) {
    if (!played(g)) continue;
    const key = g.match_id || g.game_id;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    const list = buckets.get(key)!;
    if (!list.some((x) => x.game_id === g.game_id)) list.push(g);
  }

  const out: HubSeries[] = [];
  for (const key of order) {
    const games = [...buckets.get(key)!].sort(
      (x, y) => (x.game_number ?? 0) - (y.game_number ?? 0) || x.game_id.localeCompare(y.game_id),
    );
    const liveGame = games.find((g) => liveIds.has(g.game_id)) ?? null;
    const last = games[games.length - 1];
    const focus = liveGame ?? last;
    const aTeam = focus.teams.blue;
    const bTeam = focus.teams.red;
    const aId = teamIdentity(aTeam);
    const bId = teamIdentity(bTeam);

    const seriesGames: SeriesGame[] = games.map((g, i) => {
      const next = games[i + 1];
      let winner: string | null = null;
      const before = entering(g);
      const after = next && next.game_number === (g.game_number ?? 0) + 1 ? entering(next) : null;
      if (before && after) {
        for (const [id, w] of before) {
          if ((after.get(id) ?? w) === w + 1) winner = id;
        }
      }
      if (!winner && !next) winner = winnerFromStates(g, finalStates[g.game_id]);
      return { game: g, live: liveIds.has(g.game_id), winner };
    });

    // Score: wins entering the last played game, plus that game's result when
    // it is finished and known. Falls back to counting known winners when the
    // feed published no running score.
    const lastEntry = entering(last);
    const lastResult = seriesGames[seriesGames.length - 1];
    let a: number;
    let b: number;
    let known = true;
    if (lastEntry && aId && bId) {
      a = lastEntry.get(aId) ?? 0;
      b = lastEntry.get(bId) ?? 0;
    } else {
      const earlier = seriesGames.slice(0, -1);
      a = earlier.filter((s) => s.winner === aId).length;
      b = earlier.filter((s) => s.winner === bId).length;
      if (earlier.some((s) => !s.winner)) known = false;
    }
    if (!lastResult.live && last.availability === "finished") {
      if (lastResult.winner === aId) a += 1;
      else if (lastResult.winner === bId) b += 1;
      else known = false;
    } else if (!lastResult.live) {
      // Not live, not finished: a stale game. Its result is not a result.
      known = false;
    }

    const bestOf = focus.best_of ?? null;
    const needed = bestOf ? Math.floor(bestOf / 2) + 1 : 1;
    const decided = known && Math.max(a, b) >= needed;
    out.push({
      key,
      games: seriesGames,
      focus,
      bestOf,
      a: { team: aTeam, id: aId },
      b: { team: bTeam, id: bId },
      score: { a, b, known },
      decided,
      state: liveGame ? "live" : "completed",
    });
  }
  // Live series lead; within each group the feed's own order stands.
  return [...out.filter((s) => s.state === "live"), ...out.filter((s) => s.state !== "live")];
}

/** The series a game belongs to. */
export function seriesOf(series: readonly HubSeries[], gameId: string | null): HubSeries | null {
  if (!gameId) return null;
  return series.find((s) => s.games.some((g) => g.game.game_id === gameId)) ?? null;
}

/**
 * The state badge for ONE game, or null when the live page's honest
 * in-between pill (stale, source failing, no data) must be shown instead.
 */
export function gameState(game: LiveGameSummary, isLive: boolean): MatchState | null {
  if (isLive) return "live";
  if (game.availability === "finished" || statusTone(game.freshness) === "done") return "completed";
  return null;
}

/** Final game ids whose result needs their own team state: each series'
 *  last played game, when finished. */
export function gamesNeedingResult(series: readonly HubSeries[]): string[] {
  const ids: string[] = [];
  for (const s of series) {
    const last = s.games[s.games.length - 1];
    if (last && !last.live && last.game.availability === "finished") ids.push(last.game.game_id);
  }
  return ids;
}

/* ── upcoming ───────────────────────────────────────────────────────────── */

/** "in 2d 14h" / "in 3h 05m" / "in 12m" / "starting" — from now to `start`. */
export function countdown(startIso: string, now: number): string | null {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  const s = Math.floor((t - now) / 1000);
  if (s <= 0) return "starting";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${String(m).padStart(2, "0")}m`;
  return `in ${Math.max(1, m)}m`;
}

/** "Thu 1 Oct · 18:00" in the viewer's own timezone. */
export function localStart(startIso: string): string | null {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

/* ── event identity ─────────────────────────────────────────────────────── */

/**
 * The text a league's event-media slot shows until the media authority can
 * serve league art: the league's own short name when it is one ("LCK",
 * "CBLOL", "WSCI"), otherwise the initials of its words ("EMEA Masters" →
 * "EM"). Derived from upstream's name only — never a guessed code.
 */
export function leagueMonogram(name: string | null | undefined, slug?: string | null): string {
  const n = (name || "").trim();
  if (n && n.length <= 6 && !/\s/.test(n)) return n.toUpperCase();
  const words = n.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return (slug || "?").slice(0, 4).toUpperCase();
}

/**
 * What the rail's UP NEXT group shows: the soonest few fixtures, without
 * matches whose BOTH teams upstream still names "TBD" — a slot in a bracket,
 * not yet a match anyone can follow. The endpoint keeps them; only the
 * rail's short list leaves them out.
 */
export const RAIL_UPCOMING_MAX = 4;
export function railUpcoming<T extends { teams: { a: { tbd: boolean }; b: { tbd: boolean } } }>(
  matches: readonly T[],
  max = RAIL_UPCOMING_MAX,
): T[] {
  return matches.filter((m) => !(m.teams.a.tbd && m.teams.b.tbd)).slice(0, max);
}
