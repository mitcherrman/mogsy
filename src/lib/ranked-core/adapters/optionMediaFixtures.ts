/**
 * Backend-generated ANSWER-OPTION media fixtures (RA6).
 *
 * Every payload here was DUMPED VERBATIM from the backend, by running the
 * shipped placeholder cards through `ranked_public.option_media` and
 * `QuestionRecord.public_view()`. Nothing is hand-shaped, so a backend contract
 * change (a renamed key, a different icon path, an entity type the frontend
 * cannot classify) breaks these tests instead of silently reaching production.
 *
 * The `numeric` case is the control: a real calculation card, with premise
 * media and NO option media, exactly as it ships today.
 */

/** The raw `question` object of a public-round payload, as the backend emits it. */
export type BackendQuestionPayload = {
  question_id: string;
  prompt: string;
  options: string[];
  category: string | null;
  presentation?: Record<string, unknown>;
  option_media?: { type: string; name: string; icon: string; id?: string | number }[];
};

/** Item options — the shipped recipe card. Premise media AND option media. */
export const ITEM_OPTION_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-rm-recipe",
  prompt: "Trinity Force builds from Sheen, Phage, and which other component?",
  options: ["Kindlegem", "Ruby Crystal", "Cloth Armor", "Null-Magic Mantle"],
  category: "item_recipe",
  presentation: {
    assets: {
      subject: { type: "item", name: "Trinity Force", icon: "assets/items/3078.png" },
    },
    known_components: ["Sheen", "Phage"],
    known_component_icons: [
      { name: "Sheen", icon: "assets/items/3057.png" },
      { name: "Phage", icon: "assets/items/3044.png" },
    ],
    presentation: {
      scenario_type: "item", timing: "question", role: "context", spoiler: false,
    },
  },
  option_media: [
    { type: "item", id: 3067, name: "Kindlegem", icon: "assets/items/3067.png" },
    { type: "item", id: 1028, name: "Ruby Crystal", icon: "assets/items/1028.png" },
    { type: "item", id: 1029, name: "Cloth Armor", icon: "assets/items/1029.png" },
    { type: "item", id: 1033, name: "Null-Magic Mantle", icon: "assets/items/1033.png" },
  ],
};

/** Champion options. Option media only — the scenario band stays text-only. */
export const CHAMPION_OPTION_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-om-champion",
  prompt: "Which of these champions has an ability named Decimate?",
  options: ["Garen", "Sett", "Darius", "Mordekaiser"],
  category: "champion_identity",
  option_media: [
    { type: "champion", id: "Garen", name: "Garen", icon: "assets/champions/Garen/icon.png" },
    { type: "champion", id: "Sett", name: "Sett", icon: "assets/champions/Sett/icon.png" },
    { type: "champion", id: "Darius", name: "Darius", icon: "assets/champions/Darius/icon.png" },
    { type: "champion", id: "Mordekaiser", name: "Mordekaiser", icon: "assets/champions/Mordekaiser/icon.png" },
  ],
};

/**
 * Ability options. Every icon is the SLOT-NEUTRAL backend route, never an
 * `assets/champions/**\/Q_*.png` path — the on-disk filename starts with the
 * slot, which for a "which of these is the ultimate?" question is the answer.
 */
export const ABILITY_OPTION_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-om-ability",
  prompt: "Which of these Darius abilities is his ultimate?",
  options: ["Decimate", "Crippling Strike", "Apprehend", "Noxian Guillotine"],
  category: "champion_ability_identity",
  option_media: [
    { type: "ability", id: "Darius:Decimate", name: "Decimate", icon: "api/ranked/media/ability-icon/Darius/Decimate.png" },
    { type: "ability", id: "Darius:Crippling Strike", name: "Crippling Strike", icon: "api/ranked/media/ability-icon/Darius/Crippling%20Strike.png" },
    { type: "ability", id: "Darius:Apprehend", name: "Apprehend", icon: "api/ranked/media/ability-icon/Darius/Apprehend.png" },
    { type: "ability", id: "Darius:Noxian Guillotine", name: "Noxian Guillotine", icon: "api/ranked/media/ability-icon/Darius/Noxian%20Guillotine.png" },
  ],
};

export const RUNE_OPTION_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-om-rune",
  prompt: "Which of these keystones belongs to the Domination tree?",
  options: ["Conqueror", "Electrocute", "Fleet Footwork", "Press the Attack"],
  category: "rune_identity",
  option_media: [
    { type: "rune", id: 2, name: "Conqueror", icon: "assets/runes/Conqueror.png" },
    { type: "rune", id: 11, name: "Electrocute", icon: "assets/runes/Electrocute.png" },
    { type: "rune", id: 3, name: "Fleet Footwork", icon: "assets/runes/Fleet_Footwork.png" },
    { type: "rune", id: 1, name: "Press the Attack", icon: "assets/runes/Press_the_Attack.png" },
  ],
};

export const SUMMONER_SPELL_OPTION_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-om-summoner-spell",
  prompt: "Which of these summoner spells is classified as a mobility spell?",
  options: ["Ghost", "Ignite", "Barrier", "Exhaust"],
  category: "summoner_spell_identity",
  option_media: [
    { type: "summoner_spell", id: 4, name: "Ghost", icon: "assets/summoner_spells/Ghost.png" },
    { type: "summoner_spell", id: 1, name: "Ignite", icon: "assets/summoner_spells/Ignite.png" },
    { type: "summoner_spell", id: 2, name: "Barrier", icon: "assets/summoner_spells/Barrier.png" },
    { type: "summoner_spell", id: 5, name: "Exhaust", icon: "assets/summoner_spells/Exhaust.png" },
  ],
};

/**
 * CONTROL: a live calculation card. Quantity options, so the backend emits no
 * option media at all, and its premise media is byte-identical to what ships
 * today (RA3-MEDIA-P4 entity collection included).
 */
export const NUMERIC_QUESTION: BackendQuestionPayload = {
  question_id: "placeholder-000",
  prompt:
    "Darius started with Doran's Blade and one Health Potion. Darius later bought Phage and Kindlegem. How much gold has Darius spent in total?",
  options: ["2400", "2500", "2450", "2300"],
  category: "purchase_history_total",
  presentation: {
    assets: {
      subject: {
        type: "combat_cooldown",
        champion: "Darius",
        champion_icon: "assets/champions/Darius/icon.png",
        item_icons: [
          { name: "Doran's Blade", icon: "assets/items/1055.png" },
          { name: "Health Potion", icon: "assets/items/2003.png" },
          { name: "Phage", icon: "assets/items/3044.png" },
          { name: "Kindlegem", icon: "assets/items/3067.png" },
        ],
        champion_splash: "assets/champions/Darius/splash/0_default.jpg",
      },
      entities: {
        champions: [{
          type: "champion", id: "Darius", name: "Darius",
          icon: "assets/champions/Darius/icon.png",
          splash: "assets/champions/Darius/splash/0_default.jpg",
          loading: "assets/champions/Darius/loading/0_default.jpg",
          default_skin: 0, role: "subject",
        }],
        items: [
          { type: "item", id: 1055, name: "Doran's Blade", icon: "assets/items/1055.png", role: "subject", status: "starting" },
          { type: "item", id: 2003, name: "Health Potion", icon: "assets/items/2003.png", role: "subject", status: "starting" },
          { type: "item", id: 3044, name: "Phage", icon: "assets/items/3044.png", role: "subject", status: "purchased" },
          { type: "item", id: 3067, name: "Kindlegem", icon: "assets/items/3067.png", role: "subject", status: "purchased" },
        ],
        abilities: [], runes: [], summoner_spells: [],
      },
    },
    presentation: {
      role: "context", timing: "question", spoiler: false,
      scenario_type: "combat_calculation",
    },
  },
};

export const OPTION_MEDIA_QUESTIONS = {
  item: ITEM_OPTION_QUESTION,
  champion: CHAMPION_OPTION_QUESTION,
  ability: ABILITY_OPTION_QUESTION,
  rune: RUNE_OPTION_QUESTION,
  summoner_spell: SUMMONER_SPELL_OPTION_QUESTION,
} as const;
