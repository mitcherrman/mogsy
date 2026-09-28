/**
 * Comparison question renderer tests (Phase 4C2; DD1 Data Duel adoption).
 *
 * Covers: the prompt built from structured `comparison_semantics` (never
 * `question.prompt`), the Data Duel presentation (two champion tablets + the
 * "Same value" tie), submission of the SAME scalar answer token, the reveal
 * boundary (no value or canonical side before the reveal), the structured
 * `comparison_values` reveal (integer / decimal / percentage / close / tie),
 * the legacy reveal without the block (no prose parsing), and the fail-closed
 * contract guards. No client-side comparison of values anywhere in this file.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { readComparisonValues, type ComparisonValues } from "../contracts/comparisonValues";
import { MasteryAssetsContext } from "../player/MasteryAssets";
import { comparisonQuestionEnvelopes } from "./comparisonFixtures";
import { ComparisonQuestionView, MasteryComparisonContractError } from "./ComparisonQuestionView";
import type { MasteryQuestionReveal } from "./revealState";

afterEach(() => cleanup());

const questions = comparisonQuestionEnvelopes().map(parseMasteryPlayerQuestion);

function values(
  a: [number, string], b: [number, string], extra: Record<string, unknown> = {},
): ComparisonValues {
  const cv = readComparisonValues({
    contract: "comparison_values.v1",
    sides: [
      { token: "ahri", value: a[0], display: a[1] },
      { token: "syndra", value: b[0], display: b[1] },
    ],
    unit: "seconds",
    unit_label: "seconds",
    display_precision: 0,
    operator: "lesser",
    delta: Math.abs(a[0] - b[0]),
    delta_display: String(Math.abs(a[0] - b[0])),
    ...extra,
  });
  if (!cv) throw new Error("fixture is off-contract");
  return cv;
}

function reveal(over: Partial<MasteryQuestionReveal> = {}): MasteryQuestionReveal {
  return {
    correct: true,
    correctValue: "ahri",
    selectedValue: "ahri",
    answerLabel: "Ahri",
    explanation: "Ahri E (rank 3): 8.4s. Syndra E (rank 3): 15.0s. Ahri wins by 6.6s.",
    ...over,
  };
}

function view(q = questions[0], props: Partial<Parameters<typeof ComparisonQuestionView>[0]> = {}) {
  return render(
    <ComparisonQuestionView question={q} total={3} submitting={false} onSubmit={vi.fn()} {...props} />,
  );
}

describe("ComparisonQuestionView — prompt rendering from structured semantics", () => {
  it("renders a decisive Ahri-vs-Syndra ability-cooldown comparison prompt built from comparison_semantics, not question.prompt", () => {
    const q = questions[0];
    view(q);
    const heading = screen.getByTestId("duel-prompt");
    expect(heading.textContent).toContain("Ahri E");
    expect(heading.textContent).toContain("Syndra E");
    expect(heading.textContent).toContain("shorter cooldown");
    // Proves the renderer never echoes the raw backend `prompt` string.
    expect(heading.textContent).not.toBe(q.prompt);
  });

  it("renders a champion-stat comparison with metric context", () => {
    view(questions[1]);
    const heading = screen.getByTestId("duel-prompt");
    expect(heading.textContent).toContain("Armor");
    expect(heading.textContent).toContain("Ahri");
    expect(heading.textContent).toContain("Syndra");
  });

  it("names the metric and the shared rank on the duel's chips, and the ability on each tablet", () => {
    view(questions[0]);
    expect(screen.getByText("Cooldown")).toBeTruthy();
    expect(screen.getByText("Rank 3")).toBeTruthy();
    expect(within(screen.getByTestId("duel-side-left")).getByText("E")).toBeTruthy();
  });

  it("moves focus to the prompt on a new question", () => {
    view(questions[0]);
    expect(document.activeElement).toBe(screen.getByTestId("duel-prompt"));
  });
});

describe("ComparisonQuestionView — Data Duel presentation, no combat state", () => {
  it("renders through the Data Duel with both champions as its sides", () => {
    view(questions[0]);
    expect(screen.getByTestId("mastery-comparison-question"))
      .toHaveAttribute("data-presentation", "data-duel");
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "open");
    expect(screen.getByTestId("duel-side-left")).toHaveTextContent("Ahri");
    expect(screen.getByTestId("duel-side-right")).toHaveTextContent("Syndra");
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
    // The duel's tablets carry identity; the old portrait header is gone.
    expect(screen.queryByTestId("mastery-comparison-header")).toBeNull();
  });

  it("does not crash when question.state and question.matchupIdentity are null", () => {
    const q = questions[0];
    expect(q.state).toBeNull();
    expect(q.matchupIdentity).toBeNull();
    expect(() => view(q)).not.toThrow();
  });

  it("draws champion art from the Mastery assets context, and a monogram with none", () => {
    const { unmount } = render(
      <MasteryAssetsContext.Provider value={{
        championIconUrl: (id) => `/icons/${id}.png`,
        itemIconUrl: () => null,
        championSplashUrl: (id) => (id === "ahri" ? `/splash/${id}.jpg` : null),
      }}>
        <ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={vi.fn()} />
      </MasteryAssetsContext.Provider>,
    );
    expect(screen.getByTestId("duel-side-left").querySelector("img")?.getAttribute("src"))
      .toBe("/splash/ahri.jpg");
    expect(screen.getByTestId("duel-side-right").querySelector("img")?.getAttribute("src"))
      .toBe("/icons/syndra.png");
    unmount();
    // No provider → the default resolver has no art → monograms, same box.
    view(questions[0]);
    expect(screen.getByTestId("duel-side-left").querySelector("img")).toBeNull();
    expect(screen.getByTestId("duel-side-left")).toHaveTextContent("A");
  });
});

describe("ComparisonQuestionView — always-three-way choice with champion-name labels", () => {
  it("offers exactly three choices — champion A, champion B, and Same value — labeled by display name, not raw option values", () => {
    view(questions[0]);
    const group = screen.getByRole("radiogroup");
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /^Ahri/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Syndra/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Same value/ })).toBeTruthy();
    // Raw wire values (champion ids / "tie") never appear as visible text.
    expect(screen.queryByText("ahri")).toBeNull();
    expect(screen.queryByText("tie")).toBeNull();
  });

  it("offers the tie unconditionally, on a fixture that ends up decisive too — never suppressed", () => {
    view(questions[0]);
    expect(screen.getByTestId("duel-side-tie")).toHaveTextContent("Same value");
  });
});

describe("ComparisonQuestionView — submission (same scalar token, no client grading)", () => {
  it("submits the left side's raw option value verbatim", () => {
    const onSubmit = vi.fn();
    view(questions[0], { onSubmit });
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(onSubmit).toHaveBeenCalledWith("ahri");
  });

  it("submits the right side's raw option value verbatim", () => {
    const onSubmit = vi.fn();
    view(questions[0], { onSubmit });
    fireEvent.click(screen.getByTestId("duel-side-right"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(onSubmit).toHaveBeenCalledWith("syndra");
  });

  it("submits the tie token when Same value is selected", () => {
    const onSubmit = vi.fn();
    view(questions[2], { onSubmit });
    fireEvent.click(screen.getByTestId("duel-side-tie"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(onSubmit).toHaveBeenCalledWith("tie");
  });

  it("disables the lock until a choice is made", () => {
    view(questions[0]);
    expect(screen.getByTestId("duel-lock")).toBeDisabled();
  });

  it("is keyboard operable: arrows move through left → right → tie, Enter locks", () => {
    const onSubmit = vi.fn();
    view(questions[0], { onSubmit });
    const left = screen.getByTestId("duel-side-left");
    expect(left).toHaveAttribute("tabindex", "0");
    left.focus();
    fireEvent.keyDown(left, { key: "ArrowRight" });
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(screen.getByTestId("duel-side-right"), { key: "ArrowDown" });
    const tie = screen.getByTestId("duel-side-tie");
    expect(tie).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(tie);
    fireEvent.keyDown(tie, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("tie");
  });

  it("locks while submitting: no second submit, inputs inert", () => {
    const onSubmit = vi.fn();
    view(questions[0], { onSubmit, submitting: true });
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "locked");
    expect(screen.queryByTestId("duel-lock")).toBeNull();
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.keyDown(screen.getByTestId("duel-side-left"), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ComparisonQuestionView — pre-reveal safety", () => {
  it("renders no value, no canonical side and no answer before the reveal", () => {
    const { container } = view(questions[0]);
    const html = container.innerHTML;
    for (const leak of ["8.4", "15.0", "6.6", "wins by", "Answer"]) {
      expect(html).not.toContain(leak);
    }
    expect(container.querySelector("[data-canonical]")).toBeNull();
    expect(container.querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
  });
});

describe("ComparisonQuestionView — structured reveal (comparison_values.v1)", () => {
  it("correct pick: both values, the Answer and pick tags, the margin in words", () => {
    view(questions[0], {
      reveal: reveal({ comparisonValues: values([8, "8"], [15, "15"], { delta_display: "7" }) }),
    });
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent("8 seconds");
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent("15 seconds");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-tag-answer-left")).toBeTruthy();
    expect(screen.getByTestId("duel-tag-pick-left")).toHaveTextContent(/locked/i);
    expect(screen.getByTestId("duel-margin")).toHaveAttribute("data-margin-toward", "left");
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Ahri by 7 seconds");
    expect(screen.getByTestId("mastery-inline-reveal")).toHaveAttribute("data-correct", "true");
  });

  it("incorrect pick: the pick is marked wrong and the canonical side right", () => {
    view(questions[0], {
      reveal: reveal({
        correct: false, correctValue: "syndra", selectedValue: "ahri",
        comparisonValues: values([15, "15"], [8, "8"]),
      }),
    });
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-tag-answer-right")).toBeTruthy();
    expect(screen.getByTestId("duel-margin")).toHaveAttribute("data-margin-toward", "right");
    expect(screen.getByTestId("mastery-inline-reveal")).toHaveAttribute("data-correct", "false");
  });

  it("tie: Same value is the answer, the margin draws the even mark", () => {
    view(questions[2], {
      reveal: reveal({
        correctValue: "tie", selectedValue: "tie",
        comparisonValues: values([20, "20"], [20, "20"], { unit: "mana", unit_label: "mana", delta: 0, delta_display: "0" }),
      }),
    });
    expect(screen.getByTestId("duel-side-tie")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-tag-answer-tie")).toBeTruthy();
    expect(screen.getByTestId("duel-margin")).toHaveAttribute("data-margin-toward", "tie");
    expect(screen.getByTestId("duel-margin-even")).toBeTruthy();
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Dead even — 20 mana each");
  });

  it("decimal values print the backend's display verbatim", () => {
    view(questions[1], {
      reveal: reveal({
        correctValue: "syndra",
        comparisonValues: values([20.9, "20.9"], [21.9, "21.9"], {
          unit: "armor", unit_label: "armor", display_precision: 1, operator: "greater", delta_display: "1.0",
        }),
      }),
    });
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent("20.9 armor");
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent("21.9 armor");
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Syndra by 1.0 armor");
  });

  it("percentage values are written with a tight percent sign", () => {
    view(questions[1], {
      reveal: reveal({
        correctValue: "ahri",
        comparisonValues: values([25, "25.0"], [22.5, "22.5"], {
          unit: "percent", unit_label: "%", display_precision: 1, operator: "greater", delta_display: "2.5",
        }),
      }),
    });
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent("25.0%");
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Ahri by 2.5%");
  });

  it("close values still draw a visible margin toward the canonical side", () => {
    view(questions[1], {
      reveal: reveal({
        correctValue: "ahri",
        comparisonValues: values([590, "590"], [583, "583"], {
          unit: "hitpoints", unit_label: "health", operator: "greater", delta_display: "7",
        }),
      }),
    });
    // A 590-vs-583 gap is ~1.2% of the larger value, so the bar takes the
    // visible floor (5% of the half-track), never zero.
    expect(Number(screen.getByTestId("duel-margin-fill").getAttribute("data-reach"))).toBe(2.5);
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent("Ahri by 7 health");
  });

  it("a reload mid-reveal marks the server's recorded pick", () => {
    view(questions[0], {
      reveal: reveal({ correct: false, correctValue: "ahri", selectedValue: "tie",
        comparisonValues: values([8, "8"], [15, "15"]) }),
    });
    expect(screen.getByTestId("duel-side-tie")).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(screen.getByTestId("duel-tag-pick-tie")).toBeTruthy();
  });

  it("drops values whose tokens do not name this duel's sides (fail closed)", () => {
    const foreign = readComparisonValues({
      contract: "comparison_values.v1",
      sides: [{ token: "leona", value: 90, display: "90" }, { token: "pantheon", value: 180, display: "180" }],
    })!;
    view(questions[0], { reveal: reveal({ comparisonValues: foreign }) });
    expect(screen.getByTestId("duel-value-left").textContent).toBe("");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
  });
});

describe("ComparisonQuestionView — legacy reveal (no comparison_values)", () => {
  it("renders tags and the explanation, no value row, no margin, and never parses the prose", () => {
    view(questions[0], { reveal: reveal({ correct: false, correctValue: "ahri", selectedValue: "syndra" }) });
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("data-choice-state", "incorrect-selected");
    // The value slots stay empty — no "8.4", no "—" placeholder.
    expect(screen.getByTestId("duel-value-left").textContent).toBe("");
    expect(screen.getByTestId("duel-value-right").textContent).toBe("");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    // The explanation is displayed once, verbatim, by the host reveal.
    expect(screen.getByTestId("mastery-reveal-explanation").textContent)
      .toBe("Ahri E (rank 3): 8.4s. Syndra E (rank 3): 15.0s. Ahri wins by 6.6s.");
    expect(screen.getAllByText(/8\.4/)).toHaveLength(1);
  });

  it("a null explanation still renders without crashing", () => {
    expect(() => view(questions[0], { reveal: reveal({ explanation: null }) })).not.toThrow();
    expect(screen.queryByTestId("mastery-reveal-explanation")).toBeNull();
  });
});

describe("ComparisonQuestionView — responsive", () => {
  it("keeps long labels whole and every target at least 44px tall", () => {
    const long = parseMasteryPlayerQuestion({
      ...comparisonQuestionEnvelopes()[0],
      data: {
        ...(comparisonQuestionEnvelopes()[0].data as Record<string, unknown>),
        comparison_semantics: {
          template: "compare_ability_cooldown",
          champion_a_display: "Viktor",
          champion_b_display: "Jarvan IV",
          metric: "ability_cooldown",
          subject_ref: "R",
          ability_name_a: "Chaos Storm (Unleashed Glorious Evolution)",
          ability_name_b: "Cataclysm",
          context: { ability_rank: 1, champion_level: null, form: null },
          side_contexts: [
            { ability_rank: 1, champion_level: null, form: null },
            { ability_rank: null, champion_level: null, form: null },
          ],
          unit: "seconds",
        },
      },
    });
    view(long);
    expect(screen.getByTestId("duel-side-left"))
      .toHaveTextContent("R · Chaos Storm (Unleashed Glorious Evolution) · rank 1");
    expect(screen.getByTestId("duel-side-right")).toHaveTextContent("R · Cataclysm · same at every rank");
    for (const id of ["duel-side-left", "duel-side-right", "duel-side-tie", "duel-lock"]) {
      expect(screen.getByTestId(id).className).toMatch(/min-h-\[44px\]/);
    }
  });
});

describe("ComparisonQuestionView — fail-closed guards", () => {
  it("throws when comparison_semantics is missing", () => {
    const broken = { ...questions[0], comparisonSemantics: null };
    expect(() => view(broken as never)).toThrow(MasteryComparisonContractError);
  });

  it("throws for a non-single_choice answer type", () => {
    const broken = { ...questions[0], answerType: "numeric", answerOptions: [] };
    expect(() => view(broken as never)).toThrow(MasteryComparisonContractError);
  });

  it("throws when answer_options is not the canonical [A, B, tie] triple", () => {
    const broken = { ...questions[0], answerOptions: ["ahri", "syndra"] };
    expect(() => view(broken as never)).toThrow(MasteryComparisonContractError);
  });
});
