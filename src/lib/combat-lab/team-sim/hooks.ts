/**
 * React data hooks for the team-combat surface.
 *
 * The simulation mutation is the reason this file is small and explicit:
 * `POST /api/combat-lab/team-simulate/v1` is billable and offers no
 * client-retry idempotency, so
 *   - `retry: false` is set explicitly (never inherited from a query-client
 *     default that someone may change later),
 *   - a synchronous in-flight ref — not the async `isPending` flag — is what
 *     stops a double click producing two charged runs,
 *   - nothing here fires on mount, on catalog refresh, or on any draft edit.
 *     A simulation happens only when `run()` is called from a click handler.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { combatApi, type CombatLabCreditStatus } from "@/lib/combat-lab/api";
import { deepEqual } from "@/lib/combat-lab/inputHistory";

import { fetchTeamSimCatalog, submitTeamSimulation, type CatalogLoad } from "./client";
import type { TeamSimulationResponse } from "./contract";
import type { TeamSimError } from "./errors";
import type { TeamScenarioDraft } from "./draft";
import type { PreparedSimulation } from "./request";

export const TEAM_SIM_CATALOG_KEY = ["combat-lab", "team-sim", "catalog"] as const;
export const TEAM_SIM_CREDITS_KEY = ["combat-lab", "team-sim", "credits"] as const;

/** Matches the endpoint's own `Cache-Control: public, max-age=300`. */
const CATALOG_STALE_MS = 5 * 60_000;

export function useTeamSimCatalog() {
  return useQuery<CatalogLoad, TeamSimError>({
    queryKey: TEAM_SIM_CATALOG_KEY,
    queryFn: fetchTeamSimCatalog,
    staleTime: CATALOG_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    // A read-only GET is safe to retry once; the billable POST below is not.
    retry: 1,
  });
}

export function useCombatLabCredits() {
  return useQuery<CombatLabCreditStatus | null>({
    queryKey: TEAM_SIM_CREDITS_KEY,
    queryFn: async () => {
      const res = await combatApi.credits();
      return res?.credits ?? null;
    },
    // Always re-read after a run rather than trusting a cached balance.
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export type CompletedRun = {
  response: TeamSimulationResponse;
  prepared: PreparedSimulation;
  /** Draft snapshot as submitted, for "result is from a previous edit". */
  draftAtRun: TeamScenarioDraft;
};

export type FailedRun = {
  error: TeamSimError;
  prepared: PreparedSimulation;
};

export type TeamSimulationRunner = {
  status: "idle" | "pending" | "success" | "error";
  isPending: boolean;
  /** Survives edits and failures; only a new SUCCESS replaces it. */
  lastRun: CompletedRun | null;
  lastFailure: FailedRun | null;
  /** True when the editor changed after the displayed result was produced. */
  resultStale: boolean;
  setResultStale: (stale: boolean) => void;
  /** Returns false when a request is already in flight (nothing was sent). */
  run: (prepared: PreparedSimulation, draft: TeamScenarioDraft) => boolean;
  clearResult: () => void;
  dismissFailure: () => void;
};

export function useTeamSimulation(): TeamSimulationRunner {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<CompletedRun | null>(null);
  const [lastFailure, setLastFailure] = useState<FailedRun | null>(null);
  const [resultStale, setResultStale] = useState(false);
  /**
   * In-flight state is OURS, not the library's.
   *
   * The ref is the real guard (it flips synchronously, so two clicks in one
   * tick cannot both pass), and the mirrored state is what disables the button
   * and shows "Simulating…". Deriving the indicator from `mutation.isPending`
   * instead would let the two disagree — the library reports its own notion of
   * pending, on its own schedule, and a "paused" mutation is `isPending` while
   * nothing has been sent at all. Same source for both means the UI can never
   * claim a request is running when the guard says otherwise, or vice versa.
   */
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const mutation = useMutation<
    TeamSimulationResponse,
    TeamSimError,
    { prepared: PreparedSimulation; draft: TeamScenarioDraft }
  >({
    mutationKey: ["combat-lab", "team-sim", "simulate"],
    mutationFn: ({ prepared }) => submitTeamSimulation(prepared.request),
    // Explicit and load-bearing: a retried POST is a second billable
    // simulation, and the endpoint has no idempotency key to deduplicate it.
    retry: false,
    // Also load-bearing. The library default (networkMode "online") does NOT
    // send an offline mutation — it PAUSES it, keeps it in the cache across
    // unmount, and fires it automatically on the next online OR focus event.
    // Verified against @tanstack/query-core 5.83: offline click -> 0 POSTs,
    // isPaused true; reconnect -> 1 POST with nothing mounted. That is an
    // automatic billable simulation the operator never re-authorized, and the
    // pending UI would have claimed it was already running. "always" sends
    // immediately instead, so an offline click fails fast as a transport
    // error and is reported through the uncertain-status path.
    networkMode: "always",
    onSuccess: (response, variables) => {
      setLastFailure(null);
      setResultStale(false);
      setLastRun({
        response,
        prepared: variables.prepared,
        draftAtRun: variables.draft,
      });
    },
    onError: (error, variables) => {
      // The previous result deliberately survives a failure.
      setLastFailure({ error, prepared: variables.prepared });
    },
    onSettled: () => {
      inFlight.current = false;
      setPending(false);
      // Never guess the new balance — re-read the server's.
      queryClient.invalidateQueries({ queryKey: TEAM_SIM_CREDITS_KEY });
    },
  });

  const run = useCallback(
    (prepared: PreparedSimulation, draft: TeamScenarioDraft) => {
      // Synchronous guard: `isPending` only becomes true after a render, so
      // two clicks inside one tick would both pass an isPending check.
      if (inFlight.current) return false;
      inFlight.current = true;
      setPending(true);
      setLastFailure(null);
      mutation.mutate({ prepared, draft });
      return true;
    },
    [mutation]
  );

  const clearResult = useCallback(() => {
    setLastRun(null);
    setLastFailure(null);
    setResultStale(false);
  }, []);

  const dismissFailure = useCallback(() => setLastFailure(null), []);

  return {
    status: pending ? "pending" : mutation.status,
    isPending: pending,
    lastRun,
    lastFailure,
    resultStale,
    setResultStale,
    run,
    clearResult,
    dismissFailure,
  };
}

/** True when the editor has changed since the displayed result was produced. */
export function isResultStale(
  run: CompletedRun | null,
  draft: TeamScenarioDraft
): boolean {
  if (!run) return false;
  return !deepEqual(run.draftAtRun, draft);
}
