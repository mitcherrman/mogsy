/**
 * PLAY1 — the Ranked invite SEAM.
 *
 * WHAT EXISTS TODAY, STATED PLAINLY
 * ─────────────────────────────────
 * There is no Ranked invite backend. Ranked has a queue (`/api/ranked/queue`)
 * and it has bot matches (`/api/ranked/bot-matches`); it has no endpoint that
 * creates a match between two named accounts, and no invitation row, channel
 * or notification for one. This module exists so that fact lives in ONE place
 * with a name, instead of being re-discovered as a surprise inside a view.
 *
 * WHAT THIS IS NOT ALLOWED TO BECOME
 * ──────────────────────────────────
 * The Stat Check invite rooms (`useStatCheckInvites`,
 * `lib/stat-check-online/inviteContracts`) are a DIFFERENT game with a
 * different room lifecycle, a different scoring model and no Ranked rating.
 * Pointing this seam at them would produce an invite that appears to work and
 * then starts the wrong match, which is worse than an invite that honestly
 * is not open yet. Nothing here imports them, and nothing here should.
 *
 * THE CONTRACT
 * ────────────
 * A gateway either reports itself unavailable — with a reason a player can
 * read — or it can send an invite. The frontend is written against the
 * interface, not against the current answer, so the day the backend lands the
 * only change is a new implementation and the value below.
 *
 * There is deliberately no local/optimistic path and no "pretend it worked"
 * branch: an invite the server never received is not an invite.
 */

/**
 * Whether a Ranked invite can be sent at all right now.
 *
 * FLAT ON PURPOSE, not a discriminated union. This project compiles with
 * `strict: false` (see `tsconfig.app.json`), and with `strictNullChecks` off
 * TypeScript does not narrow a union by its discriminant — so
 * `availability.available ? … : availability.reason` would not type-check at
 * any call site. A flat shape with an explicitly nullable reason says the same
 * thing and is actually checkable here.
 */
export interface RankedInviteAvailability {
  available: boolean;
  /**
   * Player-facing, and null when `available` is true. Finished copy, not a
   * diagnostic — this is rendered on the scroll as written.
   */
  reason: string | null;
}

export interface RankedInviteTarget {
  /** `profiles.id` of the account being challenged. */
  profileId: string;
  /** Their display name, for the confirmation copy. */
  displayName: string;
}

/** Flat for the same reason as `RankedInviteAvailability` above. */
export interface RankedInviteResult {
  ok: boolean;
  /** The created match, when `ok`. Null otherwise — never a placeholder id. */
  matchId: string | null;
  /** Player-facing failure copy, or null on success. */
  reason: string | null;
}

export interface RankedInviteGateway {
  availability(): RankedInviteAvailability;
  /**
   * Send the challenge. Only ever called when `availability()` reports
   * available — an unavailable gateway is not asked and must not be probed.
   */
  send(target: RankedInviteTarget): Promise<RankedInviteResult>;
}

/**
 * The copy the scroll shows while there is no Ranked invite backend.
 *
 * Written as a finished notice rather than as an apology or a TODO: the
 * roster IS real, the selection IS real, and the only missing piece is the
 * challenge itself.
 */
export const RANKED_INVITE_UNAVAILABLE_REASON =
  "Ranked challenges between summoners aren't open yet. Your roster is ready for the day they are.";

/**
 * The gateway in force today. Reports unavailable, and refuses to send rather
 * than inventing a match id.
 */
export const rankedInviteGateway: RankedInviteGateway = {
  availability: () => ({
    available: false,
    reason: RANKED_INVITE_UNAVAILABLE_REASON,
  }),
  send: async () => ({
    ok: false,
    matchId: null,
    reason: RANKED_INVITE_UNAVAILABLE_REASON,
  }),
};
