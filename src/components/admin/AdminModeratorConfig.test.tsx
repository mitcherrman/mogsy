import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminModeratorConfig from "./AdminModeratorConfig";

/**
 * Moderator-request disposition (NOT1 Phase 2B).
 *
 * This is the ONE surface where admin_notifications.is_read still means
 * something, and what it means is narrow: this delete request has been approved
 * or denied and must not be actioned twice. That is genuinely global — the
 * approve path already executed the delete.
 *
 * Disposition and the acting admin's read receipt are two writes to two tables.
 * Doing them as two client calls leaves a real failure window, so they go
 * through admin_resolve_mod_request(uuid, boolean), which does both in one
 * transaction and takes the acting admin from auth.uid().
 */

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toasts) }));

const db = vi.hoisted(() => ({
  notifs: [] as Record<string, unknown>[],
  rpcCalls: [] as { name: string; args: unknown }[],
  updateCalls: [] as { table: string; values: unknown }[],
  deleteCalls: [] as string[],
  rpcError: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    const result = () => {
      if (table === "admin_notifications") return { data: db.notifs, error: null };
      return { data: [], error: null };
    };
    Object.assign(b, {
      select: chain,
      eq: chain,
      in: chain,
      order: chain,
      // Recorded, never honoured — a surviving direct is_read write must fail
      // this suite rather than quietly keep working.
      update: (values: unknown) => { db.updateCalls.push({ table, values }); return b; },
      delete: () => { db.deleteCalls.push(table); return b; },
      limit: () => Promise.resolve(result()),
      then: (resolve: (v: unknown) => unknown) => resolve(result()),
    });
    return b;
  };
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      rpc: (name: string, args?: unknown) => {
        db.rpcCalls.push({ name, args });
        if (db.rpcError) return Promise.resolve({ data: null, error: db.rpcError });
        return Promise.resolve({ data: "delete this item [APPROVED]", error: null });
      },
    },
  };
});

const request = (over: Record<string, unknown> = {}) => ({
  id: "req-1",
  type: "mod_delete_request",
  title: "Delete request",
  message: "delete this item",
  metadata: { target_type: "item", target_id: "item-1", mod_name: "Mod" },
  is_read: false,
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  db.notifs = [request()];
  db.rpcCalls = [];
  db.updateCalls = [];
  db.deleteCalls = [];
  db.rpcError = null;
  vi.clearAllMocks();
});

describe("AdminModeratorConfig — disposition goes through the RPC", () => {
  it("approves via admin_resolve_mod_request", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(db.rpcCalls.length).toBe(1));
    expect(db.rpcCalls[0]).toEqual({
      name: "admin_resolve_mod_request",
      args: { _notification_id: "req-1", _approved: true },
    });
  });

  it("denies via the same RPC with _approved false", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Deny"));
    await waitFor(() => expect(db.rpcCalls.length).toBe(1));
    expect(db.rpcCalls[0].args).toEqual({ _notification_id: "req-1", _approved: false });
  });

  it("never updates admin_notifications.is_read from the client", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(db.rpcCalls.length).toBe(1));
    expect(db.updateCalls).toEqual([]);
  });

  it("passes no admin id, so a receipt cannot be forged for someone else", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Deny"));
    await waitFor(() => expect(db.rpcCalls.length).toBe(1));
    expect(Object.keys(db.rpcCalls[0].args as object).sort())
      .toEqual(["_approved", "_notification_id"]);
  });

  it("still executes the delete before dispositioning an approval", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(db.rpcCalls.length).toBe(1));
    expect(db.deleteCalls).toContain("preset_items");
  });

  it("says what actually failed when the RPC rejects an approval", async () => {
    db.rpcError = { message: "admin role required" };
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(toasts.success).not.toHaveBeenCalled();
  });
});

describe("AdminModeratorConfig — is_read is disposition, not read state", () => {
  it("treats a dispositioned request as handled for every admin", async () => {
    db.notifs = [request({ is_read: true, message: "delete this item [APPROVED]" })];
    render(<AdminModeratorConfig />);
    expect(await screen.findByText("Approved")).toBeTruthy();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Deny")).toBeNull();
  });

  it("counts pending by disposition, not by anyone's read state", async () => {
    db.notifs = [request({ id: "a", is_read: false }), request({ id: "b", is_read: true })];
    render(<AdminModeratorConfig />);
    expect(await screen.findByText(/Moderator Requests \(1 pending\)/)).toBeTruthy();
  });

  it("marks the row handled locally once the RPC succeeds", async () => {
    render(<AdminModeratorConfig />);
    fireEvent.click(await screen.findByText("Approve"));
    expect(await screen.findByText("Approved")).toBeTruthy();
  });
});
