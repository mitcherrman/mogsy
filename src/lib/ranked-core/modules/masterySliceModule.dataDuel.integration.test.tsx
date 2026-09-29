/**
 * DD1-F — the JP2 boundary on the landed tree: an ORDINARY comparison is a
 * Data Duel; a JOURNEY comparison is JP2's stage (exactly one presentation,
 * no Data Duel, no return of the retired matchup-sides path); a legacy reveal
 * (no `comparison_values`) and a structured reveal both still render.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  readMasterySliceChallenge, readPublicRound,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import type { JourneyChildContext } from "@/lib/journey/adapter";
import { masterySliceModule } from "./masterySliceModule";
import { MasterySliceChallengeSurface } from "./MasterySliceChallengeSurface";

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
const PRESENTATION = null;

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

const JOURNEY: JourneyChildContext = {
  index: 0, engine: "matchup",
  asks: { engine: "matchup", family: "ability_cooldown_compare", metric: "ability_cooldown", subjectRef: "R", subject: ["leona", "pantheon"] },
  formula: null, recalled: [], reinforces: [],
  playerChampion: "leona", opponentChampion: "pantheon",
};
const DUEL = '[data-mig-primitive="data-duel"]';
const challengeOf = () => readMasterySliceChallenge(comparisonWire(0), "challenges[0]");

describe("DD1-F — ordinary vs Journey comparison", () => {
  it("1. an ordinary comparison_left_right renders the Data Duel", () => {
    renderModule(parse(segmentStateWire()));
    expect(document.querySelectorAll(DUEL)).toHaveLength(1);
  });

  it("2-3. a Journey comparison renders NO Data Duel and exactly one JP2 stage child", () => {
    const ch = challengeOf();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MasterySliceChallengeSurface challenge={ch } total={2} submitting={false}
          onSubmit={vi.fn()} journey={JOURNEY} />
      </QueryClientProvider>,
    );
    expect(document.querySelectorAll(DUEL)).toHaveLength(0);
    expect(screen.queryByTestId("mig-data-duel")).toBeNull();
    expect(document.querySelectorAll("[data-testid='journey-child']")).toHaveLength(1);
    expect(document.querySelector("[data-testid='journey-matchup-sides']")).toBeNull();
  });

  it("4. a legacy comparison reveal (no structured values) still renders, with its explanation", () => {
    renderModule(parse(answered()));
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent(EXPLANATION);
  });

  it("5. a structured comparison reveal shows the backend-authored values", () => {
    renderModule(parse(answered({ comparison_values: VALUES })));
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent("90 seconds");
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent("180 seconds");
  });
});
