// ---------------------------------------------------------------------------
// A `mastery_slice` challenge whose prompt is PROSE.
//
// The existing suite beside this one covers the structural challenges
// (`atomic_recall`, `comparison_left_right`) that the Mastery interaction
// renderers build a sentence for. This one covers the other half of the frozen
// contract: a challenge whose `prompt` is finished backend-authored text and
// which carries no semantics at all.
//
// That half had no renderer. `AtomicRecallQuestionView` THROWS when
// `promptSemantics` is absent, and every non-comparison challenge used to be
// coerced to `atomic_recall`, so a prose challenge crashed the arena mid-match.
//
// Nothing here names a champion, an item, an ability or a damage type. The
// fixtures are deliberately generic prose, because the renderer is dispatching
// on the CONTRACT — a prompt with options and no semantics — and a fixture that
// needed a particular champion to pass would mean the renderer had learned
// about content it must not know about.
// ---------------------------------------------------------------------------

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  masterySliceModule, questionViewForChallenge, renderPathFor,
} from "./masterySliceModule";
import type { ModuleSegmentActions } from "./types";

const PROSE_A = "A unit with 100 attack damage strikes a target with 40 armour. "
  + "How much damage is dealt after mitigation?";
const PROSE_B = "The same unit adds a source of flat penetration. "
  + "How much damage is dealt now?";

/** A prose challenge exactly as the backend freezes one. */
function proseChallengeWire(index: number, prompt: string) {
  return {
    challenge_index: index,
    // The literal the backend writes for a step whose prompt is real prose.
    interaction_kind: "legacy_combat",
    question_family: "post_mitigation_single_type_damage",
    prompt,
    answer_type: "single_choice",
    answer_options: ["115", "134", "144", "199"],
    // The defining property of this half of the contract.
    prompt_semantics: null,
    comparison_semantics: null,
  };
}

function segmentState(over: Partial<Record<string, unknown>> = {}) {
  return {
    active: true,
    segment_number: 3,
    module_id: "mastery_slice",
    module_version: 1,
    phase: "challenges",
    challenge_count: 2,
    ability_deadline: null,
    challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00",
    pressure_applied: false,
    own_ability: {
      selected_ability_id: null, confirmed: false,
      available_ability_ids: [], unavailable_ability_ids: {},
    },
    opponent_ability_confirmed: false,
    own_next_challenge_index: 0,
    own_submitted_choices: [null, null],
    own_challenges_completed: 0,
    opponent_challenges_completed: 0,
    opponent_finished: false,
    own_finished: false,
    challenges: {
      prompt: "Mastery Slice: a runtime set",
      challenge_count: 2,
      challenges: [
        proseChallengeWire(0, PROSE_A),
        proseChallengeWire(1, PROSE_B),
      ],
    },
    ...over,
  };
}

function parse(rawState: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 2,
    challenge_index: 0, segment_number: 3, phase: "challenges",
    ability_deadline: null, challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
    resolved: false,
  };
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return readPublicRound(body);
}

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
}

function renderModule(state: SegmentStateView | null, acts = actions()) {
  const parsed = readPublicRound(publicRoundV2());
  const view = render(
    <masterySliceModule.Viewport
      publicRound={parsed}
      selection={null}
      permissions={NO_INTERACTIONS}
      onSelect={vi.fn()}
      segmentState={state}
      actions={acts}
      skewMs={0}
    />,
  );
  return { ...view, acts };
}

// ------------------------------------------------------- the dispatch rule

describe("mastery_slice — which renderer a challenge gets", () => {
  it("sends a prose challenge to the prose path", () => {
    expect(renderPathFor({
      challengeIndex: 0, interactionKind: "legacy_combat",
      questionFamily: "f", prompt: PROSE_A, answerType: "single_choice",
      answerOptions: ["1", "2"], promptSemantics: null,
      comparisonSemantics: null,
    })).toBe("prose");
  });

  it("sends a structural challenge to its own Mastery renderer", () => {
    expect(renderPathFor({
      challengeIndex: 0, interactionKind: "atomic_recall",
      questionFamily: "f", prompt: "X — y", answerType: "single_choice",
      answerOptions: ["1", "2"], promptSemantics: { template: "t" },
      comparisonSemantics: null,
    })).toBe("atomic_recall");
    expect(renderPathFor({
      challengeIndex: 0, interactionKind: "comparison_left_right",
      questionFamily: "f", prompt: "X vs Y", answerType: "single_choice",
      answerOptions: ["1", "2"], promptSemantics: null,
      comparisonSemantics: { left: {}, right: {} },
    })).toBe("comparison");
  });

  it("falls back to prose when a structural kind is missing its semantics", () => {
    // The fail-safe that matters: the structural renderers THROW on absent
    // semantics, and a crashed segment mid-match is strictly worse than the
    // backend's own prompt text.
    expect(renderPathFor({
      challengeIndex: 0, interactionKind: "atomic_recall",
      questionFamily: "f", prompt: "still readable", answerType: "single_choice",
      answerOptions: ["1", "2"], promptSemantics: null,
      comparisonSemantics: null,
    })).toBe("prose");
  });

  it("renders an interaction kind this build has never seen as prose", () => {
    // Additive backend vocabulary must not take the arena down.
    expect(renderPathFor({
      challengeIndex: 0, interactionKind: "some_future_kind",
      questionFamily: "f", prompt: "readable", answerType: "single_choice",
      answerOptions: ["1", "2"], promptSemantics: null,
      comparisonSemantics: null,
    })).toBe("prose");
  });
});

// --------------------------------------------------------- the projection

describe("mastery_slice — a prose challenge as an arena question", () => {
  it("carries the frozen prompt and options verbatim", () => {
    const view = questionViewForChallenge({
      challengeIndex: 1, interactionKind: "legacy_combat",
      questionFamily: "fam", prompt: PROSE_A, answerType: "single_choice",
      answerOptions: ["115", "134"], promptSemantics: null,
      comparisonSemantics: null,
    });
    expect(view.prompt).toBe(PROSE_A);
    expect(view.options.map((o) => o.label)).toEqual(["115", "134"]);
    // Ids are stringified indexes, which is what AnswerOptionView.id means
    // everywhere else — so the submitted answer is looked back up from the
    // frozen options rather than taken from a rendered label.
    expect(view.options.map((o) => o.id)).toEqual(["0", "1"]);
    expect(view.category).toBe("fam");
  });
});

// ------------------------------------------------------------- rendering

describe("mastery_slice — rendering a prose challenge in the arena", () => {
  it("renders it through the arena's own question surface, not a Mastery page", () => {
    renderModule(parse(segmentState()).segmentState);
    expect(screen.getByTestId("mastery-slice-prose-challenge")).toBeInTheDocument();
    // The SAME surface a quiz round renders through.
    expect(screen.getByTestId("scenario-surface")).toBeInTheDocument();
    // And NOT the standalone Mastery study screens.
    expect(screen.queryByTestId("mastery-atomic-recall-question")).toBeNull();
  });

  it("does not throw on a challenge with no prompt semantics", () => {
    // The regression this whole path exists to close.
    expect(() => renderModule(parse(segmentState()).segmentState)).not.toThrow();
    expect(screen.getByText(PROSE_A)).toBeInTheDocument();
  });

  it("shows every frozen option", () => {
    renderModule(parse(segmentState()).segmentState);
    for (const option of ["115", "134", "144", "199"]) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  it("submits the selected option through the existing server grading path", () => {
    const { acts } = renderModule(parse(segmentState()).segmentState);
    fireEvent.click(screen.getByText("144"));
    fireEvent.click(screen.getByTestId("mastery-slice-submit"));
    // The module's own action — one server round trip, carrying only the
    // answer. No correctness, no timing, nothing decided here.
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { selected: "144" });
  });

  it("cannot submit before an option is chosen", () => {
    const { acts } = renderModule(parse(segmentState()).segmentState);
    expect(screen.getByTestId("mastery-slice-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("mastery-slice-submit"));
    expect(acts.submitChallenge).not.toHaveBeenCalled();
  });

  it("advances to challenge 2 purely from the next authoritative snapshot", () => {
    // No local index increment anywhere: the server says which challenge is
    // next, and a refresh lands on exactly that one.
    renderModule(parse(segmentState({
      own_next_challenge_index: 1,
      own_submitted_choices: [{ selected: "144" }, null],
      own_challenges_completed: 1,
    })).segmentState);
    expect(screen.getByText(PROSE_B)).toBeInTheDocument();
    expect(screen.queryByText(PROSE_A)).toBeNull();
  });

  it("submits challenge 2 under its own index", () => {
    const { acts } = renderModule(parse(segmentState({
      own_next_challenge_index: 1,
      own_submitted_choices: [{ selected: "144" }, null],
      own_challenges_completed: 1,
    })).segmentState);
    fireEvent.click(screen.getByText("199"));
    fireEvent.click(screen.getByTestId("mastery-slice-submit"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(1, { selected: "199" });
  });

  it("hands the segment back to the arena once the viewer has finished", () => {
    renderModule(parse(segmentState({
      own_next_challenge_index: 2,
      own_finished: true,
      own_challenges_completed: 2,
      own_submitted_choices: [{ selected: "144" }, { selected: "168" }],
    })).segmentState);
    expect(screen.getByTestId("mastery-slice-waiting")).toBeInTheDocument();
    // Nothing answerable is left on screen, so the arena's own progression
    // (settlement beat, damage, next segment) is what happens next.
    expect(screen.queryByTestId("mastery-slice-prose-challenge")).toBeNull();
    expect(screen.queryByTestId("mastery-slice-submit")).toBeNull();
  });

  it("reports the opponent's progress the same way every slice does", () => {
    renderModule(parse(segmentState({
      opponent_challenges_completed: 1,
    })).segmentState);
    expect(screen.getByTestId("mastery-slice-opponent-progress"))
      .toHaveTextContent("Opponent: 1 of 2 done");
  });

  it("never shows an answer before the segment settles", () => {
    renderModule(parse(segmentState()).segmentState);
    // The pre-reveal contract: the wire carries no correct answer at all, and
    // the surface is handed `reveal={null}`, so nothing can be marked.
    expect(screen.queryByText(/correct answer/i)).toBeNull();
  });
});
