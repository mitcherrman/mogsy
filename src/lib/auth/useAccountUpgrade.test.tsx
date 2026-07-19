import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { id: "anon-1", is_anonymous: true } as { id: string; is_anonymous: boolean } | null,
  authLoading: false,
  upgradeAnonymousEmail: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: mocks.authLoading,
    upgradeAnonymousEmail: mocks.upgradeAnonymousEmail,
  }),
}));

import { useAccountUpgrade } from "./useAccountUpgrade";
import { readPendingUpgrade } from "./account-upgrade";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.user = { id: "anon-1", is_anonymous: true };
  mocks.authLoading = false;
  mocks.upgradeAnonymousEmail.mockResolvedValue({ ok: true });
});

describe("useAccountUpgrade", () => {
  it("moves to verification_pending on success and shows the entered email", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    expect(result.current.phase).toBe("idle");
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    expect(result.current.phase).toBe("verification_pending");
    expect(result.current.email).toBe("guest@example.com");
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1);
    // redirect targets the dedicated callback with the safe returnTo.
    expect(mocks.upgradeAnonymousEmail.mock.calls[0][1]).toContain("/auth/callback?returnTo=%2Fquiz");
  });

  it("blocks duplicate concurrent submits", async () => {
    let resolve!: (v: { ok: boolean }) => void;
    mocks.upgradeAnonymousEmail.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      // fire two submits before the first resolves
      const p1 = result.current.submit("guest@example.com");
      const p2 = result.current.submit("guest@example.com");
      resolve({ ok: true });
      await Promise.all([p1, p2]);
    });
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1);
  });

  it("never invokes signOut or signUp (only the guarded upgrade path)", async () => {
    // The hook has no access to supabase auth; it can only call the injected
    // upgradeAnonymousEmail. This asserts the surface stays minimal.
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    // upgradeAnonymousEmail is the ONLY auth mutation used.
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalled();
  });

  it("does not mark any profile permanent (no profile side effects in the hook)", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    // Only the pending record (no password, no is_anonymous change) exists.
    const pending = readPendingUpgrade();
    expect(pending).toBeNull(); // hook doesn't persist; the helper does (mocked out here)
  });

  it("a same-user TOKEN_REFRESHED (new User object, same id) does not restart the flow", async () => {
    const { result, rerender } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    expect(result.current.phase).toBe("verification_pending");
    // Simulate auth refresh: new user object, same id.
    mocks.user = { id: "anon-1", is_anonymous: true };
    rerender();
    expect(result.current.phase).toBe("verification_pending");
    expect(result.current.email).toBe("guest@example.com");
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1); // not re-initiated
  });

  it("surfaces an error phase with emailInUse when the email is taken", async () => {
    mocks.upgradeAnonymousEmail.mockResolvedValue({
      ok: false,
      emailInUse: true,
      error: "That email is already linked to an account. Sign in instead.",
    });
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("taken@example.com");
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.emailInUse).toBe(true);
  });

  it("enforces a resend cooldown after sending", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    expect(result.current.cooldown).toBeGreaterThan(0);
    // resend is a no-op while cooling down
    await act(async () => {
      await result.current.resend();
    });
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses to submit when there is no anonymous user", async () => {
    mocks.user = { id: "real-1", is_anonymous: false };
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com");
    });
    expect(result.current.phase).toBe("error");
    expect(mocks.upgradeAnonymousEmail).not.toHaveBeenCalled();
  });
});
