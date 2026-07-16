import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  KeyRound, ArrowLeft, ListChecks, Loader2, AlertTriangle, Send, ExternalLink, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import SEOHead from "@/components/SEOHead";
import { getAdminKey, setAdminKey, subscribeAdminKey } from "@/lib/knowledge-admin/key";
import {
  quizApi,
  QuizAdminAuthError,
  type QuizBuilderCandidate,
  type QuizBuilderDraft,
  type QuizBuilderPromotionResponse,
} from "@/lib/quiz/api";
import { QuizBuilderControls, type GenerateFormState } from "@/components/admin/quiz-builder/QuizBuilderControls";
import { QuizCandidateCard } from "@/components/admin/quiz-builder/QuizCandidateCard";
import { QuizCandidateEditor } from "@/components/admin/quiz-builder/QuizCandidateEditor";
import { QuizDraftList } from "@/components/admin/quiz-builder/QuizDraftList";
import {
  pickGenerateDefaults,
  buildDraftCreatePayload,
  buildProSourceUpdate,
  candidateToEditable,
  proSourceFromMetadata,
  validateEditableQuestion,
  builderErrorMessage,
  isUnsafePromotion,
  reviewQuestionLink,
  WORKSPACE_REVIEW_ROUTE,
  type EditableQuestion,
} from "@/lib/quiz-builder/logic";

// The reviewer now lives as a tab inside the unified workspace. The general
// link opens the Review tab; the promotion result deep-links to the exact
// promoted question by ID (identity by ID, never by matching text). Both are
// pure, unit-tested helpers in quiz-builder/logic.
const REVIEWER_ROUTE = WORKSPACE_REVIEW_ROUTE;

// ---------------------------------------------------------------------------
// Admin key (shared session store with the reviewer / Knowledge Admin).
// ---------------------------------------------------------------------------
function useAdminKey(): string | null {
  const [key, setKey] = useState<string | null>(getAdminKey);
  useEffect(() => subscribeAdminKey(() => setKey(getAdminKey())), []);
  return key;
}

function AdminKeyPanel({ invalid }: { invalid: boolean }) {
  const [value, setValue] = useState("");
  const save = () => { const v = value.trim(); if (v) setAdminKey(v); };
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold">{invalid ? "Admin key invalid" : "Admin key required"}</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {invalid
            ? "The saved admin key was rejected. Enter the current X-Admin-Key to continue."
            : "Enter the X-Admin-Key (KNOWLEDGE_ADMIN_KEY) to load the Quiz Builder. Stored for this browser session only, and shared with the reviewer."}
        </p>
        <Label htmlFor="qb-admin-key" className="sr-only">X-Admin-Key</Label>
        <Input
          id="qb-admin-key"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="X-Admin-Key value"
          className="h-8 text-xs"
          autoFocus
        />
        <Button size="sm" className="h-7 w-full text-xs" disabled={!value.trim()} onClick={save}>Save key</Button>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-sm font-semibold">Quiz Builder · Pro Esports</h1>
      </div>
      <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
        <Link to={REVIEWER_ROUTE}><ExternalLink className="h-3 w-3" /> Open Quiz Reviewer</Link>
      </Button>
    </div>
  );
}

export default function QuizBuilderPro({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const adminKey = useAdminKey();
  const hasAdminKey = !!adminKey;
  // Embedded in the account-bound workspace: the shared AdminAuthGate already
  // authorized the owner via their Supabase session, so requests use the bearer
  // and no local admin key is required. Standalone, the key still gates.
  const authorized = embedded || hasAdminKey;

  useEffect(() => {
    if (!authorized) return;
    void queryClient.invalidateQueries({ queryKey: ["quiz-builder"] });
  }, [adminKey, authorized, queryClient]);

  const metaQuery = useQuery({
    queryKey: ["quiz-builder", "meta"],
    queryFn: () => quizApi.getQuizBuilderMeta(),
    staleTime: 5 * 60_000,
    enabled: authorized,
    retry: false,
  });

  const authError = !authorized || metaQuery.error instanceof QuizAdminAuthError;

  // Generate form + results state -------------------------------------------
  const [form, setForm] = useState<GenerateFormState | null>(null);
  const [candidates, setCandidates] = useState<QuizBuilderCandidate[]>([]);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [savedByIndex, setSavedByIndex] = useState<Record<number, number>>({});

  // Seed form defaults once metadata arrives.
  useEffect(() => {
    if (metaQuery.data && !form) setForm(pickGenerateDefaults(metaQuery.data));
  }, [metaQuery.data, form]);

  const templateLabel = useMemo(() => {
    const map = new Map((metaQuery.data?.templates ?? []).map((t) => [t.template_id, t.label]));
    return (id: string) => map.get(id) ?? id;
  }, [metaQuery.data]);

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!form?.year || !form.scope_name || !form.template_id) {
        return Promise.reject(new Error("Select year, scope, and template."));
      }
      return quizApi.generateQuizBuilderCandidates({
        template_id: form.template_id,
        year: form.year,
        scope_name: form.scope_name,
        candidate_count: form.candidate_count,
        difficulty: form.difficulty,
      });
    },
    onSuccess: (res) => {
      setCandidates(res.candidates);
      setGenWarnings(res.warnings);
      setSavedByIndex({});
      if (res.candidates.length === 0) {
        toast.message("No candidates generated", { description: res.warnings[0] ?? "Try a different template or scope." });
      }
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  const saveDraftMutation = useMutation({
    mutationFn: ({ candidate, edited }: { candidate: QuizBuilderCandidate; edited: EditableQuestion; index: number }) =>
      quizApi.createQuizBuilderDraft(buildDraftCreatePayload(candidate, edited)),
    onSuccess: (draft, { index }) => {
      setSavedByIndex((prev) => ({ ...prev, [index]: draft.id }));
      void queryClient.invalidateQueries({ queryKey: ["quiz-builder", "drafts"] });
      toast.success(`Saved draft #${draft.id}`, { description: "Find it in the Drafts tab." });
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  // Edit draft (Sheet) ------------------------------------------------------
  const [editDraft, setEditDraft] = useState<QuizBuilderDraft | null>(null);
  const [editValue, setEditValue] = useState<EditableQuestion | null>(null);

  const openEdit = (draft: QuizBuilderDraft) => {
    setEditDraft(draft);
    setEditValue({
      question_text: draft.question_text,
      choices: [...draft.choices],
      correctAnswer: draft.correct_answer.value,
      explanation: draft.explanation ?? "",
      difficulty: draft.difficulty,
      proSource: proSourceFromMetadata(draft.pro_data_source).edit,
    });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: EditableQuestion }) =>
      quizApi.updateQuizBuilderDraft(id, {
        question_text: value.question_text.trim(),
        choices: value.choices.map((c) => c.trim()),
        correct_answer: { type: editDraft!.correct_answer.type, value: value.correctAnswer.trim() },
        explanation: value.explanation.trim() || null,
        difficulty: value.difficulty,
        // Set/replace, clear (null) if it previously had one, or omit.
        ...buildProSourceUpdate(value.proSource, editDraft!.pro_data_source != null),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quiz-builder", "drafts"] });
      toast.success("Draft updated");
      setEditDraft(null);
      setEditValue(null);
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  // Reject draft (Dialog) ---------------------------------------------------
  const [rejectDraft, setRejectDraft] = useState<QuizBuilderDraft | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      quizApi.updateQuizBuilderDraft(id, { status: "rejected", rejection_reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quiz-builder", "drafts"] });
      toast.success("Draft rejected");
      setRejectDraft(null);
      setRejectReason("");
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => quizApi.updateQuizBuilderDraft(id, { status: "draft" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quiz-builder", "drafts"] });
      toast.success("Draft restored");
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  // Send to reviewer (Dialog + result) --------------------------------------
  const [sendDraft, setSendDraft] = useState<QuizBuilderDraft | null>(null);
  const [sendResult, setSendResult] = useState<QuizBuilderPromotionResponse | null>(null);

  const sendMutation = useMutation({
    mutationFn: (id: number) => quizApi.sendQuizBuilderDraftToReview(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["quiz-builder", "drafts"] });
      if (isUnsafePromotion(result)) {
        // Backend contract violated — do NOT report success.
        setSendResult(result);
        toast.error("Unexpected: promoted question is active/reviewed. Do not treat as safe.");
        return;
      }
      setSendResult(result);
      toast.success(`Sent to reviewer · question #${result.promoted_question_id}`);
    },
    onError: (err) => toast.error(builderErrorMessage(err)),
  });

  const closeSend = () => { setSendDraft(null); setSendResult(null); };

  // ------------------------------------------------------------------------
  // When embedded in the unified admin workspace, the workspace owns the page
  // chrome (SEOHead, breadcrumb, admin-key gate) and sizing — this page renders
  // only its own content. Standalone, it keeps its full-page chrome.
  const rootClass = embedded
    ? "flex h-full min-h-0 flex-col overflow-hidden"
    : "flex h-[calc(100vh-4rem)] flex-col overflow-hidden";

  if (authError) {
    return (
      <div className={rootClass}>
        {!embedded && (
          <SEOHead title="Quiz Builder · Admin" description="Generate pro esports quiz candidates." path="/admin/quiz-builder" />
        )}
        {!embedded && <Header />}
        {embedded ? (
          // The shared workspace gate owns authorization; don't prompt for a
          // key here. A real 403 mid-session surfaces as a recoverable notice.
          <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
            Admin authorization is required. Reload the workspace to re-check your session.
          </div>
        ) : (
          <AdminKeyPanel invalid={hasAdminKey} />
        )}
      </div>
    );
  }

  const meta = metaQuery.data;

  return (
    <div className={rootClass}>
      {!embedded && (
        <SEOHead title="Quiz Builder · Admin" description="Generate pro esports quiz candidates." path="/admin/quiz-builder" />
      )}
      {!embedded && <Header />}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {metaQuery.isLoading || !meta || !form ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading builder metadata" />
          </div>
        ) : (
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="flex-wrap">
              <TabsTrigger value="generate" className="text-xs">Generate</TabsTrigger>
              <TabsTrigger value="drafts" className="text-xs">Drafts</TabsTrigger>
              <TabsTrigger value="sent" className="text-xs">Sent to Reviewer</TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs">Rejected</TabsTrigger>
            </TabsList>

            {/* Generate ---------------------------------------------------- */}
            <TabsContent value="generate" className="space-y-3 pt-3">
              <QuizBuilderControls
                meta={meta}
                value={form}
                onChange={setForm}
                onGenerate={() => generateMutation.mutate()}
                isGenerating={generateMutation.isPending}
              />

              {genWarnings.length > 0 && (
                <div className="space-y-0.5 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-300" role="status">
                  {genWarnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{w}
                    </p>
                  ))}
                </div>
              )}

              {generateMutation.isPending ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Generating candidates" />
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <ListChecks className="h-6 w-6 text-muted-foreground/50" aria-hidden />
                  <p className="text-xs text-muted-foreground">Choose controls and Generate to preview candidates.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {candidates.map((candidate, i) => (
                    <QuizCandidateCard
                      key={`${candidate.question_text}-${i}`}
                      candidate={candidate}
                      templateLabel={templateLabel(candidate.template_id)}
                      saved={savedByIndex[i] !== undefined}
                      savedDraftId={savedByIndex[i]}
                      saving={saveDraftMutation.isPending && saveDraftMutation.variables?.index === i}
                      onSave={(edited) => saveDraftMutation.mutate({ candidate, edited, index: i })}
                      onDiscard={() => setCandidates((prev) => prev.filter((_, idx) => idx !== i))}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Drafts ------------------------------------------------------ */}
            <TabsContent value="drafts" className="pt-3">
              <QuizDraftList
                status="draft"
                meta={meta}
                templateLabel={templateLabel}
                showFilters
                emptyMessage="No draft candidates yet. Generate and save some from the Generate tab."
                onEdit={openEdit}
                onReject={(d) => { setRejectDraft(d); setRejectReason(""); }}
                onSend={(d) => { setSendDraft(d); setSendResult(null); }}
              />
            </TabsContent>

            {/* Sent to Reviewer ------------------------------------------- */}
            <TabsContent value="sent" className="pt-3">
              <QuizDraftList
                status="sent_to_review"
                meta={meta}
                templateLabel={templateLabel}
                emptyMessage="Nothing sent to the reviewer yet."
              />
            </TabsContent>

            {/* Rejected --------------------------------------------------- */}
            <TabsContent value="rejected" className="pt-3">
              <QuizDraftList
                status="rejected"
                meta={meta}
                templateLabel={templateLabel}
                emptyMessage="No rejected drafts."
                onRestore={(d) => restoreMutation.mutate(d.id)}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Edit draft sheet ------------------------------------------------- */}
      <Sheet open={!!editDraft} onOpenChange={(open) => { if (!open) { setEditDraft(null); setEditValue(null); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit draft{editDraft ? ` #${editDraft.id}` : ""}</SheetTitle>
            <SheetDescription className="text-xs">
              Wording, choices, correct answer, explanation and difficulty are editable. Year, scope,
              template and question key are fixed.
            </SheetDescription>
          </SheetHeader>
          {editValue && (
            <div className="py-3">
              <QuizCandidateEditor value={editValue} onChange={setEditValue} idPrefix="edit" />
            </div>
          )}
          <SheetFooter>
            <Button
              size="sm"
              className="gap-1 text-xs"
              disabled={!editValue || !validateEditableQuestion(editValue).ok || updateMutation.isPending}
              onClick={() => editDraft && editValue && updateMutation.mutate({ id: editDraft.id, value: editValue })}
            >
              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reject dialog ---------------------------------------------------- */}
      <Dialog open={!!rejectDraft} onOpenChange={(open) => { if (!open) setRejectDraft(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject draft{rejectDraft ? ` #${rejectDraft.id}` : ""}?</DialogTitle>
            <DialogDescription className="text-xs">
              A short reason is required. The draft moves to the Rejected tab and can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reject-reason" className="text-[11px] text-muted-foreground">Rejection reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. duplicate of an existing question"
              className="min-h-[60px] text-xs"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setRejectDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1 text-xs"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectDraft && rejectMutation.mutate({ id: rejectDraft.id, reason: rejectReason })}
            >
              {rejectMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to reviewer dialog ------------------------------------------ */}
      <Dialog open={!!sendDraft} onOpenChange={(open) => { if (!open) closeSend(); }}>
        <DialogContent className="max-w-md">
          {!sendResult ? (
            <>
              <DialogHeader>
                <DialogTitle>Send draft{sendDraft ? ` #${sendDraft.id}` : ""} to the reviewer?</DialogTitle>
                <DialogDescription className="space-y-1.5 text-xs">
                  <span className="block">This creates a question in the existing Quiz Reviewer. It will:</span>
                  <span className="block">• remain <strong>inactive</strong> and <strong>unreviewed</strong></span>
                  <span className="block">• <strong>not</strong> be publicly playable until approved and activated in the reviewer</span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button size="sm" variant="ghost" className="text-xs" onClick={closeSend}>Cancel</Button>
                <Button
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={sendMutation.isPending}
                  onClick={() => sendDraft && sendMutation.mutate(sendDraft.id)}
                >
                  {sendMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send to reviewer
                </Button>
              </DialogFooter>
            </>
          ) : isUnsafePromotion(sendResult) ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-400">
                  <ShieldAlert className="h-4 w-4" aria-hidden /> Unexpected activation state
                </DialogTitle>
                <DialogDescription className="text-xs">
                  The backend returned <code>is_active={String(sendResult.is_active)}</code> /
                  <code> review_status={sendResult.review_status}</code>. A promoted question must be
                  inactive and unreviewed. Do not treat this as safe — verify in the reviewer immediately.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button asChild size="sm" variant="outline" className="gap-1 text-xs">
                  <Link to={reviewQuestionLink(sendResult.promoted_question_id)} data-testid="builder-open-in-review-unsafe">
                    <ExternalLink className="h-3 w-3" /> Open in Review
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={closeSend}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Sent to reviewer</DialogTitle>
                <DialogDescription className="text-xs">The draft is now a reviewer question.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px]">
                <dt className="text-muted-foreground">Question ID</dt>
                <dd className="font-medium" data-testid="builder-promoted-question-id">#{sendResult.promoted_question_id}</dd>
                <dt className="text-muted-foreground">Review status</dt><dd className="font-medium">{sendResult.review_status}</dd>
                <dt className="text-muted-foreground">Active</dt><dd className="font-medium">{sendResult.is_active ? "yes" : "no"}</dd>
                <dt className="text-muted-foreground">Sent at</dt><dd className="font-medium">{sendResult.sent_to_review_at?.slice(0, 16).replace("T", " ") ?? "—"}</dd>
              </dl>
              <DialogFooter>
                <Button asChild size="sm" variant="outline" className="gap-1 text-xs">
                  <Link to={reviewQuestionLink(sendResult.promoted_question_id)} data-testid="builder-open-in-review">
                    <ExternalLink className="h-3 w-3" /> Open in Review
                  </Link>
                </Button>
                <Button size="sm" className="text-xs" onClick={closeSend}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
