// Attaches the Supabase access token (regular or anonymous session) to
// FastAPI backend calls so the backend can verify identity instead of
// trusting a client-supplied user_id.
//
// Dynamic import: this module is also pulled into the Remotion webpack
// bundle (video export), where the Supabase client's import.meta.env
// access would throw — so failures degrade to unauthenticated requests.
//
// USERS1 — three helpers, and the difference between them is the whole point:
//
//   getBackendAuthHeaders()        best effort. Sends a token if one happens
//                                  to exist. Mints nothing, waits for nothing.
//   getExistingBackendAuthToken()  a token if this browser already has an
//                                  identity, null otherwise. Mints NOTHING.
//                                  The correct helper for every READ of
//                                  user-owned data.
//   ensureBackendAuthToken()       establishes an identity, anonymously if
//                                  need be. The correct helper for a WRITE,
//                                  and for nothing else.
//
// The middle one is new, and it is the fix: /quiz used to call the third one
// on mount just to ask the history endpoint whether this brand-new visitor had
// any history. It did not — but it now had an account. See
// lib/auth/anonymous-identity.ts.
import { getE2EIdentity, e2eEnabled } from "@/lib/e2e/identity";
import {
  ensureAnonymousIdentity,
  getExistingSession,
  type AnonymousIdentityReason,
} from "@/lib/auth/anonymous-identity";

/**
 * Attach the bearer token for a backend call.
 *
 * `mint` is the USERS1 write boundary, and it is an option on THIS function
 * rather than a separate export for one concrete reason: `@/lib/backend-auth`
 * is the seam 70-odd test files already mock, and every one of those mocks
 * defines `getBackendAuthHeaders` and ignores its arguments. Expressing the
 * boundary as a parameter therefore reaches every client without asking every
 * fixture in the repository to learn a new export — and, more importantly,
 * without a real `signInAnonymously()` escaping into a unit test run against
 * the production Supabase project.
 *
 * Pass it for a MUTATION and never for a read.
 */
export async function getBackendAuthHeaders(
  options?: { mint?: AnonymousIdentityReason },
): Promise<Record<string, string>> {
  // E2E acceptance override (dev-only, VITE_E2E_AUTH gated — see lib/e2e/identity).
  // In E2E mode we NEVER touch real Supabase: an injected persona → its bearer,
  // otherwise a clean unauthenticated (guest) request.
  if (e2eEnabled()) {
    const e2e = getE2EIdentity();
    return e2e ? { Authorization: `Bearer ${e2e.token}` } : {};
  }
  const session = options?.mint
    ? await ensureAnonymousIdentity(options.mint)
    : await getExistingSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The token this browser already has, or null.
 *
 * Use for reads. A null result is a legitimate answer — "no identity, so no
 * rows" — and the caller renders the empty/signed-out state rather than
 * creating an account to prove the point.
 */
export async function getExistingBackendAuthToken(): Promise<string | null> {
  if (e2eEnabled()) return getE2EIdentity()?.token ?? null;
  const session = await getExistingSession();
  return session?.access_token ?? null;
}

/**
 * Guarantee a token for a JWT-only backend endpoint, minting an anonymous
 * identity if the visitor does not have one.
 *
 * WRITES ONLY. Every call site of this function creates a Supabase auth user
 * for a visitor who did not have one, so each one must correspond to a
 * deliberate product action the person took. The single-flight guard and the
 * reasoning both live in lib/auth/anonymous-identity.ts.
 */
export async function ensureBackendAuthToken(): Promise<string | null> {
  if (e2eEnabled()) return getE2EIdentity()?.token ?? null;
  const session = await ensureAnonymousIdentity("quiz_write");
  return session?.access_token ?? null;
}
