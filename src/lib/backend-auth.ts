// Attaches the Supabase access token (regular or anonymous session) to
// FastAPI backend calls so the backend can verify identity instead of
// trusting a client-supplied user_id.
//
// Dynamic import: this module is also pulled into the Remotion webpack
// bundle (video export), where the Supabase client's import.meta.env
// access would throw — so failures degrade to unauthenticated requests.
import { getE2EIdentity, e2eEnabled } from "@/lib/e2e/identity";

export async function getBackendAuthHeaders(): Promise<Record<string, string>> {
  // E2E acceptance override (dev-only, VITE_E2E_AUTH gated — see lib/e2e/identity).
  // In E2E mode we NEVER touch real Supabase: an injected persona → its bearer,
  // otherwise a clean unauthenticated (guest) request.
  if (e2eEnabled()) {
    const e2e = getE2EIdentity();
    return e2e ? { Authorization: `Bearer ${e2e.token}` } : {};
  }
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Guest-first guarantee for JWT-only backend endpoints (e.g. quiz history):
// make sure a Supabase session — anonymous if need be — exists and return its
// access token, or null if a guest session genuinely can't be established.
export async function ensureBackendAuthToken(): Promise<string | null> {
  if (e2eEnabled()) return getE2EIdentity()?.token ?? null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;

    const { data: anon } = await supabase.auth.signInAnonymously();
    if (anon?.session?.access_token) return anon.session.access_token;

    // A concurrent sign-in (e.g. AuthProvider init) may land the session a
    // tick later via onAuthStateChange — poll briefly before giving up.
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const { data: retry } = await supabase.auth.getSession();
      if (retry.session?.access_token) return retry.session.access_token;
    }
    return null;
  } catch {
    return null;
  }
}
