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
import type { LiveGameSummary, LivePlayer, UpcomingMatch } from "@/lib/live-esports/api";
import { isWorldsGame, nextWorldsFixture } from "@/lib/pro-play/worlds";

/** First live game; else the first recent game that is final; else the first
 *  recent game; else nothing. This is the hub's rule when Worlds is not in
 *  play — `pickHubSelection` below puts Worlds in front of it (PW1). */
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

/* ── Worlds (PW1) ───────────────────────────────────────────────────────── */

/**
 * What the hub features when nobody has chosen: a played or playing game, or
 * an upcoming match (upstream's `match_id`). An upcoming pick is not a game
 * id, so it never enters `?game=`; it is shown the way `?next=` shows one.
 */
export type HubPick = { kind: "game"; id: string } | { kind: "upcoming"; id: string };

export const samePick = (a: HubPick | null, b: HubPick | null): boolean =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

const isFinal = (g: LiveGameSummary) => g.freshness?.label === "final";

/**
 * The hub's automatic pick, with Worlds in front.
 *
 * 1. a LIVE Worlds game;
 * 2. else the most recently COMPLETED Worlds game (a stale Worlds row is not
 *    a result and does not count);
 * 3. else the next officially scheduled Worlds match — TBD sides included,
 *    stale schedule entries excluded (`worlds.nextWorldsFixture`);
 * 4. else the hub's ordinary rule (`pickHubGame`): live, then finished, then
 *    anything recent.
 *
 * So an unrelated live or finished match never outranks Worlds, and nothing
 * Worlds-shaped is invented when upstream has published none: with no Worlds
 * game and no Worlds fixture the hub behaves exactly as before PW1.
 */
export function pickHubSelection(
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
  upcoming: readonly UpcomingMatch[],
  now: number = Date.now(),
): HubPick | null {
  const liveWorlds = live.find(isWorldsGame);
  if (liveWorlds) return { kind: "game", id: liveWorlds.game_id };
  const doneWorlds = recent.find((g) => isWorldsGame(g) && isFinal(g));
  if (doneWorlds) return { kind: "game", id: doneWorlds.game_id };
  const fixture = nextWorldsFixture(upcoming, now);
  if (fixture) return { kind: "upcoming", id: fixture.match_id };
  const fallback = pickHubGame(live, recent);
  return fallback ? { kind: "game", id: fallback } : null;
}

/**
 * The next automatic pick, given the current one — `nextHubAutoGame`'s
 * stickiness, extended to Worlds and to upcoming picks.
 *
 * Sticky WITHIN a tier, never across one: two live Worlds games do not swap on
 * poll order, and a completed Worlds game stays while a newer one finishes —
 * but a pick made before Worlds data arrived (the feed lands before the
 * schedule) gives way to Worlds, and any live Worlds game takes over from a
 * completed one. An upcoming pick is recomputed every time, so a fixture that
 * has started or left the schedule is never held on to.
 */
export function nextHubAutoPick(
  current: HubPick | null,
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
  upcoming: readonly UpcomingMatch[],
  now: number = Date.now(),
): HubPick | null {
  const target = pickHubSelection(live, recent, upcoming, now);
  if (!target || target.kind === "upcoming") return target;
  const held = current?.kind === "game" ? current.id : null;
  if (held) {
    const targetGame = [...live, ...recent].find((g) => g.game_id === target.id);
    if (targetGame && isWorldsGame(targetGame)) {
      // Worlds tier: keep the held game only if it is the same kind of Worlds
      // pick (live with live, completed with completed).
      if (live.some((g) => g.game_id === held && isWorldsGame(g))) return current;
      const liveWorlds = live.some(isWorldsGame);
      if (!liveWorlds && recent.some((g) => g.game_id === held && isWorldsGame(g) && isFinal(g))) return current;
      return target;
    }
    // Ordinary tier: the legacy stickiness, on a game that is not Worlds.
    const heldGame = [...live, ...recent].find((g) => g.game_id === held);
    if (heldGame && !isWorldsGame(heldGame)) {
      const next = nextHubAutoGame(held, live, recent);
      return next ? { kind: "game", id: next } : null;
    }
  }
  return target;
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
