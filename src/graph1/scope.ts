/**
 * GRAPH1 scope — the user's answer to "which professional games?".
 *
 * Phase E moved scoping to the SERVER. A scope is therefore a set of request
 * parameters, not a client-side pass over a downloaded race: choosing
 * "Worlds 2024" fetches ~2 KB instead of downloading 520 KB and hiding 99% of
 * it. Nothing here filters events; `toQuery` is the whole implementation.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **There is no raw/unfiltered scope.** The empty scope means the backend's
 *    broad professional universe, and this type has no field that could ask
 *    for anything wider. That is the same guarantee the backend makes with
 *    `Graph1Scope` — expressed here as a type, so the frontend cannot regress
 *    it by adding a checkbox.
 * 2. **Values are exact canonical identities.** `league=LCK` matches nothing;
 *    `league=LoL Champions Korea` matches. Every value in a scope comes from
 *    `/api/graph1/scope-values`, never from a hardcoded list, and travels
 *    through the URL unchanged. Only the *label* is friendly.
 *
 * Internal policy names (`MAJOR_PRO`, `pro_broad_v2`, `PRO_TEAM`) never appear
 * in a URL or on screen. The public spelling of the highlight is `major=1`.
 */

export interface Graph1Scope {
  /** Narrow to major leagues and international events. */
  major: boolean;
  /** Exact canonical league identity, e.g. "LoL Champions Korea". */
  league?: string;
  /** Exact canonical tournament identity, e.g. "Worlds 2024 Main Event". */
  tournament?: string;
  /** Exact canonical region identity, e.g. "Korea". */
  region?: string;
  /** Patch string, e.g. "16.15". */
  patch?: string;
  /** Inclusive ISO date bounds, YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * The broad professional universe — the product default.
 *
 * NOT "raw canonical data": the backend still applies its professional
 * eligibility policy. "All Pro Play" is the widest thing a user can ask for
 * and it is already a filtered universe.
 */
export const ALL_PRO_SCOPE: Graph1Scope = { major: false };

/** URL parameter names. Public, concise, and stable. */
export const SCOPE_PARAM = {
  major: "major",
  league: "league",
  tournament: "tournament",
  region: "region",
  patch: "patch",
  dateFrom: "from",
  dateTo: "to",
} as const;

/** Every parameter this module owns — used to clear a scope out of a URL. */
export const SCOPE_PARAM_NAMES: readonly string[] = Object.values(SCOPE_PARAM);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Cap on a scope value we are willing to carry, matching the backend's. */
const MAX_VALUE = 120;

function readValue(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim();
  return raw ? raw.slice(0, MAX_VALUE) : undefined;
}

function readDate(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim();
  // A malformed date is dropped rather than sent: the backend would 400, and a
  // hand-edited URL should degrade to a wider graph, never to an error page.
  return raw && ISO_DATE.test(raw) ? raw : undefined;
}

/** Read a scope out of a query string. Total: never throws. */
export function parseScope(params: URLSearchParams): Graph1Scope {
  const dateFrom = readDate(params, SCOPE_PARAM.dateFrom);
  const dateTo = readDate(params, SCOPE_PARAM.dateTo);
  return {
    major: params.get(SCOPE_PARAM.major) === "1",
    league: readValue(params, SCOPE_PARAM.league),
    tournament: readValue(params, SCOPE_PARAM.tournament),
    region: readValue(params, SCOPE_PARAM.region),
    patch: readValue(params, SCOPE_PARAM.patch),
    // An inverted window is repaired rather than sent as an empty graph.
    dateFrom: dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom,
    dateTo,
  };
}

/** Write a scope into `params`, deleting anything it does not set. */
export function writeScope(params: URLSearchParams, scope: Graph1Scope): void {
  for (const name of SCOPE_PARAM_NAMES) params.delete(name);
  if (scope.major) params.set(SCOPE_PARAM.major, "1");
  if (scope.league) params.set(SCOPE_PARAM.league, scope.league);
  if (scope.tournament) params.set(SCOPE_PARAM.tournament, scope.tournament);
  if (scope.region) params.set(SCOPE_PARAM.region, scope.region);
  if (scope.patch) params.set(SCOPE_PARAM.patch, scope.patch);
  if (scope.dateFrom) params.set(SCOPE_PARAM.dateFrom, scope.dateFrom);
  if (scope.dateTo) params.set(SCOPE_PARAM.dateTo, scope.dateTo);
}

/** True when the scope narrows anything at all. */
export function isScoped(scope: Graph1Scope): boolean {
  return Boolean(
    scope.major ||
      scope.league ||
      scope.tournament ||
      scope.region ||
      scope.patch ||
      scope.dateFrom ||
      scope.dateTo,
  );
}

/**
 * Backend query parameters for a scope.
 *
 * The names here are the API's, not the URL's (`from` -> `date_from`), which
 * is what lets the public URL stay concise while the request stays exact.
 * An unscoped graph sends NOTHING, so its request — and therefore its cache
 * entry and ETag — is byte-identical to the pre-Phase-E one.
 */
export function scopeQuery(scope: Graph1Scope): Record<string, string> {
  const out: Record<string, string> = {};
  if (scope.major) out.major = "true";
  if (scope.league) out.league = scope.league;
  if (scope.tournament) out.tournament = scope.tournament;
  if (scope.region) out.region = scope.region;
  if (scope.patch) out.patch = scope.patch;
  if (scope.dateFrom) out.date_from = scope.dateFrom;
  if (scope.dateTo) out.date_to = scope.dateTo;
  return out;
}

/**
 * Short human label for a scope, e.g. "LCK · Patch 16.15".
 *
 * `labels` maps canonical value -> friendly label, supplied by scope
 * discovery; an unknown value prints as itself rather than disappearing.
 */
export function describeScope(
  scope: Graph1Scope,
  labels: Partial<Record<keyof Graph1Scope, string>> = {},
): string {
  const parts: string[] = [];
  // Tournament is the most specific, so it names the scope on its own; the
  // league it belongs to would only repeat what the tournament already says.
  if (scope.tournament) parts.push(labels.tournament ?? scope.tournament);
  else if (scope.league) parts.push(labels.league ?? scope.league);
  if (scope.region) parts.push(labels.region ?? scope.region);
  if (scope.patch) parts.push(`Patch ${scope.patch}`);
  if (scope.dateFrom && scope.dateTo) parts.push(`${scope.dateFrom} – ${scope.dateTo}`);
  else if (scope.dateFrom) parts.push(`from ${scope.dateFrom}`);
  else if (scope.dateTo) parts.push(`until ${scope.dateTo}`);
  // "Major Pro" is a narrowing, so it only earns a slot when nothing more
  // specific is set — "Worlds 2024 · Major Pro" says nothing extra.
  if (scope.major && parts.length === 0) parts.push("Major Pro");
  else if (scope.major && !scope.tournament && !scope.league) {
    parts.unshift("Major Pro");
  }
  return parts.length ? parts.join(" · ") : "All Pro Play";
}
