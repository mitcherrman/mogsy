import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real supabase-js client implements rpc()/from() as methods that read
 * `this`. This double does the same, so calling either detached (the bug a
 * cast like `(supabase.rpc as …)(name)` introduces) fails here, not in prod.
 */
const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  rows: [] as Record<string, unknown>[],
  error: null as null | { code?: string; message: string },
  hang: false,
}));

vi.mock("@/integrations/supabase/client", () => {
  class Client {
    private marker = "bound";
    rpc(name: string, args: unknown) {
      if (this?.marker !== "bound") throw new TypeError("rpc called without its client");
      state.calls.push({ name, args });
      if (state.hang) return new Promise(() => {});
      return Promise.resolve(state.error ? { data: null, error: state.error } : { data: state.rows, error: null });
    }
  }
  return { supabase: new Client() };
});

import {
  NOTIFICATION_RPC_TIMEOUT_MS,
  describeNotificationError,
  fetchAdminPage,
  fetchPlayerPage,
  isMissingRpc,
  isOwnerRefusal,
} from "./api";

beforeEach(() => {
  state.calls = [];
  state.rows = [];
  state.error = null;
  state.hang = false;
});

describe("isMissingRpc", () => {
  it("recognises PostgREST's schema-cache miss and Postgres undefined_function, nothing else", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingRpc({ code: "42883", message: "x" })).toBe(true);
    expect(isMissingRpc({ message: "Could not find the function public.get_my_notifications" })).toBe(true);
    expect(isMissingRpc({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });
});

describe("pagination", () => {
  const row = (i: number) => ({
    id: `id-${i}`, type: "update", category: "announcement", title: `t${i}`,
    created_at: "2026-10-19T00:00:00Z", activity_at: "2026-10-19T00:00:00Z", sort_at: "2026-10-19T00:00:00Z",
    state: "active", is_read: false,
  });

  it("asks for one extra row to learn whether more exist, and returns only the page", async () => {
    state.rows = Array.from({ length: 11 }, (_, i) => row(i));
    const page = await fetchPlayerPage("u", "inbox", null, 10);
    expect(state.calls[0]).toEqual({
      name: "get_my_notifications",
      args: { _view: "inbox", _limit: 11, _cursor_at: null, _cursor_id: null },
    });
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.mode).toBe("v2");
  });

  it("passes the admin keyset cursor through untouched", async () => {
    state.rows = [{ ...row(1), category: "action", priority: "high", sort_rank: 1 }];
    const page = await fetchAdminPage("u", "action", { rank: 1, at: "2026-10-18T00:00:00Z", id: "id-0" }, 5);
    expect(state.calls[0].args).toEqual({
      _tab: "action", _limit: 6, _cursor_rank: 1, _cursor_at: "2026-10-18T00:00:00Z", _cursor_id: "id-0",
    });
    expect(page.items[0].cursor).toEqual({ rank: 1, at: "2026-10-19T00:00:00Z", id: "id-1" });
    expect(page.hasMore).toBe(false);
  });

  it("surfaces a real server error instead of falling back", async () => {
    state.error = { code: "42501", message: "admin role required" };
    await expect(fetchAdminPage("u", "action")).rejects.toThrow("admin role required");
  });

  it("names the RPC that failed, so the UI can say which read broke (#146)", async () => {
    state.error = { code: "42501", message: "admin role required" };
    const error = await fetchAdminPage("u", "action").catch(e => e);
    expect(describeNotificationError(error)).toEqual({
      operation: "admin_get_notifications", code: "42501", message: "admin role required",
    });
    expect(isOwnerRefusal(error)).toBe(true);
  });
});

describe("#146 failure reporting", () => {
  it("a request that never settles fails as `timeout` instead of loading forever", async () => {
    vi.useFakeTimers();
    try {
      state.hang = true;
      const pending = fetchPlayerPage("u", "inbox").catch(e => e);
      await vi.advanceTimersByTimeAsync(NOTIFICATION_RPC_TIMEOUT_MS + 1);
      expect(describeNotificationError(await pending)).toEqual({
        operation: "get_my_notifications", code: "timeout", message: "get_my_notifications did not respond",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("strips ids, emails and token-shaped strings from what it shows", () => {
    const d = describeNotificationError({
      code: "P0001",
      message: "row 3aa6a1fb-a7ac-404e-9763-cc9ec8d4e6de for owner@example.com via eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop",
    });
    expect(d.message).toBe("row <id> for <email> via <redacted>");
    expect(JSON.stringify(d)).not.toMatch(/example\.com|eyJ|3aa6a1fb/);
    expect(describeNotificationError({ message: "key a1b2c3d4e5f6a7b8c9d0e1f2a3b4 leaked" }).message).toBe("key <redacted> leaked");
    expect(describeNotificationError({ message: "get_my_notification_summary did not respond" }).message).toBe(
      "get_my_notification_summary did not respond",
    );
  });

  it("drops a code or operation that is not a plain identifier", () => {
    expect(describeNotificationError({ code: "<script>", operation: "Bearer xyz", message: "m" })).toEqual({
      operation: "notifications", code: null, message: "m",
    });
  });

  it("treats only the server's owner gate as a recoverable owner refusal", () => {
    expect(isOwnerRefusal({ code: "42501", message: "admin role required" })).toBe(true);
    expect(isOwnerRefusal({ code: "42501", message: "step_up_required" })).toBe(true);
    expect(isOwnerRefusal({ code: "42501", message: "authentication required" })).toBe(false);
    expect(isOwnerRefusal({ code: "42501", message: "permission denied for table admin_notifications" })).toBe(false);
    expect(isOwnerRefusal(null)).toBe(false);
  });
});
