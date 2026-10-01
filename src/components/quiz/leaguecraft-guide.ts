import type { GuideMessage, GuidePlacements } from "@/components/mogzy-guide";

/**
 * MG-D — what Mogzy says on the Leaguecraft journey, as plain data.
 *
 * Everything here is a PURE function of state the surface already owns. Mogzy
 * never reads a role, a queue, an account or a counter himself, and nothing in
 * this file gates, writes or navigates: it only turns "what the page already
 * knows" into candidate `GuideMessage`s for `useMogzyGuide` to arbitrate.
 *
 * Two surfaces use it, with separate substrate namespaces so their persistence
 * and test ids cannot collide:
 *
 *   `leaguecraft`         the lobby: role guidance, then a nudge toward PLAY
 *   `leaguecraft-signup`  the post-completion signup prompt: the one place the
 *                         conversion copy is voiced by Mogzy
 */

export const LEAGUECRAFT_GUIDE_SURFACE = "leaguecraft";
export const LEAGUECRAFT_SIGNUP_GUIDE_SURFACE = "leaguecraft-signup";

export const ROLE_FIRST_USE_ID = "lc-role-first";
export const ROLE_PICKED_ID = "lc-role-picked";
export const SIGNUP_GUIDE_ID = "lc-signup";

/** How long the first-use line waits before it expires (expiry counts as seen). */
export const ROLE_FIRST_USE_TTL_MS = 14_000;
/** The post-pick lean is a beat, not a message to read. */
export const ROLE_PICKED_TTL_MS = 3_500;

export interface LeaguecraftGuideState {
  /**
   * First-use is only offered to a visitor who arrived with NO role on the
   * stage. It is evaluated once, when the role state settles (see
   * `LeaguecraftGuide`), so a saved role that finishes loading a moment later
   * cannot flash a prompt that is no longer true.
   */
  offerRoleGuidance: boolean;
  /** The reader moved the role stage during this visit. */
  rolePicked: boolean;
  /** PLAY is pressable. Mirrors the host's own `playDisabled`; never decides it. */
  playEnabled: boolean;
}

/**
 * Candidate messages for the lobby, most important first.
 *
 *   contextual  "Press Play" — only after the reader actually moved the stage,
 *               and only while PLAY is pressable. It leans toward the seal.
 *   first-use   "Pick the role you know best." — once per browser.
 *
 * The first-use entry deliberately stays in the list for the whole visit once
 * it was offered (the substrate needs it present to persist its dismissal when
 * the reader picks a role); the contextual entry simply outranks it.
 */
export function buildLeaguecraftGuideMessages(
  state: LeaguecraftGuideState,
): GuideMessage[] {
  const messages: GuideMessage[] = [];

  if (state.rolePicked && state.playEnabled) {
    messages.push({
      id: ROLE_PICKED_ID,
      priority: "contextual",
      text: "Ready? Press Play.",
      pose: "base",
      target: { direction: "down", distance: "near" },
      cue: "hop",
      ttlMs: ROLE_PICKED_TTL_MS,
    });
  }

  if (state.offerRoleGuidance) {
    messages.push({
      id: ROLE_FIRST_USE_ID,
      priority: "first-use",
      title: "Start here",
      text: "Pick the role you know best.",
      pose: "explaining",
      cue: "hop",
      ttlMs: ROLE_FIRST_USE_TTL_MS,
      once: "dismiss",
    });
  }

  return messages;
}

/**
 * The post-completion signup line.
 *
 * It must never read as a verdict on the player, so the praise tracks the
 * score: a run at or above 60% gets "Not bad.", anything else gets a neutral
 * "Good practice." The offer itself is the same either way, and the concrete
 * account value (score, XP, streaks, results) is the gate's own list beneath.
 */
export function leaguecraftSignupLine(score: number, total: number): string {
  const good = total > 0 && score / total >= 0.6;
  return `${good ? "Not bad." : "Good practice."} Want me to keep track of your progress?`;
}

/** The signup prompt's single message. Contextual, so it is announced once. */
export function buildSignupGuideMessage(line: string): GuideMessage {
  return {
    id: SIGNUP_GUIDE_ID,
    priority: "contextual",
    text: line,
    pose: "holdingBook",
    cue: "hop",
  };
}

/**
 * LOBBY PLACEMENT — authored against the real centre scroll.
 *
 * The anchor is the top-left of the centre scroll's WRITING AREA, under the
 * "Choose your role" title, where the stage has empty parchment above the left
 * neighbour figure. It is free of the role stepper (a row at the stage's foot),
 * the dot indicator, the emblem button (top right) and the PLAY seal, on every
 * width the lobby renders at: the anchor is relative to the scroll's own
 * content box, which is the same box when the three columns stack.
 *
 * The bubble drops BELOW him, over the left neighbour figure, rather than to
 * his right, where it would sit across the face of the role the reader is
 * choosing. It never reaches the stepper or the seal.
 */
export const LEAGUECRAFT_GUIDE_PLACEMENT: GuidePlacements = {
  desktop: {
    anchor: { top: "2.4rem", left: "-1.75rem" },
    size: "clamp(48px, 4.4vw, 64px)",
    bubbleSide: "bottom",
    bubbleWidth: "min(168px, 46vw)",
  },
  mobile: {
    anchor: { top: "2rem", left: "-2.9rem" },
    size: "clamp(40px, 12vw, 48px)",
    bubbleSide: "bottom",
    bubbleWidth: "min(132px, 42vw)",
  },
};

/**
 * SIGNUP PLACEMENT — in flow, at the head of the prompt card, replacing the
 * lock icon. The bubble sits to his right inside the card; the card reserves
 * his height (`SIGNUP_GUIDE_HOST_CLASS`). Sized with `vh` so a short landscape
 * phone gets a smaller Mogzy instead of pushing the Create Account button off
 * the card.
 */
export const SIGNUP_GUIDE_PLACEMENT: GuidePlacements = {
  desktop: {
    size: "min(64px, 10.5vh)",
    bubbleSide: "right",
    bubbleWidth: "min(204px, 54vw)",
  },
  mobile: {
    size: "min(52px, 10.5vh)",
    bubbleSide: "right",
    bubbleWidth: "min(190px, 52vw)",
  },
};
