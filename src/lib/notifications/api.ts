/**
 * Notifications 2.0 — the client's only door to notification data.
 *
 * Every read goes through a server RPC that filters BEFORE it paginates
 * (keyset cursor, not offset), so done, expired, muted and resolved rows can
 * never consume the page and starve newer or more important ones. Every write
 * goes through an RPC whose subject is auth.uid() — no function here accepts
 * a user id to act on, so one account can never write another's state.
 *
 * LEGACY FALLBACK. The migration is applied by hand in the SQL Editor, and the
 * frontend deploys on merge. If this bundle reaches production before the
 * migration, the v2 RPCs do not exist yet; rather than show an error, each
 * reader falls back to the pre-v2 queries (latest rows + per-recipient read
 * receipts — the exact behaviour production has today) and reports
 * `mode: "legacy"`, which hides the lifecycle actions the server cannot honour.
 */
import { supabase } from "@/integrations/supabase/client";
import { announceNotificationsChanged } from "./sync";
import {
  classifyAdmin,
  classifyPlayer,
  isPlayerVisibleType,
  type AdminCategory,
  type AdminTab,
  type FeedbackDigest,
  type ItemState,
  type PlayerCategory,
  type Priority,
} from "./policy";

export type InboxMode = "v2" | "legacy";

export interface AdminCursor {
  rank: number;
  at: string;
  id: string;
}

export interface AdminInboxItem {
  id: string;
  type: string;
  category: AdminCategory;
  priority: Priority;
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  feedback: FeedbackDigest | null;
  createdAt: string;
  activityAt: string;
  occurrenceCount: number;
  subjectType: string | null;
  subjectId: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  isRead: boolean;
  isDone: boolean;
  isSaved: boolean;
  isExpired: boolean;
  state: ItemState;
  cursor: AdminCursor;
}

export interface AdminCounts {
  action_unresolved: number;
  action_unread: number;
  action_critical: number;
  community_active: number;
  community_unread: number;
  platform_active: number;
  platform_unread: number;
  saved: number;
  unread_total: number;
}

export interface PlayerCursor {
  at: string;
  id: string;
}

export interface PlayerInboxItem {
  id: string;
  type: string;
  category: PlayerCategory;
  priority: string;
  title: string;
  message: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  activityAt: string;
  expiresAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  isRead: boolean;
  isDone: boolean;
  isSaved: boolean;
  isExpired: boolean;
  state: ItemState;
  cursor: PlayerCursor;
}

export interface PlayerSummary {
  unread: number;
  active: number;
  actionable: number;
  saved: number;
}

export type PlayerView = "inbox" | "saved" | "history";
export type AdminAction = "read" | "done" | "undone" | "save" | "unsave";
export type PlayerAction = AdminAction | "read_all" | "done_all";

export interface Page<T> {
  items: T[];
  hasMore: boolean;
  mode: InboxMode;
}

/** PostgREST "function not found" (schema cache) or Postgres undefined_function. */
export function isMissingRpc(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message ?? "");
}

// The v2 RPCs are not in the generated types until types.ts is regenerated
// from the migrated schema; this is the one narrow, typed escape hatch.
// Called as a METHOD on the client: a detached `supabase.rpc` loses `this`.
type DbError = { code?: string; message?: string; operation?: string };
type RpcResult = { data: unknown; error: DbError | null };
type UntypedClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: DbError | null }>;
      };
    };
  };
};
const untyped = supabase as unknown as UntypedClient;

/**
 * #146: a request that never settles must not leave a surface on "Loading…"
 * forever. After this long the read counts as failed (code `timeout`), the
 * request is aborted where the builder supports it, and a late reply is ignored.
 */
export const NOTIFICATION_RPC_TIMEOUT_MS = 15_000;

type AbortableResult = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };

const rpc = (name: string, args?: Record<string, unknown>): Promise<RpcResult> => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const builder = untyped.rpc(name, args) as AbortableResult;
  const pending = controller && typeof builder.abortSignal === "function" ? builder.abortSignal(controller.signal) : builder;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<RpcResult>(resolve => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ data: null, error: { code: "timeout", message: `${name} did not respond` } });
    }, NOTIFICATION_RPC_TIMEOUT_MS);
  });
  // Every error names the RPC that produced it, so a failure can say which read failed.
  const tag = (r: RpcResult): RpcResult => (r.error ? { ...r, error: { ...r.error, operation: name } } : r);
  return Promise.race([Promise.resolve(pending), timedOut]).then(tag).finally(() => clearTimeout(timer));
};

/**
 * #146: what a failed notification read may say about itself — operation,
 * code and a short message with ids, emails and anything token-shaped
 * removed. Never the request, the session or row data.
 */
export interface NotificationLoadError {
  operation: string;
  code: string | null;
  message: string;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// JWTs, and any long run that mixes in digits (keys, hashes). Plain long
// identifiers such as get_my_notification_summary stay readable.
const TOKEN_RE = /eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*|\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g;

export function describeNotificationError(error: unknown, operation = "notifications"): NotificationLoadError {
  const e = (error && typeof error === "object" ? error : {}) as { code?: unknown; message?: unknown; operation?: unknown };
  const code = typeof e.code === "string" && /^[A-Za-z0-9_]{1,16}$/.test(e.code) ? e.code : null;
  const op = typeof e.operation === "string" && /^[a-z_]{1,64}$/.test(e.operation) ? e.operation : operation;
  const raw = typeof e.message === "string" ? e.message : "";
  const message =
    raw
      .replace(EMAIL_RE, "<email>")
      .replace(UUID_RE, "<id>")
      .replace(TOKEN_RE, "<redacted>")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "Request failed";
  return { operation: op, code, message };
}

/**
 * The server's owner gate refused. has_role(auth.uid(), 'admin') is the OWN1
 * shim — the owner AND (aal2 OR a live trusted-device attestation for THIS
 * JWT session) — so for the owner this almost always means the 15-minute
 * attestation lapsed (sleep, a throttled background tab), which re-attesting
 * the trusted device restores without MFA. The server still decides.
 */
export function isOwnerRefusal(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e || e.code !== "42501") return false;
  return /admin role required|step_up_required/i.test(e.message ?? "");
}

/** A row as PostgREST returns it; every field is narrowed where it is read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped RPC rows, narrowed field by field below
type RawRow = Record<string, any>;

const fail = (error: { message?: string } | null): never => {
  throw Object.assign(new Error(error?.message || "Notification request failed"), error ?? {});
};

/* ───────────────────────────────── admin ───────────────────────────────── */

const toAdminItem = (r: RawRow): AdminInboxItem => ({
  id: r.id,
  type: r.type,
  category: r.category,
  priority: r.priority,
  title: r.title,
  message: r.message ?? null,
  metadata: r.metadata ?? {},
  feedback: (r.metadata?.feedback as FeedbackDigest | undefined) ?? null,
  createdAt: r.created_at,
  activityAt: r.activity_at ?? r.created_at,
  occurrenceCount: r.occurrence_count ?? 1,
  subjectType: r.subject_type ?? null,
  subjectId: r.subject_id ?? null,
  expiresAt: r.expires_at ?? null,
  resolvedAt: r.resolved_at ?? null,
  resolution: r.resolution ?? null,
  isRead: Boolean(r.is_read),
  isDone: Boolean(r.is_done),
  isSaved: Boolean(r.is_saved),
  isExpired: Boolean(r.is_expired),
  state: (r.state ?? "active") as ItemState,
  cursor: { rank: r.sort_rank ?? 0, at: r.sort_at ?? r.activity_at ?? r.created_at, id: r.id },
});

const LEGACY_ADMIN_LIMIT = 50;

/** Pre-v2 read path: latest rows + this admin's receipts. Never is_read. */
async function legacyAdminRows(userId: string): Promise<AdminInboxItem[]> {
  const [notifRes, readRes] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select("id, type, title, message, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(LEGACY_ADMIN_LIMIT),
    supabase.from("admin_notification_reads").select("notification_id").eq("admin_user_id", userId),
  ]);
  if (notifRes.error) fail(notifRes.error);
  if (readRes.error) fail(readRes.error);
  const read = new Set((readRes.data ?? []).map((r: { notification_id: string }) => r.notification_id));
  return ((notifRes.data ?? []) as RawRow[]).map(n => {
    const { category, priority } = classifyAdmin(n.type, null, n.metadata);
    return toAdminItem({
      ...n,
      category,
      priority,
      is_read: read.has(n.id),
      state: "active",
      sort_at: n.created_at,
    });
  });
}

export async function fetchAdminPage(
  userId: string,
  tab: AdminTab,
  cursor: AdminCursor | null = null,
  limit = 30,
): Promise<Page<AdminInboxItem>> {
  const { data, error } = await rpc("admin_get_notifications", {
    _tab: tab,
    _limit: limit + 1,
    _cursor_rank: cursor?.rank ?? null,
    _cursor_at: cursor?.at ?? null,
    _cursor_id: cursor?.id ?? null,
  });
  if (error) {
    if (!isMissingRpc(error)) fail(error);
    if (cursor) return { items: [], hasMore: false, mode: "legacy" };
    const rows = await legacyAdminRows(userId);
    const items = tab === "completed" || tab === "saved" ? [] : rows.filter(r => r.category === tab);
    return { items, hasMore: false, mode: "legacy" };
  }
  const rows = ((data as RawRow[] | null) ?? []).map(toAdminItem);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit, mode: "v2" };
}

export async function fetchAdminCounts(userId: string): Promise<{ counts: AdminCounts; mode: InboxMode }> {
  const { data, error } = await rpc("admin_notification_counts");
  if (!error) return { counts: data as AdminCounts, mode: "v2" };
  if (!isMissingRpc(error)) fail(error);
  const rows = await legacyAdminRows(userId);
  const by = (c: AdminCategory, unreadOnly = false) =>
    rows.filter(r => r.category === c && (!unreadOnly || !r.isRead)).length;
  return {
    mode: "legacy",
    counts: {
      action_unresolved: by("action"),
      action_unread: by("action", true),
      action_critical: rows.filter(r => r.category === "action" && r.priority === "critical").length,
      community_active: by("community"),
      community_unread: by("community", true),
      platform_active: by("platform"),
      platform_unread: by("platform", true),
      saved: 0,
      unread_total: rows.filter(r => !r.isRead).length,
    },
  };
}

export async function setAdminState(
  userId: string,
  ids: string[] | null,
  action: AdminAction,
  tab: AdminCategory | "all" | null = null,
): Promise<{ applied: number; skipped: number }> {
  const { data, error } = await rpc("admin_set_notification_state", { _ids: ids, _action: action, _tab: tab });
  if (!error) return data as { applied: number; skipped: number };
  if (!isMissingRpc(error) || action !== "read" || !ids) fail(error);
  // Legacy: read is the only state the old schema has — this admin's receipt.
  const { error: legacyError } = await supabase
    .from("admin_notification_reads")
    .upsert(ids!.map(id => ({ notification_id: id, admin_user_id: userId })), {
      onConflict: "notification_id,admin_user_id",
      ignoreDuplicates: true,
    });
  if (legacyError) fail(legacyError);
  return { applied: ids!.length, skipped: 0 };
}

/**
 * One notification by its stable id (a permalink), as this admin sees it, and
 * the tab it belongs in. `null` means it does not exist or is not visible to
 * this session — the caller says so rather than guessing.
 */
export async function fetchAdminNotification(
  userId: string,
  id: string,
): Promise<{ item: AdminInboxItem; tab: AdminTab; mode: InboxMode } | null> {
  const { data, error } = await rpc("admin_get_notification", { _id: id });
  if (!error) {
    const row = ((data as RawRow[] | null) ?? [])[0];
    return row ? { item: toAdminItem(row), tab: row.tab as AdminTab, mode: "v2" } : null;
  }
  if (!isMissingRpc(error)) fail(error);
  const item = (await legacyAdminRows(userId)).find(r => r.id === id);
  return item ? { item, tab: item.category, mode: "legacy" } : null;
}

/**
 * Called by a record view once it has actually opened the record a
 * notification pointed at — read on SUCCESSFUL opening, never on click, and
 * never a resolution. A failure is swallowed: viewing the record still worked.
 */
export async function markAdminNotificationRead(id: string): Promise<boolean> {
  const { error } = await rpc("admin_set_notification_state", { _ids: [id], _action: "read", _tab: null });
  if (error) return false;
  announceNotificationsChanged("admin", "record-view");
  return true;
}

export async function resolveAdminItems(
  ids: string[],
  resolution: "dismissed" | "actioned",
): Promise<{ resolved: number; refused: number }> {
  const { data, error } = await rpc("admin_resolve_notifications", { _ids: ids, _resolution: resolution });
  if (error) fail(error);
  return data as { resolved: number; refused: number };
}

export async function reopenAdminItem(id: string): Promise<boolean> {
  const { data, error } = await rpc("admin_reopen_notification", { _id: id });
  if (error) fail(error);
  return Boolean(data);
}

/* ───────────────────────────────── player ──────────────────────────────── */

const toPlayerItem = (r: RawRow): PlayerInboxItem => ({
  id: r.id,
  type: r.type,
  category: (r.category ?? classifyPlayer(r.type)) as PlayerCategory,
  priority: r.priority ?? "normal",
  title: r.title,
  message: r.message ?? null,
  imageUrl: r.image_url ?? null,
  actionUrl: r.action_url ?? null,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
  activityAt: r.activity_at ?? r.created_at,
  expiresAt: r.expires_at ?? null,
  resolvedAt: r.resolved_at ?? null,
  resolution: r.resolution ?? null,
  isRead: Boolean(r.is_read),
  isDone: Boolean(r.is_done),
  isSaved: Boolean(r.is_saved),
  isExpired: Boolean(r.is_expired),
  state: (r.state ?? "active") as ItemState,
  cursor: { at: r.sort_at ?? r.activity_at ?? r.created_at, id: r.id },
});

/**
 * The columns the legacy bell reads, stated explicitly (COM1-1 / P0-1A): never
 * `*`, which would hand a recipient whatever column is added next — including
 * sent_by_user_id, another account's auth id.
 */
const LEGACY_PLAYER_COLUMNS =
  "id, title, message, type, image_url, created_at, target_type, profile_id, metadata, action_url";

async function legacyPlayerRows(userId: string, signupAt: string | null): Promise<PlayerInboxItem[]> {
  const [{ data: profile }, notifRes, readRes] = await Promise.all([
    supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_notifications")
      .select(LEGACY_PLAYER_COLUMNS)
      .gte("created_at", signupAt ?? new Date(0).toISOString())
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("user_notification_reads").select("notification_id").eq("user_id", userId),
  ]);
  if (notifRes.error) fail(notifRes.error);
  if (readRes.error) fail(readRes.error);
  const myProfileId = (profile as { id?: string } | null)?.id ?? null;
  const read = new Set((readRes.data ?? []).map((r: { notification_id: string }) => r.notification_id));
  return ((notifRes.data as RawRow[] | null) ?? [])
    // Recipient scoping in the client too: an admin's RLS returns every
    // player's targeted rows, which never belong in their own bell.
    .filter(n => n.target_type === "all" || (n.profile_id != null && n.profile_id === myProfileId))
    .filter(n => isPlayerVisibleType(n.type))
    .map(n => toPlayerItem({ ...n, is_read: read.has(n.id), state: "active" }));
}

export async function fetchPlayerPage(
  userId: string,
  view: PlayerView,
  cursor: PlayerCursor | null = null,
  limit = 30,
  signupAt: string | null = null,
): Promise<Page<PlayerInboxItem>> {
  const { data, error } = await rpc("get_my_notifications", {
    _view: view,
    _limit: limit + 1,
    _cursor_at: cursor?.at ?? null,
    _cursor_id: cursor?.id ?? null,
  });
  if (error) {
    if (!isMissingRpc(error)) fail(error);
    if (cursor || view !== "inbox") return { items: [], hasMore: false, mode: "legacy" };
    return { items: await legacyPlayerRows(userId, signupAt), hasMore: false, mode: "legacy" };
  }
  const rows = ((data as RawRow[] | null) ?? []).map(toPlayerItem);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit, mode: "v2" };
}

export async function fetchPlayerSummary(): Promise<PlayerSummary | null> {
  const { data, error } = await rpc("get_my_notification_summary");
  if (!error) return data as PlayerSummary;
  if (isMissingRpc(error)) return null; // caller derives it from the legacy page
  return fail(error);
}

export async function setPlayerState(
  userId: string,
  ids: string[] | null,
  action: PlayerAction,
): Promise<number> {
  const { data, error } = await rpc("set_my_notification_state", { _ids: ids, _action: action });
  if (!error) return Number(data ?? 0);
  if (!isMissingRpc(error) || (action !== "read" && action !== "read_all") || !ids) fail(error);
  // Legacy: only read state exists. Conflict-tolerant so mark-one and mark-all
  // cannot collide on UNIQUE(notification_id, user_id).
  const { error: legacyError } = await supabase
    .from("user_notification_reads")
    .upsert(ids!.map(id => ({ notification_id: id, user_id: userId })), {
      onConflict: "notification_id,user_id",
      ignoreDuplicates: true,
    });
  if (legacyError) fail(legacyError);
  return ids!.length;
}

/* ───────────────────────────── preferences ─────────────────────────────── */

export async function fetchMutedCategories(userId: string): Promise<PlayerCategory[]> {
  // Not in the generated types until they are regenerated from the migrated schema.
  const { data, error } = await untyped
    .from("notification_preferences")
    .select("muted_categories")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Table missing (pre-migration): nothing is muted.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    fail(error);
  }
  return ((data?.muted_categories as PlayerCategory[] | undefined) ?? []);
}

export async function saveMutedCategories(muted: PlayerCategory[]): Promise<PlayerCategory[]> {
  const { data, error } = await rpc("set_my_notification_preferences", { _muted: muted });
  if (error) fail(error);
  return (data as PlayerCategory[]) ?? muted;
}
