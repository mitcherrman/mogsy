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
  interimBackgroundSceneIds,
  resolveEnvironmentSceneArt,
  supportedSceneIds,
} from "@/lib/question-surface/environmentScenes";
import { ATMOSPHERE_SCENE_GROUND } from "./SubjectMediaComposition";

/** The exact `assets.scene` blobs `resolve_environment_scene` emits. */
const BASE_SCENE = {
  type: "scene",
  id: "base_fountain",
  name: "The Base",
  caption: "Fountain & Base Area",
} as const;

const LANE_MINION_SCENE = {
  type: "scene",
  id: "lane_minion",
  name: "The Lane",
  caption: "Minion Wave",
} as const;

const LANE_TURRET_SCENE = {
  type: "scene",
  id: "lane_turret",
  name: "The Lane",
  caption: "Lane Structures",
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
  it("reads a background-only scene into an EnvironmentScene", () => {
    const scene = getEnvironmentScene(sceneQuestion());
    expect(scene).toEqual({
      id: "base_fountain",
      name: "The Base",
      caption: "Fountain & Base Area",
      art: resolveEnvironmentSceneArt("base_fountain")!.background,
    });
    // No foreground: base_fountain is background-only today.
    expect(scene!.foreground).toBeUndefined();
  });

  it("reads a two-layer scene, background plus foreground", () => {
    for (const blob of [LANE_MINION_SCENE, LANE_TURRET_SCENE]) {
      const art = resolveEnvironmentSceneArt(blob.id)!;
      const scene = getEnvironmentScene(sceneQuestion({ scene: blob }));
      expect(scene).toEqual({
        id: blob.id,
        name: blob.name,
        caption: blob.caption,
        art: art.background,
        foreground: art.foreground,
        foregroundAlt: art.foregroundAlt,
      });
    }
  });

  it("points the foregrounds at the backend's own canonical registry art", () => {
    // The owner's instruction, held as a test: the minion art is the art other
    // minion questions use, and the turret art is the default turret. Both are
    // the files `quiz.minion_assets` / `quiz.structure_assets` resolve for the
    // entity-subject rows, so a player sees one of each across the domain.
    expect(resolveEnvironmentSceneArt("lane_minion")!.foreground)
      .toContain("assets/minions/caster.png");
    expect(resolveEnvironmentSceneArt("lane_turret")!.foreground)
      .toContain("assets/structures/turret.png");
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
    const art = resolveEnvironmentSceneArt("base_fountain")!.background;

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

  it("draws NO focal medallion for a background-only scene", () => {
    // A medallion built around nothing would be the gold-framed empty
    // rectangle the composition exists to remove. The echo is also absent in
    // both shapes, so a background-only card contains exactly one image.
    const { container } = renderCard(sceneQuestion());
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("draws the foreground in the shared focal medallion, and no echo", () => {
    for (const blob of [LANE_MINION_SCENE, LANE_TURRET_SCENE]) {
      const art = resolveEnvironmentSceneArt(blob.id)!;
      const { container, unmount } = renderCard(
        sceneQuestion({ id: `qq-${blob.id}`, scene: blob }),
      );
      // Exactly two images: the background and the foreground. A third would
      // be the echo wash, which a scene card must not draw — the background
      // already fills the panel.
      const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
      expect(imgs).toHaveLength(2);
      expect(imgs).toContain(art.background);
      expect(imgs).toContain(art.foreground);
      unmount();
    }
  });

  it("renders the approved treatment for a representative row of each group", () => {
    const cases: Array<[string, typeof BASE_SCENE | typeof LANE_MINION_SCENE | typeof LANE_TURRET_SCENE, string, number]> = [
      ["Standing in the fountain, what percentage of your maximum health do you recover per second?", BASE_SCENE, "The Base", 1],
      ["Which minion has the most health?", LANE_MINION_SCENE, "The Lane", 2],
      ["Which turrets can gain Crystalline Overgrowth?", LANE_TURRET_SCENE, "The Lane", 2],
    ];
    cases.forEach(([prompt, blob, title, imageCount], index) => {
      const { container, unmount } = renderCard(
        sceneQuestion({ id: `qq-group-${index}`, prompt, scene: blob }),
      );
      expect(within(container).getAllByText(title)).toHaveLength(1);
      expect(within(container).getAllByText(blob.caption)).toHaveLength(1);
      expect(container.querySelectorAll("img")).toHaveLength(imageCount);
      unmount();
    });
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

  it("declares art for exactly the three approved treatments", () => {
    expect(supportedSceneIds()).toEqual(["base_fountain", "lane_minion", "lane_turret"]);
  });

  it("records which backgrounds are still placeholders", () => {
    // The open asset swap, visible to a test rather than only to a comment.
    // This list shrinks to [] when the owner's fountain and lane art land, and
    // nothing else has to change. Foregrounds are NOT interim — they are the
    // shipped backend registry art.
    expect(interimBackgroundSceneIds()).toEqual([
      "base_fountain", "lane_minion", "lane_turret",
    ]);
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
