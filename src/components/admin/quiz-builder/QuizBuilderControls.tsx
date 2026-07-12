import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoverageBadge } from "./QuizBuilderStatusBadge";
import type { QuizBuilderMeta, QuizBuilderYearMeta } from "@/lib/quiz/api";

export type GenerateFormState = {
  year: number | null;
  scope_name: string | null;
  template_id: string | null;
  candidate_count: number;
  difficulty: number;
};

type Props = {
  meta: QuizBuilderMeta;
  value: GenerateFormState;
  onChange: (next: GenerateFormState) => void;
  onGenerate: () => void;
  isGenerating: boolean;
};

/**
 * Generate-tab controls: year, scope, template, candidate count, difficulty.
 * All options come from backend metadata — nothing is hardcoded. The scope
 * list is narrowed to scopes the selected year actually has data for.
 */
export function QuizBuilderControls({ meta, value, onChange, onGenerate, isGenerating }: Props) {
  const yearMeta: QuizBuilderYearMeta | undefined = meta.years.find((y) => y.year === value.year);
  const availableScopes = yearMeta
    ? meta.scopes.filter((s) => yearMeta.scopes.includes(s.scope_name))
    : meta.scopes;
  const maxCount = meta.max_candidate_count || 10;
  const countOptions = Array.from({ length: maxCount }, (_, i) => i + 1);

  const set = <K extends keyof GenerateFormState>(key: K, v: GenerateFormState[K]) =>
    onChange({ ...value, [key]: v });

  // When switching year, keep scope only if still valid.
  const setYear = (year: number) => {
    const ym = meta.years.find((y) => y.year === year);
    const scopeStillValid = ym && value.scope_name ? ym.scopes.includes(value.scope_name) : false;
    onChange({
      ...value,
      year,
      scope_name: scopeStillValid ? value.scope_name : (ym?.scopes.includes("major") ? "major" : ym?.scopes[0] ?? null),
    });
  };

  const canGenerate = value.year !== null && value.scope_name !== null && value.template_id !== null && !isGenerating;

  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-6">
      {/* Year */}
      <div className="space-y-1">
        <Label htmlFor="qb-year" className="text-[11px] font-medium text-muted-foreground">Year</Label>
        <Select value={value.year != null ? String(value.year) : ""} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger id="qb-year" className="h-8 text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {meta.years.map((y) => (
              <SelectItem key={y.year} value={String(y.year)}>
                <span className="flex items-center gap-2">{y.year}<CoverageBadge status={y.coverage_status} /></span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scope */}
      <div className="space-y-1">
        <Label htmlFor="qb-scope" className="text-[11px] font-medium text-muted-foreground">Scope</Label>
        <Select value={value.scope_name ?? ""} onValueChange={(v) => set("scope_name", v)}>
          <SelectTrigger id="qb-scope" className="h-8 text-xs"><SelectValue placeholder="Scope" /></SelectTrigger>
          <SelectContent>
            {availableScopes.map((s) => (
              <SelectItem key={s.scope_name} value={s.scope_name}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Template */}
      <div className="space-y-1">
        <Label htmlFor="qb-template" className="text-[11px] font-medium text-muted-foreground">Template</Label>
        <Select value={value.template_id ?? ""} onValueChange={(v) => set("template_id", v)}>
          <SelectTrigger id="qb-template" className="h-8 text-xs"><SelectValue placeholder="Template" /></SelectTrigger>
          <SelectContent>
            {meta.templates.map((t) => (
              <SelectItem key={t.template_id} value={t.template_id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Candidate count */}
      <div className="space-y-1">
        <Label htmlFor="qb-count" className="text-[11px] font-medium text-muted-foreground">Candidates</Label>
        <Select value={String(value.candidate_count)} onValueChange={(v) => set("candidate_count", Number(v))}>
          <SelectTrigger id="qb-count" className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {countOptions.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Difficulty */}
      <div className="space-y-1">
        <Label htmlFor="qb-difficulty" className="text-[11px] font-medium text-muted-foreground">Difficulty</Label>
        <Select value={String(value.difficulty)} onValueChange={(v) => set("difficulty", Number(v))}>
          <SelectTrigger id="qb-difficulty" className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {meta.difficulties.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Generate */}
      <div className="flex items-end">
        <Button className="h-8 w-full gap-1.5 text-xs" disabled={!canGenerate} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate
        </Button>
      </div>
    </div>
  );
}
