import { supabase } from "@/integrations/supabase/client";

/**
 * Cross-user League profile reads.
 *
 * `public.public_profiles` is a `security_invoker` view, so RLS on
 * `public.profiles` resolves every OTHER user's row to zero rows — which is why
 * friends rendered as "Unknown" and `/user/:profileId` 404'd for anyone but
 * yourself. `public.get_league_profiles(uuid[])` is the SECURITY DEFINER RPC
 * that serves those reads instead (migration 20260730150000).
 *
 * The RPC returns zero rows for unauthenticated callers and filters out
 * profiles blocked in either direction, both server-side.
 */

/**
 * The 8-column League contract. There is deliberately NO `user_id`: seven
 * `/api/quiz/*` endpoints adopt a client-supplied user id as the caller
 * identity when no verified JWT is present, so publishing auth uids
 * cross-user would supply the identifier that makes that exploitable. See the
 * migration header for the full rationale.
 */
export interface LeagueProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_frame: string | null;
  is_pro: boolean | null;
  is_bot: boolean | null;
  is_anonymous: boolean | null;
  created_at: string | null;
}

/**
 * Batch read. Returns [] on empty input or on error — the callers this
 * replaces all ignored errors and rendered a fallback, so the silent-fail
 * contract is preserved exactly.
 *
 * NOTE: profiles blocked in either direction are filtered out by the RPC. A
 * caller that needs to render blocked users (the friends drawer's Blocked tab)
 * cannot be served by this function.
 */
export async function fetchLeagueProfiles(profileIds: string[]): Promise<LeagueProfile[]> {
  const ids = Array.from(new Set(profileIds.filter(Boolean)));
  if (ids.length === 0) return [];
  // Cast: the generated Supabase types do not yet include this RPC.
  const { data, error } = await (supabase as any).rpc("get_league_profiles", {
    _profile_ids: ids,
  });
  if (error) return [];
  return (data as LeagueProfile[]) ?? [];
}

/** Single-profile convenience wrapper. Returns null when not visible. */
export async function fetchLeagueProfile(profileId: string): Promise<LeagueProfile | null> {
  const rows = await fetchLeagueProfiles([profileId]);
  return rows[0] ?? null;
}
