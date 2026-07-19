/**
 * Live admin reviewer container (H1 / G7).
 *
 * A thin, read-only loader: it fetches the admin reviewer projection, parses it
 * through the G5 reviewer parser, and hands the parsed artifact + review record to
 * the prop-driven `MasteryReviewerInspector`. It performs NO mutations and adds no
 * formulas or ID generation. Route-level admin gating is enforced by `AdminRoute`;
 * this container additionally handles a backend 403/404/parse failure with retry.
 */
import { useCallback, useEffect, useState } from "react";

import type { MasteryReviewBundle } from "../contracts";
import { MasteryReviewerInspector } from "../reviewer";
import { getReviewerArtifact, isAborted, isForbidden, isNotFound, MasteryApiError } from "./api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; bundle: MasteryReviewBundle }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function MasteryReviewerLive({ artifactDigest }: { artifactDigest: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: "loading" });
    getReviewerArtifact(artifactDigest, signal)
      .then((bundle) => setState({ status: "ready", bundle }))
      .catch((e) => {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setState({ status: "forbidden" });
        if (isNotFound(e)) return setState({ status: "not_found" });
        setState({ status: "error", message: e instanceof MasteryApiError ? e.message : "failed to load artifact" });
      });
  }, [artifactDigest]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  if (state.status === "loading") {
    return <div data-testid="mastery-reviewer-loading" className="p-6 text-sm text-muted-foreground">Loading reviewer artifact…</div>;
  }
  if (state.status === "forbidden") {
    return <div data-testid="mastery-reviewer-forbidden" className="p-6 text-sm text-destructive">You are not authorized to view this artifact.</div>;
  }
  if (state.status === "not_found") {
    return <div data-testid="mastery-reviewer-notfound" className="p-6 text-sm text-muted-foreground">Artifact not found.</div>;
  }
  if (state.status === "error") {
    return (
      <div data-testid="mastery-reviewer-error" className="space-y-3 p-6 text-sm">
        <p className="text-destructive">Could not load the reviewer artifact: {state.message}</p>
        <button type="button" className="rounded-md bg-primary px-3 py-1 text-primary-foreground" onClick={() => load()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <MasteryReviewerInspector
      artifact={state.bundle.artifact}
      reviewRecord={state.bundle.reviewRecord}
    />
  );
}
