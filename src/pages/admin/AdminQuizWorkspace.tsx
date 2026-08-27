// ---------------------------------------------------------------------------
// Admin Quiz Review — one quiz-quality control centre, two tabs.
//
//   * Quiz Review   review individual questions (quiz_questions + every
//                   provenance source, Ranked candidates included)
//   * Diagnostics   the health of the quiz system as a whole, from the
//                   read-only backend audit harness
//
// Two admin surfaces were RETIRED — deleted, not hidden:
//   * Quiz Builder. Questions are authored through code/AI work now. The page,
//     its nine components, its pure logic module and its whole draft/promotion
//     API client are gone; the backend builder routes and services went with
//     them. Nothing was stranded: the drafts table was empty and no question in
//     the bank carries builder provenance. /admin/quiz-builder redirects here.
//   * Ranked Duel Review. Redundant as a separate workflow. Ranked questions
//     are reviewed here through the source/family/type filters and the "All
//     sources" view, and the one capability worth keeping — seeing a question
//     as a player does — was extracted to the neutral
//     `components/question-preview/QuestionPreviewPanel`, which Quiz Review now
//     hosts inline on Ranked candidate rows. Its accept/reject/revise client
//     was deleted with the workflow it belonged to; only the GET-only
//     `lib/question-preview/questionPreviewApi` survives.
//
// The shell owns the shared chrome: SEOHead, breadcrumb, ONE admin gate, and
// the tab navigation. Each tab renders in `embedded` mode so there is exactly
// one header and one gate.
//
// State lives in the URL (`?tab=`, `?questionId=`, and the diagnostic filter
// params) so a Diagnostics deep link, a bookmark, and browser Back/Forward all
// restore the same view.
// ---------------------------------------------------------------------------

import { Suspense, lazy, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, ListChecks, Stethoscope, ExternalLink } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { QuizDiagnosticsPanel } from "@/components/admin/quiz-diagnostics/QuizDiagnosticsPanel";
import type { ReviewFilters } from "@/lib/quiz/api";

const AdminQuizReview = lazy(() => import("./AdminQuizReview"));

export const WORKSPACE_TABS = ["review", "diagnostics"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
const DEFAULT_TAB: WorkspaceTab = "review";

const isWorkspaceTab = (value: string | null): value is WorkspaceTab =>
  value != null && (WORKSPACE_TABS as readonly string[]).includes(value);

const TAB_META: Record<WorkspaceTab, { label: string; icon: typeof ListChecks }> = {
  review: { label: "Quiz Review", icon: ListChecks },
  diagnostics: { label: "Diagnostics", icon: Stethoscope },
};

/** URL params that carry a diagnostic focus into Quiz Review. */
const FOCUS_PARAMS = ["ids", "family", "focusSearch", "focusLabel"] as const;

/**
 * Read the diagnostic focus out of the URL.
 *
 * `ids` is present-but-empty when a finding matched nothing in this database.
 * That is a real selection meaning "no rows", so presence — not truthiness —
 * decides whether the filter applies; treating `""` as absent would silently
 * show the entire bank instead of the empty result the operator asked for.
 */
function readFocus(params: URLSearchParams): { filters: ReviewFilters; label: string } | null {
  const rawIds = params.get("ids");
  const family = params.get("family");
  const search = params.get("focusSearch");
  if (rawIds == null && !family && !search) return null;

  const filters: ReviewFilters = { page: 1 };
  if (rawIds != null) {
    filters.ids = rawIds
      .split(",")
      .map((token) => Number(token.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  if (family) filters.family = family;
  if (search) filters.search = search;
  return { filters, label: params.get("focusLabel") ?? "diagnostic selection" };
}

export default function AdminQuizWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<WorkspaceTab>(() => {
    const raw = searchParams.get("tab");
    return isWorkspaceTab(raw) ? raw : DEFAULT_TAB;
  }, [searchParams]);

  // Deep-linked Review question (?questionId=<id>). Identity is by ID only.
  const questionId = useMemo<number | null>(() => {
    const raw = searchParams.get("questionId");
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [searchParams]);

  const focus = useMemo(() => readFocus(searchParams), [searchParams]);

  const setActiveTab = (tab: string) => {
    if (!isWorkspaceTab(tab)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    // Leaving Review drops ITS selection so the param can't go stale.
    if (tab !== "review") {
      next.delete("questionId");
      FOCUS_PARAMS.forEach((key) => next.delete(key));
    }
    // replace: switching tabs shouldn't stack browser history entries.
    setSearchParams(next, { replace: true });
  };

  // Selection lives in the URL so browser Back/Forward restores the open
  // question. Pushed (not replaced) so each selection is its own history entry.
  const setQuestionId = (id: number | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "review");
    if (id == null) next.delete("questionId");
    else next.set("questionId", String(id));
    setSearchParams(next);
  };

  /**
   * Diagnostics → Quiz Review. The switch and the filter are ONE navigation:
   * the tab and the focus are written together so Back returns to Diagnostics
   * rather than to Quiz Review holding a filter the operator never chose.
   */
  const openInReview = useCallback(
    (filters: ReviewFilters, label: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "review");
      next.delete("questionId");
      FOCUS_PARAMS.forEach((key) => next.delete(key));
      if (filters.ids !== undefined) next.set("ids", filters.ids.join(","));
      if (filters.family) next.set("family", filters.family);
      if (filters.search) next.set("focusSearch", filters.search);
      next.set("focusLabel", label);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const clearFocus = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    FOCUS_PARAMS.forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <SEOHead
        title="Admin Quiz Review"
        description="Review quiz questions and the health of the quiz system in one place."
        path="/admin/quiz-content"
        noindex
      />

      {/* Shared shell header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-sm font-semibold">Admin Quiz Review</h1>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
          <Link to="/admin/quiz-broadcast">
            <ExternalLink className="h-3 w-3" /> Broadcast Studio
          </Link>
        </Button>
      </div>

      <AdminAuthGate>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-4 mt-2 w-fit shrink-0 flex-wrap">
            {WORKSPACE_TABS.map((tab) => {
              const { label, icon: Icon } = TAB_META[tab];
              return (
                <TabsTrigger key={tab} value={tab} className="gap-1.5 text-xs">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Review — every question, every provenance source, Ranked included.
              Selection and diagnostic focus are both URL-controlled. */}
          <TabsContent value="review" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<TabLoading label="Loading Quiz Review" />}>
              <AdminQuizReview
                embedded
                selectedQuestionId={questionId}
                onSelectQuestion={setQuestionId}
                focusFilters={focus?.filters}
                focusLabel={focus?.label}
                onClearFocus={clearFocus}
              />
            </Suspense>
          </TabsContent>

          {/* Diagnostics — the read-only audit harness, rendered as
              destinations rather than as a report. */}
          <TabsContent value="diagnostics" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <QuizDiagnosticsPanel onOpenInReview={openInReview} />
          </TabsContent>
        </Tabs>
      </AdminAuthGate>
    </div>
  );
}

function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={label} />
    </div>
  );
}
