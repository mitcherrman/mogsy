/**
 * Canonical submission review (F1 Phase C1): the review step of the
 * select → review → confirm-atomically → locked flow. Fully controlled: the
 * phase, the chosen answer/ability display strings, and any status copy come
 * from the controller; the component emits review / edit / confirm intents
 * only. It performs no network call, no optimistic settlement, and carries no
 * correctness state (correctness exists only on resolved rounds).
 */
import { Badge } from "@/components/ui/badge";
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
}: SubmissionReviewProps) {
  const { phase } = submission;
  const reviewDisabled = !permissions.canReviewSubmission || answerLabel === null;
  const reviewReason =
    answerLabel === null
      ? "Choose an answer first."
      : permissions.disabledReasons?.review;

  return (
    <section aria-label="Submission" data-testid="submission-review" data-phase={phase} className="space-y-3">
      {phase === "selecting" && (
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

      {phase === "reviewing" && (
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
          className="rounded-lg border-2 border-primary/50 bg-primary/10 p-3 text-sm"
        >
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4" aria-hidden />
            Submission locked
          </div>
          <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between gap-3">
              <dt>Answer</dt>
              <dd data-testid="locked-answer">{answerLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Ability</dt>
              <dd data-testid="locked-ability">{abilityName ?? "No ability"}</dd>
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
