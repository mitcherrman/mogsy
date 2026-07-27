import type { DamageRevealStep } from "./damageReveal";
import type { Side } from "./statCheckEngine";

/**
 * Who the two sides of a Stat Check match are, for presentation only.
 *
 * Both fields come from systems that already exist. `name` is the bot label in
 * bot play and the seat's `display_name` (already carried by the room contract
 * and projected into RoomView) in multiplayer. `avatarUrl` is whatever the
 * existing profile system already has for that person; there is deliberately no
 * new avatar source here, and `null` is a first-class value — the shared
 * UserAvatar component renders its own fallback glyph for it.
 *
 * Nothing in this module reads or exposes hidden match information: a name and
 * an avatar are both already visible to both players from the lobby onward.
 */
export type StatCheckIdentity = {
  name: string;
  avatarUrl: string | null;
};

export type StatCheckIdentities = Record<Side, StatCheckIdentity>;

/** Bot play: the local engine opponent has no profile row, so no avatar. */
export const DEFAULT_STAT_CHECK_IDENTITIES: StatCheckIdentities = {
  player: { name: "You", avatarUrl: null },
  bot: { name: "Bot", avatarUrl: null },
};

/**
 * Fill in whichever halves of the identity pair are known.
 *
 * Blank or whitespace-only names fall back to the defaults rather than
 * rendering an empty header, which is what a reconnect mid-handshake or a
 * fixture with no seat data would otherwise produce.
 */
export function statCheckIdentities(partial?: {
  player?: Partial<StatCheckIdentity> | null;
  bot?: Partial<StatCheckIdentity> | null;
}): StatCheckIdentities {
  const resolve = (side: Side, given?: Partial<StatCheckIdentity> | null): StatCheckIdentity => {
    const name = given?.name?.trim();
    return {
      name: name && name.length > 0 ? name : DEFAULT_STAT_CHECK_IDENTITIES[side].name,
      avatarUrl: given?.avatarUrl ?? null,
    };
  };
  return {
    player: resolve("player", partial?.player),
    bot: resolve("bot", partial?.bot),
  };
}

/** How a damage presentation heads itself. */
export type DamageIdentityHeader = {
  /**
   * `WINNER` for the side that won the board, `COUNTER` for the board-losing
   * side's retaliation — which is never presented as the round winner.
   */
  label: "WINNER" | "COUNTER";
  side: Side;
  name: string;
  avatarUrl: string | null;
};

/**
 * The header for one damage direction: the actual identity of the side dealing
 * it, never a generic "you strike / they strike" phrase.
 */
export function damageIdentityHeader(step: DamageRevealStep, identities: StatCheckIdentities): DamageIdentityHeader {
  const identity = identities[step.side];
  return {
    label: step.kind === "winner" ? "WINNER" : "COUNTER",
    side: step.side,
    name: identity.name,
    avatarUrl: identity.avatarUrl,
  };
}
