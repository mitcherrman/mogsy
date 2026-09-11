/**
 * Fetch one champion-pair sample.
 *
 * The same API base, the same error class and the same 4xx-is-final retry rule
 * as `useGraph1Dataset` — a pair is a different question over the same
 * backend, not a second client.
 *
 * The two ORIENTATIONS are two cache entries. They read the same games but
 * report opposite records, so sharing a key would show a reader K'Sante's
 * win rate under Olaf's name.
 */
import { useQuery } from "@tanstack/react-query";

import { championMatchupUrl, type Graph1ChampionMatchup } from "./championMatchup";
import { GRAPH1_API_BASE, Graph1HttpError, readErrorDetail } from "./useGraph1Dataset";
import { scopeQuery, type Graph1Scope } from "./scope";

/** Structural check. A payload that is not a pair sample is not rendered as
 *  one — the surface would otherwise print `undefined` as a record. */
export function assertChampionMatchup(value: unknown): Graph1ChampionMatchup {
  const payload = value as Graph1ChampionMatchup;
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.games !== "number" ||
    !payload.subject?.name ||
    !payload.opponent?.name ||
    !payload.record ||
    typeof payload.record.wins !== "number"
  ) {
    throw new Error("GRAPH1 champion matchup: unexpected payload shape");
  }
  return payload;
}

export function useGraph1ChampionMatchup(
  subject: string,
  opponent: string,
  apiBase?: string,
  options: { enabled?: boolean; scope?: Graph1Scope } = {},
) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  const query = options.scope ? scopeQuery(options.scope) : {};
  return useQuery<Graph1ChampionMatchup>({
    queryKey: ["graph1-champion-matchup", base, subject, opponent, query],
    enabled: (options.enabled ?? true) && Boolean(subject && opponent),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: (count, error) =>
      count < 1 && !(error instanceof Graph1HttpError && error.status < 500),
    queryFn: async () => {
      const res = await fetch(
        championMatchupUrl(base, subject, opponent, options.scope),
      );
      if (!res.ok) {
        throw new Graph1HttpError(
          res.status,
          `GRAPH1 champion matchup ${subject} vs ${opponent}: HTTP ${res.status}`,
          await readErrorDetail(res),
        );
      }
      return assertChampionMatchup(await res.json());
    },
  });
}
