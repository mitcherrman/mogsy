// ---------------------------------------------------------------------------
// Meta Reflex — user-facing product naming.
//
// The feature is called "Meta Reflex" to users. Internally it remains
// "League Swipe": component names, route paths (`/league-swipe*`), Supabase
// tables (`league_swipe_*`), RPCs, and this directory all keep the historical
// name deliberately. A repo-wide internal rename would touch shipped public
// URLs and live database objects for zero product gain.
//
// The public name is centralised here (rather than scattered as string
// literals, which is how it was before) for one concrete reason: the name may
// revert to "League Swipe". Every user-visible occurrence should read from this
// module so that switch is a one-line change and cannot go half-applied.
//
// There is no i18n layer in this app and `site-config.ts` holds only the SITE
// brand, so a small feature-scoped module is the least invasive home for this.
// ---------------------------------------------------------------------------

/** The product name shown to users. Change this to rebrand the whole feature. */
export const META_REFLEX_NAME = "Meta Reflex";

/**
 * Canonical route base. Kept as `/league-swipe` on purpose — these are live
 * public URLs and renaming them would break existing links for no user benefit.
 * Exported so callers never hand-write the path next to the display name and
 * let the two drift.
 */
export const META_REFLEX_ROUTE = "/league-swipe";
export const META_REFLEX_STATS_ROUTE = "/league-swipe/stats";

/** One-line positioning used by hub cards and meta descriptions. */
export const META_REFLEX_TAGLINE = "Two options. One tap.";
