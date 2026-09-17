/**
 * ENV1 fallback — WHICH compact plate a media-free round gets.
 *
 * WHY THIS IS A SEPARATE DECISION FROM `resolveBandProfile`
 * The band PROFILE answers "does this payload reach the picture at all", and
 * the answer for every row here is already no. This answers a narrower
 * question the profile deliberately does not: given that there is no picture,
 * how much of the reserved region should the plate occupy.
 *
 * Keeping it out of `ScenarioBandProfile` is the point. That union is consumed
 * by the Content Factory's completeness gate (`bandPresentsPayload`), by the
 * screenshot presentation module and by the family-layout authority; a fourth
 * member would have made every one of them restate a rule that changes nothing
 * they care about. A plate is a plate to all of them — `compact` still means
 * "this payload contributed nothing to the picture", which stays true here.
 *
 * ── WHY IT READS THE CATEGORY, WHICH IS NOT THE OBVIOUS CHOICE ─────────────
 * The first draft of this matched the backend's own family prefix on
 * `question_key`, which is a better identity than a category in every respect
 * but one: it is not there. Two measured facts closed that door.
 *
 *   1. `PublicQuestionSource` — everything Ranked transports to the surface —
 *      carries questionId, prompt, options, category, presentation,
 *      optionMedia and topic. There is no question key in it, and
 *      `scenarioSourceFromPublicQuestion` therefore cannot map one.
 *
 *   2. That adapter returns NULL outright when a question carries no
 *      `presentation`, and the structure and objective rows carry none. So at
 *      the compact branch these rounds have no scenario source AT ALL — a key
 *      prefix rule would have been inert on precisely the rows it was written
 *      for, and would have silently done nothing in production while passing
 *      its own unit tests against a hand-built source.
 *
 * The category is what survives: it is on the `QuestionView` whether or not a
 * scenario source exists, and it is already question-safe — this component has
 * been rendering it as the band's own label since RR1.
 *
 * WHY IT IS STILL NOT AN ENTITY→ART MAP
 * It maps a CATEGORY to a layout density. It names no entity, resolves no
 * asset, and cannot: the returned value is one of two layout tokens. The
 * environment card owns every art decision, and it is reached through
 * `assets.subject`, which is the backend's to emit.
 *
 * IT RETIRES ITSELF
 * This is only ever consulted on the `compact` branch. The moment the backend
 * art workstream emits a real `assets.subject` for a structure or objective
 * row, that row resolves to `cinematic` and takes `EnvironmentScenarioCard`
 * through the shared composition — this function is never called for it again,
 * with no edit here and no later redesign.
 */

/**
 * `plate` — the RR1 presentation: grows into the arena's reserved region and
 * fills it with owned chrome. Unchanged, and the default for EVERY category.
 *
 * `context` — a short, composed academy strip. 7rem against the region's 16rem
 * reserve, so a round with genuinely no subject stops drawing a ~256px
 * near-empty rectangle. Interim only: it exists to be replaced by real subject
 * media, not to compete with it.
 */
export type CompactDensity = "plate" | "context" | "jungle";

/**
 * JPM1 — `jungle`: the Jungle Systems plate. PLATE geometry (it still grows
 * into the reserved region, so nothing about the stage moves), with the
 * jungle-grass ground in place of the generic watermark diamond. It names no
 * subject: a media-free smite/quest/reward rule is about the jungle, not about
 * any companion, and the grass says exactly that and no more.
 */
const JUNGLE_CATEGORIES = new Set(["jungle systems"]);

/**
 * The categories whose media-free rows take the context strip.
 *
 * An EXPLICIT set — the same discipline the summoner-spell and environment
 * subject readers use for their type sets, so a future category cannot acquire
 * this presentation by being named plausibly. All four are where
 * `quiz/generate_environment_mechanics_questions.py` and the legacy objective
 * generator file their rows:
 *
 *   `Objectives`        — STRUCTURE_CATEGORY: structures, turret plates,
 *                         bulwark, turret behaviour, base structures. The
 *                         reported turret round is one of these.
 *   `Game Fundamentals` — FUNDAMENTALS_CATEGORY: the same generator's
 *                         structure-count and rule rows (the visual-QA
 *                         fixture's turret-count row is filed here, not under
 *                         Objectives), alongside a handful of legacy
 *                         text-only fundamentals. Those legacy rows are the
 *                         same media-free shape and get the same improvement.
 *   `Minion Waves`      — WAVE_CATEGORY. Most of these have portraits and
 *                         never reach the compact branch at all; the few
 *                         media-free ones (first-wave spawn time) land here.
 *   `Objective Timers`  — the legacy Baron / first-Dragon rows. Included
 *                         because they are the same question with the same
 *                         absent art under a category literally named for
 *                         objectives; fixing their sibling and not them would
 *                         have been arbitrary.
 *
 * Everything else — wave economy, Pro Play, items, runes, the registry-gap
 * summoner spells, every other media-free family — keeps the plate it has.
 */
const CONTEXT_CATEGORIES = new Set([
  "objectives",
  "objective timers",
  "minion waves",
  "game fundamentals",
]);

/**
 * Normalised the same way `formatCategoryLabel` normalises for display: the
 * stored strings are inconsistent about underscores and case across
 * generators, and a rule that missed `minion_waves` while matching
 * `Minion Waves` would be a silent half-fix.
 */
function normalizeCategory(category: string | null | undefined): string {
  return String(category ?? "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
}

export function resolveCompactDensity(category: string | null | undefined): CompactDensity {
  const normalized = normalizeCategory(category);
  if (JUNGLE_CATEGORIES.has(normalized)) return "jungle";
  return CONTEXT_CATEGORIES.has(normalized) ? "context" : "plate";
}
