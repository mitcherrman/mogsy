/**
 * "Graph this" — the Pro Play stats table's hand-off to Explore Pro Data.
 *
 * SOURCE-SIDE ONLY. This module translates a stats-explorer scope into the
 * URL the existing graph page already parses. It consumes that destination
 * contract and never redefines it: scope serialization is `writeScope` from
 * `@/graph1/scope`, and the four selection parameters below are the ones
 * `ProPlayGraphs.parseSelection` reads. They are duplicated here rather than
 * imported so the hub does not pull the whole graph page into its bundle;
 * `graphHandoff.test.ts` feeds a generated href straight back through
 * `parseSelection`, so the duplication cannot drift silently.
 *
 * The two surfaces are NOT the same product, and the mapping is deliberately
 * lossy in one direction only — it drops, it never invents:
 *
 * - A graph is always ABOUT one entity. The table is a ranking, so a scope
 *   that names no player, team or champion has no graph to go to and the
 *   action is withheld rather than pointed at some default.
 * - `role` and `min_games` have no graph equivalent. They are reported as
 *   left behind, never silently reinterpreted.
 * - `year` is the one rewrite: the table's year IS a date window
 *   (`date_from=Y-01-01`, `date_to=Y-12-31`), and the graph scope's inclusive
 *   `from`/`to` express exactly that window. Nothing is widened.
 *
 * Identities carry verbatim because they are the same identities: the stats
 * filters resolve `player` against `player_lp_page`, `team` against
 * `team_key` and `league` against `league_slug`, which are the graph's entity
 * id and scope vocabularies. `champion` is the one conversion — the stats
 * layer keys champions by name and the graph by slug — and it reuses the
 * app's existing `championSlug`, verified to agree with the backend's own
 * slug for all 172 champions in the corpus.
 */
import { championSlug } from "@/lib/league-docs/api";
import type { Graph1CompareKind, Graph1FocusKind } from "@/graph1/builder";
import { writeScope, type Graph1Scope } from "@/graph1/scope";
import type { ProStatsView } from "@/lib/pro-play/statsApi";

/** The graph product route. */
export const GRAPH_ROUTE = "/lol/pro-play/graphs";

/** Selection parameters owned by the graph page — see the module note. */
const GRAPH_PARAM = { focus: "focus", compare: "vs", entity: "e" } as const;

/** The stats scope a hand-off is built from. `year` must be the EFFECTIVE
 *  year the server reported, not the raw URL value: the table defaults it,
 *  and a graph scoped to a different span than the rows beside it would be
 *  the exact lie this feature exists to avoid. */
export interface ProStatsScope {
  view: ProStatsView;
  year: number | null;
  league: string | null;
  patch: string | null;
  role: string | null;
  player: string | null;
  team: string | null;
  champion: string | null;
  minGames: number | null;
}

export interface GraphHandoff {
  href: string;
  focus: Graph1FocusKind;
  compare: Graph1CompareKind;
  entityId: string;
  /** What the graph will be about, in the table's own spelling. */
  entityLabel: string;
  /** Filter labels that made the trip, for the caller to name. */
  transferred: string[];
  /** Filter labels that did not, with their value. Always shown to the user;
   *  the point of the action is that it cannot mislead. */
  dropped: string[];
}

/** The focus a view prefers, most specific subject first. A view's own
 *  subject wins when both are set: on Players, "Faker + Azir" graphs Faker's
 *  champions — a race in which Azir is one of the bars — rather than
 *  discarding the player the table is ranking. */
const FOCUS_ORDER: Record<
  ProStatsView,
  { key: "player" | "team" | "champion"; compare: Graph1CompareKind }[]
> = {
  // Player -> Champions, then Champion -> Players.
  players: [
    { key: "player", compare: "champions" },
    { key: "champion", compare: "players" },
  ],
  // Team -> Champions, then Champion -> Teams: on a team table the teams are
  // the interesting bars, so a champion focus compares teams, not players.
  teams: [
    { key: "team", compare: "champions" },
    { key: "champion", compare: "teams" },
  ],
  // Champions has no second option: the graph has no team- or player-focused
  // family whose bars are champions' own rates.
  champions: [{ key: "champion", compare: "players" }],
};

const ENTITY_LABEL = { player: "Player", team: "Team", champion: "Champion" };

function graphScope(scope: ProStatsScope): Graph1Scope {
  return {
    major: false,
    league: scope.league ?? undefined,
    patch: scope.patch ?? undefined,
    // The table's year is a calendar window on game_date and the graph
    // scope's bounds are inclusive, so this is the same span, not an
    // approximation of it.
    dateFrom: scope.year != null ? `${scope.year}-01-01` : undefined,
    dateTo: scope.year != null ? `${scope.year}-12-31` : undefined,
  };
}

/**
 * The hand-off for a scope, or `null` when the graph cannot represent it.
 *
 * `null` is a product answer, not a failure: it is what keeps the action from
 * appearing over a ranking that has no single subject to graph.
 */
export function graphHandoff(scope: ProStatsScope): GraphHandoff | null {
  const choice = FOCUS_ORDER[scope.view]?.find((c) => scope[c.key]);
  if (!choice) return null;

  const value = scope[choice.key] as string;
  const entityId = choice.key === "champion" ? championSlug(value) : value;
  if (!entityId) return null;

  const params = new URLSearchParams();
  params.set(GRAPH_PARAM.focus, choice.key);
  params.set(GRAPH_PARAM.compare, choice.compare);
  params.set(GRAPH_PARAM.entity, entityId);
  writeScope(params, graphScope(scope));

  const transferred = [ENTITY_LABEL[choice.key]];
  if (scope.year != null) transferred.push(`Year ${scope.year}`);
  if (scope.league) transferred.push(scope.league);
  if (scope.patch) transferred.push(`Patch ${scope.patch}`);

  // Every filter the graph has no way to express. The other entity filters
  // are here too: a graph is about ONE entity, so a second one is a genuine
  // narrowing that did not make the trip.
  const dropped: string[] = [];
  for (const key of ["player", "team", "champion"] as const) {
    if (key !== choice.key && scope[key]) {
      dropped.push(`${ENTITY_LABEL[key]} ${scope[key]}`);
    }
  }
  if (scope.role) dropped.push(`Role ${scope.role}`);
  if (scope.minGames) dropped.push(`Min games ${scope.minGames}`);

  return {
    href: `${GRAPH_ROUTE}?${params.toString()}`,
    focus: choice.key,
    compare: choice.compare,
    entityId,
    entityLabel: value,
    transferred,
    dropped,
  };
}
