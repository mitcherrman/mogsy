// ---------------------------------------------------------------------------
// Account Connections — client for verified external identities.
//
// Discord and Riot are LINKED identities, never login providers. Nothing here
// touches the Supabase session: no signIn, no signOut, no setSession. The
// Mogzy account stays primary and is the thing an identity attaches to.
//
// WHERE EACH CALL GOES, AND WHY
//   providers / start / preview / redeem / disconnect → the identity-link edge
//     function, because each needs server authority: provider secrets, the
//     state secret, the single-use ceremony rows, or the atomic commit.
//   reading links, and the two consent switches → straight to PostgREST under
//     RLS. Those are exactly the operations the migration's grants describe
//     (SELECT own rows; UPDATE only contact_consent and public_on_profile), so
//     routing them through a function would add a hop and hide the policy that
//     is doing the work.
//
// The browser can never assert a verified identity: it holds no INSERT
// privilege, and the verified columns are not in its UPDATE grant.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

export type IdentityProvider = "discord" | "riot";

export const IDENTITY_PROVIDERS: readonly IdentityProvider[] = ["discord", "riot"] as const;

/** Where the provider round trip returns to. Must be an approved origin path. */
export const CONNECTIONS_RETURN_PATH = "/settings";

/** Query keys the callback appends. Removed from the address bar on arrival. */
export const CALLBACK_PARAM_KEYS = ["connect", "status", "ticket"] as const;

export interface IdentityLink {
  id: string;
  provider: IdentityProvider;
  username: string | null;
  displayName: string | null;
  tagLine: string | null;
  avatarUrl: string | null;
  verifiedAt: string | null;
  contactConsent: boolean;
  publicOnProfile: boolean;
}

/** Display-safe identity shown before the user confirms. No durable id. */
export interface PreviewIdentity {
  provider: IdentityProvider;
  username: string | null;
  displayName: string | null;
  tagLine: string | null;
  avatarUrl: string | null;
}

export type ProviderAvailability = Record<IdentityProvider, boolean>;

export function isIdentityProvider(v: unknown): v is IdentityProvider {
  return v === "discord" || v === "riot";
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure)
// ---------------------------------------------------------------------------

/**
 * How an identity is named in the UI.
 * Riot is always `gameName#tagLine`; Discord prefers the global/display name.
 */
export function identityLabel(
  identity: Pick<PreviewIdentity, "provider" | "username" | "displayName" | "tagLine">,
): string {
  if (identity.provider === "riot") {
    const game = identity.username ?? "";
    const tag = identity.tagLine ?? "";
    if (game && tag) return `${game}#${tag}`;
    return game || tag || "Riot account";
  }
  return identity.displayName || identity.username || "Discord account";
}

/** "Link Discord account Name?" — the confirmation question. */
export function confirmationPrompt(identity: PreviewIdentity): string {
  const provider = identity.provider === "discord" ? "Discord" : "Riot";
  return `Link ${provider} account ${identityLabel(identity)}?`;
}

// ---------------------------------------------------------------------------
// Callback URL handling (pure)
// ---------------------------------------------------------------------------

export interface CallbackParams {
  provider: IdentityProvider | null;
  status: string | null;
  ticket: string | null;
}

/** Reads the callback query. Returns a null provider when this is a plain visit. */
export function readCallbackParams(search: string): CallbackParams {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { provider: null, status: null, ticket: null };
  }
  const connect = params.get("connect");
  return {
    provider: isIdentityProvider(connect) ? connect : null,
    status: params.get("status"),
    ticket: params.get("ticket"),
  };
}

/**
 * The same URL with the callback fields removed, preserving every other query
 * parameter and the fragment.
 *
 * The ticket must not survive in the address bar: it would otherwise persist in
 * history and in anything the user copies or shares. It is held in component
 * state for the seconds the confirmation takes and nowhere else — not
 * localStorage, not sessionStorage, not telemetry.
 */
export function stripCallbackParams(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  for (const key of CALLBACK_PARAM_KEYS) url.searchParams.delete(key);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Edge function calls
// ---------------------------------------------------------------------------

type InvokeBody = Record<string, unknown>;

async function invoke<T>(body: InvokeBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke("identity-link", { body });
  if (error) throw error;
  return data as T;
}

/** Fails closed: an unreachable function reports both providers unavailable. */
export async function fetchProviderAvailability(): Promise<ProviderAvailability> {
  try {
    const data = await invoke<{
      providers?: Record<string, { available?: boolean }>;
    }>({ action: "providers" });
    return {
      discord: data?.providers?.discord?.available === true,
      riot: data?.providers?.riot?.available === true,
    };
  } catch {
    return { discord: false, riot: false };
  }
}

/**
 * Begins a ceremony and returns the provider's authorize URL.
 * The origin is this app's own origin; the server accepts it only if it is on
 * the exact allowlist, so a hostile origin cannot be smuggled in from here.
 */
export async function startIdentityLink(provider: IdentityProvider): Promise<string> {
  const data = await invoke<{ authorizeUrl?: string }>({
    action: "start",
    provider,
    origin: window.location.origin,
    returnTo: CONNECTIONS_RETURN_PATH,
  });
  if (!data?.authorizeUrl) throw new Error("start_failed");
  return data.authorizeUrl;
}

/** Shows which account is about to be linked. Consumes nothing. */
export async function previewIdentityLink(ticket: string): Promise<PreviewIdentity> {
  const data = await invoke<{ identity?: PreviewIdentity }>({ action: "preview", ticket });
  if (!data?.identity || !isIdentityProvider(data.identity.provider)) {
    throw new Error("invalid_ticket");
  }
  return data.identity;
}

/** Commits the link. Only reached after the user explicitly confirms. */
export async function redeemIdentityLink(ticket: string): Promise<void> {
  await invoke<{ success?: boolean }>({ action: "redeem", ticket });
}

export async function disconnectIdentityLink(provider: IdentityProvider): Promise<void> {
  await invoke<{ success?: boolean }>({ action: "disconnect", provider });
}

// ---------------------------------------------------------------------------
// RLS-scoped reads and consent writes
// ---------------------------------------------------------------------------

interface IdentityLinkRow {
  id: string;
  provider: string;
  username: string | null;
  display_name: string | null;
  tag_line: string | null;
  avatar_url: string | null;
  verified_at: string | null;
  contact_consent: boolean | null;
  public_on_profile: boolean | null;
}

/** Named projection rather than a spread, so a new column cannot leak by default. */
export function toIdentityLink(row: IdentityLinkRow): IdentityLink | null {
  if (!isIdentityProvider(row.provider)) return null;
  return {
    id: String(row.id),
    provider: row.provider,
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    tagLine: row.tag_line ?? null,
    avatarUrl: row.avatar_url ?? null,
    verifiedAt: row.verified_at ?? null,
    contactConsent: row.contact_consent === true,
    publicOnProfile: row.public_on_profile === true,
  };
}

/**
 * The caller's own links.
 *
 * RLS is the control that makes this safe; the explicit `user_id` filter is
 * belt and braces, matching what the edge function does on the same table. If
 * a future policy edit ever widened the SELECT, this would still not render
 * somebody else's Discord account as yours.
 */
export async function fetchIdentityLinks(userId: string): Promise<IdentityLink[]> {
  const { data, error } = await supabase
    .from("user_identity_links")
    .select(
      "id, provider, username, display_name, tag_line, avatar_url, verified_at, contact_consent, public_on_profile",
    )
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as IdentityLinkRow[])
    .map(toIdentityLink)
    .filter((l): l is IdentityLink => l !== null);
}

/**
 * The two switches the user owns. These are the ONLY columns a browser may
 * write on this table; the verified identity fields are withheld by both the
 * column grants and a trigger.
 */
export async function setIdentityPreference(
  userId: string,
  provider: IdentityProvider,
  patch: { contactConsent?: boolean; publicOnProfile?: boolean },
): Promise<void> {
  const update: Record<string, boolean> = {};
  if (patch.contactConsent !== undefined) update.contact_consent = patch.contactConsent;
  if (patch.publicOnProfile !== undefined) update.public_on_profile = patch.publicOnProfile;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from("user_identity_links")
    .update(update)
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}
