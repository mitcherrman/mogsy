/**
 * PreviewStateControl (RA9) — explicit operator control over the four preview
 * states. No autoplay and no timers: a preview holds a state until the operator
 * moves it, which is the opposite of a live round and the point of the surface.
 */

import { Button } from "@/components/ui/button";
import {
  PREVIEW_STATE_LABELS,
  PREVIEW_STATES,
  type PreviewState,
} from "@/lib/question-preview/usePreviewInteractionState";

export interface PreviewStateControlProps {
  value: PreviewState;
  onChange: (next: PreviewState) => void;
  /** Reveal needs an unambiguous correct option; without one it stays off. */
  revealAvailable: boolean;
  disabled?: boolean;
}

export function PreviewStateControl({
  value,
  onChange,
  revealAvailable,
  disabled = false,
}: PreviewStateControlProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Preview state"
      data-testid="preview-state-control"
    >
      {PREVIEW_STATES.map((state) => {
        const unavailable = state === "reveal" && !revealAvailable;
        return (
          <Button
            key={state}
            size="sm"
            variant={value === state ? "default" : "outline"}
            className="h-7 text-[11px]"
            data-testid={`preview-state-${state}`}
            data-active={value === state}
            aria-pressed={value === state}
            disabled={disabled || unavailable}
            title={
              unavailable
                ? "This candidate has no unambiguous correct option to reveal."
                : undefined
            }
            onClick={() => onChange(state)}
          >
            {PREVIEW_STATE_LABELS[state]}
          </Button>
        );
      })}
    </div>
  );
}
