/**
 * PLAY1 — what the Ranked lobby's PLAY scroll offers, as one pure contract.
 *
 * The three entries, their order, and their copy live here so the scroll, the
 * admin panel and the tests cannot drift apart. Nothing in this module
 * fetches, navigates, or decides whether a mode can actually be PLAYED — it
 * only says which entries the scroll draws and what they are called.
 *
 * WHY THE COPY IS DATA
 * ────────────────────
 * The academy's match-entry record is a written page: each option is a titled
 * clause with a marginal note, not a button with a tooltip. Holding the words
 * beside the ids means the reading order, the accessible names and the
 * admin panel's labels are the same strings, and a mode cannot end up called
 * one thing in the lobby and another in the settings table.
 *
 * WHAT A MODE ID IS NOT
 * ─────────────────────
 * It is not a route, and it is not a backend capability. `daily` in
 * particular is the Daily Challenge that `Quiz.tsx` hosts in-page — NOT the
 * Score Attack time trial at `/quiz/daily`, which is a different feature with
 * a confusingly similar path. See `PLAY_MODES` below.
 */

import type { PlatformPolicy } from "@/lib/platform-policy/policy";

export type PlayModeId = "ranked" | "daily" | "invite";

export interface PlayModeDescriptor {
  id: PlayModeId;
  /** The clause heading, as written on the page. */
  title: string;
  /** The small capitals above it — what KIND of entry this is. */
  kicker: string;
  /** The marginal note. One line, no gameplay claim the product cannot keep. */
  note: string;
}

/**
 * The three entries, in the order they are written on the scroll.
 *
 * Ranked is first and is the competitive entry. Daily Challenge is the
 * in-page daily set `Quiz.tsx` already owns (`handlePlayDailyChallenge`),
 * which reads its theme, target and XP bonus from the backend. Invite is the
 * Academy-roster entry; its frontend is complete and its send action
 * waits on a Ranked invite backend that does not exist yet — see
 * `@/lib/ranked-public/rankedInvite`.
 */
export const PLAY_MODES: readonly PlayModeDescriptor[] = [
  {
    id: "ranked",
    kicker: "Competitive",
    title: "Ranked Match",
    note: "Enter Ranked queue to test your League knowledge.",
  },
  {
    id: "daily",
    kicker: "Today's Study",
    title: "Daily Challenge",
    note: "Complete today's Leaguecraft set and keep your streak alive.",
  },
  {
    id: "invite",
    kicker: "Your Roster",
    title: "Invite",
    note: "Challenge a friend to find out who is better.",
  },
] as const;

export type PlayModeVisibility = Record<PlayModeId, boolean>;

/**
 * Which entries the scroll draws, from the global policy.
 *
 * Pure and total: every id always gets an answer, so a caller can never index
 * into `undefined` and accidentally read it as "hidden".
 */
export function playModeVisibility(policy: PlatformPolicy): PlayModeVisibility {
  return {
    ranked: policy.play.modes.ranked,
    daily: policy.play.modes.dailyChallenge,
    invite: policy.play.modes.invite,
  };
}

/** The descriptors that are actually visible, in written order. */
export function visiblePlayModes(
  visibility: PlayModeVisibility,
): readonly PlayModeDescriptor[] {
  return PLAY_MODES.filter((mode) => visibility[mode.id]);
}

/** Every mode the policy can hide is hidden. The scroll has to say something
 *  rather than open onto an empty page — see `PlayModeMenu`. */
export const isPlayScrollEmpty = (visibility: PlayModeVisibility): boolean =>
  visiblePlayModes(visibility).length === 0;
