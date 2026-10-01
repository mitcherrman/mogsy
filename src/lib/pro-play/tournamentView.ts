// ---------------------------------------------------------------------------
// Pure presentation helpers for the tournament page (DCGI1).
//
// Grouping and labelling only. Every fact — who played, who won, a team's
// record, who reached the knockouts — arrives from the backend; these helpers
// never derive a standing, a seed, an elimination or a Swiss round number.
// ---------------------------------------------------------------------------

import type {
  LineupRole,
  SwissRecord,
  TournamentContext,
  TournamentMatch,
  TournamentParticipant,
  TournamentPhase,
} from "@/lib/pro-play/tournamentApi";
import { PRO_PLAY_LIVE_GAME_PARAM, PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";

export const ROLE_LABEL: Record<LineupRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bot: "Bot",
  support: "Support",
};

export type SectionKey = "next" | "today" | "records" | "bracket" | "schedule" | "field" | "worlds";

/** What leads the tournament page, per phase. Before the event the field is
 *  the story; during it, today and the table; at the knockouts, the bracket. */
export const SECTION_ORDER: Record<TournamentPhase, SectionKey[]> = {
  pre_event: ["next", "field", "worlds", "schedule"],
  swiss: ["today", "records", "next", "schedule", "field", "worlds"],
  knockout: ["bracket", "today", "next", "records", "schedule", "field", "worlds"],
  complete: ["bracket", "records", "schedule", "field", "worlds"],
};

export const PHASE_LABEL: Record<TournamentPhase, string> = {
  pre_event: "Know the field",
  swiss: "Swiss stage",
  knockout: "Knockout stage",
  complete: "Complete",
};

/** The field in the context's own region order. */
export function fieldByRegion(ctx: TournamentContext) {
  return ctx.regions
    .map((region) => ({
      region,
      teams: ctx.participants.filter((p) => p.region === region),
    }))
    .filter((g) => g.teams.length > 0);
}

export function participantsByCode(ctx: TournamentContext) {
  return new Map<string, TournamentParticipant>(ctx.participants.map((p) => [p.code, p]));
}

/** Local calendar day key "2026-10-03" for an ISO instant, in `timeZone`
 *  (the viewer's own when omitted). */
export function localDayKey(iso: string, timeZone?: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "Sat 3 Oct" for a local day key. */
export function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Matches grouped by the viewer's local day, in schedule order. */
export function matchesByDay(matches: readonly TournamentMatch[], timeZone?: string) {
  const days: { day: string; matches: TournamentMatch[] }[] = [];
  for (const m of matches) {
    const day = localDayKey(m.scheduled_start, timeZone);
    if (!day) continue;
    const last = days[days.length - 1];
    if (last && last.day === day) last.matches.push(m);
    else days.push({ day, matches: [m] });
  }
  return days;
}

/** The matches on the viewer's current local day. */
export function todaysMatches(matches: readonly TournamentMatch[], now: number, timeZone?: string) {
  const today = localDayKey(new Date(now).toISOString(), timeZone);
  return matches.filter((m) => localDayKey(m.scheduled_start, timeZone) === today);
}

/** Swiss records grouped by record ("2–0"), most wins first. Empty when the
 *  backend served none — no 0–0 table before a match is played. */
export function recordGroups(records: readonly SwissRecord[]) {
  const groups: { record: string; wins: number; losses: number; rows: SwissRecord[] }[] = [];
  for (const r of records) {
    const record = `${r.wins}–${r.losses}`;
    const last = groups[groups.length - 1];
    if (last && last.record === record) last.rows.push(r);
    else groups.push({ record, wins: r.wins, losses: r.losses, rows: [r] });
  }
  return groups;
}

export const KNOCKOUT_ROUNDS = ["Quarterfinals", "Semifinals", "Finals"] as const;

/** Knockout matches by upstream round name, in schedule order. */
export function bracketRounds(matches: readonly TournamentMatch[]) {
  return KNOCKOUT_ROUNDS.map((round) => ({
    round,
    matches: matches.filter((m) => m.stage === "knockout" && m.block_name === round),
  })).filter((r) => r.matches.length > 0);
}

/** "3–17 Oct 2026" / "28 Sep – 2 Oct 2026". Dates are calendar dates. */
export function dateRange(starts: string, ends: string): string {
  const a = new Date(`${starts}T12:00:00Z`);
  const b = new Date(`${ends}T12:00:00Z`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return `${starts} – ${ends}`;
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const year = b.getUTCFullYear();
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)} ${year}`;
  }
  return `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)} ${year}`;
}

/**
 * Where a match row leads. A match LIVE1 has stored opens its latest game in
 * the hub's match dossier; a future match opens the hub's UP NEXT view; a
 * match with neither has no link — nothing is promised that does not exist.
 */
export function matchHref(m: TournamentMatch): string | null {
  const games = m.live1_game_ids;
  if (games.length) {
    return `${PRO_PLAY_ROUTE}?${PRO_PLAY_LIVE_GAME_PARAM}=${encodeURIComponent(games[games.length - 1])}`;
  }
  if (m.state === "upcoming" && !m.teams.every((t) => t.tbd)) {
    return `${PRO_PLAY_ROUTE}?next=${encodeURIComponent(m.match_id)}`;
  }
  return null;
}

/** Score text for a started match ("1–0"), or null before it starts. */
export function scoreText(m: TournamentMatch): string | null {
  if (m.state === "upcoming") return null;
  return `${m.teams[0].game_wins}–${m.teams[1].game_wins}`;
}

export function regionCounts(ctx: TournamentContext) {
  return fieldByRegion(ctx).map((g) => ({ region: g.region, count: g.teams.length }));
}
