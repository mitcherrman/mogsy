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
 * ── ALL ART IS FINAL ──────────────────────────────────────────────────────
 * The owner supplied the two backgrounds on 2026-09-20 and both placeholders
 * are gone:
 *
 *   base_fountain  -> nexus.png   (was academy-hall.jpg, a library interior)
 *   lane_minion    -> lane.png    (was the jungle-grass ground)
 *   lane_turret    -> lane.png    (the same)
 *
 * `interimBackground` is kept as a field rather than deleted: it is how a
 * future scene added ahead of its art declares itself, and
 * `interimBackgroundSceneIds()` is asserted to be empty, so a placeholder
 * that shipped by accident fails a test instead of sitting unnoticed.
 *
 * The final art is MUCH brighter than the placeholder it replaced — mean
 * luminance 76.3 (lane) and 69.3 (nexus) against the hall's 27.5 — which is
 * why `ATMOSPHERE_SCENE_GROUND` was re-derived in the same change. See that
 * preset for the arithmetic.
 */
import laneScene from "@/assets/ranked/lane.png";
import nexusScene from "@/assets/ranked/nexus.png";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

/** The art for one scene id, with its resolution state. */
export type EnvironmentSceneArt = {
  /** Full-bleed background. A module URL or a served path. */
  background: string;
  /** Optional contextual object drawn over it, already resolved to a URL. */
  foreground?: string;
  /** Accessible label for the foreground, when there is one. */
  foregroundAlt?: string;
  /**
   * True while the BACKGROUND is borrowed art awaiting a final asset.
   *
   * `false` for every scene today. Kept as a field rather than removed so a
   * scene added ahead of its art can declare itself, and so
   * `interimBackgroundSceneIds()` stays a meaningful check rather than a
   * function that can only ever return nothing.
   */
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
    background: nexusScene,
    interimBackground: false,
  },
  lane_minion: {
    background: laneScene,
    foreground: resolveQuizAssetUrl(MINION_ART),
    foregroundAlt: "Minion",
    interimBackground: false,
  },
  lane_turret: {
    background: laneScene,
    foreground: resolveQuizAssetUrl(TURRET_ART),
    foregroundAlt: "Turret",
    interimBackground: false,
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
