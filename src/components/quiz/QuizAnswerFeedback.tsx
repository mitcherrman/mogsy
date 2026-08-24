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
  /**
   * ARENA1 Step 5 — an OVERRIDE for the verdict line's words and colour.
   * Absent (every caller before Step 5) keeps the two-state behaviour below
   * exactly as it was, icon included.
   *
   * It exists for the one resolution the two states cannot name: a card
   * solved after its scored attempt was spent, which is neither "Correct!"
   * nor "Incorrect" and must not be shouted in red. The WORDS are the mode's
   * — a Daily card is "Learned", a Ranked round has no such state — so they
   * arrive as copy rather than being derived here.
   */
  verdict?: QuizFeedbackVerdict | null;
};

/** Mode copy for the verdict line. Presentation only; carries no correctness. */
export type QuizFeedbackVerdict = {
  label: string;
  tone: "positive" | "negative" | "neutral";
};

const TONE: Record<"positive" | "negative" | "neutral", string> = {
  positive: "border-green-500/30 bg-green-500/10 text-green-400",
  negative: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-sky-400/30 bg-sky-500/10 text-sky-300",
};

type QuizAnswerFeedbackProps = {
  result: QuizFeedbackResult;
  /** Current question metadata — drives the optional pro-data source link. */
  metadata?: Record<string, unknown>;
};

export default function QuizAnswerFeedback({ result, metadata }: QuizAnswerFeedbackProps) {
  const tone = result.verdict?.tone ?? (result.is_correct ? "positive" : "negative");
  return (
    <div
      data-quiz-answer-feedback
      data-verdict-tone={tone}
      className={`rounded-lg border p-4 text-sm ${TONE[tone]}`}
    >
      <div className="flex items-center gap-2 font-semibold mb-1">
        {tone === "negative"
          ? <XCircle className="h-4 w-4" />
          : <CheckCircle2 className="h-4 w-4" />}
        {result.verdict ? result.verdict.label : result.is_correct ? "Correct!" : "Incorrect"}
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
