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

/** The canonical Pro Play player key, only when the identity resolved. */
export function lanePlayerKey(p: LivePlayer): string | null {
  if ((p.resolution_method ?? "").startsWith("unresolved")) return null;
  return p.resolved_player_page || null;
}
