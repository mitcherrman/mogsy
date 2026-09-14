/**
 * ENV1 — the environment subject joins the shared subject-media composition.
 *
 * WHAT THIS FILE HOLDS
 * The claim of this pass is not "the minion card looks nicer". It is that the
 * environment family is drawn by the SAME SYSTEM as the item and the summoner
 * spell, rather than by a third composition that happens to resemble them. So
 * the assertions are mostly structural identity claims — this card calls the
 * shared parts, the echo is the subject's own art, the subject appears exactly
 * once — plus the two regression clauses the owner named: the item-primary
 * path and the summoner-spell path must be untouched.
 *
 * Payloads come from `scripts/quiz-screenshots/visual-qa-fixture.json`, the
 * same verbatim backend output the contract file reads, so a presentation
 * change fails here rather than silently degrading the card.
 *
 * NOT asserted: computed pixel sizes. jsdom has no layout engine, so the
 * `cqmin` / `--sc-fit` behaviour is held by the class contract below and
 * proved by the browser evidence in the ENV1 report.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/quiz/api";
import { selectScenario } from "./classify";
import { ScenarioCard } from "./ScenarioCard";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import {
  ATMOSPHERE_DIM_SCENE,
  ATMOSPHERE_TALL_CUTOUT,
  ATMOSPHERE_WIDE_SCENE,
} from "./SubjectMediaComposition";

type FixtureRow = {
  id: string;
  question_key: string;
  category: string;
  question_text: string;
  choices: string[];
  presentation?: Record<string, unknown>;
};

const FIXTURES = (
  JSON.parse(
    readFileSync(resolve("scripts/quiz-screenshots/visual-qa-fixture.json"), "utf8"),
  ) as { questions: FixtureRow[] }
).questions;

function source(id: string): QuizQuestion {
  const row = FIXTURES.find((q) => q.id === id);
  if (!row) throw new Error(`fixture ${id} missing`);
  return {
    id: row.id,
    category: row.category,
    question_text: row.question_text,
    format: "multiple_choice",
    choices: row.choices,
    metadata: row.presentation as QuizQuestion["metadata"],
  };
}

function renderCard(q: QuizQuestion, revealed = false, answer: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScenarioCard question={q} revealActive={revealed} correctAnswer={answer} />
    </QueryClientProvider>,
  );
}

/**
 * Comments legitimately DISCUSS the three structures — that is how the rule is
 * documented. The absence claim is about code, so comments are removed before
 * the scan rather than the claim being weakened to fit them.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The caster minion — the owner's first reported case. */
const CASTER = "vq-20";
/** The structure row — the owner's second reported case. */
const TURRETS = "vq-24";

// ───────────────────────────────────── the card is the SHARED composition

describe("ENV1 — environment subjects use the shared subject-media system", () => {
  it.each(["vq-19", "vq-20", "vq-21", "vq-22"])(
    "%s reaches the environment card, not the single-tile collectible",
    (id) => {
      const selection = selectScenario(source(id), false, null);
      expect(selection.card).toBe("environment");
      // The regression this pass exists to remove. `collectible` draws ONE
      // small framed tile in an otherwise empty panel — the pre-RIV2 item card.
      expect(selection.card).not.toBe("collectible");
    },
  );

  it("keeps the cinematic band it needs to draw a hero subject in", () => {
    expect(resolveBandProfile(source(CASTER), "band", null)).toBe("cinematic");
  });

  it("draws the focal subject through the shared composition, not a tile", () => {
    const { container } = renderCard(source(CASTER));
    // `data-subject-hero-icon` is set by SubjectMediaComposition's FocalIcon and
    // by nothing else, so its presence IS the proof this card is composed by
    // the shared system rather than by a look-alike of it.
    const hero = container.querySelector("[data-subject-hero-icon]");
    expect(hero).not.toBeNull();
    expect(hero?.getAttribute("src")).toContain("assets/minions/caster.png");
  });

  it("brings the whole composition, not just the big icon", () => {
    const { container } = renderCard(source(CASTER));
    // Both halves of the composition declare the sizing tokens; they are
    // SIBLINGS (backdrop + focal zone), which is why there are two.
    expect(container.querySelectorAll("[data-subject-media]").length).toBe(2);
  });

  it("derives the echo from the SAME art as the focal subject", () => {
    const { container } = renderCard(source(CASTER));
    const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
    const portrait = imgs.filter((src) => src.includes("assets/minions/caster.png"));
    // Exactly two: the focal icon and its oversized echo. The RIV2/RIV4
    // principle — the atmosphere is the only layer NOT driven by the subject.
    expect(portrait).toHaveLength(2);
  });

  it("never duplicates the foreground subject", () => {
    const { container } = renderCard(source(CASTER));
    expect(container.querySelectorAll("[data-subject-hero-icon]")).toHaveLength(1);
  });

  it("seats the atmosphere art in the panel, under the readability gradient", () => {
    const { container } = renderCard(source(CASTER));
    const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
    expect(imgs.some((src) => src.includes("academy-hall"))).toBe(true);
  });

  it("takes the item card's centred focal geometry, not the spell's beside one", () => {
    // `beside` exists for the SSM slice's source-row column. This caption is a
    // title and a kind line — a footer — so the zone must stay centred, which
    // is what makes this card and the item card the same picture.
    const { container } = renderCard(source(CASTER));
    expect(container.querySelector('[data-subject-focal="beside"]')).toBeNull();
  });
});

// ───────────────────────────────────── what the card is allowed to say

describe("ENV1 — the caption states identity and nothing measured", () => {
  it("names the class and the family", () => {
    const text = renderCard(source(CASTER)).container.textContent ?? "";
    expect(text).toContain("Caster Minion");
    expect(text.toUpperCase()).toContain("MINION");
  });

  it("does not print the kind line twice for a self-naming subject", () => {
    // "Caster Minion" already ends in the kind; only the badge states it.
    const text = renderCard(source(CASTER)).container.textContent ?? "";
    expect(text.toUpperCase().match(/MINION/g) ?? []).toHaveLength(2); // badge + name
  });

  it.each([
    ["vq-19", "430"],
    ["vq-20", "19.5"],
    ["vq-21", "7"],
    ["vq-22", "8"],
  ])("%s never prints its answer, before or at the reveal", (id, answer) => {
    for (const reveal of [false, true]) {
      const { container, unmount } = renderCard(source(id), reveal, answer);
      expect(container.textContent ?? "").not.toContain(answer);
      unmount();
    }
  });

  it("keeps the single-unit portrait, so a wave can never be counted from it", () => {
    // vq-21 asks how many minions a cannon wave holds. One portrait, one image
    // of it, one echo — the MAA1 Phase 4 rule, re-held at the new card.
    const { container } = renderCard(source("vq-21"));
    const portraits = [...container.querySelectorAll("img")].filter((i) =>
      (i.getAttribute("src") ?? "").includes("assets/minions/"),
    );
    expect(portraits).toHaveLength(2);
  });
});

// ───────────────────────────────────── the fallback is still honest

describe("ENV1 — an environment row with no art does not get a hero panel", () => {
  it("a SUBJECTLESS row stays compact rather than reserving an empty hero", () => {
    // vq-24 ("How many turrets does each team have?") carries no subject at
    // all — the fixture is a pre-MAA1-Phase-5 capture, from before the backend
    // had a reviewed structure map to resolve one from. It is kept exactly as
    // it is because it still proves the thing it was written to prove, which
    // was never "structures are undepictable": the composition is DRIVEN by
    // the subject's own portrait, so a row that arrives without one has no
    // picture to build, and a card assembled around a "?" tile would be the
    // giant empty rectangle wearing a gold frame. The same row WITH a Phase 5
    // structure subject is asserted in the structure describe block below.
    expect(source(TURRETS).metadata).toBeUndefined();
    expect(selectScenario(source(TURRETS), false, null).card).toBe("empty");
    expect(resolveBandProfile(source(TURRETS), "band", null)).toBe("compact");
  });

  it("a subject with a name but no icon is refused the card", () => {
    // Belt and braces on the reader's icon requirement: the card must never be
    // reachable in a state where its every layer has no input.
    const iconless: QuizQuestion = {
      ...source(CASTER),
      id: "env-no-icon",
      metadata: {
        assets: { subject: { type: "minion", id: "caster", name: "Caster Minion" } },
        presentation: { role: "context", timing: "question", spoiler: false },
      } as QuizQuestion["metadata"],
    };
    expect(selectScenario(iconless, false, null).card).toBe("empty");
    expect(resolveBandProfile(iconless, "band", null)).toBe("compact");
  });

  it("already accepts an OBJECTIVE payload, so the art workstream needs no frontend change", () => {
    // The forward half of the contract, and MAA1 Phase 5 is the proof it was
    // worth writing: `structure` art now exists and took this same card by
    // adding one member to the reader's type set. `objective` art does not yet
    // — assets/objectives/* and assets/monsters/* still 404 on the live
    // backend — so the kind stays in the set for the same reason it always
    // was: the moment the backend emits one, it takes this card with no edit
    // here. (The turret payload below is deliberately still typed `objective`;
    // the Phase 5 `structure` payloads are asserted in their own block.)
    const turret: QuizQuestion = {
      id: "env-objective",
      category: "Objectives",
      question_text: "How far from a turret does it stop protecting a champion?",
      format: "multiple_choice",
      choices: ["775", "875", "925", "1000"],
      metadata: {
        assets: {
          subject: {
            type: "objective",
            id: "turret_outer",
            name: "Outer Turret",
            icon: "assets/structures/turret_outer.png",
          },
        },
        presentation: { role: "context", timing: "question", spoiler: false },
      } as QuizQuestion["metadata"],
    };
    const selection = selectScenario(turret, false, null);
    expect(selection.card).toBe("environment");
    if (selection.card !== "environment") return;
    expect(selection.environment.kind).toBe("objective");
    expect(resolveBandProfile(turret, "band", null)).toBe("cinematic");

    const { container } = renderCard(turret);
    // The same composition, driven by the turret's own art: focal subject plus
    // its echo, and the OBJECTIVE kind line — "Outer Turret" does not end in
    // the kind, so unlike "Caster Minion" it keeps that line.
    expect(container.querySelector("[data-subject-hero-icon]")).not.toBeNull();
    const art = [...container.querySelectorAll("img")].filter((i) =>
      (i.getAttribute("src") ?? "").includes("assets/structures/turret_outer.png"),
    );
    expect(art).toHaveLength(2);
    const text = container.textContent ?? "";
    expect(text).toContain("Outer Turret");
    expect(text.toUpperCase()).toContain("OBJECTIVE");
    // The range is the answer; a generic diamond glyph is not a subject.
    expect(text).not.toContain("775");
  });

  it("does not claim a type it was not given", () => {
    // The reader matches an explicit set, so a plausibly-named future backend
    // type cannot acquire this card by accident.
    const other: QuizQuestion = {
      ...source(CASTER),
      id: "env-other",
      metadata: {
        assets: { subject: { type: "minion_wave", name: "Wave", icon: "assets/x.png" } },
      } as QuizQuestion["metadata"],
    };
    expect(selectScenario(other, false, null).card).not.toBe("environment");
  });
});


// ───────────────────────────────────── MAA1 Phase 5: structures

/**
 * The backend (`env1/subject-art`, `quiz/structure_assets.py`) resolves a
 * reviewed `(generation_family, entity_id)` table to one of three structures
 * and emits them in the SAME four fields `minion` and `objective` already use.
 *
 * Payloads are written out verbatim rather than taken from the visual-QA
 * fixture, because that fixture is a capture of the backend as it was BEFORE
 * this pass — vq-24 is the pre-Phase-5 shape of the very first row below, and
 * rewriting it would destroy the subjectless-row coverage it still carries.
 */
const STRUCTURE_PAYLOADS = [
  {
    entity: "turret",
    icon: "assets/structures/turret.png",
    name: "Turret",
    question_text: "How many turrets does each team have on Summoner's Rift?",
    choices: ["1", "2", "3", "11"],
    answer: "11",
  },
  {
    entity: "inhibitor",
    icon: "assets/structures/inhibitor.png",
    name: "Inhibitor",
    question_text: "How long does a destroyed inhibitor take to respawn?",
    choices: ["3 minutes", "4 minutes", "5 minutes", "6 minutes"],
    answer: "5 minutes",
  },
  {
    entity: "nexus",
    icon: "assets/structures/nexus.png",
    name: "Nexus",
    question_text: "How much health does the Nexus have?",
    choices: ["4000", "5500", "5000", "6000"],
    answer: "5500",
  },
] as const;

function structureQuestion(p: (typeof STRUCTURE_PAYLOADS)[number]): QuizQuestion {
  return {
    id: `env-structure-${p.entity}`,
    category: "Game Fundamentals",
    question_text: p.question_text,
    format: "multiple_choice",
    choices: [...p.choices],
    metadata: {
      assets: {
        subject: { type: "structure", id: p.entity, name: p.name, icon: p.icon },
      },
      presentation: { role: "context", timing: "question", spoiler: false },
    } as QuizQuestion["metadata"],
  };
}

describe("ENV1 — a structure subject takes the same cinematic card", () => {
  it.each(STRUCTURE_PAYLOADS.map((p) => [p.entity, p] as const))(
    "%s selects the environment card",
    (_entity, p) => {
      const selection = selectScenario(structureQuestion(p), false, null);
      expect(selection.card).toBe("environment");
      // Not the single-tile collectible, and not the compact strip: this is
      // the regression the pass exists to remove.
      expect(selection.card).not.toBe("collectible");
      expect(resolveBandProfile(structureQuestion(p), "band", null)).toBe("cinematic");
    },
  );

  it.each(STRUCTURE_PAYLOADS.map((p) => [p.entity, p] as const))(
    "%s draws the BACKEND-PROVIDED icon url and nothing derived from its id",
    (_entity, p) => {
      const { container } = renderCard(structureQuestion(p));
      const hero = container.querySelector("[data-subject-hero-icon]");
      expect(hero).not.toBeNull();
      // The exact path the backend sent, passed through the shared asset
      // resolver (which only prefixes the API base) and not reconstructed.
      expect(hero?.getAttribute("src")).toContain(p.icon);
      // Focal subject + echo, both from that one url: the composition is
      // driven by the subject's own art, as it is for every other subject.
      const art = [...container.querySelectorAll("img")].filter((i) =>
        (i.getAttribute("src") ?? "").includes(p.icon),
      );
      expect(art).toHaveLength(2);
    },
  );

  it("labels the FAMILY generically and takes the entity name from the payload", () => {
    for (const p of STRUCTURE_PAYLOADS) {
      const { container, unmount } = renderCard(structureQuestion(p));
      const text = container.textContent ?? "";
      expect(text).toContain(p.name);
      expect(text.toUpperCase()).toContain("STRUCTURE");
      unmount();
    }
  });

  it("never prints the answer, before or at the reveal", () => {
    for (const p of STRUCTURE_PAYLOADS) {
      for (const reveal of [false, true]) {
        const { container, unmount } = renderCard(structureQuestion(p), reveal, p.answer);
        expect(container.textContent ?? "").not.toContain(p.answer);
        unmount();
      }
    }
  });

  it("holds one generic turret subject, never a per-tier one", () => {
    // The backend's own rule: the approved wiki has ONE current turret render,
    // so outer/inner/inhibitor/nexus turret rows share the `turret` subject and
    // the PROMPT states the tier. If this repo ever grew a tier branch, it
    // would be asserting a distinction the source does not make.
    const outer = structureQuestion(STRUCTURE_PAYLOADS[0]);
    const nexusTurret: QuizQuestion = {
      ...outer,
      id: "env-structure-turret-nexus",
      question_text: "How much health does a Nexus turret have?",
      choices: ["2700", "3300", "4000", "4500"],
    };
    for (const q of [outer, nexusTurret]) {
      const selection = selectScenario(q, false, null);
      expect(selection.card).toBe("environment");
      if (selection.card !== "environment") return;
      expect(selection.environment.kind).toBe("structure");
      expect(selection.environment.name).toBe("Turret");
      expect(selection.environment.icon).toContain("assets/structures/turret.png");
    }
  });

  it("carries NO entity-to-art map anywhere in the frontend", () => {
    // The load-bearing claim of this pass. The backend owns entity identity ->
    // canonical art path; this repo must not hold a second, drifting copy. A
    // source scan is the only assertion that can actually prove an ABSENCE.
    const sources = [
      "classify.ts",
      "types.ts",
      "EnvironmentScenarioCard.tsx",
      "SubjectMediaComposition.tsx",
      "DefaultScenarioCard.tsx",
    ].map((f) =>
      readFileSync(resolve("src/components/quiz-broadcast/scenario-cards", f), "utf8"),
    );

    for (const src of sources) {
      // No hardcoded backend asset path.
      expect(src).not.toMatch(/assets\/structures\//);
      // No entity name used as a VALUE or a branch — the family name
      // "structure" is fine, the three entity names are not.
      for (const entity of ["turret", "inhibitor", "nexus"]) {
        expect(stripComments(src).toLowerCase()).not.toContain(entity);
      }
    }
  });

  it("an unsupported subject kind still fails closed", () => {
    // A plausibly-named neighbour of the new member must not inherit the card.
    for (const type of ["structure_tier", "building", "tower", "minion_wave"]) {
      const q: QuizQuestion = {
        ...structureQuestion(STRUCTURE_PAYLOADS[0]),
        id: `env-unsupported-${type}`,
        metadata: {
          assets: { subject: { type, id: "x", name: "X", icon: "assets/structures/turret.png" } },
        } as QuizQuestion["metadata"],
      };
      expect(selectScenario(q, false, null).card).not.toBe("environment");
    }
  });

  it("a structure with no icon is refused the card, like every other family", () => {
    const iconless: QuizQuestion = {
      ...structureQuestion(STRUCTURE_PAYLOADS[2]),
      id: "env-structure-no-icon",
      metadata: {
        assets: { subject: { type: "structure", id: "nexus", name: "Nexus" } },
      } as QuizQuestion["metadata"],
    };
    expect(selectScenario(iconless, false, null).card).toBe("empty");
    expect(resolveBandProfile(iconless, "band", null)).toBe("compact");
  });

  it("classifies a structure, so a structure-answer row can still be caught as a spoiler", () => {
    // The four rows whose ANSWER is a structure are refused a subject by the
    // backend. This is the frontend's independent lock: with `structure` in
    // `classifySubject`, the subject has a LABEL, so the generic
    // label-matches-a-choice rule sees it and hides the art.
    const spoiler: QuizQuestion = {
      ...structureQuestion(STRUCTURE_PAYLOADS[2]),
      id: "env-structure-spoiler",
      question_text: "Which structure must be destroyed to win the game?",
      choices: ["Nexus", "Inhibitor", "Outer Turret", "Fountain"],
      // No `presentation` block on purpose. Where the backend DOES declare one
      // it is the source of truth and this heuristic never runs — which is the
      // contract, not a gap. This asserts the fallback for a row that arrives
      // undeclared, which is the only case the frontend has to judge.
      metadata: {
        assets: {
          subject: {
            type: "structure",
            id: "nexus",
            name: "Nexus",
            icon: "assets/structures/nexus.png",
          },
        },
      } as QuizQuestion["metadata"],
    };
    expect(selectScenario(spoiler, false, "Nexus").card).not.toBe("environment");
  });
});

// ───────────────────────────────────── non-square art

describe("ENV1 — the focal subject preserves its aspect ratio", () => {
  it("fits the focal icon inside its square box instead of cropping it", () => {
    // Structure renders are the first non-square subjects this composition has
    // ever been handed: turret 485x992 (object-cover would remove 51.1% of its
    // height), nexus 978x799 (18.3% of its width). `object-contain` is the
    // generic fix — it preserves the ratio of ANY subject and singles out no
    // entity — and the box stays square because the medallion, rings, glow,
    // specks and pedestal are all laid out off that one length.
    const { container } = renderCard(structureQuestion(STRUCTURE_PAYLOADS[0]));
    const hero = container.querySelector("[data-subject-hero-icon]");
    expect(hero?.className).toContain("object-contain");
    expect(hero?.className).not.toContain("object-cover");
    expect(hero?.className).toContain("h-[var(--subject-hero-icon)]");
    expect(hero?.className).toContain("w-[var(--subject-hero-icon)]");
  });

  it("applies the same fit to every subject — it is not structure-specific", () => {
    // For a square source `contain` and `cover` are the identical rendering
    // (items 64x64, spells 64x64, minions 128x128), which is why this change
    // is a no-op for the approved cards rather than a re-approval of them.
    for (const id of [CASTER, "vq-15", "vq-17"]) {
      const { container, unmount } = renderCard(source(id));
      const hero = container.querySelector("[data-subject-hero-icon]");
      if (hero) expect(hero.className).not.toContain("object-cover");
      unmount();
    }
  });

  it("leaves the background echo on cover, deliberately", () => {
    // The echo is an oversized blurred wash anchored off the panel's corner —
    // cropped by the panel itself long before object-fit crops anything, and
    // `cover` preserves the ratio of what it does show. Contain would shrink a
    // tall subject's wash to a column and leave the panel's left flat.
    const { container } = renderCard(structureQuestion(STRUCTURE_PAYLOADS[0]));
    const echo = [...container.querySelectorAll("img")].find((i) =>
      (i.className ?? "").includes("--subject-echo"),
    );
    expect(echo?.className).toContain("object-cover");
  });
});

// ───────────────────────────────────── regression: items and spells

describe("ENV1 — the approved cards are untouched", () => {
  it("item-primary still renders its own card", () => {
    expect(selectScenario(source("vq-15"), false, null).card).toBe("item_analysis");
  });

  it("the item recipe / build-path question is untouched", () => {
    // Same payload shape RIV1's own scale test builds — the fixture's vq-04
    // row predates the presentation contract and carries no metadata, so the
    // recipe path has to be stated here to be asserted at all.
    const recipe: QuizQuestion = {
      id: "env1-recipe",
      category: "items",
      question_text: "Trinity Force builds from Sheen, Phage, and which other component?",
      format: "multiple_choice",
      choices: ["Kindlegem", "Ruby Crystal", "Cloth Armor", "Null-Magic Mantle"],
      metadata: {
        assets: { subject: { type: "item", name: "Trinity Force", icon: "assets/items/3078.png" } },
        presentation: { scenario_type: "item", role: "context", timing: "question", spoiler: false },
        known_components: ["Sheen", "Phage"],
        known_component_icons: [
          { name: "Sheen", icon: "assets/items/3057.png" },
          { name: "Phage", icon: "assets/items/3058.png" },
        ],
        missing_component_item_name: "Kindlegem",
        missing_component_icon: "assets/items/3067.png",
      } as QuizQuestion["metadata"],
    };
    const selection = selectScenario(recipe, false, null);
    expect(selection.card).toBe("item_analysis");
    if (selection.card !== "item_analysis") return;
    // The recipe tree's inputs, which this pass must not have altered.
    expect(selection.item.knownComponents.map((c) => c.name)).toEqual(["Sheen", "Phage"]);
    expect(selection.item.missingComponent?.name).toBe("Kindlegem");
  });

  it("the summoner spell still renders its own card", () => {
    expect(selectScenario(source("vq-17"), false, null).card).toBe("summoner_spell");
  });

  it("the combat-calculation control group has not moved", () => {
    expect(selectScenario(source("vq-14"), false, null).card).toBe("combat_calculation");
  });

  it("leaves both approved atmosphere presets exactly as they were", () => {
    // Prefer ADDING a preset over editing one: these two are what the item and
    // the spell are approved AT, so a change here is a change to shipped art.
    expect(ATMOSPHERE_TALL_CUTOUT).toEqual({
      className: "absolute bottom-[-8%] right-[-6%] h-[160%] w-auto max-w-none object-contain",
      filter: "saturate(0.85)",
      opacity: 0.64,
    });
    expect(ATMOSPHERE_WIDE_SCENE).toEqual({
      className: "absolute inset-y-0 right-0 h-full w-[54%] object-cover",
      filter: "brightness(0.38) saturate(0.8)",
      opacity: 0.58,
    });
  });

  it("the new preset shares the wide-scene GEOMETRY and differs only in exposure", () => {
    // The pairing the AtmosphereSeating type exists to keep together: same
    // crop, different tone normalisation, because the sources differ in
    // luminance (102.0 vs 27.5) and not in shape.
    expect(ATMOSPHERE_DIM_SCENE.className).toBe(ATMOSPHERE_WIDE_SCENE.className);
    expect(ATMOSPHERE_DIM_SCENE.filter).not.toBe(ATMOSPHERE_WIDE_SCENE.filter);
  });
});

// ───────────────────────────────────── responsive / short-band contract

describe("ENV1 — the short-band sizing contract", () => {
  it("sizes every layer off the shared height-aware tokens", () => {
    // The RIV1 lesson: raw `cqmin` collapses in the live Ranked band (cqmin is
    // ~1.8px there). This card must not introduce a single raw-cqmin size of
    // its own — it inherits `--subject-hero-icon` and friends, which step with
    // the BAND'S HEIGHT, by rendering the shared components.
    const { container } = renderCard(source(CASTER));
    const hero = container.querySelector("[data-subject-hero-icon]");
    expect(hero?.className).toContain("h-[var(--subject-hero-icon)]");
    expect(hero?.className).toContain("w-[var(--subject-hero-icon)]");

    const echo = [...container.querySelectorAll("img")].find((i) =>
      (i.className ?? "").includes("--subject-echo"),
    );
    expect(echo).toBeDefined();
    expect(echo?.getAttribute("src")).toContain("assets/minions/caster.png");
  });

  it("floors its caption type on --sc-fit rather than on cqmin alone", () => {
    const { container } = renderCard(source("vq-19"));
    const html = container.innerHTML;
    expect(html).toContain("var(--sc-fit)");
    // No bare `text-[Ncqmin]` anywhere: every type size in this card must carry
    // the `max(…, calc(M * var(--sc-fit)))` floor.
    expect(html).not.toMatch(/text-\[\d+(\.\d+)?cqmin\]/);
  });
});
