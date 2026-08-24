/**
 * COM1-2B — subscription lifecycle.
 *
 * A realtime subscription that outlives its session is a correctness bug, not a
 * tidiness one: on a shared machine the previous account's channel would keep
 * invalidating under the new account's session. These tests are about teardown
 * on logout and on an account switch, and about NOT opening a channel for a
 * visitor who has no social state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profileByUser: {} as Record<string, string | null>,
  started: [] as string[],
  stopped: [] as string[],
  notified: 0,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({
          maybeSingle: async () => ({
            data: state.profileByUser[userId]
              ? { id: state.profileByUser[userId] }
              : null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/community/social-realtime", () => ({
  startSocialRealtime: (profileId: string) => {
    state.started.push(profileId);
    return () => state.stopped.push(profileId);
  },
}));

vi.mock("@/lib/community/friends-refresh", () => ({
  notifyFriendsChanged: () => {
    state.notified += 1;
    return Promise.resolve();
  },
}));

import { useSocialSync, REFOCUS_THROTTLE_MS } from "./useSocialSync";

beforeEach(() => {
  state.user = null;
  state.profileByUser = { "auth-a": "profile-a", "auth-b": "profile-b" };
  state.started = [];
  state.stopped = [];
  state.notified = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("who gets a channel", () => {
  it("opens nothing for a signed-out visitor", async () => {
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual([]));
  });

  it("opens nothing for an account with no profile row", async () => {
    state.user = { id: "auth-ghost" };
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual([]));
  });

  it("opens one channel for the signed-in account's profile", async () => {
    state.user = { id: "auth-a" };
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));
  });
});

describe("teardown", () => {
  it("releases the channel on unmount", async () => {
    state.user = { id: "auth-a" };
    const { unmount } = renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));
    unmount();
    expect(state.stopped).toEqual(["profile-a"]);
  });

  it("releases the channel on logout", async () => {
    state.user = { id: "auth-a" };
    const { rerender } = renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));

    state.user = null;
    rerender();
    await waitFor(() => expect(state.stopped).toEqual(["profile-a"]));
    expect(state.started).toEqual(["profile-a"]);
  });

  it("swaps channels on an account switch — never runs two at once", async () => {
    state.user = { id: "auth-a" };
    const { rerender } = renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));

    state.user = { id: "auth-b" };
    rerender();

    await waitFor(() => expect(state.started).toEqual(["profile-a", "profile-b"]));
    // The old profile's channel was released before the new one was in use.
    expect(state.stopped).toEqual(["profile-a"]);
  });
});

describe("the return-to-tab net", () => {
  const wake = () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    window.dispatchEvent(new Event("focus"));
  };

  it("re-reads when the tab comes back, because realtime does not replay", async () => {
    state.user = { id: "auth-a" };
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));

    wake();
    expect(state.notified).toBe(1);
  });

  it("throttles, so alt-tabbing is not a query storm", async () => {
    state.user = { id: "auth-a" };
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));
    // Fake time only AFTER the profile has resolved, so the async setup above
    // is not held up by a frozen clock.
    vi.useFakeTimers();

    wake();
    wake();
    wake();
    expect(state.notified).toBe(1);

    act(() => {
      vi.advanceTimersByTime(REFOCUS_THROTTLE_MS + 1);
    });
    wake();
    expect(state.notified).toBe(2);
  });

  it("does not re-read while the tab is still hidden", async () => {
    state.user = { id: "auth-a" };
    renderHook(() => useSocialSync());
    await waitFor(() => expect(state.started).toEqual(["profile-a"]));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state.notified).toBe(0);
  });
});
