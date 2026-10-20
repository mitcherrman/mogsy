/**
 * Notifications 2.0 — an in-memory stand-in for the Supabase client, for
 * component tests.
 *
 * It implements the v2 RPCs with the SAME lifecycle semantics as the SQL (the
 * SQL itself is exercised for real in notificationsV2Lifecycle.test.ts): per
 * recipient read/done/saved, shared resolution, Action Required items that
 * cannot be done while unresolved, muted categories excluded from the inbox and
 * badge, keyset pagination. `legacy = true` makes every v2 RPC "missing" so the
 * pre-migration fallback path is exercised against the legacy tables.
 *
 * Usage (the module instance is shared with the vi.mock factory):
 *   vi.mock("@/integrations/supabase/client", async () =>
 *     ({ supabase: (await import("@/test/notifications/inboxServer")).inbox.client }));
 *   import { inbox } from "@/test/notifications/inboxServer";
 */
type Json = Record<string, unknown>;
type DbError = { code?: string; message: string };

export interface FakePlayerRow {
  id: string;
  type: string;
  category?: string;
  priority?: string;
  title: string;
  message?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  metadata?: Json;
  created_at?: string;
  is_read?: boolean;
  done?: boolean;
  saved?: boolean;
  /** Shared server-side state: resolved (e.g. friend request withdrawn) or expired. */
  state?: "active" | "resolved" | "expired";
  resolution?: string | null;
  /** Legacy-table fields. */
  target_type?: string;
  profile_id?: string | null;
}

export interface FakeAdminRow {
  id: string;
  type: string;
  category: "action" | "community" | "platform";
  priority?: "critical" | "high" | "normal" | "low";
  title: string;
  message?: string | null;
  metadata?: Json;
  created_at?: string;
  occurrence_count?: number;
  subject_type?: string | null;
  subject_id?: string | null;
  expires_at?: string | null;
  resolved_at?: string | null;
  resolution?: string | null;
  expired?: boolean;
  is_read?: boolean;
  done?: boolean;
  saved?: boolean;
}

interface Listener {
  channel: string;
  table: string;
  event: string;
  filter?: string;
  handler: (payload: Json) => void;
}

const MISSING: DbError = { code: "PGRST202", message: "Could not find the function in the schema cache" };
const rank = (p?: string) => (p === "critical" ? 0 : p === "high" ? 1 : p === "normal" ? 2 : 3);
const PLAYER_CATEGORY: Record<string, string> = {
  friend_request: "social",
  friend_accepted: "social",
  feedback_update: "feedback",
  warning: "account",
  general: "announcement",
  update: "announcement",
  lol_patch: "announcement",
};

export function createInboxServer() {
  const s = {
    player: [] as FakePlayerRow[],
    admin: [] as FakeAdminRow[],
    muted: [] as string[],
    legacy: false,
    legacyReads: [] as { notification_id: string }[],
    legacyAdminReads: [] as { notification_id: string; admin_user_id: string }[],
    profileId: "profile-1" as string | null,
    rpcCalls: [] as { name: string; args: Json }[],
    fromCalls: [] as { table: string; op: string; payload?: unknown; opts?: unknown }[],
    errors: {} as Record<string, DbError | undefined>,
    listeners: [] as Listener[],
    statusCallbacks: [] as { channel: string; cb: (status: string) => void }[],
    removedChannels: 0,
    /** Generic record tables served by from(): { table: rows }. */
    tables: {} as Record<string, Json[]>,
  };

  const now = () => new Date().toISOString();
  const pCategory = (r: FakePlayerRow) => r.category ?? PLAYER_CATEGORY[r.type] ?? "announcement";
  const pState = (r: FakePlayerRow) => (r.state && r.state !== "active" ? r.state : r.done ? "done" : "active");
  const aState = (r: FakeAdminRow) =>
    r.resolved_at ? "resolved" : r.category === "action" ? "active" : r.done ? "done" : r.expired && !r.saved ? "expired" : "active";
  const pInbox = () => s.player.filter(r => pState(r) === "active" && !s.muted.includes(pCategory(r)));
  const created = (r: { created_at?: string }) => r.created_at ?? "2026-10-19T12:00:00.000Z";
  const byTimeDesc = <T extends { id: string; created_at?: string }>(a: T, b: T) =>
    created(b).localeCompare(created(a)) || b.id.localeCompare(a.id);

  const playerOut = (r: FakePlayerRow): Json => ({
    id: r.id,
    type: r.type,
    category: pCategory(r),
    priority: r.priority ?? "normal",
    title: r.title,
    message: r.message ?? null,
    image_url: r.image_url ?? null,
    action_url: r.action_url ?? null,
    metadata: r.metadata ?? {},
    created_at: created(r),
    activity_at: created(r),
    expires_at: null,
    resolved_at: r.state === "resolved" ? now() : null,
    resolution: r.resolution ?? null,
    is_read: Boolean(r.is_read),
    is_done: Boolean(r.done),
    is_saved: Boolean(r.saved),
    is_expired: r.state === "expired",
    state: pState(r),
    sort_at: created(r),
  });

  const adminOut = (r: FakeAdminRow, tab: string): Json => ({
    id: r.id,
    type: r.type,
    category: r.category,
    priority: r.priority ?? "normal",
    title: r.title,
    message: r.message ?? null,
    metadata: r.metadata ?? {},
    created_at: created(r),
    activity_at: created(r),
    occurrence_count: r.occurrence_count ?? 1,
    subject_type: r.subject_type ?? null,
    subject_id: r.subject_id ?? null,
    expires_at: r.expires_at ?? null,
    resolved_at: r.resolved_at ?? null,
    resolution: r.resolution ?? null,
    is_read: Boolean(r.is_read),
    is_done: Boolean(r.done),
    is_saved: Boolean(r.saved),
    is_expired: Boolean(r.expired),
    state: aState(r),
    sort_rank: tab === "action" ? rank(r.priority) : 0,
    sort_at: created(r),
  });

  const page = <T extends { id: string }>(rows: T[], args: Json, out: (r: T) => Json, ranked = false) => {
    const limit = Number(args._limit ?? 30);
    let list = rows.map(out);
    list.sort((a, b) =>
      (ranked ? Number(a.sort_rank) - Number(b.sort_rank) : 0) ||
      String(b.sort_at).localeCompare(String(a.sort_at)) ||
      String(b.id).localeCompare(String(a.id)));
    if (args._cursor_at) {
      const idx = list.findIndex(r => r.id === args._cursor_id);
      list = list.slice(idx + 1);
    }
    return list.slice(0, limit);
  };

  const adminTabRows = (tab: string) =>
    s.admin.filter(r => {
      const st = aState(r);
      if (tab === "completed") return st !== "active";
      if (tab === "saved") return Boolean(r.saved);
      return r.category === tab && st === "active";
    });

  const counts = () => {
    const active = (c: string) => s.admin.filter(r => r.category === c && aState(r) === "active");
    const all = s.admin.filter(r => aState(r) === "active");
    return {
      action_unresolved: active("action").length,
      action_unread: active("action").filter(r => !r.is_read).length,
      action_critical: active("action").filter(r => r.priority === "critical").length,
      community_active: active("community").length,
      community_unread: active("community").filter(r => !r.is_read).length,
      platform_active: active("platform").length,
      platform_unread: active("platform").filter(r => !r.is_read).length,
      saved: s.admin.filter(r => r.saved).length,
      unread_total: all.filter(r => !r.is_read).length,
    };
  };

  const rpcImpl = (name: string, args: Json = {}): { data: unknown; error: DbError | null } => {
    s.rpcCalls.push({ name, args });
    if (s.errors[name]) return { data: null, error: s.errors[name]! };
    if (s.legacy && name !== "admin_unread_notification_count") return { data: null, error: MISSING };
    const ids = (args._ids as string[] | null) ?? null;
    switch (name) {
      case "get_my_notifications": {
        const view = String(args._view);
        const rows =
          view === "inbox" ? pInbox()
          : view === "saved" ? s.player.filter(r => r.saved)
          : s.player.filter(r => pState(r) !== "active" || s.muted.includes(pCategory(r)));
        return { data: page(rows, args, playerOut), error: null };
      }
      case "get_my_notification_summary": {
        const inbox = pInbox();
        return {
          data: {
            unread: inbox.filter(r => !r.is_read).length,
            active: inbox.length,
            actionable: inbox.filter(r => r.type === "friend_request").length,
            saved: s.player.filter(r => r.saved).length,
          },
          error: null,
        };
      }
      case "set_my_notification_state": {
        const action = String(args._action);
        const targets = action.endsWith("_all") ? pInbox() : s.player.filter(r => ids?.includes(r.id));
        for (const r of targets) {
          if (action.startsWith("read") || action.startsWith("done")) r.is_read = true;
          if (action.startsWith("done")) r.done = true;
          if (action === "undone") r.done = false;
          if (action === "save") r.saved = true;
          if (action === "unsave") r.saved = false;
        }
        return { data: targets.length, error: null };
      }
      case "set_my_notification_preferences": {
        const muted = (args._muted as string[]) ?? [];
        if (muted.some(c => c === "account" || c === "security")) {
          return { data: null, error: { code: "23514", message: "notification_preferences_mutable_only" } };
        }
        s.muted = [...muted];
        return { data: s.muted, error: null };
      }
      case "admin_get_notifications": {
        const tab = String(args._tab);
        return { data: page(adminTabRows(tab), args, r => adminOut(r, tab), tab === "action"), error: null };
      }
      case "admin_get_notification": {
        const r = s.admin.find(x => x.id === args._id);
        if (!r) return { data: [], error: null };
        const st = aState(r);
        return { data: [{ ...adminOut(r, "single"), tab: st === "active" ? r.category : "completed" }], error: null };
      }
      case "admin_notification_counts":
        return { data: counts(), error: null };
      case "admin_unread_notification_count":
        return { data: counts().unread_total, error: null };
      case "admin_set_notification_state": {
        const action = String(args._action);
        const tab = args._tab as string | null;
        let targets = ids
          ? s.admin.filter(r => ids.includes(r.id))
          : s.admin.filter(r => aState(r) === "active" && (tab === "all" || r.category === tab));
        let skipped = 0;
        if (action === "done") {
          const blocked = targets.filter(r => r.category === "action" && !r.resolved_at);
          skipped = blocked.length;
          targets = targets.filter(r => !blocked.includes(r));
        }
        for (const r of targets) {
          if (action === "read" || action === "done") r.is_read = true;
          if (action === "done") r.done = true;
          if (action === "undone") r.done = false;
          if (action === "save") r.saved = true;
          if (action === "unsave") r.saved = false;
        }
        return { data: { applied: targets.length, skipped }, error: null };
      }
      case "admin_resolve_notifications": {
        let resolved = 0;
        let refused = 0;
        for (const r of s.admin.filter(x => ids?.includes(x.id) && !x.resolved_at)) {
          if (["feedback", "user_report", "mod_request"].includes(String(r.subject_type))) {
            refused++;
            continue;
          }
          r.resolved_at = now();
          r.resolution = String(args._resolution);
          r.is_read = true;
          resolved++;
        }
        return { data: { resolved, refused }, error: null };
      }
      case "admin_reopen_notification": {
        const r = s.admin.find(x => x.id === args._id && (x.resolution === "dismissed" || x.resolution === "actioned"));
        if (r) {
          r.resolved_at = null;
          r.resolution = null;
        }
        return { data: Boolean(r), error: null };
      }
      default:
        return { data: null, error: MISSING };
    }
  };

  /** PostgREST builder over the LEGACY tables (pre-migration fallback). */
  const from = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    let cap: number | undefined;
    const result = (): { data: unknown; error: DbError | null } => {
      if (s.errors[`from:${table}`]) return { data: null, error: s.errors[`from:${table}`]! };
      switch (table) {
        case "profiles":
          return { data: s.profileId ? { id: s.profileId } : null, error: null };
        case "user_notifications":
          return {
            data: s.player.map(r => ({
              id: r.id, title: r.title, message: r.message ?? null, type: r.type, image_url: r.image_url ?? null,
              created_at: created(r), target_type: r.target_type ?? "all", profile_id: r.profile_id ?? null,
              metadata: r.metadata ?? {}, action_url: r.action_url ?? null,
            })),
            error: null,
          };
        case "user_notification_reads":
          return { data: s.legacyReads, error: null };
        case "admin_notifications":
          return { data: s.admin.map(r => ({ id: r.id, type: r.type, title: r.title, message: r.message ?? null, metadata: r.metadata ?? {}, created_at: created(r) })), error: null };
        case "admin_notification_reads":
          return { data: s.legacyAdminReads, error: null };
        case "notification_preferences":
          return { data: s.legacy ? null : { muted_categories: s.muted }, error: null };
        default: {
          // Generic record tables (e.g. preset_item_images) filtered by .eq().
          const rows = (s.tables[table] ?? []).filter(r => eqs.every(([c, v]) => r[c] === v));
          return { data: cap == null ? rows : rows.slice(0, cap), error: null };
        }
      }
    };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: (cols: string) => {
        s.fromCalls.push({ table, op: "select", payload: cols });
        return b;
      },
      eq: (column: string, value: unknown) => {
        eqs.push([column, value]);
        return b;
      },
      in: chain, gte: chain, order: chain, not: chain,
      limit: (n: number) => {
        cap = n;
        return b;
      },
      maybeSingle: () => {
        const r = result();
        return Promise.resolve(Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r);
      },
      single: () => Promise.resolve(result()),
      upsert: (rows: unknown, opts: unknown) => {
        s.fromCalls.push({ table, op: "upsert", payload: rows, opts });
        const err = s.errors[`upsert:${table}`];
        if (!err && Array.isArray(rows)) {
          for (const row of rows as Json[]) {
            if (table === "user_notification_reads") s.legacyReads.push({ notification_id: String(row.notification_id) });
            if (table === "admin_notification_reads") s.legacyAdminReads.push({ notification_id: String(row.notification_id), admin_user_id: String(row.admin_user_id) });
          }
        }
        return Promise.resolve({ data: null, error: err ?? null });
      },
      insert: (rows: unknown) => {
        s.fromCalls.push({ table, op: "insert", payload: rows });
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: unknown) => {
        s.fromCalls.push({ table, op: "update", payload: patch });
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    });
    return b;
  };

  const channel = (name: string) => {
    const ch: Record<string, unknown> = {};
    Object.assign(ch, {
      on: (_kind: string, cfg: { event: string; table: string; filter?: string }, handler: (p: Json) => void) => {
        s.listeners.push({ channel: name, table: cfg.table, event: cfg.event, filter: cfg.filter, handler });
        return ch;
      },
      subscribe: (cb?: (status: string) => void) => {
        if (cb) s.statusCallbacks.push({ channel: name, cb });
        return ch;
      },
    });
    return ch;
  };

  const client = {
    rpc: (name: string, args?: Json) => Promise.resolve(rpcImpl(name, args)),
    from,
    channel,
    removeChannel: () => {
      s.removedChannels++;
      return Promise.resolve("ok");
    },
  };

  return Object.assign(s, {
    client,
    reset() {
      s.player = [];
      s.admin = [];
      s.muted = [];
      s.legacy = false;
      s.legacyReads = [];
      s.legacyAdminReads = [];
      s.profileId = "profile-1";
      s.rpcCalls = [];
      s.fromCalls = [];
      s.errors = {};
      s.listeners = [];
      s.statusCallbacks = [];
      s.removedChannels = 0;
      s.tables = {};
    },
    /** Deliver a realtime frame to every matching subscription. */
    emit(table: string, eventType: "INSERT" | "UPDATE" | "DELETE", row: Json = {}) {
      for (const l of s.listeners.filter(x => x.table === table)) {
        l.handler({ eventType, new: row, old: {} });
      }
    },
    emitStatus(status: string) {
      for (const c of s.statusCallbacks) c.cb(status);
    },
    calls(name: string) {
      return s.rpcCalls.filter(c => c.name === name);
    },
  });
}

export const inbox = createInboxServer();
