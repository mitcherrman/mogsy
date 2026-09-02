// ---------------------------------------------------------------------------
// What a runtime-generating slot will produce, and a sample of it.
//
// Shown beneath the ordinary config fields for a segment whose module declares
// runtime-generation capabilities. Two things live here, and nothing else:
//
//   * the SELECTED set's declared capabilities and its live publication /
//     readiness state, both read verbatim from the backend catalog;
//   * a PREVIEW button that asks the backend to generate samples from the
//     policy currently in the editor.
//
// Everything it knows, the backend told it. There is no list of sets, no
// variant vocabulary, no question-count rule and no notion of what any
// particular set is about in this file — a set that declares no variants shows
// no variant line, and a capability that is not supported is stated as
// unsupported rather than rendered as a disabled control an admin might think
// is coming.
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
  type MasterySetCapability,
  type MasterySlicePreview,
  type SegmentSpecJson,
} from "@/lib/admin/rankedFormatApi";
import { readSegmentField } from "@/lib/admin/rankedFormatEditing";

/** The set this slot names, or undefined when it names none this build knows. */
export function selectedCapability(
  segment: SegmentSpecJson, capabilities: MasterySetCapability[] | undefined,
): MasterySetCapability | undefined {
  const setId = readSegmentField(segment, "module_config.mastery_set_id");
  if (typeof setId !== "string") return undefined;
  return capabilities?.find((c) => c.set_id === setId);
}

function ReadinessLine({ capability }: { capability: MasterySetCapability }) {
  const readiness = capability.readiness;
  if (!readiness) return null;
  const ready = readiness.state === "ready";
  return (
    <p
      className={
        ready
          ? "text-[10px] text-emerald-300"
          : "rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
      }
      data-testid="mastery-readiness"
      data-readiness-state={readiness.state}
    >
      {ready
        ? `Publishable here — ${readiness.available_steps ?? "?"} question${
            readiness.available_steps === 1 ? "" : "s"} available now.`
        : `Not servable here: ${readiness.detail || readiness.state}. Saving a slot that names this set will be refused.`}
    </p>
  );
}

export function GenerationPolicyPanel({
  segment, capabilities, index,
}: {
  segment: SegmentSpecJson;
  capabilities: MasterySetCapability[] | undefined;
  index: number;
}) {
  const capability = selectedCapability(segment, capabilities);
  const [preview, setPreview] = useState<MasterySlicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A sample describes ONE policy. The moment the policy changes the sample is
  // stale, and showing a stale sample beside edited settings is worse than
  // showing none — so it is cleared rather than left to be misread.
  const policyKey = JSON.stringify([
    segment.module_config ?? null, segment.challenge_count ?? null]);
  useEffect(() => { setPreview(null); setError(null); }, [policyKey]);

  if (!capability) return null;

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
        {capability.description}
      </p>
      <ReadinessLine capability={capability} />

      <ul className="space-y-0.5 text-[10px] text-muted-foreground/80">
        <li>Up to {capability.max_questions} questions from this set.</li>
        {capability.variants.length > 0 && (
          <li>
            {capability.variants.length} scenario variant
            {capability.variants.length === 1 ? "" : "s"}; leaving the variant
            control empty generates from all of them.
          </li>
        )}
        {/* Stated, not offered. An admin should know a control is missing
            because the generator cannot honour it, not wonder where it went. */}
        {!capability.supports_variant_weighting && (
          <li data-testid="weighting-unsupported">
            Per-variant weighting is not supported by this set — questions are
            taken in curriculum order.
          </li>
        )}
        {!capability.supports_difficulty && (
          <li data-testid="difficulty-unsupported">
            A difficulty target is not supported by this set.
          </li>
        )}
      </ul>

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
