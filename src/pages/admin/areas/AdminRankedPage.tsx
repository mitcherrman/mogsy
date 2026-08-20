// ---------------------------------------------------------------------------
// Ranked — the first administrative home Ranked has ever had.
//
// Of thirteen Ranked admin capabilities, exactly one was discoverable before
// this page: candidate review, as a tab inside a quiz workspace. Three existed
// only as backend endpoints, one on an ungated /dev URL, and two only as
// Railway environment variables. Queue contents and individual matches could
// not be inspected at all.
//
// This page reads the two endpoints that already summarize the live system and
// states the remaining gaps as gaps. It writes nothing.
//
// EXISTING FUNCTIONALITY is rendered from live data. FUTURE GAP entries are
// labelled as gaps and are never faked with a placeholder number.
//
// AUTHORIZATION: unchanged. Reads go through the same buildAdminHeaders() path
// every other admin client uses and the same backend require_admin. Normal
// Ranked PvP and Ranked Bot player access is not touched by anything here, and
// no allowlist or cohort restriction is introduced.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import {
  AdminAreaHeader,
  AdminCrossLink,
  AdminPanel,
  AdminToolGrid,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import {
  AdminOpsError,
  fetchLaunchReadiness,
  fetchRatingStatus,
  verdictLabel,
  type LaunchReadiness,
  type RatingStatus,
} from "@/lib/admin/adminOpsApi";
import { ADMIN_AREAS_BY_ID, toolsForSection } from "@/lib/admin/admin-registry";
import { cn } from "@/lib/utils";

type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string };

function useAdminRead<T>(load: () => Promise<T>, nonce: number): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setResult({ state: "loading" });
    void load()
      .then((data) => !cancelled && setResult({ state: "ok", data }))
      .catch((err: unknown) =>
        !cancelled &&
        setResult({
          state: "error",
          message: err instanceof AdminOpsError ? err.message : "Unexpected error.",
        }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  return result;
}

function CheckIcon({ status }: { status: "ok" | "warn" | "blocked" }) {
  if (status === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
  if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-300" aria-hidden />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />;
}

function ReadState({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
      {message}
    </p>
  );
}

function LaunchReadinessPanel({ nonce, onRefresh }: { nonce: number; onRefresh: () => void }) {
  const readiness = useAdminRead<LaunchReadiness>(fetchLaunchReadiness, nonce);

  return (
    <AdminPanel
      title="Launch readiness"
      description="Every gate the public Ranked entry path actually evaluates, read from the running process. GET /api/ranked/launch-readiness — read-only."
      testId="ranked-launch-readiness"
      action={
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
        </Button>
      }
    >
      {readiness.state === "loading" && <ReadState message="Reading launch readiness…" />}
      {readiness.state === "error" && <ReadState message={readiness.message} />}
      {readiness.state === "ok" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="ranked-verdict"
              className={cn(
                "rounded px-2 py-0.5 text-xs font-semibold",
                readiness.data.verdict === "ready"
                  ? "bg-emerald-400/10 text-emerald-300"
                  : readiness.data.verdict === "ready_with_restrictions"
                    ? "bg-amber-400/10 text-amber-300"
                    : "bg-destructive/10 text-destructive",
              )}
            >
              {verdictLabel(readiness.data.verdict)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              server time {readiness.data.server_time}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {Object.entries(readiness.data.checks).map(([name, check]) => (
              <li key={name} className="flex items-start gap-2 py-1.5">
                <span className="mt-0.5">
                  <CheckIcon status={check.status} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{name.replace(/_/g, " ")}</p>
                  <p className="break-words text-[11px] text-muted-foreground">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            The flag state above is the live Railway configuration. It is reported here read-only —
            editing it from Admin would create a fourth configuration authority.
          </p>
        </div>
      )}
    </AdminPanel>
  );
}

function RatingStatusPanel({ nonce }: { nonce: number }) {
  const rating = useAdminRead<RatingStatus>(fetchRatingStatus, nonce);
  return (
    <AdminPanel
      title="Rating status"
      description="Result counts by status and the active rating policy. GET /api/ranked/rating-status — read-only, no player identities."
      testId="ranked-rating-status"
    >
      {rating.state === "loading" && <ReadState message="Reading rating status…" />}
      {rating.state === "error" && <ReadState message={rating.message} />}
      {rating.state === "ok" && (
        <div className="space-y-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              policy <strong>{rating.data.policy_version}</strong>
            </span>
            <span>rating {rating.data.rating_enabled ? "enabled" : "disabled"}</span>
            <span>forfeits {rating.data.rate_forfeits ? "rated" : "skipped"}</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(rating.data.results_by_status).map(([status, count]) => (
              <li
                key={status}
                className="rounded border border-border px-2 py-0.5 tabular-nums"
                data-testid={`ranked-rating-${status}`}
              >
                {status}: <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminPanel>
  );
}

export default function AdminRankedPage() {
  const area = ADMIN_AREAS_BY_ID.ranked;
  const [section, setSection] = useAreaSection(area);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  return (
    <div data-testid="admin-area-ranked">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      <AdminAuthGate>
        <div className="space-y-4">
          {section.id === "overview" && (
            <>
              <LaunchReadinessPanel nonce={nonce} onRefresh={refresh} />
              <AdminToolGrid tools={toolsForSection("ranked", "overview")} />
            </>
          )}

          {section.id === "question-bank" && (
            <>
              <AdminPanel
                title="Ranked Duel candidates"
                description="Candidate review lives in the unified quiz workspace and stays there — splitting Builder from Review would undo a deliberate consolidation that works."
              >
                <AdminCrossLink
                  to="/admin/quiz-content?tab=ranked-duel"
                  label="Open Ranked Duel Review"
                  note="accept · reject · revise · validate · export"
                />
              </AdminPanel>
              <AdminToolGrid tools={toolsForSection("ranked", "question-bank")} />
            </>
          )}

          {section.id === "matches" && (
            <>
              <AdminPanel
                title="Existing functionality"
                description="What an operator can drive today. The staff duel creator keeps its current route and its current credential model — relocating the route would change who can reach it, which is out of scope here."
              >
                <AdminCrossLink
                  to="/dev/ranked-duel"
                  label="Staff duel creator"
                  note="creates real ranked matches; the page's admin-key field is the only gate on that route"
                />
              </AdminPanel>
              <AdminToolGrid tools={toolsForSection("ranked", "matches")} />
            </>
          )}

          {section.id === "playtests" && (
            <>
              <AdminPanel
                title="Playtests"
                description="The home exists; the system does not yet. Everything below is either an existing primitive a playtest would build on, or a named gap."
                testId="ranked-playtests"
              >
                <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Existing primitives.</strong> Cohort
                    invitation via{" "}
                    <AdminCrossLink to="/admin/people?section=roles-access" label="People › Roles & Access" />
                    ; controlled matchmaking via POST /api/ranked/test-matches with its
                    experiment_arm; bot testing via the existing player-authenticated bot-match
                    endpoint; readiness via launch-readiness; telemetry via rating-status; feedback
                    via{" "}
                    <AdminCrossLink to="/admin/people?section=feedback" label="People › Feedback" />,
                    tagged rather than becoming a fourth report queue; and session lifecycle
                    vocabulary modelled on{" "}
                    <AdminCrossLink to="/admin/simulation?section=battles" label="Simulation › Combat Battles" />.
                  </p>
                  <p>
                    <strong className="text-foreground">Future gaps.</strong> Explicit playtest
                    creation, enable/disable, tester enrollment, per-session telemetry and session
                    inspection do not exist. Session inspection shares the match-inspector gap under
                    Matches & Testing — building that inspector once serves both.
                  </p>
                  <p>
                    <strong className="text-foreground">Not introduced.</strong> No allowlist and no
                    cohort restriction is applied to normal Ranked PvP or Ranked Bot. Ranked
                    tutorial and onboarding are out of scope and untouched.
                  </p>
                </div>
              </AdminPanel>
              <AdminToolGrid tools={toolsForSection("ranked", "playtests")} />
            </>
          )}

          {section.id === "settings" && (
            <>
              <RatingStatusPanel nonce={nonce} />
              <AdminToolGrid tools={toolsForSection("ranked", "settings")} />
            </>
          )}
        </div>
      </AdminAuthGate>
    </div>
  );
}
