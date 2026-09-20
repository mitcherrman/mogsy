/**
 * ENVVIS1 — which ART an environment scene id draws.
 *
 * The frontend half of the scene channel. The backend
 * (`quiz/environment_scene_assets.py`) decides WHICH ROWS carry which scene id
 * and what that scene is called; this file decides what the id looks like. The
 * split is the one `jungleAtmosphere.ts` already makes for the Jungle Systems
 * ground: row mapping is a content decision, art is a layout decision.
 *
 * TWO LAYERS PER SCENE
 * ────────────────────
 * The art-wiring pass introduced a foreground. A scene is now:
 *
 *   background   the place, seated full-bleed behind the panel
 *   foreground   optional — one contextual object composited over it, drawn in
 *                the shared focal medallion the entity-subject cards use
 *
 * `base_fountain` is background-only. `lane_minion` and `lane_turret` share a
 * background and differ only in the foreground, which is why they are two ids
 * over one painting rather than one id with a flag: the id already names the
 * treatment, so this table stays a flat lookup with no conditionals in it.
 *
 * WHERE THE FOREGROUNDS COME FROM
 * ───────────────────────────────
 * Not from this repo. `assets/minions/caster.png` and
 * `assets/structures/turret.png` are the BACKEND's canonical registry art —
 * literally the same files `quiz.minion_assets` and `quiz.structure_assets`
 * resolve for the entity-subject rows — served through the same
 * `resolveQuizAssetUrl` every other backend icon goes through. That is the
 * owner's instruction taken exactly: use the minion art other minion questions
 * use, and the default turret art. A player sees one minion and one turret
 * across the whole environment domain instead of two of each.
 *
 * ── PLACEHOLDERS STILL IN PLACE ───────────────────────────────────────────
 * Both BACKGROUNDS are interim. The owner is providing the final fountain/base
 * and lane art; until it lands:
 *
 *   base_fountain  -> academy-hall.jpg        (a candlelit library interior)
 *   lane_minion    -> jungle_grass_background (an outdoor Rift ground)
 *   lane_turret    -> jungle_grass_background (the same)
 *
 * Neither is the place it claims to be. They are here so the wiring ships and
 * can be verified end to end; `interimBackground: true` marks each one, and
 * swapping them is a one-line change per row of this table with no contract,
 * card, test or backend change. The FOREGROUNDS are final — they are the
 * shipped registry art.
 */
import academyHall from "@/assets/ranked/academy-hall.jpg";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";

/** The art for one scene id, with its resolution state. */
export type EnvironmentSceneArt = {
  /** Full-bleed background. A module URL or a served path. */
  background: string;
  /** Optional contextual object drawn over it, already resolved to a URL. */
  foreground?: string;
  /** Accessible label for the foreground, when there is one. */
  foregroundAlt?: string;
  /** True while the BACKGROUND is borrowed art awaiting the owner's asset. */
  interimBackground: boolean;
};

/**
 * Backend-relative paths for the foregrounds. Named here rather than inlined
 * so the two canonical files this repo depends on are greppable, and so a
 * backend asset move shows up as one edit.
 */
const MINION_ART = "assets/minions/caster.png";
const TURRET_ART = "assets/structures/turret.png";

/**
 * Scene id -> art. An EXPLICIT table, matching the discipline the subject
 * readers use for their type sets: a backend scene id this repo has no art for
 * must resolve to null rather than to a broken image, so a vocabulary that
 * runs ahead of the art degrades to the compact band instead of shipping an
 * empty gold frame.
 */
const SCENE_ART: Record<string, EnvironmentSceneArt> = {
  base_fountain: {
    background: academyHall,
    interimBackground: true,
  },
  lane_minion: {
    background: JUNGLE_GRASS_BACKGROUND,
    foreground: resolveQuizAssetUrl(MINION_ART),
    foregroundAlt: "Minion",
    interimBackground: true,
  },
  lane_turret: {
    background: JUNGLE_GRASS_BACKGROUND,
    foreground: resolveQuizAssetUrl(TURRET_ART),
    foregroundAlt: "Turret",
    interimBackground: true,
  },
};

/** The art for one backend scene id, or null when this repo has none. */
export function resolveEnvironmentSceneArt(
  sceneId: string | null | undefined,
): EnvironmentSceneArt | null {
  if (typeof sceneId !== "string" || !sceneId) return null;
  return SCENE_ART[sceneId] ?? null;
}

/** Every scene id this repo can draw, sorted. Diagnostics and tests. */
export function supportedSceneIds(): string[] {
  return Object.keys(SCENE_ART).sort();
}

/**
 * Scene ids still drawing borrowed BACKGROUND art, sorted.
 *
 * Exported so the open asset swap is visible to a test rather than only to a
 * comment — the list shrinks to empty when the owner's art lands, and nothing
 * else has to change.
 */
export function interimBackgroundSceneIds(): string[] {
  return Object.entries(SCENE_ART)
    .filter(([, art]) => art.interimBackground)
    .map(([id]) => id)
    .sort();
}
