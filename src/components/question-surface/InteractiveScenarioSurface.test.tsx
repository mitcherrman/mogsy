import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};
const LOCKED: InteractionPermissions = {
  canSelectAnswer: false, canChangeAnswer: false, canSelectAbility: false,
  canReviewSubmission: false, canConfirmSubmission: false, canAdvance: false,
};

const Q: QuestionView = {
  questionId: "q", category: "items", prompt: "Highest flat AP item?",
  options: [
    { id: "0", index: 0, label: "Rabadon's Deathcap" },
    { id: "1", index: 1, label: "Blasting Wand" },
    { id: "2", index: 2, label: "Amplifying Tome" },
    { id: "3", index: 3, label: "Needlessly Large Rod" },
  ],
};
const ITEM_SCENARIO: QuizQuestion = {
  id: "q", category: "items", question_text: Q.prompt, format: "multiple_choice",
  choices: Q.options.map((o) => o.label),
  metadata: { assets: { subject: { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" } } },
};

function setup(props: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>> = {}) {
  const onSelectOption = vi.fn();
  render(
    <InteractiveScenarioSurface
      question={Q} selectedOptionId={null} permissions={OPEN}
      onSelectOption={onSelectOption} variant="competitive" {...props}
    />,
  );
  return { onSelectOption };
}

describe("InteractiveScenarioSurface", () => {
  it("renders the prompt and all options", () => {
    setup();
    expect(screen.getByTestId("scenario-surface")).toBeInTheDocument();
    expect(screen.getByText("Highest flat AP item?")).toBeInTheDocument();
    for (const o of Q.options) expect(screen.getByText(o.label)).toBeInTheDocument();
  });

  it("shows the COMPACT band (not a giant cinematic panel) when no scenario source", () => {
    setup();
    const compact = screen.getByTestId("scenario-compact");
    expect(compact).toBeInTheDocument();
    // no cinematic container-query hero, and no broken media in the compact band
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(within(compact).queryByRole("img")).toBeNull();
    // capability flag reflects the choice (never a mode identity flag)
    expect(screen.getByTestId("scenario-surface")).toHaveAttribute("data-band", "compact");
  });

  it("keeps the readable category label in the compact band and never duplicates the prompt", () => {
    setup({ question: { ...Q, category: "combat_math" } });
    // category rendered once (in the compact band), normalized for display
    expect(screen.getByText("combat math")).toBeInTheDocument();
    // the prompt appears exactly once — the band must not echo it
    expect(screen.getAllByText(Q.prompt)).toHaveLength(1);
  });

  it("renders the premium CINEMATIC visual when a rich source is present", () => {
    setup({ scenarioSource: ITEM_SCENARIO });
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
    expect(screen.getByTestId("scenario-surface")).toHaveAttribute("data-band", "cinematic");
  });

  it("falls back to the compact band when a source classifies to nothing rich", () => {
    const empty: QuizQuestion = {
      id: "q", category: "items", question_text: Q.prompt, format: "multiple_choice",
      choices: Q.options.map((o) => o.label),
      metadata: { assets: { subject: { type: "mystery-unknown" } } },
    };
    setup({ scenarioSource: empty });
    expect(screen.getByTestId("scenario-compact")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
  });

  it("emits the selected option through onSelectOption", () => {
    const { onSelectOption } = setup();
    fireEvent.click(screen.getByText("Blasting Wand"));
    expect(onSelectOption).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1", index: 1, label: "Blasting Wand" }),
    );
  });

  it("does not select when locked (permissions closed)", () => {
    const onSelectOption = vi.fn();
    render(
      <InteractiveScenarioSurface question={Q} selectedOptionId={null}
        permissions={LOCKED} onSelectOption={onSelectOption} variant="competitive" />,
    );
    fireEvent.click(screen.getByText("Blasting Wand"));
    expect(onSelectOption).not.toHaveBeenCalled();
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "locked");
  });

  it("leaks NO correctness pre-reveal (no revealed styling, no explanation)", () => {
    setup({ scenarioSource: ITEM_SCENARIO });
    expect(screen.getByTestId("answer-grid")).not.toHaveAttribute("data-answers-state", "revealed");
    // no explanation / feedback block pre-reveal
    expect(screen.queryByText(/Correct!|Incorrect/)).toBeNull();
  });

  it("shows correct reveal + explanation when reveal is provided (standard variant)", () => {
    setup({
      variant: "standard", scenarioSource: ITEM_SCENARIO, selectedOptionId: "0",
      reveal: { revealed: true, isCorrect: true, correctOptionId: "0", explanation: "130 AP flat + 35% amp." },
    });
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "revealed");
    expect(screen.getByText("130 AP flat + 35% amp.")).toBeInTheDocument();
  });

  it("competitive variant hides the explanation block even at reveal (density)", () => {
    setup({
      scenarioSource: ITEM_SCENARIO, selectedOptionId: "0",
      reveal: { revealed: true, isCorrect: true, correctOptionId: "0", explanation: "hidden here" },
    });
    // reveal styling still applies to the grid, but no explanation copy in compact competitive
    expect(screen.queryByText("hidden here")).toBeNull();
  });

  it("degrades gracefully on a missing asset (no throw, hero still renders)", () => {
    const broken: QuizQuestion = {
      ...ITEM_SCENARIO,
      metadata: { assets: { subject: { type: "item", name: "X", icon: "assets/items/nope.png" } } },
    };
    setup({ scenarioSource: broken });
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
  });

  it("keeps a spoiler-hidden subject CINEMATIC pre-reveal (no band resize on reveal)", () => {
    const spoiler: QuizQuestion = {
      id: "q", category: "champions", question_text: "Which champion is from Ionia?",
      format: "multiple_choice", choices: Q.options.map((o) => o.label),
      metadata: {
        assets: { subject: { type: "champion", name: "Ahri" } },
        presentation: { spoiler: true, role: "answer", timing: "reveal" },
      },
    };
    setup({ scenarioSource: spoiler });
    // Placeholder-masked subject stays in the tall cinematic band so it does not
    // jump size when the backend reveal upgrades it to a splash.
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
    expect(screen.getByTestId("scenario-surface")).toHaveAttribute("data-band", "cinematic");
  });

  it("speed variant renders no media band", () => {
    setup({ variant: "speed" });
    expect(screen.getByTestId("scenario-surface")).toHaveAttribute("data-media", "none");
    expect(screen.getByTestId("scenario-surface")).toHaveAttribute("data-band", "none");
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
  });

  it("exposes an accessible answer group", () => {
    setup();
    expect(screen.getByRole("group", { name: "Answer options" })).toBeInTheDocument();
  });
});
