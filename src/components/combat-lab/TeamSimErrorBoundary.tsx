/**
 * SIM2 Phase 5A: the route-level error boundary for the team simulator.
 *
 * Why the team-sim route needs one and most routes do not
 * ──────────────────────────────────────────────────────
 * React unmounts the entire tree from the root when a render throws and no
 * boundary catches it. This application has no root boundary — the two that
 * exist (AdSlot, BroadcastKnowledgeCore) are local to their own widgets — so
 * before this file, a single bad field in a simulation response could blank
 * the whole app, navbar included. On a free page that is an annoying reload.
 * Here it lands on a page where the user may have just SPENT a credit, and the
 * white screen would take the recovery controls with it, leaving them with no
 * route back to the result they paid for.
 *
 * What the fallback deliberately does NOT do
 * ──────────────────────────────────────────
 * Nothing automatic, and no claims:
 *
 *   - it does not re-run the simulation. A crash while RENDERING a response
 *     says nothing about whether the request was charged, and an automatic
 *     re-run would be a second billable POST the user never asked for.
 *   - it does not send a recovery POST, or a discovery GET, or mount anything
 *     that would. Recovery is reachable from the reload link, one deliberate
 *     click away, exactly as it is everywhere else in this feature.
 *   - it makes no claim about credits. It cannot know: the crash happened in
 *     this browser, after whatever the server did.
 *   - it does not reset itself on a timer or re-render. A boundary that
 *     retries on its own turns a deterministic crash into a render loop.
 *
 * The one recovery action is a link to Combat Lab, which is an ordinary
 * navigation, and a reload link that re-enters this same route. Both are
 * explicit user gestures.
 *
 * Why this lives in components/ and is imported EAGERLY
 * ─────────────────────────────────────────────────────
 * It wraps the `<Suspense>` that resolves the page's lazy chunk, not merely
 * the page inside it. A boundary shipped INSIDE that chunk could not catch the
 * chunk failing to load — the exact failure a user on a flaky connection or a
 * stale deploy hits — so it has to be in the main bundle. That costs almost
 * nothing: it pulls in Button, Card and Link, all of which every route already
 * loads.
 *
 * How that composes with src/lib/chunk-recovery.ts
 * ────────────────────────────────────────────────
 * The application already installs a global handler that answers a chunk-load
 * failure with ONE full reload per path, rate-limited to once a minute. That
 * is the right first move for the common cause — a deploy invalidated the
 * chunk, and the reload picks up the new bundle — and it runs before this
 * boundary ever renders.
 *
 * This boundary is the second line, and it is reached exactly when that reload
 * has already been spent and the chunk STILL will not load. Verified in the
 * browser rather than assumed: with the reload budget consumed and the dev
 * server stopped, navigating here renders this fallback inside the intact app
 * shell — navbar and footer still present — instead of the blank page the same
 * sequence produced before this file existed.
 *
 * Diagnostics
 * ───────────
 * The error's message and component stack are shown only under
 * `import.meta.env.DEV`. Vite replaces that with the literal `false` in a
 * production build, so the branch and the strings it reads are removed by
 * dead-code elimination rather than merely hidden. In production the copy is
 * fixed, mentions no internals, and is safe for any user to read.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COMBAT_LAB_ROUTE } from "@/lib/combat-lab/team-sim/featureGate";

type Props = {
  children: ReactNode;
  /** Test seam: observe a caught error without reading the console. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null; componentStack: string | null };

export class TeamSimErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Stored in state rather than logged eagerly, so the production build
    // neither renders it nor keeps a second copy of it anywhere.
    this.setState({ componentStack: info.componentStack ?? null });
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-4 sm:px-4"
        data-testid="team-sim-error-boundary"
      >
        <Card className="space-y-3 border-destructive/50 p-6" role="alert">
          <h1 className="text-lg font-bold text-destructive">
            The team simulator could not be displayed
          </h1>
          <p className="text-sm">
            Something went wrong while rendering this page. The rest of Mogzy is
            unaffected.
          </p>
          {/* The honest statement, and the whole reason this fallback exists.
              A rendering crash is a CLIENT event: it carries no information
              about what the server did with a request that may already have
              been sent, so the copy neither reassures nor alarms — it points
              at the surface that can actually answer. */}
          <p className="text-sm text-muted-foreground">
            If you had just run a simulation, this page cannot tell you whether
            it completed. Nothing has been re-sent and nothing has been retried.
            Reload the simulator to see any recent simulations you can still
            recover — recovering one returns a result that was already paid for
            and never runs a new simulation.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* A full document load, not a state reset: the crash may have
                left this route's React tree in the state that produced it, and
                re-mounting the same components with the same props would
                simply throw again. */}
            <Button
              type="button"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload the simulator
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={COMBAT_LAB_ROUTE}>← Back to Combat Lab</Link>
            </Button>
          </div>

          {import.meta.env.DEV ? (
            <details
              className="rounded border border-border/60 bg-muted/40 p-2"
              data-testid="team-sim-error-detail"
            >
              <summary className="cursor-pointer text-xs font-semibold">
                Developer detail (development builds only)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                {this.state.error.message}
                {this.state.componentStack ?? ""}
              </pre>
            </details>
          ) : null}
        </Card>
      </main>
    );
  }
}

export default TeamSimErrorBoundary;
