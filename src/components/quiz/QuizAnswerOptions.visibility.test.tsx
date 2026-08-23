/**
 * THE ANSWER GRID MUST NEVER BE ACTIONABLE AND INVISIBLE (ARENA1 Step 3).
 *
 * This is the failure this file exists to make impossible:
 *
 *   The tablets are in the DOM. They have the right roles and labels. They are
 *   keyboard-reachable. `getByRole` finds them, `toBeEnabled` passes, every
 *   unit test is green — and the player sees an empty parchment, because the
 *   mount animation that was supposed to fade them in never ran and left them
 *   at `opacity: 0`.
 *
 * It shipped once already. DC1's `DailyAnswerGrid` was written with no mount
 * animation at all specifically to avoid it, and its header says so: "An
 * answer grid that can fail closed to invisible is an unplayable game, and it
 * fails silently." That workaround must not survive into the shared arena, so
 * the canonical grid has to be the thing that cannot fail this way.
 *
 * THE RULE, stated as something testable:
 *
 *   A tablet's VISIBILITY is never owned by an animation. The resting style is
 *   visible, and the entrance is decoration layered on top — so an animation
 *   that never starts, never finishes, or never existed leaves a grid the
 *   player can see and use.
 *
 * jsdom is the right environment for exactly this, and for once its weakness
 * is the point: it runs no animations and no rAF-driven library. Anything that
 * needs an animation frame to become visible is invisible here, permanently.
 * That is the production bug, reproduced on demand.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import QuizAnswerOptions from "./QuizAnswerOptions";

const CHOICES = ["Sunfire Aegis", "Heartsteel", "Thornmail", "Randuin's Omen"];

const renderGrid = (props: Partial<React.ComponentProps<typeof QuizAnswerOptions>> = {}) =>
  render(
    <QuizAnswerOptions
      choices={CHOICES}
      selectedAnswer={null}
      answerResult={null}
      onSelect={() => {}}
      {...props}
    />,
  );

/** Every element between a tablet and the grid root, plus the tablet itself. */
function ancestryWithin(el: HTMLElement, rootSelector: string): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node) {
    chain.push(node);
    if (node.matches(rootSelector)) break;
    node = node.parentElement;
  }
  return chain;
}

describe("an answer tablet is visible without any animation running", () => {
  it("no tablet, and nothing wrapping one, rests at zero opacity", () => {
    renderGrid();
    const tablets = screen.getAllByRole("button");
    expect(tablets).toHaveLength(4);
    for (const tablet of tablets) {
      for (const node of ancestryWithin(tablet, "[data-quiz-answer-options]")) {
        const opacity = node.style.opacity;
        // "" = never written, which is the state we want. A written "0" is the
        // bug; anything between 0 and 1 would be a half-played animation
        // frozen in the DOM, which is the same bug arriving more slowly.
        expect(
          opacity === "" || Number(opacity) === 1,
          `${node.tagName}${node.className ? "." + String(node.className).split(" ")[0] : ""}`
          + ` rests at opacity "${opacity}" — a player cannot see it, but can still`
          + " click and focus it.",
        ).toBe(true);
      }
    }
  });

  it("no tablet is displaced off its slot by an unplayed entrance", () => {
    renderGrid();
    for (const tablet of screen.getAllByRole("button")) {
      for (const node of ancestryWithin(tablet, "[data-quiz-answer-options]")) {
        const t = node.style.transform;
        expect(
          t === "" || t === "none",
          `${node.tagName} rests at transform "${t}" — the entrance's starting`
          + " offset is being held as if it were the resting position.",
        ).toBe(true);
      }
    }
  });

  it("actionable and visible are the same set", () => {
    renderGrid();
    // The invariant in one sentence: if you can act on it, you can see it.
    for (const tablet of screen.getAllByRole("button")) {
      const actionable = !(tablet as HTMLButtonElement).disabled;
      const hidden = ancestryWithin(tablet, "[data-quiz-answer-options]")
        .some((n) => n.style.opacity !== "" && Number(n.style.opacity) < 1);
      expect(actionable && hidden).toBe(false);
    }
  });

  it("holds for a locked grid and a revealed grid too", () => {
    const { rerender } = renderGrid({ answerResult: { correct_answer: "Thornmail" } });
    const check = () => {
      for (const tablet of screen.getAllByRole("button")) {
        for (const node of ancestryWithin(tablet, "[data-quiz-answer-options]")) {
          expect(node.style.opacity === "" || Number(node.style.opacity) === 1).toBe(true);
        }
      }
    };
    check();
    rerender(
      <QuizAnswerOptions
        choices={CHOICES} selectedAnswer="Heartsteel" answerResult={null}
        onSelect={() => {}} eliminatedIndexes={[0]}
      />,
    );
    check();
  });

  it("the entrance is declarative — no rAF library owns the tablets' opacity", () => {
    // Structural, and deliberately so. The three failures that stranded this
    // grid before were a missed frame, a remount that skipped the enter, and a
    // library upgrade — none of which a rendered assertion can distinguish
    // from a slow machine. What it can check is that no JS animation is in the
    // path at all.
    const src = String(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("node:fs").readFileSync(
        require("node:path").resolve(__dirname, "QuizAnswerOptions.tsx"), "utf8"),
    );
    expect(src, "the answer grid must not animate its own opacity from JS")
      .not.toMatch(/initial=\{\{[^}]*opacity/);
    expect(src, "framer-motion must not own an answer tablet's visibility")
      .not.toMatch(/framer-motion/);
  });
});
