import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminAttention } from "./useAdminAttention";

/**
 * The Overview attention queue's admin-notification row (NOT1 Phase 2B).
 *
 * This hook postdates NOT1 Phase 2 — it arrived with the Admin Architecture
 * reorg and independently reintroduced the global-`is_read` count Phase 2
 * exists to remove. The row now reads admin_unread_notification_count(), whose
 * subject is auth.uid() and which takes no arguments at all.
 */

const calls = vi.hoisted(() => ({
  rpc: [] as { name: string; args: unknown }[],
  from: [] as { table: string; filters: [string, unknown][] }[],
  countError: null as { message: string } | null,
  countValue: 0 as number | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const filters: [string, unknown][] = [];
    calls.from.push({ table, filters });
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (col: string, val: unknown) => { filters.push([col, val]); return b; },
      then: (resolve: (v: unknown) => unknown) => resolve({ count: 0, data: [], error: null }),
    });
    return b;
  };
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      rpc: (name: string, args?: unknown) => {
        calls.rpc.push({ name, args });
        if (name === "admin_unread_notification_count") {
          return Promise.resolve({ data: calls.countValue, error: calls.countError });
        }
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});

const notifRow = (entries: ReturnType<typeof useAdminAttention>) =>
  entries.find(e => e.id === "admin-notifications")!;

beforeEach(() => {
  calls.rpc = [];
  calls.from = [];
  calls.countError = null;
  calls.countValue = 0;
});

describe("useAdminAttention — admin notification count", () => {
  it("reads the per-admin RPC, not a table count", async () => {
    calls.countValue = 3;
    const { result } = renderHook(() => useAdminAttention());
    await waitFor(() => expect(notifRow(result.current).count).toBe(3));
    expect(calls.rpc.some(c => c.name === "admin_unread_notification_count")).toBe(true);
  });

  it("never queries admin_notifications directly any more", async () => {
    const { result } = renderHook(() => useAdminAttention());
    await waitFor(() => expect(notifRow(result.current).count).toBe(0));
    expect(calls.from.some(c => c.table === "admin_notifications")).toBe(false);
  });

  it("passes no arguments, so it cannot be pointed at another admin", async () => {
    renderHook(() => useAdminAttention());
    await waitFor(() =>
      expect(calls.rpc.some(c => c.name === "admin_unread_notification_count")).toBe(true),
    );
    const call = calls.rpc.find(c => c.name === "admin_unread_notification_count")!;
    expect(call.args).toBeUndefined();
  });

  it("reports a failed count as unavailable rather than zero", async () => {
    calls.countError = { message: "admin role required" };
    const { result } = renderHook(() => useAdminAttention());
    await waitFor(() => expect(notifRow(result.current).count).toBe("error"));
  });

  it("labels the row as the viewer's own unread, not a site-wide figure", () => {
    const { result } = renderHook(() => useAdminAttention());
    expect(notifRow(result.current).label).toMatch(/my unread/i);
  });
});
