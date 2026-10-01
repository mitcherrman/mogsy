/**
 * The graph page's selection URL, outside the page.
 *
 * MOVED, NOT NEW. This was `selectionHref` inside `ProPlayGraphs.tsx`, which
 * still re-exports it under that name. It lives here so a surface that only
 * needs to LINK to a graph — the Pro Play hub's featured cards — can build the
 * exact URL without importing the whole graphs page into its own chunk.
 */
import { defaultMetric, findCombination } from "./builder";
import type { Graph1FeaturedCard } from "./featured";
import { writeScope } from "./scope";

export const GRAPHS_ROUTE = "/lol/pro-play/graphs";

/** URL parameter names the graph page owns. Public, concise and stable. */
export const GRAPH_SELECTION_PARAM = {
  focus: "focus",
  compare: "vs",
  entity: "e",
  mode: "mode",
  metric: "metric",
} as const;

/** A URL for one selection. Used by the featured cards and by every commit. */
export function selectionHref(card: Graph1FeaturedCard): string {
  const PARAM = GRAPH_SELECTION_PARAM;
  const params = new URLSearchParams();
  params.set(PARAM.focus, card.focus);
  params.set(PARAM.compare, card.compare);
  params.set(PARAM.entity, card.entityId);
  if (card.mode === "bans") params.set(PARAM.mode, "bans");
  const combination = findCombination(card.focus, card.compare);
  // Only name the metric when it is not what the combination lands on, so a
  // shared link stays as short as what the reader actually chose.
  if (combination && card.metric !== defaultMetric(combination, card.mode)) {
    params.set(PARAM.metric, card.metric);
  }
  writeScope(params, card.scope);
  return `${GRAPHS_ROUTE}?${params.toString()}`;
}
