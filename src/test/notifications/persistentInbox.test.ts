import { describe, expect, it } from "vitest";
import { createInboxServer } from "./inboxServer";
import { attachPersistence, type PersistedInbox } from "./persistentInbox";

/**
 * The browser harness's stand-in database must not lose writes when calls
 * overlap — the defect behind the desktop flake on PR #97, where a
 * permalink's mark-read raced the refresh it triggers.
 */
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const seed = (): PersistedInbox => ({
  admin: [{ id: "s1", type: "feedback", category: "community", title: "Idea", is_read: false }],
  player: [],
  muted: [],
});

describe("attachPersistence", () => {
  it("keeps a write when another call starts before the first one is awaited", async () => {
    const storage = memoryStorage();
    const server = createInboxServer();
    attachPersistence(server, { storage, key: "k", seed });
    const write = server.client.rpc("admin_set_notification_state", { _ids: ["s1"], _action: "read", _tab: null });
    const refresh = server.client.rpc("admin_get_notifications", { _tab: "community", _limit: 30 });
    const counts = server.client.rpc("admin_notification_counts");
    await Promise.all([write, refresh, counts]);
    expect(JSON.parse(storage.getItem("k")!).admin[0].is_read).toBe(true);
    const page = (await server.client.rpc("admin_get_notifications", { _tab: "community", _limit: 30 })).data as Array<{ is_read: boolean }>;
    expect(page[0].is_read).toBe(true);
  });

  it("honours another tab's write on the next call, and a reload sees it", async () => {
    const storage = memoryStorage();
    const tabA = createInboxServer();
    const tabB = createInboxServer();
    attachPersistence(tabA, { storage, key: "k", seed, reset: true });
    attachPersistence(tabB, { storage, key: "k", seed });
    await tabA.client.rpc("admin_set_notification_state", { _ids: ["s1"], _action: "done", _tab: null });
    const page = (await tabB.client.rpc("admin_get_notifications", { _tab: "community", _limit: 30 })).data as unknown[];
    expect(page).toHaveLength(0);
    const reloaded = createInboxServer();
    attachPersistence(reloaded, { storage, key: "k", seed });
    expect(reloaded.admin[0].done).toBe(true);
  });

  it("reset starts from the seed regardless of what was stored", () => {
    const storage = memoryStorage();
    storage.setItem("k", JSON.stringify({ admin: [], player: [], muted: ["social"] }));
    const server = createInboxServer();
    attachPersistence(server, { storage, key: "k", seed, reset: true });
    expect(server.admin).toHaveLength(1);
    expect(server.muted).toEqual([]);
  });
});
