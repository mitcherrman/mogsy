import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { masterySliceModule } from "./masterySliceModule";
import type { ModuleSegmentActions } from "./types";

// ---------------------------------------------------------------------------
// Fixtures shaped exactly like `ranked_public.service.segment_state_view` for
// a `mastery_slice.v1` segment — the SAME transport as Item Cost Duel
// (`segment_state.challenges` is `module.public_view(...)`), just carrying a
// Mastery-shaped challenge list instead of item pairs.
// ---------------------------------------------------------------------------

function masterySliceChallengeWire(index: number) {
  return {
    challenge_index: index,
    interaction_kind: "atomic_recall",
    question_family: "ability_cooldown",
    prompt: `Ahri W — ability_cooldown #${index}`,
    answer_type: "single_choice",
    answer_options: ["9", "12", "6", "5"],
    prompt_semantics: {
      template: "ability_cooldown_at_rank",
      champion_display: "Ahri",
      metric: "ability_cooldown",
      subject_ref: "W",
      ability_name: "W",
      context: { ability_rank: 1, champion_level: null, form: null },
    },
    comparison_semantics: null,
  };
}

function masterySliceSegmentState(over: Partial<Record<string, unknown>> = {}) {
  return {
    active: true,
    segment_number: 3,
    module_id: "mastery_slice",
    module_version: 1,
    phase: "challenges",
    challenge_count: 3,
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
    own_submitted_choices: [null, null, null],
    own_challenges_completed: 0,
    opponent_challenges_completed: 0,
    opponent_finished: false,
    own_finished: false,
    challenges: {
      prompt: "Mastery Slice: Ahri vs Syndra",
      challenge_count: 3,
      challenges: [0, 1, 2].map(masterySliceChallengeWire),
    },
    ...over,
  };
}

function parse(rawState: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 3,
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
  const pub = publicRoundV2();
  const parsed = readPublicRound(pub);
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

describe("mastery_slice module renderer — identity", () => {
  it("declares a stable renderer identity", () => {
    expect(masterySliceModule.moduleId).toBe("mastery_slice");
    expect(masterySliceModule.moduleVersion).toBe(1);
  });

  it("owns its own submission flow, like item_cost_duel", () => {
    expect(masterySliceModule.ownsSubmission).toBe(true);
  });

  it("is not question-shaped for the shell's QuestionView projection", () => {
    const pub = readPublicRound(publicRoundV2());
    expect(masterySliceModule.projectQuestion(pub)).toBeNull();
  });
});

describe("mastery_slice module renderer — challenge rendering", () => {
  it("renders challenge 1 through the EXISTING atomic recall Mastery view", () => {
    const parsed = parse(masterySliceSegmentState());
    renderModule(parsed.segmentState);
    // The existing Mastery atomic-recall question screen, not a bespoke one.
    expect(screen.getByTestId("mastery-atomic-recall-question")).toBeInTheDocument();
    expect(screen.getByText(/ahri w/i)).toBeInTheDocument();
    // The four wire options are rendered verbatim, unreformatted.
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("shows opponent progress alongside the delegated question view", () => {
    const parsed = parse(masterySliceSegmentState({
      opponent_challenges_completed: 1,
    }));
    renderModule(parsed.segmentState);
    expect(screen.getByTestId("mastery-slice-opponent-progress"))
      .toHaveTextContent("Opponent: 1 of 3 done");
  });

  it("submits a challenge answer through the module's own submitChallenge action", () => {
    const parsed = parse(masterySliceSegmentState());
    const { acts } = renderModule(parsed.segmentState);
    fireEvent.click(screen.getByText("9"));
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { selected: "9" });
  });

  it("advances to the next challenge purely from the next authoritative snapshot", () => {
    // No local index increment: rendering challenge index 1 directly (as a
    // refresh/poll would deliver it) shows challenge 2's own prompt.
    const parsed = parse(masterySliceSegmentState({
      own_next_challenge_index: 1,
      own_submitted_choices: [{ selected: "9" }, null, null],
      own_challenges_completed: 1,
    }));
    renderModule(parsed.segmentState);
    expect(screen.getByTestId("mastery-progress")).toHaveTextContent("Question 2 of 3");
  });

  it("shows a completion state once the viewer has finished every challenge", () => {
    const parsed = parse(masterySliceSegmentState({
      own_next_challenge_index: 3,
      own_finished: true,
      own_challenges_completed: 3,
      own_submitted_choices: [{ selected: "9" }, { selected: "9" }, { selected: "9" }],
    }));
    renderModule(parsed.segmentState);
    expect(screen.getByTestId("mastery-slice-waiting")).toBeInTheDocument();
    expect(screen.queryByTestId("mastery-atomic-recall-question")).toBeNull();
  });

  it("renders a neutral loading state before the first snapshot arrives", () => {
    renderModule(null);
    expect(screen.getByTestId("mastery-slice-loading")).toBeInTheDocument();
  });

  it("surfaces a module action error without crashing the viewport", () => {
    const parsed = parse(masterySliceSegmentState());
    renderModule(parsed.segmentState, actions({ error: "Something went wrong" }));
    expect(screen.getByTestId("mastery-slice-error")).toHaveTextContent("Something went wrong");
  });
});

describe("mastery_slice module renderer — summary label", () => {
  it("reports the current step out of the total", () => {
    const parsed = parse(masterySliceSegmentState({ own_next_challenge_index: 1 }));
    expect(masterySliceModule.summaryLabel(parsed, null)).toBe("Mastery step 2 of 3");
  });

  it("returns null when there is no active segment state", () => {
    const pub = readPublicRound(publicRoundV2());
    expect(masterySliceModule.summaryLabel(pub, null)).toBeNull();
  });
});
