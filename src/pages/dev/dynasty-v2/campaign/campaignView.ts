/**
 * UX-7 — pure read helpers for the campaign screens. They pick and name what the
 * server served; none of them decides progression, carry or story.
 */
import type { CampaignSnapshot, CampaignStage, HistoryEntry, StoryBeat } from "@/lib/dynasty/e1/campaignContracts";
import type { E1Role } from "@/lib/dynasty/e1/contracts";

export type PanelKind = "house" | "handshake" | "tunnel" | "stage" | "trophy" | "rain" | "crest" | "draft" | "baron";

/** The panel art for a story beat kind (presentation only). */
export function beatArt(b: StoryBeat): PanelKind {
  const won = (b.evidence as { score?: { you: number; opponent: number } }).score;
  switch (b.kind) {
    case "previous_series": return won && won.you > won.opponent ? "stage" : "rain";
    case "standout": return "crest";
    case "practice_payoff": return "draft";
    case "fatigue_building": return "rain";
    case "objectives": return "baron";
    case "rematch": return "handshake";
    case "stakes": return "tunnel";
    case "ending": return (b.evidence as { kind?: string }).kind === "champion" ? "trophy" : "rain";
    default: return "house";
  }
}

export const BEAT_KICKER: Record<string, string> = {
  previous_series: "Last series", standout: "Standout", practice_payoff: "Practice", fatigue_building: "Fatigue",
  objectives: "Baron", rematch: "Rematch", stakes: "Stakes", ending: "The end",
};

/** Which beats survive when a strip is full (most important first). Presentation only. */
const BEAT_PRIORITY = ["ending", "stakes", "rematch", "fatigue_building", "standout", "practice_payoff", "previous_series", "objectives"];

/** The beats worth a strip right now: one per kind (the server's first), at most `max`, kept in the server's order. */
export function stripBeats(beats: StoryBeat[], max = 4): StoryBeat[] {
  const firsts = beats.filter((b, i) => beats.findIndex((x) => x.kind === b.kind) === i);
  if (firsts.length <= max) return firsts;
  const rank = (b: StoryBeat) => { const i = BEAT_PRIORITY.indexOf(b.kind); return i < 0 ? BEAT_PRIORITY.length : i; };
  const keep = new Set([...firsts].sort((a, b) => rank(a) - rank(b)).slice(0, max));
  return firsts.filter((b) => keep.has(b));
}

/** The stage the run is in: the open series', else the ending's, else the last played. */
export function stageNow(c: CampaignSnapshot): CampaignStage {
  return c.current_series?.stage ?? c.ending?.stage ?? c.history[c.history.length - 1]?.stage ?? "regular";
}

/** True when the open series is the format's last round (the final), read from the served format. */
export function isFinalRound(c: CampaignSnapshot): boolean {
  const last = c.format.stages[c.format.stages.length - 1];
  const round = last?.rounds[last.rounds.length - 1]?.round;
  return !!c.current_series && !!round && c.current_series.round === round;
}

/** Names of the five who played the last game of a series (for the championship roll call). */
export function lastFive(c: CampaignSnapshot, h: HistoryEntry | undefined): string[] {
  const g = h?.games[h.games.length - 1];
  if (!g) return [];
  const order: E1Role[] = ["top", "jng", "mid", "bot", "sup"];
  return order.map((r) => c.roster?.players.find((p) => p.player_id === g.players[r])?.name ?? g.players[r]).filter(Boolean);
}

/** The settled series a transition is about. */
export const historyOf = (c: CampaignSnapshot, seriesIndex: number | undefined) => c.history.find((h) => h.series_index === seriesIndex);

/** Per-campaign "seen" marks for one-time presentation (transition screens, the finals intro, the trophy). Device-local; never authority. */
const SEEN_KEY = "mogzy.dynasty.ux7.seen.v1";
export function seen(campaignId: string, mark: string): boolean {
  try { return (JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string[]>)[campaignId]?.includes(mark) ?? false; } catch { return false; }
}
export function markSeen(campaignId: string, mark: string) {
  try {
    const all = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string[]>;
    all[campaignId] = [...new Set([...(all[campaignId] ?? []), mark])].slice(-40);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* presentation only */ }
}
