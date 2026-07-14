/**
 * Render-harness validation: correct-answer leakage, state integrity,
 * invalid params, and the render-ready marker.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuizRenderPage from "./QuizRenderPage";
import { QUIZ_RENDER_WINDOW_KEY, type RenderQuestion } from "@/lib/quiz-screenshot/types";

const fixture: RenderQuestion = {
  id: "t1",
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Sunfire Aegis" }, { label: "Thornmail" }, { label: "Dead Man's Plate" }],
  correct_index: 1,
  explanation: "Thornmail grants 70 armor.",
  category: "items",
};

function inject(questions: RenderQuestion[] | null) {
  const w = window as unknown as Record<string, unknown>;
  if (questions) w[QUIZ_RENDER_WINDOW_KEY] = { questions };
  else delete w[QUIZ_RENDER_WINDOW_KEY];
}

function renderHarness(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dev/quiz-render${search}`]}>
      <QuizRenderPage />
    </MemoryRouter>,
  );
}

function choiceStates(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-quiz-choice]")).map(
    (b) => b.getAttribute("data-choice-state") ?? "missing",
  );
}

afterEach(() => {
  cleanup();
  inject(null);
});

describe("QuizRenderPage — question state (no leakage)", () => {
  it("shows no selection, no reveal styling, no explanation, no visible feedback", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=square");
    expect(choiceStates(container)).toEqual(["idle", "idle", "idle"]);
    // The reserved result area shows the quiet engagement panel pre-reveal —
    // never real feedback, never any answer information.
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    const placeholder = container.querySelector("[data-quiz-result-placeholder]");
    expect(placeholder).not.toBeNull();
    expect(placeholder!.textContent).toContain("Comment your answer!");
    expect(screen.queryByText("Correct!")).toBeNull();
    expect(screen.queryByText(/Thornmail grants 70 armor/)).toBeNull();
    expect(container.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeNull();
    // Answer order preserved exactly as provided.
    const labels = Array.from(container.querySelectorAll("[data-quiz-choice]")).map((b) =>
      b.textContent?.replace(/^[A-D]\./, "").trim(),
    );
    expect(labels).toEqual(["Sunfire Aegis", "Thornmail", "Dead Man's Plate"]);
  });

  it("renders no category pill — the question text is the topmost card content", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=square");
    // fixture.category = "items": must not appear anywhere as a label.
    expect(screen.queryByText(/^items$/i)).toBeNull();
    const header = container.querySelector("[data-quiz-content-card] .pb-3, [data-quiz-content-card] h3")
      ?? container.querySelector("h3");
    expect(header?.textContent).toContain("Which item grants the most armor?");
  });

  it("stamps the render-ready marker on the stage", async () => {
    inject([fixture]);
    // Audit format: no CTA imagery — jsdom never fires img load events, so an
    // image-free render is the only place jsdom can observe the marker.
    // Image-bearing readiness is exercised by the real Playwright captures.
    const { container } = renderHarness("?q=t1&state=question&format=mobile-audit");
    await waitFor(() => {
      expect(
        container.querySelector('[data-quiz-render-stage][data-quiz-render-ready="true"]'),
      ).not.toBeNull();
    });
  });
});

describe("QuizRenderPage — states", () => {
  it("selected: marks only the deterministic first choice, no correctness reveal", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square");
    expect(choiceStates(container)).toEqual(["selected", "idle", "idle"]);
    // Pre-reveal states carry the quiet placeholder, never real feedback.
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    expect(container.querySelector("[data-quiz-result-placeholder]")).not.toBeNull();
  });

  it("selected: honors answerIndex override", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square&answerIndex=2");
    expect(choiceStates(container)).toEqual(["idle", "idle", "selected"]);
  });

  it("correct: reveals the actual correct answer with feedback", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=correct&format=square");
    expect(choiceStates(container)).toEqual(["idle", "correct", "idle"]);
    expect(screen.getByText("Correct!")).toBeTruthy();
    expect(screen.queryByText(/Thornmail grants 70 armor/)).toBeNull(); // no explanation yet
  });

  it("incorrect: wrong selection shown AND correct answer revealed", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=incorrect&format=square");
    expect(choiceStates(container)).toEqual(["incorrect-selected", "correct", "idle"]);
    expect(screen.getByText("Incorrect")).toBeTruthy();
    expect(screen.getByText(/Correct answer:/)).toBeTruthy();
  });

  it("explanation: shows the explanation text", () => {
    inject([fixture]);
    renderHarness("?q=t1&state=explanation&format=square");
    expect(screen.getByText(/Thornmail grants 70 armor/)).toBeTruthy();
  });

  it("explanation without explanation text: inert error, not fabricated content", () => {
    inject([{ ...fixture, id: "t2", explanation: undefined }]);
    const { container } = renderHarness("?q=t2&state=explanation&format=square");
    expect(container.querySelector("[data-quiz-render-error]")).not.toBeNull();
    expect(container.querySelector("[data-quiz-render-stage]")).toBeNull();
  });
});

const recipeFixture: RenderQuestion = {
  id: "build1",
  question_text: "Dusk and Dawn builds from Blasting Wand, Kindlegem, and Sheen. Which component completes the recipe?",
  choices: [
    { label: "Dagger" },
    { label: "Recurve Bow" },
    { label: "Needlessly Large Rod" },
    { label: "Faerie Charm" },
  ],
  correct_index: 0,
  image_path: "assets/items/222510.png",
  metadata: {
    question_type: "item_build_path",
    recipe_type: "missing_component",
    item_name: "Dusk and Dawn",
    asset_path: "assets/items/222510.png",
    known_component_icons: [
      { name: "Blasting Wand", icon: "assets/items/221026.png" },
      { name: "Kindlegem", icon: "assets/items/223067.png" },
      { name: "Sheen", icon: "assets/items/223057.png" },
    ],
    missing_component_item_name: "Dagger",
    missing_component_icon: "assets/items/1042.png",
  },
};

describe("QuizRenderPage — content CTA", () => {
  it("renders an IDENTICAL top CTA and bottom QR in question and correct states", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=question&format=mobile-social");
    const ctaQuestion = a.container.querySelector("[data-quiz-cta]");
    expect(ctaQuestion).not.toBeNull();
    expect(ctaQuestion!.getAttribute("data-quiz-cta-mode")).toBe("top");
    expect(ctaQuestion!.textContent).toContain("mogsy.app");
    const qrQuestion = a.container.querySelector("[data-quiz-cta-qr]");
    expect(qrQuestion!.querySelector("svg path")).not.toBeNull();
    // CTA lives outside the card — never inside the answer grid.
    expect(a.container.querySelector("[data-quiz-answer-options] [data-quiz-cta]")).toBeNull();
    const questionCtaHtml = ctaQuestion!.outerHTML;
    const questionQrHtml = qrQuestion!.outerHTML;
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=correct&format=mobile-social");
    // Byte-identical CTA + QR markup between the two screenshot states.
    expect(b.container.querySelector("[data-quiz-cta]")!.outerHTML).toBe(questionCtaHtml);
    expect(b.container.querySelector("[data-quiz-cta-qr]")!.outerHTML).toBe(questionQrHtml);
  });

  it("phone composition: CTA, card, QR + caption all inside the screen, in order", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    const phone = container.querySelector("[data-quiz-phone]")!;
    expect(phone).not.toBeNull();
    const phoneScreen = phone.querySelector("[data-quiz-phone-screen]")!;
    expect(phoneScreen).not.toBeNull();
    expect(phoneScreen.querySelector("[data-quiz-phone-island]")).not.toBeNull();
    // Everything lives inside the phone screen.
    for (const sel of ["[data-quiz-cta]", "[data-quiz-content-card]", "[data-quiz-cta-qr]", "[data-quiz-cta-scan]"]) {
      expect(phoneScreen.querySelector(sel)).not.toBeNull();
      expect(container.querySelectorAll(sel).length).toBe(1);
    }
    // Column order: CTA wrapper, card area, QR+caption wrapper.
    const column = phoneScreen.querySelector(".flex.flex-col")!;
    const children = Array.from(column.children);
    expect(children[0].querySelector("[data-quiz-cta]")).not.toBeNull();
    expect(children[1].querySelector("[data-quiz-content-card]")).not.toBeNull();
    expect(children[2].querySelector("[data-quiz-cta-qr]")).not.toBeNull();
    expect(children[2].querySelector("[data-quiz-cta-scan]")!.textContent).toBe("Scan to play");
    // No combined panel; QR keeps its white quiet-zone tile.
    expect(container.querySelector("[data-quiz-cta] [data-quiz-cta-qr]")).toBeNull();
    expect(container.querySelector("[data-quiz-cta-qr]")!.className).toContain("bg-white");
    // Larger, clearly visible wordmark.
    const wordmark = container.querySelector("[data-quiz-cta] img")!;
    expect(wordmark.className).toContain("h-14");
  });

  it("keeps the result area reserved with a matching-box placeholder", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=question&format=mobile-social");
    expect(a.container.querySelector("[data-quiz-result-area]")).not.toBeNull();
    const placeholder = a.container.querySelector("[data-quiz-result-placeholder]")!;
    // Identical box model to the feedback panel: same classes, one text line.
    expect(placeholder.className).toContain("rounded-lg border p-4 text-sm");
    expect(placeholder.textContent).toContain("Comment your answer!");
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=correct&format=mobile-social");
    expect(b.container.querySelector("[data-quiz-result-area]")).not.toBeNull();
    // Correct state shows the real feedback instead of the placeholder.
    expect(b.container.querySelector("[data-quiz-result-placeholder]")).toBeNull();
    const feedback = b.container.querySelector("[data-quiz-answer-feedback]")!;
    expect(feedback.className).toContain("rounded-lg border p-4 text-sm");
  });

  it("renders no CTA on audit formats", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-audit");
    expect(container.querySelector("[data-quiz-cta]")).toBeNull();
  });
});

describe("QuizRenderPage — item-build recipe visual", () => {
  it("renders the recipe with a ? slot and no answer leakage in question state", () => {
    inject([recipeFixture]);
    const { container } = renderHarness("?q=build1&state=question&format=mobile-social");
    const recipe = container.querySelector("[data-quiz-recipe]");
    expect(recipe).not.toBeNull();
    expect(recipe!.querySelector("[data-recipe-missing-slot]")?.textContent).toBe("?");
    // The visual area must not name or show the missing component. ("Dagger"
    // legitimately appears once — as answer choice A in the options grid.)
    expect(recipe!.textContent).not.toContain("Dagger");
    expect(recipe!.innerHTML).not.toContain("1042.png");
    expect(recipe!.textContent).toContain("Blasting Wand");
  });

  it("reserves a fixed-height label under every tile so reveal never reflows", () => {
    const tileLabels = (root: HTMLElement): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>("[data-quiz-recipe] .gap-1 > span"));
    inject([recipeFixture]);
    const a = renderHarness("?q=build1&state=question&format=mobile-social");
    const labelsQ = tileLabels(a.container);
    expect(labelsQ.length).toBeGreaterThan(0);
    labelsQ.forEach((label) => expect(label.style.height).toBe("26px"));
    cleanup();
    inject([recipeFixture]);
    const b = renderHarness("?q=build1&state=correct&format=mobile-social");
    const labelsC = tileLabels(b.container);
    expect(labelsC.length).toBe(labelsQ.length);
    labelsC.forEach((label) => expect(label.style.height).toBe("26px"));
  });

  it("fills the missing component in the correct state", () => {
    inject([recipeFixture]);
    const { container } = renderHarness("?q=build1&state=correct&format=mobile-social");
    const recipe = container.querySelector("[data-quiz-recipe]")!;
    expect(recipe.querySelector("[data-recipe-missing-slot]")).toBeNull();
    expect(recipe.textContent).toContain("Dagger");
    expect(recipe.innerHTML).toContain("1042.png");
  });

  it("builds_into: renders source → ? with an arrow and no spoiler in question state", () => {
    const buildsInto: RenderQuestion = {
      id: "bi1",
      question_text: "What can Aether Wisp build into?",
      choices: [
        { label: "Imperial Mandate" },
        { label: "Vigilant Wardstone" },
        { label: "Last Whisper" },
        { label: "Ardent Censer" },
      ],
      correct_index: 3,
      image_path: "assets/items/3113.png",
      metadata: {
        component_item_id: 3113,
        component_item_name: "Aether Wisp",
        parent_item_id: 323504,
        parent_item_name: "Ardent Censer",
        asset_path: "assets/items/3113.png",
      },
    };
    inject([buildsInto]);
    const { container } = renderHarness("?q=bi1&state=question&format=mobile-social");
    const recipe = container.querySelector("[data-quiz-recipe]")!;
    expect(recipe.getAttribute("data-recipe-mode")).toBe("builds_into");
    expect(recipe.querySelector('[data-recipe-join="arrow"]')).not.toBeNull();
    expect(recipe.querySelector('[data-recipe-join="plus"]')).toBeNull();
    expect(recipe.querySelector("[data-recipe-missing-slot]")).not.toBeNull();
    expect(recipe.textContent).toContain("Aether Wisp");
    expect(recipe.textContent).not.toContain("Ardent Censer");
    expect(recipe.innerHTML).not.toContain("323504");
    cleanup();
    inject([buildsInto]);
    const b = renderHarness("?q=bi1&state=correct&format=mobile-social");
    const revealed = b.container.querySelector("[data-quiz-recipe]")!;
    expect(revealed.querySelector("[data-recipe-missing-slot]")).toBeNull();
    expect(revealed.textContent).toContain("Ardent Censer");
  });

  it("components_of_item: completed item + bare ? slot, spoiler-free in question state", () => {
    const components: RenderQuestion = {
      id: "co1",
      question_text: "Which item is a component of Aether Wisp?",
      choices: [
        { label: "Bounty of Worlds" },
        { label: "Dark Seal" },
        { label: "Amplifying Tome" },
        { label: "Boots" },
      ],
      correct_index: 2,
      image_path: "assets/items/3113.png",
      metadata: {
        item_id: 3113,
        item_name: "Aether Wisp",
        component_item_id: 1052,
        component_item_name: "Amplifying Tome",
        asset_path: "assets/items/3113.png",
      },
    };
    inject([components]);
    const { container } = renderHarness("?q=co1&state=question&format=mobile-social");
    const recipe = container.querySelector("[data-quiz-recipe]")!;
    expect(recipe.getAttribute("data-recipe-mode")).toBe("components_of_item");
    expect(recipe.querySelector("[data-recipe-join]")).toBeNull(); // bare slot
    expect(recipe.querySelector("[data-recipe-missing-slot]")).not.toBeNull();
    // "Amplifying Tome" appears only as answer choice C, never in the visual.
    expect(recipe.textContent).not.toContain("Amplifying Tome");
    expect(recipe.innerHTML).not.toContain("1052");
    cleanup();
    inject([components]);
    const b = renderHarness("?q=co1&state=correct&format=mobile-social");
    expect(b.container.querySelector("[data-quiz-recipe]")!.innerHTML).toContain("1052.png");
  });

  it("falls back to the plain layout for non-build questions and audit formats", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=question&format=mobile-social");
    expect(a.container.querySelector("[data-quiz-recipe]")).toBeNull();
    cleanup();
    inject([recipeFixture]);
    const b = renderHarness("?q=build1&state=question&format=mobile-audit");
    expect(b.container.querySelector("[data-quiz-recipe]")).toBeNull();
  });
});

describe("QuizRenderPage — invalid input", () => {
  it("rejects unknown state and unknown format", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=bogus&format=square");
    expect(a.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown state/);
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=question&format=gigantic");
    expect(b.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown format/);
  });

  it("rejects missing and unknown question ids", () => {
    inject([fixture]);
    const a = renderHarness("?state=question&format=square");
    expect(a.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Missing \?q=/);
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=nope&state=question&format=square");
    expect(b.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/not found/);
  });

  it("rejects a malformed forced scale", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social&scale=99");
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Invalid scale/);
  });

  it("rejects a malformed answerIndex", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square&answerIndex=x");
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Invalid answerIndex/);
  });

  it("never renders the ready marker on an error panel", async () => {
    inject([fixture]);
    const { container } = renderHarness("?q=nope&state=question&format=square");
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-quiz-render-ready="true"]')).toBeNull();
  });
});
