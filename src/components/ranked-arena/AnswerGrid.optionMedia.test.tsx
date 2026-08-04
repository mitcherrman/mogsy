/**
 * Answer-option media rendering, geometry and accessibility (RA6).
 *
 * The governing rules, all asserted here:
 *
 *  - the icon is ADDED to the tablet, never substituted for the option text;
 *  - every option of a question with media gets the SAME fixed slot, resolved
 *    or not, loaded or broken — so no user action, image load, or reveal can
 *    move the text, the letter, or the grid;
 *  - the icon is DECORATIVE: the adjacent label already names the same entity,
 *    so the tablet's accessible name is exactly what it was without media;
 *  - a question with no option media renders the text-only grid unchanged.
 *
 * jsdom does no layout, so geometry is asserted the way the existing
 * `QuizRankedMatch.geometry` contracts are: fixed reserved slots, stable class
 * lists, and no mount/unmount of anything in the flow.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnswerGrid } from "./AnswerGrid";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import {
  ABILITY_OPTION_QUESTION,
  BackendQuestionPayload,
  CHAMPION_OPTION_QUESTION,
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
  RUNE_OPTION_QUESTION,
  SUMMONER_SPELL_OPTION_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import {
  AnswerOptionView,
  InteractionPermissions,
  NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  ...NO_INTERACTIONS,
  canSelectAnswer: true,
  canChangeAnswer: true,
};

function optionsOf(payload: BackendQuestionPayload): AnswerOptionView[] {
  return questionViewFromPublicQuestion({
    questionId: payload.question_id,
    prompt: payload.prompt,
    options: payload.options,
    category: payload.category,
    optionMedia: payload.option_media ?? null,
  }).options;
}

function grid(payload: BackendQuestionPayload, over: Partial<{
  selectedOptionId: string | null;
  revealedCorrectOptionId: string | null;
  permissions: InteractionPermissions;
  onSelectOption: (o: AnswerOptionView) => void;
}> = {}) {
  return render(
    <AnswerGrid
      options={optionsOf(payload)}
      selectedOptionId={over.selectedOptionId ?? null}
      permissions={over.permissions ?? OPEN}
      onSelectOption={over.onSelectOption ?? (() => {})}
      revealedCorrectOptionId={over.revealedCorrectOptionId ?? null}
    />,
  );
}

const slots = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-option-media]"));

// ---------------------------------------------------------------- rendering

describe("option media rendering", () => {
  it.each([
    ["item", ITEM_OPTION_QUESTION, "item"],
    ["champion", CHAMPION_OPTION_QUESTION, "champion"],
    ["ability", ABILITY_OPTION_QUESTION, "ability"],
    ["rune", RUNE_OPTION_QUESTION, "rune"],
    ["summoner spell", SUMMONER_SPELL_OPTION_QUESTION, "summoner_spell"],
  ])("renders one %s icon per option, beside its text", (_n, payload, type) => {
    const { container } = grid(payload as BackendQuestionPayload);
    const mounted = slots(container);
    expect(mounted).toHaveLength((payload as BackendQuestionPayload).options.length);
    for (const slot of mounted) {
      expect(slot).toHaveAttribute("data-option-media-type", type);
      expect(slot.querySelector("img")).not.toBeNull();
    }
    // The text is still there, in full, on every tablet.
    for (const label of (payload as BackendQuestionPayload).options) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") }))
        .toHaveTextContent(label);
    }
  });

  it("icon urls are resolved against the API origin, not left relative", () => {
    const { container } = grid(ITEM_OPTION_QUESTION);
    const sources = slots(container)
      .map((s) => s.querySelector("img")!.getAttribute("src")!);
    // The backend emits origin-less paths; the shared resolver prefixes the API
    // base (whatever VITE_COMBAT_API_URL is in this environment), so the icons
    // load from the backend rather than from the frontend host.
    sources.forEach((src, index) => {
      expect(src).toMatch(/^https?:\/\//);
      expect(src.endsWith(`/${ITEM_OPTION_QUESTION.option_media![index].icon}`))
        .toBe(true);
    });
    expect(new Set(sources.map((s) => new URL(s).origin)).size).toBe(1);
  });

  it("ability icons render the slot-neutral route, never a slot-prefixed file", () => {
    const { container } = grid(ABILITY_OPTION_QUESTION);
    for (const slot of slots(container)) {
      const src = slot.querySelector("img")!.getAttribute("src")!;
      expect(src).toContain("/api/ranked/media/ability-icon/Darius/");
      expect(src).not.toMatch(/\/[QWER]_/);
    }
    expect(container.innerHTML).not.toContain("assets/champions");
  });

  it("a numeric question mounts NO slots and renders exactly as before", () => {
    const { container } = grid(NUMERIC_QUESTION);
    expect(slots(container)).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    for (const label of NUMERIC_QUESTION.options) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("an option set the backend refused stays entirely text-only", () => {
    // Whole-set fail-closed arrives as no option_media at all.
    const { option_media: _dropped, ...refused } = ITEM_OPTION_QUESTION;
    const { container } = grid(refused as BackendQuestionPayload);
    expect(slots(container)).toHaveLength(0);
  });
});

// ----------------------------------------------------------------- geometry

describe("option media geometry", () => {
  it("every slot is the same fixed box, and it is never the image's size", () => {
    const { container } = grid(CHAMPION_OPTION_QUESTION);
    const classes = slots(container).map((s) => s.className);
    expect(new Set(classes).size).toBe(1);
    // A reserved square with shrink-0: the content cannot resize it.
    expect(classes[0]).toContain("h-7");
    expect(classes[0]).toContain("w-7");
    expect(classes[0]).toContain("shrink-0");
    expect(classes[0]).toContain("overflow-hidden");
  });

  it("a partial set still mounts a slot on EVERY option", () => {
    // The backend never emits this today (whole-set fail-closed), which is
    // exactly why the renderer must not depend on that promise.
    const options = optionsOf(CHAMPION_OPTION_QUESTION).map((o, i) =>
      i === 1 ? { ...o, media: null } : o);
    const { container } = render(
      <AnswerGrid options={options} selectedOptionId={null} permissions={OPEN}
        onSelectOption={() => {}} />,
    );
    expect(slots(container)).toHaveLength(4);
    expect(slots(container)[1]).toHaveAttribute("data-option-media-state", "empty");
    expect(slots(container)[1].querySelector("img")).toBeNull();
    // Same box as its neighbours — an unresolved option is not a smaller one.
    expect(slots(container)[1].className).toBe(slots(container)[0].className);
  });

  it("a broken image degrades inside the slot, with no native broken image", () => {
    const { container } = grid(ITEM_OPTION_QUESTION);
    const before = slots(container).map((s) => s.className);
    const image = slots(container)[2].querySelector("img")!;
    fireEvent.error(image);

    const after = slots(container);
    expect(after).toHaveLength(4);
    expect(after.map((s) => s.className)).toEqual(before);
    expect(after[2]).toHaveAttribute("data-option-media-state", "error");
    // The <img> is REMOVED rather than left to draw the browser's broken-image
    // glyph; the reserved box stays.
    expect(after[2].querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Cloth Armor/i }))
      .toHaveTextContent("Cloth Armor");
  });

  it("selection does not move or remount the icon or the text", () => {
    const { container, rerender } = grid(CHAMPION_OPTION_QUESTION);
    const before = container.querySelector('[data-quiz-answer-options]')!.innerHTML
      .replace(/data-choice-state="[a-z-]+"/g, "")
      .replace(/class="[^"]*"/g, "");
    rerender(
      <AnswerGrid options={optionsOf(CHAMPION_OPTION_QUESTION)} selectedOptionId="2"
        permissions={OPEN} onSelectOption={() => {}} />,
    );
    const after = container.querySelector('[data-quiz-answer-options]')!.innerHTML
      .replace(/data-choice-state="[a-z-]+"/g, "")
      .replace(/class="[^"]*"/g, "");
    // Only styling attributes differ; structure, icons and text are identical.
    expect(after).toBe(before);
    expect(slots(container)).toHaveLength(4);
  });

  it("reveal does not move or remount the icon or the text", () => {
    const { container, rerender } = grid(CHAMPION_OPTION_QUESTION,
      { selectedOptionId: "0" });
    const iconsBefore = slots(container)
      .map((s) => s.querySelector("img")!.getAttribute("src"));
    rerender(
      <AnswerGrid options={optionsOf(CHAMPION_OPTION_QUESTION)} selectedOptionId="0"
        permissions={OPEN} onSelectOption={() => {}} revealedCorrectOptionId="2" />,
    );
    expect(slots(container)).toHaveLength(4);
    expect(slots(container).map((s) => s.querySelector("img")!.getAttribute("src")))
      .toEqual(iconsBefore);
    // Correct/incorrect treatment lands on the BUTTON, leaving the slot alone.
    expect(screen.getByRole("button", { name: /Darius/i }))
      .toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByRole("button", { name: /Garen/i }))
      .toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(new Set(slots(container).map((s) => s.className)).size).toBe(1);
  });

  it("locking without reveal leaves the slots untouched", () => {
    const { container, rerender } = grid(ITEM_OPTION_QUESTION);
    const before = slots(container).map((s) => s.outerHTML);
    rerender(
      <AnswerGrid options={optionsOf(ITEM_OPTION_QUESTION)} selectedOptionId="1"
        permissions={NO_INTERACTIONS} onSelectOption={() => {}} />,
    );
    expect(slots(container).map((s) => s.outerHTML)).toEqual(before);
    expect(screen.getByTestId("answer-grid"))
      .toHaveAttribute("data-answers-state", "locked");
  });
});

// ------------------------------------------------------------ accessibility

describe("option media accessibility", () => {
  it("the tablet's accessible name is the option text, announced once", () => {
    grid(CHAMPION_OPTION_QUESTION);
    // One button per option, named by its letter + label — the same name the
    // text-only grid produces. No second announcement of the entity.
    expect(screen.getAllByRole("button", { name: /Darius/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Darius/i }))
      .toHaveAccessibleName("C. Darius");
  });

  it("icons are decorative: aria-hidden, empty alt, out of the a11y tree", () => {
    const { container } = grid(ITEM_OPTION_QUESTION);
    for (const slot of slots(container)) {
      expect(slot).toHaveAttribute("aria-hidden", "true");
      expect(slot.querySelector("img")).toHaveAttribute("alt", "");
    }
    // No image is exposed as an accessible image.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("the entity name is not duplicated in the tablet's text content", () => {
    grid(ITEM_OPTION_QUESTION);
    const button = screen.getByRole("button", { name: /Kindlegem/i });
    expect(button.textContent!.match(/Kindlegem/g)).toHaveLength(1);
  });
});

// ------------------------------------------------------------- interaction

describe("option media leaves interaction alone", () => {
  it("one click still reports the full option view", () => {
    const onSelect = vi.fn();
    grid(CHAMPION_OPTION_QUESTION, { onSelectOption: onSelect });
    fireEvent.click(screen.getByRole("button", { name: /Sett/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: "1", index: 1, label: "Sett" });
  });

  it("clicking the ICON selects the option (the slot is not a hit-test hole)", () => {
    const onSelect = vi.fn();
    const { container } = grid(ITEM_OPTION_QUESTION, { onSelectOption: onSelect });
    fireEvent.click(slots(container)[3]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 3 });
  });

  it("keyboard selection and focus order are unchanged", () => {
    const onSelect = vi.fn();
    grid(RUNE_OPTION_QUESTION, { onSelectOption: onSelect });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent!.trim().slice(0, 2)))
      .toEqual(["A.", "B.", "C.", "D."]);
    buttons[1].focus();
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1], { key: "Enter" });
    fireEvent.click(buttons[1]);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 1 });
    // No slot is focusable — the button remains the single tab stop.
    expect(document.querySelectorAll("[data-option-media][tabindex]")).toHaveLength(0);
  });

  it("a revealed grid is inert with media, exactly as without", () => {
    const onSelect = vi.fn();
    const { container } = grid(ITEM_OPTION_QUESTION, {
      revealedCorrectOptionId: "0", onSelectOption: onSelect,
    });
    fireEvent.click(screen.getByRole("button", { name: /Ruby Crystal/i }));
    fireEvent.click(slots(container)[1]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("the tap target is the whole tablet, not the icon", () => {
    const { container } = grid(ITEM_OPTION_QUESTION);
    const button = screen.getByRole("button", { name: /Kindlegem/i });
    expect(button.className).toContain("w-full");
    expect(within(button).getByText("Kindlegem")).toBeTruthy();
    expect(slots(container)[0].closest("button")).toBe(button);
  });
});
