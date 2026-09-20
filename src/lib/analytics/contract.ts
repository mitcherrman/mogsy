/**
 * FUNNEL1B1 — the canonical event contract.
 *
 * ONE vocabulary, in one file, for one store. The rule that keeps it that way:
 * a macro event is a question the business asks, not a thing a component does.
 * Component-level detail belongs in `metadata`, not in a new event name.
 *
 *
 * WHAT IS A MACRO EVENT AND WHAT IS NOT
 *
 * MACRO_EVENTS below is the funnel. Everything in PRODUCT_EVENTS is telemetry
 * that is useful, retained, and deliberately NOT part of the acquisition
 * funnel — the Premium Practice Builder, Trends, the ad lifecycle, the DSA
 * micro-events. They share the table, the identity model and the emitter;
 * they do not share the funnel. Mixing them was how the previous vocabulary
 * reached 44 names with no way to tell which nine mattered.
 *
 *
 * DEVIATIONS FROM THE B1 BRIEF'S SUGGESTED LIST, AND WHY
 *
 *  · `practice_started` / `practice_completed` are named
 *    `practice_quiz_started` / `_completed`. "Practice" alone is ambiguous in
 *    this product — there is a Practice Quiz, a Practice Builder, a DSA
 *    practice run and a practice-the-missed loop, and three of them already
 *    have events. The two extra words remove a reader's coin flip forever.
 *
 *  · `signup_started` is emitted, and `signup_viewed` is kept beside it, not
 *    merged into it. Seeing the signup screen and beginning to fill it in are
 *    different denominators, and the gap between them is the single number
 *    that tells you whether the form or the offer is the problem.
 *
 *  · `mode_opened` from the handoff's §9.1 is NOT adopted as the only mode
 *    event. `ranked_opened` and friends are separate names, because an
 *    event-name index answers "how many opened Ranked this week" with one
 *    range scan, whereas a single name discriminated by a jsonb field makes
 *    every mode question a jsonb filter. The macro set is small enough that
 *    naming them costs nothing.
 *
 *  · There is no `returned` event, per the brief. Return is derived from
 *    analytics_sessions grouped by visitor_id, which is strictly better: it is
 *    correct retroactively, it cannot be double-fired, and it does not depend
 *    on the client agreeing about what "returned" means.
 *
 *
 * ON `*_started` / `*_completed` FOR GAMEPLAY
 *
 * These names exist here so the vocabulary is complete and so B2 has a
 * contract to emit against. They are reserved for SERVER-AUTHORITATIVE
 * emission from Railway. A browser can physically insert one — the vocabulary
 * does not stop it — but it will carry source_system = 'web' (the database
 * forbids anything else from a browser, see the migration's §2), and no
 * completion count may ever be computed from a 'web' row. The authority
 * question is answered by the column, not by the name.
 */

/** The acquisition and conversion funnel. Nine questions, seventeen names. */
export const MACRO_EVENTS = [
  // Acquisition
  "landing_viewed",
  "hub_entered",
  "leaguecraft_opened",

  // Mode intent (client-owned: opening a mode is a browser fact)
  "practice_quiz_opened",
  "ranked_opened",
  "meta_reflex_opened",
  "mastery_opened",
  "dsa_opened",

  // Mode outcome (server-authoritative: reserved for Railway/Supabase emission)
  "practice_quiz_started",
  "practice_quiz_completed",
  "ranked_started",
  "ranked_completed",
  "meta_reflex_started",
  "meta_reflex_completed",
  "mastery_started",
  "mastery_completed",
  "dsa_started",
  "dsa_completed",

  // Conversion
  "signup_viewed",
  "signup_started",
  "signup_completed",

  // Verification (contract only in FUNNEL1 — the feature is a later workstream)
  "verification_started",
  "verification_completed",
  "verification_failed",
] as const;

export type MacroEventName = (typeof MACRO_EVENTS)[number];

/**
 * Non-funnel telemetry. Carried over from the previous vocabulary so the 34
 * existing call sites keep working against the new store without being
 * rewritten in this phase — retargeting them is B2's job, and renaming them
 * here would have meant touching every product surface in a schema phase.
 *
 * Two names from that list are NOT carried over: `lol_landing_viewed` and
 * `lol_start_quiz_clicked`. Both are in MACRO_EVENTS' territory under correct
 * names (`hub_entered`, `leaguecraft_opened`) and the audit's finding was that
 * keeping them would keep the lie. They are mapped, not preserved — see
 * LEGACY_EVENT_ALIASES.
 */
export const PRODUCT_EVENTS = [
  "quiz_guest_started",
  "quiz_question_answered",
  "quiz_completed",
  "quiz_results_viewed",
  "quiz_signup_gate_shown",
  "quiz_signup_clicked",
  "quiz_guest_continue_clicked",
  "auth_signup_viewed_from_quiz",
  "auth_signup_completed_from_quiz",
  "hud_signup_chip_clicked",
  "hud_signup_menu_clicked",
  "practice_missed_started",
  "practice_builder_opened",
  "practice_builder_pool_selected",
  "practice_builder_filters_changed",
  "practice_builder_build_attempted",
  "practice_builder_build_succeeded",
  "practice_builder_insufficient_pool",
  "practice_builder_entitlement_refused",
  "practice_builder_set_created",
  "practice_builder_set_run",
  "trends_opened",
  "trends_window_changed",
  "trends_practice_weakness_clicked",
  "ad_slot_eligible",
  "ad_slot_rendered",
  "ad_slot_suppressed",
  "ad_slot_error",
  "house_ad_clicked",
  "dsa_entry_viewed",
  "dsa_official_cta_clicked",
  "dsa_signin_gate_shown",
  "dsa_official_started",
  "dsa_official_resumed",
  "dsa_practice_started",
  "dsa_answer_resolved",
  "dsa_run_expired",
  "dsa_run_completed",
  "dsa_results_viewed",
  "dsa_practice_replay_clicked",
  "dsa_legacy_fallback",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export type AnalyticsEventName = MacroEventName | ProductEventName;

/**
 * The two misnamed legacy events, resolved at the emitter so the call sites in
 * LolHub.tsx do not have to change in this phase. `lol_landing_viewed` has
 * fired on the Hub — not the landing — since the root entrance shipped; the
 * store records what actually happened.
 */
export const LEGACY_EVENT_ALIASES: Readonly<Record<string, MacroEventName>> = {
  lol_landing_viewed: "hub_entered",
  lol_start_quiz_clicked: "leaguecraft_opened",
};

const KNOWN_EVENTS = new Set<string>([...MACRO_EVENTS, ...PRODUCT_EVENTS]);
const MACRO_SET = new Set<string>(MACRO_EVENTS);

export function isKnownEvent(name: string): name is AnalyticsEventName {
  return KNOWN_EVENTS.has(name);
}

export function isMacroEvent(name: string): name is MacroEventName {
  return MACRO_SET.has(name);
}

/**
 * Mirrors analytics_events_event_name_shape in the migration. Checked client-
 * side too, because a name that fails the CHECK is rejected by the database
 * with a 400 that the silent-fail contract would then swallow — the developer
 * would see nothing. Here it produces a diagnostics entry naming the event.
 */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Open string, never a database enum — the migration stores `text`. Adding a
 * verification method must be one line here, not a migration with a deploy
 * ordering problem.
 *
 * Verification is NOT one global boolean. A user may hold several of these
 * independently, and "verified" is always a question about a specific method.
 * `verification_completed` rows grouped by verification_type is the answer;
 * there is deliberately no aggregate flag anywhere in this contract.
 */
export const VERIFICATION_TYPES = ["email", "discord", "league_ign"] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number] | (string & {});

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

/**
 * WHAT COUNTS AS A SIGNUP.
 *
 * Not a `profiles` row. `handle_new_user` inserts one for every anonymous
 * session, which is why the Admin signup counter is inflated today by every
 * guest who ever loaded the Hub (audit §8 — a live, visible defect).
 *
 * A signup is the transition of an auth identity from anonymous to registered,
 * or the creation of a registered identity outright. Mogzy upgrades the guest
 * identity IN PLACE, so the Supabase uid survives — which is the strongest
 * asset in the whole model and also the reason the naive count is wrong: the
 * uid existed before the signup did.
 *
 * `isRegisteredUser` is the predicate that excludes anonymous users, and
 * `signup_completed` carries `upgraded_from_guest` so the two populations
 * (guest→registered, and registered-from-first-contact) stay separable
 * forever. No auth refactor happens in B1; this is the contract B2 emits
 * against and the one an Admin query should trust instead of profiles.
 */
export function isRegisteredUser(
  user: { is_anonymous?: boolean | null } | null | undefined,
): boolean {
  return Boolean(user) && !user!.is_anonymous;
}

export type SignupMethod = "email" | "oauth_discord" | "oauth_google" | (string & {});

// ---------------------------------------------------------------------------
// Server authority
// ---------------------------------------------------------------------------

export type SourceSystem = "web" | "railway" | "supabase";

/**
 * The idempotency key for a server-authoritative event, mirroring the partial
 * unique index in the migration. Present here so B2's Railway emitter and the
 * database agree on one definition rather than two that drift.
 *
 * The granularity IS the definition of "the same event", and getting it wrong
 * is a silent data-loss bug: keying ranked_started on the match rather than
 * the participant would drop four of five players' rows on conflict. Hence
 * the explicit type rather than two loose strings.
 */
export type ServerEventIdentity = {
  sourceSystem: Exclude<SourceSystem, "web">;
  /** e.g. "ranked_match", "ranked_participant", "quiz_session", "dsa_run". */
  entityType: string;
  entityId: string;
};
