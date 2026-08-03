// ---------------------------------------------------------------------------
// Master-admin user directory — data contract and server calls.
//
// Pure except for the four thin Supabase wrappers at the bottom, so the
// projection, filtering and sorting are unit-testable without a database.
//
// WHY A PROJECTION EXISTS AT ALL
// `admin_list_profiles()` is `RETURNS SETOF public.profiles` — it hands an admin
// ALL 31 columns, including `user_id`, `admin_notes`, `is_flagged_underage`,
// and the whole legacy dating set (`age`, `location`, `status_message`,
// `socials`, `custom_theme`, `diamonds`, ...). Spreading that row into React
// state is how those fields end up in a snapshot, a log, or a stray render.
//
// `toDirectoryProfile` is therefore an explicit allow-list: it names every
// field that may leave this module and drops everything else. In particular it
// NEVER carries `user_id`. Auth ids are not needed by any admin user-directory
// feature — `admin_link_friendship` resolves the actor from `auth.uid()`
// server-side and takes only a profile id — so there is no reason for one to
// reach the browser.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

export const ADMIN_USERS_PATH = "/admin/users";

/** The only profile fields the admin directory may hold or render. */
export interface AdminDirectoryProfile {
  /** public.profiles.id — the public profile identifier used in /user/:profileId */
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileFrame: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  isPro: boolean;
  isBot: boolean;
  isDisabled: boolean;
  isAnonymous: boolean;
  onboardingCompleted: boolean;
  /** Role names from public.user_roles, resolved separately. */
  roles: string[];
}

/**
 * Narrow one raw `admin_list_profiles()` row to the safe contract.
 *
 * Deliberately reads named fields rather than spreading. Anything not named
 * here — starting with `user_id` — cannot reach the caller.
 */
export function toDirectoryProfile(row: Record<string, unknown>): AdminDirectoryProfile {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const bool = (v: unknown): boolean => v === true;
  return {
    id: String(row.id ?? ""),
    displayName: str(row.display_name),
    avatarUrl: str(row.avatar_url),
    profileFrame: str(row.profile_frame),
    createdAt: str(row.created_at),
    lastSeenAt: str(row.last_seen_at),
    isPro: bool(row.is_pro),
    isBot: bool(row.is_bot),
    isDisabled: bool(row.is_disabled),
    isAnonymous: bool(row.is_anonymous),
    onboardingCompleted: bool(row.onboarding_completed),
    roles: [],
  };
}

// ---------------------------------------------------------------------------
// Filtering and sorting (pure)
// ---------------------------------------------------------------------------

export const DIRECTORY_FILTERS = [
  "all",
  "real",
  "anonymous",
  "bots",
  "disabled-bots",
  "pro",
  "admins",
] as const;
export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

export const DIRECTORY_FILTER_LABELS: Record<DirectoryFilter, string> = {
  all: "All",
  real: "Real users",
  anonymous: "Anonymous",
  bots: "Bots",
  "disabled-bots": "Disabled bots",
  pro: "Pro",
  admins: "Admins",
};

const ADMIN_ROLES = new Set(["admin", "master_admin"]);

export function matchesFilter(p: AdminDirectoryProfile, filter: DirectoryFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    // "Real users" means a human account: not a bot and not an anonymous guest.
    case "real":
      return !p.isBot && !p.isAnonymous;
    case "anonymous":
      return p.isAnonymous;
    // Every bot, enabled or not — so a disabled bot is never invisible to an
    // admin. "Disabled bots" narrows to the retired ones.
    case "bots":
      return p.isBot;
    case "disabled-bots":
      return p.isBot && p.isDisabled;
    case "pro":
      return p.isPro;
    case "admins":
      return p.roles.some((r) => ADMIN_ROLES.has(r));
  }
}

/** Case-insensitive display-name substring match. Empty query matches all. */
export function matchesSearch(p: AdminDirectoryProfile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (p.displayName ?? "").toLowerCase().includes(q);
}

/** Newest accounts first. Rows with no created_at sort last, stably. */
export function sortByNewest(list: AdminDirectoryProfile[]): AdminDirectoryProfile[] {
  return [...list].sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const bt = b.createdAt ? Date.parse(b.createdAt) : NaN;
    const aOk = Number.isFinite(at);
    const bOk = Number.isFinite(bt);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return bt - at;
  });
}

export function applyDirectoryView(
  list: AdminDirectoryProfile[],
  filter: DirectoryFilter,
  query: string,
): AdminDirectoryProfile[] {
  return sortByNewest(list.filter((p) => matchesFilter(p, filter) && matchesSearch(p, query)));
}

/** Canonical profile link. `/profile/:id` is NOT a route — `/user/:profileId` is. */
export function profileHref(p: Pick<AdminDirectoryProfile, "id">): string {
  return `/user/${p.id}`;
}

// ---------------------------------------------------------------------------
// Server calls
// ---------------------------------------------------------------------------

export type LinkFriendshipCode =
  | "created"
  | "already_friends"
  | "pending_exists"
  | "self"
  | "blocked"
  | "target_not_found"
  | "target_disabled"
  | "no_actor_profile";

export interface LinkFriendshipResult {
  ok: boolean;
  code: LinkFriendshipCode | "error";
  /** Present only for outcomes that reference a row. Never an auth id. */
  friendshipId?: string | null;
}

/** Human-readable outcome, one message per structured code. */
export const LINK_FRIENDSHIP_MESSAGES: Record<LinkFriendshipCode | "error", string> = {
  created: "Added to your friends.",
  already_friends: "Already in your friends — nothing changed.",
  pending_exists:
    "There is already a pending friend request with this person. Answer it in your friends drawer instead.",
  self: "That is your own profile.",
  blocked: "Blocked — a block exists between you and this profile.",
  target_not_found: "That profile no longer exists.",
  target_disabled: "That bot is disabled. Re-enable it before adding it.",
  no_actor_profile: "Your admin account has no profile row yet.",
  error: "Couldn't complete the request. Nothing was changed.",
};

function readJson(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/**
 * Load the directory. Roles are fetched separately and joined in memory:
 * `user_roles` is keyed by auth user id, so the join happens against the raw
 * rows BEFORE narrowing, and the auth id is discarded immediately afterwards.
 * It is never stored in the returned objects.
 */
export async function fetchAdminDirectory(): Promise<AdminDirectoryProfile[]> {
  const [{ data: profileRows, error }, { data: roleRows }] = await Promise.all([
    supabase.rpc("admin_list_profiles" as never),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (error) throw error;

  const rolesByUser = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const raw = (profileRows ?? []) as Record<string, unknown>[];
  return raw.map((row) => {
    const roles = rolesByUser.get(String(row.user_id ?? "")) ?? [];
    // `row.user_id` is read here and nowhere else; toDirectoryProfile does not
    // copy it, so it does not survive into component state.
    return { ...toDirectoryProfile(row), roles };
  });
}

export async function adminLinkFriendship(targetProfileId: string): Promise<LinkFriendshipResult> {
  const { data, error } = await supabase.rpc("admin_link_friendship" as never, {
    _target_profile_id: targetProfileId,
  } as never);
  if (error) return { ok: false, code: "error" };
  const body = readJson(data);
  if (!body || typeof body.code !== "string") return { ok: false, code: "error" };
  return {
    ok: body.ok === true,
    code: body.code as LinkFriendshipCode,
    friendshipId: typeof body.friendship_id === "string" ? body.friendship_id : null,
  };
}

export interface CreateBotInput {
  displayName: string;
  avatarUrl?: string | null;
  profileFrame?: string | null;
  addToMyFriends?: boolean;
}

export interface CreateBotResult {
  ok: boolean;
  code: "created" | "invalid_display_name" | "error";
  profileId?: string | null;
  friendship?: LinkFriendshipResult | null;
}

export async function adminCreateBotProfile(input: CreateBotInput): Promise<CreateBotResult> {
  const { data, error } = await supabase.rpc("admin_create_bot_profile" as never, {
    _display_name: input.displayName,
    _avatar_url: input.avatarUrl ?? null,
    _profile_frame: input.profileFrame ?? null,
    // Explicit, never implicit: auto-friend only when the box was ticked.
    _add_to_my_friends: input.addToMyFriends === true,
  } as never);
  if (error) return { ok: false, code: "error" };
  const body = readJson(data);
  if (!body || typeof body.code !== "string") return { ok: false, code: "error" };
  const friendRaw = readJson(body.friendship);
  return {
    ok: body.ok === true,
    code: body.code as CreateBotResult["code"],
    profileId: typeof body.profile_id === "string" ? body.profile_id : null,
    friendship: friendRaw
      ? {
          ok: friendRaw.ok === true,
          code: (friendRaw.code as LinkFriendshipCode) ?? "error",
          friendshipId:
            typeof friendRaw.friendship_id === "string" ? friendRaw.friendship_id : null,
        }
      : null,
  };
}

export interface UpdateBotInput {
  profileId: string;
  /** Omitted / undefined fields are left unchanged server-side. */
  displayName?: string;
  avatarUrl?: string | null;
  profileFrame?: string | null;
  isDisabled?: boolean;
}

export interface UpdateBotResult {
  ok: boolean;
  code: "updated" | "not_a_bot" | "invalid_display_name" | "error";
}

export async function adminUpdateBotProfile(input: UpdateBotInput): Promise<UpdateBotResult> {
  const { data, error } = await supabase.rpc("admin_update_bot_profile" as never, {
    _profile_id: input.profileId,
    _display_name: input.displayName ?? null,
    _avatar_url: input.avatarUrl === undefined ? null : input.avatarUrl,
    _profile_frame: input.profileFrame === undefined ? null : input.profileFrame,
    _is_disabled: input.isDisabled === undefined ? null : input.isDisabled,
  } as never);
  if (error) return { ok: false, code: "error" };
  const body = readJson(data);
  if (!body || typeof body.code !== "string") return { ok: false, code: "error" };
  return { ok: body.ok === true, code: body.code as UpdateBotResult["code"] };
}
