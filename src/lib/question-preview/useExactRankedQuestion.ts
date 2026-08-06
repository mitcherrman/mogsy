/**
 * Exact-question loader for the admin candidate preview (RA9).
 *
 * Loads ONE candidate's public-question projection from the Ranked candidate
 * review admin API and adapts it for `InteractiveScenarioSurface`.
 *
 * Side-effect boundary — this hook is the whole network surface of the preview:
 *  * it calls exactly one endpoint, `.../candidates/{id}/public-view`, a
 *    read-only admin GET;
 *  * it never touches `/api/ranked/matches/*`, so no match is created, no
 *    answer submitted, no ability written, no presence heartbeat sent, no
 *    result fetched, no ELO calculated, and no score persisted;
 *  * it imports no Ranked match/queue controller and no ranked-public client.
 *
 * Switching candidates aborts the in-flight request AND ignores its result by
 * generation counter, so a slow response for a candidate the operator already
 * navigated away from can never paint over the current one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeReviewError,
  rankedReviewApi,
  ReviewApiError,
} from "@/lib/ranked-duel-review/api";
import {
  adaptCandidatePreview,
  PreviewAdapterError,
  type RankedPreviewModel,
} from "./rankedPreviewAdapter";

export type PreviewLoadState = "idle" | "loading" | "ready" | "error";

export interface ExactRankedQuestion {
  status: PreviewLoadState;
  model: RankedPreviewModel | null;
  error: string | null;
  /** True when the candidate itself is gone (404) rather than a transport fault. */
  notFound: boolean;
  reload: () => void;
}

export function useExactRankedQuestion(
  candidateId: string | null,
): ExactRankedQuestion {
  const [status, setStatus] = useState<PreviewLoadState>("idle");
  const [model, setModel] = useState<RankedPreviewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const gen = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!candidateId) {
      gen.current += 1; // orphan any in-flight response
      setStatus("idle");
      setModel(null);
      setError(null);
      setNotFound(false);
      return;
    }

    const myGen = ++gen.current;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setNotFound(false);

    rankedReviewApi
      .candidatePublicView(candidateId, controller.signal)
      .then((payload) => {
        if (myGen !== gen.current) return;
        setModel(adaptCandidatePreview(payload));
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (myGen !== gen.current) return;
        if (err instanceof ReviewApiError && err.kind === "aborted") return;
        setModel(null);
        setNotFound(err instanceof ReviewApiError && err.kind === "not_found");
        setError(
          err instanceof PreviewAdapterError
            ? err.message
            : describeReviewError(err),
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [candidateId, nonce]);

  return { status, model, error, notFound, reload };
}
