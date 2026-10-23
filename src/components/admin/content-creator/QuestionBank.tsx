/**
 * Content Creator — the question bank browser.
 *
 * Reads the bank through the SAME owner-authorized review endpoints Quiz Review
 * uses (`quizApi.getReviewQuestions`, `getReviewFilterOptions`) — GETs only.
 * Nothing on this surface can edit a question. Each row shows what the
 * operator needs to choose content: the prompt, the correct answer, the
 * category and difficulty, and whether the Content Factory can render it
 * (the readiness preflight Quiz Review runs).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Search, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quizApi, type ReviewQuestion } from "@/lib/quiz/api";
import { describeItem } from "@/lib/content-creator/creatorState";
import {
  activeFilterSummary,
  bankState,
  DEFAULT_BANK_FILTERS,
  selectOptions,
  toReviewFilters,
  type BankFilters,
} from "@/lib/content-creator/bankFilters";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function ReadinessChip({ blocking, label, detail }: { blocking: boolean; label: string; detail: string }) {
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        blocking
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      )}
    >
      {blocking ? <ShieldAlert className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function QuestionBank({
  selectedIds,
  onAdd,
  onRemove,
}: {
  selectedIds: ReadonlySet<string>;
  onAdd: (row: ReviewQuestion) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState(DEFAULT_BANK_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_BANK_FILTERS);
  const [page, setPage] = useState(1);

  const options = useQuery({
    queryKey: ["content-creator", "filter-options"],
    queryFn: () => quizApi.getReviewFilterOptions(),
    staleTime: 5 * 60_000,
  });
  const list = useQuery({
    queryKey: ["content-creator", "questions", filters, page],
    queryFn: () => quizApi.getReviewQuestions(toReviewFilters(filters, page)),
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (list.data?.questions ?? []).map((row) => ({ row, info: describeItem(row) })),
    [list.data],
  );

  const state = bankState({
    loading: list.isLoading,
    error: list.error,
    total: list.data?.total,
    filters,
    options: options.data,
  });
  const narrowing = activeFilterSummary(filters);
  const clearFilters = () => {
    const cleared = { ...DEFAULT_BANK_FILTERS, activeOnly: false };
    setDraft(cleared);
    setFilters(cleared);
    setPage(1);
  };

  const apply = (next: Partial<BankFilters>, immediate = true) => {
    const merged = { ...draft, ...next };
    setDraft(merged);
    if (immediate) {
      setFilters(merged);
      setPage(1);
    }
  };

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-card/60" data-testid="cc-bank">
      <header className="space-y-2 border-b border-border/60 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">Question bank</h2>
          <span className="text-[11px] text-muted-foreground" data-testid="cc-bank-total">
            {state.kind === "results"
              ? `${state.total.toLocaleString()} match${state.total === 1 ? "" : "es"}`
              : state.kind === "empty" || state.kind === "invalid"
                ? "0 matches"
                : ""}
          </span>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ search: draft.search });
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={draft.search}
              onChange={(e) => apply({ search: e.target.value }, false)}
              placeholder="Search prompts, answers, champions…"
              className="h-8 pl-7 text-xs"
              aria-label="Search questions"
              data-testid="cc-bank-search"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8">
            Search
          </Button>
        </form>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={SELECT}
            aria-label="Category"
            value={draft.category}
            onChange={(e) => apply({ category: e.target.value })}
            data-testid="cc-bank-category"
          >
            <option value="">All categories</option>
            {selectOptions(options.data?.categories, draft.category).map((c) => (
              <option key={c.value} value={c.value}>
                {c.absent ? c.label : c.value}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            aria-label="Difficulty"
            value={draft.difficulty}
            onChange={(e) => apply({ difficulty: e.target.value })}
            data-testid="cc-bank-difficulty"
          >
            <option value="">Any difficulty</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={String(d)}>
                Difficulty {d}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            aria-label="Review status"
            value={draft.reviewStatus}
            onChange={(e) => apply({ reviewStatus: e.target.value })}
            data-testid="cc-bank-status"
          >
            <option value="">Any review status</option>
            {selectOptions(options.data?.review_statuses, draft.reviewStatus).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            aria-label="Pack"
            value={draft.pack}
            onChange={(e) => apply({ pack: e.target.value })}
            data-testid="cc-bank-pack"
          >
            <option value="">All packs</option>
            {(options.data?.packs ?? []).map((p) => (
              <option key={p.pack_key} value={p.pack_key}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={draft.activeOnly}
              onChange={(e) => apply({ activeOnly: e.target.checked })}
            />
            Live questions only
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={draft.withImage} onChange={(e) => apply({ withImage: e.target.checked })} />
            With artwork
          </label>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="cc-bank-list">
        <div data-testid="cc-bank-state" data-state={state.kind}>
          {state.kind === "loading" && (
            <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading questions…
            </p>
          )}
          {(state.kind === "unauthorized" || state.kind === "error") && (
            <p className="p-4 text-xs text-destructive" data-testid="cc-bank-error">
              {state.message}{" "}
              <button type="button" className="underline" onClick={() => void list.refetch()}>
                Retry
              </button>
            </p>
          )}
          {(state.kind === "empty" || state.kind === "invalid") && (
            <div className="space-y-2 p-4 text-xs text-muted-foreground" data-testid="cc-bank-empty">
              <p>{state.message}</p>
              {narrowing.length > 0 && (
                <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={clearFilters} data-testid="cc-bank-clear">
                  Clear all filters
                </Button>
              )}
            </div>
          )}
        </div>
        <ul className="space-y-1.5">
          {rows.map(({ row, info }) => {
            const selected = selectedIds.has(info.id);
            return (
              <li
                key={info.id}
                className={cn(
                  "rounded-lg border p-2.5 transition-colors",
                  selected ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/40 hover:border-border",
                )}
                data-testid={`cc-bank-row-${info.id}`}
                data-ready={info.readiness.blocking ? "blocked" : "ready"}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium leading-snug">{info.prompt || "(no prompt)"}</p>
                    <p className="text-[11px] text-emerald-300/90" data-testid="cc-bank-answer">
                      {info.correctLabel ? `✓ ${info.correctLabel}` : "No renderable answer"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>#{info.id}</span>
                      {info.category && <span>· {info.category}</span>}
                      {row.difficulty !== undefined && <span>· difficulty {row.difficulty}</span>}
                      {info.contentDifficulty && <span>· badge {info.contentDifficulty}</span>}
                      <ReadinessChip
                        blocking={info.readiness.blocking}
                        label={info.readiness.label}
                        detail={info.readiness.detail}
                      />
                    </div>
                  </div>
                  {selected ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Remove question ${info.id}`}
                      onClick={() => onRemove(info.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Add question ${info.id}`}
                      disabled={info.readiness.blocking}
                      title={info.readiness.blocking ? info.readiness.detail : "Add to this post"}
                      onClick={() => onAdd(row)}
                      data-testid={`cc-bank-add-${info.id}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {list.data && list.data.pages > 1 && (
        <footer className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          <Button size="sm" variant="ghost" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span>
            Page {list.data.page} of {list.data.pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={page >= list.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </footer>
      )}
    </section>
  );
}
