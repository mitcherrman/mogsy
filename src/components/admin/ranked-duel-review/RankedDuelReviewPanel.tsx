// ---------------------------------------------------------------------------
// Ranked Duel Review — frontend integration BOUNDARY.
//
// The backend HTTP endpoints for this workflow do not exist yet (the review
// logic is CLI-only; see src/lib/ranked-duel-review/CONTRACT.md). Per the
// workstream boundary this panel establishes the integration seam and shows an
// HONEST status — it never fabricates candidates, decisions, or export
// success, and it never writes review state from the browser.
//
// "Check backend availability" probes the real endpoint through the typed
// client. A 404/501 is reported as "not available yet" (the expected current
// state); a success path is wired for the day the endpoints ship.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Swords, PlugZap, Loader2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  rankedDuelReviewApi,
  RankedDuelReviewAuthError,
  RankedDuelReviewUnavailableError,
} from "@/lib/ranked-duel-review/api";
import type { RankedDuelReviewProgress } from "@/lib/ranked-duel-review/types";

type ProbeState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "unavailable"; status: number; message: string }
  | { kind: "auth"; message: string }
  | { kind: "error"; message: string }
  | { kind: "available"; progress: RankedDuelReviewProgress };

export function RankedDuelReviewPanel() {
  const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });

  const check = async () => {
    setProbe({ kind: "checking" });
    try {
      const progress = await rankedDuelReviewApi.progress();
      setProbe({ kind: "available", progress });
    } catch (err) {
      if (err instanceof RankedDuelReviewUnavailableError) {
        setProbe({ kind: "unavailable", status: err.status, message: err.message });
      } else if (err instanceof RankedDuelReviewAuthError) {
        setProbe({ kind: "auth", message: err.message });
      } else {
        setProbe({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6" data-testid="ranked-duel-review-panel">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          <Swords className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Ranked Duel candidate review</h2>
          <p className="text-sm text-muted-foreground">
            Review Ranked Duel source candidates, record accept / revise / reject decisions with
            evidence, monitor progress, and export the validated accepted bank
            (<code className="text-xs">reports/ranked_candidates_accepted.json</code>).
          </p>
        </div>
      </div>

      <div
        className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm"
        role="status"
        data-testid="ranked-duel-review-boundary"
      >
        <div className="flex flex-wrap items-center gap-2 font-medium text-amber-300">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Backend endpoints not shipped yet
          <span
            className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-semibold"
            data-testid="ranked-duel-review-blocker"
          >
            Current blocker: 0 / 30 accepted
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          The review logic exists in the backend as a CLI tool
          (<code className="text-[11px]">ranked_candidate_review/</code>), but its admin HTTP API
          has not been built. This tab is the frontend integration boundary: it will light up as
          soon as the endpoints in{" "}
          <code className="text-[11px]">src/lib/ranked-duel-review/CONTRACT.md</code> exist. No
          candidate data is shown until then, and no review state is ever written from the browser.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">Backend availability</p>
            <p className="text-xs text-muted-foreground">
              Probe <code className="text-[11px]">GET /api/admin/ranked-duel/review/progress</code>.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={check}
            disabled={probe.kind === "checking"}
            data-testid="ranked-duel-review-probe"
          >
            {probe.kind === "checking" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <PlugZap className="h-3.5 w-3.5" aria-hidden />
            )}
            Check backend availability
          </Button>
        </div>

        {probe.kind === "unavailable" && (
          <p
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
            data-testid="ranked-duel-review-status"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
            Not available yet (HTTP {probe.status}). This is expected until the endpoints ship.
          </p>
        )}
        {probe.kind === "auth" && (
          <p
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
            data-testid="ranked-duel-review-status"
          >
            <KeyRound className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
            {probe.message}
          </p>
        )}
        {probe.kind === "error" && (
          <p
            className="flex items-start gap-1.5 text-xs text-destructive"
            data-testid="ranked-duel-review-status"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {probe.message}
          </p>
        )}
        {probe.kind === "available" && (
          <div
            className="flex items-start gap-1.5 text-xs text-emerald-400"
            data-testid="ranked-duel-review-status"
          >
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Endpoints are live — {probe.progress.total} candidate(s). Full review UI can now be
              enabled.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
