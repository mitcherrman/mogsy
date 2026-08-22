import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

import { adoptAcademyIdentity } from "@/lib/welcome/provisional-identity";

/**
 * Carries the Academy registration into a real profile as soon as one exists
 * (HI1-C5B).
 *
 * WHY A BRIDGE AND NOT A CALL AT THE REGISTER. The register writes through
 * immediately when there IS a session, but at /welcome there usually is not:
 * anonymous sign-in only happens when the `require_auth` app_settings row is
 * disabled, so a first-time visitor answers the register as a pure signed-out
 * guest. The answers are durable USER data, so they cannot simply sit in
 * localStorage until the person happens to open a screen that writes profiles —
 * something has to be watching for the moment an account appears. This is that
 * something, mounted once beside useAuthQuerySync and following the same shape:
 * subscribe to auth, act only when the identity actually changes.
 *
 * IT IS ALSO THE ONE RETRY. A profile row can lag its auth user by a moment
 * (handle_new_user runs on the auth trigger), and a write can fail. Both leave
 * the local record unadopted, and every later auth event — including the
 * INITIAL_SESSION that fires on the next page load — is another attempt. A
 * record that has been settled short-circuits inside adoptAcademyIdentity
 * before any network call, so the steady state costs nothing.
 *
 * NOTHING HERE BLOCKS OR THROWS. It renders no UI, it never suspends, and every
 * path inside the adoption resolves. A visitor must never be able to tell this
 * ran.
 */
export function useAcademyIdentitySync() {
  // The last identity an adoption was attempted for. Guards the duplicate
  // events Supabase emits (TOKEN_REFRESHED, USER_UPDATED) from re-running a
  // read for an account that has already been considered this session.
  const attemptedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;

    const attempt = (userId: string | null) => {
      if (!userId || !live) return;
      if (attemptedFor.current === userId || inFlight.current) return;
      attemptedFor.current = userId;
      inFlight.current = true;
      void adoptAcademyIdentity(userId)
        .then((result) => {
          // A recoverable outcome must be reachable again — the profile row may
          // simply not have been written yet. Clearing the marker lets the next
          // auth event (or the next page load) try the same account again.
          if (live && !result.settled) attemptedFor.current = null;
        })
        // The adoption catches everything internally, and this catches the
        // case where one day it does not. An unhandled rejection out of an
        // auth listener is a console error on every page of the app.
        .catch(() => {
          attemptedFor.current = null;
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        attemptedFor.current = null;
        return;
      }
      attempt(session?.user?.id ?? null);
    });

    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
}
