/**
 * RG3 — the verdict, in one compact line, wherever a surface needs one beside
 * the thing it judged.
 *
 * The Ranked arena does NOT use this: its verdict already resolves in the top
 * result strip (`RoundResultBeat`), and a second verdict beside the answer grid
 * would be two surfaces answering one question — the exact duplication the
 * arena's bottom result bar was removed to end. This exists for the surfaces
 * that have no top strip: the Meta Reflex block, which resolves per card inside
 * its own viewport, and the Daily card, whose retry state has to say "your
 * score is spent" without saying what the answer was.
 *
 * `Time!` rather than "Timed out": the Ranked strip already uses the short,
 * loud register for an expiry, and a card beat that runs for a second and a
 * half is the wrong place for a two-word past participle.
 */
import { CheckCircle2, Hourglass, XCircle } from "lucide-react";
import {
  VERDICT_HEADLINE,
  type FeedbackVerdict,
} from "@/lib/question-feedback/model";

const TONE: Record<FeedbackVerdict, { text: string; Icon: typeof CheckCircle2 }> = {
  correct: { text: "text-emerald-300", Icon: CheckCircle2 },
  incorrect: { text: "text-[#e2757b]", Icon: XCircle },
  timeout: { text: "text-muted-foreground", Icon: Hourglass },
};

export function VerdictLine({
  verdict,
  /** Short qualifier shown beside the verdict — e.g. the Daily's score lock. */
  note = null,
  className = "",
}: {
  verdict: FeedbackVerdict | null;
  note?: React.ReactNode;
  className?: string;
}) {
  // No verdict is a real state (a settled card with neither an attempt nor an
  // expiry). Nothing is drawn rather than a neutral placeholder, which would
  // be this surface making a ruling the server declined to make.
  if (!verdict) return null;
  const { text, Icon } = TONE[verdict];
  return (
    <p
      role="status"
      data-testid="answer-verdict"
      data-verdict={verdict}
      // Fixed height so the appearance of a verdict never moves the answer
      // surface above it; `nowrap` on the headline so only the optional note
      // can ever wrap.
      className={`flex h-7 items-center gap-1.5 ${className}`}
    >
      <Icon aria-hidden className={`h-4 w-4 shrink-0 ${text}`} />
      <span
        className={`whitespace-nowrap text-sm font-black uppercase tracking-[0.08em] ${text}`}
      >
        {VERDICT_HEADLINE[verdict]}
      </span>
      {note && (
        <span
          data-testid="answer-verdict-note"
          className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          {note}
        </span>
      )}
    </p>
  );
}
