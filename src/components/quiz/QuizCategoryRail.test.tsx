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
const availability = vi.hoisted(() => ({ unavailable: new Set<string>() }));
vi.mock("@/lib/quiz/practiceCategories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/practiceCategories")>();
  return {
    ...actual,
    isPracticeCategoryAvailable: (id: string) =>
      !availability.unavailable.has(id) && actual.isPracticeCategoryAvailable(id),
  };
});

import QuizCategoryRail from "./QuizCategoryRail";
import { QUIZ_CATEGORY_ICONS } from "./QuizCategoryStrip";

afterEach(() => {
  cleanup();
  availability.unavailable = new Set();
});

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

  // ── PRAC1: the rail is the Practice chooser ──────────────────────────────

  it("opens all six subjects, Vision included (VISION42)", () => {
    const onSelectCategory = vi.fn();
    render(<QuizCategoryRail onSelectCategory={onSelectCategory} />);
    for (const id of APPROVED) {
      const tile = screen
        .getAllByTestId("quiz-category-rail-tile")
        .find((el) => el.getAttribute("data-category") === id)!;
      expect(tile.getAttribute("data-available"), id).toBe("true");
      fireEvent.click(within(tile).getByRole("button"));
    }
    expect(onSelectCategory.mock.calls.map(([id]) => id)).toEqual(APPROVED);
  });

  it("marks a subject with no live sources unavailable, keeps it a focus stop, and never opens it", () => {
    availability.unavailable = new Set(["vision"]);
    const onSelectCategory = vi.fn();
    render(<QuizCategoryRail onSelectCategory={onSelectCategory} />);
    const tile = screen
      .getAllByTestId("quiz-category-rail-tile")
      .find((el) => el.getAttribute("data-category") === "vision")!;
    const button = within(tile).getByRole("button") as HTMLButtonElement;

    expect(tile.getAttribute("data-available")).toBe("false");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(tile.getAttribute("title")).toContain("coming soon");
    expect(within(tile).getAllByText("Coming soon").length).toBeGreaterThan(0);
    // `aria-disabled`, never `disabled`: a removed tab stop would hide the
    // fact that the subject exists at all.
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.className.includes("cursor-pointer")).toBe(false);

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onSelectCategory).not.toHaveBeenCalled();
  });

  // ── PM1: the Academy treatment ───────────────────────────────────────────

  it("draws its heading INSIDE the plate when the host supplies one", () => {
    render(
      <QuizCategoryRail
        onSelectCategory={vi.fn()}
        heading={{ id: "qs-h", title: "Quick Study", hint: "Pick a subject — ten questions, no timer." }}
      />,
    );
    const rail = screen.getByTestId("quiz-category-rail");
    const heading = within(rail).getByRole("heading", { name: "Quick Study" });
    expect(heading.id).toBe("qs-h");
    // Still no counts: the session size is stated in words, never as a figure.
    expect(rail.textContent).not.toMatch(/\d/);
  });

  it("gives every actionable tile distinct hover, focus and pressed states", () => {
    render(<QuizCategoryRail onSelectCategory={vi.fn()} />);
    for (const button of within(screen.getByTestId("quiz-category-rail")).getAllByRole("button")) {
      const cls = button.className;
      expect(cls).toMatch(/hover:-translate-y-0\.5/);
      expect(cls).toMatch(/focus-visible:ring-2/);
      expect(cls).toMatch(/active:scale-\[0\.98\]/);
      // Reduced motion keeps the light and drops the movement.
      expect(cls).toMatch(/motion-reduce:hover:translate-y-0/);
      // Every icon sits in its gilded frame.
      expect(button.querySelector("[data-rail-frame]")).not.toBeNull();
    }
  });

  it("never hides a subject behind horizontal scrolling", () => {
    render(<QuizCategoryRail onSelectCategory={vi.fn()} />);
    const list = screen.getByTestId("quiz-category-rail").querySelector("ul")!;
    expect(list.className).toMatch(/grid-cols-3/);
    expect(list.className).toMatch(/sm:grid-cols-6/);
    expect(list.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it("hands focus back to the tile a session was started from", () => {
    render(<QuizCategoryRail onSelectCategory={vi.fn()} focusCategoryId="itemization" />);
    const tile = screen
      .getAllByTestId("quiz-category-rail-tile")
      .find((el) => el.getAttribute("data-category") === "itemization")!;
    expect(document.activeElement).toBe(within(tile).getByRole("button"));
  });

  it("restores no focus when the rail is inert", () => {
    const { container } = render(<QuizCategoryRail focusCategoryId="itemization" />);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(document.activeElement).toBe(document.body);
  });
});
