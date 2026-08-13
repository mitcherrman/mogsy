/**
 * Which account a stored recovery record belongs to (Phase 4D).
 *
 * The recovery record names one paid request and can be re-sent with its
 * original key. Getting the identity wrong is therefore not a cosmetic bug: it
 * would let one account see — and re-send — another account's scenario, on
 * another account's credits. So identity is resolved here, in one place, and
 * everything else in the feature consumes the resulting opaque scope string.
 *
 * What is used: the Supabase user's `id`, a stable non-secret account
 * identifier. Nothing else. NOT the access token (a secret, and it rotates),
 * not the email (a personal identifier, and it can change while the account
 * cannot), not a display name, not any game/summoner identifier.
 *
 * Why not `useAuth()`: this feature's network layer already reaches Supabase
 * directly (`getBackendAuthHeaders`) rather than through the React context,
 * and mirroring that keeps the recovery scope aligned with the identity whose
 * token actually goes on the wire. A page whose auth context and bearer token
 * disagreed would namespace records under one account and have them replayed
 * under another.
 *
 * The E2E persona is honoured first, exactly as `backend-auth.ts` does, so an
 * acceptance run scopes its records to the persona it is authenticating as.
 */
import { getE2EIdentity, e2eEnabled } from "@/lib/e2e/identity";

export type AccountIdentitySource = {
  /**
   * Best-effort SYNCHRONOUS answer, or null when it is not yet known.
   *
   * Restoration must be able to decide "whose record is this?" before the
   * first paint that could offer a recovery button; a source that can answer
   * immediately avoids a flash of "no recovery" on a reload that has one.
   */
  current(): string | null;
  /** Authoritative answer. Resolves to null for a signed-out session. */
  resolve(): Promise<string | null>;
  /** Fires on every identity change (sign-in, sign-out, account switch). */
  subscribe(listener: (accountId: string | null) => void): () => void;
};

/**
 * Last id this module resolved, so `current()` can answer synchronously on a
 * remount within the same page load — which is precisely the reload-adjacent
 * case (a route change, a Suspense boundary re-resolving) where a delay would
 * hide an available recovery.
 */
let cachedAccountId: string | null = null;

const supabaseSource: AccountIdentitySource = {
  current() {
    if (e2eEnabled()) return getE2EIdentity()?.user.id ?? null;
    return cachedAccountId;
  },

  async resolve() {
    if (e2eEnabled()) {
      cachedAccountId = getE2EIdentity()?.user.id ?? null;
      return cachedAccountId;
    }
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      cachedAccountId = data.session?.user?.id ?? null;
    } catch {
      // Import or session failure means the identity is unknown, NOT that the
      // user is someone else: the caller namespaces such records separately
      // and never surfaces them to an identified account.
      cachedAccountId = null;
    }
    return cachedAccountId;
  },

  subscribe(listener) {
    if (e2eEnabled()) return () => {};
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          cachedAccountId = session?.user?.id ?? null;
          listener(cachedAccountId);
        });
        if (cancelled) data.subscription.unsubscribe();
        else unsubscribe = () => data.subscription.unsubscribe();
      } catch {
        /* no subscription is available; the resolved value stands */
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
};

let activeSource: AccountIdentitySource = supabaseSource;

export function accountIdentitySource(): AccountIdentitySource {
  return activeSource;
}

/**
 * Test seam, mirroring `client.__resetCatalogCache`.
 *
 * The page tests render the route without an `AuthProvider` and stub the
 * network, so identity needs an injectable source. Passing null restores the
 * real one and drops the cache.
 */
export function __setAccountIdentitySource(
  source: AccountIdentitySource | null
): void {
  activeSource = source ?? supabaseSource;
  cachedAccountId = null;
}

/** A fixed-identity source for tests. */
export function fixedIdentitySource(accountId: string | null): AccountIdentitySource {
  const listeners = new Set<(id: string | null) => void>();
  let id = accountId;
  return {
    current: () => id,
    resolve: async () => id,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Exposed for tests that switch accounts mid-session.
    ...({
      __set(next: string | null) {
        id = next;
        for (const listener of listeners) listener(next);
      },
    } as Record<string, unknown>),
  } as AccountIdentitySource & { __set(next: string | null): void };
}
