// ---------------------------------------------------------------------------
// Dev-only deterministic matchup override for Meta Reflex.
//
// WHY THIS EXISTS
// Verifying the revote semantics (same vote is idempotent; changed vote MOVES
// the vote rather than adding one) requires voting on the SAME pair three
// times. Matchup selection is uniform-random over ~170 champions, so waiting
// for a specific pair to reappear is ~1 in 14,000 per round — not a test, a
// lottery. And it cannot be done from the SQL editor either: `auth.uid()` is
// NULL there, so the preference path is unreachable.
//
// This forces the pair and nothing else. Auth, session, the RPC call, and the
// write path are all completely untouched — the vote goes through exactly the
// code a real player's vote goes through, against the real Supabase session.
//
// SAFETY
//   * `import.meta.env.DEV` is statically `false` in any production `vite
//     build`, so Vite dead-code-eliminates this whole branch out of the shipped
//     bundle. The same primary guarantee `src/lib/e2e/identity.ts` relies on.
//   * Inert unless the `forcePair` query parameter is explicitly present. Normal
//     random selection is untouched when it is absent — which is always, in
//     production, because the code is not there.
//   * The forced entities are VALIDATED against the real pool by the caller. It
//     cannot introduce a champion or item that ordinary play could not also
//     produce, so it cannot write junk rows.
//   * It does not fabricate a vote, does not bypass the RPC, and does not
//     implement any second copy of preference logic.
// ---------------------------------------------------------------------------

/** The query parameter that activates the override. */
export const FORCE_PAIR_PARAM = "forcePair";

/**
 * Parse `?forcePair=Ezreal,Vi` into `["Ezreal", "Vi"]`.
 *
 * Returns null in production, when the parameter is absent, or when it does not
 * name exactly two distinct non-empty entities.
 */
export function parseForcedPair(search: string): [string, string] | null {
  if (import.meta.env.DEV !== true) return null;

  const raw = new URLSearchParams(search).get(FORCE_PAIR_PARAM);
  if (!raw) return null;

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Exactly two, and distinct — a self-matchup has no meaning and the RPC
  // rejects it anyway ("invalid matchup entities").
  if (parts.length !== 2) return null;
  if (parts[0] === parts[1]) return null;

  return [parts[0], parts[1]];
}

/**
 * Narrow `pool` to the forced pair, or return null if the override is not
 * active or the pair is not fully present in the real pool.
 *
 * Returning null (rather than an empty or partial pool) is deliberate: an
 * unrecognised name must fall back to normal random selection, never produce a
 * matchup containing an entity the game could not otherwise deal.
 */
export function narrowPoolToForcedPair<T>(
  pool: T[],
  forced: [string, string] | null,
  idOf: (item: T) => string,
): T[] | null {
  if (!forced) return null;
  const [a, b] = forced;
  const found = pool.filter((item) => idOf(item) === a || idOf(item) === b);
  // Both sides must resolve, or the override is ignored entirely.
  if (found.length !== 2) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Meta Reflex] ${FORCE_PAIR_PARAM}="${a},${b}" ignored: ` +
          `${found.length} of 2 entities found in the current pool.`,
      );
    }
    return null;
  }
  return found;
}
