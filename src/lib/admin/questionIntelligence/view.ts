// QI1 view helpers shared by the panel and its tests.

import type { QiFilters, QiQuestion } from "./api";

export const QI_PAGE_SIZE = 50;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The last seven UTC days, every population filter open, players only. */
export function defaultQiFilters(now: number = Date.now()): QiFilters {
  return {
    from: isoDay(now - 6 * 86_400_000), to: isoDay(now), host: "all", stageKind: "", namespace: "",
    family: "", minServed: 1, cohort: "product", sort: "served", offset: 0, limit: QI_PAGE_SIZE,
  };
}

/** The most common option count for a question, which decides its grid shape. */
export function dominantOptionCount(q: QiQuestion): number {
  const entries = Object.entries(q.positions.optionCounts).map(([k, v]) => [Number(k), v] as const);
  if (entries.length === 0) return q.positions.byPosition.length;
  return entries.sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
