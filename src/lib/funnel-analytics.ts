import { supabase } from "@/integrations/supabase/client";

export type FunnelEventName =
  | "lol_landing_viewed"
  | "lol_start_quiz_clicked"
  // Welcome overlay CTA (src/components/lol/LolWelcomeIntro.tsx) — the
  // tutorial-entry sibling of lol_start_quiz_clicked. Payload is the CTA id.
  | "lol_start_tutorial_clicked"
  | "quiz_guest_started"
  | "quiz_question_answered"
  | "quiz_completed"
  // PT1.7A — the bounded Free remediation loop on the Practice results screen
  // ("practise the ones you just missed"). Payload is the set name and a
  // count; no question id, no answer, ever.
  | "practice_missed_started"
  | "quiz_results_viewed"
  | "quiz_signup_gate_shown"
  | "quiz_signup_clicked"
  | "quiz_guest_continue_clicked"
  | "auth_signup_viewed_from_quiz"
  | "auth_signup_completed_from_quiz"
  // Global HUD guest conversion (src/components/hud/GlobalHud.tsx): the chip
  // beside the account control and the account-menu signup entry. Route and
  // guest-ness are captured automatically below; the payload carries the
  // returnTo the CTA encoded, matching quiz_signup_clicked.
  | "hud_signup_chip_clicked"
  | "hud_signup_menu_clicked"
  // Provider-neutral ad lifecycle (src/lib/ads/) — payload is placement/provider/reason only.
  | "ad_slot_eligible"
  | "ad_slot_rendered"
  | "ad_slot_suppressed"
  | "ad_slot_error"
  | "house_ad_clicked"
  // Daily Score Attack (production) — no question/answer content, ever.
  | "dsa_entry_viewed"
  | "dsa_official_cta_clicked"
  | "dsa_signin_gate_shown"
  | "dsa_official_started"
  | "dsa_official_resumed"
  | "dsa_practice_started"
  | "dsa_answer_resolved"
  | "dsa_run_expired"
  | "dsa_run_completed"
  | "dsa_results_viewed"
  | "dsa_practice_replay_clicked"
  | "dsa_legacy_fallback";

/**
 * Fire-and-forget funnel event. Never throws, never blocks gameplay —
 * same silent-fail contract as logAdEvent in ad-analytics.ts.
 */
export function trackFunnelEvent(
  eventName: FunnelEventName,
  payload?: Record<string, unknown>,
) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data?.session?.user;
      // Table is newer than the generated Supabase types, so the client is cast
      // to reach it. `ad_events` no longer needs this — `funnel_events` still does.
      await (supabase as any).from("funnel_events").insert({
        event_name: eventName,
        route: window.location.pathname,
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        is_guest: sessionUser ? !!sessionUser.is_anonymous : true,
        source: "lol_funnel",
        user_id: sessionUser?.id ?? null,
        payload: payload ?? null,
      });
    } catch {
      // silently fail — analytics must not break the quiz flow
    }
  })();
}
