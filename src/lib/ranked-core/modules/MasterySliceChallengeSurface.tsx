// ---------------------------------------------------------------------------
// ONE Mastery Slice challenge, drawn exactly as Ranked draws it.
//
// Why this file exists
// ────────────────────
// Two surfaces now render a `mastery_slice` challenge: the live arena, and the
// Admin Generator Lab. The Lab's entire purpose is to answer "is this exactly
// what a player would see?", and a second renderer built to look like the
// first answers that question with a promise instead of with a component. So
// the per-challenge presentation was lifted out of `masterySliceModule.tsx`
// into this file, and both surfaces call it. Neither owns it.
//
// Nothing about the rendering changed in the move. The dispatch is still
// `renderPathFor`, the structural paths still go to the existing Mastery
// interaction renderers under the shared `ScenarioMediaBand`, and a prose
// challenge still goes to the arena's own `InteractiveScenarioSurface` with
// the identical permissions. This file computes nothing, grades nothing and
// invents nothing — it takes one frozen challenge off the wire and draws it.
//
// What is NOT here, deliberately
// ──────────────────────────────
// The arena's authority model — the server-decided challenge index, the reveal
// hold and its competitive-safety gate, opponent progress, the submit
// lifecycle — stays in `masterySliceModule.tsx`, because all of it is about a
// LIVE MATCH and none of it is about drawing a question. The Lab has no
// opponent, no clock and no server-held position, so it passes a challenge and
// a submit handler and gets the same picture without inheriting a match model
// it has no business having.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { ScenarioMediaBand } from "@/components/question-surface/ScenarioMediaBand";
import { scenarioSourceForMasteryChallenge } from "@/lib/question-surface/masterySliceScenario";
import { MasteryQuestionDispatch } from "@/features/mastery/interactions/registry";
import { MasteryInlineReveal } from "@/features/mastery/interactions/MasteryInlineReveal";
import type { MasteryQuestionReveal } from "@/features/mastery/interactions/revealState";
import type { MasteryPlayerQuestion } from "@/features/mastery/contracts/playerQuestion";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import { readNumericConstraints } from "@/features/mastery/contracts/playerQuestion";
import { MasteryAssetsProvider } from "@/features/mastery/live/MasteryAssetsProvider";
import type { PlayerAnswer } from "@/features/mastery/player/useMasteryFixtureSession";
import type { AnswerOptionView, QuestionView } from "@/lib/ranked-core/viewTypes";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";

/** Which renderer a challenge can actually be served by. */
export type MasterySliceRenderPath = "atomic_recall" | "comparison" | "prose";

/**
 * The rendering path for one challenge, from the frozen contract alone.
 *
 * Exported because it is the whole dispatch rule, and a rule worth testing
 * directly rather than only through a mounted component.
 *
 * Why the choice is confirmed by the SEMANTICS and not by the kind alone: the
 * structural renderers throw when the semantics they render from are absent,
 * and a segment that crashes mid-match is strictly worse than one that shows
 * the backend's own prompt text. So a challenge is only sent to a structural
 * renderer when it actually carries what that renderer needs; everything else
 * — including a kind this build has never heard of — renders as prose, which
 * every challenge can always do because `prompt` and `answerOptions` are
 * required fields of the contract.
 */
export function renderPathFor(
  challenge: MasterySliceChallengeView,
): MasterySliceRenderPath {
  if (challenge.interactionKind === "comparison_left_right"
      && challenge.comparisonSemantics) {
    return "comparison";
  }
  if (challenge.interactionKind === "atomic_recall" && challenge.promptSemantics) {
    return "atomic_recall";
  }
  return "prose";
}

/**
 * Adapt one wire challenge into the `MasteryPlayerQuestion` shape the EXISTING
 * Mastery interaction dispatcher expects. Only ever called for a STRUCTURAL
 * path, so the semantics it reads are known to be present.
 *
 * The identity fields (`sessionId` / `artifactDigest` / `displayRevision`) are
 * not meaningful in a Ranked segment — there is no standalone Mastery session
 * here — and are synthesized as opaque placeholders satisfying only the
 * branded-type prefix invariants. None of the interaction renderers this
 * module delegates to reads these fields, so a placeholder cannot affect
 * grading, correctness or display.
 */
export function toPlayerQuestion(
  challenge: MasterySliceChallengeView, totalSteps: number,
  path: MasterySliceRenderPath,
): MasteryPlayerQuestion {
  const base = {
    sessionId: "ranked-mastery-slice" as MasteryPlayerQuestion["sessionId"],
    masterySetId: "mset_ranked-mastery-slice" as MasteryPlayerQuestion["masterySetId"],
    artifactDigest: "martifact_ranked-mastery-slice" as MasteryPlayerQuestion["artifactDigest"],
    displayRevision: "disprev_ranked-mastery-slice" as MasteryPlayerQuestion["displayRevision"],
    sequenceIndex: challenge.challengeIndex,
    totalSteps,
    questionFamily: challenge.questionFamily,
    prompt: challenge.prompt,
    state: null,
    // GR1 product readiness. This was hardcoded `""`, and `patchLabel("")`
    // returns the literal string "Fixed scenario" — so every generated
    // Champion and Matchup Mastery question, in the arena AND in the Lab,
    // was badged with the opposite of the truth about a question synthesized
    // minutes earlier from the live patch. The backend computed the label
    // (Phase 2, canonical `league_patches`) and stamped it on the artifact;
    // it now also travels on the challenge. `null` means the segment was
    // frozen before the field existed, and reads as the badge it already had.
    patchDisplay: challenge.patchDisplay ?? "",
    matchupIdentity: null,
    isReadOnly: true,
    hintAvailable: false,
    interactionKind: path === "comparison"
      ? "comparison_left_right" as const
      : "atomic_recall" as const,
    promptSemantics: challenge.promptSemantics
      ? readPromptSemantics(challenge.promptSemantics)
      : null,
    comparisonSemantics: challenge.comparisonSemantics
      ? readComparisonSemantics(challenge.comparisonSemantics)
      : null,
  };
  if (challenge.answerType === "single_choice") {
    return { ...base, answerType: "single_choice", answerOptions: challenge.answerOptions,
             inputConstraints: null };
  }
  if (challenge.answerType === "boolean") {
    return { ...base, answerType: "boolean", answerOptions: challenge.answerOptions,
             inputConstraints: null };
  }
  return {
    ...base, answerType: "numeric", answerOptions: [],
    // GR1 product readiness. The all-empty placeholder below is now the
    // FALLBACK, not the answer: a challenge frozen before the wire carried
    // constraints still renders the bare box it always rendered, and one that
    // carries them shows the real unit and precision instruction the grader
    // is actually holding the player to. Read with the standalone player's
    // own reader — see `readNumericConstraints` — so there is exactly one
    // interpretation of the field. A malformed block degrades to the
    // placeholder rather than throwing: an input hint is never worth a round.
    inputConstraints: readSliceConstraints(challenge),
  };
}

const EMPTY_CONSTRAINTS = {
  unit: "", min: 0, max: null, step: null, integerOnly: false,
  decimalPlaces: null, roundingMode: null, precisionInstruction: null,
  precisionContractVersion: null,
} as const;

function readSliceConstraints(challenge: MasterySliceChallengeView) {
  if (!challenge.inputConstraints) return EMPTY_CONSTRAINTS;
  try {
    return readNumericConstraints(challenge.inputConstraints, "input_constraints");
  } catch {
    return EMPTY_CONSTRAINTS;
  }
}

/**
 * A prose challenge as the arena's own `QuestionView`.
 *
 * Option ids are stringified INDEXES, which is what `AnswerOptionView.id`
 * already means everywhere else — so the answer actually submitted is looked
 * back up from `answerOptions` rather than taken from a label that a renderer
 * could have trimmed or decorated.
 */
export function questionViewForChallenge(
  challenge: MasterySliceChallengeView,
): QuestionView {
  const options: AnswerOptionView[] = challenge.answerOptions.map((label, index) => ({
    id: String(index),
    index,
    label,
  }));
  return {
    questionId: `mastery-slice-${challenge.challengeIndex}`,
    prompt: challenge.prompt,
    options,
    category: challenge.questionFamily,
  };
}

export function ProseChallenge({ challenge, submitting, onSubmit, reveal = null }: {
  challenge: MasterySliceChallengeView;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
  reveal?: MasteryQuestionReveal | null;
}) {
  const question = useMemo(() => questionViewForChallenge(challenge), [challenge]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  // A new challenge clears the pending selection. Keyed on the authoritative
  // index, so a poll that re-renders the same challenge does not wipe a pick
  // the player has already made.
  useEffect(() => { setSelectedOptionId(null); }, [challenge.challengeIndex]);

  const selectedLabel = selectedOptionId === null
    ? null
    : challenge.answerOptions[Number(selectedOptionId)] ?? null;
  const revealing = reveal !== null;
  // During a reveal the surface shows the player's OWN submitted option, taken
  // from the server payload rather than from local state so a reload lands on
  // the same picture.
  const shownOptionId = revealing
    ? (() => {
      const i = challenge.answerOptions.indexOf(reveal.selectedValue ?? "");
      return i >= 0 ? String(i) : selectedOptionId;
    })()
    : selectedOptionId;

  return (
    <div className="space-y-3" data-testid="mastery-slice-prose-challenge">
      <InteractiveScenarioSurface
        question={question}
        selectedOptionId={shownOptionId}
        permissions={{
          canSelectAnswer: !submitting && !revealing,
          canChangeAnswer: !submitting && !revealing,
          canSelectAbility: false,
          canReviewSubmission: false,
          canConfirmSubmission: !submitting && !revealing && selectedOptionId !== null,
          canAdvance: false,
        }}
        onSelectOption={(option) => setSelectedOptionId(option.id)}
        variant="competitive"
        // No question-safe rich-visual source exists for a generated Mastery
        // question, so the surface renders its polished text treatment. It is
        // never fabricated here: inventing art would be inventing content.
        scenarioSource={null}
        // Pre-reveal, always. A slice's answers arrive only with the segment
        // settlement, which the arena beat renders — never this viewport.
        reveal={null}
      />
      {revealing ? (
        <MasteryInlineReveal
          correct={reveal.correct}
          answerLabel={reveal.answerLabel}
          explanation={reveal.explanation}
        />
      ) : (
        <Button
          type="button"
          className="w-full"
          data-testid="mastery-slice-submit"
          disabled={submitting || selectedLabel === null}
          onClick={() => { if (selectedLabel !== null) onSubmit(selectedLabel); }}
        >
          {submitting ? "Locking in…" : "Lock in answer"}
        </Button>
      )}
    </div>
  );
}

/**
 * ONE challenge, drawn the way Ranked draws it. The whole shared surface.
 *
 * `total` is what the structural renderers print as "question N of M". The
 * arena passes the segment's challenge count; the Lab passes the generated
 * slice's length, which is the same number for the same reason.
 */
export function MasterySliceChallengeSurface({
  challenge, total, submitting, onSubmit, reveal = null,
}: {
  challenge: MasterySliceChallengeView;
  total: number;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
  reveal?: MasteryQuestionReveal | null;
}) {
  const path = renderPathFor(challenge);
  // Pure, memoised on the challenge: the adapter reads only structural
  // semantics, never the options or the answer.
  const mediaSource = useMemo(
    () => scenarioSourceForMasteryChallenge(challenge),
    [challenge],
  );

  if (path === "prose") {
    return (
      <ProseChallenge
        challenge={challenge}
        submitting={submitting}
        onSubmit={onSubmit}
        reveal={reveal}
      />
    );
  }

  return (
    // GR1 product readiness — the champion portrait.
    //
    // `MasteryChampionPortrait` reads its icon URL off `MasteryAssetsContext`,
    // whose DEFAULT resolver returns null, and the only provider was mounted
    // exclusively by the standalone `MasteryPlayerLive`. Neither the arena nor
    // the Lab wrapped it, so every generated question drew the grey
    // initial-letter disc beside a correct splash.
    //
    // Mounted HERE, on the one shared surface, rather than in each caller:
    // that is the same reason this file exists at all, and it keeps the number
    // of champion-image loading paths at one. The provider module-caches the
    // champion manifest across mounts and resolves through the existing
    // `getChampionIcon`/`resolveAssetUrl`, so this adds no second asset
    // convention and at most one fetch per app session.
    <MasteryAssetsProvider>
      {/* THE SHARED RANKED MEDIA REGION.
          A structural Mastery challenge owns its own INPUT — numeric, boolean
          or a left/right comparison — and those renderers stay exactly as they
          are, because forcing them into answer tablets would be a mechanics
          change wearing a visual costume. What they never had was the band
          every other Ranked round draws its subject in, so the round announced
          its champion in 32px of shadcn header instead of a splash.
          This is that band, and it is the SAME component the question surface
          renders — same geometry, same container-query box, same
          `--qs-media-max` participation — fed by a pure adapter over the
          semantics the wire already carries. `null` when a challenge has no
          drawable semantics, which renders nothing and leaves the round
          exactly as it was. */}
      {mediaSource && (
        <ScenarioMediaBand
          source={mediaSource}
          aspect="band"
          compact
          revealActive={false}
          correctAnswer={null}
        />
      )}
      <MasteryQuestionDispatch
        question={toPlayerQuestion(challenge, total, path)}
        total={total}
        submitting={submitting}
        onSubmit={onSubmit}
        reveal={reveal}
      />
    </MasteryAssetsProvider>
  );
}
