/**
 * Preview viewport presets (RA9).
 *
 * A preview stage is a CONSTRAINED WIDTH, not a simulated device. The real
 * responsive CSS runs inside it: the surface's container queries (`@container`
 * scenario band), the intrinsic flex/grid answer layout, and every width-driven
 * rule all react to the stage the same way they react to a real browser.
 *
 * What a width alone cannot move are viewport MEDIA queries (`sm:` / `md:`),
 * which are answered by the browser window, not by an ancestor element. That is
 * a property of CSS, not a shortcut taken here — and it is why this module
 * neither passes a fake breakpoint down nor branches component behaviour. An
 * operator who needs true media-query behaviour resizes the browser; the stage
 * is honest about what it is showing (see PreviewViewportControl).
 */

export type PreviewViewportId = "mobile" | "narrow" | "full";

export interface PreviewViewport {
  id: PreviewViewportId;
  label: string;
  /** Stage max width in px; null = fill the available detail column. */
  width: number | null;
  /** Operator-facing description of what the width represents. */
  hint: string;
}

export const PREVIEW_VIEWPORTS: readonly PreviewViewport[] = Object.freeze([
  { id: "mobile", label: "Mobile", width: 375, hint: "375px — phone column" },
  { id: "narrow", label: "Narrow", width: 1024, hint: "1024px — tablet / small laptop" },
  { id: "full", label: "Full", width: null, hint: "Fills the panel" },
]);

export const DEFAULT_PREVIEW_VIEWPORT: PreviewViewportId = "full";

export function previewViewport(id: PreviewViewportId): PreviewViewport {
  return PREVIEW_VIEWPORTS.find((v) => v.id === id) ?? PREVIEW_VIEWPORTS[2];
}
