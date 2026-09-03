/**
 * PT1.2 (revised) — REVIEW, as two sources under one question-scoped surface.
 *
 * THE JOB SPLIT THE RECORD NOW KEEPS
 * ──────────────────────────────────
 *   HISTORY  "what happened in that match/session?"   event-scoped
 *   REVIEW   "what questions do I own, and which do   question-scoped
 *             I need to work on?"
 *
 * REVIEW was the missed-question bank alone. PT1's permanent question
 * ownership is the same KIND of object — a question, not an event — so it
 * lands here as a second source rather than as a third pane. The audit that
 * produced this decision is in `docs/PT1_MONETIZATION_HANDOFF.md` §12.10-12.11.
 *
 * TWO SOURCES, STATED AS TWO
 * ──────────────────────────
 * They are genuinely different stores and this surface never pretends
 * otherwise:
 *
 *   OWNED   `ranked_question_discoveries` via /api/ranked/question-library.
 *           Ranked only. Question-scoped: one row per question, deduped,
 *           with lifetime counters. Permanent — it outlives match retention.
 *   MISSED  `quiz_attempts` via /api/quiz/missed-questions. Quiz/Daily only —
 *           a Ranked question can never appear here. Attempt-scoped: one row
 *           per wrong answer, so the same question can appear twice.
 *
 * Blending them into one list would have required inventing a join that does
 * not exist in either database, and would have quietly told the reader that
 * their Ranked mistakes were in the missed bank. They are not.
 *
 * ENTITLEMENT IS PER SOURCE, NOT PER PANE
 * ───────────────────────────────────────
 * OWNED is FREE — PT1's rule is that a player may review the questions they
 * permanently own; it needs a real account and nothing else. MISSED keeps the
 * Pro gate it already shipped with, unchanged, including its Free paywall
 * copy. Putting them side by side must not move either line, so the sub-tabs
 * carry no entitlement logic at all: each source states its own.
 *
 * OWNED opens first because it is the one every signed-in player can use.
 *
 * INDEPENDENT BY CONSTRUCTION
 * ───────────────────────────
 * Each source owns its own loader, and each loader is `enabled` only while its
 * own tab is open. So MISSED being down cannot blank OWNED, a Free account
 * hitting the MISSED paywall never touches the library read, and a reader who
 * only ever opens OWNED never calls the Pro-gated endpoint at all.
 */
import { useState } from "react";
import { BookX, Library as LibraryIcon } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import MissedQuestionsReview from "@/components/quiz/workspace/MissedQuestionsReview";
import OwnedQuestionsPane from "@/components/quiz/workspace/OwnedQuestionsPane";
import type { MissedQuestionsState } from "@/components/quiz/workspace/useMissedQuestions";
import type { QuestionLibraryState } from "@/components/quiz/workspace/useQuestionLibrary";

/** Which source REVIEW is showing. Local state: `/quiz#review` already
 *  addresses the pane, and a sub-hash for a two-button switch would be more
 *  navigation machinery than the choice is worth. */
export type ReviewSource = "owned" | "missed";

export const REVIEW_SOURCES: readonly ReviewSource[] = ["owned", "missed"] as const;

const SOURCE_META: Record<
  ReviewSource,
  { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }
> = {
  owned: {
    label: "Owned",
    icon: LibraryIcon,
    hint: "Questions you have permanently collected.",
  },
  missed: {
    label: "Missed",
    icon: BookX,
    hint: "Questions you got wrong, with the answers.",
  },
};

export default function ReviewPane({
  enabled = true,
  hasAccount = true,
  signInHref = "/auth",
  missedState,
  ownedState,
  className = "",
}: {
  /** False while REVIEW is not the open workspace pane. */
  enabled?: boolean;
  /** False for a guest or a Supabase anonymous session. OWNED needs a real
   *  account to belong to; MISSED reads its own entitlement. */
  hasAccount?: boolean;
  signInHref?: string;
  /** Pre-resolved sources, for a host that must not fetch
   *  (`/dev/lobby-preview`). Production passes neither. */
  missedState?: MissedQuestionsState;
  ownedState?: QuestionLibraryState;
  className?: string;
}) {
  const [source, setSource] = useState<ReviewSource>("owned");

  return (
    <div className={className} data-testid="review-pane" data-source={source}>
      {/* A quieter switch than the workspace's own tab strip: these are two
          sources within one pane, not two views of the page, so they read as
          chips on the sheet rather than as a second row of tabs competing
          with the one directly above them. */}
      <div
        role="tablist"
        aria-label="Review source"
        data-testid="review-sources"
        className="flex flex-wrap items-center gap-1 pb-2"
      >
        {REVIEW_SOURCES.map((id) => {
          const active = id === source;
          const Icon = SOURCE_META[id].icon;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`review-source-${id}`}
              aria-selected={active}
              aria-controls={`review-panel-${id}`}
              tabIndex={active ? 0 : -1}
              data-testid={`review-source-${id}`}
              onClick={() => setSource(id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const i = REVIEW_SOURCES.indexOf(id);
                setSource(
                  REVIEW_SOURCES[
                    e.key === "ArrowRight"
                      ? (i + 1) % REVIEW_SOURCES.length
                      : (i - 1 + REVIEW_SOURCES.length) % REVIEW_SOURCES.length
                  ],
                );
              }}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                borderColor: active ? LEAGUECRAFT_INK.brass : LEAGUECRAFT_INK.rule,
                background: active ? LEAGUECRAFT_INK.inset : "transparent",
                color: active ? LEAGUECRAFT_INK.heading : LEAGUECRAFT_INK.faint,
                textShadow: active ? LEAGUECRAFT_INK.press : undefined,
              }}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {SOURCE_META[id].label}
            </button>
          );
        })}
        <span
          className="ml-auto hidden pl-3 text-[10px] sm:inline"
          style={{ color: LEAGUECRAFT_INK.faint }}
        >
          {SOURCE_META[source].hint}
        </span>
      </div>

      <div
        role="tabpanel"
        id={`review-panel-${source}`}
        aria-labelledby={`review-source-${source}`}
        data-testid={`review-panel-${source}`}
      >
        {source === "owned" ? (
          <OwnedQuestionsPane
            enabled={enabled && source === "owned"}
            hasAccount={hasAccount}
            signInHref={signInHref}
            state={ownedState}
          />
        ) : (
          <MissedQuestionsReview
            enabled={enabled && source === "missed"}
            state={missedState}
          />
        )}
      </div>
    </div>
  );
}
