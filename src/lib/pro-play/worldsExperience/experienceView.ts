// ---------------------------------------------------------------------------
// Pure derivations for the Worlds experience screens (UX1).
//
// Same rule as `tournamentV2View.ts`, which this builds on: the backend
// (PW4-A) derives every fact. What is computed here is arithmetic over the
// served STRUCTURE — how many teams a stage holds (from upstream's cells and
// rounds), how many go on (the next stage's size less its direct entrants),
// and the Swiss record pools that a 3-win / 3-loss format with 16 teams must
// produce — never a result, a ranking, a pairing or a prediction. The Swiss
// pool map is only drawn when that arithmetic reproduces upstream's own round
// sizes, so a format change upstream makes the map step aside rather than lie.
// ---------------------------------------------------------------------------

import type {
  TournamentContextV2,
  TournamentMatchV2,
  TournamentStageV2,
  TournamentStateV2,
} from "@/lib/pro-play/tournamentApi";
import { defaultScheduleStage, routesFrom, stageMatches, swissRounds } from "@/lib/pro-play/tournamentV2View";

type Ctx = Pick<TournamentContextV2, "stages" | "participants">;
type State = Pick<TournamentStateV2, "phase" | "phase_detail" | "matches" | "swiss" | "play_in" | "knockout">;

/* ── which stage, which match ───────────────────────────────────────────── */

/** The stage a reader lands on in the Stage Explorer: the one in play or next. */
export function defaultStageKey(state: Pick<TournamentStateV2, "phase" | "phase_detail">, ctx: Pick<TournamentContextV2, "stages">): string | null {
  const keys = ctx.stages.map((s) => s.key);
  if (state.phase === "complete") return keys.includes("knockout") ? "knockout" : (keys[keys.length - 1] ?? null);
  const pick = defaultScheduleStage(state, ctx);
  return keys.includes(pick) ? pick : (keys[0] ?? null);
}

export type OverviewFocus =
  | { kind: "champion" }
  | { kind: "live"; matches: TournamentMatchV2[] }
  | { kind: "transition" }
  | { kind: "next"; match: TournamentMatchV2 }
  | { kind: "unavailable" }
  | { kind: "none" };

/** What leads the Overview: the champion, live play, a stage changeover, the next match. */
export function overviewFocus(state: Pick<TournamentStateV2, "phase" | "phase_detail" | "matches" | "next_match_id">): OverviewFocus {
  if (state.phase === "complete") return { kind: "champion" };
  if (state.phase === "unknown") return { kind: "unavailable" };
  const live = byStart(state.matches.filter((m) => m.state === "live"));
  if (live.length) return { kind: "live", matches: live };
  if (state.phase === "between_stages" && state.phase_detail) return { kind: "transition" };
  const next = state.matches.find((m) => m.match_id === state.next_match_id);
  if (next) return { kind: "next", match: next };
  return { kind: "none" };
}

const startOf = (m: Pick<TournamentMatchV2, "scheduled_start">) => {
  const t = Date.parse(m.scheduled_start);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

export const byStart = <T extends Pick<TournamentMatchV2, "scheduled_start">>(ms: readonly T[]) => [...ms].sort((a, b) => startOf(a) - startOf(b));

/** Matches still to play, soonest first (live ones excluded: they lead elsewhere). */
export function upcoming(state: Pick<TournamentStateV2, "matches">, limit: number, exclude: readonly string[] = []) {
  return byStart(state.matches.filter((m) => m.state === "upcoming" && !exclude.includes(m.match_id))).slice(0, limit);
}

/** Completed matches, most recent first. */
export function recentResults(state: Pick<TournamentStateV2, "matches">, limit: number) {
  return byStart(state.matches.filter((m) => m.state === "completed")).reverse().slice(0, limit);
}

/* ── countdown ──────────────────────────────────────────────────────────── */

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  started: boolean;
}

export function countdownParts(startIso: string, now: number): CountdownParts | null {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  const s = Math.floor((t - now) / 1000);
  if (s <= 0) return { days: 0, hours: 0, minutes: 0, started: true };
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    // Rounded up, so "0 min" never shows while the match is still ahead.
    minutes: Math.min(59, Math.ceil((s % 3600) / 60)),
    started: false,
  };
}

/* ── stage size and stakes ──────────────────────────────────────────────── */

/**
 * How many teams a stage holds: two per match of its opening cell (bracket
 * stages) or of Round 1 (Swiss), from upstream standings; without standings,
 * the registry's entrants for the stage. Null when neither says.
 */
export function stageTeams(stage: TournamentStageV2, state: Pick<TournamentStateV2, "matches" | "swiss" | "play_in" | "knockout">, ctx: Pick<TournamentContextV2, "participants" | "stages">): number | null {
  if (stage.bracket === "swiss") {
    const r1 = state.swiss.rounds["1"]?.length;
    if (r1) return r1 * 2;
  } else {
    const summary = stage.key === "play_in" ? state.play_in : stage.key === "knockout" ? state.knockout : null;
    const matches = stageMatches(state, stage.key, summary);
    const first = matches[0]?.bracket?.cell;
    if (first) return matches.filter((m) => m.bracket?.cell === first).length * 2;
  }
  // The registry's entrants are a stage's whole field only for the opening
  // stage: a later one is also filled from the stage before it (Swiss holds
  // 15 direct entrants AND the Play-In winner), so it gets no size here.
  if (ctx.stages[0]?.key !== stage.key) return null;
  const entrants = ctx.participants.filter((p) => p.entry_stage === stage.key).length;
  return entrants || null;
}

export interface StageStakes {
  teams: number | null;
  /** Teams that go on to the next stage; for the last stage, its single winner. */
  advance: number | null;
  eliminated: number | null;
  /** The next stage's name, or null for the last stage. */
  nextStage: TournamentStageV2 | null;
  formats: string;
}

/**
 * What a stage decides, from the served structure: its size, and how many of
 * it go on — the next stage's size less the teams entered straight into it
 * (Play-In: 16 Swiss places − 15 direct = 1). The last stage produces one
 * winner. Null wherever a size is not served.
 */
export function stageStakes(stage: TournamentStageV2, state: State, ctx: Ctx): StageStakes {
  const i = ctx.stages.findIndex((s) => s.key === stage.key);
  const next = i >= 0 ? (ctx.stages[i + 1] ?? null) : null;
  const teams = stageTeams(stage, state, ctx);
  let advance: number | null = null;
  if (next) {
    const nextTeams = stageTeams(next, state, ctx);
    const direct = ctx.participants.filter((p) => p.entry_stage === next.key).length;
    // The next stage's entrants from the registry are not the size of a
    // stage nobody enters directly: that answer comes from its cells.
    if (nextTeams && nextTeams > direct) advance = nextTeams - direct;
  } else if (teams) {
    advance = 1;
  }
  const summary = stage.key === "play_in" ? state.play_in : stage.key === "knockout" ? state.knockout : null;
  const matches = stageMatches(state, stage.key, summary);
  const bo = [...new Set(matches.map((m) => m.best_of).filter((n): n is number => typeof n === "number"))].sort((a, b) => a - b);
  return {
    teams,
    advance,
    eliminated: teams && advance !== null && teams > advance ? teams - advance : null,
    nextStage: next,
    formats: bo.map((n) => `Bo${n}`).join(" / "),
  };
}

/* ── one match's stakes ─────────────────────────────────────────────────── */

export type Onward =
  | { kind: "route"; to: TournamentMatchV2 }
  | { kind: "advances"; stage: TournamentStageV2 }
  | { kind: "champion" }
  | { kind: "eliminated" };

/**
 * Where a match sends its winner and its loser. Routes are upstream's own
 * slot edges (read from the other end). Where a side has no route, the
 * bracket's own rules finish the sentence: in a single-elimination stage, or
 * a double-elimination one whose winner alone goes on, a loser with nowhere
 * to go is out, and the winner of the last match goes on to the next stage
 * (or is the champion). Only with standings authority; otherwise null.
 */
export function matchOnward(match: TournamentMatchV2, state: State, ctx: Ctx): { winner: Onward | null; loser: Onward | null } | null {
  const stage = ctx.stages.find((s) => s.key === match.stage);
  if (!stage) return null;
  const summary = stage.key === "play_in" ? state.play_in : stage.key === "knockout" ? state.knockout : null;
  if (!summary || summary.bracket_authority !== "standings") return null;
  if (stage.bracket !== "double_elimination" && stage.bracket !== "single_elimination") return null;
  const routes = routesFrom(match.match_id, state.matches);
  const win = routes.find((r) => r.kind === "winner");
  const lose = routes.find((r) => r.kind === "loser");
  const stakes = stageStakes(stage, state, ctx);
  const singleWinner = stakes.advance === 1;
  let winner: Onward | null = win ? { kind: "route", to: win.to } : null;
  if (!winner && singleWinner) winner = stakes.nextStage ? { kind: "advances", stage: stakes.nextStage } : { kind: "champion" };
  let loser: Onward | null = lose ? { kind: "route", to: lose.to } : null;
  if (!loser && (stage.bracket === "single_elimination" || singleWinner)) loser = { kind: "eliminated" };
  return { winner, loser };
}

/**
 * A Swiss match still to finish, between two teams the backend lists on the
 * same active record: what the result does to each record. Thresholds are the
 * stage's served wins-to-advance / losses-to-eliminate. Null otherwise
 * (unplaced sides, no records, a completed match, records that differ).
 */
export function swissMatchStakes(match: TournamentMatchV2, state: Pick<TournamentStateV2, "swiss">) {
  if (match.stage !== "swiss" || match.state === "completed") return null;
  const W = state.swiss.wins_to_advance;
  const L = state.swiss.losses_to_eliminate;
  if (!W || !L) return null;
  const recs = match.teams.map((t) => state.swiss.records.find((r) => r.code === t.code && !t.tbd));
  const [a, b] = recs;
  if (!a || !b || a.status !== "active" || b.status !== "active" || a.wins !== b.wins || a.losses !== b.losses) return null;
  return {
    record: `${a.wins}–${a.losses}`,
    winner: a.wins + 1 >= W ? ("advances" as const) : `${a.wins + 1}–${a.losses}`,
    loser: a.losses + 1 >= L ? ("eliminated" as const) : `${a.wins}–${a.losses + 1}`,
  };
}

/* ── Swiss pool map ─────────────────────────────────────────────────────── */

export interface SwissPool {
  wins: number;
  losses: number;
  /** Teams the format puts on this record before the round is played. */
  teams: number;
}

export interface SwissPoolRound {
  round: number;
  pools: SwissPool[];
}

export interface SwissOutcome {
  wins: number;
  losses: number;
  teams: number;
  result: "advanced" | "eliminated";
}

export interface SwissPoolMap {
  rounds: SwissPoolRound[];
  advanced: SwissOutcome[];
  eliminated: SwissOutcome[];
  /** Every pool edge: a win moves up, a loss moves down. */
  edges: { from: string; to: string; kind: "win" | "loss" }[];
}

export const poolId = (w: number, l: number) => `${w}-${l}`;
export const outcomeId = (w: number, l: number) => `out-${w}-${l}`;

/**
 * The record pools a Swiss format must produce: `teams` start at 0–0, each
 * round halves every pool into a win and a loss, and a pool reaching the win
 * or loss threshold leaves. Null when the format is not served, a pool would
 * hold an odd number of teams, or the pools' match counts do not reproduce
 * upstream's own round sizes (the map would then be a guess).
 */
export function swissPoolMap(state: Pick<TournamentStateV2, "swiss" | "matches">, teams: number | null, winsToAdvance: number | null | undefined, lossesToEliminate: number | null | undefined): SwissPoolMap | null {
  const W = winsToAdvance ?? state.swiss.wins_to_advance;
  const L = lossesToEliminate ?? state.swiss.losses_to_eliminate;
  if (!teams || !W || !L) return null;
  let current = new Map<string, number>([[poolId(0, 0), teams]]);
  const rounds: SwissPoolRound[] = [];
  const advanced = new Map<string, number>();
  const eliminated = new Map<string, number>();
  const edges: SwissPoolMap["edges"] = [];
  for (let r = 1; current.size > 0 && r <= W + L; r++) {
    const pools: SwissPool[] = [];
    const next = new Map<string, number>();
    for (const [id, n] of current) {
      if (n % 2 !== 0) return null;
      const [w, l] = id.split("-").map(Number);
      pools.push({ wins: w, losses: l, teams: n });
      const up: [number, number] = [w + 1, l];
      const down: [number, number] = [w, l + 1];
      for (const [[nw, nl], kind] of [[up, "win"], [down, "loss"]] as const) {
        if (nw >= W) {
          advanced.set(outcomeId(nw, nl), (advanced.get(outcomeId(nw, nl)) ?? 0) + n / 2);
          edges.push({ from: id, to: outcomeId(nw, nl), kind });
        } else if (nl >= L) {
          eliminated.set(outcomeId(nw, nl), (eliminated.get(outcomeId(nw, nl)) ?? 0) + n / 2);
          edges.push({ from: id, to: outcomeId(nw, nl), kind });
        } else {
          next.set(poolId(nw, nl), (next.get(poolId(nw, nl)) ?? 0) + n / 2);
          edges.push({ from: id, to: poolId(nw, nl), kind });
        }
      }
    }
    pools.sort((a, b) => b.wins - a.wins);
    rounds.push({ round: r, pools });
    current = next;
  }
  // Cross-check against upstream: each round's match count must be its pools' half-sizes.
  const upstream = swissRounds(state);
  if (upstream.length) {
    if (upstream.length !== rounds.length) return null;
    for (const u of upstream) {
      const mine = rounds.find((x) => x.round === u.round);
      if (!mine || mine.pools.reduce((s, p) => s + p.teams / 2, 0) !== u.matches.length) return null;
    }
  }
  const outcomes = (m: Map<string, number>, result: SwissOutcome["result"]) =>
    [...m.entries()]
      .map(([id, n]) => {
        const [, w, l] = id.split("-").map(Number);
        return { wins: w, losses: l, teams: n, result };
      })
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  return { rounds, advanced: outcomes(advanced, "advanced"), eliminated: outcomes(eliminated, "eliminated"), edges };
}

/**
 * Who sits where right now, only from the backend's records: an active team
 * on its pool, an advanced or eliminated team on its outcome. Nothing before
 * the first result (there is no 0–0 table).
 */
export function swissOccupancy(state: Pick<TournamentStateV2, "swiss">) {
  const out = new Map<string, string[]>();
  for (const r of state.swiss.records) {
    const id = r.status === "active" ? poolId(r.wins, r.losses) : outcomeId(r.wins, r.losses);
    out.set(id, [...(out.get(id) ?? []), r.code]);
  }
  return out;
}
