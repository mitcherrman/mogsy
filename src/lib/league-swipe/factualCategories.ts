/**
 * Which canonical factual evaluator judges a given Meta Reflex answer.
 *
 * WHY A RESOLVER AND NOT `game.slug`
 * ──────────────────────────────────
 * The backend's factual categories are per-FACT, not per-game. Item Cost Duel
 * happens to be one game with one fact, so its slug and its category id are the
 * same string. Stat Duel is one game over SIX facts, and the game slug
 * (`higher-base-stat`) is not a category at all — passing it to the verifier
 * 404s, which silently degrades to the client's own comparison. That is exactly
 * the failure this feature exists to remove, so the binding is made explicit.
 *
 * WHY THIS BINDING LIVES IN THE CLIENT
 * The backend provider is deliberately host-neutral: it knows about facts, not
 * about League Swipe's game slugs. Teaching it those slugs would make a shared
 * provider own one host's routing. The binding is host knowledge, so the host
 * holds it.
 *
 * WHY IT IS SAFE FOR THE CLIENT TO NAME THE CATEGORY
 * Naming a category is not the same as claiming an answer. The server validates
 * that the category exists and that BOTH entities are in its canonical pool; a
 * wrong or invented category yields `verified_correct: null` (unjudged), never
 * a verdict the caller chose. There is still no field through which a client can
 * assert correctness.
 */

/** The stat keys Stat Duel can ask about, mapped to their factual category. */
const STAT_VARIANT_TO_CATEGORY: Record<string, string> = {
  hp: "champion-hp-duel",
  ad: "champion-ad-duel",
  armor: "champion-armor-duel",
  move_speed: "champion-move-speed-duel",
  attack_range: "champion-attack-range-duel",
};

/**
 * Stat Duel variants with no canonical evaluator, and why.
 *
 * `magic_resist` is not an oversight. Base MR ties on ~39% of champion pairs
 * (measured against `champion_stats`, 172 champions), so the backend provider
 * deliberately declines to offer it as a duel category. Stat Duel may still ask
 * the question — its own generator rejects ties before dealing a card, so the
 * matchups it produces are answerable — but a STORED answer cannot be re-judged
 * from canonical data through the shared verifier.
 *
 * Listing it explicitly (rather than letting the lookup miss) is what makes the
 * gap auditable: the test suite asserts that every variant Stat Duel can deal is
 * either mapped or named here, so a new stat cannot become silently unverifiable.
 */
export const UNVERIFIABLE_STAT_VARIANTS: Record<string, string> = {
  magic_resist:
    "base MR ties on ~39% of champion pairs, so it has no canonical duel category",
};

/**
 * The factual category that can judge this answer, or null if none can.
 *
 * A null result means "record the play, do not claim a verified verdict" — the
 * caller must fall back to its local reading and must NOT treat the answer as
 * wrong.
 */
export function resolveFactualCategory(
  gameSlug: string,
  variant?: string | null,
): string | null {
  if (gameSlug === "item-cost-duel") return "item-cost-duel";
  if (gameSlug === "higher-base-stat") {
    if (!variant) return null;
    return STAT_VARIANT_TO_CATEGORY[variant] ?? null;
  }
  // Opinion games have no factual truth and must never reach a verifier.
  return null;
}

/** Every stat variant that maps to a canonical category. Exported for tests. */
export const VERIFIABLE_STAT_VARIANTS = Object.keys(STAT_VARIANT_TO_CATEGORY);
