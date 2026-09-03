/**
 * Ranked `mastery_slice.v1` — per-question reveal.
 *
 * Covers the transport (the new optional `own_challenge_reveals` /
 * `reveal_window_ms` fields, and the invariant that a challenge the viewer can
 * still answer is never disclosed) and the renderer's reveal hold: the
 * answered challenge stays on screen, coloured and locked, then advances
 * itself with no Next button.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASTERY_REVEAL_DURATION_MS } from "@/features/mastery/interactions/revealState";
import { RankedPublicParseError, readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { masterySliceModule } from "./masterySliceModule";
import type { ModuleSegmentActions } from "./types";

const OPTIONS = ["9", "12", "6", "5"];

function challengeWire(index: number) {
  return {
    challenge_index: index,
    interaction_kind: "atomic_recall",
    question_family: "ability_cooldown",
    prompt: `Ahri W — ability_cooldown #${index}`,
    answer_type: "single_choice",
    answer_options: OPTIONS,
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

function revealWire(index: number, over: Record<string, unknown> = {}) {
  return {
    challenge_index: index,
    is_correct: true,
    player_answer: "12",
    correct_answer: "12",
    explanation: "Ahri W has a 12 second cooldown at rank 1.",
    answer_type: "single_choice",
    answer_options: OPTIONS,
    ...over,
  };
}

function segmentStateWire(over: Record<string, unknown> = {}) {
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
      prompt: "Mastery Slice: Ahri",
      challenge_count: 3,
      challenges: [0, 1, 2].map(challengeWire),
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
  return readPublicRound(body).segmentState!;
}

/** Which challenge the viewport is actually showing. */
function shownIndex(): string | null {
  return screen.getByTestId("mastery-slice-challenge-phase")
    .getAttribute("data-challenge-index");
}

function renderModule(state: SegmentStateView | null,
                      acts: ModuleSegmentActions = {
                        submitChallenge: vi.fn(), busy: false, error: null,
                      }) {
  return {
    ...render(
      <masterySliceModule.Viewport
        publicRound={readPublicRound(publicRoundV2())}
        selection={null}
        permissions={NO_INTERACTIONS}
        onSelect={vi.fn()}
        segmentState={state}
        actions={acts}
        skewMs={0}
      />,
    ),
    acts,
  };
}

afterEach(cleanup);

// ------------------------------------------------------------- transport

describe("own_challenge_reveals — transport", () => {
  it("is empty and the window null when the backend sends neither", () => {
    // A NEW frontend against an OLD backend, or a segment frozen before the
    // feature: it must degrade to "no early reveal", never to a parse error.
    const state = parse(segmentStateWire());
    expect(state.ownChallengeReveals).toEqual([]);
    expect(state.revealWindowMs).toBeNull();
  });

  it("reads exactly the challenges behind the viewer's active index", () => {
    const state = parse(segmentStateWire({
      own_next_challenge_index: 2,
      own_challenges_completed: 2,
      reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
      own_challenge_reveals: [revealWire(0), revealWire(1)],
    }));
    expect(state.ownChallengeReveals.map((r) => r.challengeIndex)).toEqual([0, 1]);
    expect(state.revealWindowMs).toBe(MASTERY_REVEAL_DURATION_MS);
  });

  it("carries the server's own verdict, answer and words", () => {
    const [reveal] = parse(segmentStateWire({
      own_next_challenge_index: 1,
      own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: "9" })],
    })).ownChallengeReveals;
    expect(reveal).toEqual({
      challengeIndex: 0,
      isCorrect: false,
      playerAnswer: "9",
      correctAnswer: "12",
      explanation: "Ahri W has a 12 second cooldown at rank 1.",
      answerOptions: OPTIONS,
    });
  });

  it("REFUSES a payload disclosing a challenge the viewer can still answer", () => {
    expect(() => parse(segmentStateWire({
      own_next_challenge_index: 1,
      own_challenge_reveals: [revealWire(0), revealWire(1)],
    }))).toThrow(RankedPublicParseError);
  });

  it("still rejects an answer field appearing anywhere else in the payload", () => {
    // The carve-out is LIFTED OUT of the walk, not an exemption inside it.
    expect(() => parse(segmentStateWire({ is_correct: true })))
      .toThrow(RankedPublicParseError);
  });
});

// -------------------------------------------------------------- rendering

describe("mastery_slice renderer — the reveal hold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const answeredState = (over: Record<string, unknown> = {}) => parse(segmentStateWire({
    own_next_challenge_index: 1,
    own_challenges_completed: 1,
    own_submitted_choices: [{ selected: "12" }, null, null],
    reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
    own_challenge_reveals: [revealWire(0)],
    ...over,
  }));

  it("holds the ANSWERED challenge on screen, coloured and locked", () => {
    renderModule(answeredState());
    expect(screen.getByTestId("mastery-slice-challenge-phase"))
      .toHaveAttribute("data-revealing", "true");
    // Challenge 0's prompt, not challenge 1's — the server has already moved
    // on, but the player is still looking at what they answered.
    expect(shownIndex()).toBe("0");
    expect(screen.getByTestId("mastery-choice-row-12"))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.getByTestId("mastery-choice-input"))
      .toHaveAttribute("data-revealing", "true");
    expect(screen.getByTestId("mastery-inline-reveal"))
      .toHaveAttribute("data-correct", "true");
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();
    expect(screen.queryByTestId("mastery-submit-button")).toBeNull();
  });

  it("shows the right answer in green beside a wrong pick in red", () => {
    renderModule(answeredState({
      own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: "9" })],
    }));
    expect(screen.getByTestId("mastery-choice-row-9"))
      .toHaveAttribute("data-tone", "chosen-wrong");
    expect(screen.getByTestId("mastery-choice-row-12"))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.getByTestId("mastery-inline-reveal"))
      .toHaveAttribute("data-correct", "false");
  });

  it("advances itself to the server's next challenge after the window", () => {
    const state = answeredState();
    const { rerender } = renderModule(state);
    expect(shownIndex()).toBe("0");
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(shownIndex()).toBe("1");
    expect(screen.getByTestId("mastery-slice-challenge-phase"))
      .not.toHaveAttribute("data-revealing");
    expect(screen.getByTestId("mastery-submit-button")).toBeTruthy();
    void rerender;
  });

  it("a repeated poll cannot re-open a reveal already watched", () => {
    renderModule(answeredState());
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(shownIndex()).toBe("1");
    // Later polls keep re-delivering the same settled reveal — it must not
    // drag the player back to a question they have already been shown.
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS * 3); });
    expect(shownIndex()).toBe("1");
  });

  it("renders a reload landing mid-reveal, then advances without resubmitting", () => {
    const acts: ModuleSegmentActions = {
      submitChallenge: vi.fn(), busy: false, error: null,
    };
    renderModule(answeredState(), acts);
    expect(screen.getByTestId("mastery-inline-reveal")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(shownIndex()).toBe("1");
    // The answer is never re-sent, and no advance call exists to duplicate.
    expect(acts.submitChallenge).not.toHaveBeenCalled();
  });

  it("shows the LAST challenge's reveal before the completion panel", () => {
    renderModule(parse(segmentStateWire({
      own_next_challenge_index: 3,
      own_challenges_completed: 3,
      own_finished: true,
      reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
      own_challenge_reveals: [revealWire(0), revealWire(1), revealWire(2)],
    })));
    expect(screen.getByTestId("mastery-inline-reveal")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(screen.getByTestId("mastery-slice-waiting")).toBeTruthy();
  });

  it("uses the SERVER's window, not the client constant, when they differ", () => {
    renderModule(answeredState({ reveal_window_ms: 4000 }));
    act(() => { vi.advanceTimersByTime(MASTERY_REVEAL_DURATION_MS); });
    expect(shownIndex()).toBe("0");
    act(() => { vi.advanceTimersByTime(4000 - MASTERY_REVEAL_DURATION_MS); });
    expect(shownIndex()).toBe("1");
  });

  it("behaves exactly as before against a backend that sends no reveals", () => {
    renderModule(parse(segmentStateWire({
      own_next_challenge_index: 1,
      own_challenges_completed: 1,
      own_submitted_choices: [{ selected: "12" }, null, null],
    })));
    expect(shownIndex()).toBe("1");
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
    expect(screen.getByTestId("mastery-submit-button")).toBeTruthy();
  });
});

// ------------------------------------------------------- rollout safety

describe("mastery_slice renderer — rollout safety", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never pauses for a segment the server budgeted no window for", () => {
    // Phase A/B: the backend has shipped but the reveal is not activated. The
    // client must not hold, because no deadline was extended and no response
    // time was compensated for a pause it would be taking.
    renderModule(parse(segmentStateWire({
      own_next_challenge_index: 1,
      own_challenges_completed: 1,
      own_submitted_choices: [{ selected: "12" }, null, null],
      // Reveals present but NO window — the backend couples these, so this is
      // a payload it will not produce; the client refuses to pause on it
      // anyway rather than trusting that coupling from the other side.
      own_challenge_reveals: [revealWire(0)],
    })));
    expect(shownIndex()).toBe("1");
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
    expect(screen.getByTestId("mastery-submit-button")).toBeTruthy();
  });

  it("treats a zero window as disabled, not as an instant reveal", () => {
    renderModule(parse(segmentStateWire({
      own_next_challenge_index: 1,
      own_challenges_completed: 1,
      reveal_window_ms: 0,
      own_challenge_reveals: [revealWire(0)],
    })));
    expect(shownIndex()).toBe("1");
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
  });
});
