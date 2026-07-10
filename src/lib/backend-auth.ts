// Attaches the Supabase access token (regular or anonymous session) to
// FastAPI backend calls so the backend can verify identity instead of
// trusting a client-supplied user_id.
//
// Dynamic import: this module is also pulled into the Remotion webpack
// bundle (video export), where the Supabase client's import.meta.env
// access would throw — so failures degrade to unauthenticated requests.
export async function getBackendAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
