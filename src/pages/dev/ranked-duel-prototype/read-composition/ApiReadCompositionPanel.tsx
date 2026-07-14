import { Dispatch, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DuelAction } from "../duelMachine";
import { PlayerId } from "../fixtures";
import {
  RankedDuelReadCompositionState,
  ReadCompositionAction,
  ReadCompositionError,
  SurfaceError,
  initialReadCompositionState,
  pendingSettlementToCommit,
  readCompositionReducer,
} from "./rankedDuelReadComposition";
import { fetchPublicRound, PublicRoundFetchError } from "../transport-client/fetchPublicRound";
import {
  fetchPrivatePlayer,
  PrivatePlayerFetchError,
} from "../transport-client/fetchPrivatePlayer";
import {
  fetchResolvedRound,
  ResolvedRoundFetchError,
  DEFAULT_RANKED_DUEL_API_BASE,
} from "../transport-client/fetchResolvedRound";
import { adaptPublicRound } from "../transport-adapter/adaptPublicRound";
import { adaptPrivatePlayer } from "../transport-adapter/adaptPrivatePlayer";
import { adaptResolvedRoundEnvelope } from "../transport-adapter/adaptResolvedRoundEnvelope";
import { EnvelopeValidationError } from "../transport-adapter/rankedDuelEnvelopeValidation";
import { SettlementAdapterError } from "../backend-adapter/adaptBackendSettlement";

/**
 * DEV-ONLY manual one-shot read composition panel.
 *
 * Wires the three committed read-only HTTP clients through the committed
 * pure composition reducer (identity, precedence, stale-generation, and
 * privacy rules all live THERE — this component only performs requests and
 * renders the composed state). The single settlement commit path is
 * preserved: when the composition reducer accepts a NEW settlement,
 * `pendingSettlementToCommit` yields it and a guarded effect dispatches the
 * existing APPLY_BACKEND_SETTLEMENT exactly once per round.
 *
 * No submissions, polling, realtime, retries, or timer authority.
 */
export function ApiReadCompositionPanel({ dispatch }: { dispatch: Dispatch<DuelAction> }) {
  // Inputs (identity is only established via the explicit Initialize action).
  const [baseUrl, setBaseUrl] = useState(DEFAULT_RANKED_DUEL_API_BASE);
  const [matchId, setMatchId] = useState("");
  const [p1PlayerId, setP1PlayerId] = useState("");
  const [p2PlayerId, setP2PlayerId] = useState("");
  const [ownerPlayerId, setOwnerPlayerId] = useState("");
  const [roundNumber, setRoundNumber] = useState("1");
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Composition state via explicit apply() so INITIALIZE_IDENTITY's throw is
  // catchable and async callbacks always read the freshest state (no stale
  // closures around generations).
  const [comp, setComp] = useState<RankedDuelReadCompositionState>(initialReadCompositionState);
  const compRef = useRef(comp);
  const apply = (action: ReadCompositionAction): RankedDuelReadCompositionState => {
    const next = readCompositionReducer(compRef.current, action);
    compRef.current = next;
    setComp(next);
    return next;
  };

  // One request slot per surface: controller + the reducer's generation gate.
  const aborts = useRef<{ [k in "public" | "private" | "resolved"]: AbortController | null }>({
    public: null,
    private: null,
    resolved: null,
  });
  const mounted = useRef(true);
  const abortAll = () => {
    aborts.current.public?.abort();
    aborts.current.private?.abort();
    aborts.current.resolved?.abort();
  };
  useEffect(() => {
    mounted.current = true; // Strict Mode re-runs mount effects
    return () => {
      mounted.current = false;
      abortAll();
    };
  }, []);

  // ----- settlement commit bridge (the ONLY duelMachine integration) -------
  // Rounds already handed to APPLY_BACKEND_SETTLEMENT. A ref (not state) so
  // Strict Mode double-effects and rerenders can never double-dispatch.
  const committedRounds = useRef<Set<number>>(new Set());
  useEffect(() => {
    const settlement = pendingSettlementToCommit(comp);
    if (!settlement) return;
    if (committedRounds.current.has(settlement.roundNumber)) return;
    committedRounds.current.add(settlement.roundNumber);
    // Never during render: this runs post-commit in an effect, and only for
    // settlements the composition reducer actually accepted.
    dispatch({ type: "APPLY_BACKEND_SETTLEMENT", settlement });
  }, [comp, dispatch]);

  const initialized = comp.identity !== null;

  const initializeIdentity = () => {
    try {
      apply({
        type: "INITIALIZE_IDENTITY",
        identity: {
          matchId: matchId.trim(),
          p1PlayerId: p1PlayerId.trim(),
          p2PlayerId: p2PlayerId.trim(),
          ownerPlayerId: ownerPlayerId.trim(),
        },
      });
      setIdentityError(null);
    } catch (err) {
      setIdentityError(
        err instanceof ReadCompositionError ? err.message : "Invalid identity input.",
      );
    }
  };

  const resetComposition = () => {
    abortAll();
    // Commit tracking may only be cleared together with the composition.
    committedRounds.current = new Set();
    apply({ type: "RESET" });
    setIdentityError(null);
  };

  const normalizeError = (err: unknown): SurfaceError => {
    if (
      err instanceof PublicRoundFetchError ||
      err instanceof PrivatePlayerFetchError ||
      err instanceof ResolvedRoundFetchError
    ) {
      return { kind: err.kind, message: err.message };
    }
    if (err instanceof EnvelopeValidationError) return { kind: "invalid_envelope", message: err.message };
    if (err instanceof SettlementAdapterError) return { kind: "invalid_settlement", message: err.message };
    return { kind: "unexpected", message: "unexpected error" };
  };

  const isAborted = (err: unknown): boolean =>
    (err instanceof PublicRoundFetchError ||
      err instanceof PrivatePlayerFetchError ||
      err instanceof ResolvedRoundFetchError) &&
    err.kind === "aborted";

  /** Shared one-shot request runner: start slot -> fetch+adapt -> settle. */
  const runSurface = async <T,>(
    surface: "public" | "private" | "resolved",
    startAction: ReadCompositionAction,
    perform: (signal: AbortSignal) => Promise<T>,
    succeed: (generation: number, value: T) => ReadCompositionAction,
    fail: (generation: number, error: SurfaceError) => ReadCompositionAction,
  ) => {
    // A new request for THIS surface aborts only this surface's predecessor.
    aborts.current[surface]?.abort();
    const controller = new AbortController();
    aborts.current[surface] = controller;
    const generation = apply(startAction).requestStatus[surface].generation;
    try {
      const value = await perform(controller.signal);
      if (!mounted.current) return;
      apply(succeed(generation, value));
    } catch (err) {
      if (!mounted.current || isAborted(err)) return; // superseded/unmounted
      apply(fail(generation, normalizeError(err)));
    }
  };

  const loadPublic = () => {
    const identity = compRef.current.identity;
    if (!identity) return;
    void runSurface(
      "public",
      { type: "PUBLIC_REQUEST_STARTED" },
      async (signal) =>
        adaptPublicRound(
          await fetchPublicRound({ baseUrl, matchId: identity.matchId, signal }),
          { p1PlayerId: identity.p1PlayerId, p2PlayerId: identity.p2PlayerId },
        ),
      (generation, publicRound) => ({ type: "PUBLIC_REQUEST_SUCCEEDED", generation, publicRound }),
      (generation, error) => ({ type: "PUBLIC_REQUEST_FAILED", generation, error }),
    );
  };

  const loadPrivate = () => {
    const identity = compRef.current.identity;
    if (!identity) return;
    void runSurface(
      "private",
      { type: "PRIVATE_REQUEST_STARTED" },
      async (signal) =>
        adaptPrivatePlayer(
          await fetchPrivatePlayer({
            baseUrl,
            matchId: identity.matchId,
            playerId: identity.ownerPlayerId,
            signal,
          }),
          identity.ownerPlayerId,
        ),
      (generation, privatePlayer) => ({
        type: "PRIVATE_REQUEST_SUCCEEDED",
        generation,
        privatePlayer,
      }),
      (generation, error) => ({ type: "PRIVATE_REQUEST_FAILED", generation, error }),
    );
  };

  const loadResolved = () => {
    const identity = compRef.current.identity;
    if (!identity) return;
    const round = Number(roundNumber);
    void runSurface(
      "resolved",
      { type: "RESOLVED_REQUEST_STARTED", roundNumber: round },
      async (signal) =>
        // The exact committed settlement path: validated envelope ->
        // adaptResolvedRoundEnvelope (which reuses adaptBackendSettlement).
        adaptResolvedRoundEnvelope(
          await fetchResolvedRound({
            baseUrl,
            matchId: identity.matchId,
            roundNumber: round,
            signal,
          }),
          { p1PlayerId: identity.p1PlayerId, p2PlayerId: identity.p2PlayerId },
        ),
      (generation, settlement) => ({ type: "RESOLVED_REQUEST_SUCCEEDED", generation, settlement }),
      (generation, error) => ({ type: "RESOLVED_REQUEST_FAILED", generation, error }),
    );
  };

  const field = (
    label: string,
    testId: string,
    value: string,
    onChange: (v: string) => void,
    disabled: boolean,
    width = "w-28",
  ) => (
    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground min-w-0">
      {label}
      <input
        data-testid={testId}
        className={`h-8 rounded-md border bg-background px-2 text-xs ${width} max-w-full disabled:opacity-60`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );

  const publicRound = comp.publicRound;
  const owner = comp.privatePlayer;
  const roundMismatch =
    publicRound !== null && owner !== null && publicRound.roundNumber !== owner.roundNumber;

  return (
    <div className="mt-3 border-t border-dashed border-amber-500/40 pt-3 space-y-2" data-testid="comp-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
          MANUAL READ COMPOSITION (DEV)
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          One-shot public/private/resolved reads through the composition reducer. Settlements
          commit once via the existing APPLY_BACKEND_SETTLEMENT.
        </span>
      </div>

      {/* Identity */}
      <div className="flex flex-wrap items-end gap-2" data-testid="comp-identity-section">
        {field("API base URL", "comp-base-url", baseUrl, setBaseUrl, false, "w-52")}
        {field("Match ID", "comp-match-id", matchId, setMatchId, initialized)}
        {field("p1 backend id", "comp-p1-id", p1PlayerId, setP1PlayerId, initialized)}
        {field("p2 backend id", "comp-p2-id", p2PlayerId, setP2PlayerId, initialized)}
        {field("Owner backend id", "comp-owner-id", ownerPlayerId, setOwnerPlayerId, initialized)}
        {!initialized ? (
          <Button type="button" size="sm" variant="secondary" data-testid="comp-init-identity" onClick={initializeIdentity}>
            Initialize identity
          </Button>
        ) : (
          <Badge className="gap-1" data-testid="comp-identity-locked">
            Identity locked · owner is {comp.identity!.ownerPlayerId === comp.identity!.p1PlayerId ? "p1" : "p2"}
          </Badge>
        )}
        <Button type="button" size="sm" variant="outline" data-testid="comp-reset" onClick={resetComposition}>
          Reset composition
        </Button>
      </div>
      {identityError && (
        <p data-testid="comp-identity-error" role="status" className="text-[11px] text-destructive break-words">
          {identityError}
        </p>
      )}

      {/* Load actions */}
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant="secondary" data-testid="comp-load-public" disabled={!initialized} onClick={loadPublic}>
          Load public
        </Button>
        <Button type="button" size="sm" variant="secondary" data-testid="comp-load-private" disabled={!initialized} onClick={loadPrivate}>
          Load private (owner)
        </Button>
        {field("Resolved round #", "comp-round-number", roundNumber, setRoundNumber, false, "w-20")}
        <Button type="button" size="sm" variant="secondary" data-testid="comp-load-resolved" disabled={!initialized} onClick={loadResolved}>
          Load resolved round
        </Button>
      </div>

      {/* Request status — one line per surface, always independent. */}
      <div className="text-[11px] text-muted-foreground space-y-0.5" data-testid="comp-status-section">
        {(["public", "private", "resolved"] as const).map((surface) => {
          const s = comp.requestStatus[surface];
          return (
            <div key={surface} data-testid={`comp-status-${surface}`} className="break-words">
              <span className="font-semibold">{surface}</span>: {s.phase} · gen {s.generation}
              {s.error && (
                <span className="text-destructive"> · {s.error.kind}: {s.error.message}</span>
              )}
            </div>
          );
        })}
      </div>

      {roundMismatch && (
        <p data-testid="comp-round-mismatch" className="text-[11px] text-amber-600 dark:text-amber-400">
          Warning: public round {publicRound!.roundNumber} and private round {owner!.roundNumber}{" "}
          disagree — surfaces are shown separately, not as one coherent round.
        </p>
      )}

      {/* Public (shared) — neutral facts only; structurally cannot leak. */}
      {publicRound && (
        <div className="rounded-md border bg-background/50 p-2 space-y-1 text-[11px] tabular-nums" data-testid="comp-public-section">
          <div className="font-semibold">
            Public · {publicRound.matchStatus} · round {publicRound.roundNumber} ·{" "}
            {publicRound.completedRounds} completed
          </div>
          {publicRound.activeRound ? (
            <div className="text-muted-foreground" data-testid="comp-shared-timer">
              Shared timer: {publicRound.activeRound.durationSeconds}s · deadline{" "}
              {publicRound.activeRound.activeDeadline}
              {publicRound.activeRound.pressureApplied && " · pressure-shortened"}
              {publicRound.activeRound.readyToResolve && " · ready to resolve"}
            </div>
          ) : (
            <div className="text-muted-foreground">No active round.</div>
          )}
          {(["p1", "p2"] as PlayerId[]).map((slot) => {
            const p = publicRound.players[slot];
            return (
              <div key={slot} className="text-muted-foreground">
                <span className="font-semibold">{slot}</span> {p.playerId} ({p.classId}) · HP{" "}
                {p.hp} · {p.totalXp} xp · Lv {p.level} ·{" "}
                {p.hasSubmitted ? "submitted" : "thinking"}
                {p.abilitySelectionPhase !== null &&
                  ` · ability window ${p.abilitySelectionPhase} (${
                    p.hasAbilitySelected ? "selection made" : "no selection"
                  })`}
              </div>
            );
          })}
          {publicRound.matchOver && (
            <div className="text-muted-foreground">
              Match over ({publicRound.completionReason ?? "?"}) — winner:{" "}
              {publicRound.winner ?? "draw"}
            </div>
          )}
        </div>
      )}

      {/* Private (owner only) — rendered as its own section, never merged. */}
      {owner && (
        <div className="rounded-md border bg-background/50 p-2 space-y-1 text-[11px] tabular-nums" data-testid="comp-private-section">
          <div className="font-semibold">
            Private owner {owner.ownerPlayerId} · round {owner.roundNumber}
          </div>
          <div className="text-muted-foreground">
            Answer: {owner.answerSubmitted ? "submitted" : "not submitted"} · window{" "}
            {owner.selectionPhase ?? "inactive"} · selected ability:{" "}
            {owner.selectedAbilityId ?? "none (no active ability)"}
          </div>
          <div className="text-muted-foreground">
            Unlocked: {owner.unlockedAbilityIds.join(", ") || "—"}
            {owner.lockedAbilityIds.length > 0 && ` · locked: ${owner.lockedAbilityIds.join(", ")}`}
          </div>
          <div className="text-muted-foreground">
            Level 2:{" "}
            {owner.level2ChoiceMade
              ? `made (${owner.level2Choice})`
              : `pending (${owner.level2Options.join(", ")})`}{" "}
            · Level 3: {owner.level3Unlocked ? (owner.level3FinalUnlockId ?? "unlocked") : "not yet"}
          </div>
          <div className="text-muted-foreground">
            Current charges:{" "}
            {Object.entries(owner.remainingCharges)
              .map(([id, n]) => `${id} ${n === null ? "—" : n}`)
              .join(" · ") || "—"}
          </div>
          <div className="text-muted-foreground">
            Carryover:{" "}
            {Object.entries(owner.pendingEffects)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "none"}{" "}
            · streak {owner.consecutiveCorrect}
            {owner.combatLabUnlockDeltaSeconds !== 0 &&
              ` · Combat Lab ${owner.combatLabUnlockDeltaSeconds > 0 ? "+" : ""}${owner.combatLabUnlockDeltaSeconds}s`}
          </div>
          <div className="text-muted-foreground">
            Shared deadline: {owner.sharedActiveDeadline ?? "no active round"} · next round shared:{" "}
            {owner.sharedNextRoundDurationSeconds}s
          </div>
        </div>
      )}

      {/* Resolved history — immutable, post-resolution facts only. */}
      {comp.lastResolvedRoundNumber !== null && (
        <div className="rounded-md border bg-background/50 p-2 space-y-1 text-[11px] tabular-nums" data-testid="comp-resolved-history">
          <div className="font-semibold">
            Resolved history (through round {comp.lastResolvedRoundNumber})
          </div>
          {Object.values(comp.resolvedRounds)
            .sort((a, b) => a.roundNumber - b.roundNumber)
            .map((r) => (
              <div key={r.roundNumber} className="text-muted-foreground break-words" data-testid={`comp-resolved-round-${r.roundNumber}`}>
                <span className="font-semibold">R{r.roundNumber}</span>{" "}
                {(["p1", "p2"] as PlayerId[])
                  .map((slot) => {
                    const p = r.players[slot];
                    return `${slot} ${p.outcome}${p.timedOut ? " (timed out)" : ""}${
                      p.answeredFirst ? " (first)" : ""
                    } dealt ${p.finalDamageDealt} took ${p.finalDamageReceived}${
                      p.shieldAbsorbed > 0 ? ` shield ${p.shieldAbsorbed}` : ""
                    }${p.incomingReduction > 0 ? ` reduced ${p.incomingReduction}` : ""} HP ${
                      p.hpBefore
                    }→${p.hpAfter} +${p.xpGained}xp (${p.totalXpAfter})${
                      p.leveledUp ? ` Lv${p.levelBefore}→${p.levelAfter}` : ""
                    }${p.chargeConsumed ? ` charge:${p.consumedAbilityId}` : ""}${
                      Object.keys(p.remainingChargesAfterRound).length > 0
                        ? ` snapshot[${Object.entries(p.remainingChargesAfterRound)
                            .map(([id, n]) => `${id} ${n === null ? "—" : n}`)
                            .join(", ")}]`
                        : ""
                    }${p.effectsGained.length > 0 ? ` gained:${p.effectsGained.join("+")}` : ""}${
                      p.effectsConsumed.length > 0 ? ` consumed:${p.effectsConsumed.join("+")}` : ""
                    }${
                      p.combatLabUnlockDeltaSeconds !== 0
                        ? ` lab:${p.combatLabUnlockDeltaSeconds}s`
                        : ""
                    }`;
                  })
                  .join(" · ")}{" "}
                · next shared {r.sharedNextRoundDurationSeconds}s
                {r.matchOver &&
                  ` · MATCH OVER (${r.completionReason ?? "?"}) winner ${r.winner ?? "draw"}`}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
