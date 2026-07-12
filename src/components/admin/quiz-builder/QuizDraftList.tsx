import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuizDraftCard } from "./QuizDraftCard";
import {
  quizApi,
  type QuizBuilderDraft,
  type QuizBuilderDraftStatus,
  type QuizBuilderMeta,
} from "@/lib/quiz/api";

const PAGE_SIZE = 20;
const ALL = "__all__";

type Props = {
  status: QuizBuilderDraftStatus;
  meta: QuizBuilderMeta;
  templateLabel: (templateId: string) => string;
  showFilters?: boolean;
  emptyMessage: string;
  onEdit?: (draft: QuizBuilderDraft) => void;
  onReject?: (draft: QuizBuilderDraft) => void;
  onRestore?: (draft: QuizBuilderDraft) => void;
  onSend?: (draft: QuizBuilderDraft) => void;
};

/**
 * Paginated draft list for one status, with optional year/scope/template/
 * coverage/search filters (backed by backend query params). Owns its own
 * TanStack query keyed by status+filters+page; the page invalidates
 * ["quiz-builder","drafts"] after any mutation to refresh all tabs.
 */
export function QuizDraftList({
  status, meta, templateLabel, showFilters, emptyMessage, onEdit, onReject, onRestore, onSend,
}: Props) {
  const [year, setYear] = useState<string>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [template, setTemplate] = useState<string>(ALL);
  const [coverage, setCoverage] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filters = {
    status,
    year: year !== ALL ? Number(year) : undefined,
    scope_name: scope !== ALL ? scope : undefined,
    template_id: template !== ALL ? template : undefined,
    coverage_status: coverage !== ALL ? coverage : undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["quiz-builder", "drafts", filters],
    queryFn: () => quizApi.listQuizBuilderDrafts(filters),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    retry: false,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = () => setPage(0);
  const coverageValues = ["complete", "partial", "in_progress", "unavailable", "unknown"];

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="df-year" className="text-[10px] text-muted-foreground">Year</Label>
            <Select value={year} onValueChange={(v) => { setYear(v); resetPage(); }}>
              <SelectTrigger id="df-year" className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {meta.years.map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="df-scope" className="text-[10px] text-muted-foreground">Scope</Label>
            <Select value={scope} onValueChange={(v) => { setScope(v); resetPage(); }}>
              <SelectTrigger id="df-scope" className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {meta.scopes.map((s) => <SelectItem key={s.scope_name} value={s.scope_name}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="df-template" className="text-[10px] text-muted-foreground">Template</Label>
            <Select value={template} onValueChange={(v) => { setTemplate(v); resetPage(); }}>
              <SelectTrigger id="df-template" className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {meta.templates.map((t) => <SelectItem key={t.template_id} value={t.template_id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="df-coverage" className="text-[10px] text-muted-foreground">Coverage</Label>
            <Select value={coverage} onValueChange={(v) => { setCoverage(v); resetPage(); }}>
              <SelectTrigger id="df-coverage" className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {coverageValues.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="df-search" className="text-[10px] text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="df-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput.trim()); resetPage(); } }}
                placeholder="question text…"
                className="h-7 pl-7 pr-6 text-xs"
              />
              {searchInput && (
                <button
                  aria-label="Clear search"
                  onClick={() => { setSearchInput(""); setSearch(""); resetPage(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading drafts" />
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-red-400" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden /> Failed to load drafts.
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <p className="py-12 text-center text-xs text-muted-foreground">{emptyMessage}</p>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {items.map((draft) => (
          <QuizDraftCard
            key={draft.id}
            draft={draft}
            templateLabel={templateLabel(draft.template_id)}
            onEdit={onEdit}
            onReject={onReject}
            onRestore={onRestore}
            onSend={onSend}
          />
        ))}
      </div>

      {(total > PAGE_SIZE || page > 0) && (
        <div className="flex items-center justify-between border-t border-border/40 pt-2">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-3 w-3" /> Prev
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {total.toLocaleString()} total · page {page + 1} / {pages}
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
