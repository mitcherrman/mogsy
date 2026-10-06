/**
 * What the Match Center may say about ONE game (PP-IA2) — pure, so every rule
 * is tested without a page.
 *
 * THREE THINGS THE FEED DOES NOT PUBLISH, AND THEREFORE NEVER APPEAR AS FACT:
 *
 * 1. **A game clock.** Livestats frames carry a wall-clock timestamp and a
 *    state, never the in-game time. The span between the first and last
 *    stored frame includes pre-game frames, pauses and missed capture (LCS
 *    final: G4 spans 35:20 for a 27:02 game; G1 spans 26:20 for a 35:10 one,
 *    because capture began mid-game). No duration is shown; the gold chart's
 *    axis is labelled as feed time.
 * 2. **A winner.** Only Riot's series record names one (`result`, backend
 *    `live_esports/results.py`). An `unconfirmed` game crowns nobody — the
 *    inhibitor/tower lead is not a result.
 * 3. **The series score at a game.** `series_wins` on a game is the score
 *    ENTERING it. The series score shown is the record's: the completed
 *    final when Riot published one, otherwise the confirmed count, marked
 *    when it may be short.
 */
import type {
  LiveGameDetailResponse,
  LiveGameSummary,
  LiveRunes,
  LiveSeriesRecord,
} from "@/lib/live-esports/api";
import { RUNE_PERKS, RUNE_SHARDS, RUNE_TREES, type RunePerk, type RuneTree } from "./runeData";

type Side = "blue" | "red";

/* ── result ─────────────────────────────────────────────────────────────── */

export type GameResultView =
  /** Riot's record names the winner, on a side the board can mark. */
  | { kind: "official"; side: Side; teamId: string }
  /** Riot's record names the winner, but the game's sides could not be
   *  verified (the game named a different pair than the schedule), so no side
   *  is marked — the team is named instead. */
  | { kind: "official_unsided"; side: null; teamId: string }
  /** Finished, but nothing confirms who won. */
  | { kind: "unconfirmed" }
  /** Still going (or never finished). */
  | { kind: "in_progress" }
  /** No PP-IA2 result in the payload at all (older backend, not loaded). */
  | { kind: "unknown" };

export function gameResultView(
  detail: Pick<LiveGameDetailResponse, "result"> | null | undefined,
): GameResultView {
  const r = detail?.result;
  if (!r) return { kind: "unknown" };
  if (r.status === "official" && r.winner_team_id) {
    return r.winner_side
      ? { kind: "official", side: r.winner_side, teamId: r.winner_team_id }
      : { kind: "official_unsided", side: null, teamId: r.winner_team_id };
  }
  if (r.status === "in_progress") return { kind: "in_progress" };
  return { kind: "unconfirmed" };
}

/**
 * True when the backend could not verify which team played which side: the
 * game named a different pair of teams than the schedule, and nothing was
 * swapped. The board then says so instead of implying its labels are right.
 */
export function sidesUnverified(game: Pick<LiveGameSummary, "sides"> | null | undefined): boolean {
  return game?.sides?.verified === false;
}

/** True only for a side Riot's record names as the winner. */
export function isOfficialWinner(view: GameResultView, side: Side): boolean {
  return view.kind === "official" && view.side === side;
}

/* ── series score ───────────────────────────────────────────────────────── */

export type SeriesScoreView = {
  /** Ordered as the game draws its teams: blue's team first. */
  teams: { code: string; wins: number }[];
  /** Riot's completed series score. */
  final: boolean;
  /** False when some finished game is unconfirmed, so the count may be short. */
  complete: boolean;
};

export function seriesScoreView(
  series: LiveSeriesRecord | null | undefined,
  game: LiveGameSummary | null | undefined,
): SeriesScoreView | null {
  if (!series || !game || series.teams.length !== 2) return null;
  const order = [game.teams.blue?.esports_team_id, game.teams.red?.esports_team_id];
  const teams = order.map((id) => series.teams.find((t) => t.esports_team_id === id));
  if (teams.some((t) => !t || t.wins == null)) return null;
  const final = series.state === "completed" && series.score.basis === "upstream_final";
  return {
    teams: teams.map((t) => ({ code: t!.code || t!.name || "TBD", wins: t!.wins! })),
    final,
    complete: final || series.score.complete,
  };
}

/** "Final · TLAW 3–1 LYON" / "Series · TLAW 2–1 LYON" — the event band's
 *  series line. The prefix says which kind of score it is. */
export function seriesScoreText(view: SeriesScoreView): string {
  const [a, b] = view.teams;
  return `${view.final ? "Final" : "Series"} · ${a.code} ${a.wins}–${b.wins} ${b.code}`;
}

/** The team code for a team id, from the series record. */
export function seriesTeamCode(series: LiveSeriesRecord | null | undefined, teamId: string): string | null {
  const t = series?.teams.find((x) => x.esports_team_id === teamId);
  return t ? t.code || t.name : null;
}

/* ── runes ──────────────────────────────────────────────────────────────── */

export type RuneSummary = {
  keystone: RunePerk | null;
  primary: RuneTree | null;
  secondary: RuneTree | null;
  /** The non-keystone runes, in page order. */
  minors: RunePerk[];
  shards: string[];
};

/**
 * The rune page the feed published, or null when it published none. Ids the
 * table does not know are dropped, never renamed; a page with nothing
 * recognisable is null rather than an empty block that reads "no runes".
 */
export function runeSummary(raw: unknown): RuneSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<LiveRunes>;
  const perks = Array.isArray(r.perks) ? r.perks.filter((x): x is number => typeof x === "number") : [];
  const known = perks.map((id) => RUNE_PERKS[id]).filter((p): p is RunePerk => !!p);
  const keystone = known.find((p) => p.keystone) ?? null;
  const primary = (r.style_id != null && RUNE_TREES[r.style_id]) || null;
  const secondary = (r.sub_style_id != null && RUNE_TREES[r.sub_style_id]) || null;
  const minors = known.filter((p) => !p.keystone);
  const shards = perks.map((id) => RUNE_SHARDS[id]).filter((s): s is string => !!s);
  if (!keystone && !primary && !secondary && !minors.length) return null;
  return { keystone, primary, secondary, minors, shards };
}

/** "Grasp of the Undying · Resolve / Sorcery" */
export function runeLine(s: RuneSummary): string {
  const trees = [s.primary?.name, s.secondary?.name].filter(Boolean).join(" / ");
  return [s.keystone?.name, trees].filter(Boolean).join(" · ");
}
