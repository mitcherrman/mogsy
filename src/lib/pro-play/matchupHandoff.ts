/**
 * Team profile -> Matchup Explorer. Source-side only.
 *
 * SERIALIZATION IS NOT REDEFINED HERE. The URL is built by LIVE4's own
 * `teamSelectionToParams` from `EMPTY_TEAM_SELECTION`, so the `mode=team`
 * flag, the parameter names and the ban/scope ordering rules all stay the
 * Explorer's to define. If LIVE4 changes its state contract this follows,
 * rather than drifting into a second spelling of it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ELIGIBILITY GATE IS NOT IN THIS FILE, AND THAT IS DELIBERATE.
 *
 * Whether the board can be pointed at a team is `explorer_pool.in_explorer_pool`
 * on the team profile payload — the backend's restatement of LIVE4's own
 * `is_explorer_team`. It is **not** `worlds_focus`: the focus set is
 * editorial (16 teams on the live registry) and the Explorer pool is that set
 * plus every team admitted on measured data (38). Gating on the focus set
 * hides a working board for the 22 in between; gating the other way round
 * offers a link that lands on `TeamNotInExplorerPool`.
 *
 * This module only builds the URL. The caller decides whether to render it,
 * so there is exactly one place the gate lives and it is the served field.
 */
import {
  EMPTY_TEAM_SELECTION,
  teamSelectionToParams,
} from "@/lib/pro-play/matchupApi";
import { PRO_PLAY_MATCHUP_ROUTE } from "@/lib/pro-play/routes";

/**
 * The Explorer, opened with this team on side A and nothing else chosen.
 *
 * ONE SIDE ONLY, ON PURPOSE. The board is a comparison and the reader has not
 * picked an opponent yet; filling side B with a default would answer a
 * question they did not ask. The Explorer's own first paint is the empty
 * call, so a half-configured board is a state it already handles.
 *
 * `team_key` is verbatim — the profile route key, the stats filter value and
 * the Explorer's `team_a` are all the same canonical identity.
 */
export function matchupExplorerUrl(teamKey: string): string {
  const params = teamSelectionToParams({
    ...EMPTY_TEAM_SELECTION,
    team_a: teamKey,
  });
  return `${PRO_PLAY_MATCHUP_ROUTE}?${params.toString()}`;
}
