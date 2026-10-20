/**
 * UX-3 — display helpers for server data. Pure mapping only: every number and
 * outcome shown comes from an E1 snapshot or the series envelope. Nothing here
 * decides who won anything.
 */
import type { ChampClass } from "../cards";
import type { E1Effect, E1Event, E1ObjectiveCategory, E1OutcomeLabel, E1Role, E1SettleHow, E1Snapshot, E1Stage, FixtureLineup, SeriesView } from "@/lib/dynasty/e1/contracts";
import type { Role } from "../fixtures";
import type { ObjectiveOutcome } from "../objectives";

export const STAGE_NAME: Record<E1Stage, string> = { early: "Early", mid: "Mid", late: "Late" };
export const ROLE_ORDER: E1Role[] = ["top", "jng", "mid", "bot", "sup"];

const CLASS_MAP: Record<string, ChampClass> = { tank: "Tank", fighter: "Fighter", assassin: "Assassin", marksman: "Marksman", mage: "Mage", enchanter: "Enchanter" };
export const champClass = (c: string): ChampClass => CLASS_MAP[c] ?? "Fighter";
export const shortName = (n: string) => n.replace(/^SYN\s+/, "");

/** Server player ids are `<team>-<role>`; show them as the synthetic labels they are. */
export const playerLabel = (team: string, role: E1Role) => `SYN ${team}-${role}`;

export function lineupById(series: SeriesView, id: string | null): FixtureLineup | undefined {
  return series.legal_lineups.find((l) => l.lineup_id === id) ?? undefined;
}
export const champNames = (l?: FixtureLineup): Partial<Record<Role, string>> =>
  l ? Object.fromEntries(l.roles.map((r, i) => [r, shortName(l.champions[i].name)])) as Partial<Record<Role, string>> : {};

export const HOW_TEXT: Record<E1SettleHow, string> = {
  double_winning_closeout: "Closeout: Winning in Early and Mid",
  objective_closeout: "Closeout: Baron answered 3 of 3",
  late_decides: "Late decided the game",
};
export function settleReason(s: E1Snapshot): string {
  if (!s.settlement) return "";
  const late = s.stages.find((x) => x.stage === "late");
  if (s.settlement.how === "late_decides" && late) return `Late decided: ${late.you_points}–${late.opponent_points}`;
  if (s.settlement.how === "double_winning_closeout") return s.settlement.winner === "you" ? HOW_TEXT.double_winning_closeout : "They closed it out: Winning in Early and Mid";
  return s.settlement.winner === "you" ? HOW_TEXT.objective_closeout : "Closed out by the opponent's objective";
}

/** The E1 category → the VIS-F4 outcome tone (presentation only). */
export const CATEGORY_TONE: Record<E1ObjectiveCategory, ObjectiveOutcome["tone"]> = {
  baron_ace_closeout: "great", baron_with_trades: "good", baron_heavy_losses: "mixed", enemy_baron_team_wiped: "bad",
};
export const CATEGORY_TITLE: Record<E1ObjectiveCategory, string> = {
  baron_ace_closeout: "Baron and the ace", baron_with_trades: "Baron, with trades", baron_heavy_losses: "Baron at a heavy cost", enemy_baron_team_wiped: "Enemy Baron, team wiped",
};

/** Signed server carry toward you: into the next stage, or the carry Late was played with. */
export function carryNow(s: E1Snapshot | null): number {
  if (!s || !s.stages.length) return 0;
  const last = s.stages[s.stages.length - 1];
  // Late has no stage after it: E1 reports no carry out of Late, so show what Late was played with.
  return last.stage === "late" ? last.carry_in_you : last.carry_out_you;
}
/** VIS-F4 meters take −4..4; E1 carry is on the server's own bounded scale (cap 10, unit 4). */
export const meterLead = (carry: number) => Math.max(-4, Math.min(4, Math.round(carry / 2.5)));

export function effectText(e: E1Effect): string {
  const v = e.value_applied ?? e.value ?? 0;
  const sign = v > 0 ? "+" : "";
  const who = e.for === "you" ? "You" : "Them";
  const what = e.kind.replace(/_/g, " ");
  const where = e.channel === "current_stage" ? "this stage" : e.channel === "next_stage" ? "next stage" : e.channel === "persistent" ? `next ${e.duration_games || 1} game(s), pending E3` : "game";
  if (e.kind === "closeout_win") return `${who}: game win`;
  return `${who}: ${what}${e.role ? ` (${e.role})` : ""} ${sign}${Number.isInteger(v) ? v : v.toFixed(1)} · ${where}${e.capped ? " · capped" : ""}`;
}
export const effectGood = (e: E1Effect) => (e.for === "you") === ((e.value_applied ?? e.value ?? 0) >= 0 || e.kind === "closeout_win");

export function eventsFor(s: E1Snapshot, stage: E1Stage): E1Event[] { return s.events.filter((e) => e.stage === stage); }
export const lastBeat = (s: E1Snapshot | null) => (s?.beats.length ? s.beats[s.beats.length - 1] : null);

export function stageLabelOf(label: E1OutcomeLabel | null, you: number): E1OutcomeLabel | "Game won" | "Game lost" {
  return label ?? (you >= 4 ? "Game won" : "Game lost");
}

export function matchPoint(series: SeriesView): "you" | "them" | "both" | null {
  const a = series.wins === 2, b = series.losses === 2;
  return a && b ? "both" : a ? "you" : b ? "them" : null;
}
