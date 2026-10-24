import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #146 — the inbox hooks' loading path against the production failure modes:
 * an owner session whose trusted-device attestation lapsed (the server's OWN1
 * has_role() answers 42501 "admin role required"), a request that never
 * settles, and a re-subscribe after a tab/view switch.
 */
const h = vi.hoisted(() => ({
  topics: [] as string[],
  adminPage: vi.fn(),
  adminCounts: vi.fn(),
  playerPage: vi.fn(),
  playerSummary: vi.fn(),
  ensureOwnerAuthorized: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const channel = () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  };
  return {
    supabase: {
      channel: (topic: string) => {
        h.topics.push(topic);
        return channel();
      },
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/lib/admin-auth/ownerSession", () => ({ ensureOwnerAuthorized: h.ensureOwnerAuthorized }));

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchAdminPage: h.adminPage,
  fetchAdminCounts: h.adminCounts,
  fetchPlayerPage: h.playerPage,
  fetchPlayerSummary: h.playerSummary,
}));

import { useAdminInbox } from "./useAdminInbox";
import { usePlayerInbox } from "./usePlayerInbox";

const refusal = () =>
  Object.assign(new Error("admin role required"), { code: "42501", message: "admin role required", operation: "admin_get_notifications" });
const COUNTS = {
  action_unresolved: 1, action_unread: 1, action_critical: 0, community_active: 0, community_unread: 0,
  platform_active: 0, platform_unread: 0, saved: 0, unread_total: 1,
};
const page = { items: [], hasMore: false, mode: "v2" as const };

beforeEach(() => {
  h.topics = [];
  for (const f of [h.adminPage, h.adminCounts, h.playerPage, h.playerSummary, h.ensureOwnerAuthorized]) f.mockReset();
  h.adminCounts.mockResolvedValue({ counts: COUNTS, mode: "v2" });
  h.playerPage.mockResolvedValue(page);
  h.playerSummary.mockResolvedValue({ unread: 0, active: 0, actionable: 0, saved: 0 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("admin inbox × lapsed owner attestation", () => {
  it("re-attests once and loads, instead of a dead 'Couldn't load' (the production symptom)", async () => {
    h.adminPage.mockRejectedValueOnce(refusal()).mockResolvedValue(page);
    h.ensureOwnerAuthorized.mockResolvedValue(true);
    const { result } = renderHook(() => useAdminInbox({ enabled: true, userId: "owner", tab: "action" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(h.ensureOwnerAuthorized).toHaveBeenCalledTimes(1);
    expect(result.current.counts?.action_unresolved).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("never loops: if the trusted device cannot restore access the refusal stands, sanitized", async () => {
    h.adminPage.mockRejectedValue(refusal());
    h.ensureOwnerAuthorized.mockResolvedValue(false);
    const { result } = renderHook(() => useAdminInbox({ enabled: true, userId: "owner", tab: "action" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(h.ensureOwnerAuthorized).toHaveBeenCalledTimes(1);
    expect(h.adminPage).toHaveBeenCalledTimes(1);
    expect(result.current.error).toEqual({ operation: "admin_get_notifications", code: "42501", message: "admin role required" });
  });

  it("does not re-attest for errors that are not an owner refusal", async () => {
    h.adminPage.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX000", message: "boom" }));
    const { result } = renderHook(() => useAdminInbox({ enabled: true, userId: "owner", tab: "action" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(h.ensureOwnerAuthorized).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe("XX000");
  });

  it("subscribes on a fresh realtime topic after a tab switch (a reused, closing channel never re-joins)", async () => {
    h.adminPage.mockResolvedValue(page);
    const { result, rerender } = renderHook(({ tab }) => useAdminInbox({ enabled: true, userId: "owner", tab }), {
      initialProps: { tab: "action" as "action" | "community" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ tab: "community" });
    await waitFor(() => expect(h.topics.length).toBeGreaterThanOrEqual(2));
    expect(new Set(h.topics).size).toBe(h.topics.length);
  });
});

describe("player inbox", () => {
  it("does not depend on owner authorization at all", async () => {
    const { result } = renderHook(() => usePlayerInbox({ enabled: true, userId: "player" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(h.ensureOwnerAuthorized).not.toHaveBeenCalled();
  });

  it("reports a failed read with a sanitized detail and recovers on retry", async () => {
    h.playerPage.mockRejectedValueOnce(
      Object.assign(new Error("x"), { code: "timeout", message: "get_my_notifications did not respond", operation: "get_my_notifications" }),
    );
    const { result } = renderHook(() => usePlayerInbox({ enabled: true, userId: "player" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toEqual({
      operation: "get_my_notifications", code: "timeout", message: "get_my_notifications did not respond",
    });
    await act(() => result.current.refresh());
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("subscribes on a fresh realtime topic after a view switch", async () => {
    const { result, rerender } = renderHook(({ view }) => usePlayerInbox({ enabled: true, userId: "player", view }), {
      initialProps: { view: "inbox" as "inbox" | "history" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ view: "history" });
    await waitFor(() => expect(h.topics.length).toBeGreaterThanOrEqual(2));
    expect(new Set(h.topics).size).toBe(h.topics.length);
  });
});
