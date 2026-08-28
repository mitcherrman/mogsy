/**
 * SIM2 — deterministic team-combat editor and results.
 *
 * Served at TWO paths from this ONE module (SIM2 Phase 5A): the promoted
 * `/combat-lab/team-sim`, registered only while VITE_TEAM_SIM_ENABLED is on,
 * and the internal `/dev/combat-lab/team-sim` alias, always registered and
 * never linked from navigation. They are the same element, not two pages —
 * see App.tsx. Additive throughout: the Combat Lab at `/combat-lab` is
 * untouched and remains the 1v1 surface.
 *
 * The file still lives under `pages/dev/` because moving it would rewrite the
 * imports of eight Phase 4B–4E test modules for no behavioural gain; the path
 * a user visits is decided in App.tsx, not by this directory.
 *
 * The whole page is built from the Phase 4A catalog
 * (`GET /api/combat-lab/team-simulate/catalog/v1`), which publishes the exact
 * vocabulary `POST /api/combat-lab/team-simulate/v1` accepts. `/api/meta/items`
 * describes a different, smaller set and is deliberately not used here.
 *
 * The single most important behaviour on this page is that ONE deliberate
 * click produces AT MOST ONE billable POST. There is no auto-run, no retry, no
 * refetch-triggered submission, and no cancel control (aborting the request
 * would not stop the server, it would only destroy the evidence).
 *
 * Structure follows from that. The run state and the result live in THIS
 * component, above the catalog gate, because the catalog query's state is not
 * stable: a failed REFETCH reports `isError` while retaining good data, and a
 * cache clear on sign-out drops it entirely. If the editor owned the run, either
 * event would unmount it mid-flight — discarding an already-charged result and
 * handing back a fresh, re-armed submit button while the first POST was still
 * on the wire.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useInputHistory } from "@/hooks/useInputHistory";
import type { CombatLabCreditStatus } from "@/lib/combat-lab/api";
import {
  indexCatalog,
  creditCostFor,
  traceDetailOptions,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import { TRACE_DETAIL_LABELS } from "@/lib/combat-lab/team-sim/result";
import {
  activeEnemiesOf,
  activeIdsForTeam,
  createDraft,
  draftReducer,
  validateDraft,
  type RuntimeId,
  type TeamKey,
  type TeamScenarioDraft,
  type TeamSize,
} from "@/lib/combat-lab/team-sim/draft";
import {
  isResultStale,
  useCombatLabCredits,
  useRecoverableRequests,
  useRecoveryScope,
  useTeamSimCatalog,
  useTeamSimulation,
  type TeamSimulationRunner,
} from "@/lib/combat-lab/team-sim/hooks";
import { isRecoverable } from "@/lib/combat-lab/team-sim/errors";
import { COMBAT_LAB_ROUTE } from "@/lib/combat-lab/team-sim/featureGate";
import {
  buildSimulationRequest,
  DraftNotSubmittableError,
} from "@/lib/combat-lab/team-sim/request";

import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { CombatantEditor } from "./components/CombatantEditor";
import { EffectiveBuildsPanel } from "./components/EffectiveBuildsPanel";
import { EventTracePanel } from "./components/EventTracePanel";
import { TeamCombatPlayback } from "./components/TeamCombatPlayback";
import { FailureNotice } from "./components/FailureNotice";
import { NumberField, SelectField } from "./components/controls";
import {
  RecoveryLapsedNotice,
  RecoveryNotice,
  RunBlockNotice,
} from "./components/RecoveryPanel";
import { ResultPanel } from "./components/ResultPanel";
import { RunPanel } from "./components/RunPanel";
import { ServerRecoveryPanel } from "./components/ServerRecoveryPanel";
import { TeamSizeSelector } from "./components/TeamSizeSelector";

export default function TeamSimPage() {
  const catalogQuery = useTeamSimCatalog();
  // Owned here, above the catalog gate — see the file header. Phase 4D: the
  // account scope is resolved at the same level, because a restored recovery
  // has to be addressable before (and without) a catalog.
  const identity = useRecoveryScope();
  const runner = useTeamSimulation(identity);
  const creditsQuery = useCombatLabCredits();
  // Phase 4E. Deliberately NOT inside the catalog gate and NOT conditional on
  // it: this is how a paid result is found after the browser lost everything,
  // and the catalog is exactly the kind of thing that may also be failing at
  // that moment. One outage must not hide the other.
  const recoverableQuery = useRecoverableRequests(identity);

  // A leaving tab cannot stop a billable request, but it can destroy the only
  // record of it. Two windows need the warning, not one:
  //   - a request in flight (Phase 4B), and
  //   - a request whose outcome is UNRESOLVED (Phase 4C/4D).
  // Phase 4D changes what the guard is protecting, not whether it fires: the
  // identifier now survives a reload, so the honest warning is about losing
  // the RESPONSE and the tab-scoped recovery, not about losing the request.
  const unresolved =
    isRecoverable(runner.lastFailure?.error ?? null) || runner.recoverable !== null;
  useEffect(() => {
    if (!runner.isPending && !unresolved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [runner.isPending, unresolved]);

  const catalogLoad = catalogQuery.data ?? null;
  // `isError` is true for a failed REFETCH too, so it is only fatal when there
  // is no usable catalog at all; otherwise the editor keeps running on the
  // catalog it already has and the failure is reported inline.
  const fatalCatalogError = !catalogLoad && catalogQuery.isError;
  const refreshError = catalogLoad && catalogQuery.isError ? catalogQuery.error : null;

  return (
    <Shell>
      {/* Above the catalog gate, and above the editor, because a restored
          request needs neither: it is already built, already sent once, and
          the only thing standing between the operator and the result they may
          have paid for is one click. */}
      {runner.recoverable && runner.block?.kind !== "unresolved" ? (
        <RecoveryNotice
          record={runner.recoverable}
          onRecover={runner.recoverStored}
          onForget={runner.forgetStored}
          busy={runner.isPending}
        />
      ) : null}

      {runner.lapsed && !runner.recoverable ? (
        <RecoveryLapsedNotice
          reason={runner.lapsed}
          onDismiss={runner.dismissLapsed}
        />
      ) : null}

      {runner.block ? (
        <RunBlockNotice
          block={runner.block}
          onRecover={runner.recoverStored}
          onForget={runner.forgetStored}
          onCancel={runner.clearBlock}
        />
      ) : null}

      {catalogLoad ? (
        <TeamSimEditor
          catalogLoad={catalogLoad}
          runner={runner}
          credits={creditsQuery.data}
          creditsLoading={creditsQuery.isPending}
          refreshCatalog={() => catalogQuery.refetch()}
          refreshing={catalogQuery.isFetching}
          refreshErrorMessage={refreshError?.message ?? null}
        />
      ) : fatalCatalogError ? (
        <Card className="space-y-2 border-destructive/50 p-6" role="alert">
          <h2 className="text-sm font-semibold text-destructive">
            {catalogQuery.error?.code === "catalog_malformed"
              ? "The simulation catalog is malformed"
              : "The simulation catalog is unavailable"}
          </h2>
          <p className="text-xs">
            {catalogQuery.error?.message ??
              "The catalog endpoint did not answer. No scenario controls can be built without it."}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Controls are hidden rather than rendered from stale or partial data — an
            editor built on an unknown vocabulary would offer builds the simulator
            rejects.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => catalogQuery.refetch()}
            disabled={catalogQuery.isFetching}
          >
            {catalogQuery.isFetching ? "Retrying…" : "Retry"}
          </Button>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground" role="status">
          Loading the simulation catalog…
        </Card>
      )}

      {/* The editor — and with it the ordinary FailureNotice — only exists
          while a catalog is loaded. `useAuthQuerySync` clears the query cache
          on any identity change, so an unresolved paid request could otherwise
          lose its only recovery control while its key was still alive in this
          component's state. Recovery needs neither the catalog nor the index,
          so it gets a fallback here. */}
      {!catalogLoad && runner.lastFailure && unresolved ? (
        <FailureNotice
          error={runner.lastFailure.error}
          teamShape={runner.lastFailure.prepared.teamShape}
          // No catalog means no published billing statement, and "not
          // knowable" is the honest reading of that.
          chargedOnlyOnSuccess={false}
          onRecover={runner.recover}
          onDismiss={runner.dismissFailure}
          recoveryPersisted={runner.identityReady}
        />
      ) : null}

      {/* Phase 4E. BELOW the editor and above the results: secondary to the
          thing the operator came here to do, but ahead of the output, because
          it is about output they may already have paid for.

          Suppressed whenever this page already owns a recovery — the local
          record carries the request and key, a server entry carries neither,
          and the two cannot be matched without guessing. See
          `serverRecoverySuppressed`. */}
      {runner.serverRecoverySuppressed ? null : (
        <ServerRecoveryPanel
          entries={recoverableQuery.data?.recoverable_requests ?? []}
          loading={recoverableQuery.isPending && recoverableQuery.fetchStatus !== "idle"}
          // `isError` only, and only when there is no usable list: a failed
          // REFETCH must not replace records already on screen with an error.
          error={
            recoverableQuery.isError && !recoverableQuery.data
              ? recoverableQuery.error
              : null
          }
          onRecover={runner.recoverServer}
          onRetry={() => recoverableQuery.refetch()}
          busy={runner.isPending}
          recoveryError={runner.serverRecoveryFailure}
          onDismissRecoveryError={runner.dismissServerRecoveryFailure}
        />
      )}

      {/* Survives every catalog state: a charged result is never discarded
          because a refetch failed or the query cache was cleared. */}
      <ResultWorkspace
        runner={runner}
        loadedDigest={catalogLoad ? catalogLoad.catalog.catalog_digest : null}
        executionAssumptions={catalogLoad?.catalog.execution_assumptions}
        rateLimit={catalogLoad?.catalog.rate_limit ?? null}
        catalogUnsupported={catalogLoad?.catalog.unsupported_mechanics ?? []}
        onRefreshCatalog={() => catalogQuery.refetch()}
        refreshing={catalogQuery.isFetching}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Phase 5A: one component now answers to two paths, so the badge is derived
  // from the path actually being viewed instead of being hard-coded "dev".
  // Labelling the promoted route "dev" would tell a user the tool they are
  // being charged for is a prototype; labelling the internal alias as
  // production would hide that it is not linked from anywhere.
  const { pathname } = useLocation();
  const isInternalAlias = pathname.startsWith("/dev/");

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-4 sm:px-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold">Team combat simulator</h1>
          {isInternalAlias ? (
            <span
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              data-testid="team-sim-internal-badge"
            >
              internal · SIM2
            </span>
          ) : null}
          <Link
            to={COMBAT_LAB_ROUTE}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            ← Combat Lab
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Deterministic 1v1–5v5 scheduled combat. Explicit plans and targeting only —
          the engine has no combat AI, no movement and no positioning.
        </p>
      </header>
      {children}
    </main>
  );
}

function TeamSimEditor({
  catalogLoad,
  runner,
  credits,
  creditsLoading,
  refreshCatalog,
  refreshing,
  refreshErrorMessage,
}: {
  catalogLoad: NonNullable<ReturnType<typeof useTeamSimCatalog>["data"]>;
  runner: TeamSimulationRunner;
  credits: CombatLabCreditStatus | null | undefined;
  creditsLoading: boolean;
  refreshCatalog: () => void;
  refreshing: boolean;
  refreshErrorMessage: string | null;
}) {
  const index = useMemo(() => indexCatalog(catalogLoad.catalog), [catalogLoad.catalog]);
  const traceOptions = useMemo(() => traceDetailOptions(index), [index]);
  const [draft, dispatch] = useReducer(draftReducer, index, createDraft);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  // Reuse of the existing Combat Lab input-history primitive: the draft is one
  // owned state object, so undo/redo needs no bespoke history here.
  const restore = useCallback(
    (snapshot: TeamScenarioDraft) => dispatch({ type: "restore", draft: snapshot }),
    []
  );
  const history = useInputHistory<TeamScenarioDraft>({
    current: draft,
    restore,
    classify: () => ({ label: "scenario edit", txnKey: null }),
    cap: 30,
  });

  const validation = useMemo(() => validateDraft(draft, index), [draft, index]);
  const creditCost = creditCostFor(index, draft.teamSizeA, draft.teamSizeB);
  const teamShape = `${draft.teamSizeA}v${draft.teamSizeB}`;
  const idsA = activeIdsForTeam(draft, "A");
  const idsB = activeIdsForTeam(draft, "B");

  // Phase 6B: exactly one open combatant card per team (see CombatantEditor for
  // why ten expanded cards is not a usable page). Kept HERE rather than in the
  // sections so the two teams stay independent — opening B4 must not close A2.
  const [openA, setOpenA] = useState<RuntimeId>("A1");
  const [openB, setOpenB] = useState<RuntimeId>("B1");
  // Shrinking a team can strand the open card on a now-inactive slot, which
  // would render NO editor for that side. Fall back to the team's first slot;
  // the stranded slot's configuration is untouched (it lives in the draft) and
  // comes back the moment the team grows again.
  const activeOpenA = idsA.includes(openA) ? openA : idsA[0];
  const activeOpenB = idsB.includes(openB) ? openB : idsB[0];

  // Which combatants have a submission-blocking issue, so a collapsed card can
  // say so. Without this a validation error on a collapsed A4 would block Run
  // with nothing on screen pointing at A4.
  const flagged = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of validation.issues) {
      if (issue.runtimeId) ids.add(issue.runtimeId);
    }
    return ids;
  }, [validation.issues]);

  const onRun = useCallback(() => {
    setPrepareError(null);
    let prepared;
    try {
      // Serialized exactly once, from the current draft, at the moment of the
      // explicit click — never eagerly, and never from a memo that a rerender
      // could resend.
      prepared = buildSimulationRequest(draft, index);
    } catch (error) {
      setPrepareError(
        error instanceof DraftNotSubmittableError
          ? error.message
          : "The scenario could not be prepared."
      );
      return;
    }
    // The retention the BACKEND publishes decides how long this browser may
    // offer the request back — never a number invented here.
    runner.run(prepared, draft, index.billing.idempotency_retention_seconds);
  }, [draft, index, runner]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <TeamSizeSelector
          index={index}
          teamSizeA={draft.teamSizeA}
          teamSizeB={draft.teamSizeB}
          disabled={runner.isPending}
          onChange={(team: TeamKey, size: TeamSize) =>
            dispatch({ type: "setTeamSize", team, size })
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={!history.canUndo || runner.isPending}
            onClick={() => history.undo()}
          >
            Undo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={!history.canRedo || runner.isPending}
            onClick={() => history.redo()}
          >
            Redo
          </Button>
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="catalog-digest"
          >
            catalog {index.digest}
            {catalogLoad.fromCache ? " (revalidated)" : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            // Also disabled during a run: this is the one control that could
            // otherwise change the page's catalog under an in-flight request.
            disabled={refreshing || runner.isPending}
            onClick={refreshCatalog}
          >
            {refreshing ? "Refreshing…" : "Refresh catalog"}
          </Button>
        </div>
        {refreshErrorMessage ? (
          <p
            className="w-full text-[11px] text-amber-600 dark:text-amber-400"
            data-testid="catalog-refresh-error"
          >
            Catalog refresh failed ({refreshErrorMessage}). Still using catalog{" "}
            {index.digest}.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem_1fr]">
        <section className="min-w-0 space-y-2 lg:order-1" aria-label="Team A">
          <h2 className="text-sm font-semibold">
            Team A{" "}
            <span className="font-normal text-muted-foreground">
              ({idsA.length})
            </span>
          </h2>
          {idsA.map((id) => (
            <CombatantEditor
              key={id}
              combatant={draft.combatants[id]}
              index={index}
              activeEnemies={activeEnemiesOf(draft, id)}
              copyTargets={idsA.filter((other) => other !== id) as RuntimeId[]}
              dispatch={dispatch}
              stepIssues={validation.stepIssues[id]}
              disabled={runner.isPending}
              expanded={id === activeOpenA}
              onExpand={setOpenA}
              hasIssues={flagged.has(id)}
            />
          ))}
        </section>

        <section className="min-w-0 space-y-3 lg:order-2" aria-label="Scenario controls">
          <RunPanel
            teamShape={teamShape}
            creditCost={creditCost}
            credits={credits}
            creditsLoading={creditsLoading}
            issues={validation.issues}
            isPending={runner.isPending}
            pendingKind={runner.pendingKind}
            onRun={onRun}
            onReset={() => dispatch({ type: "reset", index })}
            hasResult={runner.lastRun !== null}
            onClearResult={runner.clearResult}
          />

          {prepareError ? (
            <p className="text-[11px] text-destructive" role="alert">
              {prepareError}
            </p>
          ) : null}

          {runner.lastFailure ? (
            <FailureNotice
              error={runner.lastFailure.error}
              teamShape={runner.lastFailure.prepared.teamShape}
              chargedOnlyOnSuccess={index.billing.charged_only_on_success}
              // Phase 4C: re-sends THAT request with its original key, so it
              // resolves the uncertainty without buying a second simulation.
              onRecover={
                index.billing.idempotency_required ? runner.recover : undefined
              }
              onDismiss={runner.dismissFailure}
              // Phase 4D: the identifier is on disk, so the leave-warning may
              // stop telling the operator not to reload.
              recoveryPersisted={runner.identityReady}
            />
          ) : null}

          <Card className="space-y-2 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scheduler limits
            </h3>
            <NumberField
              label={`Max duration (s, ≤ ${index.schedulerLimits.max_duration.maximum})`}
              value={draft.scheduler.maxDuration}
              min={0.5}
              max={index.schedulerLimits.max_duration.maximum}
              step={0.5}
              onChange={(maxDuration) =>
                dispatch({ type: "setScheduler", patch: { maxDuration: maxDuration ?? 1 } })
              }
            />
            <NumberField
              label={`Max events (≤ ${index.schedulerLimits.max_events.maximum})`}
              value={draft.scheduler.maxEvents}
              min={1}
              max={index.schedulerLimits.max_events.maximum}
              onChange={(maxEvents) =>
                dispatch({ type: "setScheduler", patch: { maxEvents: maxEvents ?? 1 } })
              }
            />
            <NumberField
              label={`Max trace events (≤ ${index.schedulerLimits.max_trace_events.maximum})`}
              value={draft.scheduler.maxTraceEvents}
              min={1}
              max={index.schedulerLimits.max_trace_events.maximum}
              hint="Response bound only — the simulation still runs to max events."
              onChange={(maxTraceEvents) =>
                dispatch({
                  type: "setScheduler",
                  patch: { maxTraceEvents: maxTraceEvents ?? 1 },
                })
              }
            />
            {/* Phase 7A. Lives HERE, with the other settings for the NEXT run,
                rather than above the trace: it is chosen before the simulation
                and cannot be applied to a result already on screen. Changing it
                never re-submits — see the hint, and TeamSimPage.trace.test. */}
            {traceOptions.selectable ? (
              <SelectField
                label="Trace detail"
                value={draft.scheduler.traceDetail}
                options={traceOptions.allowed.map((level) => ({
                  value: level,
                  label: TRACE_DETAIL_LABELS[level] ?? level,
                }))}
                hint={
                  <>
                    {traceOptions.descriptions[draft.scheduler.traceDetail] ??
                      "How much of the event trace comes back."}{" "}
                    <span className="font-medium">
                      Applies to the next run — the result below keeps the level
                      it was fetched at
                      {traceOptions.affectsDigest
                        ? ", and re-running at another level costs a credit."
                        : "."}
                    </span>
                  </>
                }
                onChange={(traceDetail) =>
                  dispatch({ type: "setScheduler", patch: { traceDetail } })
                }
              />
            ) : null}
          </Card>
        </section>

        <section className="min-w-0 space-y-2 lg:order-3" aria-label="Team B">
          <h2 className="text-sm font-semibold">
            Team B{" "}
            <span className="font-normal text-muted-foreground">
              ({idsB.length})
            </span>
          </h2>
          {idsB.map((id) => (
            <CombatantEditor
              key={id}
              combatant={draft.combatants[id]}
              index={index}
              activeEnemies={activeEnemiesOf(draft, id)}
              copyTargets={idsB.filter((other) => other !== id) as RuntimeId[]}
              dispatch={dispatch}
              stepIssues={validation.stepIssues[id]}
              disabled={runner.isPending}
              expanded={id === activeOpenB}
              onExpand={setOpenB}
              hasIssues={flagged.has(id)}
            />
          ))}
        </section>
      </div>

      <StaleResultProbe runner={runner} draft={draft} index={index} />
    </div>
  );
}

/**
 * Publishes "the editor changed since the displayed result" upward without
 * lifting the whole draft out of the editor. Renders nothing.
 */
function StaleResultProbe({
  runner,
  draft,
}: {
  runner: TeamSimulationRunner;
  draft: TeamScenarioDraft;
  index: CatalogIndex;
}) {
  const stale = isResultStale(runner.lastRun, draft);
  useEffect(() => {
    runner.setResultStale(stale);
  }, [runner, stale]);
  return null;
}

function ResultWorkspace({
  runner,
  loadedDigest,
  executionAssumptions,
  rateLimit,
  catalogUnsupported,
  onRefreshCatalog,
  refreshing,
}: {
  runner: TeamSimulationRunner;
  loadedDigest: string | null;
  executionAssumptions?: Record<string, unknown>;
  rateLimit: { limit: number; window_seconds: number } | null;
  catalogUnsupported: string[];
  onRefreshCatalog: () => void;
  refreshing: boolean;
}) {
  const run = runner.lastRun;
  if (!run) {
    return (
      <AssumptionsPanel
        unsupportedMechanics={catalogUnsupported}
        executionAssumptions={executionAssumptions}
        rateLimit={rateLimit}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="result-workspace">
      <ResultPanel
        response={run.response}
        // Phase 4E: a server-recovered result has no prepared request here.
        // The quoted cost comes from the discovery entry that named it — the
        // only description of that run this browser has.
        quotedCreditCost={
          run.prepared?.creditCost ?? run.recoveredFromServer?.creditCost ?? null
        }
        stale={runner.resultStale}
        replayed={run.replayed}
      />
      <EffectiveBuildsPanel
        response={run.response}
        // Null for a server recovery: the catalog it was configured against
        // was never loaded here, so the panel reports the comparison as
        // unavailable instead of claiming agreement.
        configuredDigest={run.prepared?.catalogDigest ?? null}
        loadedDigest={loadedDigest}
        onRefreshCatalog={onRefreshCatalog}
        refreshing={refreshing}
      />
      <TeamCombatPlayback response={run.response} />
      <EventTracePanel response={run.response} />
      <AssumptionsPanel
        unsupportedMechanics={run.response.unsupported_mechanics}
        schedulerAssumptions={run.response.scheduler_assumptions}
        executionAssumptions={executionAssumptions}
        rateLimit={rateLimit}
      />
    </div>
  );
}
