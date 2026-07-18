/**
 * Shared question presentation (F1 canonical arena, Phase B). Renders the
 * QuestionView prompt/category and hosts the answer controls as children so
 * modes can compose AnswerGrid (or a scripted variant) inside one region.
 */
import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { QuestionView } from "@/lib/ranked-core/viewTypes";

export function QuestionPanel({
  question,
  children,
}: {
  question: QuestionView;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Question" data-testid="question-panel" className="space-y-3">
      <header className="space-y-1">
        {question.category && (
          <Badge variant="outline" className="text-[10px]">
            {question.category}
          </Badge>
        )}
        <h2 className="text-base font-semibold leading-snug">{question.prompt}</h2>
      </header>
      {children}
    </section>
  );
}
