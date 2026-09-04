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
import { isEffectivePro } from "@/lib/pro/entitlement";
import { usernameMessage } from "@/lib/identity/username";

export const ADMIN_USERS_PATH = "/admin/users";

/**
 * Verified external identities, as the directory is allowed to hold them.
 *
 * `admin_list_identity_links()` returns BOTH `user_id` and `profile_id`. Only
 * `profile_id` is read here. The auth id exists in that RPC so an admin running
 * SQL can reconcile a link whose profile row is missing — it is not something
 * this module carries, for the same reason `toDirectoryProfile` drops it.
 *
 * There is no ticket hash, no pending record and no token in this shape,
 * because none of those are verified associations and none belong on a screen.
 */
export interface AdminDiscordIdentity {
  username: string | null;
  displayName: string | null;
  contactConsent: boolean;
  verifiedAt: string | null;
}

export interface AdminRiotIdentity {
  gameName: string | null;
  tagLine: string | null;
  verifiedAt: string | null;
}

export interface AdminIdentitySummary {
  discord: AdminDiscordIdentity | null;
  riot: AdminRiotIdentity | null;
}

export const EMPTY_IDENTITIES: AdminIdentitySummary = { discord: null, riot: null };

/**
 * Identities for a profile, tolerating a row that predates the field.
 * Filtering and search must never throw on a profile assembled elsewhere.
 */
export function identitiesOf(p: Pick<AdminDirectoryProfile, "identities">): AdminIdentitySummary {
  return p.identities ?? EMPTY_IDENTITIES;
}

/** `gameName#tagLine`, or null when neither half is present. */
export function riotIdLabel(riot: AdminRiotIdentity | null): string | null {
  if (!riot) return null;
  if (riot.gameName && riot.tagLine) return `${riot.gameName}#${riot.tagLine}`;
  return riot.gameName ?? riot.tagLine ?? null;
}

/** Raw `admin_list_identity_links()` rows, grouped by the PUBLIC profile id. */
export function groupIdentityLinks(
  rows: Record<string, unknown>[],
): Map<string, AdminIdentitySummary> {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const byProfile = new Map<string, AdminIdentitySummary>();
  for (const row of rows) {
    // A link whose user has no profile row cannot be placed on a card. It is
    // surfaced as an unreconciled count instead of being silently dropped.
    const profileId = str(row.profile_id);
    if (!profileId) continue;
    // An unrecognised provider records nothing at all, so it cannot leave an
    // empty entry behind that reads as "this profile has identities".
    if (row.provider !== "discord" && row.provider !== "riot") continue;
    const current = byProfile.get(profileId) ?? { discord: null, riot: null };
    if (row.provider === "discord") {
      current.discord = {
        username: str(row.username),
        displayName: str(row.display_name),
        contactConsent: row.contact_consent === true,
        verifiedAt: str(row.verified_at),
      };
    } else {
      current.riot = {
        gameName: str(row.username),
        tagLine: str(row.tag_line),
        verifiedAt: str(row.verified_at),
      };
    }
    byProfile.set(profileId, current);
  }
  return byProfile;
}

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
  /** Verified external identities, resolved separately. */
  identities: AdminIdentitySummary;
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
    // PT1.4: effective Pro, so a comped playtester shows as Pro in admin tooling.
    isPro: isEffectivePro(row as Record<string, unknown>),
    isBot: bool(row.is_bot),
    isDisabled: bool(row.is_disabled),
    isAnonymous: bool(row.is_anonymous),
    onboardingCompleted: bool(row.onboarding_completed),
    roles: [],
    identities: EMPTY_IDENTITIES,
  };
}

// ---------------------------------------------------------------------------
// Filtering and sorting (pure)
// ---------------------------------------------------------------------------

// "real" leads because it is the default: production holds ~4,800 profiles of
// which ~4,770 are anonymous guests, so an unfiltered view buries the ~11 real
// accounts and 10 bot personas the admin actually came to look at. Every other
// population stays one click away — nothing is hidden, only deprioritised.
export const DIRECTORY_FILTERS = [
  "real",
  "all",
  "anonymous",
  "bots",
  "disabled-bots",
  "pro",
  "admins",
  // Who has actually agreed to be contacted on Discord. This is the list the
  // owner recruits playtesters from, and it must never be approximated by
  // "has Discord linked" — linking is not consent.
  "discord-contact",
] as const;
export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

/** Opening view. Presentation only — it narrows no authority and hides no row. */
export const DEFAULT_DIRECTORY_FILTER: DirectoryFilter = "real";

/**
 * How many cards are rendered at once, and the "Show more" increment.
 *
 * The cap is a RENDER limit, not a fetch limit: `admin_list_profiles()` still
 * returns every row and search/filter still run across all of them, so a match
 * is never missed because it sits past the cap.
 */
export const DIRECTORY_PAGE_SIZE = 100;

export const DIRECTORY_FILTER_LABELS: Record<DirectoryFilter, string> = {
  real: "Real users",
  all: "All",
  anonymous: "Anonymous",
  bots: "Bots",
  "disabled-bots": "Disabled bots",
  pro: "Pro",
  admins: "Admins",
  "discord-contact": "Discord contact OK",
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
    case "discord-contact":
      return identitiesOf(p).discord?.contactConsent === true;
  }
}

/**
 * Case-insensitive substring match over the display name and any verified
 * external identity.
 *
 * Searching a Discord name or a Riot ID matters because that is often the only
 * name the owner knows a tester by — they met them in a Discord server, not in
 * the Mogzy directory. The Riot ID matches both as `gameName` alone and as the
 * full `gameName#tagLine`.
 */
export function matchesSearch(p: AdminDirectoryProfile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const identities = identitiesOf(p);
  const haystack = [
    p.displayName,
    identities.discord?.username,
    identities.discord?.displayName,
    identities.riot?.gameName,
    riotIdLabel(identities.riot),
  ];
  return haystack.some((v) => (v ?? "").toLowerCase().includes(q));
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

/** The first `cap` rows. A cap <= 0 shows nothing; a cap past the end is harmless. */
export function cappedSlice<T>(list: T[], cap: number): T[] {
  return list.slice(0, Math.max(0, cap));
}

/**
 * The directory's count line.
 *
 * `matched` is what the current filter and search select out of the full fetched
 * set; `total` is everything fetched. When they differ the line says so, so a
 * small number can never be misread as "this is all the platform has".
 */
export function formatDirectoryCount(shown: number, matched: number, total: number): string {
  const num = (v: number) => v.toLocaleString("en-US");
  const base = `Showing ${num(shown)} of ${num(matched)} profile${matched === 1 ? "" : "s"}`;
  return matched === total ? base : `${base} (filtered from ${num(total)})`;
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
  const [{ data: profileRows, error }, { data: roleRows }, { data: identityRows }] =
    await Promise.all([
      supabase.rpc("admin_list_profiles" as never),
      supabase.from("user_roles").select("user_id, role"),
      // Same shape of join as roles: a separate authorised RPC, merged in
      // memory. It reuses the existing has_role admin architecture and returns
      // no token, no ticket and no pending record. A failure here degrades the
      // identity columns to empty rather than failing the whole directory.
      supabase.rpc("admin_list_identity_links" as never).then(
        (r) => r,
        () => ({ data: null }),
      ),
    ]);
  if (error) throw error;

  // Shape-guarded rather than cast: an unexpected payload must degrade the
  // identity columns to empty, never take the whole directory down with it.
  const identitiesByProfile = groupIdentityLinks(
    Array.isArray(identityRows) ? (identityRows as Record<string, unknown>[]) : [],
  );

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
    // copy it, so it does not survive into component state. Identities are
    // keyed by the PUBLIC profile id for the same reason.
    const base = toDirectoryProfile(row);
    const identities = identitiesByProfile.get(base.id) ?? EMPTY_IDENTITIES;
    return { ...base, roles, identities };
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

/**
 * COM1-1 / P0-3. A bot name is now checked by the SAME AUTH3 authority a
 * person's is (migration 20260823121000), so these RPCs can return any AUTH3
 * problem code. `invalid_display_name` is kept for the empty/absurd-length
 * cases the ADM2 contract already had.
 */
export type BotNameCode =
  | "invalid_display_name"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "reserved"
  | "taken";

const BOT_NAME_CODES: ReadonlySet<string> = new Set<BotNameCode>([
  "invalid_display_name", "too_short", "too_long",
  "invalid_characters", "reserved", "taken",
]);

export const isBotNameCode = (code: string): code is BotNameCode =>
  BOT_NAME_CODES.has(code);

/**
 * The finished sentence for a rejected bot name. Reuses the AUTH3 map so the
 * admin form and the player-facing username field say the same thing about the
 * same rule — and so a raw `unique_violation` string can never reach a screen.
 */
export function botNameMessage(code: string): string {
  if (code === "invalid_display_name") return "Enter a name for the bot.";
  return usernameMessage(code);
}

export interface CreateBotResult {
  ok: boolean;
  code: BotNameCode | "created" | "error";
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
  code: BotNameCode | "updated" | "not_a_bot" | "error";
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
