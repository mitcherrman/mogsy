/**
 * MALT — the MISSED QUESTION BANK, as review.
 *
 * Rendered once, mounted twice: by the workspace's Review pane on `/quiz` and
 * by the standalone `/lol/missed-questions` page. Every state the bank has —
 * loading, Pro content, the truthful Pro empty state, the Free paywall, a
 * session failure and a backend failure — belongs to this component, so the
 * two surfaces cannot disagree about a player's entitlement.
 *
 * WHAT IS PRESERVED, EXACTLY
 * ──────────────────────────
 * The question, the answer the player gave, the correct answer, the
 * explanation, the category and difficulty, when it was missed, the page size
 * and `Load more`, and the Free/Pro states with the existing upsell copy.
 * Monetisation is untouched in this phase.
 *
 * WHAT IS REMOVED, AND WHY
 * ────────────────────────
 * The "Practice missed questions" button is gone. It never practised
 * anything: it opened a toast saying practice mode was coming soon. A control
 * that looks like the bank's primary action and does nothing is worse than no
 * control — and putting it INSIDE the lobby, where the reader has real play
 * entrances a scroll above it, would have made it read as one of them. There
 * is no retry-missed backend path in this phase, so the honest surface is the
 * one that does not imply there is. When retry-missed is built it lands here,
 * once, for both mounts.
 *
 * Presentation plus its own loader — see `useMissedQuestions` for why the
 * fetch is gated rather than run on every lobby load.
 */
import { Link } from "react-router-dom";
import { Check, Lock, X as XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { WorkspaceNote } from "@/components/quiz/workspace/primitives";
import type { MissedQuestion } from "@/lib/quiz/api";
import { useMissedQuestions, type MissedQuestionsState } from "@/components/quiz/workspace/useMissedQuestions";

function formatMissedDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One missed question, as an entry rather than a card.
 *
 * It keeps a border because a review entry genuinely is a unit — question,
 * two answers and an explanation read together — but it stays flat and
 * hairline-ruled in the ledger's own brass, not a raised dashboard tile.
 */
function MissedQuestionEntry({ q }: { q: MissedQuestion }) {
  return (
    <li
      data-testid="missed-question"
      className="rounded-md border px-3 py-2.5"
      style={{ borderColor: "rgba(96,68,28,0.34)", background: LEAGUECRAFT_INK.inset }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {q.category && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {q.category}
          </Badge>
        )}
        {q.difficulty != null && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            Difficulty {q.difficulty}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/80">
          Missed {formatMissedDate(q.missed_at)}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-foreground/90">
        {q.question_text || "Question no longer available."}
      </p>
      <div className="mt-1.5 space-y-1 text-[11.5px]">
        <p className="flex items-start gap-1.5" style={{ color: LEAGUECRAFT_INK.rubric }}>
          <XIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Your answer: {q.selected_answer || "—"}</span>
        </p>
        {q.correct_answer && (
          <p className="flex items-start gap-1.5" style={{ color: "#1f5c3c" }}>
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Correct answer: {q.correct_answer}</span>
          </p>
        )}
      </div>
      {q.explanation && (
        <p className="mt-2 rounded-md p-2 text-[11.5px] leading-relaxed"
          style={{ background: LEAGUECRAFT_INK.inset, color: LEAGUECRAFT_INK.body }}>
          {q.explanation}
        </p>
      )}
    </li>
  );
}

export default function MissedQuestionsReview({
  enabled = true,
  state: injected,
  className = "",
}: {
  /** False while the pane is closed, so the Pro-gated endpoint is only read
   *  by a reader who actually opened Review. */
  enabled?: boolean;
  /**
   * A pre-resolved bank, for a host that must not fetch. The only caller is
   * `/dev/lobby-preview`, whose whole contract is that it reads no account —
   * see `LobbyPreviewPage`. When supplied, nothing here touches the network.
   */
  state?: MissedQuestionsState;
  className?: string;
}) {
  const fetched = useMissedQuestions({ enabled: enabled && !injected });
  const { data, items, loading, loadingMore, error, hasMore, totalCount, loadMore, retry } =
    injected ?? fetched;

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`} data-testid="missed-questions-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-6 text-center text-muted-foreground ${className}`} data-testid="missed-questions-error">
        <MogzyMascot pose="awkwardSmile" decorative className="mx-auto mb-3 h-24 w-24" />
        <p className="text-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (data?.locked) {
    return (
      <div
        className={`flex flex-col items-center gap-3 rounded-md border px-4 py-8 text-center ${className}`}
        data-testid="missed-questions-locked"
        style={{ borderColor: "rgba(96,68,28,0.42)", background: LEAGUECRAFT_INK.inset }}
      >
        <Lock className="h-7 w-7" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />
        <p className="max-w-md text-[12.5px] text-foreground/85">
          {data.upsell_message ||
            "Upgrade to Mogsy Pro to review every question you missed and practice your weak spots."}
        </p>
        <Button asChild size="sm">
          <Link to="/lol/pro">Upgrade to Mogsy Pro</Link>
        </Button>
        <WorkspaceNote>
          Free players can review missed questions on each quiz’s results screen.
        </WorkspaceNote>
      </div>
    );
  }

  if (!data) return null;

  if (items.length === 0) {
    return (
      <div className={`py-8 text-center ${className}`} data-testid="missed-questions-empty">
        <MogzyMascot pose="sleeping" decorative className="mx-auto mb-3 h-24 w-24" />
        <p className="text-sm text-muted-foreground">No missed questions — flawless so far!</p>
        <Button asChild size="sm" className="mt-3">
          <Link to="/quiz">Play a quiz</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={className} data-testid="missed-questions">
      <div className="pb-1.5">
        <WorkspaceNote testId="missed-questions-scope">
          <span className="font-semibold tabular-nums text-foreground/80">{totalCount}</span> missed
          question{totalCount === 1 ? "" : "s"} in the bank
          {items.length < totalCount ? ` — ${items.length} loaded` : ""}.
        </WorkspaceNote>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((q) => (
          <MissedQuestionEntry key={q.attempt_id} q={q} />
        ))}
      </ul>
      {hasMore && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
