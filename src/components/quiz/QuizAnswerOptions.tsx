/**
 * The production quiz answer-choice grid, extracted verbatim from Quiz.tsx so
 * it can be reused by both the live quiz page and the screenshot render
 * harness (/dev/quiz-render). Visual behavior is unchanged.
 *
 * data-quiz-choice / data-choice-state are stable selectors for browser
 * automation; data-choice-state mirrors ONLY what is visually displayed
 * (idle | selected | correct | incorrect-selected), so an unanswered render
 * carries no correct-answer information in the DOM.
 */
import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

export type QuizChoiceObject = { label: string; image_path?: string; champion_name?: string };
export type QuizChoice = string | QuizChoiceObject;

export function getChoiceLabel(choice: QuizChoice): string {
  return typeof choice === "string" ? choice : choice.label;
}

export function getChoiceImage(choice: QuizChoice): string | undefined {
  if (typeof choice === "string") return undefined;
  return choice.image_path || undefined;
}

export function choicesHaveImages(choices: QuizChoice[]): boolean {
  return (choices || []).some(
    (c) => typeof c === "object" && c !== null && !!(c as QuizChoiceObject).image_path,
  );
}

/** Minimal reveal shape: only the field the choice grid reads. */
export type QuizAnswerRevealResult = { correct_answer?: string | null };

type QuizAnswerOptionsProps = {
  choices: QuizChoice[];
  selectedAnswer: string | null;
  /** Non-null once the answer is judged; enables reveal styling + disables buttons. */
  answerResult: QuizAnswerRevealResult | null;
  onSelect: (label: string) => void;
};

export default function QuizAnswerOptions({
  choices,
  selectedAnswer,
  answerResult,
  onSelect,
}: QuizAnswerOptionsProps) {
  const hasImages = choicesHaveImages(choices);
  return (
    <div
      data-quiz-answer-options
      className={hasImages ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-1 gap-2.5 [@media(max-height:480px)_and_(orientation:landscape)]:grid-cols-2 [@media(max-height:480px)]:gap-2"}
    >
      {(choices || []).map((choice, idx) => {
        const label = getChoiceLabel(choice);
        const imgPath = getChoiceImage(choice);
        const imgUrl = imgPath ? resolveQuizAssetUrl(imgPath) : undefined;
        const isSelected = selectedAnswer === label;
        const isCorrect = answerResult?.correct_answer === label;
        let btnVariant: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" | "hero" | "accent" = "outline";
        if (answerResult) {
          if (isCorrect) btnVariant = "default";
          else if (isSelected) btnVariant = "destructive";
          else btnVariant = "outline";
        } else if (isSelected) {
          btnVariant = "default";
        }
        const choiceState = answerResult
          ? isCorrect
            ? "correct"
            : isSelected
              ? "incorrect-selected"
              : "idle"
          : isSelected
            ? "selected"
            : "idle";

        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.07, duration: 0.35, ease: "easeOut" }}
          >
            <Button
              variant={btnVariant}
              data-quiz-choice={idx}
              data-choice-state={choiceState}
              onClick={() => onSelect(label)}
              disabled={!!answerResult}
              className={
                imgUrl
                  ? "w-full h-auto flex-col items-center gap-2 py-3 px-3 whitespace-normal font-medium text-sm leading-relaxed"
                  : "w-full justify-start text-left h-auto py-3 px-4 whitespace-normal font-medium text-sm leading-relaxed"
              }
            >
              {imgUrl ? (
                <>
                  <div
                    className="relative rounded-md overflow-hidden"
                    style={{
                      padding: 2,
                      background:
                        "linear-gradient(145deg, #f0d78c 0%, #c9a84c 50%, #7a5e22 100%)",
                      boxShadow:
                        "0 0 12px rgba(201,168,76,0.35), 0 4px 12px rgba(0,0,0,0.45)",
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={label}
                      className="h-20 w-20 md:h-24 md:w-24 object-cover block rounded-sm"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 w-full justify-center">
                    <span className="text-xs text-muted-foreground font-bold">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className="text-center">{label}</span>
                    {answerResult && isCorrect && (
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground shrink-0" />
                    )}
                    {answerResult && isSelected && !isCorrect && (
                      <XCircle className="h-4 w-4 text-destructive-foreground shrink-0" />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="mr-2 shrink-0 text-xs text-muted-foreground font-bold">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span className="flex-1">{label}</span>
                  {answerResult && isCorrect && (
                    <CheckCircle2 className="h-4 w-4 text-primary-foreground ml-2 shrink-0" />
                  )}
                  {answerResult && isSelected && !isCorrect && (
                    <XCircle className="h-4 w-4 text-destructive-foreground ml-2 shrink-0" />
                  )}
                </>
              )}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
