/**
 * PULSE-2A viewer identity: only a permanent account is an account; the
 * provider follows the viewer and nothing else.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; is_anonymous?: boolean }, throws: false }));
const premium = vi.hoisted(() => ({ proStatus: "unknown" as "unknown" | "pro" | "free" }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => {
    if (auth.throws) throw new Error("useAuth must be used within AuthProvider");
    return { user: auth.user, loading: false };
  },
}));
vi.mock("@/hooks/usePremiumSession", () => ({ usePremiumSession: () => ({ isPro: premium.proStatus === "pro", proStatus: premium.proStatus }) }));

import { useLivePulseProvider, usePulseViewer } from "./useLivePulseProvider";

describe("usePulseViewer", () => {
  it("signed out, anonymous guest sessions and hosts without auth are guests", () => {
    auth.throws = false;
    auth.user = null;
    expect(renderHook(() => usePulseViewer()).result.current).toEqual({ kind: "guest" });
    auth.user = { id: "anon-1", is_anonymous: true };
    expect(renderHook(() => usePulseViewer()).result.current).toEqual({ kind: "guest" });
    auth.throws = true;
    expect(renderHook(() => usePulseViewer()).result.current).toEqual({ kind: "guest" });
    auth.throws = false;
  });

  it("a permanent account is an account, with the entitlement session's answer", () => {
    auth.user = { id: "user-1", is_anonymous: false };
    premium.proStatus = "pro";
    expect(renderHook(() => usePulseViewer()).result.current).toEqual({ kind: "account", id: "user-1", premium: "pro" });
  });
});

describe("useLivePulseProvider", () => {
  it("keeps one provider for one viewer and hands over a new one when the viewer changes", () => {
    auth.user = { id: "user-1" };
    premium.proStatus = "free";
    const { result, rerender } = renderHook(() => useLivePulseProvider());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    auth.user = { id: "user-2" };
    rerender();
    expect(result.current).not.toBe(first);
    const second = result.current;
    auth.user = null;
    rerender();
    expect(result.current).not.toBe(second);
    expect(result.current.id).toBe("live-v1:guest");
  });

  it("never puts the user id in the provider id", () => {
    auth.user = { id: "user-secret-id" };
    expect(renderHook(() => useLivePulseProvider()).result.current.id).not.toContain("user-secret-id");
  });
});
