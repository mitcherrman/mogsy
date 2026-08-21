/**
 * MALT — the quiz category icon strip.
 *
 * The rules under test are the ones that keep it an OVERVIEW: the six approved
 * subjects, real art for each, a short visible word with the full name carried
 * for assistive tech, no counts, and nothing clickable.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuizCategoryStrip, { QUIZ_CATEGORY_ICONS } from "./QuizCategoryStrip";

afterEach(cleanup);

const APPROVED = [
  "objectives",
  "wave-management",
  "summoner-spells",
  "itemization",
  "abilities",
  "vision",
];

describe("QuizCategoryStrip", () => {
  it("renders the six approved categories, in the approved order", () => {
    render(<QuizCategoryStrip />);
    const ids = screen
      .getAllByTestId("quiz-category-tile")
      .map((el) => el.getAttribute("data-category"));
    expect(ids).toEqual(APPROVED);
  });

  it("gives every category its own real League icon — no shared placeholder", () => {
    const { container } = render(<QuizCategoryStrip />);
    const sources = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src"),
    );
    expect(sources.length).toBe(6);
    sources.forEach((src) => expect(src).toContain("assets/"));
    // Six distinct icons: an icon strip whose icons repeat is not an icon strip.
    expect(new Set(sources).size).toBe(6);
  });

  it("names every category in text, so a subject is never icon-only", () => {
    render(<QuizCategoryStrip />);
    const tiles = screen.getAllByTestId("quiz-category-tile");
    for (const category of QUIZ_CATEGORY_ICONS) {
      const tile = tiles.find((el) => el.getAttribute("data-category") === category.id)!;
      // The short word is printed; the FULL category name is carried alongside
      // it, so shortening the label never costs a reader the subject.
      expect(within(tile).getAllByText(category.label).length, category.id).toBeGreaterThan(0);
      expect(tile.textContent, category.id).toContain(category.full);
    }
  });

  it("keeps the art decorative — the label carries the meaning", () => {
    const { container } = render(<QuizCategoryStrip />);
    container.querySelectorAll("img").forEach((img) => {
      expect(img.getAttribute("alt")).toBe("");
    });
  });

  it("is an overview, not a menu: nothing in the strip is clickable", () => {
    const { container } = render(<QuizCategoryStrip />);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.querySelectorAll("[role='button']").length).toBe(0);
  });

  it("states no question counts or coverage figures", () => {
    const { container } = render(<QuizCategoryStrip />);
    // Any digit in the strip would be a number nothing on the wire supports.
    expect(container.textContent).not.toMatch(/\d/);
  });
});
