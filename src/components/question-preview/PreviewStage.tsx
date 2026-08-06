/**
 * PreviewStage (RA9) — the constrained area a question surface renders inside.
 *
 * It contributes WIDTH and the production panel shell, and deliberately nothing
 * else: no scaling transform, no zoom, no device chrome, no behaviour flags. The
 * surface inside is the real one, laying itself out against the real width, so
 * what an operator sees is produced by the same CSS a player's browser runs.
 */

import type { ReactNode } from "react";
import { previewViewport, type PreviewViewportId } from "@/lib/question-preview/previewViewport";

export interface PreviewStageProps {
  viewport: PreviewViewportId;
  children: ReactNode;
}

export function PreviewStage({ viewport, children }: PreviewStageProps) {
  const { width } = previewViewport(viewport);
  return (
    <div className="flex w-full justify-center" data-testid="preview-stage-outer">
      <div
        data-testid="preview-stage"
        data-viewport={viewport}
        style={{ width: "100%", maxWidth: width == null ? undefined : `${width}px` }}
        // Mirrors the arena's question panel shell so spacing, radius, and the
        // dark surface behind the band match what ships, not an admin card.
        className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-3"
      >
        {children}
      </div>
    </div>
  );
}
