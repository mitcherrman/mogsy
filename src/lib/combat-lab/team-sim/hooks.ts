/**
 * React data hooks for the team-combat surface.
 *
 * The simulation mutation is the reason this file is small and explicit:
 * `POST /api/combat-lab/team-simulate/v1` is billable, so
 *   - `retry: false` is set explicitly (never inherited from a query-client
 *     default that someone may change later),
 *   - a synchronous in-flight ref — not the async `isPending` flag — is what
 *     stops a double click producing two charged runs,
 *   - nothing here fires on mount, on catalog refresh, or on any draft edit.
 *     A simulation happens only when `run()` or `recover()` is called from a
 *     click handler.
 *
 * Phase 4C key lifecycle, stated in one place:
 *   - the key is minted by `buildSimulationRequest`, so ONE explicit click on
 *     Run yields one key bound to one body;
 *   - `run(prepared)` sends that key;
 *   - the prepared request survives on `lastFailure`, so `recover()` resends
 *     the SAME key and the SAME bytes — the only combination the backend
 *     replays instead of charging again;
 *   - a new click (with or without edits in between) builds a new prepared
 *     request and therefore a new key, so a changed body can never inherit
 *     one.
 * None of this weakens the submission guards. Idempotency is defense in
 * depth, not permission: nothing here retries on its own.
 *
 * Phase 4D adds the missing half of that lifecycle: DURABILITY. Everything
 * above lived in React memory, so a reload or a closed tab destroyed the key
 * while the backend still held the ledger — the operator was left with a
 * charge they could neither collect nor identify. Now:
 *   - the record is written to `sessionStorage` BEFORE the POST is dispatched,
 *     and a write that fails REFUSES the run rather than sending a paid
 *     request nobody could recover;
 *   - a page load restores it, offers it, and sends nothing until a click;
 *   - it is cleared only after an accepted result is committed to the UI, or
 *     after the server proves resending it can say nothing new;
 *   - it is namespaced by account, so it is never visible to — or sendable
 *     by — anyone else.
 *
 * Phase 4E closes the last hole in that: storage that is GONE. A cleared
 * session, a different browser, a different device — the ledger row still
 * exists and the credit was still spent, and nothing local can name it.
 * `useRecoverableRequests` asks the SERVER what this account has outstanding,
 * and `recoverServer` collects one by opaque handle. Both are free, and the
 * rules above are unchanged: the query fires on mount because it is a
 * read-only list, and the recovery POST fires only from a click.
 *
 * Precedence between the two recovery surfaces is structural, not heuristic.
 * The local record carries the original request and key; a server entry
 * carries neither, and the two cannot be matched to each other without
 * guessing — a wrong guess would HIDE a recoverable paid request. So while a
 * local record exists the server list is not offered at all (see
 * `serverRecoverable`), which is also the only configuration in which two
 * buttons could ever describe one request.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { combatApi, type CombatLabCreditStatus } from "@/lib/combat-lab/api";
import { deepEqual } from "@/lib/combat-lab/inputHistory";
import { isFailure } from "@/lib/result-narrowing";

import {
  fetchRecoverableRequests,
  fetchTeamSimCatalog,
  recoverSimulation,
  submitTeamSimulation,
  type CatalogLoad,
  type SimulationOutcome,
} from "./client";
import type {
  RecoverableListing,
  RecoverableRequest,
  TeamSimulationResponse,
} from "./contract";
import { isRecoverable, type TeamSimError } from "./errors";
import { accountIdentitySource } from "./identity";
import {
  buildRecord,
  clearScope,
  clearScopeIfKey,
  markState,
  readRecord,
  scopeForAccount,
  UNIDENTIFIED_SCOPE,
  writeRecord,
  type RecoveryDiscardReason,
  type RecoveryWriteFailure,
  type TeamSimRecoveryRecord,
} from "./recovery";
import type { TeamScenarioDraft } from "./draft";
import type { PreparedSimulation } from "./request";

export const TEAM_SIM_CATALOG_KEY = ["combat-lab", "team-sim", "catalog"] as const;
export const TEAM_SIM_CREDITS_KEY = ["combat-lab", "team-sim", "credits"] as const;
export const TEAM_SIM_RECOVERABLE_KEY = [
  "combat-lab",
  "team-sim",
  "recoverable",
] as const;

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

/**
 * A result collected from the SERVER's recovery endpoint (Phase 4E).
 *
 * Present on `CompletedRun` exactly when `prepared` is null, and vice versa:
 * a server-recovered result has no prepared request in this browser — the
 * request that produced it was made somewhere this page has never seen. The
 * quoted cost and shape come from the discovery entry, which is the only
 * description of it that exists here.
 */
export type ServerRecoverySource = {
  recoveryId: string;
  creditCost: number | null;
  teamShape: string | null;
};

/**
 * The account's recoverable requests, from the server (Phase 4E).
 *
 * Fires on mount, because it is a free authenticated GET and because the whole
 * point is that it works when the browser knows nothing. It does NOT poll, does
 * NOT refetch on focus, and does NOT refetch on reconnect: those are the three
 * ways a "harmless" list starts hammering an account-scoped surface nobody
 * asked about.
 *
 * Gated on a RESOLVED, IDENTIFIED account — `ready` is not enough. A signed-out
 * visitor resolves to the `UNIDENTIFIED_SCOPE` sentinel, which is truthy, so a
 * `!!scope` gate would issue one guaranteed-401 GET on every signed-out page
 * load. There is nothing to recover without an account, and asking anyway
 * would also risk briefly showing the previous account's records after a
 * switch.
 */
export function useRecoverableRequests(identity: RecoveryScope) {
  const { scope, ready } = identity;
  const identified = !!scope && scope !== UNIDENTIFIED_SCOPE;
  return useQuery<RecoverableListing, TeamSimError>({
    // Keyed by scope, so a sign-out or an account switch cannot serve the
    // previous account's cached list for even one render.
    queryKey: [...TEAM_SIM_RECOVERABLE_KEY, scope ?? "anonymous"],
    queryFn: fetchRecoverableRequests,
    enabled: ready && identified,
    // Records appear and expire server-side; a cached list is a stale claim
    // about money, so it is re-read whenever the page asks rather than reused.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // No `refetchInterval` key at all, not even `false`. The route-map guard in
    // App.teamSimRoutes.test.ts forbids the IDENTIFIER anywhere in this file,
    // which is what makes "nothing in here polls" checkable by reading rather
    // than by tracing every option object. Writing it disabled would spend that
    // guarantee to restate a default.
    retry: 1,
  });
}

export type CompletedRun = {
  response: TeamSimulationResponse;
  /**
   * The request this page built and sent — null for a result collected from
   * the server by recovery id, where no such object exists. Consumers must
   * treat null as "not knowable here", never as a default.
   */
  prepared: PreparedSimulation | null;
  /** Set iff `prepared` is null. See {@link ServerRecoverySource}. */
  recoveredFromServer?: ServerRecoverySource | null;
  /**
   * Draft snapshot as submitted, for "result is from a previous edit".
   *
   * Null for a result collected by recovering a RESTORED request: that request
   * outlived the editor that produced it, so no snapshot exists and staleness
   * is not knowable. Null therefore means "do not claim either way" — never
   * "fresh" (see `isResultStale`).
   */
  draftAtRun: TeamScenarioDraft | null;
  /**
   * The server replayed a stored result for this key rather than running a new
   * simulation — so this run cost nothing (Phase 4C).
   */
  replayed: boolean;
  /** Account scope that owned the request. Used to clear the right record. */
  scope: string;
};

export type FailedRun = {
  error: TeamSimError;
  prepared: PreparedSimulation;
  /** The draft as submitted, so a recovery can restore the same `lastRun`. */
  draftAtRun: TeamScenarioDraft | null;
  scope: string;
};

/** Why a Run click was refused BEFORE anything reached the network. */
export type RunBlock =
  /** The account is not resolved yet, so no record could be scoped to it. */
  | { kind: "identity" }
  /** Browser recovery storage refused the write — see `run` for why this is fatal. */
  | { kind: "storage"; reason: RecoveryWriteFailure }
  /** An earlier request is still unresolved; overwriting it silently is not an option. */
  | { kind: "unresolved"; record: TeamSimRecoveryRecord };

export type TeamSimulationRunner = {
  status: "idle" | "pending" | "success" | "error";
  /** Something is on the wire. Every submit control is disabled while true. */
  isPending: boolean;
  /**
   * WHAT is on the wire (Phase 4E). `isPending` alone is not enough once two
   * different requests can raise it: a free recovery must not be described as
   * a running simulation, on a surface whose whole job is to never overclaim
   * about money.
   */
  pendingKind: "simulation" | "recovery" | null;
  /** Survives edits and failures; only a new SUCCESS replaces it. */
  lastRun: CompletedRun | null;
  lastFailure: FailedRun | null;
  /** True when the editor changed after the displayed result was produced. */
  resultStale: boolean;
  setResultStale: (stale: boolean) => void;
  /**
   * Send one simulation. Returns false — having sent NOTHING — when a request
   * is already in flight, the account is unknown, browser recovery storage
   * refused the write, or an unresolved request already exists. The reason is
   * published on `block`.
   */
  run: (
    prepared: PreparedSimulation,
    draft: TeamScenarioDraft,
    retentionSeconds?: unknown
  ) => boolean;
  /**
   * Re-send the LAST FAILED request unchanged — same body, same idempotency
   * key — to find out what actually happened to it (Phase 4C). Explicit and
   * operator-driven; nothing calls this automatically. Returns false when
   * there is nothing to recover or a request is already in flight.
   */
  recover: () => boolean;
  clearResult: () => void;
  dismissFailure: () => void;

  /* ─────────────────────────── Phase 4D ─────────────────────────── */

  /** False until the account is known; Run is refused while it is false. */
  identityReady: boolean;
  /**
   * A stored unresolved request that nothing on this page owns — i.e. one that
   * survived a reload or a closed tab. Presence of this value is the ONLY
   * thing that puts a recovery offer on screen, and it never sends anything.
   */
  recoverable: TeamSimRecoveryRecord | null;
  /** Send the RESTORED request: its original key, its original bytes. */
  recoverStored: () => boolean;
  /** Forget the stored record. Sends nothing; the backend is untouched. */
  forgetStored: () => void;
  /** Why the last Run click was refused. */
  block: RunBlock | null;
  clearBlock: () => void;
  /**
   * A stored record that existed but is no longer usable — most importantly
   * `expired`, meaning the local recovery window closed. Informational only:
   * nothing can be recovered from it, and nothing is ever sent because of it.
   */
  lapsed: RecoveryDiscardReason | null;
  dismissLapsed: () => void;

  /* ─────────────────────────── Phase 4E ─────────────────────────── */

  /**
   * Collect ONE server-discovered record. Explicit and click-driven, exactly
   * like every other send in this file. Returns false — having sent nothing —
   * when a request is already in flight or the account is not resolved.
   *
   * It cannot charge and cannot run a simulation, but it is still never
   * automatic: a paid-request surface the page pokes on its own is a surface
   * the operator cannot reason about.
   */
  recoverServer: (entry: RecoverableRequest) => boolean;
  /**
   * The last server-recovery attempt that failed — a 404 for a record that
   * expired between listing and clicking, a 409 for one still running, or a
   * transport failure. Kept separate from `lastFailure`, which is about a
   * SIMULATION this page sent and carries a re-sendable request; this one has
   * neither.
   */
  serverRecoveryFailure: TeamSimError | null;
  dismissServerRecoveryFailure: () => void;
  /**
   * True when the server list must not be shown, because something on this
   * page already owns a recovery for a request the list may also contain.
   *
   * The local record and a server entry cannot be matched to each other — the
   * server never publishes the idempotency key and the client never learns the
   * recovery id of a request it made — so any de-duplication would be a guess,
   * and a wrong guess hides a paid result. Suppressing the whole list while a
   * local recovery is on screen is the one rule that is provably safe, and
   * Phase 4D already allows at most one such record per account.
   */
  serverRecoverySuppressed: boolean;
};

export type RecoveryScope = { scope: string | null; ready: boolean };

/**
 * Resolve the account this browser's recovery records belong to.
 *
 * Synchronous when the identity is already known (a remount inside one page
 * load), asynchronous on a cold start, and re-resolved on every auth change so
 * a sign-out or an account switch immediately stops addressing the previous
 * account's namespace.
 */
export function useRecoveryScope(): RecoveryScope {
  const [state, setState] = useState<RecoveryScope>(() => {
    const known = accountIdentitySource().current();
    return known === null
      ? { scope: null, ready: false }
      : { scope: scopeForAccount(known), ready: true };
  });

  useEffect(() => {
    const source = accountIdentitySource();
    let alive = true;
    const apply = (id: string | null) => {
      if (alive) setState({ scope: scopeForAccount(id), ready: true });
    };
    // StrictMode double-invokes this: both passes only READ identity and set
    // the same state, and neither touches storage or the network.
    void source.resolve().then(apply);
    const unsubscribe = source.subscribe(apply);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useTeamSimulation(
  identity: RecoveryScope = { scope: null, ready: false }
): TeamSimulationRunner {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<CompletedRun | null>(null);
  const [lastFailure, setLastFailure] = useState<FailedRun | null>(null);
  const [resultStale, setResultStale] = useState(false);
  const [restored, setRestored] = useState<TeamSimRecoveryRecord | null>(null);
  const [lapsed, setLapsed] = useState<RecoveryDiscardReason | null>(null);
  const [block, setBlock] = useState<RunBlock | null>(null);
  const [serverRecoveryFailure, setServerRecoveryFailure] =
    useState<TeamSimError | null>(null);
  const { scope, ready: identityReady } = identity;
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
  /**
   * Which of the two mutations `pending` belongs to (Phase 4E).
   *
   * Set from the same places as `pending`, so they cannot disagree, and read
   * by everything that would otherwise describe a free recovery as a running
   * simulation — the RunPanel's copy, and the rule that decides whether the
   * server list stays on screen while its own request is in flight.
   */
  const [pendingKind, setPendingKind] =
    useState<"simulation" | "recovery" | null>(null);

  const mutation = useMutation<
    SimulationOutcome,
    TeamSimError,
    {
      prepared: PreparedSimulation;
      draft: TeamScenarioDraft | null;
      /**
       * Captured at DISPATCH, not read at completion. If the account changes
       * while a request is on the wire, the record must still be cleared from
       * the namespace it was written to — clearing "the current scope" would
       * delete a different account's unresolved request.
       */
      scope: string;
    }
  >({
    mutationKey: ["combat-lab", "team-sim", "simulate"],
    mutationFn: ({ prepared }) =>
      submitTeamSimulation(prepared.request, prepared.idempotencyKey),
    // Explicit and load-bearing. The endpoint IS idempotent per key as of
    // Phase 4C, so an automatic retry could no longer double-charge — but it
    // would still be a request the operator never authorized, and it would
    // paper over exactly the failures this page reports honestly. Recovery is
    // `recover()`, from a click.
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
    onSuccess: (outcome, variables) => {
      setLastFailure(null);
      setResultStale(false);
      // The recovery record is NOT cleared here. It is cleared by an effect
      // keyed on `lastRun`, which runs after React has committed the result to
      // the screen — so a crash between "response arrived" and "result
      // rendered" still leaves a recoverable record behind.
      setLastRun({
        response: outcome.response,
        prepared: variables.prepared,
        draftAtRun: variables.draft,
        replayed: outcome.replayed,
        scope: variables.scope,
      });
    },
    onError: (error, variables) => {
      // The previous result deliberately survives a failure. The prepared
      // request is kept with it — that is what makes an exact, same-key
      // recovery possible instead of a new billable run.
      setLastFailure({
        error,
        prepared: variables.prepared,
        draftAtRun: variables.draft,
        scope: variables.scope,
      });
    },
    onSettled: () => {
      inFlight.current = false;
      setPending(false);
      setPendingKind(null);
      // Never guess the new balance — re-read the server's.
      queryClient.invalidateQueries({ queryKey: TEAM_SIM_CREDITS_KEY });
    },
  });

  /**
   * Collecting a server-discovered result (Phase 4E).
   *
   * A SECOND mutation rather than a branch inside the first, because the two
   * carry different things and fail differently: this one has no prepared
   * request, no idempotency key, and no browser record to keep or clear, so
   * folding it into `mutation` would mean a variables object where half the
   * fields are null and every handler has to ask which case it is in.
   *
   * What it shares is the part that must not diverge: the same synchronous
   * `inFlight` ref and the same `pending` state, so a recovery and a
   * simulation can never both be on the wire, and the same credit
   * invalidation, so the balance is re-read rather than assumed.
   */
  const recoveryMutation = useMutation<
    SimulationOutcome,
    TeamSimError,
    { entry: RecoverableRequest; scope: string }
  >({
    mutationKey: ["combat-lab", "team-sim", "recover-server"],
    mutationFn: ({ entry }) => recoverSimulation(entry.recovery_id),
    // Same reasoning as the simulation mutation: idempotency is not permission,
    // and `networkMode: "always"` keeps an offline click a fast, honest failure
    // instead of a paused mutation the library fires later on its own.
    retry: false,
    networkMode: "always",
    onSuccess: (outcome, variables) => {
      setServerRecoveryFailure(null);
      setLastFailure(null);
      // Not stale: there is no draft snapshot to compare against, and
      // `isResultStale` reads a null `draftAtRun` as "make no claim".
      setResultStale(false);
      setLastRun({
        response: outcome.response,
        prepared: null,
        recoveredFromServer: {
          recoveryId: variables.entry.recovery_id,
          creditCost: variables.entry.credit_cost ?? null,
          teamShape: variables.entry.team_shape,
        },
        draftAtRun: null,
        replayed: outcome.replayed,
        scope: variables.scope,
      });
    },
    onError: (error) => setServerRecoveryFailure(error),
    onSettled: () => {
      inFlight.current = false;
      setPending(false);
      setPendingKind(null);
      // The list is the thing that just changed meaning — a collected record
      // is still listed, and a 404/409 means the entry described something
      // other than what the operator saw. Re-read both rather than guess.
      queryClient.invalidateQueries({ queryKey: TEAM_SIM_RECOVERABLE_KEY });
      queryClient.invalidateQueries({ queryKey: TEAM_SIM_CREDITS_KEY });
    },
  });

  const recoverServer = useCallback(
    (entry: RecoverableRequest) => {
      if (inFlight.current) return false;
      // The record belongs to whoever the server says it belongs to, and the
      // server decides that from the bearer token. Requiring a resolved scope
      // here is what keeps the RESULT attributed to the right account in this
      // page's own state — `visibleRun` filters on it.
      if (!identityReady || !scope) return false;
      inFlight.current = true;
      setPending(true);
      setPendingKind("recovery");
      setServerRecoveryFailure(null);
      setBlock(null);
      recoveryMutation.mutate({ entry, scope });
      return true;
    },
    [identityReady, recoveryMutation, scope]
  );

  const dismissServerRecoveryFailure = useCallback(
    () => setServerRecoveryFailure(null),
    []
  );

  /** Re-read this scope's slot. The only place `restored` is set from storage. */
  const refreshRestored = useCallback(
    (forScope: string | null) => {
      if (!forScope) {
        setRestored(null);
        return null;
      }
      const read = readRecord(forScope, Date.now());
      const record = read.status === "ok" ? read.record : null;
      setRestored(record);
      // A slot that WAS there and is no longer usable is worth one quiet line.
      // Silently dropping it would leave an operator who may have been charged
      // with no idea their local handle on that request ever existed — and the
      // read has already quarantined it, so this cannot re-fire on every load.
      if (read.status === "discarded") setLapsed(read.reason);
      return record;
    },
    []
  );

  /**
   * Dispatch. Every caller — a new run, a Phase 4C failure recovery, a Phase
   * 4D restored recovery — funnels through here, so all three get the same
   * synchronous in-flight guard, the same pending UI and the same credit
   * invalidation. It performs NO storage work: persistence belongs to `run`,
   * before this is ever reached.
   */
  const dispatch = useCallback(
    (
      prepared: PreparedSimulation,
      draft: TeamScenarioDraft | null,
      forScope: string
    ) => {
      // Synchronous guard: `isPending` only becomes true after a render, so
      // two clicks inside one tick would both pass an isPending check.
      if (inFlight.current) return false;
      inFlight.current = true;
      setPending(true);
      setPendingKind("simulation");
      setLastFailure(null);
      setBlock(null);
      mutation.mutate({ prepared, draft, scope: forScope });
      return true;
    },
    [mutation]
  );

  const run = useCallback(
    (
      prepared: PreparedSimulation,
      draft: TeamScenarioDraft,
      retentionSeconds?: unknown
    ) => {
      if (inFlight.current) return false;

      // 1. Identity. A record cannot be namespaced to an account that is not
      //    known yet, and an unnamespaced one could be surfaced to the wrong
      //    person. Refusing costs a moment; guessing costs someone's credits.
      if (!identityReady || !scope) {
        setBlock({ kind: "identity" });
        return false;
      }

      // 2. Collision. An unresolved request already exists for this account.
      //    Overwriting its slot would destroy the only local handle on a
      //    request the server may have executed and charged, so the operator
      //    decides: recover it, or explicitly forget it.
      const existing = refreshRestored(scope);
      if (existing) {
        setBlock({ kind: "unresolved", record: existing });
        return false;
      }

      // 3. Persist BEFORE dispatching. This ordering is the entire phase: if
      //    the tab dies in the microsecond after `mutation.mutate`, the key
      //    and the bytes are already on disk. A failed write therefore FAILS
      //    CLOSED — sending a paid request that provably cannot be recovered
      //    is worse than not sending it, and the operator is told which it was.
      const record = buildRecord({
        scope,
        idempotencyKey: prepared.idempotencyKey,
        request: prepared.request,
        submittedAt: Date.now(),
        catalogDigest: prepared.catalogDigest,
        creditCost: prepared.creditCost,
        retentionSeconds,
      });
      const written = writeRecord(record);
      if (isFailure(written)) {
        setBlock({ kind: "storage", reason: written.reason });
        return false;
      }

      return dispatch(prepared, draft, scope);
    },
    [dispatch, identityReady, refreshRestored, scope]
  );

  /**
   * Re-send the last failed request UNCHANGED.
   *
   * `lastFailure.prepared` is the object built for the original click, so both
   * the body and the idempotency key are identical — the server answers with
   * the result it already produced (charging nothing), with 409
   * `idempotency_in_progress` if it is still working, or by running the
   * simulation if the original never reached it. Every one of those is an
   * honest answer to "what happened to my request?", and none of them can
   * charge a second time.
   *
   * It goes through the same `run` path, so the in-flight guard, the pending
   * UI and the credit invalidation are the same ones a normal run gets.
   */
  const recover = useCallback(() => {
    const failed = lastFailure;
    if (!failed) return false;
    // The account must still be the one that made the request. Idempotency is
    // scoped per user on the backend, so re-sending A's key on B's token is
    // not a replay at all — it is a brand new, fully billable simulation of
    // someone else's scenario. The scope-change effect below normally removes
    // this failure first; this is the belt for that braces, because the window
    // between an auth event and its effect is a window a click can land in.
    if (!scope || failed.scope !== scope) return false;
    // Straight to dispatch: this request was already persisted by the `run`
    // that created it, and re-persisting would move `submitted_at` forward —
    // quietly extending a local expiry past the server's real retention.
    return dispatch(failed.prepared, failed.draftAtRun, failed.scope);
  }, [dispatch, lastFailure, scope]);

  /**
   * Send the RESTORED request. Same key, same bytes, one explicit click.
   *
   * The body comes from the stored record and never from the current editor:
   * the operator may have changed the draft since, and a recovery that sent
   * today's scenario under yesterday's key would earn a 409 at best and a
   * silently wrong replay at worst.
   */
  const recoverStored = useCallback(() => {
    const record = restored;
    if (!record || !scope || record.user_scope !== scope) return false;
    const prepared: PreparedSimulation = {
      request: record.request,
      catalogDigest: record.catalog_digest,
      creditCost: record.credit_cost,
      teamShape: `${record.request.team_a.combatants.length}v${record.request.team_b.combatants.length}`,
      idempotencyKey: record.idempotency_key,
    };
    return dispatch(prepared, null, record.user_scope);
  }, [dispatch, restored, scope]);

  const forgetStored = useCallback(() => {
    const record = restored ?? (block?.kind === "unresolved" ? block.record : null);
    if (record) clearScopeIfKey(record.user_scope, record.idempotency_key);
    else if (scope) clearScope(scope);
    setBlock(null);
    refreshRestored(scope);
  }, [block, refreshRestored, restored, scope]);

  const clearResult = useCallback(() => {
    setLastRun(null);
    setLastFailure(null);
    setResultStale(false);
  }, []);

  const dismissFailure = useCallback(() => setLastFailure(null), []);
  const clearBlock = useCallback(() => setBlock(null), []);
  const dismissLapsed = useCallback(() => setLapsed(null), []);

  /**
   * Restore on load, and re-scope on every identity change.
   *
   * This effect READS storage and nothing else. It cannot send a request, and
   * no other effect in this file can either — the whole file has exactly one
   * call to `mutation.mutate`, inside `dispatch`, reachable only from a click.
   */
  const previousScope = useRef<string | null>(null);
  useEffect(() => {
    if (!identityReady) return;
    const changed =
      previousScope.current !== null && previousScope.current !== scope;
    previousScope.current = scope;
    if (changed) {
      // A different account is looking at this page. The in-memory result and
      // failure belong to the previous one — and the failure carries a live
      // recovery control that would re-send the previous account's request on
      // THIS account's token, which the backend would price as a brand new
      // simulation. Dropping them is not tidiness; it is the isolation.
      setLastRun(null);
      setLastFailure(null);
      setResultStale(false);
      setBlock(null);
      // Phase 4E: a recovery failure describes a record belonging to the
      // account that is leaving. Its message ("that simulation is no longer
      // available") would read as being about the arriving account's records.
      setServerRecoveryFailure(null);
    }
    const record = refreshRestored(scope);
    // A record this page load did not create is one that outlived its tab.
    if (record && record.state === "unresolved") {
      markState(record, "recovery_available");
    }
  }, [identityReady, refreshRestored, scope]);

  /**
   * Clear AFTER the accepted result is on screen. Effects run post-commit, so
   * by the time this executes the operator can see what they paid for.
   */
  useEffect(() => {
    if (!lastRun) return;
    // Cleared in the scope that OWNED it, re-read in the scope that is looking
    // at the page. Those differ when the account changed mid-flight, and
    // re-reading the owning scope there would load the previous account's slot
    // into this account's recovery offer.
    //
    // A server-recovered result (Phase 4E) has no key and therefore no local
    // record to clear — by definition: the browser copy being gone is why the
    // server was asked. Clearing anything on its behalf would delete some
    // OTHER unresolved request's slot.
    if (lastRun.prepared) {
      clearScopeIfKey(lastRun.scope, lastRun.prepared.idempotencyKey);
    }
    refreshRestored(scope);
  }, [lastRun, refreshRestored, scope]);

  /**
   * Keep or clear on failure, by the Phase 4C classifier and nothing else.
   *
   * `isRecoverable` already answers exactly the right question — "can
   * re-sending this unchanged tell us anything new?" — so the record's fate
   * follows it rather than a second, drifting taxonomy:
   *
   *  - uncertain (transport, 5xx, unreadable 200) → KEEP. The server may have
   *    run and charged it.
   *  - `idempotency_in_progress`                  → KEEP. It is still running.
   *  - proven pre-execution rejections (401/402/403/413/422/429, the
   *    fail-closed 503)                          → CLEAR. Nothing ran.
   *  - `idempotency_conflict`                     → CLEAR. The server holds a
   *    DIFFERENT body under this key, so these bytes can never replay; and a
   *    409 is returned before execution, so they were never charged. Keeping
   *    a provably unreplayable record would gate every future run behind a
   *    dismissal for no gain. The response detail stays on screen in the
   *    failure notice for the rest of the session.
   *  - `result_unreadable`                        → CLEAR. The charge
   *    committed and the stored result is gone; asking again fails identically
   *    until the server's own record expires.
   */
  useEffect(() => {
    if (!lastFailure) return;
    if (isRecoverable(lastFailure.error)) {
      const read = readRecord(lastFailure.scope, Date.now());
      // Only THIS request's record. A newer run may already own the slot, and
      // re-stamping that one would describe a live request as a leftover.
      if (
        read.status === "ok" &&
        read.record.idempotency_key === lastFailure.prepared.idempotencyKey
      ) {
        markState(read.record, "recovery_available");
      }
    } else {
      clearScopeIfKey(lastFailure.scope, lastFailure.prepared.idempotencyKey);
    }
    refreshRestored(scope);
  }, [lastFailure, refreshRestored, scope]);

  /**
   * A result or failure is only ever shown to the account that produced it.
   *
   * The scope-change effect already clears both, but it cannot cover the one
   * ordering that matters: a request dispatched by account A whose response
   * lands AFTER the switch to B re-populates this state from `onSuccess` /
   * `onError`, behind the effect's back. Filtering here — at the single
   * boundary every consumer reads through — closes that for the result panel,
   * the failure notice, its recovery button and the leave guard at once.
   */
  const visibleRun = lastRun && (!scope || lastRun.scope === scope) ? lastRun : null;
  const visibleFailure =
    lastFailure && (!scope || lastFailure.scope === scope) ? lastFailure : null;

  /**
   * What the page may OFFER to recover: a stored record that nothing here owns.
   *
   * While a request is in flight its record exists but the RunPanel is already
   * reporting it; while a failure is on screen the FailureNotice already
   * carries "Check this request". Showing a second recovery control for the
   * same request would invite two clicks for one outcome.
   */
  const recoverable =
    restored &&
    !pending &&
    restored.idempotency_key !== visibleFailure?.prepared.idempotencyKey &&
    restored.idempotency_key !== visibleRun?.prepared?.idempotencyKey
      ? restored
      : null;

  /**
   * When the SERVER list must stay off screen (Phase 4E).
   *
   * Three cases, all the same underlying rule — something here already owns a
   * recovery that the list may also be describing, and the two cannot be
   * matched to prove it either way:
   *
   *  - a stored record is being offered (`restored`), including while a Run
   *    click is blocked on it;
   *  - a failure with a live "Check this request" control is on screen;
   *  - a request is in flight, so the page is already reporting one.
   *
   * `restored`, not `recoverable`: `recoverable` hides itself during a
   * collision block, and that is exactly a moment when a second, unmatched
   * recovery control would be at its most confusing.
   */
  const serverRecoverySuppressed =
    // `pendingKind === "simulation"`, not bare `pending`. Suppressing on any
    // in-flight request would unmount this panel the instant its OWN recovery
    // is dispatched — the operator would click Recover and watch the list
    // disappear with no feedback, and with the catalog down there would be
    // nothing on screen at all. A simulation in flight is different: the
    // RunPanel is already reporting it.
    pendingKind === "simulation" ||
    restored !== null ||
    block?.kind === "unresolved" ||
    isRecoverable(visibleFailure?.error ?? null);

  return {
    status: pending ? "pending" : mutation.status,
    isPending: pending,
    pendingKind,
    lastRun: visibleRun,
    lastFailure: visibleFailure,
    resultStale,
    setResultStale,
    run,
    recover,
    clearResult,
    dismissFailure,
    identityReady,
    recoverable,
    recoverStored,
    forgetStored,
    block,
    clearBlock,
    lapsed,
    dismissLapsed,
    recoverServer,
    serverRecoveryFailure,
    dismissServerRecoveryFailure,
    serverRecoverySuppressed,
  };
}

/**
 * True when the editor has changed since the displayed result was produced.
 *
 * A result collected by recovering a RESTORED request has no draft snapshot —
 * the editor that built it is gone. That is "not knowable", and the honest
 * rendering of not-knowable is to make no staleness claim at all rather than
 * to imply the current draft produced it.
 */
export function isResultStale(
  run: CompletedRun | null,
  draft: TeamScenarioDraft
): boolean {
  if (!run || run.draftAtRun === null) return false;
  return !deepEqual(run.draftAtRun, draft);
}
