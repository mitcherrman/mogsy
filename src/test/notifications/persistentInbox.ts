/**
 * Persistence for the in-memory inbox server, for the browser harness: state
 * lives in a Storage (localStorage) so a reload behaves like a reload against
 * the database and a second tab sees the first tab's writes.
 *
 * ATOMICITY. The server applies an RPC synchronously when it is called (the
 * returned promise is already settled). The state therefore must be re-read
 * and written back in that SAME synchronous step. An earlier version awaited
 * the RPC before saving; two overlapping calls (a permalink's mark-read and
 * the list refresh it triggers) then interleaved as read(A) → write(A) →
 * read(B, stale) → save(A) → save(B, stale), and A's write was lost. Real
 * Postgres writes are atomic; this keeps the stand-in honest about that.
 */
import type { createInboxServer, FakeAdminRow, FakePlayerRow } from "./inboxServer";

type Server = ReturnType<typeof createInboxServer>;
export type PersistedInbox = { admin: FakeAdminRow[]; player: FakePlayerRow[]; muted: string[] };

export interface PersistOptions {
  storage: Pick<Storage, "getItem" | "setItem">;
  key: string;
  seed: () => PersistedInbox;
  /** Start from the seed, discarding what was stored. */
  reset?: boolean;
}

export function attachPersistence(server: Server, { storage, key, seed, reset = false }: PersistOptions) {
  const load = (): PersistedInbox | null => {
    try {
      return JSON.parse(storage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  };
  const save = () =>
    storage.setItem(key, JSON.stringify({ admin: server.admin, player: server.player, muted: server.muted }));
  const restore = (state: PersistedInbox | null) => {
    const fallback = state ? null : seed();
    server.admin = state?.admin ?? fallback!.admin;
    server.player = state?.player ?? fallback!.player;
    server.muted = state?.muted ?? fallback!.muted;
  };

  restore(reset ? null : load());
  save();

  const rpc = server.client.rpc;
  // NOT async: restore → apply → save happen in one synchronous step.
  server.client.rpc = (name: string, args?: Record<string, unknown>) => {
    restore(load());
    const result = rpc(name, args);
    save();
    return result;
  };

  return {
    /** Re-read storage (another tab wrote) without writing anything. */
    reload: () => restore(load()),
    load,
  };
}
