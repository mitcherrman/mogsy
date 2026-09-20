/**
 * ENVVIS1 Batch 1 — which ATMOSPHERE an environment scene id draws.
 *
 * The frontend half of the scene channel. The backend
 * (`quiz/environment_scene_assets.py`) decides WHICH ROWS may carry a scene
 * and what that scene is called; this file decides what the scene looks like.
 * The split is deliberate and is the same one `jungleAtmosphere.ts` already
 * makes for the Jungle Systems ground: identity and safety are backend
 * decisions with an answer in them, art is a layout decision with none.
 *
 * WHAT A SCENE IS, AND WHAT IT IS NOT
 * ───────────────────────────────────
 * A scene arrives on `assets.scene`, never on `assets.subject`. It says "this
 * round happens HERE", not "this round is about this thing". That is the
 * weaker of the two claims and it is the only one these rows can support:
 * they ask about the fountain's regeneration rate, Homeguard's lockout, the
 * enemy Obelisk's damage and how death timers scale, and every one of those
 * answers is a duration, a percentage, a time or a yes/no. A place states
 * none of them.
 *
 * So the art rule for anything added here is narrow: it may depict a LOCATION
 * and nothing else. No numerals, no clocks reading a time, no health or mana
 * bars, no buff icons, no tooltips, no team colour that would name a side —
 * the backend's `SCENE_NEUTRALITY` note records why the last one matters (two
 * of the thirteen Batch 1 rows ask about the ENEMY fountain while the other
 * eleven ask about your own, so one atmosphere serves both and no per-side
 * variant is drawn).
 *
 * ── INTERIM ART, AND IT IS TRACKED AS SUCH ────────────────────────────────
 * `base_fountain` is currently served by `academy-hall.jpg`. That file is
 * SAFE — it is a night interior that encodes no duration, no amount and no
 * side, so it cannot leak any of these thirteen answers — but it is not the
 * base, and it does not communicate "fountain" to a reader.
 *
 * It is used anyway, on purpose. ENVVIS1 Batch 1's goal was to prove the scene
 * channel end to end (registry -> contract -> wire -> classifier -> card), and
 * the hall is the one environment atmosphere this repo already ships and has
 * already measured and seated (see `ATMOSPHERE_DIM_SCENE`). Wiring the
 * architecture against real art beats wiring it against a placeholder nobody
 * reviewed, and it means the day a dedicated base/fountain asset lands the
 * change is ONE line here — no contract change, no card change, no backend
 * change, no re-review of which rows are safe.
 *
 * A dedicated `base_fountain` asset is an OPEN ITEM. See ENVVIS1_HANDOFF.md.
 */
import academyHall from "@/assets/ranked/academy-hall.jpg";

/**
 * The art for one scene id.
 *
 * `interim` is carried in the data rather than in a comment so the open art
 * gap is visible to anything that reads this table — today that is the handoff
 * and the tests, which assert the flag rather than the filename, so replacing
 * the asset does not churn a test that is not about the asset.
 */
export type EnvironmentSceneArt = {
  /** Resolved module URL for the atmosphere image. */
  src: string;
  /** True while this scene is served by borrowed art. See the module note. */
  interim: boolean;
};

/**
 * Scene id -> atmosphere. An EXPLICIT table, matching the discipline the
 * subject readers use for their type sets: a future backend scene id must not
 * acquire art by being named plausibly, and an id with no entry here resolves
 * to null, which is the polished text-only fallback rather than a broken
 * image.
 *
 * Batch 1 declares one id. Batch 2's neutral lane/wave scene is NOT here yet,
 * deliberately — its safety argument depends on exactly which units and
 * structures the art contains, and that review has not happened.
 */
const SCENE_ART: Record<string, EnvironmentSceneArt> = {
  base_fountain: { src: academyHall, interim: true },
};

/** The atmosphere for one backend scene id, or null when it has none. */
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
