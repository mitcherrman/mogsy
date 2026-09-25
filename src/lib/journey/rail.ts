/**
 * JOURNEY-UI1 — what a flank shows of its side's Journey champion.
 *
 * The desktop banner and the phone match bar carry IDENTITY and the headline
 * state only — champion, level, Q/W/E/R ranks. Items and stats live on the
 * board, where there is room (measured: the banner's inner column is 131px at
 * the smallest desktop and hidden on a phone). A projection of the same
 * public state the board reads; nothing new is sent for it.
 */
import type { AbilitySlot, JourneyPublicState, JourneySideId } from "./contract";
import { journeySide } from "./contract";
import { transitionMarks } from "./beat";
import { adaptJourneyJ2, type JourneyCursor } from "./adapter";
import { JourneyContractError } from "./contract";
import type { JourneyJ2 } from "./j2";

export interface JourneyRailIdentity {
  side: JourneySideId;
  championId: string;
  championName: string;
  icon: string | null;
  level: number;
  /** The server's previous level while the transition into this node is on the state. */
  levelFrom: number | null;
  abilities: { slot: AbilitySlot; rank: number; maxRank: number | null }[];
}

export function journeyRailIdentity(state: JourneyPublicState, side: JourneySideId): JourneyRailIdentity {
  const s = journeySide(state, side);
  return {
    side,
    championId: s.championId,
    championName: s.championName,
    icon: s.icon,
    level: s.level,
    levelFrom: transitionMarks(state.transition).level[side]?.from ?? null,
    abilities: s.abilities.map((a) => ({ slot: a.slot, rank: a.rank, maxRank: a.maxRank })),
  };
}

/** Both flanks' identity from a live Journey block, or null (no board yet / unreadable). */
export function journeyRailsFor(
  journey: JourneyJ2, cursor: JourneyCursor,
): Record<JourneySideId, JourneyRailIdentity> | null {
  try {
    const view = adaptJourneyJ2(journey, cursor);
    if (!view) return null;
    return {
      subject: journeyRailIdentity(view.board, "subject"),
      opponent: journeyRailIdentity(view.board, "opponent"),
    };
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}
