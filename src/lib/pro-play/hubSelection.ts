/**
 * Which game the Pro Play hub's Match Center shows, and which lanes its
 * workspace can offer. Pure, so every rule here is tested without a page.
 *
 * THE HUB'S RULE IS NOT THE MATCH CENTRE'S, ON PURPOSE. The full match centre
 * follows `[...live, ...recent][0]`: the freshest row, whatever state it is
 * in. The hub is the front door, so when nothing is live it prefers a game
 * that actually FINISHED over a recent row that is merely stale — a stale row
 * is a game whose telemetry stopped, and leading the page with it would show
 * last-known numbers as if they were a result.
 *
 * `?game=` is an explicit choice and is never overridden by any of this; the
 * hub applies these rules only when nobody has chosen.
 */
import type { LiveGameSummary, LivePlayer } from "@/lib/live-esports/api";

/** First live game; else the first recent game that is final; else the first
 *  recent game; else nothing. */
export function pickHubGame(
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
): string | null {
  if (live.length) return live[0].game_id;
  const finished = recent.find((g) => g.freshness?.label === "final");
  return (finished ?? recent[0])?.game_id ?? null;
}

/**
 * The next automatic pick, given the current one.
 *
 * Sticky, with one exception. The current pick stays while it is still in
 * the feed — so two live games never swap places on poll order — UNLESS it is
 * a recent game and something has since gone live: the hub leads with live
 * play whenever there is any.
 */
export function nextHubAutoGame(
  current: string | null,
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
): string | null {
  if (current) {
    if (live.some((g) => g.game_id === current)) return current;
    if (!live.length && recent.some((g) => g.game_id === current)) return current;
  }
  return pickHubGame(live, recent);
}

/* ── lanes ──────────────────────────────────────────────────────────────── */

/** Upstream `participantMetadata.role`, verified one per side in production
 *  (backend `live_esports/insights.py` ROLE_ORDER). */
export const HUB_LANES = ["top", "jungle", "mid", "bottom", "support"] as const;
export type HubLane = (typeof HUB_LANES)[number];

export const HUB_LANE_LABEL: Record<HubLane, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bottom: "Bot",
  support: "Support",
};

/** Phone-width lane labels: the row's centre column is ~52px wide. */
export const HUB_LANE_SHORT: Record<HubLane, string> = {
  top: "Top",
  jungle: "Jgl",
  mid: "Mid",
  bottom: "Bot",
  support: "Sup",
};

export type LaneMatchup = {
  lane: HubLane;
  blue: LivePlayer;
  red: LivePlayer;
};

/**
 * The game's lane pairs, in lane order.
 *
 * A lane is offered only when BOTH sides have exactly one player in it. A
 * missing or duplicated role is a telemetry gap, and pairing across it would
 * put two players head to head who never were.
 */
export function laneMatchups(players: readonly LivePlayer[] | null | undefined): LaneMatchup[] {
  const out: LaneMatchup[] = [];
  for (const lane of HUB_LANES) {
    const blue = (players ?? []).filter((p) => p.side === "blue" && p.role === lane);
    const red = (players ?? []).filter((p) => p.side === "red" && p.role === lane);
    if (blue.length === 1 && red.length === 1) out.push({ lane, blue: blue[0], red: red[0] });
  }
  return out;
}

/** A player's display name: the resolved Pro Play identity, else the in-game
 *  name, never an invented one. */
export function lanePlayerName(p: LivePlayer): string {
  return p.resolved_player_name || p.summoner_name || "Unknown player";
}

/**
 * The name a lane row prints. The broadcast's in-game name carries the team
 * tag ("LOS Zest"); beside a row already split by side, the tag is noise, so
 * it is dropped when it is exactly this team's code. A resolved name is
 * printed as is.
 */
export function laneRowName(p: LivePlayer, teamCode: string | null | undefined): string {
  const name = lanePlayerName(p);
  if (p.resolved_player_name || !teamCode) return name;
  const prefix = `${teamCode} `;
  return name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name;
}

/** The canonical Pro Play player key, only when the identity resolved. */
export function lanePlayerKey(p: LivePlayer): string | null {
  if ((p.resolution_method ?? "").startsWith("unresolved")) return null;
  return p.resolved_player_page || null;
}

/**
 * Blue's gold minus red's for one lane pair, from the two players' own
 * `total_gold` in this game — the same per-player numbers the match centre
 * prints. `null` when either side's gold was not published: a missing number
 * is never read as zero.
 */
export function laneGoldDiff(m: LaneMatchup): number | null {
  const b = m.blue.total_gold;
  const r = m.red.total_gold;
  if (b == null || r == null) return null;
  return b - r;
}

/** "+6.7k" / "−0.7k" / "±0" — signed, one decimal of thousands. */
export function signedKGold(diff: number): string {
  if (diff === 0) return "±0";
  const abs = Math.abs(diff);
  const text = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(abs);
  return `${diff > 0 ? "+" : "−"}${text}`;
}

/**
 * The lane row's short label for a resolved name carrying a disambiguation
 * qualifier — "Guti (Moon Jeong-hwan)" prints as "Guti" inside a row that is
 * already scoped to one team and one game. The full name stays the row's
 * tooltip and is printed in the lane's expansion; nothing else is shortened.
 */
export function laneRowShortName(p: LivePlayer, teamCode: string | null | undefined): string {
  const name = laneRowName(p, teamCode);
  if (!p.resolved_player_name) return name;
  const short = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return short || name;
}
