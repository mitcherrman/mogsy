/**
 * EMAIL1 — AuthProvider: signUp metadata, and the post-signup intent consumer.
 * The properties that protect existing users live here: the consumer does
 * nothing for an account without an intent, nothing while the feature is off,
 * nothing for guests, and runs at most once per user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const sb = vi.hoisted(() => ({
  signUp: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
  invoke: vi.fn(),
  authListener: null as null | ((e: string, s: unknown) => void),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: sb.signUp,
      getSession: sb.getSession,
      refreshSession: sb.refreshSession,
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        sb.authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    functions: { invoke: sb.invoke },
  },
}));
vi.mock("@/lib/analytics", () => ({ observeAuthIdentity: vi.fn() }));
vi.mock("@/lib/analytics/sessionIntelligence", () => ({ observeAuthenticatedVisitor: vi.fn() }));
vi.mock("@/lib/auth/account-upgrade", () => ({
  ensureProfilePermanent: vi.fn(),
  initiateAnonymousEmailUpgrade: vi.fn(),
  syncProfilePermanent: vi.fn(),
}));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null, e2eSession: vi.fn(), e2eEnabled: () => false }));

import { AuthProvider, useAuth } from "./useAuth";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const session = (user: Record<string, unknown>) => ({ user: { id: "u-1", email: "me@example.com", is_anonymous: false, ...user } });

beforeEach(() => {
  sb.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sb.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  sb.refreshSession.mockClear();
  sb.invoke.mockReset().mockResolvedValue({ data: { result: "confirmation_required" }, error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("AuthProvider.signUp · EMAIL1 metadata", () => {
  const run = async (...args: Parameters<ReturnType<typeof useAuth>["signUp"]>) => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.signUp(...args); });
  };

  it("keeps the request EXACTLY as before when no box was ticked", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await run("a@b.co", "secret1", "Name");
    expect(sb.signUp.mock.calls[0][0]).toEqual({
      email: "a@b.co", password: "secret1",
      options: { emailRedirectTo: window.location.origin, data: { display_name: "Name" } },
    });
    await run("a@b.co", "secret1");
    expect(sb.signUp.mock.calls[1][0].options).toEqual({ emailRedirectTo: window.location.origin });
    await run("a@b.co", "secret1", "Name", { daily: false, news: false });
    expect(sb.signUp.mock.calls[2][0].options.data).toEqual({ display_name: "Name" });
  });

  it("adds an INTENT beside the display name when boxes are ticked", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await run("a@b.co", "secret1", "Name", { daily: true, news: false });
    expect(sb.signUp.mock.calls[0][0].options.data).toEqual({
      display_name: "Name",
      email_opt_in_intent: { topics: ["daily_reminder"], v: 1 },
    });
  });

  it("works without a display name", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await run("a@b.co", "secret1", undefined, { daily: false, news: true });
    expect(sb.signUp.mock.calls[0][0].options.data).toEqual({ email_opt_in_intent: { topics: ["product_news", "events"], v: 1 } });
  });

  it("is a no-op for the checkboxes when the feature is off", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    await run("a@b.co", "secret1", "Name", { daily: true, news: true });
    expect(sb.signUp.mock.calls[0][0].options.data).toEqual({ display_name: "Name" });
  });
});

describe("AuthProvider · signup-intent consumer", () => {
  const intent = { email_opt_in_intent: { topics: ["daily_reminder"], v: 1 } };
  const boot = async (user: Record<string, unknown> | null) => {
    sb.getSession.mockResolvedValue({ data: { session: user ? session(user) : null } });
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  };
  const consumerCalls = () => sb.invoke.mock.calls.filter((c) => c[1]?.body?.action === "consume_signup_intent");

  it("starts the double opt-in for a permanent account that carries an intent — once", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    const { rerender } = await boot({ user_metadata: intent });
    await waitFor(() => expect(consumerCalls()).toHaveLength(1));
    expect(consumerCalls()[0][0]).toBe("email-subscription");
    // The browser sends no address and no topics — the server reads the account.
    expect(consumerCalls()[0][1].body).toEqual({ action: "consume_signup_intent" });
    await waitFor(() => expect(sb.refreshSession).toHaveBeenCalled());
    rerender();
    expect(consumerCalls()).toHaveLength(1);
  });

  it("does NOTHING for an existing account without an intent", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    for (const user_metadata of [undefined, {}, { display_name: "Old" }, { email_opt_in_intent: null }, { email_opt_in_intent: { topics: [] } }]) {
      cleanup();
      sb.invoke.mockClear();
      await boot({ user_metadata });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(sb.invoke, JSON.stringify(user_metadata)).not.toHaveBeenCalled();
    }
  });

  it("does nothing while the feature is off, even with an intent present", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    await boot({ user_metadata: intent });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it("does nothing for a guest or an account without an email", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await boot({ is_anonymous: true, user_metadata: intent });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    cleanup();
    await boot({ email: null, user_metadata: intent });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it("a failing consumer never breaks the session", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    sb.invoke.mockRejectedValue(new Error("network"));
    const { result } = await boot({ user_metadata: intent });
    await waitFor(() => expect(consumerCalls()).toHaveLength(1));
    expect(result.current.user?.id).toBe("u-1");
    expect(result.current.loading).toBe(false);
  });
});
