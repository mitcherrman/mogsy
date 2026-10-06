/**
 * Patch Hub view routing (PH3-D, design §4). Pure URL helpers.
 *
 *   /lol/patch-reports?patch=26.19   Patch Report (unchanged)
 *   /lol/patch-reports?since=26.14   Catch Up: changes in (26.14, latest]
 *   /lol/patch-reports?view=catchup  Catch Up, no baseline yet (nothing fetched)
 *
 * `since` is the mode. `patch` and `since` never coexist: in Catch Up, `patch`
 * is dropped (it is never reinterpreted as an end patch). `through` is reserved
 * for a future explicit end patch; V1 never honours it and removes it.
 */

export type PatchHubRoute =
  | { mode: "report"; patch: string | null }
  | {
      mode: "catchup";
      /** Baseline (EXCLUDED); null = no baseline chosen yet. */
      since: string | null;
      /** Search string to `replace` with when the URL carries params Catch Up must drop; else null. */
      cleanSearch: string | null;
    };

export const CATCHUP_VIEW_VALUE = "catchup";

export function readPatchHubRoute(params: URLSearchParams): PatchHubRoute {
  const rawSince = params.get("since");
  const isCatchUp = rawSince !== null || params.get("view") === CATCHUP_VIEW_VALUE;
  if (!isCatchUp) return { mode: "report", patch: params.get("patch") };

  const since = rawSince?.trim() ? rawSince.trim() : null;
  const clean = new URLSearchParams(params);
  clean.delete("patch");
  clean.delete("through");
  if (since !== null) {
    clean.delete("view");
    clean.set("since", since);
  } else {
    clean.delete("since");
    clean.set("view", CATCHUP_VIEW_VALUE);
  }
  const cleanSearch = `?${clean.toString()}`;
  return {
    mode: "catchup",
    since,
    cleanSearch: cleanSearch === `?${params.toString()}` ? null : cleanSearch,
  };
}

export const catchUpSearch = (since: string | null): string =>
  since ? `?since=${encodeURIComponent(since)}` : `?view=${CATCHUP_VIEW_VALUE}`;

export const reportSearch = (patch: string | null): string =>
  patch ? `?patch=${encodeURIComponent(patch)}` : "";

/** Canonical Patch Report URL for a Riot line / entry / section anchor. */
export const patchReportHref = (patch: string, anchor: string): string =>
  `/lol/patch-reports?patch=${encodeURIComponent(patch)}#${anchor}`;

/** Router `location.state` carried while in Catch Up. */
export type PatchHubLocationState = {
  /** The patch the reader was viewing when they entered Catch Up. */
  returnPatch?: string | null;
  /** The current baseline came from the remembered preference. */
  fromMemory?: boolean;
};

export function readLocationState(state: unknown): PatchHubLocationState {
  if (!state || typeof state !== "object") return {};
  const s = state as Record<string, unknown>;
  return {
    returnPatch: typeof s.returnPatch === "string" ? s.returnPatch : null,
    fromMemory: s.fromMemory === true,
  };
}
