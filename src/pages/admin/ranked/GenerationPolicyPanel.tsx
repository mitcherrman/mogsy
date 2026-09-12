// ---------------------------------------------------------------------------
// What a runtime-generating slot will produce, as a sample of the real thing.
//
// Shown beneath the ordinary config fields for a segment whose content is
// GENERATED when the match reaches it. One thing lives here: a PREVIEW button
// that asks the backend to generate samples from the policy currently in the
// editor.
//
// It used to also describe the SELECTED static Mastery set — its step
// ceiling, its scenario variants, its live publication state — read from a
// `mastery_sets` block in the catalog. Those sets were hardcoded
// parameterizations of the Mastery generators and were deleted, so there is
// no set to describe: what a slot can currently supply is a question about
// current canonical data, and the honest answer to it is a live sample.
//
// The preview calls the REAL backend generation path
// (`POST /api/ranked/admin/mastery-slice/preview`). Nothing here computes an
// answer, evaluates a formula, or synthesises a question: a sample that this
// screen invented would be a second content authority and would eventually
// disagree with what players are served.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  previewMasterySlice,
  RankedFormatApiError,
  type MasterySlicePreview,
  type SegmentSpecJson,
} from "@/lib/admin/rankedFormatApi";

/** The modules whose content is generated when a match reaches the slot. */
const GENERATED_MODULE_IDS = new Set(["mastery_slice"]);

/** Does this slot generate its content, rather than draw it from a bank? */
export function isGeneratedSlot(moduleId: string | undefined): boolean {
  return typeof moduleId === "string" && GENERATED_MODULE_IDS.has(moduleId);
}

export function GenerationPolicyPanel({
  segment, moduleId, index,
}: {
  segment: SegmentSpecJson;
  moduleId: string | undefined;
  index: number;
}) {
  const generated = isGeneratedSlot(moduleId);
  const [preview, setPreview] = useState<MasterySlicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A sample describes ONE policy. The moment the policy changes the sample is
  // stale, and showing a stale sample beside edited settings is worse than
  // showing none — so it is cleared rather than left to be misread.
  const policyKey = JSON.stringify([
    segment.module_config ?? null, segment.challenge_count ?? null]);
  useEffect(() => { setPreview(null); setError(null); }, [policyKey]);

  if (!generated) return null;

  const challengeCount = typeof segment.challenge_count === "number"
    ? segment.challenge_count : null;

  const onPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewMasterySlice(
        (segment.module_config ?? {}) as Record<string, unknown>,
        challengeCount ?? 0));
    } catch (err) {
      // The backend's own refusal, verbatim — the same sentence Save would
      // give for the same policy.
      setError(err instanceof RankedFormatApiError
        ? err.message : "Could not reach the admin backend.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-border/60 bg-background/30 p-2"
      data-testid={`generation-policy-${index}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Generation policy
      </p>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        This slot generates its questions from current canonical data when a
        match reaches it. How many it can supply is checked when the format is
        saved, and again when a match is created.
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button" size="sm" variant="secondary" className="h-7 text-[11px]"
          data-testid={`preview-generation-${index}`}
          disabled={busy || challengeCount === null}
          onClick={onPreview}
        >
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {busy ? "Generating…" : "Preview sample questions"}
        </Button>
        <span className="text-[9.5px] text-muted-foreground/70">
          Generated live. Not saved.
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] text-destructive-foreground"
          data-testid={`preview-error-${index}`}
        >
          {error}
        </p>
      )}

      {preview && (
        <div className="space-y-1.5" data-testid={`preview-result-${index}`}>
          {/* The caveat travels with the samples, and comes from the payload
              rather than being restated here. */}
          <p className="text-[9.5px] italic text-muted-foreground/80">
            {preview.note}
          </p>
          <ol className="space-y-1.5">
            {preview.challenges.map((challenge) => (
              <li
                key={challenge.challenge_index}
                className="rounded border border-border/60 bg-background/40 px-2 py-1.5"
                data-testid={`preview-challenge-${index}-${challenge.challenge_index}`}
              >
                <p className="text-[11px] leading-relaxed text-foreground">
                  {challenge.prompt}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {challenge.answer_options.join(" · ")}
                </p>
                {challenge.correct_answer !== null && (
                  <p className="mt-0.5 text-[10px] text-emerald-300">
                    Answer: {String(challenge.correct_answer)}
                  </p>
                )}
                {challenge.explanation && (
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/80">
                    {challenge.explanation}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
