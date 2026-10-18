// EMAIL1 — turns the signup checkbox INTENT into a pending double-opt-in
// request, once, after the account is permanent.
//
// Safe by construction:
//  * Does nothing unless the feature flag is on AND this account carries an
//    intent. Every pre-existing account has none, so no existing user can be
//    touched by this code path.
//  * The browser sends no address and no topics: the server reads the intent
//    from the account itself, restricts it to what a signup form may offer,
//    and always mails the account's own address.
//  * Attempted at most once per user per page load; the server clears the
//    intent on success, and a failure simply leaves it for the next load.

import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isEmailSubscriptionsEnabled } from "./flag";
import { hasSignupIntent } from "./signup-intent";
import { consumeSignupIntent } from "./subscription-client";

export function useEmailSignupIntent(user: User | null): void {
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isEmailSubscriptionsEnabled()) return;
    if (!user || user.is_anonymous === true || !user.email) return;
    if (!hasSignupIntent(user.user_metadata)) return;
    if (attemptedFor.current === user.id) return;
    attemptedFor.current = user.id;

    void (async () => {
      try {
        const outcome = await consumeSignupIntent();
        // Pull the cleared metadata into the local session so the intent is
        // not seen again. Best effort: the server is authoritative either way.
        if (outcome.ok) await supabase.auth.refreshSession();
      } catch {
        /* never surfaces: this is a background nicety, not part of signup */
      }
    })();
  }, [user]);
}
