/**
 * PreviewViewportControl (RA9) — width presets for the preview stage.
 *
 * The hint text is deliberately literal ("375px — phone column"): the stage
 * constrains WIDTH, and viewport media queries still answer to the real browser
 * window. Labelling these as devices would promise a simulation this is not.
 */

import { Button } from "@/components/ui/button";
import {
  PREVIEW_VIEWPORTS,
  previewViewport,
  type PreviewViewportId,
} from "@/lib/question-preview/previewViewport";

export interface PreviewViewportControlProps {
  value: PreviewViewportId;
  onChange: (next: PreviewViewportId) => void;
  disabled?: boolean;
}

export function PreviewViewportControl({
  value,
  onChange,
  disabled = false,
}: PreviewViewportControlProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Preview width"
      data-testid="preview-viewport-control"
    >
      {PREVIEW_VIEWPORTS.map((vp) => (
        <Button
          key={vp.id}
          size="sm"
          variant={value === vp.id ? "default" : "outline"}
          className="h-7 text-[11px]"
          data-testid={`preview-viewport-${vp.id}`}
          data-active={value === vp.id}
          aria-pressed={value === vp.id}
          title={vp.hint}
          disabled={disabled}
          onClick={() => onChange(vp.id)}
        >
          {vp.label}
          {vp.width != null && (
            <span className="ml-1 text-[10px] opacity-70">{vp.width}</span>
          )}
        </Button>
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground">
        {previewViewport(value).hint}
      </span>
    </div>
  );
}
