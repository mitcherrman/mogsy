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
  awkwardSmile: "/mascot/mogzy-awkward-smile-transparent.png",
  cheering: "/mascot/mogzy-cheering-transparent.png",
  chuckling: "/mascot/mogzy-chuckling-transparent.png",
  defeated: "/mascot/mogzy-defeated-transparent.png",
  explaining: "/mascot/mogzy-explaining-transparent.png",
  handUp: "/mascot/mogzy-hand-up-transparent.png",
  holdingBook: "/mascot/mogzy-holding-book-transparent.png",
  peeking: "/mascot/mogzy-peeking-transparent.png",
  raisingHand: "/mascot/mogzy-raising-hand-transparent.png",
  sad: "/mascot/mogzy-sad-transparent.png",
  sleeping: "/mascot/mogzy-sleeping-transparent.png",
  stop: "/mascot/mogzy-stop-transparent.png",
  thinking: "/mascot/mogzy-thinking-transparent.png",
} as const;

export type MogzyMascotPose = keyof typeof MOGZY_MASCOT_ASSETS;

/* -------------------------------------------------------------------------- */
/* RFX1 Phase 2B2 — small-surface derivatives                                 */
/* -------------------------------------------------------------------------- */

/**
 * A request for the SIZE of a plate, never for a different picture.
 *
 * `full` is the source art, which several surfaces draw large (the hub guide,
 * the welcome scenes, the lobby carousel). `compact` is the same drawing
 * re-encoded for a surface that renders it small — the HUD's 75px avatar, the
 * Rules scroll's 56px portrait, the arena's ~105px duelist. The derivative is
 * sized with headroom for a 3x display and NOTHING else changes: same crop,
 * same alpha, same facing.
 *
 * Every lookup FALLS BACK to the source, so adding a `compact` request to a
 * surface is always safe and a missing derivative is never a broken image.
 */
export type MogzyArtScale = "full" | "compact";

/** 192x288 WebP panel portraits: the three poses a small surface draws. */
export const MOGZY_MASCOT_ASSETS_COMPACT: Partial<Record<MogzyMascotPose, string>> = {
  base: "/mascot/mogzy-mascot-base-v1-240.webp",
  explaining: "/mascot/mogzy-explaining-transparent-192.webp",
  peeking: "/mascot/mogzy-peeking-transparent-192.webp",
  raisingHand: "/mascot/mogzy-raising-hand-transparent-192.webp",
};

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
  top: "/mascot/ranked/topmogzy.png",
  jungle: "/mascot/ranked/jgmogzy.png",
  mid: "/mascot/ranked/midmogzy.png",
  adc: "/mascot/ranked/botmogzy.png",
  support: "/mascot/ranked/supmogzy.png",
};

/**
 * RFX1 Phase 2B2 — the ARENA-sized plates.
 *
 * The lobby draws these figures nearly full-bleed on a parchment stage; the
 * arena draws the same five at roughly 43-105 CSS px. One 1254px PNG served
 * both, which cost a phone about 1.8 MB for the two duelists alone, inside the
 * entry window. These are 384px WebP re-encodes of the SAME artwork — same
 * crop, same alpha, same native facing (`MOGZY_ROLE_ART_FACING` applies
 * unchanged) — with headroom for a 3x phone and for the widest result-screen
 * slot. The originals stay exactly where a surface draws them big.
 */
export const MOGZY_ROLE_ASSETS_COMPACT: Record<RankedRole, string> = {
  top: "/mascot/ranked/topmogzy-384.webp",
  jungle: "/mascot/ranked/jgmogzy-384.webp",
  mid: "/mascot/ranked/midmogzy-384.webp",
  adc: "/mascot/ranked/botmogzy-384.webp",
  support: "/mascot/ranked/supmogzy-384.webp",
};

/** Path to the mascot art for a role. Total over the five canonical roles, so
 *  no surface ever has to fall back to the generic base portrait.
 *
 *  `scale` asks for a SIZE, not a different picture; see `MogzyArtScale`. */
export function getRankedRoleMascotPath(
  role: RankedRole,
  scale: MogzyArtScale = "full",
): string {
  return scale === "compact"
    ? MOGZY_ROLE_ASSETS_COMPACT[role] ?? MOGZY_ROLE_ASSETS[role]
    : MOGZY_ROLE_ASSETS[role];
}

/**
 * Which way each PLATE is drawn, before anything mirrors it.
 *
 * The five were not drawn to one convention, and the difference is not
 * cosmetic — it decides which way a mascot turns and therefore which way it
 * lunges. Read off the artwork, by the directional prop each character leads
 * with:
 *
 *   top      axe head extended to the viewer's LEFT, plume trailing right  -> LEFT
 *   jungle   dagger led low and forward on the LEFT, cape trailing right   -> LEFT
 *   mid      staff held forward on the viewer's LEFT, hat sweeping right   -> LEFT
 *   adc      bow drawn with the arrow pointing right                       -> right
 *   support  star wand extended to the viewer's right                      -> right
 *
 * The split is three/two, and it is read off the ARTWORK every time the plates
 * are redrawn — it is not a property of the role. Treating all five as
 * right-facing is what made a Mid duelist turn its back on the arena:
 * `facing="right"` left the plate untouched, so the mage kept facing out of
 * the column, and the mirrored opponent column pointed it the other way out.
 * Both columns were "wrong in the same way", which is why it read as the
 * opponent panel not mirroring. When the Ranked role art was replaced, `top`
 * and `jungle` came back drawn the other way round, so their entries moved
 * with the art rather than the art being re-cut to fit a stale map.
 *
 * A surface still says only which way it wants the mascot to FACE.
 * `RoleMascot` reconciles that with the plate; nothing outside this module
 * needs to know a plate ever had a native direction.
 */
export const MOGZY_ROLE_ART_FACING: Record<RankedRole, "left" | "right"> = {
  top: "left",
  jungle: "left",
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

export function getMogzyArtAssetPath(
  asset: MogzyArtAsset,
  scale: MogzyArtScale = "full",
): string {
  switch (asset.category) {
    case "mascot":
      return scale === "compact"
        ? MOGZY_MASCOT_ASSETS_COMPACT[asset.name] ?? MOGZY_MASCOT_ASSETS[asset.name]
        : MOGZY_MASCOT_ASSETS[asset.name];

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