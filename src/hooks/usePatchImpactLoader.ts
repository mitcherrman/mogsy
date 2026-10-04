import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PatchImpactAnalysis } from "@/lib/patch-impact";
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import {
  analyzeImmediate,
  analyzeWithEvidence,
  immediateLoadState,
  needsImpactEvidence,
  type PatchImpactLoadState,
} from "@/lib/patch-impact-loader/analysis";
import {
  impactEvidenceKey,
  loadImpactEvidence,
  toLoadFailure,
} from "@/lib/patch-impact-loader/evidence";

export type PatchImpactLoaderInput = {
  card: PatchReportCard;
  change: PatchReportChange;
  /** The patch whose report holds `card` (the selected Patch Report's version). */
  patchVersion: string;
};

export type PatchImpactLoader = {
  /**
   * The best analysis so far. Starts as the immediate Riot-only PH2-A analysis
   * (parameter facts, plus any projection the card alone proves) and becomes
   * the enriched analysis once evidence has loaded. Referentially stable between
   * renders, so reading it for a slider move costs nothing.
   */
  analysis: PatchImpactAnalysis;
  state: PatchImpactLoadState;
  /** True when `requestProjection()` would start (or retry) a load. */
  canRequest: boolean;
  /**
   * Begin loading the canonical companion and later reports. The ONLY thing that
   * can cause network activity. A no-op when nothing needs loading, while a load
   * is in flight, and once evidence is ready; after a failure it retries.
   */
  requestProjection: () => void;
};

/**
 * Lazy Patch Impact data for one changed Base Stats line.
 *
 * Rendering a Patch Report, mounting this hook and moving a level slider never
 * touch the network. After `requestProjection()` the evidence (version list,
 * canonical champion stats, this patch's report and every later report) is read
 * through the shared TanStack cache on the existing keys, so reports the page
 * already holds are not fetched again and any number of consumers of the same
 * patch share one load.
 *
 * Fail-closed: a load failure never throws into the caller and never invents a
 * projection; `analysis` stays the immediate one and `state` says why.
 *
 * Evidence already in the cache is surfaced only after THIS consumer requests
 * it, so a panel never shows a projection its own Explore did not ask for.
 */
export function usePatchImpactLoader({
  card,
  change,
  patchVersion,
}: PatchImpactLoaderInput): PatchImpactLoader {
  const queryClient = useQueryClient();
  const subject = useMemo(() => ({ card, change, patchVersion }), [card, change, patchVersion]);
  const immediate = useMemo(() => analyzeImmediate(subject), [subject]);
  const needsEvidence = needsImpactEvidence(immediate);

  const [requestedFor, setRequestedFor] = useState<string | null>(null);
  const requested = needsEvidence && requestedFor === patchVersion;

  const query = useQuery({
    queryKey: impactEvidenceKey(patchVersion),
    queryFn: () => loadImpactEvidence(queryClient, patchVersion),
    enabled: requested,
    // Assembled evidence is a pure function of cached reports: never refetch it
    // behind the caller's back.
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    throwOnError: false,
  });

  const evidence = requested ? query.data : undefined;
  const enriched = useMemo(
    () => (evidence ? analyzeWithEvidence(subject, evidence) : null),
    [subject, evidence],
  );
  const analysis = enriched ?? immediate;

  let state: PatchImpactLoadState;
  if (!needsEvidence) state = immediateLoadState(immediate);
  else if (!requested) state = { status: "idle" };
  else if (evidence && enriched) state = { status: "ready" };
  else if (evidence) {
    state = {
      status: "failed",
      error: {
        code: "analysis_failed",
        resource: null,
        version: patchVersion,
        message: "The loaded Patch Impact evidence could not be analysed.",
      },
    };
  }
  else if (query.isError && !query.isFetching) state = { status: "failed", error: toLoadFailure(query.error) };
  else state = { status: "loading" };

  const { refetch, isError, isFetching } = query;
  const requestProjection = useCallback(() => {
    if (!needsEvidence) return;
    if (requestedFor !== patchVersion) {
      setRequestedFor(patchVersion);
    } else if (isError && !isFetching) {
      void refetch();
    }
  }, [needsEvidence, requestedFor, patchVersion, isError, isFetching, refetch]);

  return {
    analysis,
    state,
    canRequest: state.status === "idle" || state.status === "failed",
    requestProjection,
  };
}
