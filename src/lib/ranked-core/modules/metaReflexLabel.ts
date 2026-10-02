// ---------------------------------------------------------------------------
// SC-RENAME3 — the ONE user-facing name of the ranked stat-comparison block.
//
// "Meta Reflex" is the INTERNAL name (`meta_reflex`, `meta-reflex`,
// `item_cost_duel`, `META_REFLEX_*`); players see "Stat Check". Every machine
// identifier stays as-is. Not to be confused with the retired Champion Card
// Duel, whose frozen wire ids still say `stat_check` (SC-RENAME1), nor with the
// standalone League Swipe game's `META_REFLEX_NAME` (league-swipe/branding.ts).
//
// A dependency-free leaf so History/review code can import it without pulling
// in the ranked-core module renderer.
// ---------------------------------------------------------------------------

/** Public product name. Never the module id, which is an implementation fact. */
export const META_REFLEX_LABEL = "Stat Check";
