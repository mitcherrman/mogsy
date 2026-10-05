/**
 * Series and match state for the Pro Play hub (PPH3). Pure, so every rule is
 * tested without a page.
 *
 * THE FEED IS PER GAME; A READER THINKS PER MATCH. Games of one series share a
 * `match_id`, and without grouping a Bo5 reads as five unrelated fixtures. The
 * hub groups them here and draws ONE rail entry per series.
 *
 * WHO WON EACH GAME — ONLY WHAT RIOT'S SERIES RECORD SAYS (PP-IA2):
 *
 * - The backend's `series` record (`/games/{id}`, PP-IA2) names every game's
 *   result from Riot's own `gameWins` readings, validated and fail-closed,
 *   and carries the completed series' FINAL score. When the hub holds it, it
 *   is the only source.
 * - Without it (an older backend, or a game whose detail is not loaded),
 *   `series_wins` on a game is the score ENTERING that game, so a game
 *   followed by the next one in the feed is won by the team whose count rose
 *   by one — the same record, checked the same way (each reading must total
 *   `game_number - 1`).
 * - Nothing else decides a result. The inhibitor/tower rule this file used
 *   for a series' last game is gone: a structure lead is not a result, and an
 *   unconfirmed game stays unconfirmed.
 *
 * Teams are matched across games by identity, never by side: blue and red
 * swap between games of a series.
 *
 * WHAT COUNTS AS A GAME. A `scheduled` row is a game that never started — in
 * production, the unplayed Game 4/5 of a series that ended early. It is not a
 * played game and never an upcoming match; it is dropped here, and a series
 * made only of such rows is not drawn at all.
 */
import type {
  LiveGameDetailResponse,
  LiveGameSummary,
  LiveSeriesRecord,
  LiveTeamSummary,
} from "@/lib/live-esports/api";
import { statusTone } from "@/pages/esports/live/lib";

/** What the hub knows of a game beyond the feed: its `/games/{id}` detail's
 *  PP-IA2 fields. Either may be absent (older backend, not loaded yet). */
export type GameRecord = Pick<LiveGameDetailResponse, "result" | "series"> | null | undefined;

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
  /** Series score. `final` is Riot's completed series score, as published.
   *  `known` is false when a finished game's result is unconfirmed, so the
   *  score may be short. */
  score: { a: number; b: number; known: boolean; final: boolean };
  decided: boolean;
  state: Extract<MatchState, "live" | "completed">;
};

const played = (g: LiveGameSummary) => g.availability !== "scheduled";

/** Wins entering a game, keyed by team identity. Null when not published,
 *  or when the reading cannot be the score ENTERING this game (its total must
 *  be `game_number - 1`; a later reading already includes the game). */
function entering(g: LiveGameSummary): Map<string, number> | null {
  const bw = g.teams.blue?.series_wins;
  const rw = g.teams.red?.series_wins;
  const bid = teamIdentity(g.teams.blue);
  const rid = teamIdentity(g.teams.red);
  if (bw == null || rw == null || !bid || !rid || bid === rid) return null;
  if (g.game_number != null && bw + rw !== g.game_number - 1) return null;
  return new Map([
    [bid, bw],
    [rid, rw],
  ]);
}

/** The backend's series record for this match, from any of its games. */
function seriesRecord(
  key: string,
  games: readonly LiveGameSummary[],
  records: Record<string, GameRecord>,
): LiveSeriesRecord | null {
  for (const g of [...games].reverse()) {
    const s = records[g.game_id]?.series;
    if (s && (!s.match_id || s.match_id === key)) return s;
  }
  return null;
}

/** The official winner's identity for one game, or null. */
function officialWinner(
  g: LiveGameSummary,
  record: LiveSeriesRecord | null,
  own: GameRecord,
): string | null {
  const entry = record?.games.find((x) => x.game_id === g.game_id)?.result ?? own?.result ?? null;
  if (!entry || entry.status !== "official" || !entry.winner_team_id) return null;
  // Name the winner by the feed's own team identity for this game.
  for (const t of [g.teams.blue, g.teams.red]) {
    if (t?.esports_team_id && t.esports_team_id === entry.winner_team_id) return teamIdentity(t);
  }
  return null;
}

/**
 * Group feed games into series, in rail order: series with a live game first
 * (in the feed's live order), then the rest by their most recent game.
 *
 * `records` maps game id → that game's `/games/{id}` result and series record
 * (in practice each series' last game, which the hub loads anyway). Missing
 * entries leave the results the feed alone cannot confirm unknown.
 */
export function groupSeries(
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
  records: Record<string, GameRecord> = {},
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

    const record = seriesRecord(key, games, records);
    const seriesGames: SeriesGame[] = games.map((g, i) => {
      let winner = officialWinner(g, record, records[g.game_id]);
      if (!winner && !record && g.availability === "finished") {
        // No backend record: the feed's own entering scores, checked.
        const next = games[i + 1];
        const before = entering(g);
        const after = next && next.game_number === (g.game_number ?? 0) + 1 ? entering(next) : null;
        if (before && after && [...before.keys()].every((id) => after.has(id))) {
          const risers = [...before].filter(([id, w]) => after.get(id) === w + 1);
          const still = [...before].filter(([id, w]) => after.get(id) === w);
          if (risers.length === 1 && still.length === 1) winner = risers[0][0];
        }
      }
      return { game: g, live: liveIds.has(g.game_id), winner };
    });

    const lastResult = seriesGames[seriesGames.length - 1];
    const aKey = aTeam?.esports_team_id ?? null;
    const bKey = bTeam?.esports_team_id ?? null;
    const finalWins =
      record?.score.basis === "upstream_final" && record.state === "completed"
        ? new Map(record.teams.map((t) => [t.esports_team_id, t.wins]))
        : null;
    let a: number;
    let b: number;
    let known = true;
    let final = false;
    if (finalWins && aKey && bKey && finalWins.get(aKey) != null && finalWins.get(bKey) != null) {
      // Riot's completed series score, as published.
      a = finalWins.get(aKey)!;
      b = finalWins.get(bKey)!;
      final = true;
    } else {
      // Wins entering the last played game, plus that game's confirmed
      // result. Falls back to counting confirmed winners when the feed
      // published no running score.
      const lastEntry = entering(last);
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
    }

    const bestOf = focus.best_of ?? null;
    const needed = bestOf ? Math.floor(bestOf / 2) + 1 : 1;
    const decided = final || (known && Math.max(a, b) >= needed);
    out.push({
      key,
      games: seriesGames,
      focus,
      bestOf,
      a: { team: aTeam, id: aId },
      b: { team: bTeam, id: bId },
      score: { a, b, known, final },
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
