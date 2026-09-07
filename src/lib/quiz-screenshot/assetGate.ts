/**
 * CON1 Step 1E — the asset-completeness gate. PURE: no React, no DOM, no
 * fetch, no fs.
 *
 * THE RULE
 * A question that genuinely REQUIRES a visual asset, whose asset cannot be
 * resolved, must not be exported. The Content Factory publishes unattended, so
 * a card with a hole where the tested object should be is worse than no card.
 *
 * WHERE THE DECISION COMES FROM
 * Entirely from `question.asset_status`, which the backend computed
 * (`quiz.asset_health.compute_asset_status`) by asking the canonical resolver
 * `ranked_public.question_media.canonical_asset_path` about the paths the row
 * itself declares, and by taking required-vs-optional from the authorities
 * that already own each media channel — `quiz.question_media_policy`'s audited
 * family taxonomy and the typed contract's own `presentation.role`.
 *
 * There is deliberately NO image lookup, family list, path map or file check
 * in this module or anywhere else in the Content Factory. That would be the
 * second asset catalog CON1 forbids, and it would drift from production the
 * first time a family's semantics changed.
 *
 * WHY THIS IS NOT THE BROWSER'S `<img>` CHECK
 * `runDomQa` already reports images that failed to load, and it stays — as
 * defence in depth, for assets that break between the resolver and the pixel
 * (a bad URL join, a serving 404, a CSP block). But when the backend already
 * KNEW the file was unresolvable, waiting for a browser to notice is a worse
 * signal: it names a URL rather than a question, it cannot tell a required
 * asset from a decorative one, and it says nothing at all when the surface
 * simply omitted the broken image. The backend's answer is the primary
 * authority; the browser's is the backstop.
 *
 * WHAT IS AND IS NOT A FAILURE
 *
 *   (absent)      PASS  the source carried no `asset_status` — a hand-written
 *                       fixture or an older dump. Not judged is not failed.
 *   not_required  PASS  no required asset is declared. Text-only questions,
 *                       illustration-only families whose prompt names the
 *                       subject, and artwork production deliberately withholds
 *                       (answer-revealing families) all land here. Minion XP
 *                       is exactly this case: its band is drawn from geometric
 *                       glyphs, so no minion image file is required and its
 *                       absence is not an asset defect.
 *   resolved      PASS  every required asset resolves on disk.
 *   unknown       PASS  the serving checkout had no asset tree, so nothing was
 *                       claimed. Refusing to publish on an absence of evidence
 *                       would fail every capture in a database-only container.
 *   unresolved    FAIL  a required asset does not resolve. The only failure.
 *
 * An OPTIONAL asset that is missing, and a path that resolves only through the
 * resolver's case repair, are reported as warnings and never fail: production
 * legitimately degrades in the first case and renders correctly in the second.
 */

import type { AssetStatus } from "../quiz/assetStatus";
import type { QaFinding } from "./metadata";

/** The QA code a failing (or overridden) asset finding carries. */
export const MISSING_REQUIRED_ASSET_CODE = "missing-required-asset";

/** The QA code the non-failing asset observations carry. */
export const DEGRADED_ASSET_CODE = "degraded-asset";

export type AssetGateInput = {
  /** The backend's computed signal, or undefined when the source had none. */
  assetStatus?: AssetStatus | null;
  questionId: number | string;
  questionKey?: string | null;
  format: string;
  state: string;
  /**
   * Diagnostic override (`--allow-missing-assets`). false by default: an
   * unresolved required asset fails the capture. true downgrades it to a
   * warning so the image is still produced — for diagnosing an asset pipeline,
   * never for publishing.
   *
   * Deliberately SEPARATE from `--allow-incomplete-presentation`: a premise the
   * layout did not draw and a file that is not on disk are different failure
   * classes with different owners and different fixes, and one flag covering
   * both would silence the other by accident.
   */
  allowMissingAssets: boolean;
};

export type AssetGateResult = {
  findings: QaFinding[];
  /** True when this capture must not count as publishable. */
  failed: boolean;
  /** True when the override let an unresolved required asset through. */
  overridden: boolean;
};

const NONE: AssetGateResult = { findings: [], failed: false, overridden: false };

function identityOf(input: AssetGateInput): string {
  return input.questionKey
    ? `question ${input.questionId} (${input.questionKey})`
    : `question ${input.questionId}`;
}

/** Non-failing observations worth recording on the capture. */
function advisories(input: AssetGateInput, status: AssetStatus): QaFinding[] {
  const findings: QaFinding[] = [];
  const identity = identityOf(input);
  const where = `format=${input.format}, state=${input.state}`;

  if (status.optional_unresolved) {
    const paths = status.references
      .filter((r) => r.requirement === "optional" && r.resolution === "missing")
      .map((r) => `${r.channel}=${r.path}`)
      .join(", ");
    findings.push({
      severity: "warning",
      code: DEGRADED_ASSET_CODE,
      message:
        `Optional asset unresolved on ${identity}: ${paths || "an illustrative image"} ` +
        `(${where}). The prompt names its subject independently, so production ` +
        `legitimately renders this as text; the capture is still publishable.`,
      format: input.format,
      state: input.state,
    });
  }

  if (status.case_repaired) {
    const paths = status.references
      .filter((r) => r.resolution === "case_repaired")
      .map((r) => `${r.path} -> ${r.resolved_path}`)
      .join(", ");
    findings.push({
      severity: "warning",
      code: DEGRADED_ASSET_CODE,
      message:
        `Case-repaired asset path on ${identity}: ${paths} (${where}). It serves ` +
        `here, and the STORED spelling 404s on a case-sensitive filesystem.`,
      format: input.format,
      state: input.state,
    });
  }

  return findings;
}

/**
 * Decide whether one capture's required assets resolved.
 *
 * A question with no `asset_status` at all is not judged: absence of the
 * signal is absence of evidence, and inventing a failure from it would fail
 * every fixture-driven run.
 */
export function evaluateAssetGate(input: AssetGateInput): AssetGateResult {
  const status = input.assetStatus;
  if (!status || typeof status.status !== "string") return NONE;

  const notes = advisories(input, status);

  if (status.status !== "unresolved") {
    return { findings: notes, failed: false, overridden: false };
  }

  const missing = status.unresolved.length
    ? status.unresolved
        .map((r) => `${r.channel}=${r.path}`)
        .join(", ")
    : "an asset the row declares";

  const message =
    `Unresolved required asset on ${identityOf(input)}: the backend's canonical ` +
    `asset resolver could not resolve ${missing}, and this question requires it ` +
    `(asset_status=unresolved, format=${input.format}, state=${input.state}). ` +
    `${status.reason}` +
    (input.allowMissingAssets
      ? " Captured anyway because --allow-missing-assets is set; this image is a " +
        "diagnostic, not a publishable capture."
      : " Pass --allow-missing-assets to capture it anyway for diagnosis.");

  return {
    findings: [
      ...notes,
      {
        severity: input.allowMissingAssets ? "warning" : "failure",
        code: MISSING_REQUIRED_ASSET_CODE,
        message,
        format: input.format,
        state: input.state,
      },
    ],
    failed: !input.allowMissingAssets,
    overridden: input.allowMissingAssets,
  };
}
