import { supabase } from "@/integrations/supabase/client";

export type FunnelEventName =
  | "lol_landing_viewed"
  | "lol_start_quiz_clicked"
  | "quiz_guest_started"
  | "quiz_question_answered"
  | "quiz_completed"
  | "quiz_results_viewed"
  | "quiz_signup_gate_shown"
  | "quiz_signup_clicked"
  | "quiz_guest_continue_clicked"
  | "auth_signup_viewed_from_quiz"
  | "auth_signup_completed_from_quiz";

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
      // Table is newer than the generated Supabase types — cast like ad-analytics.
      await (supabase as any).from("funnel_events").insert({
        event_name: eventName,
        route: window.location.pathname,
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        is_guest: sessionUser ? !!(sessionUser as any).is_anonymous : true,
        source: "lol_funnel",
        user_id: sessionUser?.id ?? null,
        payload: payload ?? null,
      });
    } catch {
      // silently fail — analytics must not break the quiz flow
    }
  })();
}
