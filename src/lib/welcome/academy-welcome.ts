// ---------------------------------------------------------------------------
// Academy Welcome (HI1) — first-run state contract.
//
// The Academy introduction at /welcome is a first-visit product state, not an
// overlay: the Mogzy entrance at "/" decides whether a visitor is sent into it
// or straight on to the League hub. This module owns that decision and the one
// piece of durable state behind it.
//
// Deliberately browser-local. The introduction gates nothing and confers no
// access, so it needs no server round-trip and no Supabase column; the one
// piece of onboarding state that genuinely must be durable — tutorial
// completion — already lives in profiles.ranked_tutorial_completed_at and is
// owned by lib/ranked-tutorial, not here. The cost of local-only state is that
// a second device shows the introduction again, which is acceptable for a
// screen that is one tap to leave.
//
// This module is also deliberately independent of the legacy
// `tutorial_auto_popup_enabled` app_settings row. That admin toggle governs the
// OLD LolWelcomeIntro popup only; HI1 must never inherit it as a master switch,
// or the new introduction would be silently disabled by a setting that was
// turned off for a different component.
// ---------------------------------------------------------------------------

import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

/**
 * Storage key. Follows the established `mogsy.<domain>.v<n>` convention (see
 * RADIO_STORAGE_KEYS in lib/audio/academy-radio.ts, "mogsy.profileConfig.v1").
 *
 * The version suffix is load-bearing: a future revision of the introduction can
 * bump to v2 and re-show itself to everyone without a migration and without
 * losing the ability to tell "never saw v1" from "saw v1, hasn't seen v2".
 */
export const ACADEMY_WELCOME_STORAGE_KEY = "mogsy.academyWelcome.v1";

/** The Academy introduction's own route. */
export const ACADEMY_WELCOME_ROUTE = "/welcome";

/**
 * How the visitor left the introduction.
 *
 * Both outcomes mean "handled" for routing purposes — neither one re-interrupts
 * a later visit. They are kept distinct because they answer different product
 * questions later (did people want guidance, or did they want to browse?), and
 * because collapsing them to a bare boolean would throw that away irreversibly.
 *
 * There is deliberately no "skipped" outcome: leaving early via Start Exploring
 * IS the skip, and inventing a third state would imply a distinction the UI
 * does not offer.
 */
export type AcademyWelcomeOutcome = "explored" | "tutorial";

export interface AcademyWelcomeState {
  outcome: AcademyWelcomeOutcome;
  /** ISO timestamp of the decision. Diagnostic only — nothing branches on it. */
  at: string;
}

const VALID_OUTCOMES: readonly string[] = ["explored", "tutorial"];

function readRaw(): string | null {
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(ACADEMY_WELCOME_STORAGE_KEY)
      : null;
  } catch {
    // Private mode / disabled storage: the visitor simply sees the
    // introduction again. Never a reason to break the entrance.
    return null;
  }
}

/**
 * Current state, or null when the visitor has not been through the
 * introduction.
 *
 * Every failure mode collapses to null — absent key, unparseable JSON, a
 * non-object, an array, a missing or unrecognised outcome. "Unreadable" and
 * "unseen" are treated identically on purpose: the worst case is showing a
 * skippable introduction one extra time, whereas trusting a malformed value
 * could strand someone. Never throws.
 */
export function readAcademyWelcomeState(): AcademyWelcomeState | null {
  const raw = readRaw();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const { outcome, at } = parsed as Record<string, unknown>;
  if (typeof outcome !== "string" || !VALID_OUTCOMES.includes(outcome)) return null;

  return {
    outcome: outcome as AcademyWelcomeOutcome,
    at: typeof at === "string" ? at : "",
  };
}

/** Whether the visitor has already been through the Academy introduction. */
export function hasHandledAcademyWelcome(): boolean {
  return readAcademyWelcomeState() !== null;
}

/**
 * Record how the visitor left the introduction.
 *
 * Last-write-wins by design: replaying the introduction and choosing
 * differently should update the record, since the newer choice is the more
 * accurate answer to "what did this person want?".
 *
 * Silent on failure. A blocked write means the visitor sees the introduction
 * again next time, which is a far better outcome than an exception thrown from
 * a click handler that is mid-navigation.
 */
export function markAcademyWelcomeHandled(outcome: AcademyWelcomeOutcome): void {
  try {
    localStorage.setItem(
      ACADEMY_WELCOME_STORAGE_KEY,
      JSON.stringify({ outcome, at: new Date().toISOString() } satisfies AcademyWelcomeState),
    );
  } catch {
    /* quota or disabled storage — never worth breaking the handoff over */
  }
}

/** Forget the introduction. Exposed for QA and tests, not wired to any UI. */
export function clearAcademyWelcomeState(): void {
  try {
    localStorage.removeItem(ACADEMY_WELCOME_STORAGE_KEY);
  } catch {
    /* disabled storage */
  }
}

/**
 * Where the Mogzy entrance ("/") should send this visitor.
 *
 * First visit → the Academy introduction. Afterwards → straight to the League
 * hub, exactly as before HI1 existed.
 *
 * Resolved at click time rather than at render time so it always reflects
 * current storage — the entrance screen can be mounted for a long while, and a
 * decision cached at mount could be stale by the time it is used.
 */
export function resolveEntryDestination(): string {
  return hasHandledAcademyWelcome() ? LEAGUE_HOME_ROUTE : ACADEMY_WELCOME_ROUTE;
}
