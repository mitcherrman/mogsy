/**
 * GRAPH1 champion-pair mode — the pro sample for one champion matchup.
 *
 * THE TWO SURFACES ANSWER TWO QUESTIONS, AND THIS ONE IS THE BROADER ONE.
 * The Matchup Explorer answers *"what happened when Doran's Olaf faced Kiin's
 * K'Sante"*. This answers *"what does Olaf vs K'Sante look like across
 * professional play"*. Nothing here carries a player or a team, and nothing
 * here may be read as the player-specific record — they are different
 * populations over different denominators.
 *
 * WHY A MODE AND NOT A SECOND `e=`. Every other graph on this page is
 * `<family>:<one entity>` rendered as a race or a ranked board. A pair is two
 * entities, and the useful answer is a summary rather than a ranking, so it
 * is an explicit `focus=matchup` state with two named parameters. `focus=` is
 * still the one thing that says what kind of graph this is; a reader (and a
 * hand-edited URL) can see at a glance that this is a two-entity state.
 *
 * ORIENTATION. `a` is the SUBJECT — the record, the position split and the
 * side split are its own. `b` is the opponent. Swapping them reads the
 * identical set of games and returns the inverse record. Alphabetical order
 * never decides which is which.
 */
import { scopeQuery, writeScope, type Graph1Scope } from "./scope";

/** The `focus` value that puts this page in pair mode. */
export const MATCHUP_FOCUS = "matchup";

/** URL parameter names. Deliberately NOT `e=`, which means one entity. */
export const MATCHUP_PARAM = { subject: "a", opponent: "b" } as const;

/** Longest slug the page will carry. The real maximum is `aurelion-sol` (12);
 *  this is generous and still keeps a hand-edited URL out of a cache key. */
export const MAX_SLUG_LENGTH = 40;

export interface Graph1ChampionRef {
  id: string;
  name: string;
  media?: unknown;
}

export interface Graph1MatchupSplit {
  games: number;
  wins: number;
}

export interface Graph1ChampionMatchup {
  schemaVersion: number;
  id: string;
  /** Order-free identity of the SAMPLE. Both orientations share it. */
  pairId: string;
  subject: Graph1ChampionRef;
  opponent: Graph1ChampionRef;
  scope: { id: string; label: string; [key: string]: unknown };
  games: number;
  /** Always the subject's. */
  record: { wins: number; losses: number; winRate: number | null };
  byYear: { year: string; games: number; wins: number }[];
  subjectPositions: Record<string, Graph1MatchupSplit>;
  opponentPositions: Record<string, Graph1MatchupSplit>;
  subjectSides: Record<string, Graph1MatchupSplit>;
  firstGame: Graph1MatchupGameRef | null;
  latestGame: Graph1MatchupGameRef | null;
  coverage: {
    source: string;
    definition: string;
    excludedGameCount: number;
    warnings: string[];
    [key: string]: unknown;
  };
}

export interface Graph1MatchupGameRef {
  gameId: string;
  date: string;
  subjectWon: boolean;
  subjectTeam: string;
  opponentTeam: string;
  league?: string;
  tournament?: string;
  patch?: string;
  region?: string;
}

/**
 * The pair a URL asks for, and why it is or is not askable.
 *
 * Parsing is TOTAL: it never throws and never produces a half-state. The
 * three unaskable outcomes are named rather than collapsed into one, because
 * "you gave me one champion" and "you asked a champion about itself" are
 * different mistakes and deserve different words.
 */
export type Graph1PairState =
  | { status: "ready"; subject: string; opponent: string }
  | { status: "incomplete"; subject?: string; opponent?: string }
  | { status: "same-champion"; subject: string };

/** Lowercase, hyphenated, bounded. Anything else is not a slug. */
function readSlug(raw: string | null): string | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value.length > MAX_SLUG_LENGTH) return undefined;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined;
}

export function isMatchupFocus(params: URLSearchParams): boolean {
  return params.get("focus") === MATCHUP_FOCUS;
}

export function parseChampionPair(params: URLSearchParams): Graph1PairState {
  const subject = readSlug(params.get(MATCHUP_PARAM.subject));
  const opponent = readSlug(params.get(MATCHUP_PARAM.opponent));
  if (!subject || !opponent) return { status: "incomplete", subject, opponent };
  // A champion is not its own matchup, and the backend refuses it with a 400.
  // Saying so here means the reader is told rather than shown an error.
  if (subject === opponent) return { status: "same-champion", subject };
  return { status: "ready", subject, opponent };
}

export const PRO_PLAY_GRAPHS_PATH = "/lol/pro-play/graphs";

/**
 * A deep link into pair mode.
 *
 * This is the URL the Matchup Explorer's `Explore Pro Data` action produces,
 * and the URL the Swap control produces. It carries the two champions and
 * nothing else, unless a scope is supplied — no player, no team, no patch
 * inferred from the sample the reader came from.
 */
export function championMatchupHref(
  subject: string,
  opponent: string,
  scope?: Graph1Scope,
): string {
  const params = new URLSearchParams();
  params.set("focus", MATCHUP_FOCUS);
  params.set(MATCHUP_PARAM.subject, subject);
  params.set(MATCHUP_PARAM.opponent, opponent);
  if (scope) writeScope(params, scope);
  return `${PRO_PLAY_GRAPHS_PATH}?${params.toString()}`;
}

/** Request URL for one pair under one scope. */
export function championMatchupUrl(
  base: string,
  subject: string,
  opponent: string,
  scope?: Graph1Scope,
): string {
  const params = new URLSearchParams(scope ? scopeQuery(scope) : {});
  params.set(MATCHUP_PARAM.subject, subject);
  params.set(MATCHUP_PARAM.opponent, opponent);
  return `${base}/api/graph1/champion-matchup?${params.toString()}`;
}

/** `0.5426` -> `54.3%`. Null is not zero and never prints as one. */
export function matchupPct(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${(value * 100).toFixed(1)}%`;
}

/** "Olaf vs K'Sante" — subject first, always. */
export function matchupTitle(subject: string, opponent: string): string {
  return `${subject} vs ${opponent}`;
}
