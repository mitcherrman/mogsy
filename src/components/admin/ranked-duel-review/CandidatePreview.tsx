/**
 * CandidatePreview (RA9) — the "Preview" sub-tab of the Ranked candidate detail.
 *
 * Renders the REAL production Ranked question surface
 * (`InteractiveScenarioSurface`, variant "competitive" — the same variant Base
 * Ranked uses) for the selected candidate, so an operator judges the question
 * as a player would see it rather than as JSON.
 *
 * What it deliberately does NOT do:
 *  * mount `useRankedMatch` / `useRankedQueue` / any ranked-public client — the
 *    surface takes plain props, so a controller is not needed to render one
 *    question, and not importing one makes the side-effect boundary structural
 *    rather than a `previewMode` branch someone can later forget to check;
 *  * call any `/api/ranked/matches/*` endpoint — the only request this subtree
 *    makes is the admin read in `useExactRankedQuestion`;
 *  * write review state — accept/reject/revise stay entirely on the Data tab.
 *
 * The correct answer comes from the candidate detail the admin page already
 * holds (admin-only), never from the preview payload, and is used for one thing:
 * the Reveal state's correct-option treatment.
 */

import { AlertTriangle, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { PreviewStage } from "@/components/question-preview/PreviewStage";
import { PreviewStateControl } from "@/components/question-preview/PreviewStateControl";
import { PreviewViewportControl } from "@/components/question-preview/PreviewViewportControl";
import { UNSUPPORTED_MODULE_MESSAGE } from "@/lib/question-preview/rankedPreviewAdapter";
import { useExactRankedQuestion } from "@/lib/question-preview/useExactRankedQuestion";
import { usePreviewInteractionState } from "@/lib/question-preview/usePreviewInteractionState";
import {
  DEFAULT_PREVIEW_VIEWPORT,
  type PreviewViewportId,
} from "@/lib/question-preview/previewViewport";
import { useState } from "react";
import type { CandidateDetail } from "@/lib/ranked-duel-review/types";

export interface CandidatePreviewProps {
  detail: CandidateDetail;
}

export function CandidatePreview({ detail }: CandidatePreviewProps) {
  const { status, model, error, notFound, reload } = useExactRankedQuestion(
    detail.candidate_id,
  );
  const [viewport, setViewport] = useState<PreviewViewportId>(
    DEFAULT_PREVIEW_VIEWPORT,
  );

  const interaction = usePreviewInteractionState({
    correctAnswerIndex: detail.correct_answer_index,
    resetKey: detail.candidate_id,
    optionCount: model?.question.options.length ?? 0,
  });

  return (
    <div className="space-y-2.5" data-testid="rd-preview">
      {/* Operator-only framing. Stated plainly so nobody mistakes this for a
          live round or expects an action here to change anything. */}
      <div
        className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground"
        data-testid="rd-preview-notice"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Operator preview — local only. Nothing here submits an answer, scores,
          or changes this candidate.
        </span>
        {status === "ready" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 text-[10px]"
            data-testid="rd-preview-reload"
            onClick={reload}
          >
            <RefreshCw className="h-3 w-3" aria-hidden /> Reload preview
          </Button>
        )}
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-label="Loading preview"
          />
        </div>
      )}

      {status === "error" && (
        <div
          className="space-y-1.5 rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive"
          data-testid="rd-preview-error"
        >
          <p>
            {notFound
              ? "This candidate no longer exists, so it cannot be previewed."
              : error}
          </p>
          {!notFound && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              data-testid="rd-preview-retry"
              onClick={reload}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {status === "ready" && model && !model.supported && (
        <div
          className="flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-amber-400"
          data-testid="rd-preview-unsupported"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{UNSUPPORTED_MODULE_MESSAGE}</span>
        </div>
      )}

      {status === "ready" && model && model.supported && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PreviewStateControl
              value={interaction.state}
              onChange={interaction.setState}
              revealAvailable={detail.correct_answer_index != null}
            />
            <PreviewViewportControl value={viewport} onChange={setViewport} />
          </div>

          <PreviewStage viewport={viewport}>
            <InteractiveScenarioSurface
              question={model.question}
              scenarioSource={model.scenarioSource}
              selectedOptionId={interaction.selectedOptionId}
              permissions={interaction.permissions}
              onSelectOption={interaction.onSelectOption}
              reveal={interaction.reveal}
              variant="competitive"
            />
          </PreviewStage>
        </>
      )}
    </div>
  );
}
