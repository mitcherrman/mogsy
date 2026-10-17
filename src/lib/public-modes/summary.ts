/**
 * MC-UX2 — the player's OWN bonus-game history, as More Challenges reads it.
 *
 * `GET /api/game-modes/me/summary` (backend `public_game_modes.history`) is the
 * one authority. It summarises three records the backend already keeps — the
 * finished Ranked-backed bonus matches, the player's completed Daily stages,
 * and (from MC-UX2 on) each locked bonus-session round — and every figure is
 * read by the caller's own id. Nothing here derives a number the server did
 * not send; the formatters only choose words for it.
 *
 * A READ, so no identity is ever minted for it (USERS1): a browser with no
 * session simply has no record yet, which is what the page says.
 */
import { useQuery } from "@tanstack/react-query";
import { getExistingBackendAuthToken } from "@/lib/backend-auth";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";
import { isPublicModeId, PUBLIC_MODE_IDS, type PublicModeId } from "./contracts";

export const PLAYER_SUMMARY_CONTRACT = "public_game_modes.player_summary.v1";
export const PLAYER_SUMMARY_PATH = "/api/game-modes/me/summary";

export type ModeHistoryKind = "boards" | "daily_stage" | "exact" | "solved" | "timing" | "estimate";
const KINDS: readonly ModeHistoryKind[] = ["boards", "daily_stage", "exact", "solved", "timing", "estimate"];

export interface ModeHistory {
  modeId: PublicModeId;
  kind: ModeHistoryKind;
  /** Finished games: matches, Daily stages, or session runs with a lock. */
  played: number;
  lastPlayedAt: string | null;
  /** Board games: boards right in the best / last match. */
  bestBoards: { correct: number; total: number } | null;
  lastOutcome: "win" | "loss" | "draw" | null;
  wins: number | null;
  /** Daily stages: correct answers in the best / last stage. */
  bestCorrect: number | null;
  lastCorrect: number | null;
  /** Rangefinder (exact) / Glyph Press (solved): the best run. */
  bestHits: { hits: number; of: number } | null;
  /** Perfect Timing: the best run's points, and the closest single stop. */
  bestPoints: { points: number; of: number } | null;
  closestMs: number | null;
  /** Session games: rounds locked overall. */
  roundsLocked: number | null;
  /** Estimates (ungraded): the closest and the average error, in `unit`. */
  estimateUnit: "damage" | "relative" | null;
  bestError: number | null;
  meanError: number | null;
}

export interface PlayerSummary {
  gamesPlayed: number;
  favoriteModeId: PublicModeId | null;
  lastPlayed: { modeId: PublicModeId; at: string } | null;
  gamesThisWeek: number;
  activeDaysThisWeek: number;
  streakDays: number;
  modes: Partial<Record<PublicModeId, ModeHistory>>;
}

export class PlayerSummaryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerSummaryParseError";
  }
}

type Raw = Record<string, unknown>;
const fail = (m: string): never => { throw new PlayerSummaryParseError(m); };
const obj = (v: unknown, what: string): Raw =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : fail(`${what}: expected an object`);
const count = (v: unknown, what: string): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fail(`${what}: expected a count`);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optObj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function readMode(id: PublicModeId, value: unknown): ModeHistory {
  const raw = obj(value, `modes.${id}`);
  const kind = raw.kind;
  if (!KINDS.includes(kind as ModeHistoryKind)) fail(`modes.${id}.kind: unknown kind`);
  const best = optObj(raw.best);
  const last = optObj(raw.last);
  const k = kind as ModeHistoryKind;
  const boards = (o: Raw | null) => {
    const c = num(o?.correct);
    const t = num(o?.total);
    return c !== null && t !== null && t > 0 ? { correct: c, total: t } : null;
  };
  const hits = (o: Raw | null) => {
    const h = num(o?.hits);
    const of = num(o?.of);
    return h !== null && of !== null && of > 0 ? { hits: h, of } : null;
  };
  const unit = raw.unit === "damage" || raw.unit === "relative" ? raw.unit : null;
  const errField = unit === "damage" ? "abs_error" : "relative_error";
  const outcome = last?.outcome;
  return {
    modeId: id,
    kind: k,
    played: count(raw.played, `modes.${id}.played`),
    lastPlayedAt: str(raw.last_played_at),
    bestBoards: k === "boards" ? boards(best) : null,
    lastOutcome: k === "boards" && (outcome === "win" || outcome === "loss" || outcome === "draw") ? outcome : null,
    wins: k === "boards" ? num(raw.wins) : null,
    bestCorrect: k === "daily_stage" ? num(best?.correct) : null,
    lastCorrect: k === "daily_stage" ? num(last?.correct) : null,
    bestHits: k === "exact" || k === "solved" ? hits(best) : null,
    bestPoints: k === "timing" && num(best?.points) !== null && num(best?.of)
      ? { points: num(best?.points)!, of: num(best?.of)! } : null,
    closestMs: k === "timing" ? num(optObj(raw.closest)?.abs_error_ms) : null,
    roundsLocked: num(raw.rounds_locked),
    estimateUnit: k === "estimate" ? unit : null,
    bestError: k === "estimate" ? num(best?.[errField]) : null,
    meanError: k === "estimate" ? num(optObj(raw.mean)?.[errField]) : null,
  };
}

export function readPlayerSummary(json: unknown): PlayerSummary {
  const raw = obj(json, "summary");
  if (raw.contract !== PLAYER_SUMMARY_CONTRACT) fail("summary.contract: unsupported contract");
  const overall = obj(raw.overall, "overall");
  const modesRaw = obj(raw.modes, "modes");
  const modes: Partial<Record<PublicModeId, ModeHistory>> = {};
  for (const id of PUBLIC_MODE_IDS) {
    if (modesRaw[id] !== undefined) modes[id] = readMode(id, modesRaw[id]);
  }
  const fav = overall.favorite_mode_id;
  const last = optObj(overall.last_played);
  const lastId = last?.mode_id;
  return {
    gamesPlayed: count(overall.games_played, "overall.games_played"),
    favoriteModeId: isPublicModeId(fav) ? fav : null,
    lastPlayed: isPublicModeId(lastId) && str(last?.at) ? { modeId: lastId, at: str(last?.at)! } : null,
    gamesThisWeek: count(overall.games_this_week, "overall.games_this_week"),
    activeDaysThisWeek: count(overall.active_days_this_week, "overall.active_days_this_week"),
    streakDays: count(overall.streak_days, "overall.streak_days"),
    modes,
  };
}

export class PlayerSummaryError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PlayerSummaryError";
  }
}

/** The caller's summary, or null when this browser has no session (no record). */
export async function fetchPlayerSummary(signal?: AbortSignal): Promise<PlayerSummary | null> {
  const token = await getExistingBackendAuthToken();
  if (!token) return null;
  let response: Response;
  try {
    response = await fetch(RANKED_API_BASE + PLAYER_SUMMARY_PATH, {
      method: "GET", signal, headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new PlayerSummaryError(0, "could not reach your stats");
  }
  // A session the backend does not accept reads as "no record", never an error wall.
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new PlayerSummaryError(response.status, `request failed (${response.status})`);
  return readPlayerSummary(await response.json());
}

export const PLAYER_SUMMARY_QUERY_KEY = ["public-game-modes", "me", "summary"] as const;

export function usePlayerSummary() {
  return useQuery<PlayerSummary | null>({
    queryKey: PLAYER_SUMMARY_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlayerSummary(signal),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// ── words ────────────────────────────────────────────────────────────────────

/** "today", "yesterday", "3 days ago", or a short date. */
export function relativeDay(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * A card's history line: at most three short parts — how much, the best, and
 * when. Empty history says so plainly; nothing is estimated or padded.
 */
export function modeHistoryParts(h: ModeHistory | undefined, now: Date = new Date()): string[] {
  if (!h || h.played === 0) return [];
  const parts: string[] = [];
  switch (h.kind) {
    case "boards":
      parts.push(`Played ${h.played}`);
      if (h.bestBoards) parts.push(`Best ${h.bestBoards.correct}/${h.bestBoards.total} boards`);
      break;
    case "daily_stage":
      parts.push(`Played ${h.played}`);
      if (h.bestCorrect !== null) parts.push(`Best ${h.bestCorrect} correct`);
      break;
    case "exact":
      parts.push(plural(h.played, "run"));
      if (h.bestHits) parts.push(`Best ${h.bestHits.hits}/${h.bestHits.of} exact`);
      break;
    case "solved":
      parts.push(plural(h.played, "run"));
      if (h.bestHits) parts.push(`Best ${h.bestHits.hits}/${h.bestHits.of} solved`);
      break;
    case "timing":
      parts.push(plural(h.played, "run"));
      if (h.closestMs !== null) parts.push(`Closest ${(h.closestMs / 1000).toFixed(2)}s off`);
      else if (h.bestPoints) parts.push(`Best ${h.bestPoints.points}/${h.bestPoints.of} pts`);
      break;
    case "estimate":
      if (h.estimateUnit === "damage") {
        parts.push(plural(h.roundsLocked ?? 0, "hit"));
        if (h.meanError !== null) parts.push(`Avg ${Math.round(h.meanError)} damage off`);
      } else {
        parts.push(plural(h.roundsLocked ?? 0, "stat"));
        if (h.meanError !== null) parts.push(`Avg ${pct(h.meanError)} off`);
      }
      break;
  }
  const when = relativeDay(h.lastPlayedAt, now);
  if (when) parts.push(`Last ${when}`);
  return parts;
}
