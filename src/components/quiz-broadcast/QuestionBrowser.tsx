import { useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuizQuestion } from "@/lib/quiz/api";

type Props = {
  questions: QuizQuestion[];
  onAdd: (q: QuizQuestion) => void;
  loading?: boolean;
  usingFallback?: boolean;
  onFiltersChange?: (state: {
    search: string;
    category: string;
    difficulty: string;
    totalBeforeFilters: number;
    totalAfterFilters: number;
  }) => void;
};

export default function QuestionBrowser({ questions, onAdd, loading, usingFallback, onFiltersChange }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");

  const categories = useMemo(() => {
    const s = new Set<string>();
    questions.forEach((q) => s.add(String(q.category)));
    return Array.from(s).sort();
  }, [questions]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (category !== "all" && q.category !== category) return false;
      if (difficulty !== "all" && String(q.difficulty ?? "") !== difficulty) return false;
      if (!s) return true;
      const meta = (q.metadata ?? {}) as Record<string, unknown>;
      const hay = [
        q.question_text,
        q.category,
        String(q.id),
        meta.champion,
        meta.item,
        meta.rune,
        meta.summoner,
        meta.patch,
        (meta.tags as string[] | undefined)?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [questions, search, category, difficulty]);

  useEffect(() => {
    onFiltersChange?.({
      search,
      category,
      difficulty,
      totalBeforeFilters: questions.length,
      totalAfterFilters: filtered.length,
    });
  }, [search, category, difficulty, questions.length, filtered.length, onFiltersChange]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, champions, items, tags…"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any difficulty</SelectItem>
            <SelectItem value="1">1 — Easy</SelectItem>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="3">3</SelectItem>
            <SelectItem value="4">4</SelectItem>
            <SelectItem value="5">5 — Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loading ? "Loading…" : `${filtered.length} of ${questions.length} questions`}
          {usingFallback && (
            <Badge variant="outline" className="ml-2 border-amber-400/40 text-amber-300">Fallback data</Badge>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No questions match.</div>
        )}
        {filtered.map((q) => {
          const meta = (q.metadata ?? {}) as Record<string, unknown>;
          return (
            <div
              key={q.id}
              className="flex items-start justify-between gap-3 border-b border-white/5 p-3 last:border-0 hover:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-medium">{q.question_text || "(no text)"}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Badge variant="outline">{String(q.category).replace(/_/g, " ")}</Badge>
                  {q.difficulty != null && <Badge variant="outline">D{q.difficulty}</Badge>}
                  {meta.champion ? <Badge variant="outline">{String(meta.champion)}</Badge> : null}
                  {meta.item ? <Badge variant="outline">{String(meta.item)}</Badge> : null}
                  {meta.patch ? <Badge variant="outline">{String(meta.patch)}</Badge> : null}
                  <span className="opacity-50">#{String(q.id)}</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onAdd(q)}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}