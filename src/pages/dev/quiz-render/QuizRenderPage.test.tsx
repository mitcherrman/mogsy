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
    expect(placeholder!.textContent).toContain("Comment A, B, C, or D");
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
    expect(ctaQuestion!.textContent).toContain("mogzy.lol");
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
    expect(placeholder.textContent).toContain("Comment A, B, C, or D");
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=correct&format=mobile-social");
    expect(b.container.querySelector("[data-quiz-result-area]")).not.toBeNull();
    // Correct state shows the real feedback instead of the placeholder.
    expect(b.container.querySelector("[data-quiz-result-placeholder]")).toBeNull();
    const feedback = b.container.querySelector("[data-quiz-answer-feedback]")!;
    expect(feedback.className).toContain("rounded-lg border p-4 text-sm");
  });

  it("centers the question prompt in social captures (harness CSS only)", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    const stageCss = Array.from(container.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(stageCss).toMatch(/\[data-quiz-content-card\] h3\{\s*text-align:center;/);
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

describe("QuizRenderPage — content slides + difficulty", () => {
  it("renders the difficulty signal as an emblem-only image (no words/chrome)", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social&difficulty=gold");
    const badge = container.querySelector("[data-quiz-difficulty]");
    expect(badge).not.toBeNull();
    // Emblem only: the marked element IS the img, with no rank/difficulty text.
    expect(badge!.tagName).toBe("IMG");
    expect(badge!.getAttribute("data-difficulty-tier")).toBe("gold");
    expect(badge!.getAttribute("src")).toContain("assets/ranks/large/gold.png");
    expect(badge!.textContent?.trim()).toBe("");
    // The emblem lives in its own fixed-height lane between the visual area
    // and answer A — in flow, deterministic height, never overlapping text.
    const lane = badge!.closest("[data-quiz-difficulty-lane]") as HTMLElement | null;
    expect(lane).not.toBeNull();
    expect(lane!.style.height).toBe("64px");
    const options = container.querySelector("[data-quiz-answer-options]")!;
    expect(
      lane!.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(options.contains(lane!)).toBe(false);
    // The question title keeps its full width (no reserved padding for a badge).
    const title = container.querySelector("[data-quiz-content-card] h3") as HTMLElement | null;
    expect(title?.getAttribute("style") ?? "").not.toMatch(/padding-right/);
  });

  it("renders no emblem lane when there is no difficulty", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    expect(container.querySelector("[data-quiz-difficulty-lane]")).toBeNull();
  });

  it("uses per-question metadata difficulty when no param is given", () => {
    inject([{ ...fixture, id: "d1", metadata: { content_difficulty: "diamond" } }]);
    const { container } = renderHarness("?q=d1&state=question&format=mobile-social");
    expect(
      container.querySelector("[data-quiz-difficulty]")!.getAttribute("data-difficulty-tier"),
    ).toBe("diamond");
  });

  it("shows no badge when neither param nor metadata provides one", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    expect(container.querySelector("[data-quiz-difficulty]")).toBeNull();
  });

  it("rejects an unknown difficulty rather than guessing", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social&difficulty=silver");
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown difficulty/);
  });

  it("app-cta slide: competitive copy, text-led PLAY AT hierarchy, socials", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=app-cta&format=mobile-social");
    const slide = container.querySelector('[data-content-slide="app-cta"]')!;
    expect(slide).not.toBeNull();
    expect(container.querySelector("[data-quiz-choice]")).toBeNull();
    // Competitive headline + supporting copy.
    expect(slide.textContent).toContain("Think you know League?");
    expect(slide.textContent).toContain("Prove it.");
    expect(slide.textContent).toContain("Challenge others to test your knowledge at");
    // Text-led CTA: a single dominant mogzy.lol line — no "Play at" line,
    // no button box.
    const playCta = slide.querySelector("[data-play-cta]") as HTMLElement;
    expect(playCta).not.toBeNull();
    expect(playCta.textContent!.trim()).toBe("mogzy.lol");
    expect(slide.textContent).not.toMatch(/play at/i);
    expect(playCta.className).not.toContain("rounded"); // no button chrome
    expect(playCta.getAttribute("style") ?? "").not.toMatch(/background:/);
    // Descender fix: the gradient-clipped line must not use a tight line box.
    const domain = playCta.querySelector("span") as HTMLElement;
    expect(domain.className).not.toContain("leading-none");
    expect(domain.style.lineHeight).toBe("1.25");
    // Socials on every end slide.
    expect(slide.querySelector("[data-social-links]")).not.toBeNull();
    // Still inside the phone shell with its QR + scan caption.
    expect(container.querySelector("[data-quiz-cta-qr]")).not.toBeNull();
    expect(container.querySelector("[data-quiz-cta-scan]")).not.toBeNull();
  });

  it("end slides use the larger brand-led top wordmark; quiz slides keep the full strip", () => {
    for (const slide of ["app-cta", "community"]) {
      cleanup();
      inject([fixture]);
      const { container } = renderHarness(`?q=t1&slide=${slide}&format=mobile-social`);
      const cta = container.querySelector("[data-quiz-cta]")!;
      expect(cta.getAttribute("data-quiz-cta-mode")).toBe("brand");
      // The small top line is gone; only the enlarged wordmark remains.
      expect(cta.textContent).not.toContain("Play more LoL quizzes");
      expect(cta.querySelector("img")!.className).toContain("h-24");
    }
    cleanup();
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    const cta = container.querySelector("[data-quiz-cta]")!;
    expect(cta.getAttribute("data-quiz-cta-mode")).toBe("top");
    expect(cta.textContent).toContain("mogzy.lol");
  });

  it("recap slide re-shows the question, reveals nothing, prompts the swipe", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=recap&state=correct&format=mobile-social&difficulty=iron");
    // recap forces the unanswered composition even if state=correct is passed.
    expect(choiceStates(container)).toEqual(["idle", "idle", "idle"]);
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    expect(container.querySelector("[data-quiz-recap-cta]")?.textContent).toMatch(/Swipe right/);
    // Difficulty still shown on recap.
    expect(container.querySelector("[data-quiz-difficulty]")).not.toBeNull();
  });

  it("community slide: hero + updated copy + social links, no answers", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=community&format=mobile-social");
    const slide = container.querySelector('[data-content-slide="community"]')!;
    expect(slide).not.toBeNull();
    // Hero art dominates the top.
    expect(slide.querySelector("[data-hero-mascot]")).not.toBeNull();
    // Competitive "stack up" copy — exact concise lines.
    expect(slide.textContent).toContain("See how your answers");
    expect(slide.textContent).toContain("stack up");
    expect(slide.textContent).toContain("Check the comments and compare answers");
    expect(slide.textContent).toContain("Think they’re wrong?");
    expect(slide.textContent).not.toContain("Let them know");
    // Social links row: neutral platform list, no invented handle/URL.
    const social = slide.querySelector("[data-social-links]")!;
    expect(social).not.toBeNull();
    expect(social.textContent).toMatch(/Follow Mogsy on/);
    ["TikTok", "Instagram", "YouTube", "Twitch"].forEach((p) =>
      expect(social.textContent).toContain(p),
    );
    // Consistent icon treatment: every platform entry carries an svg glyph
    // (TikTok uses a minimal inline SVG — lucide has no TikTok icon).
    const platformEntries = Array.from(social.querySelectorAll(".flex.items-center.gap-1"));
    expect(platformEntries.length).toBe(4);
    platformEntries.forEach((entry) => expect(entry.querySelector("svg")).not.toBeNull());
    expect(social.textContent).not.toMatch(/@/); // no @handle
    expect(container.querySelector("[data-quiz-choice]")).toBeNull();
  });

  it("end slides lead with the real hero PNG — no fabricated placeholder", () => {
    for (const slide of ["app-cta", "community"]) {
      cleanup();
      inject([fixture]);
      const { container } = renderHarness(`?q=t1&slide=${slide}&format=mobile-social`);
      const hero = container.querySelector(`[data-content-slide="${slide}"] [data-hero-mascot]`);
      expect(hero).not.toBeNull();
      // Real supplied artwork, rendered as an <img> (participates in QA).
      expect(hero!.tagName).toBe("IMG");
      expect(hero!.getAttribute("src")).toBe("/content/blitz-thinking.png");
      expect(hero!.className).toContain("object-contain");
      // The fabricated inline SVG placeholder must be gone.
      expect(container.querySelector("[data-hero-placeholder]")).toBeNull();
    }
  });

  it("question slide uses the direct 'Comment A, B, C, or D' CTA", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=mobile-social");
    expect(container.querySelector("[data-quiz-result-placeholder]")?.textContent).toContain(
      "Comment A, B, C, or D",
    );
  });

  it("rejects an unknown slide kind", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=banner&format=mobile-social");
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown slide/);
  });
});

describe("QuizRenderPage — multi-question challenge slides", () => {
  const second: RenderQuestion = {
    id: "t9",
    question_text: "Which item grants ability haste?",
    choices: [{ label: "Kindlegem" }, { label: "Ruby Crystal" }],
    correct_index: 0,
    category: "items",
  };

  it("opening slide: approved copy, hero, no answer information", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=opening&format=mobile-social");
    const slide = container.querySelector('[data-content-slide="opening"]')!;
    expect(slide).not.toBeNull();
    expect(slide.textContent).toMatch(/Test your/i);
    expect(slide.textContent).toMatch(/League knowledge/i);
    expect(slide.textContent).toContain("How many can you get right?");
    expect(slide.textContent).toContain("Keep score. No searching.");
    expect(slide.textContent).toContain("Swipe to begin →");
    expect(slide.querySelector("[data-hero-mascot]")).not.toBeNull();
    expect(container.querySelector("[data-quiz-choice]")).toBeNull();
    expect(slide.textContent).not.toContain("Thornmail");
    // Brand-led top area like the other end slides.
    expect(container.querySelector("[data-quiz-cta]")!.getAttribute("data-quiz-cta-mode")).toBe("brand");
  });

  it("ending slide: score prompt + app push + socials", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&slide=ending&format=mobile-social");
    const slide = container.querySelector('[data-content-slide="ending"]')!;
    expect(slide.textContent).toMatch(/How did you do\?/i);
    expect(slide.textContent).toContain("Comment your score below.");
    expect(slide.textContent).toContain("Challenge other players at");
    expect(slide.querySelector("[data-play-cta]")!.textContent).toContain("mogzy.lol");
    expect(slide.querySelector("[data-hero-mascot]")).not.toBeNull();
    expect(slide.querySelector("[data-social-links]")).not.toBeNull();
    expect(slide.textContent).not.toMatch(/@/);
  });

  it("summary slide: numbered rows with the actual correct answers", () => {
    inject([fixture, second]);
    const { container } = renderHarness(
      "?q=t1&slide=summary&format=mobile-social&qids=t1,t9&sumStart=0&sumPage=1&sumPages=1",
    );
    const slide = container.querySelector('[data-content-slide="summary"]')!;
    expect(slide.textContent).toContain("TODAY'S ANSWERS");
    const rows = slide.querySelectorAll("[data-summary-row]");
    expect(rows.length).toBe(2);
    // fixture: correct_index 1 → "B" / Thornmail; second: 0 → "A" / Kindlegem.
    expect(rows[0].querySelector("[data-summary-letter]")!.textContent).toBe("B");
    expect(rows[0].textContent).toContain("Thornmail");
    expect(rows[1].querySelector("[data-summary-letter]")!.textContent).toBe("A");
    expect(rows[1].textContent).toContain("Kindlegem");
    // Rows are fixed-height for consistent blueprint rhythm.
    rows.forEach((r) => expect((r as HTMLElement).style.height).toBe("64px"));
    // No pagination line for a single page.
    expect(slide.querySelector("[data-summary-page]")).toBeNull();
  });

  it("summary slide shows pagination and offset numbering on later pages", () => {
    inject([fixture, second]);
    const { container } = renderHarness(
      "?q=t1&slide=summary&format=mobile-social&qids=t9&sumStart=6&sumPage=2&sumPages=2",
    );
    const slide = container.querySelector('[data-content-slide="summary"]')!;
    expect(slide.querySelector("[data-summary-page]")!.textContent).toMatch(/2 of 2/);
    expect(slide.querySelector("[data-summary-row] span")!.textContent).toBe("7");
  });

  it("summary slide errors on unknown qids rather than fabricating rows", () => {
    inject([fixture]);
    const { container } = renderHarness(
      "?q=t1&slide=summary&format=mobile-social&qids=t1,missing",
    );
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/not found/);
  });

  it("challenge question slide: progress + lock-in instead of the comment CTA", () => {
    inject([fixture]);
    const { container } = renderHarness(
      "?q=t1&state=question&format=mobile-social&progress=2of5&difficulty=gold",
    );
    const cta = container.querySelector("[data-quiz-challenge-cta]")!;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/Question 2 of 5/i);
    expect(cta.textContent).toMatch(/Lock in your answer/i);
    // No comment prompt on challenge question slides.
    expect(container.textContent).not.toContain("Comment A, B, C, or D");
    // Progress element present for QA/tests.
    expect(container.querySelector("[data-challenge-progress]")).not.toBeNull();
    // Still no leakage.
    expect(choiceStates(container)).toEqual(["idle", "idle", "idle"]);
    expect(container.querySelector("[data-quiz-difficulty]")).not.toBeNull();
  });

  it("renders approved repeat-opener and mid-CTA copy variants", () => {
    inject([fixture]);
    const a = renderHarness(
      "?q=t1&state=question&format=mobile-social&progress=1of5&repeat=1",
    );
    expect(a.container.querySelector("[data-challenge-repeat]")!.textContent).toBe(
      "Already answered this one? Keep your original answer.",
    );
    cleanup();
    inject([fixture]);
    const b = renderHarness(
      "?q=t1&state=question&format=mobile-social&progress=3of5&mid=3",
    );
    expect(b.container.querySelector("[data-challenge-mid-cta]")!.textContent).toBe(
      "Halfway there. Lock in your score.",
    );
  });

  it("rejects malformed progress and unknown copy variants", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=question&format=mobile-social&progress=9of5");
    expect(a.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/progress/);
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=question&format=mobile-social&progress=1of5&repeat=9");
    expect(b.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/repeat/);
    cleanup();
    inject([fixture]);
    const c = renderHarness("?q=t1&state=question&format=mobile-social&repeat=1");
    expect(c.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/progress/);
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
