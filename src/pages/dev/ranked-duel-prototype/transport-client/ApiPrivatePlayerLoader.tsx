import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdaptedPrivatePlayer,
  adaptPrivatePlayer,
} from "@/lib/ranked-core/transport/adaptPrivatePlayer";
import { EnvelopeValidationError } from "@/lib/ranked-core/transport/rankedDuelEnvelopeValidation";
import { DEFAULT_RANKED_DUEL_API_BASE } from "./fetchResolvedRound";
import { PrivatePlayerFetchError, fetchPrivatePlayer } from "./fetchPrivatePlayer";

/**
 * DEV-ONLY read-only inspector for the private owning-player endpoint:
 *
 *   fetchPrivatePlayer (validated ranked_duel.private_player.v1 envelope,
 *                       owner verified against the requested player id)
 *   -> adaptPrivatePlayer(envelope, expectedOwnerId)
 *   -> owner-scoped inspector-local display state (below)
 *
 * Private data is INSPECTED only — never dispatched into duelMachine and
 * never merged with public or resolved projections. Only the owner's own
 * state is shown; the opponent's private state is structurally absent from
 * the backend projection. One shared timer; no submission controls.
 */
export function ApiPrivatePlayerLoader() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_RANKED_DUEL_API_BASE);
  const [matchId, setMatchId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<AdaptedPrivatePlayer | null>(null);

  // Newer requests invalidate older ones; unmount invalidates everything.
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const load = async () => {
    const requestedOwner = playerId.trim();
    const myGeneration = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const envelope = await fetchPrivatePlayer({
        baseUrl,
        matchId,
        playerId: requestedOwner,
        signal: controller.signal,
      });
      if (generation.current !== myGeneration) return; // stale — drop silently
      // Explicit owner scoping again at the adapter boundary.
      setOwner(adaptPrivatePlayer(envelope, requestedOwner));
    } catch (err) {
      if (generation.current !== myGeneration) return; // stale/unmounted
      if (err instanceof PrivatePlayerFetchError) {
        if (err.kind === "aborted") return; // superseded request owns the status
        setError(`${err.kind}${err.errorCode ? ` (${err.errorCode})` : ""}: ${err.message}`);
      } else if (err instanceof EnvelopeValidationError) {
        setError(err.message);
      } else {
        setError("Unexpected error while loading private player state.");
      }
      setOwner(null);
    } finally {
      if (generation.current === myGeneration) setLoading(false);
    }
  };

  const field = (
    label: string,
    testId: string,
    value: string,
    onChange: (v: string) => void,
    width = "w-28",
  ) => (
    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
      {label}
      <input
        data-testid={testId}
        className={`h-8 rounded-md border bg-background px-2 text-xs ${width} max-w-full`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
      />
    </label>
  );

  return (
    <div className="mt-3 border-t border-dashed border-amber-500/40 pt-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
          PRIVATE-PLAYER API (DEV, READ-ONLY)
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          GET /api/ranked-duels/&#123;match&#125;/rounds/current/private/&#123;player&#125; —
          owner-scoped inspection only; never fed into the duel reducer, no submissions.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {field("API base URL", "private-api-base-url", baseUrl, setBaseUrl, "w-52")}
        {field("Match ID", "private-api-match-id", matchId, setMatchId)}
        {field("Owning player id", "private-api-player-id", playerId, setPlayerId)}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="private-api-load"
          disabled={loading}
          onClick={load}
        >
          {loading ? "Loading…" : "Load private player state"}
        </Button>
      </div>
      {error && (
        <p data-testid="private-api-status" role="status" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {owner && !error && <PrivatePlayerSummary owner={owner} />}
    </div>
  );
}

/** Compact owner-only rendering. Only fields the backend actually projects —
 *  no opponent state, no damage audit, no correctness, no personal timers. */
function PrivatePlayerSummary({ owner }: { owner: AdaptedPrivatePlayer }) {
  const charges = Object.entries(owner.remainingCharges);
  const pending = Object.entries(owner.pendingEffects)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return (
    <div
      className="rounded-md border bg-background/50 p-2 space-y-1 text-[11px] tabular-nums"
      data-testid="private-player-summary"
    >
      <div className="font-semibold">
        Owner {owner.ownerPlayerId} · {owner.matchId} · round {owner.roundNumber}
      </div>
      <div className="text-muted-foreground">
        Answer: {owner.answerSubmitted ? "submitted" : "not submitted"} · ability window{" "}
        {owner.selectionPhase ?? "inactive"} · selected ability:{" "}
        {owner.selectedAbilityId ?? "none (no active ability)"}
      </div>
      <div className="text-muted-foreground">
        Unlocked: {owner.unlockedAbilityIds.join(", ") || "—"}
        {owner.lockedAbilityIds.length > 0 && ` · locked: ${owner.lockedAbilityIds.join(", ")}`}
      </div>
      <div className="text-muted-foreground">
        Level 2 choice:{" "}
        {owner.level2ChoiceMade
          ? `made (${owner.level2Choice})`
          : `pending (options: ${owner.level2Options.join(", ")})`}
        {" · Level 3 final unlock: "}
        {owner.level3Unlocked ? (owner.level3FinalUnlockId ?? "unlocked") : "not yet"}
      </div>
      <div className="text-muted-foreground">
        Remaining charges:{" "}
        {charges.length > 0
          ? charges.map(([id, n]) => `${id} ${n === null ? "—" : n}`).join(" · ")
          : "—"}
      </div>
      <div className="text-muted-foreground">
        Carryover: {pending.length > 0 ? pending.join(", ") : "none"} · streak{" "}
        {owner.consecutiveCorrect} correct
        {owner.combatLabUnlockDeltaSeconds !== 0 &&
          ` · Combat Lab unlock ${owner.combatLabUnlockDeltaSeconds > 0 ? "+" : ""}${owner.combatLabUnlockDeltaSeconds}s`}
      </div>
      <div className="text-muted-foreground">
        Shared deadline: {owner.sharedActiveDeadline ?? "no active round"} · next round shared
        timer: {owner.sharedNextRoundDurationSeconds}s
      </div>
    </div>
  );
}
