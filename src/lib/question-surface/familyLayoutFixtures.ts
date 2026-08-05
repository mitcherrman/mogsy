/**
 * Family-layout fixtures (RA7).
 *
 * Every payload here is the VERBATIM output of `ranked_public.question_media`
 * for a real checked-in candidate, run through the same
 * `scenarioSourceFromPublicQuestion` transport the live arena uses. That is the
 * point: a layout that only ever renders hand-written shapes proves nothing
 * about production, and the two families this phase redesigns are exactly the
 * ones whose payloads are least obvious (a two-sided premise; an item list
 * whose entries mean different things).
 *
 * Shared by the unit tests and the dev arena inspector so the pixels a reviewer
 * looks at and the DOM the tests assert on come from one source.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";

const source = (q: QuestionView, presentation: Record<string, unknown>): QuizQuestion =>
  scenarioSourceFromPublicQuestion({
    questionId: q.questionId,
    prompt: q.prompt,
    options: q.options.map((o) => o.label),
    category: q.category ?? null,
    presentation,
  })!;

const options = (labels: string[]) =>
  labels.map((label, index) => ({ id: String(index), index, label }));

const FLAGS = {
  scenario_type: "combat_calculation",
  role: "context",
  timing: "question",
  spoiler: false,
};

const champion = (
  name: string,
  role: string,
): Record<string, unknown> => ({
  type: "champion",
  id: name,
  name,
  role,
  icon: `assets/champions/${name}/icon.png`,
  splash: `assets/champions/${name}/splash/0_default.jpg`,
  loading: `assets/champions/${name}/loading/0_default.jpg`,
  default_skin: 0,
});

const item = (
  id: number,
  name: string,
  role: string,
  status?: string,
): Record<string, unknown> => ({
  type: "item",
  id,
  name,
  role,
  ...(status ? { status } : {}),
  icon: `assets/items/${id}.png`,
});

// --------------------------------------------------- post-mitigation damage

/** magic_vs_mr — a plain hit against a single stated magic resist. */
export const MAGIC_DAMAGE_Q: QuestionView = {
  questionId: "ra7-magic",
  category: "post_mitigation_damage",
  prompt:
    "Ahri hits Garen with Charm for 500 raw magic damage. Garen has 90 magic "
    + "resist. How much post-mitigation damage is dealt?",
  options: options(["263", "500", "410", "180"]),
};

export const MAGIC_DAMAGE_SCENARIO = source(MAGIC_DAMAGE_Q, {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ahri",
      champion_icon: "assets/champions/Ahri/icon.png",
      champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
      item_icons: [],
      ability_slot: "E",
      ability_name: "Charm",
      ability_icon: "assets/champions/Ahri/E_AhriE.png",
    },
    entities: {
      champions: [champion("Ahri", "attacker"), champion("Garen", "target")],
      items: [],
      abilities: [
        {
          type: "ability", id: "Ahri:E", name: "Charm", champion: "Ahri",
          slot: "E", role: "attacker",
          icon: "assets/champions/Ahri/E_AhriE.png",
        },
      ],
      runes: [],
      summoner_spells: [],
    },
    premise_facts: { damage_type: "magic", raw_damage: 500, target_resist: 90 },
  },
  presentation: FLAGS,
});

/** physical_after_purchase — the only sub-family stating a resist CHANGE. */
export const PHYSICAL_DAMAGE_Q: QuestionView = {
  questionId: "ra7-physical",
  category: "post_mitigation_damage",
  prompt:
    "Caitlyn's Piltover Peacemaker would deal 600 raw physical damage. Ahri "
    + "buys Chain Vest, raising armor from 60 to 100. How much less "
    + "post-mitigation damage does the hit deal after the purchase?",
  options: options(["64", "86", "75", "109"]),
};

export const PHYSICAL_DAMAGE_SCENARIO = source(PHYSICAL_DAMAGE_Q, {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Caitlyn",
      champion_icon: "assets/champions/Caitlyn/icon.png",
      champion_splash: "assets/champions/Caitlyn/splash/0_default.jpg",
      item_icons: [],
      ability_slot: "Q",
      ability_name: "Piltover Peacemaker",
      ability_icon: "assets/champions/Caitlyn/Q_CaitlynQ.png",
    },
    entities: {
      champions: [champion("Caitlyn", "attacker"), champion("Ahri", "target")],
      items: [item(1031, "Chain Vest", "target", "purchased")],
      abilities: [
        {
          type: "ability", id: "Caitlyn:Q", name: "Piltover Peacemaker",
          champion: "Caitlyn", slot: "Q", role: "attacker",
          icon: "assets/champions/Caitlyn/Q_CaitlynQ.png",
        },
      ],
      runes: [],
      summoner_spells: [],
    },
    premise_facts: {
      damage_type: "physical", raw_damage: 600,
      target_resist: 60, target_resist_after: 100,
    },
  },
  presentation: FLAGS,
});

/**
 * physical_after_chain_vest — an older accepted candidate whose ability is a
 * PASSIVE, so `champion_abilities` has no row and the backend resolves no
 * ability entity. A complete attacker→target premise all the same; before this
 * phase it rendered as a bare champion splash of the attacker.
 */
export const PASSIVE_DAMAGE_Q: QuestionView = {
  questionId: "ra7-passive",
  category: "post_mitigation_damage",
  prompt:
    "Jhin's Whisper (fourth shot) would deal 430 raw physical damage. Ahri "
    + "buys Chain Vest, raising armor from 21 to 61. How much less "
    + "post-mitigation damage does the hit deal after the purchase?",
  options: options(["58", "71", "64", "83"]),
};

export const PASSIVE_DAMAGE_SCENARIO = source(PASSIVE_DAMAGE_Q, {
  assets: {
    subject: champion("Jhin", "subject"),
    entities: {
      champions: [champion("Jhin", "attacker"), champion("Ahri", "target")],
      items: [item(1031, "Chain Vest", "target", "purchased")],
      abilities: [],
      runes: [],
      summoner_spells: [],
    },
    premise_facts: { damage_type: "physical", raw_damage: 430, target_resist: 21 },
  },
  presentation: { ...FLAGS, scenario_type: "champion_profile" },
});

/**
 * The SAME damage question as it was frozen before RA7: entities but no
 * premise facts. It must keep the presentation it has always had.
 */
export const LEGACY_DAMAGE_SCENARIO = source(MAGIC_DAMAGE_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Ahri",
      champion_icon: "assets/champions/Ahri/icon.png",
      champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
      item_icons: [], ability_slot: "E", ability_name: "Charm",
      ability_icon: "assets/champions/Ahri/E_AhriE.png",
    },
    entities: {
      champions: [champion("Ahri", "attacker"), champion("Garen", "target")],
      items: [], abilities: [], runes: [], summoner_spells: [],
    },
  },
  presentation: FLAGS,
});

// ------------------------------------------------- purchase / sell-swap

/** flat_inventory_stat with a sale — retained + purchased + sold. */
export const SELL_SWAP_Q: QuestionView = {
  questionId: "ra7-sell-swap",
  category: "flat_inventory_stat",
  prompt:
    "Ornn started with Doran's Shield and still has Sunfire Aegis. Later, Ornn "
    + "sold Doran's Shield and bought Abyssal Mask. How much flat health do "
    + "Ornn's items provide now?",
  options: options(["750", "810", "700", "800"]),
};

export const SELL_SWAP_SCENARIO = source(SELL_SWAP_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      champion_splash: "assets/champions/Ornn/splash/0_default.jpg",
      item_icons: [
        { name: "Sunfire Aegis", icon: "assets/items/3068.png" },
        { name: "Abyssal Mask", icon: "assets/items/8020.png" },
      ],
    },
    entities: {
      champions: [champion("Ornn", "subject")],
      items: [
        item(3068, "Sunfire Aegis", "subject", "retained"),
        item(8020, "Abyssal Mask", "subject", "purchased"),
        item(1054, "Doran's Shield", "subject", "sold"),
      ],
      abilities: [], runes: [], summoner_spells: [],
    },
  },
  presentation: FLAGS,
});

/** purchase_history — multiple starting items and multiple later purchases. */
export const PURCHASE_HISTORY_Q: QuestionView = {
  questionId: "ra7-purchase-history",
  category: "purchase_history",
  prompt:
    "Darius started with Doran's Blade and one Health Potion. Darius later "
    + "bought Phage and Kindlegem. How much gold has Darius spent in total?",
  options: options(["2400", "2500", "2450", "2300"]),
};

export const PURCHASE_HISTORY_SCENARIO = source(PURCHASE_HISTORY_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Darius",
      champion_icon: "assets/champions/Darius/icon.png",
      champion_splash: "assets/champions/Darius/splash/0_default.jpg",
      item_icons: [
        { name: "Doran's Blade", icon: "assets/items/1055.png" },
        { name: "Health Potion", icon: "assets/items/2003.png" },
        { name: "Phage", icon: "assets/items/3044.png" },
        { name: "Kindlegem", icon: "assets/items/3067.png" },
      ],
    },
    entities: {
      champions: [champion("Darius", "subject")],
      items: [
        item(1055, "Doran's Blade", "subject", "starting"),
        item(2003, "Health Potion", "subject", "starting"),
        item(3044, "Phage", "subject", "purchased"),
        item(3067, "Kindlegem", "subject", "purchased"),
      ],
      abilities: [], runes: [], summoner_spells: [],
    },
  },
  presentation: FLAGS,
});

/**
 * flat_inventory_stat with NO sale: every item is simply held. There is no
 * chronology to draw, so this must keep the existing presentation rather than
 * become a one-column "timeline".
 */
export const STATIC_INVENTORY_Q: QuestionView = {
  questionId: "ra7-static-inventory",
  category: "flat_inventory_stat",
  prompt:
    "Ahri has Malignance and Needlessly Large Rod. How much total flat ability "
    + "power does Ahri have from their items?",
  options: options(["155", "165", "175", "140"]),
};

export const STATIC_INVENTORY_SCENARIO = source(STATIC_INVENTORY_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Ahri",
      champion_icon: "assets/champions/Ahri/icon.png",
      champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
      item_icons: [
        { name: "Malignance", icon: "assets/items/3118.png" },
        { name: "Needlessly Large Rod", icon: "assets/items/1058.png" },
      ],
    },
    entities: {
      champions: [champion("Ahri", "subject")],
      items: [
        item(3118, "Malignance", "subject", "current"),
        item(1058, "Needlessly Large Rod", "subject", "current"),
      ],
      abilities: [], runes: [], summoner_spells: [],
    },
  },
  presentation: FLAGS,
});

/**
 * A hypothetical premise in which ONE item is both the starting item and the
 * sold item. The shipped backend de-duplicates by name within a collection so
 * this shape does not occur today; the layout must still collapse it onto one
 * entry rather than drawing the same icon in two columns.
 */
export const ITEM_HISTORY_SCENARIO = source(SELL_SWAP_Q, {
  assets: {
    entities: {
      champions: [champion("Ornn", "subject")],
      items: [
        item(1054, "Doran's Shield", "subject", "starting"),
        item(1054, "Doran's Shield", "subject", "sold"),
        item(8020, "Abyssal Mask", "subject", "purchased"),
      ],
      abilities: [], runes: [], summoner_spells: [],
    },
    subject: {
      type: "combat_cooldown", champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      item_icons: [{ name: "Abyssal Mask", icon: "assets/items/8020.png" }],
    },
  },
  presentation: FLAGS,
});
