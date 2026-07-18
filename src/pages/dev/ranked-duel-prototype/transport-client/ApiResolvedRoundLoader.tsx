import { Dispatch, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DuelAction } from "../duelMachine";
import { adaptResolvedRoundEnvelope } from "@/lib/ranked-core/transport/adaptResolvedRoundEnvelope";
import { SettlementAdapterError } from "@/lib/ranked-core/backend/adaptBackendSettlement";
import { EnvelopeValidationError } from "@/lib/ranked-core/transport/rankedDuelEnvelopeValidation";
import {
  DEFAULT_RANKED_DUEL_API_BASE,
  ResolvedRoundFetchError,
  fetchResolvedRound,
} from "./fetchResolvedRound";

/**
 * DEV-ONLY loader: fetches one resolved round from the read endpoint and
 * dispatches it through the EXISTING pipeline —
 *
 *   fetchResolvedRound (validated envelope)
 *   -> adaptResolvedRoundEnvelope(envelope, {p1PlayerId, p2PlayerId})
 *   -> APPLY_BACKEND_SETTLEMENT
 *
 * Player identity is entered explicitly here; the HTTP client never decides
 * p1/p2. No retries, no polling, no fixture fallback on failure — errors
 * surface as a dev-facing status line. A request-generation counter plus
 * AbortController prevents stale or post-unmount dispatches.
 */
export function ApiResolvedRoundLoader({ dispatch }: { dispatch: Dispatch<DuelAction> }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_RANKED_DUEL_API_BASE);
  const [matchId, setMatchId] = useState("");
  const [roundNumber, setRoundNumber] = useState("1");
  const [p1PlayerId, setP1PlayerId] = useState("");
  const [p2PlayerId, setP2PlayerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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
    const round = Number(roundNumber);
    if (!p1PlayerId.trim() || !p2PlayerId.trim()) {
      setStatus({ tone: "error", text: "Both backend player ids (p1 and p2) are required." });
      return;
    }
    const myGeneration = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setStatus(null);
    try {
      const envelope = await fetchResolvedRound({
        baseUrl,
        matchId,
        roundNumber: round,
        signal: controller.signal,
      });
      if (generation.current !== myGeneration) return; // stale — drop silently
      // Explicit identity mapping happens HERE, outside the HTTP client.
      const adapted = adaptResolvedRoundEnvelope(envelope, {
        p1PlayerId: p1PlayerId.trim(),
        p2PlayerId: p2PlayerId.trim(),
      });
      dispatch({ type: "APPLY_BACKEND_SETTLEMENT", settlement: adapted });
      setStatus({
        tone: "ok",
        text: `Loaded ${envelope.match_id} round ${envelope.round_number} from the API.`,
      });
    } catch (err) {
      if (generation.current !== myGeneration) return; // stale/unmounted
      if (err instanceof ResolvedRoundFetchError) {
        if (err.kind === "aborted") return; // superseded — newer request owns the status
        setStatus({
          tone: "error",
          text: `${err.kind}${err.errorCode ? ` (${err.errorCode})` : ""}: ${err.message}`,
        });
      } else if (
        err instanceof SettlementAdapterError ||
        err instanceof EnvelopeValidationError
      ) {
        setStatus({ tone: "error", text: err.message });
      } else {
        // Dev-facing, but never a raw stack trace in the panel.
        setStatus({ tone: "error", text: "Unexpected error while loading the resolved round." });
      }
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
          RESOLVED-ROUND API (DEV)
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          GET /api/ranked-duels/&#123;match&#125;/rounds/&#123;n&#125;/resolved — same validation,
          adapter, and reducer action as the fixtures. No fallback on failure.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {field("API base URL", "api-base-url", baseUrl, setBaseUrl, "w-52")}
        {field("Match ID", "api-match-id", matchId, setMatchId)}
        {field("Round #", "api-round-number", roundNumber, setRoundNumber, "w-16")}
        {field("p1 backend player id", "api-p1-id", p1PlayerId, setP1PlayerId)}
        {field("p2 backend player id", "api-p2-id", p2PlayerId, setP2PlayerId)}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="api-load-resolved"
          disabled={loading}
          onClick={load}
        >
          {loading ? "Loading…" : "Load resolved round"}
        </Button>
      </div>
      {status && (
        <p
          data-testid="api-load-status"
          role="status"
          className={`text-[11px] ${status.tone === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
