/**
 * URL builders for League Docs Pro Data pages, so other features (quiz
 * explanations, year pages, the champion index) can deep-link into a specific
 * view without hand-assembling query strings.
 *
 * Query parameters are view focus, not data claims:
 *   ?year=2011   — focus year-specific sections on one represented year
 *   ?scope=major — focus the scoped-stats section on one scope
 * Hash anchors scroll to a section (see PRO_CHAMPION_SECTIONS).
 */

export const PRO_CHAMPION_SECTIONS = [
  "overview",
  "rows-by-year",
  "yearly-stats",
  "scoped-stats",
  "import-status",
  "recent-games",
  "data-quality",
] as const;

export type ProChampionSection = (typeof PRO_CHAMPION_SECTIONS)[number];

export function isProChampionSection(value: string): value is ProChampionSection {
  return (PRO_CHAMPION_SECTIONS as readonly string[]).includes(value);
}

/**
 * Canonical scope identifier for URL/display matching. The backend has a
 * known alias inconsistency: yearly stats use "all" where scoped stats use
 * "all-imported". Normalization here is for matching only — it does not
 * reimplement any backend filtering.
 */
export function normalizeScopeName(scope: string | null | undefined): string | null {
  if (!scope) return null;
  const trimmed = scope.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed === "all" ? "all-imported" : trimmed;
}

export const PRO_SCOPE_LABELS: Record<string, string> = {
  "all-imported": "All imported",
  major: "Major leagues",
  international: "International",
};

export function proScopeLabel(scope: string | null | undefined): string {
  const normalized = normalizeScopeName(scope);
  if (!normalized) return "—";
  return PRO_SCOPE_LABELS[normalized] ?? normalized;
}

export function buildProChampionUrl({
  slug,
  year,
  scope,
  section,
}: {
  slug: string;
  year?: number | null;
  scope?: string | null;
  section?: ProChampionSection | null;
}): string {
  // Stable parameter order: year, then scope.
  const params = new URLSearchParams();
  if (year !== null && year !== undefined && Number.isInteger(year)) {
    params.set("year", String(year));
  }
  const normalizedScope = normalizeScopeName(scope);
  if (normalizedScope) params.set("scope", normalizedScope);

  const query = params.toString();
  const hash = section && isProChampionSection(section) ? `#${section}` : "";
  return `/lol/docs/pro/champions/${encodeURIComponent(slug)}${query ? `?${query}` : ""}${hash}`;
}

export function buildProYearUrl(year: number): string {
  return `/lol/docs/pro/years/${year}`;
}
