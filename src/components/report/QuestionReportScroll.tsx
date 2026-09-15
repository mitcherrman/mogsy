/**
 * FB1-4 — "something's wrong with this question", reported from inside play.
 *
 * WHERE IT LIVES, AND WHY IT CANNOT DISTURB A MATCH
 * ────────────────────────────────────────────────
 * The same shell as Ranked Rules (`MogzyExplainsPanel`), in the mirrored half
 * of the same dock (`MogzyDock`) — this one bottom-LEFT, Rules bottom-right —
 * for the same reason: it is `position: fixed`, outside
 * `ArenaShell` and outside every mode's layout, so it covers no prompt, no
 * answer tablet, no clock and no score at any width. Nothing here pauses,
 * blocks, focus-traps or navigates. Submitting is an ordinary async insert on
 * a component that owns no mode state — the round it was filed during keeps
 * running exactly as it would have, and a round that ends mid-submission ends
 * normally.
 *
 * The tab appears only while a mode is publishing a question
 * (`useReportableQuestion`), so it is absent on lobbies, results screens and
 * every non-quiz route rather than being a permanent piece of furniture that
 * usually reports nothing.
 *
 * WHAT IT CAPTURES
 * ────────────────
 * Whatever the publishing mode gave it, and nothing it went looking for. In
 * particular the canonical answer appears only when the mode already revealed
 * it to this player — a report control able to surface an unrevealed answer,
 * on demand, mid-question, would be an answer leak with a form attached.
 */

import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { MogzyExplainsPanel } from "@/components/ranked-rules/MogzyExplainsPanel";
import { DOCK_ORDER, DOCK_SIDE } from "@/components/mogzy-dock/MogzyDock";
import { useAuth } from "@/hooks/useAuth";
import { FeedbackRateLimitError } from "@/lib/feedback/client";
import { FEEDBACK_LIMITS } from "@/lib/feedback/contract";
import { useReportableQuestion } from "@/lib/feedback/reportable-question";
import {
  QUESTION_REPORT_REASONS,
  QUESTION_REPORT_REASON_LABELS,
  type QuestionReportReason,
} from "@/lib/feedback/report-context";
import { MissingProfileError, submitQuestionReport } from "@/lib/feedback/submitReport";

export function QuestionReportScroll() {
  const snapshot = useReportableQuestion();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<QuestionReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  /* A new question means a new report. Resetting on the question's identity
     rather than on close is what stops a reason picked for round 3 from being
     silently attached to round 4 by a player who left the panel open. */
  const questionIdentity = snapshot
    ? `${snapshot.mode}|${snapshot.questionKey ?? ""}|${snapshot.runtimeQuestionId ?? ""}|${snapshot.staticQuestionId ?? ""}|${snapshot.roundNumber ?? ""}`
    : "";
  useEffect(() => {
    setReason(null);
    setComment("");
    setSent(false);
  }, [questionIdentity]);

  const close = useCallback(() => setOpen(false), []);

  const submit = useCallback(async () => {
    if (!snapshot || !reason || submitting) return;
    if (!user) {
      toast.error("Sign in to report a question.");
      return;
    }
    setSubmitting(true);
    try {
      await submitQuestionReport({
        userId: user.id,
        snapshot,
        reason,
        comment,
        route: pathname,
      });
      setSent(true);
      // The panel stays put and stays open on the confirmation. Closing it for
      // the player would move focus during a live round.
      toast.success("Thanks — that question has been reported.");
    } catch (err) {
      if (err instanceof FeedbackRateLimitError || err instanceof MissingProfileError) {
        toast.error(err.message);
      } else {
        toast.error("We couldn't send that report. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [snapshot, reason, submitting, user, comment, pathname]);

  // No question on screen, no control. This is the whole gate: every mode that
  // publishes gets the reporter, every surface that does not is untouched.
  if (!snapshot) return null;

  return (
    <MogzyExplainsPanel
      open={open}
      onOpen={() => setOpen(true)}
      onClose={close}
      dockOrder={DOCK_ORDER.questionReport}
      /* Bottom-LEFT, mirroring Ranked Rules on the right. The reporter is the
         transient half of the pair — it exists only while a question is on
         screen — so it takes the corner the player's eye is not already
         trained on for the mode's standing explanation. */
      side={DOCK_SIDE.questionReport}
      title="Report this question"
      tabLabel="Report"
      openLabel="Report a problem with this question"
      testId="question-report"
      acknowledgeLabel="Close"
    >
      {sent ? (
        <div data-testid="question-report-sent" className="space-y-2 py-1">
          <p className="text-sm font-semibold text-[#3f3014]">Report sent.</p>
          <p className="text-xs leading-relaxed text-[#4a3818]/85">
            We captured the question exactly as you saw it, so there's nothing
            else you need to do. Carry on — your run is unaffected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-[#4a3818]/85">
            What's wrong with it? We'll attach the question, its choices and
            where you are automatically.
          </p>

          <fieldset className="space-y-1.5">
            <legend className="sr-only">Reason</legend>
            {QUESTION_REPORT_REASONS.map(value => {
              const checked = reason === value;
              return (
                <label
                  key={value}
                  data-testid={`question-report-reason-${value}`}
                  data-selected={checked ? "true" : undefined}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3
                    text-[13px] font-semibold transition-colors
                    ${checked
                      ? "border-[#8a6a26] bg-[#6b5220]/20 text-[#3f3014]"
                      : "border-[#8a6a26]/40 text-[#4a3818] hover:bg-[#6b5220]/10"}`}
                >
                  <input
                    type="radio"
                    name="question-report-reason"
                    value={value}
                    checked={checked}
                    onChange={() => setReason(value)}
                    className="h-4 w-4 shrink-0 accent-[#8a6a26]"
                  />
                  {QUESTION_REPORT_REASON_LABELS[value]}
                </label>
              );
            })}
          </fieldset>

          <div className="space-y-1">
            <label
              htmlFor="question-report-comment"
              className="ranked-eyebrow !text-[#6b5220]"
            >
              Anything to add? (optional)
            </label>
            <textarea
              id="question-report-comment"
              data-testid="question-report-comment"
              value={comment}
              onChange={event => setComment(event.target.value)}
              maxLength={FEEDBACK_LIMITS.reportComment}
              rows={3}
              placeholder="e.g. the second option is also correct"
              className="w-full resize-none rounded-md border border-[#8a6a26]/45 bg-[#f6ecd2]/70
                px-2.5 py-2 text-[13px] text-[#3f3014] placeholder:text-[#4a3818]/45
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1
                focus-visible:outline-[#8a6a26]"
            />
          </div>

          <button
            type="button"
            data-testid="question-report-submit"
            onClick={() => void submit()}
            disabled={!reason || submitting}
            className="min-h-11 w-full rounded-md border border-[#8a6a26]/55 bg-[#6b5220]/15
              px-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#4a3818]
              transition-colors hover:bg-[#6b5220]/25 disabled:cursor-not-allowed
              disabled:opacity-45
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[#8a6a26]"
          >
            {submitting ? "Sending…" : "Send report"}
          </button>
        </div>
      )}
    </MogzyExplainsPanel>
  );
}
