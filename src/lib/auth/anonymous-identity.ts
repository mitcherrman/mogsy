// ---------------------------------------------------------------------------
// USERS1 — the ONE place a Supabase anonymous identity is created.
//
// WHAT WENT WRONG, so nobody reintroduces it.
//
// Before this module there were six independent callers of
// `supabase.auth.signInAnonymously()`: AuthProvider's boot sequence, and a
// mount effect on each of /lol, /quiz, Combat Lab and Meta Reflex, plus the
// backend token helper. Five of the six fired on PAGE LOAD. The result is
// exactly what you would predict: production accumulated ~5,000 rows in
// auth.users, overwhelmingly one per browser that had ever rendered a page —
// crawlers, previews, agent runs, QA, and the same three humans over and over.
// "Guest identities: 5,029" was not an audience. It was a page-view counter
// with a foreign key.
//
//
// THE RULE NOW
//
//   A page visit is not a user account.
//
//   browser visitor
//       -> analytics visitor + session      (localStorage, no auth, always)
//       -> meaningful product interaction
//       -> anonymous auth identity          (here, and only here)
//       -> registered account               (signup / guest upgrade)
//
// Analytics never needs this: `analytics_visitors`, `analytics_sessions` and
// `analytics_events` all grant INSERT to the `anon` role, so the whole funnel
// is recorded for a browser that has no session at all. Identity is minted for
// one reason only — a WRITE that the database or the backend attributes to
// auth.uid() and would otherwise reject.
//
//
// WHERE THE BOUNDARY ACTUALLY IS, derived from the code and not assumed
//
//   Leaguecraft / practice   quiz attempt + session writes    lib/quiz/api.ts authedRequest
//   Study Hall / builder     saving and running a set         the same authedRequest path
//   Daily Challenge          starting / advancing a run       lib/daily-challenge/run/client.ts (POST only)
//   Ranked                   match writes                     lib/ranked-public/client.ts (non-GET)
//   Champion Mastery         session writes                   features/mastery/live/api.ts (non-GET)
//   Stat Check online        creating / joining a room        lib/stat-check-online/client.ts (non-GET)
//   Combat Lab               running a metered simulation     lib/combat-lab/api.ts (non-GET)
//   Combat Sim Battles       submitting a prediction          lib/combat-battles/api.ts (non-admin, non-GET)
//   Team Sim                 submitting a billable run        lib/combat-lab/team-sim/client.ts
//   Meta Reflex              casting a vote                   pages/LeagueSwipeGame.tsx
//
// The clients above express the rule as "non-GET mints, GET does not". That is
// not laziness about which endpoint needs what — it is the honest boundary:
// their backends attribute every mutation to the verified JWT subject, and
// none of their reads do anything with an identity that a guest needs.
//
// READS ARE NOT A BOUNDARY. "Show me my history", "show me my progress" and
// "show me my saved sets" return nothing for a visitor who has never played,
// so minting an account to discover that a brand-new visitor has no history is
// precisely the pollution this module exists to stop. Those call sites use
// `getExistingBackendAuthToken()` (lib/backend-auth.ts), which never mints.
// ---------------------------------------------------------------------------

import type { Session } from "@supabase/supabase-js";
import { e2eEnabled } from "@/lib/e2e/identity";

/**
 * Why an identity is being minted. Free text, but every call site passes a
 * short stable string so that a console trace, or a future audit of this file,
 * can answer "which product action created these accounts?" without guessing.
 */
export type AnonymousIdentityReason =
  | "quiz_write"
  | "daily_challenge_run"
  | "mastery_write"
  | "meta_reflex_vote"
  | "builder_write"
  | "ranked_write"
  | "stat_check_room"
  | "combat_lab_run"
  | "combat_battles_prediction"
  | "team_sim_run";

/**
 * Single-flight. Several writes fire within a few milliseconds of each other
 * at the start of a quiz (create session, submit answer); without this, each
 * one reaches signInAnonymously() and mints a SEPARATE throwaway account for
 * the same visitor. This guard predates USERS1 — it lived in backend-auth.ts —
 * and it is moved here so it covers every minting path rather than one of them.
 */
let inFlight: Promise<Session | null> | null = null;

/**
 * Return the current Supabase session, creating an anonymous identity if there
 * is none.
 *
 * Call this ONLY at a real write boundary. Never in a mount effect, never in a
 * route guard, never "so the id is ready".
 */
export async function ensureAnonymousIdentity(
  reason: AnonymousIdentityReason,
): Promise<Session | null> {
  if (e2eEnabled()) return null;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;

      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (anon?.session) return anon.session;
      if (error && import.meta.env.DEV) {
        console.warn(`[auth:anonymous] mint failed (${reason})`, error.message);
      }

      // A concurrent sign-in elsewhere may land the session a tick later via
      // onAuthStateChange — poll briefly before giving up.
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const { data: retry } = await supabase.auth.getSession();
        if (retry.session) return retry.session;
      }
      return null;
    } catch {
      return null;
    }
  })();

  try {
    return await inFlight;
  } finally {
    // Cleared either way: a failed attempt must not pin every later caller to
    // null, and a success is re-read from getSession() next time anyway.
    inFlight = null;
  }
}

/**
 * The current session, or null. NEVER mints.
 *
 * This is the default for anything that reads user-owned data. A null result
 * means "this browser has no identity", which for a read is an answer, not a
 * failure: render the signed-out state.
 */
export async function getExistingSession(): Promise<Session | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** Test-only: drop the single-flight promise between fixtures. */
export function resetAnonymousIdentityForTests(): void {
  inFlight = null;
}
