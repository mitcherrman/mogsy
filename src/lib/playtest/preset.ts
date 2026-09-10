// ---------------------------------------------------------------------------
// RB3 — THE GUIDED PLAYTEST PRESET.
//
// ═══════════════════════════════════════════════════════════════════════════
//  HOW TO EDIT THE PLAYTEST
// ═══════════════════════════════════════════════════════════════════════════
//
//  There are exactly TWO files, and they own different halves:
//
//    GAMEPLAY  ranked_formats/schema.py -> `_guided_playtest_segment_pattern`
//              in the BACKEND repo. Which questions, which slices, in which
//              order, with which timers and damage. Every entry names an
//              existing module and an existing bank; nothing there invents
//              a question.
//
//    NARRATION this file. What is said BETWEEN those segments, and before and
//              after the match. Nothing here is gameplay, which is why it is
//              allowed to be playtest-specific at all.
//
//  To move an interstitial, change its `afterSegments`. To add one, add an
//  entry. To change the copy, change the copy. None of it touches Ranked.
//
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY INTERSTITIALS ARE KEYED ON A SEGMENT COUNT, and not on an index into a
// step list the client walks:
//
// A step list is client memory, and client memory does not survive a refresh.
// `completedRounds` is the SERVER's own count of settled segments, present in
// every snapshot. Keying on it means the guided sequence is derived from
// authoritative state on every render — reload mid-playtest and the client
// recomputes exactly where it is, because it never knew anything the server
// could not tell it again.
//
// The copy below is DELIBERATELY PLACEHOLDER. RB3 is the architecture; the
// final wording is an owner decision, and it is a string edit when it lands.
// ---------------------------------------------------------------------------

/** One informational page. Never gameplay — see the module note. */
export interface PlaytestInterstitial {
  /** Stable id. Used as the React key and in tests; never shown. */
  id: string;
  /**
   * Show this page once the server reports THIS many settled segments.
   *
   * `0` is the intro, which is shown before the match is created at all.
   */
  afterSegments: number;
  /** Small line above the heading. */
  eyebrow: string;
  heading: string;
  /** One or two short paragraphs. */
  body: readonly string[];
  /** The one action. */
  action: string;
}

/**
 * The intro, shown BEFORE a match exists.
 *
 * That ordering is not cosmetic: no match means no round, no clock and nothing
 * to forfeit, so the player can read this for as long as they like. It is also
 * the moment the playtest is actually started — pressing the action is what
 * sends `POST /api/ranked/queue { match_with_bot: true, preset: "playtest" }`.
 */
export const PLAYTEST_INTRO: PlaytestInterstitial = {
  id: "intro",
  afterSegments: 0,
  eyebrow: "Mogzy Playtest",
  heading: "Welcome to the playtest",
  body: [
    "You are about to play a guided Ranked match against a training opponent. "
    + "It is ordinary Ranked in every way that matters — the same questions, "
    + "the same clock, the same scoring — and it does not affect your rank.",
    "Along the way we will stop briefly to introduce each kind of question "
    + "Leaguecraft asks. Nothing is timed while those pages are open.",
  ],
  action: "Begin",
};

/**
 * The pages BETWEEN segments, in the order the match reaches them.
 *
 * Each `afterSegments` corresponds to a boundary in the backend's guided
 * segment pattern. They are stated as counts rather than derived from the
 * pattern because the client does not — and should not — hold a copy of the
 * gameplay sequence: the server owns that, and the only thing the client needs
 * from it is how many segments have settled.
 */
export const PLAYTEST_INTERSTITIALS: readonly PlaytestInterstitial[] = [
  {
    id: "meta-reflex",
    afterSegments: 3,
    eyebrow: "Next",
    heading: "Meta Reflex",
    body: [
      "A rapid-fire block: five cards, one clock each. Pick the higher value "
      + "before the card expires.",
    ],
    action: "Continue",
  },
  {
    id: "mastery",
    afterSegments: 4,
    eyebrow: "Next",
    heading: "Champion Mastery",
    body: [
      "Mastery walks one champion's kit in curriculum order — cooldowns, "
      + "costs and scaling — rather than asking unrelated questions.",
    ],
    action: "Continue",
  },
  {
    id: "matchup",
    afterSegments: 5,
    eyebrow: "Next",
    heading: "Matchup Mastery",
    body: [
      "The same idea across two champions at once: recall on both kits, then "
      + "the comparisons that decide a lane.",
    ],
    action: "Continue",
  },
  {
    id: "combat",
    afterSegments: 6,
    eyebrow: "Next",
    heading: "Combat maths",
    body: [
      "Finally, a calculation: real damage against real armour, from Mogzy's "
      + "own certified combat model.",
    ],
    action: "Continue",
  },
] as const;

/**
 * The outro, shown AFTER the canonical Ranked result screen.
 *
 * Deliberately not a replacement for it. RB2 made the bot end screen a proper
 * Ranked completion and RB3 does not take that away: the player reads their
 * result on `MatchOverFrame` and steps forward into this.
 */
export const PLAYTEST_OUTRO: PlaytestInterstitial = {
  id: "outro",
  afterSegments: -1,
  eyebrow: "Mogzy Playtest",
  heading: "Thanks for playing",
  body: [
    "That was Leaguecraft: ordinary Ranked questions, reflex blocks, Mastery, "
    + "matchups and combat maths, in one match.",
    "Tell us what you thought — what was clear, what was not, and what you "
    + "would want more of.",
  ],
  action: "Back to Leaguecraft",
};

/** The interstitial due at this many settled segments, or null. */
export function interstitialAfter(
  completedSegments: number,
  pages: readonly PlaytestInterstitial[] = PLAYTEST_INTERSTITIALS,
): PlaytestInterstitial | null {
  return pages.find((p) => p.afterSegments === completedSegments) ?? null;
}
