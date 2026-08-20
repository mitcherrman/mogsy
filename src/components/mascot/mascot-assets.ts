/**
 * Canonical Mogzy product-art registry.
 *
 * Keep each character category separate:
 *
 * - Mascot poses: reactions and activities performed by Mogzy.
 * - Royal family: distinct named characters related to Mogzy.
 * - Ranked classes: combat archetypes used in competitive game surfaces.
 * - Companions: non-humanoid magical creatures.
 *
 * Do not treat family members, Ranked classes, or companions as Mogzy poses.
 */

import type { RankedRole } from "@/lib/ranked-public/roles";

/* -------------------------------------------------------------------------- */
/* Mogzy mascot poses                                                         */
/* -------------------------------------------------------------------------- */

export const MOGZY_MASCOT_ASSETS = {
  base: "/mascot/mogzy-mascot-base-v1.png",
  awkwardSmile: "/mascot/mogzy-awkward-smile.png",
  cheering: "/mascot/mogzy-cheering.png",
  chuckling: "/mascot/mogzy-chuckling.png",
  defeated: "/mascot/mogzy-defeated.png",
  explaining: "/mascot/mogzy-explaining.png",
  handUp: "/mascot/mogzy-hand-up.png",
  holdingBook: "/mascot/mogzy-holding-book.png",
  peeking: "/mascot/mogzy-peeking.png",
  raisingHand: "/mascot/mogzy-raising-hand.png",
  sad: "/mascot/mogzy-sad.png",
  sleeping: "/mascot/mogzy-sleeping.png",
  stop: "/mascot/mogzy-stop.png",
  thinking: "/mascot/mogzy-thinking.png",
} as const;

export type MogzyMascotPose = keyof typeof MOGZY_MASCOT_ASSETS;

/**
 * Product guidance for selecting a Mogzy pose.
 *
 * This is descriptive metadata for developers and implementation agents.
 * It is not intended as visible user-facing copy.
 */
export const MOGZY_MASCOT_USAGE = {
  base: {
    role: "neutral",
    description:
      "Default Mogzy appearance for introductions and general brand presence.",
  },
  awkwardSmile: {
    role: "recoverable-error",
    description:
      "Use for light, recoverable errors or mildly awkward empty states.",
  },
  cheering: {
    role: "celebration",
    description:
      "Use for correct answers, completed activities, wins, and milestones.",
  },
  chuckling: {
    role: "playful",
    description:
      "Use for playful moments, jokes, easter eggs, or lighthearted feedback.",
  },
  defeated: {
    role: "loss",
    description:
      "Use for a completed loss or failed challenge, not every wrong answer.",
  },
  explaining: {
    role: "instruction",
    description:
      "Use for tutorials, mechanic explanations, walkthroughs, and guidance.",
  },
  handUp: {
    role: "tip",
    description:
      "Use for optional tips, notices, or short informational callouts.",
  },
  holdingBook: {
    role: "knowledge",
    description:
      "Use for quizzes, Mastery Sets, League Docs, and educational content.",
  },
  peeking: {
    role: "teaser",
    description:
      "Use for locked content, previews, upcoming features, and discoveries.",
  },
  raisingHand: {
    role: "attention",
    description:
      "Use when Mogzy is actively drawing attention to an important point.",
  },
  sad: {
    role: "disappointment",
    description:
      "Use for meaningful disappointment or missing content, used sparingly.",
  },
  sleeping: {
    role: "inactive",
    description:
      "Use for paused, inactive, unavailable, or no-current-activity states.",
  },
  stop: {
    role: "warning",
    description:
      "Use for restrictions, blocked actions, or serious warning states.",
  },
  thinking: {
    role: "deliberation",
    description:
      "Use for loading, calculation, contemplation, or unanswered states.",
  },
} as const satisfies Record<
  MogzyMascotPose,
  {
    role: string;
    description: string;
  }
>;

/* -------------------------------------------------------------------------- */
/* Royal family                                                               */
/* -------------------------------------------------------------------------- */

export const MOGZY_FAMILY_ASSETS = {
  brother: "/mascot/family/mogzy-brother.png",
  king: "/mascot/family/mogzy-king.png",
  sister: "/mascot/family/mogzy-sister.png",
} as const;

export type MogzyFamilyCharacter = keyof typeof MOGZY_FAMILY_ASSETS;

export const MOGZY_FAMILY_METADATA = {
  brother: {
    name: "Mogzy's brother",
    role: "royal-family",
    description:
      "Mogzy's red brother. Use as a distinct story character, never as a Mogzy reaction pose.",
  },
  king: {
    name: "The King",
    role: "royal-family",
    description:
      "The purple crowned father of Mogzy and his brother. Use for royal-family and story scenes.",
  },
  sister: {
    name: "Mogzy's sister",
    role: "royal-family",
    description:
      "Mogzy's distant older sister. Use as a distinct story character.",
  },
} as const satisfies Record<
  MogzyFamilyCharacter,
  {
    name: string;
    role: "royal-family";
    description: string;
  }
>;

/* -------------------------------------------------------------------------- */
/* Ranked class characters                                                    */
/* -------------------------------------------------------------------------- */

export const MOGZY_CLASS_ASSETS = {
  tank: "/mascot/family/mogzy-tank.png",
  mage: "/mascot/family/mogzy-mage.png",
  marksman: "/mascot/family/mogzy-archer.png",
} as const;

export type MogzyClassCharacter = keyof typeof MOGZY_CLASS_ASSETS;

export const MOGZY_CLASS_METADATA = {
  tank: {
    name: "Tank",
    role: "ranked-class",
    description:
      "The durable shield-bearing Ranked class character. Use on Tank selection, progression, and combat surfaces.",
  },
  mage: {
    name: "Mage",
    role: "ranked-class",
    description:
      "The hooded magical Ranked class character. Use on Mage selection, progression, and combat surfaces.",
  },
  marksman: {
    name: "Marksman",
    role: "ranked-class",
    description:
      "The bow-bearing Ranked class character. Use on Marksman selection, progression, and combat surfaces.",
  },
} as const satisfies Record<
  MogzyClassCharacter,
  {
    name: string;
    role: "ranked-class";
    description: string;
  }
>;

/* -------------------------------------------------------------------------- */
/* Magical companions                                                         */
/* -------------------------------------------------------------------------- */

export const MOGZY_COMPANION_ASSETS = {
  familiar: "/mascot/family/mogzy-pet.png",
} as const;

export type MogzyCompanion = keyof typeof MOGZY_COMPANION_ASSETS;

export const MOGZY_COMPANION_METADATA = {
  familiar: {
    name: "Magical familiar",
    role: "companion",
    description:
      "A non-humanoid magical companion. Use as a familiar, pet, or supporting story creature.",
  },
} as const satisfies Record<
  MogzyCompanion,
  {
    name: string;
    role: "companion";
    description: string;
  }
>;

/* -------------------------------------------------------------------------- */
/* Ranked ROLE mascots (visual presentation only)                             */
/* -------------------------------------------------------------------------- */

/**
 * The ONE role -> mascot art mapping in the client.
 *
 * This is VISUAL PRESENTATION ONLY. A League role (Top/Jungle/Mid/ADC/Support)
 * is account identity; it is not a combat class, and this map does not make it
 * one. Every entry is its own dedicated role artwork, disjoint from the Ranked
 * class characters in `MOGZY_CLASS_ASSETS`: no role/class semantics may be
 * read out of this map in either direction, and nothing here feeds rating,
 * progression, XP, Elo, thresholds, crowns or RE1.
 *
 * Because a role is never communicated by mascot alone, every surface that
 * renders one of these MUST still render the role's label from
 * `RANKED_ROLE_LABELS`.
 */
export const MOGZY_ROLE_ASSETS: Record<RankedRole, string> = {
  top: "/mascot/family/top.png",
  jungle: "/mascot/family/jg.png",
  mid: "/mascot/family/mid.png",
  adc: "/mascot/family/bot.png",
  support: "/mascot/family/sup.png",
};

/** Path to the mascot art for a role. Total over the five canonical roles, so
 *  no surface ever has to fall back to the generic base portrait. */
export function getRankedRoleMascotPath(role: RankedRole): string {
  return MOGZY_ROLE_ASSETS[role];
}

/**
 * Which way each PLATE is drawn, before anything mirrors it.
 *
 * The five were not drawn to one convention, and the difference is not
 * cosmetic — it decides which way a mascot turns and therefore which way it
 * lunges. Read off the artwork, by the directional prop each character leads
 * with:
 *
 *   top      sword extended to the viewer's right, orb hand trailing left  -> right
 *   jungle   lead dagger low and forward on the right, rear dagger behind  -> right
 *   mid      staff held forward on the viewer's LEFT, hood sweeping right  -> LEFT
 *   adc      bow drawn with the arrow pointing right                       -> right
 *   support  shield forward on the viewer's right, body leaning off it     -> right
 *
 * `mid` is the odd one out, and treating all five as right-facing is what made
 * a Mid duelist turn its back on the arena: `facing="right"` left the plate
 * untouched, so the mage kept facing out of the column, and the mirrored
 * opponent column pointed it the other way out. Both columns were "wrong in
 * the same way", which is why it read as the opponent panel not mirroring.
 *
 * A surface still says only which way it wants the mascot to FACE.
 * `RoleMascot` reconciles that with the plate; nothing outside this module
 * needs to know a plate ever had a native direction.
 */
export const MOGZY_ROLE_ART_FACING: Record<RankedRole, "left" | "right"> = {
  top: "right",
  jungle: "right",
  mid: "left",
  adc: "right",
  support: "right",
};

/** Which way this role's untouched artwork looks. */
export function getRankedRoleArtFacing(role: RankedRole): "left" | "right" {
  return MOGZY_ROLE_ART_FACING[role];
}

/* -------------------------------------------------------------------------- */
/* Generic typed product-art API                                              */
/* -------------------------------------------------------------------------- */

export type MogzyArtAsset =
  | {
      category: "mascot";
      name: MogzyMascotPose;
    }
  | {
      category: "family";
      name: MogzyFamilyCharacter;
    }
  | {
      category: "class";
      name: MogzyClassCharacter;
    }
  | {
      category: "companion";
      name: MogzyCompanion;
    };

export function getMogzyArtAssetPath(asset: MogzyArtAsset): string {
  switch (asset.category) {
    case "mascot":
      return MOGZY_MASCOT_ASSETS[asset.name];

    case "family":
      return MOGZY_FAMILY_ASSETS[asset.name];

    case "class":
      return MOGZY_CLASS_ASSETS[asset.name];

    case "companion":
      return MOGZY_COMPANION_ASSETS[asset.name];

    default:
      return assertNever(asset);
  }
}

export function getMogzyArtDefaultAlt(asset: MogzyArtAsset): string {
  switch (asset.category) {
    case "mascot":
      return "Mogzy";

    case "family":
      return MOGZY_FAMILY_METADATA[asset.name].name;

    case "class":
      return `${MOGZY_CLASS_METADATA[asset.name].name} class character`;

    case "companion":
      return MOGZY_COMPANION_METADATA[asset.name].name;

    default:
      return assertNever(asset);
  }
}

export function isMogzyMascotPose(
  value: string,
): value is MogzyMascotPose {
  return value in MOGZY_MASCOT_ASSETS;
}

export function isMogzyFamilyCharacter(
  value: string,
): value is MogzyFamilyCharacter {
  return value in MOGZY_FAMILY_ASSETS;
}

export function isMogzyClassCharacter(
  value: string,
): value is MogzyClassCharacter {
  return value in MOGZY_CLASS_ASSETS;
}

export function isMogzyCompanion(
  value: string,
): value is MogzyCompanion {
  return value in MOGZY_COMPANION_ASSETS;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Mogzy art asset: ${JSON.stringify(value)}`);
}