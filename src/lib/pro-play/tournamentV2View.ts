// ---------------------------------------------------------------------------
// Pure presentation helpers for a v2 tournament page (Worlds 2026, PW4-B).
//
// Grouping, ordering and labelling only. The backend (PW4-A) derives every
// fact: which stage a match belongs to and which bracket cell it sits in
// (upstream standings), where each slot's team comes from (winner / loser of
// a named match, or a draw), records, Swiss status, eliminations, the
// Play-In winner and the champion. Nothing here counts a record, ranks a
// tiebreak, advances a team or reads a date as a result.
//
// The one structural reading done here is the INVERSE of the backend's slot
// edges ("this match's winner goes to the Upper Final"), which is the same
// fact read from the other end, and only drawn when standings back it.
// ---------------------------------------------------------------------------

import type {
  BracketSummary,
  SlotSource,
  SourceFreshness,
  TournamentContextV2,
  TournamentMatchTeamV2,
  TournamentMatchV2,
  TournamentParticipantV2,
  TournamentPhaseV2,
  TournamentResponseV2,
  TournamentStageV2,
  TournamentStateV2,
} from "@/lib/pro-play/tournamentApi";

/* ── phase ──────────────────────────────────────────────────────────────── */

export const PHASE_V2_LABEL: Record<TournamentPhaseV2, string> = {
  pre_event: "Know the field",
  play_in: "Play-In stage",
  swiss: "Swiss stage",
  knockout: "Knockout stage",
  between_stages: "Between stages",
  complete: "Complete",
  unknown: "Schedule unavailable",
};

export function stageOf(ctx: Pick<TournamentContextV2, "stages">, key: string | null | undefined) {
  return ctx.stages.find((s) => s.key === key) ?? null;
}

/** A stage's short name: "Play-In", "Swiss", "Knockout" (the registry writes
 *  "Play-In Stage"; the word "Stage" is dropped, nothing else). */
export function stageShortName(stage: Pick<TournamentStageV2, "name"> | null | undefined, fallback = "Stage") {
  if (!stage) return fallback;
  return stage.name.replace(/\s+stage$/i, "") || fallback;
}

/** The phase as a reader-facing label. Between stages it names the stage the
 *  backend certified complete ("Play-In complete"). */
export function phaseLabelV2(state: Pick<TournamentStateV2, "phase" | "phase_detail">, ctx: Pick<TournamentContextV2, "stages">) {
  if (state.phase === "between_stages" && state.phase_detail) {
    return `${stageShortName(stageOf(ctx, state.phase_detail.completed_stage))} complete`;
  }
  return PHASE_V2_LABEL[state.phase];
}

/* ── stage progress (header) ────────────────────────────────────────────── */

export type StageProgress = "current" | "complete" | "next" | null;

/**
 * How a stage tile is marked. Only what the backend's phase states: the
 * stage in play is "current"; between stages, the certified stage is
 * "complete" and the following one "next"; before the event the first stage
 * is "next"; a complete event marks every stage complete (`complete` is the
 * whole event certified). An earlier stage is otherwise left unmarked — the
 * phase does not certify it, so the page does not claim it.
 */
export function stageProgress(stage: TournamentStageV2, state: Pick<TournamentStateV2, "phase" | "phase_detail">, ctx: Pick<TournamentContextV2, "stages">): StageProgress {
  const { phase, phase_detail } = state;
  if (phase === "complete") return "complete";
  if (phase === "between_stages" && phase_detail) {
    if (stage.key === phase_detail.completed_stage) return "complete";
    if (stage.key === phase_detail.next_stage) return "next";
    return null;
  }
  if (phase === "pre_event") return ctx.stages[0]?.key === stage.key ? "next" : null;
  if (phase === stage.key) return "current";
  return null;
}

/* ── matches ────────────────────────────────────────────────────────────── */

export function matchesById(state: Pick<TournamentStateV2, "matches">) {
  return new Map(state.matches.map((m) => [m.match_id, m] as const));
}

/** A stage's matches, in the summary's standings order where it has one,
 *  then any other schedule rows of the stage in schedule order. */
export function stageMatches(state: Pick<TournamentStateV2, "matches">, key: string, summary?: Pick<BracketSummary, "match_ids"> | null) {
  const rows = state.matches.filter((m) => m.stage === key);
  if (!summary?.match_ids?.length) return rows;
  const rank = new Map(summary.match_ids.map((id, i) => [id, i] as const));
  return [...rows].sort((a, b) => (rank.get(a.match_id) ?? 1e9) - (rank.get(b.match_id) ?? 1e9));
}

const startOf = (m: Pick<TournamentMatchV2, "scheduled_start">) => {
  const t = Date.parse(m.scheduled_start);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

const SINGULAR: Record<string, string> = {
  quarterfinals: "Quarterfinal",
  semifinals: "Semifinal",
  finals: "Final",
};

function singular(word: string) {
  return SINGULAR[word.trim().toLowerCase()] ?? word.trim();
}

/**
 * Upstream's cell name as a match name: "Upper Bracket - Semifinals" →
 * "Upper Semifinal", "Lower Bracket - Finals" → "Lower Final", "Round 3" →
 * "Round 3", "Quarterfinals" → "Quarterfinal". A bare "Finals" inside a
 * stage that has other cells is that stage's final ("Play-In Final").
 */
export function cellMatchName(cell: string | null | undefined, stageName?: string | null): string | null {
  if (!cell) return null;
  const parts = cell.split(/\s+-\s+/);
  if (parts.length === 2) {
    const side = parts[0].replace(/\s*bracket\s*$/i, "").trim();
    return `${side} ${singular(parts[1])}`.trim();
  }
  const name = singular(cell);
  if (name === "Final" && stageName && !/knockout/i.test(stageName)) return `${stageName} Final`;
  return name;
}

/**
 * Every match's display name, numbered within its cell when the cell holds
 * more than one ("Upper Semifinal 1", "Quarterfinal 3"): by start time, then
 * standings order, so "1" is the one played first. Matches without a cell
 * are named by their schedule block.
 */
export function matchNames(state: Pick<TournamentStateV2, "matches" | "play_in" | "knockout" | "swiss">, ctx: Pick<TournamentContextV2, "stages">) {
  const names = new Map<string, string>();
  const order = [...state.play_in.match_ids, ...Object.values(state.swiss.rounds).flat(), ...state.knockout.match_ids];
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const sorted = [...state.matches].sort((a, b) => (rank.get(a.match_id) ?? 1e9) - (rank.get(b.match_id) ?? 1e9));
  const byCell = new Map<string, TournamentMatchV2[]>();
  for (const m of sorted) {
    const key = `${m.stage}|${m.bracket?.cell ?? m.block_name ?? ""}`;
    const list = byCell.get(key) ?? [];
    list.push(m);
    byCell.set(key, list);
  }
  for (const list of byCell.values()) {
    list.sort((a, b) => startOf(a) - startOf(b) || (rank.get(a.match_id) ?? 1e9) - (rank.get(b.match_id) ?? 1e9));
    for (const [i, m] of list.entries()) {
      const stage = stageOf(ctx, m.stage);
      // Without a standings cell, the stage's own name: "Play-In match 3".
      const base =
        cellMatchName(m.bracket?.cell, stageShortName(stage, "")) ?? (stage ? `${stageShortName(stage)} match` : (m.block_name ?? "Match"));
      // Swiss rounds hold many matches each; their number is not a name.
      const numbered = list.length > 1 && m.stage !== "swiss";
      // A cell-less, un-numbered match has no name beyond its stage.
      if (!m.bracket?.cell && !numbered) continue;
      names.set(m.match_id, numbered ? `${base} ${i + 1}` : base);
    }
  }
  return names;
}

const teamCode = (t: TournamentMatchTeamV2) => (t.tbd || !t.code ? null : t.code);

/** "C9 v KC" when both sides are named, else the match's name. */
export function matchRef(m: TournamentMatchV2 | undefined, names: Map<string, string>) {
  if (!m) return null;
  const [a, b] = m.teams.map(teamCode);
  if (a && b) return `${a} v ${b}`;
  return names.get(m.match_id) ?? null;
}

/**
 * What a TBD slot says about its team: "Winner of FUR v MVK", "Loser of
 * Upper Final", "Decided by draw". Null when standings say nothing (the slot
 * is then plain TBD) — a source is never guessed.
 */
export function slotLabel(slot: SlotSource | null | undefined, byId: Map<string, TournamentMatchV2>, names: Map<string, string>) {
  if (!slot) return null;
  if (slot.kind === "draw") return "Decided by draw";
  if ((slot.kind === "winner_of" || slot.kind === "loser_of") && slot.match_id) {
    const ref = matchRef(byId.get(slot.match_id), names);
    if (!ref) return null;
    return `${slot.kind === "winner_of" ? "Winner" : "Loser"} of ${ref}`;
  }
  return null;
}

export interface Route {
  kind: "winner" | "loser";
  to: TournamentMatchV2;
  /** Which of the target's two slots it fills. */
  slot: 0 | 1;
}

/** Where a match's winner and loser go, read from the slots that name it. */
export function routesFrom(matchId: string, matches: readonly TournamentMatchV2[]): Route[] {
  const out: Route[] = [];
  for (const m of matches) {
    m.teams.forEach((t, i) => {
      if (t.slot?.match_id !== matchId) return;
      if (t.slot.kind === "winner_of") out.push({ kind: "winner", to: m, slot: i as 0 | 1 });
      if (t.slot.kind === "loser_of") out.push({ kind: "loser", to: m, slot: i as 0 | 1 });
    });
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "winner" ? -1 : 1));
}

/** Winner edges inside one stage, for the bracket's connector lines. */
export function winnerEdges(matches: readonly TournamentMatchV2[]) {
  const ids = new Set(matches.map((m) => m.match_id));
  const edges: { from: string; to: string; slot: 0 | 1 }[] = [];
  for (const m of matches) {
    m.teams.forEach((t, i) => {
      if (t.slot?.kind === "winner_of" && t.slot.match_id && ids.has(t.slot.match_id)) {
        edges.push({ from: t.slot.match_id, to: m.match_id, slot: i as 0 | 1 });
      }
    });
  }
  return edges;
}

/* ── teams and captions ─────────────────────────────────────────────────── */

/** The registry entry for a match team, only when the backend kept its
 *  canonical key (a conflicting esports id leaves `team_key` null). */
function participantFor(team: TournamentMatchTeamV2, byCode: Map<string, TournamentParticipantV2>) {
  if (!team.code || !team.team_key) return null;
  const p = byCode.get(team.code);
  return p && p.team_key === team.team_key ? p : null;
}

export function teamName(team: TournamentMatchTeamV2, byCode: Map<string, TournamentParticipantV2>) {
  const p = participantFor(team, byCode);
  return p ? displayName(p) : (team.upstream_name ?? team.code ?? "TBD");
}

export type TeamOutcome = "win" | "loss" | null;

export function outcomeOf(match: TournamentMatchV2, team: TournamentMatchTeamV2): TeamOutcome {
  if (match.state !== "completed" || !match.winner_code || !team.code) return null;
  return team.code === match.winner_code ? "win" : "loss";
}

/** "Play-In · Upper Semifinal 1 · Bo5" — stage, match name and format. */
export function matchCaption(match: TournamentMatchV2, kit: { ctx: Pick<TournamentContextV2, "stages">; names: Map<string, string> }, withStage = true) {
  const stage = stageShortName(stageOf(kit.ctx, match.stage), match.block_name ?? "Match");
  const name = kit.names.get(match.match_id);
  const parts = withStage ? [stage] : [];
  if (name && name !== stage) parts.push(name);
  if (match.best_of) parts.push(`Bo${match.best_of}`);
  return parts.join(" · ");
}

/** Score text for a started match ("2–1"), or null before it starts. */
export function scoreV2(m: TournamentMatchV2): string | null {
  if (m.state === "upcoming") return null;
  return `${m.teams[0].game_wins}–${m.teams[1].game_wins}`;
}

export const bothTbd = (m: TournamentMatchV2) => m.teams.every((t) => t.tbd || !t.code);

/** Both sides still unnamed and neither fed by an earlier match: the pair is
 *  a draw still to be made (or standings say nothing about it). */
export const awaitingDraw = (m: TournamentMatchV2) =>
  bothTbd(m) && m.teams.every((t) => !t.slot || t.slot.kind === "draw" || t.slot.kind === "unknown");

/* ── bracket layouts ────────────────────────────────────────────────────── */

export interface BracketColumn {
  cell: string;
  matches: TournamentMatchV2[];
}

export interface DoubleElimLayout {
  rows: { key: "upper" | "lower"; label: string; columns: BracketColumn[] }[];
  final: BracketColumn | null;
}

/**
 * A double-elimination stage laid out from upstream's cell names: "Upper
 * Bracket - …" cells form the upper row, "Lower Bracket - …" the lower, and
 * a cell named neither is the stage final. Columns keep standings order. Any
 * match without a cell, or a second unnamed cell, means the cells are not
 * the shape this layout reads, and it returns null (the page then lists the
 * matches by cell instead of drawing a bracket it cannot vouch for).
 */
export function doubleElimLayout(matches: readonly TournamentMatchV2[]): DoubleElimLayout | null {
  if (!matches.length) return null;
  const rows: Record<"upper" | "lower", BracketColumn[]> = { upper: [], lower: [] };
  let final: BracketColumn | null = null;
  for (const m of matches) {
    const cell = m.bracket?.cell;
    if (!cell) return null;
    const side = /^upper bracket\b/i.test(cell) ? "upper" : /^lower bracket\b/i.test(cell) ? "lower" : null;
    if (side) {
      const col = rows[side].find((c) => c.cell === cell);
      if (col) col.matches.push(m);
      else rows[side].push({ cell, matches: [m] });
    } else if (!final || final.cell === cell) {
      final = final ?? { cell, matches: [] };
      final.matches.push(m);
    } else {
      return null;
    }
  }
  if (!rows.upper.length) return null;
  // Within a column, the match played first sits first (and is numbered 1).
  for (const col of [...rows.upper, ...rows.lower]) col.matches.sort((a, b) => startOf(a) - startOf(b));
  return {
    rows: [
      { key: "upper" as const, label: "Upper bracket", columns: rows.upper },
      { key: "lower" as const, label: "Lower bracket", columns: rows.lower },
    ].filter((r) => r.columns.length > 0),
    final,
  };
}

/**
 * Single-elimination rounds, by upstream cell in standings order. When every
 * later match is fed by two winners of the round before, the earlier rounds
 * are re-ordered so each pair sits beside the match it feeds (`tree`), which
 * is what lets the page draw connectors; otherwise standings order stands.
 */
export function singleElimRounds(matches: readonly TournamentMatchV2[]) {
  const rounds: BracketColumn[] = [];
  for (const m of matches) {
    const cell = m.bracket?.cell ?? m.block_name ?? "Matches";
    const r = rounds.find((x) => x.cell === cell);
    if (r) r.matches.push(m);
    else rounds.push({ cell, matches: [m] });
  }
  let tree = rounds.length > 1;
  for (let i = rounds.length - 1; i > 0 && tree; i--) {
    const prev = rounds[i - 1];
    const ordered: TournamentMatchV2[] = [];
    for (const m of rounds[i].matches) {
      for (const t of m.teams) {
        const src = t.slot?.kind === "winner_of" ? prev.matches.find((p) => p.match_id === t.slot?.match_id) : null;
        if (!src || ordered.includes(src)) {
          tree = false;
          break;
        }
        ordered.push(src);
      }
      if (!tree) break;
    }
    if (tree && ordered.length === prev.matches.length) prev.matches = ordered;
    else tree = false;
  }
  return { rounds, tree };
}

/* ── Swiss ──────────────────────────────────────────────────────────────── */

export interface SwissRound {
  round: number;
  matches: TournamentMatchV2[];
}

/** Upstream's Swiss rounds (from standings), each round in schedule order.
 *  Empty when standings name no rounds — never counted from dates. */
export function swissRounds(state: Pick<TournamentStateV2, "swiss" | "matches">): SwissRound[] {
  const byId = matchesById(state);
  return Object.entries(state.swiss.rounds)
    .map(([round, ids]) => ({
      round: Number(round),
      matches: ids
        .map((id) => byId.get(id))
        .filter((m): m is TournamentMatchV2 => Boolean(m))
        .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start)),
    }))
    .filter((r) => Number.isFinite(r.round) && r.matches.length > 0)
    .sort((a, b) => a.round - b.round);
}

/** The round a reader most likely wants: one with a live match, else the
 *  first with a match still to play, else the last. */
export function focusRound(rounds: readonly SwissRound[]): number | null {
  if (!rounds.length) return null;
  const live = rounds.find((r) => r.matches.some((m) => m.state === "live"));
  if (live) return live.round;
  const open = rounds.find((r) => r.matches.some((m) => m.state !== "completed"));
  return (open ?? rounds[rounds.length - 1]).round;
}

/** "Bo1" / "Bo1 · Bo3" — the formats a set of matches is played in. */
export function formats(matches: readonly TournamentMatchV2[]) {
  const counts = [...new Set(matches.map((m) => m.best_of).filter((n): n is number => typeof n === "number"))];
  return counts.sort((a, b) => a - b).map((n) => `Bo${n}`).join(" · ");
}

export interface SwissTier {
  tier: number;
  teams: TournamentParticipantV2[];
}

/** The Swiss seeding the registry certified: tier → teams, in registry order. */
export function swissTiers(ctx: Pick<TournamentContextV2, "participants">): SwissTier[] {
  const tiers = new Map<number, TournamentParticipantV2[]>();
  for (const p of ctx.participants) {
    if (p.entry_stage !== "swiss" || typeof p.swiss_tier !== "number") continue;
    tiers.set(p.swiss_tier, [...(tiers.get(p.swiss_tier) ?? []), p]);
  }
  return [...tiers.entries()].sort((a, b) => a[0] - b[0]).map(([tier, teams]) => ({ tier, teams }));
}

/**
 * The Play-In's Swiss slot, only from what the backend served: a Play-In team
 * upstream has placed into a Swiss match ("placed"), else the certified
 * winner of the Play-In ("won"), else unresolved.
 */
export function playInSwissSlot(ctx: Pick<TournamentContextV2, "participants">, state: Pick<TournamentStateV2, "swiss" | "play_in">) {
  const playIn = new Set(ctx.participants.filter((p) => p.entry_stage === "play_in").map((p) => p.code));
  const placed = state.swiss.placed_codes.find((c) => playIn.has(c));
  if (placed) return { code: placed, basis: "placed" as const };
  const won = state.play_in.bracket_authority === "standings" ? state.play_in.winner_code : null;
  if (won) return { code: won, basis: "won" as const };
  return { code: null, basis: "unresolved" as const };
}

/* ── field ──────────────────────────────────────────────────────────────── */

export function fieldByRegionV2(ctx: Pick<TournamentContextV2, "regions" | "participants">) {
  return ctx.regions
    .map((region) => ({ region, teams: ctx.participants.filter((p) => p.region === region) }))
    .filter((g) => g.teams.length > 0);
}

export const displayName = (p: Pick<TournamentParticipantV2, "name" | "team_key">) => p.name || p.team_key;

/** True when no participant carries a certified lineup. */
export function lineupsWithheld(ctx: Pick<TournamentContextV2, "participants">) {
  return ctx.participants.every((p) => p.lineup_status !== "registered" || p.lineup.length === 0);
}

/* ── sections ───────────────────────────────────────────────────────────── */

export type V2SectionKey = "today" | "field" | "schedule" | `stage:${string}`;

const stageSection = (key: string): V2SectionKey => `stage:${key}`;

/**
 * What leads the page, per phase. Before the event, the Play-In and the
 * field; during a stage, today's matches and that stage; between stages, the
 * stage coming next; at the end, the knockout bracket and its champion. With
 * no schedule at all, only what the registry knows (the field and the Swiss
 * seeding) — never a pre-event page.
 *
 * Stage keys come from `context.stages`; a stage the page has no special
 * place for keeps the registry's order after the ones it does.
 */
export function sectionOrderV2(state: Pick<TournamentStateV2, "phase" | "phase_detail">, ctx: Pick<TournamentContextV2, "stages">): V2SectionKey[] {
  const keys = ctx.stages.map((s) => s.key);
  const stagesFrom = (lead: string[]) => [...lead.filter((k) => keys.includes(k)), ...keys.filter((k) => !lead.includes(k))].map(stageSection);
  const first = keys[0];
  switch (state.phase) {
    case "pre_event": {
      const [lead, ...rest] = stagesFrom(keys);
      return [...(lead ? [lead] : []), "field", ...rest, "schedule"];
    }
    case "between_stages": {
      const next = state.phase_detail?.next_stage ?? first;
      const done = state.phase_detail?.completed_stage;
      const lead = stagesFrom([next, ...(done ? [done] : [])]);
      return [...lead.slice(0, 2), "schedule", ...lead.slice(2), "field"];
    }
    case "complete": {
      const reversed = [...keys].reverse();
      return [...stagesFrom(reversed), "schedule", "field"];
    }
    case "unknown":
      return ["field", ...(keys.includes("swiss") ? [stageSection("swiss")] : [])];
    default: {
      // A stage in play: today, that stage, then the schedule. The Play-In
      // keeps the field close because its teams are the story; later stages
      // look back through the earlier ones.
      const current = state.phase;
      if (!keys.includes(current)) return ["today", ...keys.map(stageSection), "schedule", "field"];
      const later = keys.slice(keys.indexOf(current) + 1);
      const earlier = keys.slice(0, keys.indexOf(current)).reverse();
      if (current === first) {
        return ["today", stageSection(current), ...later.slice(0, 1).map(stageSection), "field", "schedule", ...later.slice(1).map(stageSection)];
      }
      return ["today", stageSection(current), "schedule", ...later.map(stageSection), ...earlier.map(stageSection), "field"];
    }
  }
}

/** The schedule filter a reader starts on: the stage in play or next. */
export function defaultScheduleStage(state: Pick<TournamentStateV2, "phase" | "phase_detail">, ctx: Pick<TournamentContextV2, "stages">): string {
  switch (state.phase) {
    case "pre_event":
      return ctx.stages[0]?.key ?? "all";
    case "between_stages":
      return state.phase_detail?.next_stage ?? "all";
    case "play_in":
    case "swiss":
    case "knockout":
      return ctx.stages.some((s) => s.key === state.phase) ? state.phase : "all";
    default:
      return "all";
  }
}

/* ── freshness ──────────────────────────────────────────────────────────── */

export interface Freshness {
  /** Something on the page is a recent copy rather than a fresh read. */
  stale: boolean;
  scheduleStale: boolean;
  standingsStale: boolean;
  /** Standings could not be read at all (fresh or recent). */
  standingsMissing: boolean;
  /** The older of the two sources' fetch times. */
  fetchedAt: string | null;
}

export function freshness(data: Pick<TournamentResponseV2, "stale" | "fetched_at" | "sources">): Freshness {
  const schedule: Partial<SourceFreshness> = data.sources?.schedule ?? {};
  const standings: Partial<SourceFreshness> = data.sources?.standings ?? {};
  const times = [schedule.fetched_at, standings.fetched_at, data.fetched_at]
    .filter((t): t is string => typeof t === "string" && Number.isFinite(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    stale: Boolean(data.stale || schedule.stale || standings.stale),
    scheduleStale: Boolean(schedule.stale),
    standingsStale: Boolean(standings.stale),
    standingsMissing: standings.ok === false && !standings.fetched_at,
    fetchedAt: times[0] ?? null,
  };
}

/** The final the champion won, when the backend names a champion. */
export function championMatch(state: Pick<TournamentStateV2, "knockout" | "matches">) {
  const code = state.knockout.bracket_authority === "standings" ? state.knockout.champion_code : null;
  if (!code) return null;
  const finals = stageMatches(state, "knockout", state.knockout).filter(
    (m) => m.state === "completed" && m.winner_code === code,
  );
  return finals[finals.length - 1] ?? null;
}

/** Teams and players whose media the page asks for. */
export function mediaKeysV2(data: Pick<TournamentResponseV2, "context" | "state">) {
  const teams = new Set(data.context.participants.map((p) => p.team_key));
  for (const m of data.state.matches) for (const t of m.teams) if (t.team_key) teams.add(t.team_key);
  const players = data.context.participants.flatMap((p) => (p.lineup_status === "registered" ? p.lineup.map((s) => s.player_key) : []));
  return { teams: [...teams], players };
}

