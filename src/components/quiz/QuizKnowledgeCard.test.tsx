/**
 * Knowledge Breakdown — PT1.7A.
 *
 * The card is finished, Free and self-scoped, and was withheld by a hub flag
 * rather than by any defect in it. Before surfacing it, two things had to be
 * true and only one of them was:
 *
 *   1. IT MUST NAME THE CATEGORIES. Its only data source,
 *      `GET /api/quiz/categories/{user_id}`, serves `category_name`; the row
 *      read `stat.category`, a field that payload does not carry, so every
 *      row rendered a blank name (and shared the React key `undefined`).
 *      That is the one correctness fix PT1.7A made here.
 *   2. IT MUST NOT OVERCLAIM. `quiz_category_progress` is written by exactly
 *      one path — the attempt submit the Practice runner uses. Ranked, Time
 *      Trial, Mastery and the Daily Challenge do not write it. The card says
 *      so rather than reading as "everything you know".
 *
 * Loading / empty / data are all covered here because the hub mounts this
 * card for signed-in players and guests alike.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuizKnowledgeCard from "./QuizKnowledgeCard";

afterEach(cleanup);

// The exact shape the endpoint serves (routes/quiz.py get_category_progress).
const REAL_PAYLOAD = [
  { category_name: "Item Costs", attempts: 40, correct: 34, accuracy: 85 },
  { category_name: "Champion Ability Cooldowns", attempts: 22, correct: 9, accuracy: 40.91 },
  { category_name: "Runes", attempts: 6, correct: 1, accuracy: 16.67 },
];

describe("QuizKnowledgeCard", () => {
  it("renders a skeleton while loading, and no figures", () => {
    const { container } = render(<QuizKnowledgeCard categories={[]} loading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByText(/Top Categories/)).toBeNull();
  });

  it("renders the empty state as a prompt, never a zeroed breakdown", () => {
    render(<QuizKnowledgeCard categories={[]} recommendedCategory="Champion Basics" />);
    expect(screen.getByText("Champion Basics")).toBeTruthy();
    expect(screen.getByText(/Play a few questions/)).toBeTruthy();
    expect(screen.queryByText(/Top Categories/)).toBeNull();
    expect(screen.queryByTestId("knowledge-scope-note")).toBeNull();
  });

  it("prints catalog totals ONLY when a caller has a real source for them", () => {
    // The hub deliberately passes neither: the figures it had were derived
    // from a frontend style map and from overlapping quiz sets, so they were
    // both wrong. Absent means absent — not a dash, not a zero.
    const { container } = render(<QuizKnowledgeCard categories={[]} />);
    expect(container.textContent).not.toContain("Categories\u2014");
    expect(screen.queryByText("—")).toBeNull();
    cleanup();
    render(<QuizKnowledgeCard categories={[]} totalQuestionsAvailable={2280} />);
    expect(screen.getByText("2,280")).toBeTruthy();
    expect(screen.queryByText("Categories")).toBeNull();
  });

  it("names every category from the endpoint's own field", () => {
    // The regression this file exists for: `category_name`, not `category`.
    render(<QuizKnowledgeCard categories={REAL_PAYLOAD} />);
    for (const row of REAL_PAYLOAD) {
      expect(screen.getAllByText(row.category_name).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Uncategorized")).toBeNull();
  });

  it("still names categories served under the older `category` field", () => {
    render(<QuizKnowledgeCard categories={[{ category: "Objectives", attempts: 3, accuracy: 66.7 }]} />);
    expect(screen.getAllByText("Objectives").length).toBeGreaterThan(0);
  });

  it("ranks weakest by accuracy, not by volume", () => {
    const { container } = render(<QuizKnowledgeCard categories={REAL_PAYLOAD} />);
    const sections = [...container.querySelectorAll(".space-y-3")];
    const weakest = sections.find((s) => s.textContent?.startsWith("Weakest Categories"))!;
    expect(weakest).toBeTruthy();
    const order = [...weakest.querySelectorAll(".truncate")].map((n) => n.textContent);
    expect(order[0]).toBe("Runes"); // 16.67%, and the FEWEST attempts
  });

  it("states what it counts, so it cannot read as a whole-product breakdown", () => {
    render(<QuizKnowledgeCard categories={REAL_PAYLOAD} />);
    const note = screen.getByTestId("knowledge-scope-note");
    expect(note.textContent).toMatch(/Practice/);
    expect(note.textContent).toMatch(/Ranked/);
  });

  it("shows an error without pretending the record is empty", () => {
    render(<QuizKnowledgeCard categories={REAL_PAYLOAD} error="Category stats unavailable." />);
    expect(screen.getByText("Category stats unavailable.")).toBeTruthy();
    // The rows it already has are still printed — an error is not a reset.
    expect(screen.getAllByText("Item Costs").length).toBeGreaterThan(0);
  });

  it("carries no entitlement copy of any kind — it is Free", () => {
    const { container } = render(<QuizKnowledgeCard categories={REAL_PAYLOAD} />);
    expect(container.textContent).not.toMatch(/Premium|Upgrade|Unlock|Pro\b/);
  });
});
