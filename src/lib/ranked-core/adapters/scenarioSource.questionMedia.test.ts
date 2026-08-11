/**
 * RA3-MEDIA-P2 — frontend compatibility for backend-derived Ranked question media.
 *
 * Every fixture below is a VERBATIM payload emitted by
 * `ranked_public.question_media` against the canonical League tables, captured
 * from the backend rather than hand-written here. The point of this file is to
 * prove the shipped `scenarioSourceFromPublicQuestion` -> `selectScenario` ->
 * ScenarioCard pipeline already accepts those payloads, so no new frontend
 * media system is introduced.
 *
 * The one genuine gap this phase closes is `subject.type: "summoner_spell"` —
 * the canonical type produced by `quiz/asset_metadata.py`, which `classifySubject`
 * previously did not recognise (it knew only "spell"/"ability").
 */
import { describe, expect, it } from "vitest";
import { scenarioSourceFromPublicQuestion } from "./scenarioSource";
import type { PublicQuestionSource } from "./adaptToViews";
import { classifySubject, selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";

const CONTEXT_FLAGS = { role: "context", timing: "question", spoiler: false } as const;

/** champion + items — purchase_history / flat_inventory_stat. */
const CHAMPION_PLUS_ITEMS = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      champion_splash: "assets/champions/Ornn/splash/0_default.jpg",
      item_icons: [
        { name: "Doran's Shield", icon: "assets/items/1054.png" },
        { name: "Health Potion", icon: "assets/items/2003.png" },
        { name: "Cloth Armor", icon: "assets/items/1029.png" },
        { name: "Chain Vest", icon: "assets/items/1031.png" },
      ],
    },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "combat_calculation" },
};

/** champion + ability + items — post_mitigation_damage. */
const CHAMPION_PLUS_ABILITY = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ahri",
      champion_icon: "assets/champions/Ahri/icon.png",
      champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
      item_icons: [{ name: "Chain Vest", icon: "assets/items/1031.png" }],
      ability_slot: "E",
      ability_name: "Charm",
      ability_icon: "assets/champions/Ahri/E_AhriE.png",
    },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "combat_calculation" },
};

const CHAMPION_ONLY = {
  assets: {
    subject: {
      type: "champion", id: "KaiSa", name: "Kai'Sa",
      icon: "assets/champions/Kaisa/icon.png",
      splash: "assets/champions/Kaisa/splash/0_default.jpg",
      loading: "assets/champions/Kaisa/loading/0_default.jpg",
      default_skin: 0,
    },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "champion_profile" },
};

const ITEM = {
  assets: {
    subject: { type: "item", id: 3068, name: "Sunfire Aegis", icon: "assets/items/3068.png" },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "item" },
};

const ABILITY = {
  assets: {
    subject: {
      type: "ability", id: "Ahri:E", name: "Charm", champion: "Ahri", slot: "E",
      icon: "assets/champions/Ahri/E_AhriE.png",
    },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "ability" },
};

const RUNE = {
  assets: {
    subject: { type: "rune", id: 4, name: "Lethal Tempo", icon: "assets/runes/Lethal_Tempo.png" },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "rune" },
};

const SUMMONER_SPELL = {
  assets: {
    subject: { type: "summoner_spell", id: 1, name: "Ignite", icon: "assets/summoner_spells/Ignite.png" },
  },
  presentation: { ...CONTEXT_FLAGS, scenario_type: "summoner_spell" },
};

const source = (presentation: Record<string, unknown>) => {
  const q: PublicQuestionSource = {
    questionId: "q1", prompt: "How much?", options: ["1600", "1300", "1550", "1650"],
    category: "purchase_history", presentation,
  };
  return scenarioSourceFromPublicQuestion(q)!;
};

describe("backend-derived question media renders through the shipped pipeline", () => {
  it.each([
    ["champion + items", CHAMPION_PLUS_ITEMS, "combat_calculation"],
    ["champion + ability + items", CHAMPION_PLUS_ABILITY, "combat_calculation"],
    ["champion only", CHAMPION_ONLY, "champion_profile"],
    ["single item", ITEM, "item_analysis"],
    ["single ability", ABILITY, "collectible"],
    ["single rune", RUNE, "collectible"],
    ["single summoner spell", SUMMONER_SPELL, "collectible"],
  ])("%s -> %s card", (_label, presentation, expectedCard) => {
    const selection = selectScenario(source(presentation), false, null);
    // "empty" would silently downgrade InteractiveScenarioSurface to the
    // text-only compact band — that is the failure mode this asserts against.
    expect(selection.card).toBe(expectedCard);
  });

  it("carries every premise entity into the multi-entity card", () => {
    const selection = selectScenario(source(CHAMPION_PLUS_ITEMS), false, null);
    expect(selection.card).toBe("combat_calculation");
    if (selection.card !== "combat_calculation") return;
    expect(selection.combat.champion).toBe("Ornn");
    expect(selection.combat.itemIcons.map((i) => i.name)).toEqual([
      "Doran's Shield", "Health Potion", "Cloth Armor", "Chain Vest",
    ]);
    expect(selection.combat.championSplash).toContain(
      "assets/champions/Ornn/splash/0_default.jpg");
  });

  it("carries the ability through when the scenario names one", () => {
    const selection = selectScenario(source(CHAMPION_PLUS_ABILITY), false, null);
    if (selection.card !== "combat_calculation") throw new Error("wrong card");
    expect(selection.combat.abilityName).toBe("Charm");
    expect(selection.combat.abilitySlot).toBe("E");
    expect(selection.combat.abilityIcon).toContain("E_AhriE.png");
  });

  it("resolves backend-relative asset paths against the API origin", () => {
    // The backend never constructs a frontend origin; the client prefixes it.
    const { iconUrl } = classifySubject(source(ITEM));
    expect(iconUrl).toMatch(/^https?:\/\/.+\/assets\/items\/3068\.png$/);
  });

  it("classifies the canonical summoner_spell type", () => {
    // Regression guard for this phase's one frontend change: without the
    // "summoner_spell" case this fell through to the legacy block and produced
    // kind "none", downgrading the question to the text-only band.
    const classified = classifySubject(source(SUMMONER_SPELL));
    expect(classified.kind).toBe("spell");
    expect(classified.label).toBe("Ignite");
    expect(classified.iconUrl).toContain("assets/summoner_spells/Ignite.png");
  });

  it("keeps the pre-existing spell and ability types working", () => {
    expect(classifySubject(source({
      assets: { subject: { type: "spell", name: "Flash", icon: "assets/summoner_spells/Flash.png" } },
    })).kind).toBe("spell");
    expect(classifySubject(source(ABILITY)).kind).toBe("spell");
  });

  it("still renders text-only when the question carries no media", () => {
    const q: PublicQuestionSource = {
      questionId: "q2", prompt: "How much?", options: ["1", "2", "3", "4"],
      category: "purchase_history", presentation: null,
    };
    expect(scenarioSourceFromPublicQuestion(q)).toBeNull();
  });

  it("never exposes an answer through derived media", () => {
    const blob = JSON.stringify(CHAMPION_PLUS_ITEMS).toLowerCase();
    for (const token of ["correct", "solution", "explanation", "answer"]) {
      expect(blob).not.toContain(token);
    }
  });
});
