/**
 * QMEDIA2 — a picture choice whose image fails to load keeps the option.
 *
 * The picture-choice tile (`QuizChoiceObject.image_path`) had no error handler,
 * so a dead asset left the browser's broken-image glyph inside the tablet. It
 * now becomes a same-size "?" tile; the label, letter and button are unchanged
 * and the option is still selectable.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuizAnswerOptions from "./QuizAnswerOptions";

const CHOICES = [
  { label: "Kindlegem", image_path: "assets/items_wiki/3067.png" },
  { label: "Ruby Crystal", image_path: "assets/items_wiki/1028.png" },
  { label: "Cloth Armor", image_path: "assets/items_wiki/1029.png" },
  { label: "Null-Magic Mantle", image_path: "assets/__viscont_missing__/1033.png" },
];

afterEach(cleanup);

describe("picture choices with a missing asset", () => {
  it("swaps only the failed image for a ? tile and keeps every label", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer={null}
        answerResult={null} onSelect={onSelect} />,
    );
    const broken = screen.getByAltText("Null-Magic Mantle");
    fireEvent.error(broken);

    expect(screen.queryByAltText("Null-Magic Mantle")).toBeNull();
    expect(container.querySelectorAll('[data-choice-image-state="error"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-choice-image-state="ok"]')).toHaveLength(3);
    for (const c of CHOICES) expect(screen.getByText(c.label)).toBeTruthy();

    fireEvent.click(screen.getByText("Null-Magic Mantle"));
    expect(onSelect).toHaveBeenCalledWith("Null-Magic Mantle", 3);
  });

  it("the fallback tile is the image's own size, so the grid never reflows", () => {
    const { container } = render(
      <QuizAnswerOptions choices={CHOICES} selectedAnswer={null}
        answerResult={null} onSelect={() => {}} />,
    );
    const img = screen.getByAltText("Kindlegem");
    const sizeOf = (el: Element) => el.className.split(/\s+/)
      .filter((c) => /^(md:)?[hw]-\d+$/.test(c)).sort().join(" ");
    const imgSize = sizeOf(img);
    fireEvent.error(img);
    const tile = container.querySelector('[data-choice-image-state="error"]')!;
    expect(sizeOf(tile)).toBe(imgSize);
    expect(tile.getAttribute("aria-hidden")).toBe("true");
  });
});
