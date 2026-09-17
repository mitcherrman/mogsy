/**
 * RQ1 — Mastery Slice challenges carry frozen question roles.
 *
 * The backend freezes each challenge's `roles` from structured champion
 * identity; the client only reads and draws them with the existing emblem
 * cluster. Family stays family.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASTERY_REVEAL_DURATION_MS } from "@/features/mastery/interactions/revealState";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { MasterySliceChallengeView, SegmentStateView } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { TimelineNode } from "@/lib/ranked-core/viewTypes";
import { RoundTimeline } from "@/components/ranked-arena/RoundTimeline";
import { TIMELINE_ANCHOR_INDEX, TIMELINE_VISIBLE_NODES } from "@/lib/ranked-core/roundTimeline";
import { masterySliceModule } from "./masterySliceModule";
import { MasterySliceChallengeSurface, questionViewForChallenge } from "./MasterySliceChallengeSurface";

const OPTIONS = ["9", "12", "6", "5"];

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function recallWire(index: number, roles?: unknown) {
  return {
    challenge_index: index,
    interaction_kind: "atomic_recall",
    question_family: "ability_cooldown",
    prompt: `Senna Q — ability_cooldown #${index}`,
    answer_type: "single_choice",
    answer_options: OPTIONS,
    prompt_semantics: {
      template: "ability_cooldown_at_rank", champion_display: "Senna",
      metric: "ability_cooldown", subject_ref: "Q", ability_name: "Q",
      context: { ability_rank: 1, champion_level: null, form: null },
    },
    comparison_semantics: null,
    ...(roles === undefined ? {} : { roles }),
  };
}

function segmentWire(challenges: unknown[], over: Record<string, unknown> = {}) {
  return {
    active: true, segment_number: 3, module_id: "mastery_slice", module_version: 1,
    phase: "challenges", challenge_count: challenges.length, ability_deadline: null,
    challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
    own_ability: { selected_ability_id: null, confirmed: false,
      available_ability_ids: [], unavailable_ability_ids: {} },
    opponent_ability_confirmed: false, own_next_challenge_index: 0,
    own_submitted_choices: challenges.map(() => null), own_challenges_completed: 0,
    opponent_challenges_completed: 0, opponent_finished: false, own_finished: false,
    challenges: { prompt: "Mastery Slice: Senna", challenge_count: challenges.length, challenges },
    ...over,
  };
}

function parseRound(rawState: unknown, segmentTopic?: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 3,
    challenge_index: 0, segment_number: 3, phase: "challenges",
    ability_deadline: null, challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
    resolved: false, ...(segmentTopic ? { topic: segmentTopic } : {}),
  };
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return readPublicRound(body);
}

function renderViewport(state: SegmentStateView | null) {
  return render(withQueryClient(<masterySliceModule.Viewport
    publicRound={readPublicRound(publicRoundV2())}
    selection={null} permissions={NO_INTERACTIONS} onSelect={vi.fn()}
    segmentState={state}
    actions={{ submitChallenge: vi.fn(), busy: false, error: null }}
    skewMs={0} />));
}

const emblemRoles = (root: HTMLElement) =>
  within(root).getAllByTestId("role-emblem").map((e) => e.getAttribute("data-role"));

afterEach(cleanup);

describe("transport", () => {
  it("reads challenge roles in canonical order and leaves family alone", () => {
    const round = parseRound(segmentWire([
      recallWire(0, ["support", "adc", "adc"]), recallWire(1), recallWire(2, ["bogus"]),
    ]));
    const block = round.segmentState!.block!;
    expect(block.contract).toBe("mastery_slice");
    const cs = (block as { challenges: MasterySliceChallengeView[] }).challenges;
    expect(cs[0].roles).toEqual(["adc", "support"]);
    expect(cs[0].questionFamily).toBe("ability_cooldown");
    expect(cs[1].roles).toBeUndefined();          // older / role-less: still valid
    expect(cs[2].roles).toBeUndefined();
  });

  it("reads the segment topic a Mastery slice publishes for the timeline", () => {
    const round = parseRound(segmentWire([recallWire(0)]), {
      category: "general", tier: null, icon_hint: { kind: "generic", key: null, icon: null },
      roles: ["top", "jungle", "mid", "adc", "support"],
    });
    expect(round.segment.topic?.roles).toEqual(["top", "jungle", "mid", "adc", "support"]);
    expect(parseRound(segmentWire([recallWire(0)])).segment.topic).toBeUndefined();
  });
});

describe("live Mastery question", () => {
  it("an atomic recall header shows the challenge's emblems, left of the patch badge", () => {
    const state = parseRound(segmentWire([recallWire(0, ["adc", "support"]), recallWire(1)]))
      .segmentState!;
    renderViewport(state);
    const header = screen.getByTestId("question-role-emblems");
    expect(emblemRoles(header)).toEqual(["adc", "support"]);
    expect(header.getAttribute("aria-label")).toBe("Question roles: ADC, Support");
  });

  it("a comparison renders the union it was given, and five roles all render", () => {
    const comparison: MasterySliceChallengeView = {
      challengeIndex: 0, interactionKind: "comparison_left_right",
      questionFamily: "ability_cooldown", prompt: "Brand Q vs Diana Q",
      answerType: "single_choice", answerOptions: ["Brand", "Diana", "tie"],
      promptSemantics: null,
      comparisonSemantics: {
        template: "compare_ability_cooldown", champion_a_display: "Brand",
        champion_b_display: "Diana", metric: "ability_cooldown", dimension: "duration",
        subject_ref: "Q", context: { ability_rank: 1, champion_level: null, form: null },
        unit: "seconds", ability_name_a: "Sear", ability_name_b: "Crescent Strike",
        rank_independent: false,
      },
      roles: ["top", "jungle", "mid", "adc", "support"],
    };
    render(withQueryClient(<MasterySliceChallengeSurface challenge={comparison} total={3}
      submitting={false} onSubmit={vi.fn()} />));
    expect(emblemRoles(screen.getByTestId("question-role-emblems")))
      .toEqual(["top", "jungle", "mid", "adc", "support"]);
  });

  it("a prose (applied-chain) challenge carries roles into the shared metadata row", () => {
    const prose: MasterySliceChallengeView = {
      challengeIndex: 0, interactionKind: "legacy_combat",
      questionFamily: "post_mitigation_single_type_damage",
      prompt: "Jarvan IV hits Olaf…", answerType: "single_choice", answerOptions: OPTIONS,
      promptSemantics: null, comparisonSemantics: null, roles: ["top", "jungle"],
    };
    const view = questionViewForChallenge(prose);
    expect(view.roles).toEqual(["top", "jungle"]);
    expect(view.category).toBe("post_mitigation_single_type_damage");  // family stays family
    render(withQueryClient(<MasterySliceChallengeSurface challenge={prose} total={3}
      submitting={false} onSubmit={vi.fn()} />));
    // With no media the category (and so the emblems) sits in the compact band.
    expect(emblemRoles(screen.getByTestId("scenario-compact"))).toEqual(["top", "jungle"]);
  });

  it("a role-less challenge renders no emblem", () => {
    renderViewport(parseRound(segmentWire([recallWire(0), recallWire(1)])).segmentState!);
    expect(screen.queryByTestId("role-emblem")).toBeNull();
  });
});

describe("reveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the answered challenge keeps its emblems through the reveal hold", () => {
    const state = parseRound(segmentWire(
      [recallWire(0, ["adc", "support"]), recallWire(1), recallWire(2)],
      {
        own_next_challenge_index: 1, own_challenges_completed: 1,
        own_submitted_choices: [{ selected: "12" }, null, null],
        reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
        own_challenge_reveals: [{
          challenge_index: 0, is_correct: true, player_answer: "12", correct_answer: "12",
          explanation: "x", answer_type: "single_choice", answer_options: OPTIONS,
        }],
      })).segmentState!;
    renderViewport(state);
    expect(screen.getByTestId("mastery-slice-challenge-phase"))
      .toHaveAttribute("data-revealing", "true");
    expect(emblemRoles(screen.getByTestId("question-role-emblems"))).toEqual(["adc", "support"]);
  });
});

describe("timeline", () => {
  it("a Mastery segment node draws the role marker from its segment topic", () => {
    const nodes: TimelineNode[] = [{
      roundNumber: 3, index: 0, visible: true, state: "current", segmentKind: "standard",
      outcome: null, tag: null,
      topic: { category: "general", tier: null, iconHint: { kind: "generic", key: null, icon: null },
        roles: ["adc", "support"] },
    }];
    render(<RoundTimeline timeline={{ visibleNodes: TIMELINE_VISIBLE_NODES,
      anchorIndex: TIMELINE_ANCHOR_INDEX, windowStart: 3, currentIndex: 0,
      currentRoundNumber: 3, anchored: false, nodes }} />);
    expect(emblemRoles(screen.getByTestId("timeline-node-roles-3"))).toEqual(["adc", "support"]);
  });
});
