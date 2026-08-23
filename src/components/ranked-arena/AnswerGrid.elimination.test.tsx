/**
 * THE ELIMINATION SEAM (ARENA1 Step 2B).
 *
 * The canonical answer surface — `InteractiveScenarioSurface` → `AnswerGrid` →
 * `QuizAnswerOptions` — had exactly two states for the choice set as a whole:
 * open, or closed because a result arrived. A retry-until-correct mode needs a
 * third that belongs to ONE choice, and having no way to say that is the entire
 * reason a second answer grid was written for the Daily Challenge.
 *
 * Two things are asserted here, and the first matters more than the second:
 *
 *  1. WITH THE PROP ABSENT, NOTHING CHANGED. Ranked supplies no eliminated
 *     options, so the seam must be dormant — same DOM, same states, same
 *     interaction, same classes.
 *  2. With it supplied, one choice goes out without touching its siblings.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AnswerOptionView, InteractionPermissions, NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";
import { AnswerGrid } from "./AnswerGrid";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";

const OPTIONS: AnswerOptionView[] = [
  { id: "0", index: 0, label: "Sunfire Aegis" },
  { id: "1", index: 1, label: "Heartsteel" },
  { id: "2", index: 2, label: "Thornmail" },
  { id: "3", index: 3, label: "Randuin's Omen" },
];

const OPEN: InteractionPermissions = {
  ...NO_INTERACTIONS, canSelectAnswer: true, canChangeAnswer: true,
};

const grid = (extra: Partial<React.ComponentProps<typeof AnswerGrid>> = {}) => (
  <AnswerGrid
    options={OPTIONS}
    selectedOptionId={null}
    permissions={OPEN}
    onSelectOption={() => {}}
    {...extra}
  />
);

const tablets = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"));

describe("Ranked default — the seam is dormant", () => {
  it("renders byte-identical DOM with the prop absent, empty, or undefined", () => {
    const { container: absent, unmount: a } = render(grid());
    const absentHtml = absent.innerHTML;
    a();
    const { container: empty, unmount: b } = render(grid({ eliminatedOptionIds: [] }));
    const emptyHtml = empty.innerHTML;
    b();
    const { container: undef } = render(grid({ eliminatedOptionIds: undefined }));
    expect(emptyHtml).toBe(absentHtml);
    expect(undef.innerHTML).toBe(absentHtml);
  });

  it("introduces no elimination attribute, class or note when unused", () => {
    const { container } = render(grid());
    expect(container.innerHTML).not.toContain("line-through");
    expect(container.innerHTML).not.toContain("aria-disabled");
    expect(container.innerHTML).not.toContain("Eliminated");
    for (const t of tablets()) expect(t).toHaveAttribute("data-choice-state", "idle");
  });

  it("keeps one-click submission and the canonical option-view payload", () => {
    const onSelect = vi.fn();
    render(grid({ onSelectOption: onSelect }));
    fireEvent.click(screen.getByRole("button", { name: /heartsteel/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({ id: "1", index: 1, label: "Heartsteel" });
  });

  it("keeps the set-level states: open, locked, revealed", () => {
    const { rerender } = render(grid());
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "open");
    rerender(grid({ permissions: NO_INTERACTIONS }));
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "locked");
    rerender(grid({ revealedCorrectOptionId: "0" }));
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "revealed");
  });

  it("keeps the landscape and wide-2 column strategies untouched", () => {
    const { rerender, container } = render(grid());
    const options = () => container.querySelector("[data-quiz-answer-options]")!;
    expect(options().className)
      .toContain("[@media(max-height:480px)_and_(orientation:landscape)]:grid-cols-2");
    expect(options()).toHaveAttribute("data-columns", "auto");
    rerender(grid({ wideTwoColumn: true }));
    expect(options()).toHaveAttribute("data-columns", "wide-2");
    expect(options().className).toContain("lg:grid-cols-2");
  });
});

describe("elimination — one choice out, the rest untouched", () => {
  it("marks the struck choice and nothing else", () => {
    render(grid({ eliminatedOptionIds: ["2"] }));
    const [a, b, struck, d] = tablets();
    expect(struck).toHaveAttribute("data-choice-state", "eliminated");
    expect(struck.className).toContain("line-through");
    for (const sibling of [a, b, d]) {
      expect(sibling).toHaveAttribute("data-choice-state", "idle");
      expect(sibling.className).not.toContain("line-through");
    }
  });

  it("removes it from pointer and keyboard reach, and says why", () => {
    const onSelect = vi.fn();
    render(grid({ eliminatedOptionIds: ["2"], onSelectOption: onSelect }));
    const struck = screen.getByRole("button", { name: /thornmail/i });
    expect(struck).toBeDisabled();                  // ⇒ not focusable, not tabbable
    expect(struck).toHaveAttribute("aria-disabled", "true");
    expect(struck).toHaveTextContent("Eliminated"); // sr-only reason
    fireEvent.click(struck);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("refuses a struck option even if a click reaches the handler", () => {
    // Defence in depth: `disabled` already blocks the click, so this drives
    // the grid's own guard directly rather than through the DOM.
    const onSelect = vi.fn();
    render(
      <AnswerGrid
        options={OPTIONS} selectedOptionId={null} permissions={OPEN}
        eliminatedOptionIds={["2"]} onSelectOption={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /thornmail/i }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /randuin/i }));
    expect(onSelect).toHaveBeenCalledWith({ id: "3", index: 3, label: "Randuin's Omen" });
  });

  it("keeps positions and letters — a struck choice is not removed", () => {
    render(grid({ eliminatedOptionIds: ["0", "2"] }));
    const letters = Array.from(document.querySelectorAll("[data-choice-letter]"))
      .map((n) => n.textContent);
    expect(letters).toEqual(["A.", "B.", "C.", "D."]);
    expect(tablets().map((t) => t.getAttribute("data-choice-state")))
      .toEqual(["eliminated", "idle", "eliminated", "idle"]);
  });

  it("carries no correctness — the reveal is still the only source", () => {
    const { container } = render(grid({ eliminatedOptionIds: ["0", "1", "2"] }));
    // Three of four struck and the fourth is therefore the answer by
    // elimination — but nothing in the DOM SAYS so. No "correct" state exists
    // until a resolved card supplies `revealedCorrectOptionId`.
    expect(container.innerHTML).not.toContain('data-choice-state="correct"');
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "open");
  });

  it("a resolved card outranks elimination — the reveal vocabulary wins", () => {
    render(grid({ eliminatedOptionIds: ["2"], revealedCorrectOptionId: "0" }));
    expect(screen.getByRole("button", { name: /sunfire/i }))
      .toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByRole("button", { name: /thornmail/i }))
      .toHaveAttribute("data-choice-state", "idle");
  });
});

describe("the seam reaches the whole canonical surface", () => {
  /**
   * RG3 moved the CHANNEL. When this test was written the surface took an
   * `eliminatedOptionIds` prop of its own; production now carries the struck
   * set inside `ResolvedFeedback`, alongside the verdict and the disclosure
   * gate that decide the rest of the same card's state. One channel, so a
   * surface can never be told the card is open by one prop and closed by
   * another. The seam being asserted — elimination reaches the canonical grid
   * and touches nothing else — is unchanged.
   */
  it("InteractiveScenarioSurface forwards elimination to the grid", () => {
    render(
      <InteractiveScenarioSurface
        question={{
          questionId: "q1", category: "items",
          prompt: "Which item grants Immolate?", options: OPTIONS,
        }}
        selectedOptionId={null}
        permissions={OPEN}
        onSelectOption={() => {}}
        variant="competitive"
        feedback={{
          verdict: "incorrect", resolved: false, disclosureAllowed: false,
          retryAvailable: true, scoreLocked: true,
          selectedOptionId: "1", correctOptionId: null,
          eliminatedOptionIds: ["1"], evidence: null, explanationOptional: null,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: /heartsteel/i }))
      .toHaveAttribute("data-choice-state", "eliminated");
    expect(screen.getByRole("button", { name: /sunfire/i }))
      .toHaveAttribute("data-choice-state", "idle");
    // The band and the prompt are untouched by the seam.
    expect(screen.getByTestId("scenario-surface")).toBeInTheDocument();
    expect(screen.getByText(/which item grants immolate/i)).toBeInTheDocument();
  });
});

describe("there is exactly one answer-rendering path", () => {
  const ROOT = resolve(process.cwd(), "src");

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
    return out;
  }

  /** Every non-test source file whose text matches. */
  const filesMatching = (re: RegExp) =>
    sourceFiles(ROOT)
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1))
      .sort();

  const WHY = [
    "A second component started rendering answer choices.",
    "The canonical path is InteractiveScenarioSurface → AnswerGrid →",
    "QuizAnswerOptions; per-option elimination is a prop on it",
    "(`eliminatedOptionIds`), not a reason to fork it.",
  ].join(" ");

  it("only the canonical grid emits answer tablets", () => {
    // The JSX form only. `[data-quiz-choice]` in a stylesheet is a CONSUMER of
    // the canonical grid (the /dev/quiz-render harness restyles it), which is
    // exactly the reuse this rule wants.
    expect(filesMatching(/data-quiz-choice=\{/), WHY)
      .toEqual(["components/quiz/QuizAnswerOptions.tsx"]);
  });

  it("no second INTERACTIVE component is named as an answer grid", () => {
    // Catches the fork that does not reuse the canonical data attributes —
    // e.g. a mode-prefixed `DailyAnswerGrid` with its own `data-*-choice`.
    //
    // `quiz-broadcast/BroadcastRenderer` is on the list on purpose and is not
    // a fork: it draws answers into a Remotion VIDEO frame, where there is no
    // player, no click, no focus and no permissions — a different medium, not
    // a second way to play. It predates this rule and stays.
    expect(
      filesMatching(/(?:function|const)\s+\w*Answer(?:Grid|Options)\b/),
      WHY,
    ).toEqual([
      "components/quiz-broadcast/BroadcastRenderer.tsx",  // video, not play
      "components/quiz/QuizAnswerOptions.tsx",
      "components/ranked-arena/AnswerGrid.tsx",
    ]);
  });
});
