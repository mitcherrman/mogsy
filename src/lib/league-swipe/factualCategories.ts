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

/** The stat keys a champion stat duel can ask about, mapped to their category. */
const STAT_VARIANT_TO_CATEGORY: Record<string, string> = {
  hp: "champion-hp-duel",
  ad: "champion-ad-duel",
  armor: "champion-armor-duel",
  move_speed: "champion-move-speed-duel",
  attack_range: "champion-attack-range-duel",
};

/**
 * Game slugs that ask about exactly ONE base stat, and which stat that is.
 *
 * WHY THESE SLUGS ARE NOT SUPABASE GAMES
 * ──────────────────────────────────────
 * They are route/hub identities only. All three WRITE under the existing
 * `higher-base-stat` game row, discriminated by the `variant` column that
 * migration 20260813120100 added for exactly this purpose — one stat per
 * matchup aggregate. Introducing three real `league_swipe_games` rows would
 * need a manually-applied Supabase migration that the frontend deploy has to
 * land behind (the vote RPC raises `unknown league swipe game` for an unseeded
 * slug), and it would strand every hp/ad/armor aggregate already accumulated
 * under `higher-base-stat`. The variant discriminator already models "one stat
 * is one question family", so the storage model needs nothing new — only the
 * presentation does.
 *
 * Consequence for this resolver: it is asked about BOTH names. Live play passes
 * the mode slug (`base-hp-duel`); derive-on-read passes the stored Supabase slug
 * (`higher-base-stat`) with the row's variant. Both must resolve, and they must
 * resolve to the SAME category, which the coverage test pins.
 */
export const FOCUSED_STAT_GAMES: Record<string, string> = {
  "base-hp-duel": "hp",
  "base-ad-duel": "ad",
  "base-armor-duel": "armor",
};

/**
 * Stat variants with no canonical evaluator, and why.
 *
 * `magic_resist` is not an oversight. Base MR ties on ~39% of champion pairs
 * (measured against `champion_stats`, 172 champions), so the backend provider
 * deliberately declines to offer it as a duel category.
 *
 * Stat Duel NO LONGER DEALS IT. It used to, on the reasoning that its generator
 * rejects ties so the matchups were at least answerable — but once score and
 * streak became canonical-only, "answerable" stopped being enough: an unjudged
 * round cannot be scored, so about one Stat Duel round in six quietly counted
 * for nothing. The variant is out of `STAT_KEYS`, and this registry is now a
 * record of a HISTORICAL variant rather than a live gap.
 *
 * It stays here, and stays unmapped, for two reasons that outlive the removal:
 * stored `league_swipe_results` rows with `variant = 'magic_resist'` must keep
 * resolving to null so derive-on-read renders them unjudged instead of wrong,
 * and the coverage test still uses this registry to prove every stat the game
 * CAN deal has an evaluator — so appending a new unverifiable stat to
 * `STAT_KEYS` fails loudly instead of silently scoring nothing.
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

  // Focused single-stat modes. The mode's own stat is the authority, and a
  // dealt variant that disagrees with it is NOT judged: a `base-hp-duel` round
  // carrying `variant: 'magic_resist'` is a bug somewhere upstream, and judging
  // it against the HP pool would score the player on a question they were never
  // asked. Unjudged is the honest outcome, and it is what keeps a stat with no
  // canonical evaluator — base MR above all — from leaking in through a mode
  // that is nominally about something else.
  const focused = FOCUSED_STAT_GAMES[gameSlug];
  if (focused) {
    if (variant && variant !== focused) return null;
    return STAT_VARIANT_TO_CATEGORY[focused] ?? null;
  }

  if (gameSlug === "higher-base-stat") {
    if (!variant) return null;
    return STAT_VARIANT_TO_CATEGORY[variant] ?? null;
  }
  // Opinion games have no factual truth and must never reach a verifier.
  return null;
}

/** Every stat variant that maps to a canonical category. Exported for tests. */
export const VERIFIABLE_STAT_VARIANTS = Object.keys(STAT_VARIANT_TO_CATEGORY);
