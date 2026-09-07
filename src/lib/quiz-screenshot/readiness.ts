/**
 * CON1 Step 2 — the Admin-side CONTENT READINESS PREFLIGHT. PURE: no React,
 * no DOM, no fetch, no fs.
 *
 * WHAT IT IS
 * A statement, made from the row Admin already holds, about whether the local
 * Content Factory would accept this question today. Nothing more.
 *
 * WHAT IT IS NOT
 * It is NOT a second copy of Content Factory policy, and it is NOT the final
 * authority. Every verdict below is produced by calling the module that already
 * owns that decision, on the same input the runner will use:
 *
 *   source acceptance   `adaptScreenshotQuestion`   (./adapt)      — the very
 *                       adapter `scripts/quiz-screenshots/source.ts` runs, so a
 *                       row Admin calls unsupported is exactly a row the runner
 *                       would skip, with the runner's own wording.
 *   presentation        `resolveScenarioPresentation` (./presentation) +
 *                       `presentationIsIncomplete`  (./presentationGate) — the
 *                       Step 1D gate's own predicate over the production band
 *                       profile the surface itself resolves.
 *   required assets     `assetIsUnresolved`         (@/lib/quiz/assetStatus) —
 *                       the ONE predicate the Step 1E gate and the Admin badge
 *                       already share, over the backend's computed signal.
 *
 * So there is no family list, no path map, no premise inspection and no second
 * threshold anywhere in this file. When a layout rule or a media policy changes
 * upstream, this preflight changes with it and nothing here is edited.
 *
 * WHY IT IS STILL ONLY A PREFLIGHT
 * The Content Factory's runtime gates execute against the ACTUAL rendered page:
 * `runDomQa`'s overflow/clipping checks and the browser's `<img>` backstop can
 * only speak after Playwright has painted the card. A question this module
 * calls `ready` can still fail capture QA, and that is correct — capture QA is
 * the authority on the picture. This is the cheap check that stops an operator
 * copying a command that was never going to produce a publishable image.
 *
 * THE REVIEWER'S FLAG IS NOT A READINESS STATE
 * `missing_asset` is a human's annotation; `asset_status` is the backend's
 * computation. Step 1E kept them apart on purpose, and folding the annotation
 * into `state` here would undo that — an opinion would start blocking a
 * command, or a computed failure would look like somebody's note. It is
 * reported as its own boolean, beside the state, and never blocks.
 */

import { adaptScreenshotQuestion, type ScreenshotSourceQuestion } from "./adapt";
import { resolveScenarioPresentation, type ScenarioPresentationStatus } from "./presentation";
import { presentationIsIncomplete } from "./presentationGate";
import {
  assetIsUnresolved,
  type AssetStatus,
  type AssetStatusValue,
} from "@/lib/quiz/assetStatus";

/**
 * The readiness states, in the precedence they are reported.
 *
 * - `unsupported`             the runner's own adapter would not build a render
 *                             question from this row at all (wrong format, no
 *                             prompt, fewer than two choices, an answer that is
 *                             not among them). Blocking.
 * - `asset-unresolved`        a REQUIRED asset does not resolve. Blocking; the
 *                             Step 1E gate fails it.
 * - `presentation-incomplete` the backend projected a safe premise the
 *                             production layout system does not draw. Blocking;
 *                             the Step 1D gate fails it.
 * - `unknown`                 the row carries no computed `asset_status`, so
 *                             asset health was never evaluated for it. NOT
 *                             blocking — absence of evidence is not a failure,
 *                             exactly as the capture gate treats it — but it is
 *                             not `ready` either, and says so.
 * - `ready`                   nothing known would block a capture.
 */
export type ContentReadinessState =
  | "ready"
  | "unknown"
  | "presentation-incomplete"
  | "asset-unresolved"
  | "unsupported";

/** The states that stop normal publishing. */
export const BLOCKING_READINESS_STATES: readonly ContentReadinessState[] = [
  "unsupported",
  "asset-unresolved",
  "presentation-incomplete",
] as const;

export type ContentReadiness = {
  state: ContentReadinessState;
  /** True when normal publishing must be disabled for this question. */
  blocking: boolean;
  /** Short operator-facing label. */
  label: string;
  /** One sentence saying what was found and who found it. */
  detail: string;
  /**
   * Every blocking condition, not only the reported one — a row can be both
   * asset-unresolved and presentation-incomplete, and hiding the second would
   * send the operator back for a surprise after fixing the first.
   */
  blockers: ContentReadinessState[];
  /** The production presentation status, or null when the row is unsupported. */
  presentation: ScenarioPresentationStatus | null;
  /** The backend's computed asset status value, or null when absent. */
  assetStatus: AssetStatusValue | null;
  /**
   * The REVIEWER'S manual `missing_asset` annotation, carried separately and
   * deliberately not folded into `state`. Never blocking.
   */
  reviewerFlaggedMissingAsset: boolean;
  /** Why the adapter refused, when `state` is `unsupported`. */
  unsupportedReason: string | null;
};

/**
 * The row shape this preflight reads.
 *
 * It is `ScreenshotSourceQuestion` — the runner's own source type — plus the
 * two review-only fields Admin holds. `ReviewQuestion` satisfies it unchanged,
 * so Admin passes its rows through with no third mapping in between.
 */
export type ContentReadinessRow = ScreenshotSourceQuestion & {
  missing_asset?: boolean;
};

const LABELS: Record<ContentReadinessState, string> = {
  ready: "Content ready",
  unknown: "Content not evaluated",
  "presentation-incomplete": "Presentation incomplete",
  "asset-unresolved": "Required asset unresolved",
  unsupported: "Unsupported question",
};

function detailFor(
  state: ContentReadinessState,
  presentation: ScenarioPresentationStatus | null,
  assetStatus: AssetStatus | null | undefined,
  unsupportedReason: string | null,
): string {
  switch (state) {
    case "unsupported":
      return (
        `The Content Factory's own source adapter would skip this row: ` +
        `${unsupportedReason ?? "it is not a renderable multiple-choice question"}.`
      );
    case "asset-unresolved":
      return (
        `Computed: this question requires an asset the backend's canonical ` +
        `resolver could not resolve. ${assetStatus?.reason ?? ""}`.trim()
      );
    case "presentation-incomplete":
      return (
        `The backend projected a safe presentation, but the production layout ` +
        `system draws no scenario for it (presentation=${presentation}). The ` +
        `capture would be a text card missing the premise.`
      );
    case "unknown":
      return (
        `This row carries no computed asset health, so required assets were ` +
        `never evaluated. Capture QA remains the authority.`
      );
    case "ready":
    default:
      return (
        `Nothing known blocks a capture. The Content Factory's runtime QA — ` +
        `layout overflow and the browser's image check — still decides the ` +
        `exported image.`
      );
  }
}

/**
 * Evaluate one stored review row.
 *
 * Deterministic and side-effect free; the same row always yields the same
 * verdict, which is what lets the panel render a stable readiness summary for a
 * selection without fetching anything.
 */
export function evaluateContentReadiness(
  row: ContentReadinessRow | null | undefined,
): ContentReadiness {
  const reviewerFlaggedMissingAsset = row?.missing_asset === true;

  if (!row) {
    return {
      state: "unsupported",
      blocking: true,
      label: LABELS.unsupported,
      detail: detailFor("unsupported", null, null, "no question row"),
      blockers: ["unsupported"],
      presentation: null,
      assetStatus: null,
      reviewerFlaggedMissingAsset,
      unsupportedReason: "no question row",
    };
  }

  // 1. Would the runner's own adapter even build a render question from it?
  const adapted = adaptScreenshotQuestion(row);
  if (typeof adapted === "string") {
    return {
      state: "unsupported",
      blocking: true,
      label: LABELS.unsupported,
      detail: detailFor("unsupported", null, row.asset_status, adapted),
      blockers: ["unsupported"],
      presentation: null,
      assetStatus: row.asset_status?.status ?? null,
      reviewerFlaggedMissingAsset,
      unsupportedReason: adapted,
    };
  }

  // 2. The Step 1D presentation gate's own predicate, over the production band.
  const presentation = resolveScenarioPresentation(adapted).status;
  // 3. The Step 1E asset gate's own predicate, over the backend's computation.
  const assetUnresolved = assetIsUnresolved(row.asset_status);

  const blockers: ContentReadinessState[] = [];
  if (assetUnresolved) blockers.push("asset-unresolved");
  if (presentationIsIncomplete(presentation)) blockers.push("presentation-incomplete");

  const state: ContentReadinessState = blockers.length
    ? blockers[0]
    : row.asset_status
      ? "ready"
      : "unknown";

  return {
    state,
    blocking: blockers.length > 0,
    label: LABELS[state],
    detail: detailFor(state, presentation, row.asset_status, null),
    blockers,
    presentation,
    assetStatus: row.asset_status?.status ?? null,
    reviewerFlaggedMissingAsset,
    unsupportedReason: null,
  };
}

export type ReadinessSummary = {
  total: number;
  ready: number;
  blocked: number;
  /** Rows whose asset health was never computed. Not blocked. */
  unevaluated: number;
  /** Rows a human reviewer flagged, whatever the computed states say. */
  reviewerFlagged: number;
};

/** Roll a selection's per-row verdicts into the counts the panel shows. */
export function summarizeReadiness(
  results: readonly ContentReadiness[],
): ReadinessSummary {
  return {
    total: results.length,
    ready: results.filter((r) => r.state === "ready").length,
    blocked: results.filter((r) => r.blocking).length,
    unevaluated: results.filter((r) => r.state === "unknown").length,
    reviewerFlagged: results.filter((r) => r.reviewerFlaggedMissingAsset).length,
  };
}
