/**
 * Sibling answer geometry (answer-geometry pass).
 *
 * WHAT THESE TESTS PROVE, AND WHAT THEY CANNOT.
 *
 * jsdom implements no layout: every element reports `offsetHeight === 0`, and
 * CSS Grid track sizing does not run at all. Measuring that four tablets come
 * out the same pixel height is therefore impossible here, and a test that
 * claimed to would be measuring zeroes.
 *
 * What IS meaningfully testable is the STYLE CONTRACT — the specific chain of
 * declarations that produces equal sibling heights in a real engine. The
 * masonry defect was caused by exactly one break in that chain, so pinning the
 * chain is pinning the fix:
 *
 *   1. the grid equalises its rows wherever it is more than one column wide
 *      (`auto-rows-fr`), so a wrapped answer raises its siblings' row;
 *   2. each option's cell is a flex container, so it passes the stretched row
 *      height it already had down to the tablet inside it — the step that was
 *      missing, and the entire root cause;
 *   3. the tablet fills that cell (`h-full`) instead of sizing to its own text;
 *   4. nothing in the chain is a FIXED height, so a legitimately long answer
 *      still wraps and grows rather than clipping;
 *   5. the badge, padding and text treatment are identical on every sibling,
 *      with or without media, so equal boxes hold equally-placed content.
 *
 * Content-level facts (full text present, badges present and lettered, media
 * slot mounted for every option) ARE directly assertable and are asserted.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import QuizAnswerOptions from "./QuizAnswerOptions";

const SHORT = "Lost Chapter";
const LONG =
  "Destroying the outer turret before the 14-minute plate expiry";

/** A realistic mixed 2x2: two one-line answers, two that must wrap. */
const MIXED = [LONG, SHORT, "Tear of the Goddess", "Sheen and a Blasting Wand combined"];

function grid() {
  return document.querySelector("[data-quiz-answer-options]") as HTMLElement;
}
function cells() {
  return Array.from(document.querySelectorAll("[data-quiz-choice-cell]")) as HTMLElement[];
}
function tablets() {
  return Array.from(document.querySelectorAll("[data-quiz-choice]")) as HTMLElement[];
}
/** Class sets that must be IDENTICAL across siblings for geometry to match. */
function geometryClasses(el: HTMLElement) {
  return Array.from(el.classList)
    .filter((c) => /^(w-|h-|min-h-|min-w-|py-|px-|p-|gap-|flex|items-|justify-|whitespace-|text-sm|leading-)/.test(c))
    .sort()
    .join(" ");
}

describe("a 2x2 of mixed one-line and two-line answers is one coherent set", () => {
  it("equalises grid rows wherever the grid is more than one column", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    const cls = grid().className;
    // The desktop 2-up and its row equalisation arrive at the SAME breakpoint.
    // Either without the other is the defect: two columns with auto rows is
    // the masonry, equal rows with one column is wasted mobile height.
    expect(cls).toContain("lg:grid-cols-2");
    expect(cls).toContain("lg:auto-rows-fr");
    // Landscape-short viewports go 2-up too, and get the same treatment.
    expect(cls).toContain("[@media(max-height:480px)_and_(orientation:landscape)]:grid-cols-2");
    expect(cls).toContain("[@media(max-height:480px)_and_(orientation:landscape)]:auto-rows-fr");
  });

  it("passes the row height down: cell stretches, tablet fills the cell", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    expect(cells()).toHaveLength(4);
    for (const cell of cells()) {
      // THE ROOT CAUSE, pinned. A grid item already stretches to its row; this
      // wrapper only relays that height if it is itself a stretch container.
      expect(cell.className).toContain("flex");
      expect(cell.className).toContain("min-w-0");
    }
    for (const t of tablets()) {
      expect(t.className).toContain("h-full");
      expect(t.className).toContain("w-full");
    }
  });

  it("gives every sibling identical box and content treatment", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    const boxes = tablets().map(geometryClasses);
    // Four answers of four different lengths, one box definition.
    expect(new Set(boxes).size).toBe(1);
    // Padding is uniform and present — the "consistent internal padding" half.
    expect(boxes[0]).toContain("py-3");
    expect(boxes[0]).toContain("px-4");
  });

  it("never clips or truncates a wrapped answer", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    // The full copy of the longest answer is in the document verbatim.
    expect(screen.getByText(LONG)).toBeTruthy();
    const label = screen.getByText(LONG);
    // Wrapping is ALLOWED and truncation is not: no line-clamp, no `truncate`,
    // no ellipsis, and `whitespace-normal` on the tablet so text may break.
    expect(label.className).toContain("break-words");
    expect(label.className).not.toContain("truncate");
    expect(label.className).not.toMatch(/line-clamp/);
    const tablet = label.closest("[data-quiz-choice]") as HTMLElement;
    expect(tablet.className).toContain("whitespace-normal");
    // And no fixed height that a third line could not escape.
    expect(tablet.className).not.toMatch(/\bh-\d/);
    expect(tablet.className).toContain("min-h-full");
  });

  it("keeps the A/B/C/D badges lettered, ordered and identically placed", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    const letters = Array.from(document.querySelectorAll("[data-choice-letter]"));
    expect(letters.map((l) => l.textContent)).toEqual(["A.", "B.", "C.", "D."]);
    // One badge treatment for all four. With equal card heights and the
    // tablet's `items-center`, identical badge boxes land at identical
    // coordinates whether their label is one line or two.
    const badgeBoxes = letters.map((l) => geometryClasses(l as HTMLElement));
    expect(new Set(badgeBoxes).size).toBe(1);
    for (const t of tablets()) expect(t.className).not.toContain("items-start");
  });
});

describe("media never changes the outer geometry", () => {
  const MEDIA = { type: "item", name: "Lost Chapter", icon: "items/lost_chapter.png" };

  it("mounts a fixed slot on every option, resolved or not, and leaves the box alone", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
        optionMedia={[MEDIA, null, MEDIA, null]}
      />,
    );
    const slots = Array.from(document.querySelectorAll("[data-option-media]")) as HTMLElement[];
    // All four, including the two with nothing to show: a null entry costs
    // layout space rather than shrinking its tablet.
    expect(slots).toHaveLength(4);
    expect(new Set(slots.map((s) => geometryClasses(s))).size).toBe(1);
    expect(slots.map((s) => s.dataset.optionMediaState))
      .toEqual(["ok", "empty", "ok", "empty"]);
    // The tablets themselves are the same box as the media-free render.
    expect(new Set(tablets().map(geometryClasses)).size).toBe(1);
  });

  it("a media render and a media-free render agree on the tablet box", () => {
    const { unmount } = render(
      <QuizAnswerOptions
        choices={MIXED} selectedAnswer={null} answerResult={null}
        onSelect={() => {}} columns="wide-2"
      />,
    );
    const plain = tablets().map(geometryClasses);
    unmount();
    render(
      <QuizAnswerOptions
        choices={MIXED} selectedAnswer={null} answerResult={null}
        onSelect={() => {}} columns="wide-2" optionMedia={[MEDIA, MEDIA, MEDIA, MEDIA]}
      />,
    );
    expect(tablets().map(geometryClasses)).toEqual(plain);
  });
});

describe("mobile stacking", () => {
  it("stays one full-width column and is NOT row-equalised", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED} selectedAnswer={null} answerResult={null}
        onSelect={() => {}} columns="auto"
      />,
    );
    const cls = grid().className;
    expect(cls).toContain("grid-cols-1");
    // `auto-rows-fr` appears ONLY behind a multi-column breakpoint. An
    // unqualified occurrence would inflate every stacked answer on a phone to
    // the height of the longest one.
    for (const token of cls.split(/\s+/)) {
      if (token.includes("auto-rows-fr")) expect(token).toMatch(/^(lg:|\[@media)/);
    }
    // Every tablet still spans the column.
    for (const t of tablets()) expect(t.className).toContain("w-full");
  });
});

describe("answer-state styling still works on the new box", () => {
  it("selection, correct and incorrect keep their states and their geometry", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={SHORT}
        answerResult={{ correct_answer: LONG }}
        onSelect={() => {}}
        columns="wide-2"
      />,
    );
    const states = tablets().map((t) => t.dataset.choiceState);
    expect(states).toEqual(["correct", "incorrect-selected", "idle", "idle"]);
    // A resolved card disables every tablet — unchanged.
    for (const t of tablets()) expect((t as HTMLButtonElement).disabled).toBe(true);
    // And the geometry is state-independent: the reveal repaints, never resizes.
    expect(new Set(tablets().map(geometryClasses)).size).toBe(1);
  });

  it("an eliminated option keeps its place, its letter and its box", () => {
    render(
      <QuizAnswerOptions
        choices={MIXED}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
        columns="wide-2"
        eliminatedIndexes={[1]}
      />,
    );
    expect(tablets().map((t) => t.dataset.choiceState))
      .toEqual(["idle", "eliminated", "idle", "idle"]);
    expect(Array.from(document.querySelectorAll("[data-choice-letter]")).map((l) => l.textContent))
      .toEqual(["A.", "B.", "C.", "D."]);
    // line-through + opacity, never a size change — the grid must not reflow.
    expect(tablets()[1].className).toContain("line-through");
    expect(new Set(tablets().map(geometryClasses)).size).toBe(1);
  });
});

describe("picture-choice answers are a set too", () => {
  it("equalises its own 2-up rows and fills each cell", () => {
    render(
      <QuizAnswerOptions
        choices={[
          { label: "Ahri", image_path: "champions/ahri.png" },
          { label: "Lee Sin", image_path: "champions/leesin.png" },
          { label: "Kai'Sa", image_path: "champions/kaisa.png" },
          { label: "Nunu & Willump", image_path: "champions/nunu.png" },
        ]}
        selectedAnswer={null}
        answerResult={null}
        onSelect={() => {}}
      />,
    );
    expect(grid().className).toContain("grid-cols-2");
    expect(grid().className).toContain("auto-rows-fr");
    for (const t of tablets()) expect(t.className).toContain("h-full");
    expect(new Set(tablets().map(geometryClasses)).size).toBe(1);
  });
});
