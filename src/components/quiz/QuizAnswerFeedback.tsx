/**
 * The production post-answer feedback box (Correct!/Incorrect header,
 * correct-answer line, explanation, pro-data source link), extracted verbatim
 * from Quiz.tsx for reuse by the screenshot render harness. Visual behavior
 * is unchanged; the AnimatePresence wrapper and XP reward card remain in
 * Quiz.tsx because they are gameplay-session concerns.
 */
import { CheckCircle2, XCircle } from "lucide-react";
import ProDataSourceLink from "@/components/quiz/ProDataSourceLink";

export type QuizFeedbackResult = {
  is_correct: boolean;
  correct_answer?: string;
  explanation?: string;
};

type QuizAnswerFeedbackProps = {
  result: QuizFeedbackResult;
  /** Current question metadata — drives the optional pro-data source link. */
  metadata?: Record<string, unknown>;
};

export default function QuizAnswerFeedback({ result, metadata }: QuizAnswerFeedbackProps) {
  return (
    <div
      data-quiz-answer-feedback
      className={`rounded-lg border p-4 text-sm ${
        result.is_correct
          ? "border-green-500/30 bg-green-500/10 text-green-400"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold mb-1">
        {result.is_correct ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Correct!
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4" />
            Incorrect
          </>
        )}
      </div>
      {!result.is_correct && result.correct_answer && (
        <p className="text-xs opacity-90 mb-1">
          Correct answer: <span className="font-semibold">{result.correct_answer}</span>
        </p>
      )}
      {result.explanation && (
        <p className="text-xs opacity-80 leading-relaxed">{result.explanation}</p>
      )}
      {/* Post-answer only: renders itself when the question carries
          valid pro-data source metadata, otherwise nothing. */}
      <ProDataSourceLink metadata={metadata} />
    </div>
  );
}
