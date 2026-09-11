/**
 * One entity's row out of the PUBLIC Pro Play statistics API.
 *
 * WHY THIS EXISTS AT ALL. The canonical profiles are served by
 * `/api/pro-play/research/*`, whose comparison contract carries games, W-L,
 * win rate and a champion pool — and no performance rates. K/D/A, KDA,
 * CS/min, Gold/min and Damage/min live only in `/api/pro-play/stats/*`. Both
 * are public and BOTH KEY THE SAME IDENTITIES (`player_lp_page`, `team_key`,
 * `champion_key`), which is the only reason composing them is cheap.
 *
 * IT REUSES THE STATS CONTRACT VERBATIM — no second implementation of any
 * formula. This module issues the exact request the public Stats Explorer
 * issues for a single entity and reads `rows[0]`; every number therefore
 * carries the Explorer's semantics by construction, and the "View in Pro
 * Stats" link beside it lands on a table showing the same figures.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SCOPE IS NOT THE PROFILE'S SCOPE, AND MUST NEVER BE PRINTED AS IF IT
 * WERE. The comparison block above it counts canonical games over four named
 * product scopes under a CURATED league policy (major leagues only). This
 * request names only the entity, so the stats route leaves `year` unset —
 * see its `_resolve_scope`, where a request naming any scoping dimension
 * suppresses the latest-year default — and the result is career, across
 * EVERY competition. The two game counts will legitimately differ, most
 * visibly for a player with minor-league history.
 *
 * That is why `scopeLabel` is returned from the SERVER'S echoed filters
 * rather than assumed, and why the panel that renders this prints its own
 * denominators. A rate shown under a record it was not computed over is the
 * one defect this composition can produce.
 *
 * THE TWO-DENOMINATOR CONTRACT SURVIVES. `games` is canonical and always
 * present; `stat_backed_games` is the subset carrying statistics. Rates
 * arrive `null` — never `0` — when that subset is empty, which is the normal
 * state for a pre-2014 career. Callers render null as an em dash.
 */
import { useEffect, useState } from "react";

import {
  getProStats,
  type ProStatsChampionRow,
  type ProStatsPlayerRow,
  type ProStatsResponse,
  type ProStatsTeamRow,
  type ProStatsView,
} from "@/lib/pro-play/statsApi";

export type EntityStatsState =
  | { status: "loading" }
  /** The entity has no row in the statistics corpus at all. Structurally
   *  different from having a row whose rates are null, and said differently
   *  on screen. */
  | { status: "absent" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      row: ProStatsPlayerRow | ProStatsTeamRow | ProStatsChampionRow;
      response: ProStatsResponse;
    };

/** The filter key each view's identity resolves against — the same three keys
 *  the profile routes take. */
const FILTER_KEY: Record<ProStatsView, "player" | "team" | "champion"> = {
  players: "player",
  teams: "team",
  champions: "champion",
};

/**
 * How the server described the slice it actually answered. Built from the
 * ECHOED filters, never from the request, because the route may default a
 * dimension the caller left unset.
 */
export function statsScopeLabel(response: ProStatsResponse): string {
  const { year, league, patch, role } = response.filters;
  const parts: string[] = [];
  parts.push(year == null ? "All seasons" : String(year));
  parts.push(league ?? "all competitions");
  if (patch) parts.push(`patch ${patch}`);
  if (role) parts.push(role);
  return parts.join(" · ");
}

/** The Stats Explorer URL showing exactly this slice as a table row. Uses the
 *  Explorer's own query contract on the hub route; no new path. */
export function statsExplorerUrl(view: ProStatsView, key: string): string {
  const params = new URLSearchParams({ view, [FILTER_KEY[view]]: key });
  return `/lol/pro-play?${params.toString()}`;
}

/**
 * Fetch one entity's statistics row.
 *
 * `pageSize: 1` because an exact identity filter yields at most one row and
 * the profile has no use for a second; it keeps the response a few hundred
 * bytes rather than a page of the leaderboard.
 */
export function useEntityStats(view: ProStatsView, key: string): EntityStatsState {
  const [state, setState] = useState<EntityStatsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getProStats(view, { [FILTER_KEY[view]]: key, pageSize: 1 }, controller.signal)
      .then((response) => {
        const row = response.rows[0];
        if (!row) {
          setState({ status: "absent" });
          return;
        }
        setState({ status: "ready", row, response });
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        // A failure here must NOT take the profile down with it: the identity,
        // the record and the champion pool all come from a different contract
        // and are still correct.
        setState({
          status: "error",
          message:
            (err as Error)?.message ?? "Performance statistics are unavailable.",
        });
      });
    return () => controller.abort();
  }, [view, key]);

  return state;
}
