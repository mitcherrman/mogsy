// ---------------------------------------------------------------------------
// Unified admin quiz-content workspace.
//
// One operational home that hosts the previously separate admin surfaces as
// tabs, WITHOUT merging their data models:
//   * Quiz Builder   (quiz_builder_drafts → promotion)
//   * Quiz Review    (quiz_questions review/curation)
//   * Ranked Duel Review (source candidates + human decisions +
//                         reports/ranked_candidates_accepted.json)
//
// The shell owns the shared chrome: SEOHead, breadcrumb, ONE admin-key gate
// (shared KNOWLEDGE_ADMIN_KEY session store), and the tab navigation. Each tab
// renders its existing experience in `embedded` mode so there is exactly one
// header and one gate. Storage models remain fully separate — only the
// interface and workflow are unified.
//
// The active tab is mirrored in the `?tab=` query param so the legacy
// /admin/quiz-builder and /admin/quiz-review routes can redirect here and land
// on the right tab (bookmarks preserved).
// ---------------------------------------------------------------------------

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2, Hammer, ListChecks, Swords, ExternalLink } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminKey, setAdminKey, subscribeAdminKey } from "@/lib/knowledge-admin/key";
import { RankedDuelReviewPanel } from "@/components/admin/ranked-duel-review/RankedDuelReviewPanel";

const QuizBuilderPro = lazy(() => import("./QuizBuilderPro"));
const AdminQuizReview = lazy(() => import("./AdminQuizReview"));

const WORKSPACE_TABS = ["builder", "review", "ranked-duel"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
const DEFAULT_TAB: WorkspaceTab = "builder";

const isWorkspaceTab = (value: string | null): value is WorkspaceTab =>
  value != null && (WORKSPACE_TABS as readonly string[]).includes(value);

function useAdminKey(): string | null {
  const [key, setKey] = useState<string | null>(getAdminKey);
  useEffect(() => subscribeAdminKey(() => setKey(getAdminKey())), []);
  return key;
}

function AdminKeyGate() {
  const [value, setValue] = useState("");
  const save = () => {
    const v = value.trim();
    if (v) setAdminKey(v);
  };
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold">Admin key required</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Enter the X-Admin-Key (KNOWLEDGE_ADMIN_KEY) to open the workspace. Stored for this
          browser session only, and shared across Quiz Builder, Quiz Review, and Knowledge Admin.
        </p>
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="X-Admin-Key"
          aria-label="Admin key"
        />
        <Button size="sm" className="w-full" onClick={save} disabled={!value.trim()}>
          Unlock workspace
        </Button>
      </div>
    </div>
  );
}

const TAB_META: Record<WorkspaceTab, { label: string; icon: typeof Hammer }> = {
  builder: { label: "Quiz Builder", icon: Hammer },
  review: { label: "Quiz Review", icon: ListChecks },
  "ranked-duel": { label: "Ranked Duel Review", icon: Swords },
};

export default function AdminQuizWorkspace() {
  const adminKey = useAdminKey();
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

  const setActiveTab = (tab: string) => {
    if (!isWorkspaceTab(tab)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    // Leaving Review drops the question selection so the param can't go stale.
    if (tab !== "review") next.delete("questionId");
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <SEOHead
        title="Quiz Content Workspace · Admin"
        description="Unified admin workspace for building, reviewing, and curating quiz and Ranked Duel content."
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
          <h1 className="text-sm font-semibold">Quiz Content Workspace</h1>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
          <Link to="/admin/quiz-broadcast">
            <ExternalLink className="h-3 w-3" /> Broadcast Studio
          </Link>
        </Button>
      </div>

      {!adminKey ? (
        <AdminKeyGate />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
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

          {/* Builder — keeps quiz_builder_drafts + promotion lifecycle intact. */}
          <TabsContent value="builder" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<TabLoading label="Loading Quiz Builder" />}>
              <QuizBuilderPro embedded />
            </Suspense>
          </TabsContent>

          {/* Review — keeps quiz_questions review/curation lifecycle intact.
              Selection is URL-controlled so Builder deep links and Back/Forward
              drive the open question by ID. */}
          <TabsContent value="review" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<TabLoading label="Loading Quiz Review" />}>
              <AdminQuizReview
                embedded
                selectedQuestionId={questionId}
                onSelectQuestion={setQuestionId}
              />
            </Suspense>
          </TabsContent>

          {/* Ranked Duel — separate candidate/decision model; boundary only. */}
          <TabsContent value="ranked-duel" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <RankedDuelReviewPanel />
          </TabsContent>
        </Tabs>
      )}
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
