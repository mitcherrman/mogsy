/**
 * ENVVIS1 Batch 1 — the environment SCENE channel, frontend half.
 *
 * WHAT THIS FILE CLAIMS
 * Three things, mirroring the backend suite
 * (`test_envvis1_environment_scene_media.py`):
 *
 *  1. A payload carrying `assets.scene` reaches the CINEMATIC environment card
 *     — not the 7rem compact context strip those rows drew before this batch,
 *     and not the bare "Mogsy" box.
 *  2. Nothing else moved. An entity-subject environment row renders exactly
 *     what it rendered before, and a row with neither channel still goes
 *     compact.
 *  3. A scene cannot state an answer. It has no focal medallion (there is no
 *     icon), no echo, and no field a number could arrive in.
 *
 * Payloads are written here rather than read from the visual-QA fixture,
 * because the fixture is a frozen capture that predates this channel. They are
 * the VERBATIM shape the backend emits — verified against
 * `presentation_for_question` output in the Batch 1 report — so a wire change
 * fails here rather than silently degrading the card.
 *
 * NOT asserted: computed pixel sizes. jsdom has no layout engine, so the
 * cinematic-vs-compact distinction is held through `resolveBandProfile` (the
 * single authority both the surface and the Content Factory read) and the
 * desktop/mobile evidence lives in the Batch 1 report.
 */
import { render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/quiz/api";
import { getEnvironmentScene, getEnvironmentSubject, selectScenario } from "./classify";
import { ScenarioCard } from "./ScenarioCard";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import { resolveCompactDensity } from "@/lib/question-surface/compactDensity";
import {
  resolveEnvironmentSceneArt,
  supportedSceneIds,
} from "@/lib/question-surface/environmentScenes";
import { ATMOSPHERE_SCENE_GROUND } from "./SubjectMediaComposition";

/** The exact `assets.scene` blob `resolve_environment_scene` emits. */
const BASE_SCENE = {
  type: "scene",
  id: "base_fountain",
  name: "The Base",
  caption: "Fountain & Base Area",
} as const;

const CONTEXT_FLAGS = { role: "context", timing: "question", spoiler: false } as const;

/** A scene row as it reaches the surface. Four real Batch 1 prompts. */
function sceneQuestion(
  overrides: { id?: string; prompt?: string; choices?: string[]; scene?: unknown } = {},
): QuizQuestion {
  return {
    id: overrides.id ?? "qq-fountain-health",
    category: "Game Fundamentals",
    question_text:
      overrides.prompt ??
      "Standing in the fountain, what percentage of your maximum health do you recover per second?",
    format: "multiple_choice",
    choices: overrides.choices ?? ["3%", "5%", "8%", "12%"],
    metadata: {
      assets: { scene: overrides.scene ?? BASE_SCENE },
      presentation: CONTEXT_FLAGS,
    },
  } as unknown as QuizQuestion;
}

/** An entity-subject environment row — the shape Batch 1 must not disturb. */
function subjectQuestion(): QuizQuestion {
  return {
    id: "qq-turret-plates",
    category: "Objectives",
    question_text: "How much gold does an outer turret plate award?",
    format: "multiple_choice",
    choices: ["125", "160", "175", "250"],
    metadata: {
      assets: {
        subject: {
          type: "structure",
          id: "turret",
          name: "Turret",
          icon: "assets/structures/turret.png",
        },
      },
      presentation: CONTEXT_FLAGS,
    },
  } as unknown as QuizQuestion;
}

/** A row Batch 2 owns: no subject, no scene. Must stay compact. */
function bareQuestion(): QuizQuestion {
  return {
    id: "qq-first-wave",
    category: "Minion Waves",
    question_text: "At what game time does the first minion wave spawn?",
    format: "multiple_choice",
    choices: ["0:30", "1:05", "1:30", "2:00"],
    metadata: { presentation: CONTEXT_FLAGS },
  } as unknown as QuizQuestion;
}

function renderCard(q: QuizQuestion, revealed = false, answer: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScenarioCard question={q} revealActive={revealed} correctAnswer={answer} />
    </QueryClientProvider>,
  );
}

// ── 6. the classifier recognises scene presentation ────────────────────────

describe("scene classification", () => {
  it("reads assets.scene into an EnvironmentScene", () => {
    const scene = getEnvironmentScene(sceneQuestion());
    expect(scene).toEqual({
      id: "base_fountain",
      name: "The Base",
      caption: "Fountain & Base Area",
      art: resolveEnvironmentSceneArt("base_fountain")!.src,
    });
  });

  it("does not read a scene as a SUBJECT", () => {
    // The channel separation, restated where a client would feel it: the
    // subject reader must see a scene row as a row with no premise media, the
    // way every client saw it before this batch.
    expect(getEnvironmentSubject(sceneQuestion())).toBeNull();
  });

  it("fails closed on a scene id this repo has no art for", () => {
    const unknown = sceneQuestion({ scene: { ...BASE_SCENE, id: "lane_river" } });
    expect(getEnvironmentScene(unknown)).toBeNull();
    // ...and the row degrades to the compact band rather than to an empty frame.
    expect(selectScenario(unknown, false, null).card).toBe("empty");
  });

  it("fails closed on a malformed or mistyped scene blob", () => {
    expect(getEnvironmentScene(sceneQuestion({ scene: { type: "subject", id: "base_fountain", name: "x" } }))).toBeNull();
    expect(getEnvironmentScene(sceneQuestion({ scene: { type: "scene", name: "The Base" } }))).toBeNull();
    expect(getEnvironmentScene(sceneQuestion({ scene: { type: "scene", id: "base_fountain" } }))).toBeNull();
    expect(getEnvironmentScene(bareQuestion())).toBeNull();
  });

  it("selects the environment_scene card, and reaches the CINEMATIC band", () => {
    const q = sceneQuestion();
    const selection = selectScenario(q, false, null);
    expect(selection.card).toBe("environment_scene");

    // The load-bearing claim of this batch. Before it, these rows produced no
    // scenario source at all (the Ranked adapter returns null without a
    // `presentation`), fell to `compact`, and drew the ~7rem academy strip
    // `resolveCompactDensity` hands the environment categories.
    expect(resolveBandProfile(q, "full", null)).toBe("cinematic");
    expect(resolveCompactDensity(q.category)).toBe("context"); // the strip it no longer takes
  });
});

// ── 7. the card renders the scene branch ───────────────────────────────────

describe("EnvironmentScenarioCard — scene branch", () => {
  it("draws the scene art full-bleed, with the shared composition", () => {
    const { container } = renderCard(sceneQuestion());
    const art = resolveEnvironmentSceneArt("base_fountain")!.src;

    const atmosphere = container.querySelector(`img[src="${art}"]`);
    expect(atmosphere).not.toBeNull();
    // Seated as a GROUND, not as the right-hand 54% crop an entity subject
    // sits beside: a scene card has no focal subject, so the art IS the
    // picture. See ATMOSPHERE_SCENE_GROUND.
    expect(atmosphere!.className).toBe(ATMOSPHERE_SCENE_GROUND.className);
    expect((atmosphere as HTMLElement).style.filter).toBe(ATMOSPHERE_SCENE_GROUND.filter);

    // The shared composition, by CALL and not by copy — same marker the
    // subject branch and the item/spell cards carry.
    expect(container.querySelector("[data-subject-media]")).not.toBeNull();
  });

  it("states the place and the caption, once each", () => {
    const { getAllByText } = renderCard(sceneQuestion());
    expect(getAllByText("The Base")).toHaveLength(1);
    expect(getAllByText("Fountain & Base Area")).toHaveLength(1);
    expect(getAllByText("Environment")).toHaveLength(1);
  });

  it("draws NO focal medallion and NO echo", () => {
    // The one deliberate difference from the subject branch. A scene row has
    // no entity and therefore no portrait; a medallion built around nothing
    // would be the gold-framed empty rectangle the composition exists to
    // remove. Both the focal image and the echo wash are the subject's own
    // icon, so a scene card must contain exactly one image: the atmosphere.
    const { container } = renderCard(sceneQuestion());
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("renders the same card for every Batch 1 mechanic", () => {
    // One scene serves fountain regen, the enemy Obelisk, Homeguard and death
    // timers — the backend's "these are one place, not four" decision, seen
    // from the renderer. Four different prompts, one card.
    const prompts = [
      "Standing in the fountain, what percentage of your maximum mana do you recover per second?",
      "How much raw damage per second does the enemy fountain deal?",
      "How long is Homeguard locked out after entering combat?",
      "Do death timers get longer as the game goes later?",
    ];
    prompts.forEach((prompt, index) => {
      // Scoped to this render's own container and unmounted after: the
      // default queries search the whole document, so four mounts left
      // standing would make "exactly one" read four.
      const { container, unmount } = renderCard(
        sceneQuestion({ id: `qq-scene-${index}`, prompt }),
      );
      expect(within(container).getAllByText("The Base")).toHaveLength(1);
      expect(container.querySelectorAll("img")).toHaveLength(1);
      unmount();
    });
  });
});

// ── 3 / 10. the scene cannot encode an answer ──────────────────────────────

describe("scene anti-spoiler", () => {
  it("renders no option text and no digits", () => {
    const choices = ["3%", "5%", "8%", "12%"];
    const { container } = renderCard(sceneQuestion({ choices }));
    const text = container.textContent ?? "";

    for (const choice of choices) expect(text).not.toContain(choice);
    // A place states no quantity. The card's whole foreground is the title and
    // the caption, both of which the backend registry reviewed.
    expect(text).not.toMatch(/\d/);
  });

  it("is identical before and after reveal", () => {
    // Reveal must not swap, add or remove scene media: the scene is premise
    // context, and `deriveRevealSubject` has no scene path by construction.
    const q = sceneQuestion();
    const before = selectScenario(q, false, null);
    const after = selectScenario(q, true, "5%");
    expect(after.card).toBe(before.card);
    expect(after).toEqual(before);

    const pre = renderCard(q).container.textContent;
    const post = renderCard(q, true, "5%").container.textContent;
    expect(post).toBe(pre);
  });

  it("does not vary with option order or option content", () => {
    const base = selectScenario(sceneQuestion(), false, null);
    const shuffled = selectScenario(
      sceneQuestion({ choices: ["12%", "8%", "5%", "3%"] }),
      false,
      null,
    );
    expect(shuffled).toEqual(base);
  });

  it("only declares art for reviewed scene ids", () => {
    // Batch 2's lane/wave scene is NOT here yet, deliberately: its safety
    // argument depends on exactly which units the art contains, and that
    // review has not happened.
    expect(supportedSceneIds()).toEqual(["base_fountain"]);
  });
});

// ── 8. entity-subject and media-free rows are unchanged ────────────────────

describe("regression — the rest of the environment family", () => {
  it("an entity-subject row still takes the subject card, with its portrait", () => {
    const q = subjectQuestion();
    expect(selectScenario(q, false, null).card).toBe("environment");
    expect(getEnvironmentScene(q)).toBeNull();

    const { container, getAllByText } = renderCard(q);
    expect(getAllByText("Turret").length).toBeGreaterThan(0);
    // Atmosphere + echo + focal icon: the three images the subject branch has
    // always drawn. A scene card draws one.
    expect(container.querySelectorAll("img").length).toBeGreaterThan(1);
  });

  it("a Batch 2 row still has no media at all", () => {
    const q = bareQuestion();
    expect(getEnvironmentScene(q)).toBeNull();
    expect(getEnvironmentSubject(q)).toBeNull();
    expect(selectScenario(q, false, null).card).toBe("empty");
    expect(resolveBandProfile(q, "full", null)).toBe("compact");
  });
});
