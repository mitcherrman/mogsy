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
}));

vi.mock("@/integrations/supabase/client", () => {
  class Client {
    private marker = "bound";
    rpc(name: string, args: unknown) {
      if (this?.marker !== "bound") throw new TypeError("rpc called without its client");
      state.calls.push({ name, args });
      return Promise.resolve(state.error ? { data: null, error: state.error } : { data: state.rows, error: null });
    }
  }
  return { supabase: new Client() };
});

import { fetchAdminPage, fetchPlayerPage, isMissingRpc } from "./api";

beforeEach(() => {
  state.calls = [];
  state.rows = [];
  state.error = null;
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
});
