/**
 * MALT — the full-width category rail.
 *
 * The rules under test are the ones that make it a RAIL and keep it an
 * OVERVIEW: the same six approved subjects in the same order and off the same
 * single definition, real art for each, every subject named in text, no
 * counts — and, the part that is the whole point of the component, that it is
 * inert by default and becomes a real set of buttons the moment a handler
 * arrives, without a second layout.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuizCategoryRail from "./QuizCategoryRail";
import { QUIZ_CATEGORY_ICONS } from "./QuizCategoryStrip";

afterEach(cleanup);

const APPROVED = [
  "objectives",
  "wave-management",
  "summoner-spells",
  "itemization",
  "abilities",
  "vision",
];

describe("QuizCategoryRail", () => {
  it("renders the six approved categories, in the approved order", () => {
    render(<QuizCategoryRail />);
    const ids = screen
      .getAllByTestId("quiz-category-rail-tile")
      .map((el) => el.getAttribute("data-category"));
    expect(ids).toEqual(APPROVED);
  });

  it("reads its categories from the single shared definition", () => {
    // One list, two surfaces. If the rail ever grows its own copy, the two can
    // disagree about what Leaguecraft studies — which is the drift this asserts
    // against, not the literal contents of the array.
    render(<QuizCategoryRail />);
    const ids = screen
      .getAllByTestId("quiz-category-rail-tile")
      .map((el) => el.getAttribute("data-category"));
    expect(ids).toEqual(QUIZ_CATEGORY_ICONS.map((c) => c.id));
  });

  it("gives every category its own real League icon — no shared placeholder", () => {
    const { container } = render(<QuizCategoryRail />);
    const sources = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src"),
    );
    expect(sources.length).toBe(6);
    sources.forEach((src) => expect(src).toContain("assets/"));
    expect(new Set(sources).size).toBe(6);
  });

  it("names every category in text, so a subject is never icon-only", () => {
    render(<QuizCategoryRail />);
    const tiles = screen.getAllByTestId("quiz-category-rail-tile");
    for (const category of QUIZ_CATEGORY_ICONS) {
      const tile = tiles.find((el) => el.getAttribute("data-category") === category.id)!;
      expect(within(tile).getAllByText(category.label).length, category.id).toBeGreaterThan(0);
      expect(tile.textContent, category.id).toContain(category.full);
    }
  });

  it("keeps the art decorative — the label carries the meaning", () => {
    const { container } = render(<QuizCategoryRail />);
    container.querySelectorAll("img").forEach((img) => {
      expect(img.getAttribute("alt")).toBe("");
    });
  });

  it("is inert by default: no doors until the question bank can open one", () => {
    const { container } = render(<QuizCategoryRail />);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.querySelectorAll("[role='button']").length).toBe(0);
  });

  it("states no question counts or coverage figures", () => {
    const { container } = render(<QuizCategoryRail />);
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("becomes six real buttons the moment a handler is supplied", () => {
    const onSelectCategory = vi.fn();
    const { container } = render(<QuizCategoryRail onSelectCategory={onSelectCategory} />);
    expect(container.querySelectorAll("button").length).toBe(6);
    // Still six tiles, still the same order — turning the rail into a menu
    // must not become a different rail.
    expect(
      screen.getAllByTestId("quiz-category-rail-tile").map((el) => el.getAttribute("data-category")),
    ).toEqual(APPROVED);
  });

  it("hands the handler the category ID, not its label", () => {
    const onSelectCategory = vi.fn();
    render(<QuizCategoryRail onSelectCategory={onSelectCategory} />);
    const tile = screen
      .getAllByTestId("quiz-category-rail-tile")
      .find((el) => el.getAttribute("data-category") === "wave-management")!;
    fireEvent.click(within(tile).getByRole("button"));
    expect(onSelectCategory).toHaveBeenCalledWith("wave-management");
  });
});
