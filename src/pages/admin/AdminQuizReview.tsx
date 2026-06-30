import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, AlertTriangle, Star, StarOff, EyeOff, Eye,
  ChevronLeft, ChevronRight, Search, SlidersHorizontal, X, ImageOff,
  ArrowLeft, Loader2, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEOHead from "@/components/SEOHead";
import {
  quizApi,
  resolveQuizAssetUrl,
  type ReviewQuestion,
  type ReviewFilters,
  type ReviewPatchPayload,
} from "@/lib/quiz/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = ["unreviewed", "approved", "rejected", "needs_fix", "missing_asset"] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  unreviewed:    { label: "Unreviewed",    color: "border-muted-foreground/30 text-muted-foreground",       icon: SlidersHorizontal },
  approved:      { label: "Approved",      color: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10", icon: CheckCircle2 },
  rejected:      { label: "Rejected",      color: "border-red-400/50 text-red-300 bg-red-400/10",            icon: XCircle },
  needs_fix:     { label: "Needs Fix",     color: "border-amber-400/50 text-amber-300 bg-amber-400/10",      icon: Wrench },
  missing_asset: { label: "Missing Asset", color: "border-orange-400/50 text-orange-300 bg-orange-400/10",   icon: ImageOff },
};

const DIFFICULTY_LABELS: Record<number, string> = { 1: "Recognition", 2: "Recall", 3: "Comparison", 4: "Reasoning", 5: "Simulation" };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unreviewed;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function DiffBadge({ difficulty }: { difficulty?: number }) {
  if (!difficulty) return null;
  const colors = ["", "bg-emerald-400/15 text-emerald-300", "bg-sky-400/15 text-sky-300", "bg-amber-400/15 text-amber-300", "bg-orange-400/15 text-orange-300", "bg-red-400/15 text-red-300"];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${colors[difficulty] ?? ""}`}>
      D{difficulty}
    </span>
  );
}

function AssetImage({ src, label }: { src?: string | null; label: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const url = resolveQuizAssetUrl(src);
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {state === "error" ? (
        <div className="flex h-16 w-16 items-center justify-center rounded border border-red-500/30 bg-red-500/10">
          <ImageOff className="h-6 w-6 text-red-400" />
        </div>
      ) : (
        <img
          src={url}
          alt={label}
          className={`h-16 w-auto max-w-[96px] rounded object-contain ${state === "loading" ? "opacity-0" : "opacity-100"}`}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
      <span className="text-center text-[9px] text-muted-foreground">{label}</span>
      {state === "error" && <span className="text-[9px] text-red-400">broken</span>}
    </div>
  );
}

function choiceLabel(c: string | { label: string; raw_stats?: string[] }): string {
  return typeof c === "string" ? c : c.label;
}

// ---------------------------------------------------------------------------
// Filter sidebar
// ---------------------------------------------------------------------------

type FilterSidebarProps = {
  filters: ReviewFilters;
  onFilters: (f: ReviewFilters) => void;
  filterOptions?: { categories: string[]; source_types: string[]; formats: string[]; review_statuses: string[] };
};

function FilterSidebar({ filters, onFilters, filterOptions }: FilterSidebarProps) {
  const set = (key: keyof ReviewFilters, val: ReviewFilters[keyof ReviewFilters]) =>
    onFilters({ ...filters, [key]: val, page: 1 });
  const clear = (key: keyof ReviewFilters) => {
    const next = { ...filters, page: 1 };
    delete next[key];
    onFilters(next);
  };

  const activeCount = [
    filters.category, filters.source_type, filters.answer_certainty, filters.format,
    filters.review_status, filters.is_active, filters.favorite_for_shorts,
    filters.missing_asset, filters.has_image, filters.difficulty_min, filters.difficulty_max,
  ].filter((v) => v !== undefined && v !== "").length;

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</span>
        {activeCount > 0 && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => onFilters({ page: 1, page_size: filters.page_size })}
          >
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {/* Category */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Category</label>
        <Select value={filters.category ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("category") : set("category", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {filterOptions?.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Source type */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Source Type</label>
        <Select value={filters.source_type ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("source_type") : set("source_type", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {filterOptions?.source_types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Difficulty */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Difficulty</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((d) => {
            const active = filters.difficulty_min === d && filters.difficulty_max === d;
            return (
              <button
                key={d}
                onClick={() => active ? (onFilters({ ...filters, page: 1, difficulty_min: undefined, difficulty_max: undefined })) : onFilters({ ...filters, page: 1, difficulty_min: d, difficulty_max: d })}
                className={`h-6 w-6 rounded text-[10px] font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Answer certainty */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Answer Certainty</label>
        <Select value={filters.answer_certainty ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("answer_certainty") : set("answer_certainty", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="objective">Objective</SelectItem>
            <SelectItem value="derived">Derived</SelectItem>
            <SelectItem value="subjective">Subjective</SelectItem>
            <SelectItem value="community">Community</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Format */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Format</label>
        <Select value={filters.format ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("format") : set("format", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {filterOptions?.formats.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Review status */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Review Status</label>
        <Select value={filters.review_status ?? "__all__"} onValueChange={(v) => v === "__all__" ? clear("review_status") : set("review_status", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {REVIEW_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Active/inactive */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">Active</label>
        <Select
          value={filters.is_active !== undefined ? String(filters.is_active) : "__all__"}
          onValueChange={(v) => v === "__all__" ? clear("is_active") : set("is_active", Number(v))}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="1">Active only</SelectItem>
            <SelectItem value="0">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick toggles */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">Quick Filters</label>
        {[
          { label: "⭐ Shorts Favorites", key: "favorite_for_shorts" as const, val: 1 },
          { label: "🚨 Missing Asset",    key: "missing_asset" as const,     val: 1 },
          { label: "🖼️ Has Image",        key: "has_image" as const,          val: 1 },
          { label: "No Image",            key: "has_image" as const,          val: 0 },
        ].map(({ label, key, val }) => {
          const active = filters[key] === val;
          return (
            <button
              key={`${key}-${val}`}
              onClick={() => active ? clear(key) : set(key, val)}
              className={`w-full rounded border px-2 py-1 text-left text-[10px] transition-colors ${
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/20"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Question list row
// ---------------------------------------------------------------------------

function QuestionRow({
  q,
  selected,
  onClick,
}: {
  q: ReviewQuestion;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-primary/50 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-muted/40"
      } ${!q.is_active ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs text-foreground">{q.question_text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground">#{q.id}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{q.category}</span>
            {q.source_type && (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{q.source_type}</span>
              </>
            )}
            {q.difficulty && <DiffBadge difficulty={q.difficulty} />}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={q.review_status} />
          {q.favorite_for_shorts && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
          {q.missing_asset && <ImageOff className="h-3 w-3 text-orange-400" />}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  questionId,
  onClose,
  onNavigate,
  canPrev,
  canNext,
}: {
  questionId: number;
  onClose: () => void;
  onNavigate: (dir: "prev" | "next") => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["review-question", questionId],
    queryFn: () => quizApi.getReviewQuestion(questionId),
    staleTime: 30_000,
  });

  const q = data?.question;

  // Sync note textarea when question loads or changes
  useEffect(() => {
    setNote(q?.review_note ?? "");
  }, [questionId, q?.review_note]);

  const { mutate: patch, isPending } = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReviewPatchPayload }) =>
      quizApi.patchReviewQuestion(id, payload),
    onSuccess: (_, { payload }) => {
      void queryClient.invalidateQueries({ queryKey: ["review-question", questionId] });
      void queryClient.invalidateQueries({ queryKey: ["review-questions"] });
      const keys = Object.keys(payload).join(", ");
      toast.success(`Updated: ${keys}`);
    },
    onError: () => toast.error("Failed to update question"),
  });

  const apply = useCallback(
    (payload: ReviewPatchPayload) => patch({ id: questionId, payload }),
    [questionId, patch],
  );

  if (isLoading || !q) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const correctValue = q.correct_answer?.value ?? "";
  const assetBase = q.metadata as Record<string, unknown>;
  const assets = (assetBase?.assets as Record<string, unknown>) ?? {};
  const subjectAssets = (assets?.subject as Record<string, unknown>) ?? {};

  const assetPaths = [
    { key: "icon",           label: "Icon" },
    { key: "splash",         label: "Splash" },
    { key: "loading",        label: "Loading" },
    { key: "item_icon",      label: "Item Icon" },
    { key: "ability_icon",   label: "Ability Icon" },
    { key: "rune_icon",      label: "Rune Icon" },
    { key: "summoner_icon",  label: "Summoner Icon" },
  ].filter(({ key }) => subjectAssets[key]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onNavigate("prev")} disabled={!canPrev} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">#{q.id}</span>
          <button onClick={() => onNavigate("next")} disabled={!canNext} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Review action buttons */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review Status</p>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              const active = q.review_status === s;
              return (
                <button
                  key={s}
                  disabled={isPending}
                  onClick={() => apply({ review_status: s })}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                    active ? cfg.color + " ring-1 ring-current/40" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick toggles row */}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={isPending}
            onClick={() => apply({ favorite_for_shorts: !q.favorite_for_shorts })}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
              q.favorite_for_shorts
                ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                : "border-border text-muted-foreground hover:border-amber-400/30"
            }`}
          >
            {q.favorite_for_shorts ? <Star className="h-3 w-3 fill-amber-400" /> : <StarOff className="h-3 w-3" />}
            {q.favorite_for_shorts ? "Shorts Fav" : "Add to Shorts"}
          </button>

          <button
            disabled={isPending}
            onClick={() => apply({ missing_asset: !q.missing_asset })}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
              q.missing_asset
                ? "border-orange-400/50 bg-orange-400/10 text-orange-300"
                : "border-border text-muted-foreground hover:border-orange-400/30"
            }`}
          >
            <ImageOff className="h-3 w-3" />
            {q.missing_asset ? "Asset Missing" : "Flag Asset"}
          </button>

          <button
            disabled={isPending}
            onClick={() => apply({ is_active: !q.is_active })}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
              !q.is_active
                ? "border-red-400/50 bg-red-400/10 text-red-300"
                : "border-border text-muted-foreground hover:border-red-400/30"
            }`}
          >
            {q.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {q.is_active ? "Active" : "Inactive"}
          </button>
        </div>

        {/* Difficulty adjuster */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Difficulty</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                disabled={isPending}
                onClick={() => apply({ difficulty: d })}
                title={DIFFICULTY_LABELS[d]}
                className={`flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition-colors ${
                  q.difficulty === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {d}
              </button>
            ))}
            <span className="self-center text-[10px] text-muted-foreground">{DIFFICULTY_LABELS[q.difficulty ?? 1]}</span>
          </div>
        </div>

        {/* Answer certainty */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Answer Certainty</p>
          <div className="flex gap-1.5">
            {["objective", "derived", "subjective", "community"].map((c) => (
              <button
                key={c}
                disabled={isPending}
                onClick={() => apply({ answer_certainty: c })}
                className={`rounded px-2 py-0.5 text-[10px] capitalize transition-colors ${
                  q.answer_certainty === c
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[10px]">
          {[
            ["Category", q.category],
            ["Source", q.source_type ?? "—"],
            ["Format", q.format],
            ["Certainty", q.answer_certainty],
            ["Key", q.question_key ?? "—"],
            ["Created", q.created_at ? q.created_at.slice(0, 10) : "—"],
            ["Reviewed by", q.reviewed_by ?? "—"],
            ["Reviewed at", q.reviewed_at ? q.reviewed_at.slice(0, 10) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-1">
              <span className="text-muted-foreground">{label}:</span>
              <span className="font-medium text-foreground truncate">{value}</span>
            </div>
          ))}
        </div>

        {/* Question text */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Question</p>
          <p className="text-sm text-foreground leading-relaxed">{q.question_text}</p>
        </div>

        {/* Image */}
        {q.image_path && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Question Image</p>
            <AssetImage src={q.image_path} label="question image" />
          </div>
        )}

        {/* Choices + correct answer */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Choices</p>
          <div className="space-y-1">
            {q.choices.map((c, i) => {
              const label = choiceLabel(c);
              const isCorrect = label.toLowerCase().trim() === correctValue.toLowerCase().trim();
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                    isCorrect
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : "border-border/30 text-muted-foreground"
                  }`}
                >
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Correct: <span className="font-medium text-emerald-400">{correctValue || "—"}</span>
          </p>
        </div>

        {/* Explanation */}
        {q.explanation && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{q.explanation}</p>
          </div>
        )}

        {/* Subject assets */}
        {assetPaths.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assets</p>
            <div className="flex flex-wrap gap-3">
              {assetPaths.map(({ key, label }) => (
                <AssetImage key={key} src={subjectAssets[key] as string} label={label} />
              ))}
            </div>
          </div>
        )}

        {/* Metadata JSON */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Metadata</p>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/30 p-2 text-[10px] text-muted-foreground">
            {JSON.stringify(q.metadata, null, 2)}
          </pre>
        </div>

        {/* Review note */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Internal Note</p>
          {noteEditing ? (
            <div className="space-y-1.5">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Internal review note…"
                className="min-h-[60px] text-xs"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-[10px]"
                  disabled={isPending}
                  onClick={() => { apply({ review_note: note }); setNoteEditing(false); }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => { setNote(q.review_note ?? ""); setNoteEditing(false); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setNote(q.review_note ?? ""); setNoteEditing(true); }}
              className="w-full rounded-md border border-dashed border-border/50 p-2 text-left text-[10px] text-muted-foreground hover:border-border"
            >
              {q.review_note || "Click to add note…"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function AdminQuizReview() {
  const [filters, setFilters] = useState<ReviewFilters>({ page: 1, page_size: PAGE_SIZE });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: filterOptions } = useQuery({
    queryKey: ["review-filter-options"],
    queryFn: () => quizApi.getReviewFilterOptions(),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["review-questions", filters],
    queryFn: () => quizApi.getReviewQuestions(filters),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const questions = data?.questions ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const page = filters.page ?? 1;

  const applySearch = () =>
    setFilters((f) => ({ ...f, search: search.trim() || undefined, page: 1 }));

  const selectedIndex = questions.findIndex((q) => q.id === selectedId);

  const navigate = (dir: "prev" | "next") => {
    const next = dir === "prev" ? selectedIndex - 1 : selectedIndex + 1;
    if (next >= 0 && next < questions.length) setSelectedId(questions[next].id);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <SEOHead title="Quiz Review Console · Admin" description="Inspect and curate quiz questions." path="/admin/quiz-review" />

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/quiz-broadcast" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Broadcast Studio
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-sm font-semibold">Quiz Review Console</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span>{total.toLocaleString()} questions</span>
          )}
        </div>
      </div>

      {/* Body: sidebar + list + detail */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Filter sidebar */}
        <div className="h-full w-64 shrink-0 overflow-y-auto border-r px-3 py-3">
          <FilterSidebar
            filters={filters}
            onFilters={setFilters}
            filterOptions={filterOptions}
          />
        </div>

        {/* Question list */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r">
          {/* Search bar */}
          <div className="shrink-0 flex gap-2 border-b px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder="Search question text, key, ID…"
                className="h-7 pl-7 text-xs"
              />
              {search && (
                <button onClick={() => { setSearch(""); setFilters((f) => ({ ...f, search: undefined, page: 1 })); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applySearch}>Search</Button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {isError && (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Failed to load questions
              </div>
            )}
            {!isLoading && questions.length === 0 && (
              <p className="py-12 text-center text-xs text-muted-foreground">No questions match these filters.</p>
            )}
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                selected={selectedId === q.id}
                onClick={() => setSelectedId(selectedId === q.id ? null : q.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="shrink-0 flex items-center justify-between border-t px-3 py-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                disabled={page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                <ChevronLeft className="h-3 w-3 mr-0.5" />
                Prev
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Page {page} / {pages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                disabled={page >= pages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                Next
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId !== null ? (
          <div className="flex h-full w-[400px] shrink-0 flex-col overflow-hidden">
            <DetailPanel
              questionId={selectedId}
              onClose={() => setSelectedId(null)}
              onNavigate={navigate}
              canPrev={selectedIndex > 0}
              canNext={selectedIndex < questions.length - 1}
            />
          </div>
        ) : (
          <div className="flex w-[400px] shrink-0 items-center justify-center text-xs text-muted-foreground">
            Select a question to review
          </div>
        )}
      </div>
    </div>
  );
}
