// ---------------------------------------------------------------------------
// The Teams workspace's derivations (UX2): one tournament participant, read
// only from what the backend serves.
//
// IDENTITY IS THE REGISTRY'S. A participant is its upstream `code` and its
// canonical `team_key` (the Pro Play profile key). A match side is this team
// only when BOTH agree. A side whose key the backend left null (a conflicting
// esports id) is not attributed by code alone.
//
// STATUS NEEDS AUTHORITY. "Out", "Won the Play-In", "Champion" and Swiss
// records come only from the served summaries: a bracket's `eliminated` /
// `winner_code` / `champion_code` with `bracket_authority === "standings"`,
// and the Swiss `records` with their served `status`. Nothing is inferred
// from a date, a missing result or a schedule.
//
// LINEUPS NEED CERTIFICATION. A lineup is shown only for
// `lineup_status === "registered"` with entries. Anything else says Mogzy has
// not certified one, which is not the same as the team not having registered.
// ---------------------------------------------------------------------------

import type {
  TournamentContextV2,
  TournamentMatchV2,
  TournamentParticipantV2,
  TournamentStageV2,
  TournamentStateV2,
} from "@/lib/pro-play/tournamentApi";
import { playInSwissSlot } from "@/lib/pro-play/tournamentV2View";

type Ctx = Pick<TournamentContextV2, "stages" | "participants" | "regions" | "short_name">;
type State = Pick<TournamentStateV2, "matches" | "swiss" | "play_in" | "knockout" | "knockout_teams">;

export function participantByCode(ctx: Pick<TournamentContextV2, "participants">, code: string | null | undefined) {
  if (!code) return null;
  return ctx.participants.find((p) => p.code === code.toUpperCase()) ?? null;
}

/** Teams in the registry's order, optionally one region's. */
export function teamsInRegion(ctx: Pick<TournamentContextV2, "participants">, region: string | null) {
  return region ? ctx.participants.filter((p) => p.region === region) : [...ctx.participants];
}

/** The region filter's options: every region with teams, in registry order. */
export function regionOptions(ctx: Pick<TournamentContextV2, "participants" | "regions">) {
  return ctx.regions.map((r) => ({ region: r, count: ctx.participants.filter((p) => p.region === r).length })).filter((r) => r.count > 0);
}

/** A side is this team only when the code and the canonical key both match. */
const isTeam = (t: TournamentMatchV2["teams"][number], p: TournamentParticipantV2) =>
  !t.tbd && t.code === p.code && t.team_key === p.team_key;

/** This team's matches on the official schedule, in play order. */
export function teamMatches(state: Pick<TournamentStateV2, "matches">, p: TournamentParticipantV2) {
  return state.matches
    .filter((m) => m.teams.some((t) => isTeam(t, p)))
    .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));
}

/** Series won and lost in completed matches the backend has a winner for. */
export function teamSeries(state: Pick<TournamentStateV2, "matches">, p: TournamentParticipantV2) {
  let won = 0;
  let lost = 0;
  for (const m of teamMatches(state, p)) {
    if (m.state !== "completed" || !m.winner_code) continue;
    if (m.winner_code === p.code) won += 1;
    else lost += 1;
  }
  return { won, lost };
}

export type TeamStatusKind = "champion" | "out" | "advanced" | "alive" | "knockout" | "won_play_in" | "placed";

export interface TeamStatus {
  kind: TeamStatusKind;
  label: string;
  /** The stage the fact belongs to. */
  stage: string;
}

/**
 * The team's standing, latest stage first, only as served. Null before the
 * team has any served standing (pre-event, or before its first result).
 */
export function teamStatus(p: TournamentParticipantV2, state: State, ctx: Pick<TournamentContextV2, "short_name" | "participants">): TeamStatus | null {
  const ko = state.knockout.bracket_authority === "standings";
  const pi = state.play_in.bracket_authority === "standings";
  if (ko && state.knockout.champion_code === p.code) return { kind: "champion", label: `${ctx.short_name} champion`, stage: "knockout" };
  if (ko && state.knockout.eliminated.includes(p.code)) return { kind: "out", label: "Out in the Knockouts", stage: "knockout" };
  if (state.knockout_teams.includes(p.code)) return { kind: "knockout", label: "In the Knockouts", stage: "knockout" };
  const rec = state.swiss.records.find((r) => r.code === p.code);
  if (rec) {
    const wl = `${rec.wins}–${rec.losses}`;
    if (rec.status === "advanced") return { kind: "advanced", label: `Advanced from Swiss · ${wl}`, stage: "swiss" };
    if (rec.status === "eliminated") return { kind: "out", label: `Out in Swiss · ${wl}`, stage: "swiss" };
    return { kind: "alive", label: `Swiss · ${wl}`, stage: "swiss" };
  }
  if (pi && state.play_in.eliminated.includes(p.code)) return { kind: "out", label: "Out in the Play-In", stage: "play_in" };
  const slot = playInSwissSlot(ctx, state);
  if (slot.code === p.code) {
    return slot.basis === "placed"
      ? { kind: "placed", label: "Placed in Swiss from the Play-In", stage: "swiss" }
      : { kind: "won_play_in", label: "Won the Play-In", stage: "play_in" };
  }
  return null;
}

export type PathState = "entered" | "reached" | "skipped" | "open" | "closed";

export interface PathStep {
  stage: TournamentStageV2;
  state: PathState;
  /** One served fact or the stage's structural role for this team. */
  detail: string;
  /** Verified (served) vs structural (the format). */
  basis: "verified" | "structure";
  outcome: "won" | "out" | "advanced" | "champion" | null;
}

/**
 * The team's way through the event, one step per stage. Where it starts is
 * the registry's entry stage; how far it has got is served standing; what is
 * still open is labelled as structure ("Possible via the Play-In"), never as
 * a result.
 */
export function teamPath(p: TournamentParticipantV2, state: State, ctx: Ctx): PathStep[] {
  const status = teamStatus(p, state, ctx);
  const entryIndex = ctx.stages.findIndex((s) => s.key === p.entry_stage);
  const ko = state.knockout.bracket_authority === "standings";
  const pi = state.play_in.bracket_authority === "standings";
  const rec = state.swiss.records.find((r) => r.code === p.code);
  const outAt = status?.kind === "out" ? status.stage : null;
  const outIndex = outAt ? ctx.stages.findIndex((s) => s.key === outAt) : -1;
  return ctx.stages.map((stage, i) => {
    const before = entryIndex >= 0 && i < entryIndex;
    if (before) return { stage, state: "skipped", detail: "Seeded past this stage", basis: "verified", outcome: null };
    if (outIndex >= 0 && i > outIndex) return { stage, state: "closed", detail: "Not reached", basis: "verified", outcome: null };
    if (i === entryIndex) {
      if (stage.key === "swiss") {
        const tier = typeof p.swiss_tier === "number" ? `Tier ${p.swiss_tier} seed` : "Seeded";
        return {
          stage,
          state: "entered",
          detail: rec ? `${tier} · ${rec.wins}–${rec.losses}` : tier,
          basis: "verified",
          outcome: rec?.status === "advanced" ? "advanced" : rec?.status === "eliminated" ? "out" : null,
        };
      }
      if (stage.key === "play_in") {
        const won = (pi && state.play_in.winner_code === p.code) || status?.kind === "placed" || status?.kind === "won_play_in";
        const out = pi && state.play_in.eliminated.includes(p.code);
        return { stage, state: "entered", detail: p.qualification ? `Entrant · ${p.qualification}` : "Entrant", basis: "verified", outcome: won ? "won" : out ? "out" : null };
      }
      return { stage, state: "entered", detail: "Entrant", basis: "verified", outcome: null };
    }
    // A later stage than the entry: reached only on a served fact.
    if (stage.key === "swiss") {
      const slot = playInSwissSlot(ctx, state);
      if (slot.code === p.code || rec) {
        return {
          stage,
          state: "reached",
          detail: rec ? `From the Play-In · ${rec.wins}–${rec.losses}` : "Takes the Play-In place",
          basis: "verified",
          outcome: rec?.status === "advanced" ? "advanced" : rec?.status === "eliminated" ? "out" : null,
        };
      }
      return { stage, state: "open", detail: "Open to the Play-In winner", basis: "structure", outcome: null };
    }
    if (stage.key === "knockout") {
      const reached = state.knockout_teams.includes(p.code) || rec?.status === "advanced";
      if (reached) {
        const champ = ko && state.knockout.champion_code === p.code;
        const out = ko && state.knockout.eliminated.includes(p.code);
        return { stage, state: "reached", detail: champ ? "Champion" : out ? "Eliminated" : "Qualified", basis: "verified", outcome: champ ? "champion" : out ? "out" : null };
      }
      return { stage, state: "open", detail: "Open to the Swiss qualifiers", basis: "structure", outcome: null };
    }
    return { stage, state: "open", detail: "Not yet reached", basis: "structure", outcome: null };
  });
}

/** True only for a lineup the backend certified as registered, with entries. */
export function certifiedLineup(p: TournamentParticipantV2) {
  return p.lineup_status === "registered" && p.lineup.length > 0 ? p.lineup : null;
}
