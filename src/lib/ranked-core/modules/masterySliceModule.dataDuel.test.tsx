/**
 * DD1-B — Data Duel adoption on the ordinary Ranked `mastery_slice` path.
 *
 * Covers the transport (`comparison_values` read only from the lifted-out
 * reveal list and the revealed Review row, refused anywhere pre-reveal,
 * dropped when malformed), the ordinary slice rendering a comparison through
 * the SAME registry → `ComparisonQuestionView` → Data Duel (no module or
 * registry change), the scalar `{ selected }` submit, the reveal hold with and
 * without structured values, the media band suppressed for comparisons only
 * (renderer and preload in step), and the Review values line.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { rankedRoundMedia } from "@/lib/ranked-core/media/roundMedia";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  RankedPublicParseError, readMatchReview, readPublicRound,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NUMERIC_QUESTION } from "../adapters/optionMediaFixtures";
import { masterySliceModule } from "./masterySliceModule";
import { getModuleRenderer } from "./registry";
import { structuralBandSource } from "./MasterySliceChallengeSurface";

const OPTIONS = ["leona", "pantheon", "tie"];

const VALUES = {
  contract: "comparison_values.v1",
  sides: [
    { token: "leona", value: 90.0, display: "90" },
    { token: "pantheon", value: 180.0, display: "180" },
  ],
  unit: "seconds",
  unit_label: "seconds",
  display_precision: 0,
  operator: "lesser",
  delta: 90.0,
  delta_display: "90",
};

const EXPLANATION = "Leona R (Solar Flare): 90 seconds. Pantheon R (Grand Starfall): 180 seconds. Leona wins by 90 seconds.";

/** A server media blob that draws a cinematic band (a Darius splash). */
const PRESENTATION = {
  assets: (NUMERIC_QUESTION.presentation as { assets: unknown }).assets,
  presentation: { role: "context", timing: "question", spoiler: false, scenario_type: "combat_calculation" },
};

function comparisonWire(index: number, over: Record<string, unknown> = {}) {
  return {
    challenge_index: index,
    interaction_kind: "comparison_left_right",
    question_family: "ability_cooldown_compare",
    prompt: "(unused)",
    answer_type: "single_choice",
    answer_options: OPTIONS,
    prompt_semantics: null,
    comparison_semantics: {
      template: "compare_ability_cooldown",
      champion_a_display: "Leona",
      champion_b_display: "Pantheon",
      metric: "ability_cooldown",
      dimension: "time",
      subject_ref: "R",
      ability_name_a: "Solar Flare",
      ability_name_b: "Grand Starfall",
      context: { ability_rank: 1, champion_level: null, form: null },
      unit: "seconds",
    },
    presentation: PRESENTATION,
    ...over,
  };
}

function revealWire(index: number, over: Record<string, unknown> = {}) {
  return {
    challenge_index: index,
    is_correct: true,
    player_answer: "leona",
    correct_answer: "leona",
    explanation: EXPLANATION,
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
      prompt: "Mastery Slice: Leona vs Pantheon",
      challenge_count: 2,
      challenges: [0, 1].map((i) => comparisonWire(i)),
    },
    ...over,
  };
}

function publicBody(rawState: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 2,
    challenge_index: 0, segment_number: 3, phase: "challenges",
    ability_deadline: null, challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
    resolved: false,
  };
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return body;
}

const parse = (rawState: unknown) => readPublicRound(publicBody(rawState)).segmentState!;

const answered = (reveal: Record<string, unknown> = {}) => segmentStateWire({
  own_next_challenge_index: 1,
  own_submitted_choices: [{ selected: "leona" }, null],
  own_challenges_completed: 1,
  reveal_window_ms: 1750,
  own_challenge_reveals: [revealWire(0, reveal)],
});

function renderModule(state: SegmentStateView | null, submitChallenge = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <masterySliceModule.Viewport
        publicRound={readPublicRound(publicRoundV2())}
        selection={null}
        permissions={NO_INTERACTIONS}
        onSelect={vi.fn()}
        segmentState={state}
        actions={{ submitChallenge, busy: false, error: null }}
        skewMs={0}
      />
    </QueryClientProvider>,
  );
  return submitChallenge;
}

afterEach(cleanup);

// ------------------------------------------------------------- transport

describe("DD1 transport — comparison_values rides only the reveal", () => {
  it("reads the block off an answered challenge's reveal", () => {
    const [reveal] = parse(answered({ comparison_values: VALUES })).ownChallengeReveals;
    expect(reveal.comparisonValues?.sides.map((s) => [s.token, s.display]))
      .toEqual([["leona", "90"], ["pantheon", "180"]]);
    expect(reveal.comparisonValues?.deltaDisplay).toBe("90");
  });

  it("an old reveal without the block keeps its exact pre-DD1 shape", () => {
    const [reveal] = parse(answered()).ownChallengeReveals;
    expect(reveal).not.toHaveProperty("comparisonValues");
  });

  it("a malformed block is dropped, never thrown on", () => {
    const [reveal] = parse(answered({ comparison_values: { ...VALUES, winner: "leona" } })).ownChallengeReveals;
    expect(reveal).not.toHaveProperty("comparisonValues");
  });

  it("REFUSES the block anywhere in the pre-reveal payload", () => {
    // On a live challenge…
    expect(() => parse(segmentStateWire({
      challenges: {
        prompt: "x", challenge_count: 2,
        challenges: [comparisonWire(0, { comparison_values: VALUES }), comparisonWire(1)],
      },
    }))).toThrow(RankedPublicParseError);
    // …inside the public comparison semantics…
    expect(() => parse(segmentStateWire({
      challenges: {
        prompt: "x", challenge_count: 2,
        challenges: [comparisonWire(0, {
          comparison_semantics: { ...comparisonWire(0).comparison_semantics, comparison_values: VALUES },
        }), comparisonWire(1)],
      },
    }))).toThrow(RankedPublicParseError);
    // …or at the segment's top level.
    expect(() => parse(segmentStateWire({ comparison_values: VALUES }))).toThrow(RankedPublicParseError);
  });

  it("still refuses a reveal for a challenge the viewer can answer", () => {
    expect(() => parse(segmentStateWire({
      own_challenge_reveals: [revealWire(0, { comparison_values: VALUES })],
    }))).toThrow(RankedPublicParseError);
  });
});

// -------------------------------------------------------------- rendering

describe("DD1 — the ordinary slice renders a comparison as a Data Duel", () => {
  it("resolves through the unchanged module registry", () => {
    expect(getModuleRenderer("mastery_slice", 1)).toBe(masterySliceModule);
  });

  it("draws the duel from public semantics only: no value, no answer, no band", () => {
    renderModule(parse(segmentStateWire()));
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-render-path", "comparison");
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "open");
    expect(screen.getByTestId("duel-side-left")).toHaveTextContent("Leona");
    expect(screen.getByTestId("duel-side-left")).toHaveTextContent("R · Solar Flare");
    expect(screen.getByTestId("duel-side-right")).toHaveTextContent("Pantheon");
    expect(screen.getByTestId("duel-side-tie")).toHaveTextContent("Same value");
    // The Data Duel's tablets are the subjects' art: no scenario band above it.
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    const text = screen.getByTestId("mastery-slice-challenge-phase").textContent ?? "";
    for (const leak of ["90", "180", "wins by"]) expect(text).not.toContain(leak);
  });

  it("submits the scalar answer token through the module's own action", () => {
    const submit = renderModule(parse(segmentStateWire()));
    fireEvent.click(screen.getByTestId("duel-side-right"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(submit).toHaveBeenCalledWith(0, { selected: "pantheon" });
  });

  it("submits the tie token unchanged", () => {
    const submit = renderModule(parse(segmentStateWire()));
    fireEvent.click(screen.getByTestId("duel-side-tie"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(submit).toHaveBeenCalledWith(0, { selected: "tie" });
  });

  it("the reveal hold shows both served values and the margin", () => {
    renderModule(parse(answered({ comparison_values: VALUES })));
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-revealing", "true");
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent("90 seconds");
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent("180 seconds");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Leona by 90 seconds");
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent(EXPLANATION);
  });

  it("a legacy reveal (no block) shows the tags and the prose, and no numbers in the duel", () => {
    renderModule(parse(answered({ is_correct: false, player_answer: "pantheon" })));
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(screen.getByTestId("duel-value-left").textContent).toBe("");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    const duel = screen.getByTestId("mig-data-duel").textContent ?? "";
    for (const leak of ["90", "180", "seconds"]) expect(duel).not.toContain(leak);
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent(EXPLANATION);
  });
});

describe("DD1 — the media band is suppressed for comparisons only", () => {
  const atomic = {
    challenge_index: 0,
    interaction_kind: "atomic_recall",
    question_family: "ability_cooldown",
    prompt: "Ahri W",
    answer_type: "single_choice",
    answer_options: ["9", "12"],
    prompt_semantics: {
      template: "ability_cooldown_at_rank", champion_display: "Ahri", metric: "ability_cooldown",
      subject_ref: "W", ability_name: "W", context: { ability_rank: 1, champion_level: null, form: null },
    },
    comparison_semantics: null,
    presentation: PRESENTATION,
  };

  it("structuralBandSource: null for a comparison, the server's blob otherwise", () => {
    const state = parse(segmentStateWire({
      challenges: { prompt: "x", challenge_count: 2, challenges: [atomic, comparisonWire(1)] },
    }));
    const block = state.block as { contract: "mastery_slice"; challenges: Parameters<typeof structuralBandSource>[0][] };
    expect(structuralBandSource(block.challenges[0])).not.toBeNull();
    expect(structuralBandSource(block.challenges[1])).toBeNull();
  });

  it("the round's media preload no longer waits on a comparison's band art", () => {
    const body = (challenges: unknown[]) => readPublicRound(publicBody(segmentStateWire({
      challenges: { prompt: "x", challenge_count: challenges.length, challenges },
    })));
    const compare = rankedRoundMedia(body([comparisonWire(0)]), { manifest: null, viewportWidth: 1440 });
    const recall = rankedRoundMedia(body([atomic]), { manifest: null, viewportWidth: 1440 });
    expect(recall.critical.some((u) => u.includes("/splash/"))).toBe(true);
    expect(compare.critical.some((u) => u.includes("/splash/"))).toBe(false);
  });
});

// ----------------------------------------------------------------- review

describe("DD1 — match Review", () => {
  function reviewChallenge(over: Record<string, unknown> = {}) {
    const { presentation: _p, ...wire } = comparisonWire(0);
    return {
      ...wire,
      prompt: "Which has the shorter cooldown at rank 1: Leona R or Pantheon R?",
      correct_answer: "leona",
      explanation: EXPLANATION,
      viewer_answer: "pantheon",
      is_correct: false,
      ...over,
    };
  }
  function review(revealed: boolean, challenge: Record<string, unknown>) {
    return readMatchReview({
      schema_version: "ranked_duel.match_review.v1",
      projection_type: "match_review",
      match_id: "m1",
      round_number: null,
      server_time: "2026-08-20T12:00:00+00:00",
      payload: {
        match_id: "m1", final_round_number: 1, round_count: 1,
        rounds: [{
          round_number: 1, kind: "mastery_slice", module_id: "mastery_slice",
          category: null, canonical_question_ref: null, revealed,
          icon_hint: { kind: "generic", key: null, icon: null },
          question: null, challenges: [challenge],
          viewer_submission: {
            answer_index: null, is_correct: null,
            correct_count: 0, answered_count: 1, challenge_count: 1,
          },
        }],
      },
    });
  }

  it("reads the block on a revealed row and prints one values line", () => {
    const round = review(true, reviewChallenge({ comparison_values: VALUES })).rounds[0];
    expect(round.masteryChallenges![0].comparisonValues?.sides[1].display).toBe("180");
    render(<QuestionReviewCard round={round} position={1} total={1} />);
    expect(screen.getByTestId("review-mastery-values-0"))
      .toHaveTextContent("Leona 90 seconds · Pantheon 180 seconds");
    expect(screen.getByTestId("review-mastery-explanation-0")).toHaveTextContent(EXPLANATION);
  });

  it("a row without the block keeps its explanation and prints no values line", () => {
    const round = review(true, reviewChallenge()).rounds[0];
    render(<QuestionReviewCard round={round} position={1} total={1} />);
    expect(screen.queryByTestId("review-mastery-values-0")).toBeNull();
    expect(screen.getByTestId("review-mastery-explanation-0")).toHaveTextContent(EXPLANATION);
  });

  it("a malformed block on a revealed row is dropped, not fatal", () => {
    const round = review(true, reviewChallenge({ comparison_values: { ...VALUES, sides: [] } })).rounds[0];
    expect(round.masteryChallenges![0]).not.toHaveProperty("comparisonValues");
  });

  it("an UNREVEALED row carrying the block fails the parse (inverse guard)", () => {
    expect(() => review(false, reviewChallenge({
      correct_answer: null, explanation: null, is_correct: null, comparison_values: VALUES,
    }))).toThrow(RankedPublicParseError);
  });
});
