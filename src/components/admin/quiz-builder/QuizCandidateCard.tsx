import { useState } from "react";
import { CheckCircle2, Pencil, Save, Trash2, X, Loader2, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuizBuilderCoverageBanner } from "./QuizBuilderCoverageBanner";
import { QuizEvidenceTable } from "./QuizEvidenceTable";
import { QuizCandidateEditor } from "./QuizCandidateEditor";
import { CoverageBadge, DifficultyBadge } from "./QuizBuilderStatusBadge";
import {
  candidateToEditable,
  validateEditableQuestion,
  type EditableQuestion,
} from "@/lib/quiz-builder/logic";
import type { QuizBuilderCandidate } from "@/lib/quiz/api";

type Props = {
  candidate: QuizBuilderCandidate;
  templateLabel: string;
  saved: boolean;
  savedDraftId?: number;
  saving: boolean;
  onSave: (edited: EditableQuestion) => void;
  onDiscard: () => void;
};

/**
 * Preview of one generated candidate. Read-only by default; "Edit" flips to an
 * inline editor whose changes are client-side until "Save draft" is clicked.
 */
export function QuizCandidateCard({
  candidate, templateLabel, saved, savedDraftId, saving, onSave, onDiscard,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableQuestion>(() => candidateToEditable(candidate));

  const correct = candidate.correct_answer.value;
  const validation = validateEditableQuestion(draft);

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-3">
        {/* Header row: template/year/scope + coverage */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{templateLabel}</span>
            <span className="text-[10px] text-muted-foreground">{candidate.year} · {candidate.scope_label}</span>
            <DifficultyBadge difficulty={draft.difficulty} />
            <CoverageBadge status={candidate.coverage_status} />
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Saved{savedDraftId ? ` · #${savedDraftId}` : ""}
            </span>
          )}
        </div>

        <QuizBuilderCoverageBanner
          year={candidate.year}
          scopeLabel={candidate.scope_label}
          status={candidate.coverage_status}
          warnings={candidate.coverage_warnings}
        />

        {editing ? (
          <QuizCandidateEditor value={draft} onChange={setDraft} idPrefix={`cand-${candidate.question_text.slice(0, 8)}`} />
        ) : (
          <>
            <p className="text-sm font-medium leading-snug text-foreground">{draft.question_text}</p>
            <ul className="space-y-1">
              {draft.choices.map((c, i) => {
                const isCorrect = c.trim().toLowerCase() === draft.correctAnswer.trim().toLowerCase();
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                      isCorrect ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-border/30 text-muted-foreground"
                    }`}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span>{c}</span>
                    {isCorrect && <span className="ml-auto text-[10px] font-semibold text-emerald-400">Correct</span>}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Correct answer: <span className="font-medium text-emerald-400">{draft.correctAnswer || correct}</span>
            </p>
            {draft.explanation && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">{draft.explanation}</p>
            )}
          </>
        )}

        {/* Generation warnings */}
        {candidate.warnings.length > 0 && (
          <div className="space-y-0.5 rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[10px] text-amber-300/90">
            {candidate.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Evidence */}
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Evidence &amp; sources
          </summary>
          <div className="mt-2 space-y-2">
            <QuizEvidenceTable evidence={candidate.evidence} />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Database className="h-3 w-3" aria-hidden />
              {candidate.source_tables.join(", ")}
            </p>
          </div>
        </details>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
          {editing ? (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                disabled={!validation.ok || saving}
                onClick={() => onSave(draft)}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save draft
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[11px]"
                onClick={() => { setDraft(candidateToEditable(candidate)); setEditing(false); }}
              >
                <X className="h-3 w-3" /> Cancel edits
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                disabled={saved || saving || !validation.ok}
                onClick={() => onSave(draft)}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saved ? "Saved" : "Save draft"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={saved} onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px] text-muted-foreground" onClick={onDiscard}>
                <Trash2 className="h-3 w-3" /> Discard
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
