// ---------------------------------------------------------------------------
// COM1-2 — player discovery and the block relationship, client side.
//
// Every function here is a thin wrapper over one SECURITY DEFINER RPC from
// migration 20260823130000. The wrappers exist to do three things and nothing
// else:
//
//   1. narrow the untrusted server row to a declared shape (no `{...row}`
//      spread anywhere in this file — see `toSearchResult`),
//   2. translate the `{ok, code}` envelope into the `SocialResult` vocabulary
//      COM1-1 established, so one mapper renders every social outcome,
//   3. keep `profiles.user_id` out of the browser. The RPCs do not return it;
//      the projections below could not carry it if they did.
//
// SEARCH IS NOT A DIRECTORY. `search_league_profiles` needs two normalised
// characters and caps itself at 20 rows server-side, whatever this client asks
// for. `admin_list_profiles()` remains the only full enumeration and it still
// requires has_role(admin).
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { toRelationship, type Relationship } from "@/lib/community/relationship";
import {
  attempt,
  BLOCK_MESSAGES,
  failure,
  success,
  type SocialResult,
} from "@/lib/community/social-result";

/** Shortest query the server will answer. Mirrors the RPC's own guard. */
export const MIN_SEARCH_LENGTH = 2;

/** Default page size. The server clamps anything above 20 regardless. */
export const SEARCH_LIMIT = 10;

/** How long typing must pause before a query is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * One search row. A superset of `LeagueProfile` plus the relationship the
 * server derived — deliberately, so a caller never has to make a second
 * round trip per result to learn what button to draw.
 */
export interface PlayerSearchResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileFrame: string | null;
  isPro: boolean;
  isBot: boolean;
  isAnonymous: boolean;
  createdAt: string | null;
  relationship: Relationship;
  /** The live friendship row, when there is one. Needed to accept or cancel. */
  friendshipId: string | null;
  /** 0 exact, 1 prefix, 2 substring. Server-assigned; used only for grouping. */
  matchRank: number;
}

/** Named-field narrowing. Anything the RPC adds later stays out until named. */
function toSearchResult(row: Record<string, unknown>): PlayerSearchResult {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    id: String(row.id ?? ""),
    displayName: str(row.display_name),
    avatarUrl: str(row.avatar_url),
    profileFrame: str(row.profile_frame),
    isPro: row.is_pro === true,
    isBot: row.is_bot === true,
    isAnonymous: row.is_anonymous === true,
    createdAt: str(row.created_at),
    relationship: toRelationship(row.relationship),
    friendshipId: str(row.friendship_id),
    matchRank: typeof row.match_rank === "number" ? row.match_rank : 2,
  };
}

/**
 * True when a query is worth sending. Normalisation matches AUTH3's
 * `normalize_display_name`: whitespace collapsed, trimmed, lower-cased. A query
 * that is only whitespace is not a short query, it is no query.
 */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isSearchable(raw: string): boolean {
  return normalizeQuery(raw).length >= MIN_SEARCH_LENGTH;
}

export interface SearchOutcome {
  results: PlayerSearchResult[];
  /** False when the query was too short to send; `results` is then empty. */
  searched: boolean;
  /** Set when the round trip itself failed. Never raw server text. */
  error?: string;
}

/**
 * Run a username search. Returns an empty, non-error outcome for a query below
 * the minimum rather than throwing, because "keep typing" is a normal state of
 * the input and not a failure of anything.
 */
export async function searchPlayers(
  raw: string,
  limit: number = SEARCH_LIMIT,
): Promise<SearchOutcome> {
  if (!isSearchable(raw)) return { results: [], searched: false };
  // Cast: the generated Supabase types are regenerated from the live database
  // and do not yet carry this RPC. Same seam as `fetchLeagueProfiles`.
  const { data, error } = await (supabase as any).rpc("search_league_profiles", {
    _query: raw,
    _limit: limit,
  });
  if (error) {
    return { results: [], searched: true, error: "Search is unavailable right now." };
  }
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return { results: rows.map(toSearchResult), searched: true };
}

/** One blocked profile, for the drawer's Blocked tab. */
export interface BlockedProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string | null;
}

/**
 * The profiles the CALLER blocked.
 *
 * This tab rendered empty from the day it was written: it read names through
 * `get_league_profiles`, which filters out every profile blocked in either
 * direction — exactly this set. `get_blocked_profiles` is the RPC that can see
 * them, and it can only ever see the caller's own blocks.
 */
export async function fetchBlockedProfiles(): Promise<BlockedProfile[]> {
  const { data, error } = await (supabase as any).rpc("get_blocked_profiles", {});
  if (error) return [];
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    blockedAt: typeof row.blocked_at === "string" ? row.blocked_at : null,
  }));
}

export interface RelationshipState {
  relationship: Relationship;
  friendshipId: string | null;
  /** Eligibility hint only. `enforce_friendship_rules` is the authority. */
  canRequest: boolean;
}

const UNAVAILABLE: RelationshipState = {
  relationship: "unavailable",
  friendshipId: null,
  canRequest: false,
};

/**
 * The canonical A↔B check. COM1-3 and anything else that needs to know whether
 * one user may send another user something should call THIS rather than
 * re-deriving it from `friendships` and `user_blocks`.
 *
 * Fails closed: a transport error resolves to `unavailable`, which offers no
 * action, rather than to `none`, which offers "Add Friend".
 */
export async function fetchRelationshipState(
  targetProfileId: string | null | undefined,
): Promise<RelationshipState> {
  if (!targetProfileId) return UNAVAILABLE;
  const { data, error } = await (supabase as any).rpc("get_relationship_state", {
    _target_profile_id: targetProfileId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return UNAVAILABLE;
  }
  const body = data as Record<string, unknown>;
  return {
    relationship: toRelationship(body.relationship),
    friendshipId: typeof body.friendship_id === "string" ? body.friendship_id : null,
    canRequest: body.can_request === true,
  };
}

/**
 * Map the `{ok, code}` envelope of a block RPC onto `SocialResult`.
 *
 * `already` is a SUCCESS on both sides: asking to block someone already
 * blocked, or unblock someone not blocked, produces the end state the caller
 * wanted. It is flagged for refetch so a stale list catches up.
 */
function fromBlockEnvelope(data: unknown, error: unknown): SocialResult {
  if (error) return failure("unavailable", BLOCK_MESSAGES);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return failure("unavailable", BLOCK_MESSAGES);
  }
  const body = data as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code : "";
  if (body.ok === true) {
    return code === "already" ? { ok: true, code: "already", refetch: true } : success();
  }
  switch (code) {
    // "You cannot block yourself" is not worth a distinct sentence in a UI that
    // never offers the control on your own profile; it is a caller bug.
    case "self":
      return failure("refused", BLOCK_MESSAGES);
    case "stale":
      return failure("stale", BLOCK_MESSAGES);
    case "forbidden":
      return failure("forbidden", BLOCK_MESSAGES);
    default:
      return failure("unavailable", BLOCK_MESSAGES);
  }
}

/**
 * Block a profile.
 *
 * ONE statement, ONE transaction. The previous client path was three round
 * trips — insert the block, read the friendships, delete them — with no
 * transaction around them, so a failure partway left the user blocked and still
 * listed as a friend. COM1-1 made that failure visible; this makes it
 * impossible.
 */
export async function blockProfile(targetProfileId: string): Promise<SocialResult> {
  const { data, error } = await (supabase as any).rpc("block_profile", {
    _target_profile_id: targetProfileId,
  });
  return fromBlockEnvelope(data, error);
}

/**
 * Unblock a profile.
 *
 * Restores eligibility to interact and nothing else. The friendship the block
 * removed is NOT recreated — rebuilding it is a deliberate act by whichever
 * party wants it.
 */
export async function unblockProfile(targetProfileId: string): Promise<SocialResult> {
  const { data, error } = await (supabase as any).rpc("unblock_profile", {
    _target_profile_id: targetProfileId,
  });
  return fromBlockEnvelope(data, error);
}

/**
 * Re-exported so a caller can wrap an unrelated PostgREST write in the same
 * outcome vocabulary without importing two modules.
 */
export { attempt };
