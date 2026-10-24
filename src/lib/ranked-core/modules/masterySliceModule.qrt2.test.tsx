/**
 * QRT2 — the Ranked Mastery slice tells a held per-challenge reveal in words.
 *
 * What is proved: the prose path's tablets carry the server's answer and the
 * player's pick as "Correct answer" / "Your pick" tabs, ONLY while the
 * server's own reveal is held; the inline reveal's headline uses the arena
 * stamp's words and icon; TIMED OUT comes from the server's
 * `own_timed_out_challenges` flag and is never inferred from a missing pick;
 * and a correct value that matches no offered option lights nothing.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MASTERY_REVEAL_DURATION_MS } from "@/features/mastery/interactions/revealState";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { masterySliceModule } from "./masterySliceModule";
import { surfaceRevealFor } from "./MasterySliceChallengeSurface";
import type { ModuleSegmentActions } from "./types";

const OPTIONS = ["9", "12", "6", "5"];

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function challengeWire(index: number, over: Record<string, unknown> = {}) {
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
    ...over,
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

/** `prompt_semantics: null` sends a challenge down the PROSE path (the arena surface). */
const proseChallenges = () =>
  [0, 1, 2].map((i) => challengeWire(i, { prompt_semantics: null }));

function segmentStateWire(over: Record<string, unknown> = {}, prose = false) {
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
      challenges: prose ? proseChallenges() : [0, 1, 2].map((i) => challengeWire(i)),
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

function renderModule(state: SegmentStateView | null) {
  const acts: ModuleSegmentActions = { submitChallenge: vi.fn(), busy: false, error: null };
  return render(
    withQueryClient(<masterySliceModule.Viewport
      publicRound={readPublicRound(publicRoundV2())}
      selection={null}
      permissions={NO_INTERACTIONS}
      onSelect={vi.fn()}
      segmentState={state}
      actions={acts}
      skewMs={0}
    />),
  );
}

const held = (prose: boolean, over: Record<string, unknown> = {}) => parse(segmentStateWire({
  own_next_challenge_index: 1,
  own_challenges_completed: 1,
  own_submitted_choices: [{ selected: "12" }, null, null],
  reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
  own_challenge_reveals: [revealWire(0)],
  ...over,
}, prose));

/** The answer tablet whose LABEL is `label` (the inline reveal repeats the answer's text). */
const tablet = (label: string) => {
  const found = [...document.querySelectorAll<HTMLElement>("[data-quiz-choice]")]
    .find((b) => b.querySelector("span.min-w-0")?.textContent === label);
  if (!found) throw new Error(`no tablet labelled ${label}`);
  return found;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("surfaceRevealFor — a pure mapping of the server's own words", () => {
  const challenge = { answerOptions: OPTIONS } as Parameters<typeof surfaceRevealFor>[0];
  const reveal = (over: Record<string, unknown>) =>
    ({ correct: true, correctValue: "12", selectedValue: "12", answerLabel: "12",
      explanation: null, ...over }) as Parameters<typeof surfaceRevealFor>[1];

  it("finds the option whose label is the server's correct value", () => {
    expect(surfaceRevealFor(challenge, reveal({}))).toEqual(
      { revealed: true, isCorrect: true, correctOptionId: "1" });
  });

  it("carries the server's verdict untouched, even against the pick", () => {
    expect(surfaceRevealFor(challenge, reveal({ correct: false, selectedValue: "12" })).isCorrect)
      .toBe(false);
  });

  it("discloses no option for a value the grid never offered, or none at all", () => {
    expect(surfaceRevealFor(challenge, reveal({ correctValue: "13" })).correctOptionId).toBeNull();
    expect(surfaceRevealFor(challenge, reveal({ correctValue: null })).correctOptionId).toBeNull();
  });
});

describe("prose path — the held reveal", () => {
  it("renders through the arena surface, not the atomic renderer", () => {
    renderModule(held(true));
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-render-path", "prose");
    expect(screen.getByTestId("scenario-surface")).toBeTruthy();
  });

  it("CORRECT: the player's own tablet carries both tabs; the headline is CORRECT", () => {
    renderModule(held(true));
    const right = tablet("12");
    expect(right.getAttribute("data-choice-state")).toBe("correct");
    expect(within(right).getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
    expect(within(right).getByTestId("answer-your-pick")).toHaveTextContent("Your pick");
    const verdict = screen.getByTestId("mastery-verdict");
    expect(verdict).toHaveAttribute("data-verdict", "correct");
    expect(verdict).toHaveTextContent("Correct");
    expect(verdict.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("mastery-reveal-answer")).toHaveTextContent("12");
  });

  it("INCORRECT: the wrong pick and the right answer are marked apart, in words", () => {
    renderModule(held(true, {
      own_submitted_choices: [{ selected: "9" }, null, null],
      own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: "9" })],
    }));
    const wrong = tablet("9");
    const right = tablet("12");
    expect(wrong.getAttribute("data-choice-state")).toBe("incorrect-selected");
    expect(right.getAttribute("data-choice-state")).toBe("correct");
    expect(within(wrong).getByTestId("answer-your-pick")).toBeTruthy();
    expect(within(wrong).queryByTestId("answer-correct-tag")).toBeNull();
    expect(within(right).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(within(right).queryByTestId("answer-your-pick")).toBeNull();
    expect(screen.getByTestId("mastery-verdict")).toHaveAttribute("data-verdict", "incorrect");
    expect(screen.getByTestId("mastery-verdict")).toHaveTextContent("Incorrect");
  });

  it("TIMED OUT comes from the server's flag: no pick tab, its own words", () => {
    renderModule(held(true, {
      own_submitted_choices: [null, null, null],
      own_timed_out_challenges: [true, false, false],
      own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: null })],
    }));
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
    expect(within(tablet("12")).getByTestId("answer-correct-tag")).toBeTruthy();
    const verdict = screen.getByTestId("mastery-verdict");
    expect(verdict).toHaveAttribute("data-verdict", "timeout");
    expect(verdict).toHaveTextContent("Timed out");
    expect(verdict).not.toHaveTextContent("Incorrect");
  });

  it("a missing pick WITHOUT the server's flag is never read as a timeout", () => {
    renderModule(held(true, {
      own_submitted_choices: [null, null, null],
      own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: null })],
    }));
    expect(screen.getByTestId("mastery-verdict")).toHaveAttribute("data-verdict", "incorrect");
  });

  it("a correct value matching no offered option lights nothing and tags nothing", () => {
    renderModule(held(true, {
      own_challenge_reveals: [revealWire(0, { correct_answer: "13" })],
    }));
    expect(document.querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
  });

  it("before any reveal the tablets say nothing: no tab, no correct state, no verdict", () => {
    renderModule(parse(segmentStateWire({}, true)));
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
    expect(document.querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("mastery-verdict")).toBeNull();
  });
});

describe("atomic path — the inline reveal headline", () => {
  it("says CORRECT / INCORRECT / TIMED OUT in the shared words, with an icon each", () => {
    const base = {
      own_next_challenge_index: 1, own_challenges_completed: 1,
      reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
    };
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ ...base, own_submitted_choices: [{ selected: "12" }, null, null],
        own_challenge_reveals: [revealWire(0)] }, "correct", "Correct"],
      [{ ...base, own_submitted_choices: [{ selected: "9" }, null, null],
        own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: "9" })] },
        "incorrect", "Incorrect"],
      [{ ...base, own_submitted_choices: [null, null, null],
        own_timed_out_challenges: [true, false, false],
        own_challenge_reveals: [revealWire(0, { is_correct: false, player_answer: null })] },
        "timeout", "Timed out"],
    ];
    for (const [state, verdict, words] of cases) {
      const view = renderModule(parse(segmentStateWire(state)));
      expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-render-path", "atomic_recall");
      const el = screen.getByTestId("mastery-verdict");
      expect(el).toHaveAttribute("data-verdict", verdict);
      expect(el).toHaveTextContent(words);
      expect(el.querySelector("svg")).not.toBeNull();
      view.unmount();
    }
  });
});

// ────────────────────────────────── the atomic rows and the comparison duel

const row = (value: string) => screen.getByTestId(`mastery-choice-row-${value}`);

describe("atomic path - the choice rows tell the answer and the pick in words", () => {
  const rowsReveal = (over: Record<string, unknown>, picked: string | null) => held(false, {
    own_submitted_choices: [picked === null ? null : { selected: picked }, null, null],
    own_challenge_reveals: [revealWire(0, over)],
    ...(picked === null ? { own_timed_out_challenges: [true, false, false] } : {}),
  });

  it("CORRECT: the player's own row carries both tabs", () => {
    renderModule(rowsReveal({}, "12"));
    const r = row("12");
    expect(within(r).getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
    expect(within(r).getByTestId("answer-your-pick")).toHaveTextContent("Your pick");
    expect(screen.getAllByTestId("answer-result-tags")).toHaveLength(1);
  });

  it("INCORRECT: the wrong pick and the right answer are different rows, each tabbed", () => {
    renderModule(rowsReveal({ is_correct: false, player_answer: "9" }, "9"));
    expect(row("9").getAttribute("data-tone")).toBe("chosen-wrong");
    expect(within(row("9")).getByTestId("answer-your-pick")).toBeTruthy();
    expect(within(row("9")).queryByTestId("answer-correct-tag")).toBeNull();
    expect(within(row("12")).getByTestId("answer-correct-tag")).toBeTruthy();
    expect(within(row("12")).queryByTestId("answer-your-pick")).toBeNull();
  });

  it("TIMEOUT: only the answer is tabbed", () => {
    renderModule(rowsReveal({ is_correct: false, player_answer: null }, null));
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
    expect(within(row("12")).getByTestId("answer-correct-tag")).toBeTruthy();
  });

  it("the tab is part of the row's label (so the radio's name carries it) and never a live region", () => {
    renderModule(rowsReveal({ is_correct: false, player_answer: "9" }, "9"));
    const tags = screen.getAllByTestId("answer-result-tags");
    for (const t of tags) {
      expect(t.closest("label")).not.toBeNull();
      expect(t.closest('[role="status"], [aria-live]')).toBeNull();
    }
  });

  it("before a reveal no row is tabbed", () => {
    renderModule(parse(segmentStateWire({})));
    expect(screen.queryByTestId("answer-result-tags")).toBeNull();
  });

  it("a reveal that names a value no row offers tabs no row as the answer", () => {
    renderModule(rowsReveal({ correct_answer: "13", is_correct: false, player_answer: "9" }, "9"));
    expect(screen.queryByTestId("answer-correct-tag")).toBeNull();
    expect(within(row("9")).getByTestId("answer-your-pick")).toBeTruthy();
  });
});

describe("comparison path - the duel's tags read the arena's words", () => {
  const comparisonWire = (i: number) => ({
    challenge_index: i, interaction_kind: "comparison_left_right",
    question_family: "ability_cooldown", prompt: "Brand Q vs Diana Q - ability_cooldown",
    answer_type: "single_choice", answer_options: ["Brand", "Diana", "tie"],
    prompt_semantics: null,
    comparison_semantics: { template: "compare_ability_cooldown", champion_a_display: "Brand",
      champion_b_display: "Diana", metric: "ability_cooldown", dimension: "duration",
      subject_ref: "Q", context: { ability_rank: 1, champion_level: null, form: null },
      unit: "seconds", ability_name_a: "Sear", ability_name_b: "Crescent Strike",
      rank_independent: false },
  });
  const duel = (picked: string, correct: string) => {
    const wire = segmentStateWire({
      own_next_challenge_index: 1, own_challenges_completed: 1,
      reveal_window_ms: MASTERY_REVEAL_DURATION_MS,
      own_submitted_choices: [{ selected: picked }, null, null],
      own_challenge_reveals: [revealWire(0, {
        is_correct: picked === correct, player_answer: picked, correct_answer: correct,
        answer_options: ["Brand", "Diana", "tie"],
      })],
    });
    (wire.challenges as { challenges: unknown[] }).challenges = [0, 1, 2].map(comparisonWire);
    return parse(wire);
  };

  it("the picked side says Your pick and the answer side says Correct answer", () => {
    renderModule(duel("Diana", "Brand"));
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-render-path", "comparison");
    expect(screen.getByTestId("duel-tag-pick-right")).toHaveTextContent("Your pick");
    expect(screen.getByTestId("duel-tag-answer-left")).toHaveTextContent("Correct answer");
    expect(screen.queryByText("Locked")).toBeNull();
    // The accessible names say it too.
    expect(screen.getByTestId("duel-side-left").getAttribute("aria-label")).toContain("correct answer");
    expect(screen.getByTestId("duel-side-right").getAttribute("aria-label")).toContain("your pick");
  });
});
