/**
 * QuestionPreviewPanel — see a question as a player would.
 *
 * Renders the REAL production Ranked question surface
 * (`InteractiveScenarioSurface`, variant "competitive" — the same variant Base
 * Ranked uses) for one candidate, so a reviewer judges the question as it is
 * played rather than as JSON.
 *
 * This is the neutral successor to the retired Ranked Duel Review's
 * `CandidatePreview`. The capability was the one genuinely valuable part of
 * that admin surface, so it was extracted rather than deleted with it, and it
 * now lives beside the rest of the shared preview subtree with Quiz Review as
 * its consumer.
 *
 * What it deliberately does NOT do:
 *  * mount `useRankedMatch` / `useRankedQueue` / any ranked-public client — the
 *    surface takes plain props, so a controller is not needed to render one
 *    question, and not importing one makes the side-effect boundary structural
 *    rather than a `previewMode` branch someone can later forget to check;
 *  * call any `/api/ranked/matches/*` endpoint — the only request this subtree
 *    makes is the admin read in `useExactRankedQuestion`, whose client cannot
 *    express anything but a GET;
 *  * write review state of any kind. There is no accept/reject/revise here,
 *    because that workflow no longer exists.
 *
 * The correct answer, when the caller has one, comes from the row it already
 * holds — never from the preview payload — and drives exactly one thing: the
 * Reveal state's correct-option treatment. Omit it and Reveal is unavailable.
 */

import { useState } from "react";
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

export interface QuestionPreviewPanelProps {
  /** Ranked candidate id, e.g. the `ranked:<id>` review key without its prefix. */
  candidateId: string;
  /** Index of the correct option, when the caller knows it. Enables Reveal. */
  correctAnswerIndex?: number | null;
}

export function QuestionPreviewPanel({
  candidateId,
  correctAnswerIndex = null,
}: QuestionPreviewPanelProps) {
  const { status, model, error, notFound, reload } = useExactRankedQuestion(candidateId);
  const [viewport, setViewport] = useState<PreviewViewportId>(DEFAULT_PREVIEW_VIEWPORT);

  const interaction = usePreviewInteractionState({
    correctAnswerIndex,
    resetKey: candidateId,
    optionCount: model?.question.options.length ?? 0,
  });

  return (
    <div className="space-y-2.5" data-testid="question-preview">
      {/* Operator-only framing. Stated plainly so nobody mistakes this for a
          live round or expects an action here to change anything. */}
      <div
        className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground"
        data-testid="question-preview-notice"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Operator preview — local only. Nothing here submits an answer, scores,
          or changes this question.
        </span>
        {status === "ready" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 text-[10px]"
            data-testid="question-preview-reload"
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
          data-testid="question-preview-error"
        >
          <p>
            {notFound
              ? "This question no longer exists, so it cannot be previewed."
              : error}
          </p>
          {!notFound && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              data-testid="question-preview-retry"
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
          data-testid="question-preview-unsupported"
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
              revealAvailable={correctAnswerIndex != null}
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

export default QuestionPreviewPanel;
