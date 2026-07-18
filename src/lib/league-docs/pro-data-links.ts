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

/**
 * Deep link into the Pro Data Explorer sub-view
 * (`/lol/docs/pro?view=explorer`) with optional pre-applied filters.
 *
 * Emits only parameters the current Explorer parser (`filtersFromSearch` in
 * `lib/league-docs/explorer.ts`) already understands, using its exact query
 * names — this builds a URL only and does not change Explorer parsing:
 *   - `year`     — 4-digit year (parser accepts /^\d{4}$/)
 *   - `champion` — champion slug (the Explorer champion filter's option value)
 *   - `scope`    — legacy scope alias, honored by the parser only for its
 *                  LEGACY_SCOPE_IDS ("all-imported" | "major" | "international");
 *                  normalized here (all → all-imported) and dropped otherwise
 *                  so an unsupported scope never widens or breaks the link.
 *
 * `view=explorer` is always present. Undefined, null, and empty values are
 * omitted. Values are URL-encoded via URLSearchParams.
 */
export function buildProExplorerUrl({
  year,
  champion,
  scope,
}: {
  year?: number | null;
  champion?: string | null;
  scope?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  params.set("view", "explorer");

  if (year !== null && year !== undefined && Number.isInteger(year)) {
    params.set("year", String(year));
  }

  const trimmedChampion = typeof champion === "string" ? champion.trim() : "";
  if (trimmedChampion) params.set("champion", trimmedChampion);

  const normalizedScope = normalizeScopeName(scope);
  if (normalizedScope && isSupportedScope(normalizedScope)) {
    params.set("scope", normalizedScope);
  }

  return `/lol/docs/pro?${params.toString()}`;
}

/**
 * Structured "view source data" reference stored on a quiz question's
 * metadata (question.metadata.pro_data_source). Typed inputs only — never a
 * fully constructed URL and never an arbitrary external URL — so the
 * destination is always built through buildProChampionUrl().
 */
export type ProDataSource = {
  championSlug: string;
  year?: number;
  scope?: string;
  section?: ProChampionSection;
};

// Same shape/bounds the champion + year pages treat as plausible.
const SLUG_PATTERN = /^[a-z0-9'’.&-]{1,40}$/i;

/** True when `slug` is a plausible champion slug (trimmed, matches the pattern). */
export function isValidChampionSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug.trim());
}

/** A recognized, supported scope (post-normalization of the all/all-imported alias). */
export function isSupportedScope(scope: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRO_SCOPE_LABELS, scope);
}

/**
 * Parse + validate raw metadata into a ProDataSource. Fails CLOSED: if
 * pro_data_source exists but ANY supplied field is invalid, the whole
 * reference is rejected (returns null) so a malformed citation never silently
 * widens or redirects to a broader link — the caller then renders no source
 * link and the quiz continues normally. Absent optional fields remain valid.
 */
export function parseProDataSource(raw: unknown): ProDataSource | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const slugValue = obj.champion_slug;
  if (typeof slugValue !== "string") return null;
  const championSlug = slugValue.trim();
  if (!championSlug || !isValidChampionSlug(championSlug)) return null;

  const source: ProDataSource = { championSlug };

  // Optional fields: absent is fine; supplied-but-invalid rejects the whole
  // reference rather than dropping the field and widening the citation.
  if (obj.year !== undefined && obj.year !== null) {
    const year = typeof obj.year === "number" ? obj.year : Number(obj.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    source.year = year;
  }

  if (obj.scope !== undefined && obj.scope !== null) {
    if (typeof obj.scope !== "string") return null;
    const scope = normalizeScopeName(obj.scope);
    if (!scope || !isSupportedScope(scope)) return null;
    source.scope = scope;
  }

  if (obj.section !== undefined && obj.section !== null) {
    if (typeof obj.section !== "string" || !isProChampionSection(obj.section)) return null;
    source.section = obj.section;
  }

  return source;
}

/** Build the destination URL for a parsed ProDataSource via the typed helper. */
export function proDataSourceUrl(source: ProDataSource): string {
  return buildProChampionUrl({
    slug: source.championSlug,
    year: source.year,
    scope: source.scope,
    section: source.section,
  });
}
