import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { validateEditableQuestion, type EditableQuestion } from "@/lib/quiz-builder/logic";

type Props = {
  value: EditableQuestion;
  onChange: (next: EditableQuestion) => void;
  idPrefix: string;
};

/**
 * Controlled editor for a question's wording, choices, correct answer,
 * explanation, and difficulty. Correct answer is chosen by selecting a choice
 * (radio semantics) so it always references an existing choice. Inline
 * validation errors are shown live. Reused by the candidate save flow and the
 * draft edit sheet.
 */
export function QuizCandidateEditor({ value, onChange, idPrefix }: Props) {
  const validation = validateEditableQuestion(value);

  const setChoice = (i: number, text: string) => {
    const choices = value.choices.map((c, idx) => (idx === i ? text : c));
    // If we're renaming the currently-correct choice, keep it selected.
    const wasCorrect = value.choices[i].trim().toLowerCase() === value.correctAnswer.trim().toLowerCase();
    onChange({ ...value, choices, correctAnswer: wasCorrect ? text : value.correctAnswer });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-question`} className="text-[11px] font-medium text-muted-foreground">
          Question text
        </Label>
        <Textarea
          id={`${idPrefix}-question`}
          value={value.question_text}
          onChange={(e) => onChange({ ...value, question_text: e.target.value })}
          className="min-h-[60px] text-xs"
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-medium text-muted-foreground">
          Answer choices <span className="font-normal">(select the correct one)</span>
        </legend>
        {value.choices.map((choice, i) => {
          const isCorrect = choice.trim() !== "" && choice.trim().toLowerCase() === value.correctAnswer.trim().toLowerCase();
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...value, correctAnswer: choice })}
                aria-pressed={isCorrect}
                aria-label={`Mark "${choice || `choice ${i + 1}`}" as the correct answer`}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isCorrect
                    ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                    : "border-muted-foreground/40 text-muted-foreground hover:border-emerald-400/60"
                }`}
              >
                {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              </button>
              <Input
                value={choice}
                onChange={(e) => setChoice(i, e.target.value)}
                aria-label={`Choice ${i + 1}`}
                className={`h-7 text-xs ${isCorrect ? "border-emerald-400/50" : ""}`}
              />
              {isCorrect && <span className="text-[10px] font-medium text-emerald-400">correct</span>}
            </div>
          );
        })}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-explanation`} className="text-[11px] font-medium text-muted-foreground">
          Explanation
        </Label>
        <Textarea
          id={`${idPrefix}-explanation`}
          value={value.explanation}
          onChange={(e) => onChange({ ...value, explanation: e.target.value })}
          className="min-h-[48px] text-xs"
        />
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Difficulty</span>
        <div className="flex gap-1.5" role="group" aria-label="Difficulty">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ ...value, difficulty: d })}
              aria-pressed={value.difficulty === d}
              className={`flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition-colors ${
                value.difficulty === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {!validation.ok && (
        <ul className="space-y-0.5 rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1.5 text-[11px] text-red-300" role="alert">
          {validation.errors.map((err, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
