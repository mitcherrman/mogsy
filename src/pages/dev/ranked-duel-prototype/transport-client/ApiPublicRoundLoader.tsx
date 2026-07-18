import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdaptedPublicRound,
  adaptPublicRound,
} from "@/lib/ranked-core/transport/adaptPublicRound";
import { EnvelopeValidationError } from "@/lib/ranked-core/transport/rankedDuelEnvelopeValidation";
import { DEFAULT_RANKED_DUEL_API_BASE } from "./fetchResolvedRound";
import { PublicRoundFetchError, fetchPublicRound } from "./fetchPublicRound";
import { PlayerId } from "../fixtures";

/**
 * DEV-ONLY read-only inspector for the public current-round endpoint:
 *
 *   fetchPublicRound (validated ranked_duel.public_round.v1 envelope)
 *   -> adaptPublicRound(envelope, {p1PlayerId, p2PlayerId})
 *   -> local read-only display state (below)
 *
 * The public projection is INSPECTED only — it is never dispatched into the
 * duel reducer (APPLY_BACKEND_SETTLEMENT stays reserved for resolved
 * settlements) and never replaces prototype state. Explicit id mapping;
 * one shared timer displayed verbatim; no countdown is computed locally.
 */
export function ApiPublicRoundLoader() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_RANKED_DUEL_API_BASE);
  const [matchId, setMatchId] = useState("");
  const [p1PlayerId, setP1PlayerId] = useState("");
  const [p2PlayerId, setP2PlayerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicRound, setPublicRound] = useState<AdaptedPublicRound | null>(null);

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
    if (!p1PlayerId.trim() || !p2PlayerId.trim()) {
      setError("Both backend player ids (p1 and p2) are required.");
      return;
    }
    const myGeneration = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const envelope = await fetchPublicRound({
        baseUrl,
        matchId,
        signal: controller.signal,
      });
      if (generation.current !== myGeneration) return; // stale — drop silently
      // Explicit identity mapping happens HERE, outside the HTTP client.
      const adapted = adaptPublicRound(envelope, {
        p1PlayerId: p1PlayerId.trim(),
        p2PlayerId: p2PlayerId.trim(),
      });
      setPublicRound(adapted);
    } catch (err) {
      if (generation.current !== myGeneration) return; // stale/unmounted
      if (err instanceof PublicRoundFetchError) {
        if (err.kind === "aborted") return; // superseded request owns the status
        setError(`${err.kind}${err.errorCode ? ` (${err.errorCode})` : ""}: ${err.message}`);
      } else if (err instanceof EnvelopeValidationError) {
        setError(err.message);
      } else {
        setError("Unexpected error while loading the public round.");
      }
      setPublicRound(null);
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
          PUBLIC-ROUND API (DEV, READ-ONLY)
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          GET /api/ranked-duels/&#123;match&#125;/rounds/current/public — inspect only; never fed
          into the duel reducer.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {field("API base URL", "public-api-base-url", baseUrl, setBaseUrl, "w-52")}
        {field("Match ID", "public-api-match-id", matchId, setMatchId)}
        {field("p1 backend player id", "public-api-p1-id", p1PlayerId, setP1PlayerId)}
        {field("p2 backend player id", "public-api-p2-id", p2PlayerId, setP2PlayerId)}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="public-api-load"
          disabled={loading}
          onClick={load}
        >
          {loading ? "Loading…" : "Load public round"}
        </Button>
      </div>
      {error && (
        <p data-testid="public-api-status" role="status" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {publicRound && !error && <PublicRoundSummary round={publicRound} />}
    </div>
  );
}

/** Compact read-only rendering of the adapted public projection. Only fields
 *  that actually exist on AdaptedPublicRound — nothing hidden is invented. */
function PublicRoundSummary({ round }: { round: AdaptedPublicRound }) {
  return (
    <div
      className="rounded-md border bg-background/50 p-2 space-y-1 text-[11px] tabular-nums"
      data-testid="public-round-summary"
    >
      <div className="font-semibold">
        {round.matchId} · {round.matchStatus} · round {round.roundNumber} ·{" "}
        {round.completedRounds} completed
      </div>
      {round.activeRound ? (
        <div className="text-muted-foreground">
          Shared round timer: {round.activeRound.durationSeconds}s · deadline{" "}
          {round.activeRound.activeDeadline}
          {round.activeRound.pressureApplied && " · pressure-shortened"}
          {round.activeRound.readyToResolve && " · ready to resolve"}
        </div>
      ) : (
        <div className="text-muted-foreground">No active round.</div>
      )}
      {(["p1", "p2"] as PlayerId[]).map((slot) => {
        const p = round.players[slot];
        return (
          <div key={slot} className="text-muted-foreground">
            <span className="font-semibold">{slot}</span> {p.playerId} ({p.classId}) · HP {p.hp} ·{" "}
            {p.totalXp} xp · Lv {p.level} · {p.hasSubmitted ? "submitted" : "thinking"}
            {p.abilitySelectionPhase !== null &&
              ` · ability window ${p.abilitySelectionPhase} (${
                p.hasAbilitySelected ? "selection made" : "no selection"
              })`}
          </div>
        );
      })}
      <div className="text-muted-foreground">
        Next round shared timer: {round.sharedNextRoundDurationSeconds}s
        {round.matchOver &&
          ` · match over (${round.completionReason ?? "?"}) — winner: ${round.winner ?? "draw"}`}
      </div>
    </div>
  );
}
