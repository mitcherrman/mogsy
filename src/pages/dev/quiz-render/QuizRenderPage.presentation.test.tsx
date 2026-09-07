/**
 * CON1 Step 1C — the Phase 0 diagnostic, reproduced through the real render
 * harness page.
 *
 * The pure-path proofs live in `src/lib/quiz-screenshot/presentation.test.ts`.
 * These render `/dev/quiz-render` itself and assert what the capture actually
 * contains, because a bridge that is correct in a unit test and unmounted in
 * the page is not a bridge.
 *
 * The four diagnostic questions, and what each must do:
 *   1. plain MCQ        — unchanged: the harness's own card, no scenario.
 *   2. combat scenario  — the PRODUCTION surface, `data-band="family"`.
 *   3. minion exact     — the safe premise reaches the layout authority, which
 *                         declines on this branch (unmerged band), so the
 *                         surface falls back — visibly, not silently.
 *   4. minion wave      — no presentation by design: nothing is reconstructed.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuizRenderPage from "./QuizRenderPage";
import { QUIZ_RENDER_WINDOW_KEY, type RenderQuestion } from "@/lib/quiz-screenshot/types";
import {
  COMBAT_SCENARIO,
  MINION_EXACT,
  MINION_SOLUTION_FIELDS,
  MINION_WAVE,
  PHASE_0_DIAGNOSTIC,
  PLAIN_MCQ,
} from "@/lib/quiz-screenshot/presentationFixtures";

function inject(questions: RenderQuestion[] | null) {
  const w = window as unknown as Record<string, unknown>;
  if (questions) w[QUIZ_RENDER_WINDOW_KEY] = { questions };
  else delete w[QUIZ_RENDER_WINDOW_KEY];
}

function renderHarness(search: string) {
  inject([...PHASE_0_DIAGNOSTIC]);
  return render(
    <MemoryRouter initialEntries={[`/dev/quiz-render${search}`]}>
      <QuizRenderPage />
    </MemoryRouter>,
  );
}

const presentationStatus = (c: HTMLElement) =>
  c.querySelector("[data-quiz-presentation]")?.getAttribute("data-quiz-presentation");

const bandProfile = (c: HTMLElement) =>
  c.querySelector("[data-testid='scenario-surface']")?.getAttribute("data-band") ?? null;

const choiceLabels = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("[data-quiz-choice]")).map((b) => b.textContent?.trim() ?? "");

afterEach(() => {
  cleanup();
  inject(null);
});

describe("1 — a plain MCQ renders exactly as before", () => {
  it("uses the harness's own card, with no scenario surface", () => {
    const { container } = renderHarness(`?q=${PLAIN_MCQ.id}&state=question&format=square`);
    expect(presentationStatus(container)).toBe("absent");
    expect(container.querySelector("[data-quiz-scenario-surface]")).toBeNull();
    expect(container.querySelector("[data-testid='scenario-surface']")).toBeNull();
    // The prompt still comes from the card header, and the options are the
    // harness's own, in source order.
    expect(screen.getByText(/Which item grants the most armor/)).toBeInTheDocument();
    expect(choiceLabels(container)).toEqual([
      "A.Sunfire Aegis",
      "B.Thornmail",
      "C.Dead Man's Plate",
    ]);
    // Pre-reveal chrome untouched.
    expect(container.querySelector("[data-quiz-result-placeholder]")).not.toBeNull();
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
  });

  it("still reveals through the harness's own reserved result area", () => {
    const { container } = renderHarness(`?q=${PLAIN_MCQ.id}&state=explanation&format=square`);
    expect(container.querySelector("[data-quiz-answer-feedback]")).not.toBeNull();
    expect(screen.getByText(/Thornmail grants 70 armor/)).toBeInTheDocument();
  });
});

describe("2 — a combat scenario renders through the production layout system", () => {
  it("mounts the production surface and its family band", () => {
    const { container } = renderHarness(`?q=${COMBAT_SCENARIO.id}&state=question&format=square`);
    expect(presentationStatus(container)).toBe("family");
    expect(container.querySelector("[data-quiz-scenario-surface]")).not.toBeNull();
    expect(bandProfile(container)).toBe("family");
    // The surface owns the prompt now, so the harness must not print it twice.
    expect(screen.getAllByText(/post-mitigation damage/i)).toHaveLength(1);
  });

  it("keeps the answer and reveal states working on that surface", () => {
    const { container: pre } = renderHarness(
      `?q=${COMBAT_SCENARIO.id}&state=question&format=square`,
    );
    // Pre-reveal: nothing is selected and no option is marked correct.
    const preStates = Array.from(pre.querySelectorAll("[data-quiz-choice]")).map((b) =>
      b.getAttribute("data-choice-state"),
    );
    expect(preStates.every((s) => s === "idle")).toBe(true);
    cleanup();

    const { container: post } = renderHarness(
      `?q=${COMBAT_SCENARIO.id}&state=correct&format=square`,
    );
    // Reveal: the surface highlights exactly the option the render plan says.
    const postStates = Array.from(post.querySelectorAll("[data-quiz-choice]")).map((b) =>
      b.getAttribute("data-choice-state"),
    );
    expect(postStates.filter((s) => s === "correct")).toHaveLength(1);
    expect(postStates[COMBAT_SCENARIO.correct_index]).toBe("correct");
    expect(bandProfile(post)).toBe("family");
  });
});

describe("3 — the Minion XP exact-minion premise reaches the layout authority", () => {
  it("renders through the production surface, which falls back visibly", () => {
    const { container } = renderHarness(`?q=${MINION_EXACT.id}&state=question&format=square`);
    // The safe premise DID reach the production path — the surface is mounted
    // and the harness names the outcome.
    expect(container.querySelector("[data-quiz-scenario-surface]")).not.toBeNull();
    expect(presentationStatus(container)).toBe("text-only");
    /**
     * DEPENDENCY, reported not patched: the minion-XP layout rule and
     * `MinionXpBand.tsx` are unmerged work on `hygiene/minion-xp-band-preserved`
     * (`d613c672`). `selectFamilyLayout` therefore declines this source and the
     * surface renders its existing fallback band. Nothing here reconstructs the
     * intended band; the moment that rule merges, this same code renders it
     * with no CON1 change.
     */
    expect(bandProfile(container)).not.toBe("family");
  });

  it("leaks no solution field into the capture", () => {
    const { container } = renderHarness(`?q=${MINION_EXACT.id}&state=question&format=square`);
    const html = container.innerHTML;
    for (const field of MINION_SOLUTION_FIELDS) expect(html).not.toContain(field);
    expect(container.textContent).not.toContain("3rd melee of wave 4");
  });
});

describe("4 — the Minion XP wave form fabricates no context", () => {
  it("renders no scenario surface and reconstructs nothing from metadata", () => {
    const { container } = renderHarness(`?q=${MINION_WAVE.id}&state=question&format=square`);
    expect(presentationStatus(container)).toBe("absent");
    expect(container.querySelector("[data-quiz-scenario-surface]")).toBeNull();
    expect(container.textContent).not.toContain("2:05");
    expect(container.textContent).not.toContain("3 melee, 3 caster");
    // The question itself still renders, as a plain card.
    expect(screen.getByText(/which wave takes you to level 4/i)).toBeInTheDocument();
  });
});
