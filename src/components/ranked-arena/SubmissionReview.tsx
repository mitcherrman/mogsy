/**
 * Canonical submission review (F1 Phase C1): the review step of the
 * select → review → confirm-atomically → locked flow. Fully controlled: the
 * phase, the chosen answer/ability display strings, and any status copy come
 * from the controller; the component emits review / edit / confirm intents
 * only. It performs no network call, no optimistic settlement, and carries no
 * correctness state (correctness exists only on resolved rounds).
 */
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { InteractionPermissions, SubmissionView } from "@/lib/ranked-core/viewTypes";

export interface SubmissionStatusMessage {
  tone: "info" | "error";
  text: string;
}

export interface SubmissionReviewProps {
  submission: SubmissionView;
  /** Display label of the chosen answer; null = nothing chosen yet. */
  answerLabel: string | null;
  /** Display name of the armed ability; null = deliberate no-ability. */
  abilityName: string | null;
  permissions: InteractionPermissions;
  onReview: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  /** Externally supplied status/failure copy (e.g. submission rejected). */
  statusMessage?: SubmissionStatusMessage | null;
  /** Controller-supplied copy overrides. */
  confirmLabel?: string;
  /**
   * Interaction shape (presentation only — NOT mode identity):
   *  - "review" (default): explicit select → Review → confirm (used by the
   *    Ranked Tutorial, which teaches the atomic-lock step, and staff tooling).
   *  - "direct": one-shot streamlined lock — an inline selection summary plus a
   *    single primary "Lock in" CTA, no separate review step. The hidden
   *    simultaneous-lock semantics are identical (answer + ability submit
   *    together atomically); only the number of clicks differs.
   */
  flow?: "review" | "direct";
}

export function SubmissionReview({
  submission,
  answerLabel,
  abilityName,
  permissions,
  onReview,
  onEdit,
  onConfirm,
  statusMessage = null,
  confirmLabel = "Confirm & lock",
  flow = "review",
}: SubmissionReviewProps) {
  const { phase } = submission;
  const reviewDisabled = !permissions.canReviewSubmission || answerLabel === null;
  const reviewReason =
    answerLabel === null
      ? "Choose an answer first."
      : permissions.disabledReasons?.review;

  // Direct flow: one primary lock action straight from the selecting phase.
  // Gated on the same "may advance to lock" signal as the review button, so it
  // never bypasses input gating; the click submits atomically via onConfirm.
  const directLockDisabled = reviewDisabled;
  const directLabel = flow === "direct" && confirmLabel === "Confirm & lock"
    ? (abilityName ? "Lock in answer + ability" : "Lock in answer")
    : confirmLabel;

  return (
    <section aria-label="Submission" data-testid="submission-review" data-phase={phase} data-flow={flow}
      className="space-y-3">
      {phase !== "locked" && flow === "direct" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Answer</span>
              <span className="font-semibold" data-testid="summary-answer">{answerLabel ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Ability</span>
              <span className="font-semibold" data-testid="summary-ability">{abilityName ?? "No ability"}</span>
            </div>
          </div>
          <Button
            type="button"
            data-testid="lock-in-button"
            disabled={directLockDisabled}
            onClick={onConfirm}
            className="w-full min-h-[48px] text-base font-semibold"
          >
            <Lock className="h-4 w-4 mr-1.5" aria-hidden />
            {directLabel}
          </Button>
          {directLockDisabled && reviewReason && (
            <p className="text-[11px] text-muted-foreground text-center" role="note">
              {reviewReason}
            </p>
          )}
          {!directLockDisabled && (
            <p className="text-center text-[11px] text-muted-foreground">
              Answer and ability lock together — one submission, no changes after.
            </p>
          )}
        </div>
      )}

      {phase === "selecting" && flow === "review" && (
        <div className="space-y-1">
          <Button
            type="button"
            data-testid="review-button"
            disabled={reviewDisabled}
            onClick={onReview}
            className="w-full min-h-[44px]"
          >
            Review submission
          </Button>
          {reviewDisabled && reviewReason && (
            <p className="text-[11px] text-muted-foreground text-center" role="note">
              {reviewReason}
            </p>
          )}
        </div>
      )}

      {phase === "reviewing" && flow === "review" && (
        <div className="rounded-lg border-2 border-border bg-card p-3 space-y-3">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Answer</dt>
              <dd className="font-semibold text-right" data-testid="review-answer">
                {answerLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Ability</dt>
              <dd className="font-semibold text-right" data-testid="review-ability">
                {abilityName ?? "No ability"}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-muted-foreground">
            Answer and ability lock together — one submission, no changes after
            confirming.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="edit-button"
              disabled={!permissions.canChangeAnswer}
              onClick={onEdit}
              className="flex-1 min-h-[44px]"
            >
              Edit
            </Button>
            <Button
              type="button"
              data-testid="confirm-button"
              disabled={!permissions.canConfirmSubmission}
              onClick={onConfirm}
              className="flex-1 min-h-[44px]"
            >
              <Lock className="h-4 w-4 mr-1" aria-hidden />
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}

      {phase === "locked" && (
        <div
          role="status"
          data-testid="locked-banner"
          className="relative overflow-hidden rounded-lg border-2 border-[#f0d78c]/60 bg-gradient-to-br from-[#c9a84c]/15 to-[#0d1020]/40 p-3.5 text-sm shadow-[0_0_26px_-8px_rgba(201,168,76,0.5),inset_0_0_0_1px_rgba(240,215,140,0.25)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f0d78c] to-transparent"
          />
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0d78c] text-[#2a1f08]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-[#f0d78c]">Sealed</span>
            <span className="font-semibold">Submission locked</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Answer</dt>
              <dd className="font-semibold" data-testid="locked-answer">{answerLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Ability</dt>
              <dd className="font-semibold" data-testid="locked-ability">{abilityName ?? "No ability"}</dd>
            </div>
          </dl>
        </div>
      )}

      {statusMessage && (
        <p
          role={statusMessage.tone === "error" ? "alert" : "status"}
          data-testid="submission-status"
          className={`text-xs ${
            statusMessage.tone === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {statusMessage.text}
        </p>
      )}
    </section>
  );
}
