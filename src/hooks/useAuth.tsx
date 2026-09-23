import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  ensureProfilePermanent,
  initiateAnonymousEmailUpgrade,
  syncProfilePermanent,
  type UpgradeResult,
} from "@/lib/auth/account-upgrade";
import { getE2EIdentity, e2eSession, e2eEnabled } from "@/lib/e2e/identity";
import { observeAuthIdentity } from "@/lib/analytics";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * Create a brand-new permanent account.
   *
   * AUTH1: resolves with `session` so the caller can tell an IMMEDIATELY
   * usable account (Supabase "Confirm email" off — a session comes back and
   * the user is already signed in) from one awaiting a confirmation link
   * (session null). Email verification must never be the difference between
   * "can use Mogzy" and "cannot", so the caller routes the user onward the
   * moment a session exists rather than parking them on a check-your-email
   * screen. The confirmation branch is retained, not deleted.
   */
  signUp: (
    email: string,
    password: string,
    /**
     * AUTH3: the public username the visitor already chose — at /welcome, or
     * on the signup form itself. Passed as auth metadata so handle_new_user()
     * writes it on the profile row it is already creating, in the same
     * transaction, instead of leaving the account nameless until a follow-up
     * write lands. The trigger accepts it only if it is valid AND free; when
     * it is not, the row is created with '' and the caller's claim reports
     * why. Omitted entirely when there is no name to carry.
     */
    displayName?: string,
  ) => Promise<{ error: any; session: Session | null }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  /**
   * Anonymous -> permanent upgrade, in place. Sets the password and attaches
   * the email to the CURRENT anonymous user via updateUser — it NEVER signs
   * out and NEVER calls signUp().
   *
   * AUTH1: resolves with `converted: true` when the account is permanent
   * immediately (no confirmation link required), so the caller can route the
   * guest straight back to what they were doing. `converted: false` means a
   * confirmation email is outstanding and the retained pending flow applies.
   */
  upgradeAnonymousEmail: (
    email: string,
    password: string,
    redirectTo: string,
  ) => Promise<UpgradeResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * FUNNEL1B2 — the single place a signup is recognised.
   *
   * `observeAuthIdentity` emits `signup_completed` on exactly one thing: the
   * SAME account ceasing to be anonymous. It is deliberately here rather than
   * in any signup UI, because the transition can complete long after every
   * form has unmounted — a guest who takes the email-confirmation branch
   * becomes registered when they click the link and come back, and no
   * `submit()` callback is alive to see it.
   *
   * It is not a signup counter for every registered user it sees: a first
   * sighting is a sign-in, and treating it otherwise would recreate the
   * inflated number this work exists to replace (docs/FUNNEL1_HANDOFF.md §8).
   * Brand-new accounts with no guest session are reported by the signup form
   * itself. Both paths dedupe on the uid, so neither can fire twice.
   *
   * Runs on every identity change, including the initial resolve; the function
   * is a no-op for anything that is not the transition.
   */
  useEffect(() => {
    observeAuthIdentity(user);
  }, [user]);

  useEffect(() => {
    let mounted = true;

    // E2E acceptance override (dev-only, VITE_E2E_AUTH gated). In E2E mode we
    // NEVER wire up Supabase: an injected persona hydrates a synthetic session,
    // otherwise the app is a clean signed-out guest (no real anonymous sign-in).
    if (e2eEnabled()) {
      const e2e = getE2EIdentity();
      if (e2e) {
        const { user: synthUser, session: synthSession } = e2eSession(e2e);
        setSession(synthSession);
        setUser(synthUser);
      } else {
        setSession(null);
        setUser(null);
      }
      setLoading(false);
      return () => { mounted = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Initialize: resolve whatever session this browser already has. Nothing
    // here creates one — see the USERS1 note below.
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        if (mounted) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
        }
        // AUTH2: reconcile a permanent auth user whose profile row still says
        // anonymous. Those two flags are written by different systems, and when
        // they disagree the admin purge believes the profile and deletes a real
        // account. Fire-and-forget: never gates loading, never surfaces an error.
        if (session.user.is_anonymous !== true) {
          void ensureProfilePermanent(session.user.id);
        }
        return;
      }

      // USERS1 — NO ANONYMOUS SIGN-IN HERE, AND NONE ANYWHERE ON A PAGE LOAD.
      //
      // This branch used to read the `require_auth` app_setting and, when it
      // was disabled (which it is in production), call signInAnonymously()
      // before resolving `loading`. Every browser that rendered any page of
      // Mogzy therefore became a row in auth.users: crawlers, preview
      // environments, agent runs, automated QA and the same handful of humans
      // over and over. ~5,000 identities, essentially all of them page loads.
      //
      // A page visit is not a user account. A visitor without a session is a
      // legitimate, fully supported state that the rest of the product already
      // handles — ProtectedRoute lets everyone through while require_auth is
      // off, the analytics store grants INSERT to the `anon` role so the whole
      // funnel is still recorded, and the Academy register already has a
      // device-local half precisely because "there is very often no session at
      // /welcome" (lib/welcome/academy-registration.ts).
      //
      // An identity is created at a WRITE boundary and nowhere else. There is
      // exactly one function that does it and it documents every caller:
      // lib/auth/anonymous-identity.ts.
      if (mounted) {
        setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const name = (displayName ?? "").replace(/\s+/g, " ").trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        // Only sent when there is actually a name. An empty metadata key would
        // be indistinguishable from "no name given" at the trigger anyway, and
        // writing one would put a meaningless field on every auth user.
        ...(name ? { data: { display_name: name } } : {}),
      },
    });
    // `data.session` is non-null only when the project does not require email
    // confirmation. That is the signal — not a guess about configuration —
    // that the account is usable right now.
    return { error, session: data?.session ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    await supabase.auth.signOut();
  };

  const upgradeAnonymousEmail = async (
    email: string,
    password: string,
    redirectTo: string,
  ): Promise<UpgradeResult> => {
    // Guard: only an authenticated anonymous user may be upgraded. Never fall
    // back to signUp() and never sign out.
    if (!user) {
      return { ok: false, error: "No active session to upgrade. Please reload." };
    }
    if (user.is_anonymous !== true) {
      // AUTH2: this is reached when the FIRST attempt already converted auth but
      // its profile write failed, so the user pressed the button again. The
      // account genuinely exists and is theirs — telling them "already
      // registered" would strand them on a form they can never satisfy. Finish
      // the half-done job instead and let the caller route them onward.
      const sync = await syncProfilePermanent(user.id);
      if (!sync.ok) {
        console.error("[auth:upgrade] repair sync failed", sync.error);
      }
      return { ok: true, converted: true };
    }
    return initiateAnonymousEmailUpgrade({ userId: user.id, email, password, redirectTo });
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signUp, signIn, signOut, upgradeAnonymousEmail }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
