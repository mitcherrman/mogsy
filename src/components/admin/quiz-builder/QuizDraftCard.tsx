import { Pencil, Ban, Send, RotateCcw, Database, ExternalLink, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuizEvidenceTable } from "./QuizEvidenceTable";
import { CoverageBadge, DraftStatusBadge, DifficultyBadge } from "./QuizBuilderStatusBadge";
import { isProductionReady, INCOMPLETE_SEND_REASON } from "@/lib/quiz-builder/logic";
import type { QuizBuilderDraft } from "@/lib/quiz/api";

const REVIEWER_ROUTE = "/admin/quiz-review";

type Props = {
  draft: QuizBuilderDraft;
  templateLabel: string;
  onEdit?: (draft: QuizBuilderDraft) => void;
  onReject?: (draft: QuizBuilderDraft) => void;
  onRestore?: (draft: QuizBuilderDraft) => void;
  onSend?: (draft: QuizBuilderDraft) => void;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * One draft, rendered according to its status. Sent-to-reviewer drafts are
 * strictly read-only (no edit/reject/restore/resend). Send-to-reviewer is
 * disabled for non-complete coverage with an explanatory tooltip.
 */
export function QuizDraftCard({ draft, templateLabel, onEdit, onReject, onRestore, onSend }: Props) {
  const correct = draft.correct_answer.value;
  const ready = isProductionReady(draft.coverage_status);
  const isSent = draft.status === "sent_to_review";
  const isRejected = draft.status === "rejected";

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">#{draft.id}</span>
            <DraftStatusBadge status={draft.status} />
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{templateLabel}</span>
            <span className="text-[10px] text-muted-foreground">{draft.year} · {draft.scope_name}</span>
            <DifficultyBadge difficulty={draft.difficulty} />
            <CoverageBadge status={draft.coverage_status} />
          </div>
          <span className="text-[10px] text-muted-foreground">Updated {fmtDate(draft.updated_at)}</span>
        </div>

        <p className="text-sm font-medium leading-snug text-foreground">{draft.question_text}</p>

        <ul className="space-y-1">
          {draft.choices.map((c, i) => {
            const isCorrect = c.trim().toLowerCase() === correct.trim().toLowerCase();
            return (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${
                  isCorrect ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-border/30 text-muted-foreground"
                }`}
              >
                {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span>{c}</span>
                {isCorrect && <span className="ml-auto text-[10px] font-semibold text-emerald-400">Correct</span>}
              </li>
            );
          })}
        </ul>

        {draft.explanation && <p className="text-[11px] leading-relaxed text-muted-foreground">{draft.explanation}</p>}

        {isRejected && draft.rejection_reason && (
          <div className="rounded-md border border-red-400/30 bg-red-400/5 px-2.5 py-1.5 text-[11px] text-red-300">
            <span className="font-semibold">Rejection reason:</span> {draft.rejection_reason}
          </div>
        )}

        {isSent && (
          <div className="rounded-md border border-violet-400/30 bg-violet-400/5 px-2.5 py-1.5 text-[11px] text-violet-200">
            <p>Promoted question <span className="font-semibold">#{draft.promoted_question_id}</span> · sent {fmtDate(draft.sent_to_review_at)}</p>
            <p className="mt-0.5 text-violet-200/80">Inactive &amp; unreviewed — not publicly playable until approved in the reviewer.</p>
          </div>
        )}

        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">Evidence &amp; sources</summary>
          <div className="mt-2 space-y-2">
            <QuizEvidenceTable evidence={draft.evidence} />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Database className="h-3 w-3" aria-hidden />
              {draft.source_tables.join(", ")} · key {draft.question_key}
            </p>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
          {isSent ? (
            <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
              <Link to={REVIEWER_ROUTE}>
                <ExternalLink className="h-3 w-3" /> Open in reviewer
              </Link>
            </Button>
          ) : isRejected ? (
            onRestore && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => onRestore(draft)}>
                <RotateCcw className="h-3 w-3" /> Restore to draft
              </Button>
            )
          ) : (
            <>
              {onEdit && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => onEdit(draft)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
              {onSend && (
                <span title={ready ? undefined : INCOMPLETE_SEND_REASON}>
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    disabled={!ready}
                    onClick={() => onSend(draft)}
                  >
                    <Send className="h-3 w-3" /> Send to reviewer
                  </Button>
                </span>
              )}
              {onReject && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px] text-red-300 hover:text-red-200" onClick={() => onReject(draft)}>
                  <Ban className="h-3 w-3" /> Reject
                </Button>
              )}
            </>
          )}
        </div>

        {!ready && !isSent && !isRejected && (
          <p className="text-[10px] text-amber-400/80">{INCOMPLETE_SEND_REASON}</p>
        )}
      </CardContent>
    </Card>
  );
}
