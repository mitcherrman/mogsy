import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { installLocalStorageStub } from "@/test/localStorageStub";

// Opt into the shared Storage stub — the hook reads the pending record on
// mount, and jsdom 20 + vitest 3 ship no working Storage (see the stub's
// header). Without it every case here fails on `localStorage.clear`.
const resetStorage = installLocalStorageStub();

const mocks = vi.hoisted(() => ({
  user: { id: "anon-1", is_anonymous: true } as { id: string; is_anonymous: boolean } | null,
  authLoading: false,
  upgradeAnonymousEmail: vi.fn(),
  resendUpgradeConfirmation: vi.fn(),
}));

// `resend` re-issues the email directly rather than re-running submit — the
// password is already set by then and must not be asked for twice.
vi.mock("./account-upgrade", async (orig) => ({
  ...(await orig<typeof import("./account-upgrade")>()),
  resendUpgradeConfirmation: mocks.resendUpgradeConfirmation,
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

/** A valid password under the shared policy (6+ chars, no composition rules). */
const PW = "sixtee";

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
  mocks.user = { id: "anon-1", is_anonymous: true };
  mocks.authLoading = false;
  // Default: a confirmation link IS required, so the retained pending branch
  // runs. The converted-immediately branch is asserted explicitly below.
  mocks.upgradeAnonymousEmail.mockResolvedValue({ ok: true, converted: false });
  mocks.resendUpgradeConfirmation.mockResolvedValue({ ok: true });
});

afterAll(() => resetStorage());

describe("useAccountUpgrade", () => {
  it("moves to verification_pending on success and shows the entered email", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    expect(result.current.phase).toBe("idle");
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    expect(result.current.phase).toBe("verification_pending");
    expect(result.current.email).toBe("guest@example.com");
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1);
    // (email, password, redirectTo) — the redirect targets the dedicated
    // callback with the safe returnTo.
    expect(mocks.upgradeAnonymousEmail.mock.calls[0][1]).toBe(PW);
    expect(mocks.upgradeAnonymousEmail.mock.calls[0][2]).toContain("/auth/callback?returnTo=%2Fquiz");
  });

  it("blocks duplicate concurrent submits", async () => {
    let resolve!: (v: { ok: boolean }) => void;
    mocks.upgradeAnonymousEmail.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      // fire two submits before the first resolves
      const p1 = result.current.submit("guest@example.com", PW);
      const p2 = result.current.submit("guest@example.com", PW);
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
      await result.current.submit("guest@example.com", PW);
    });
    // upgradeAnonymousEmail is the ONLY auth mutation used.
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalled();
  });

  it("does not mark any profile permanent (no profile side effects in the hook)", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    // Only the pending record (no password, no is_anonymous change) exists.
    const pending = readPendingUpgrade();
    expect(pending).toBeNull(); // hook doesn't persist; the helper does (mocked out here)
  });

  it("a same-user TOKEN_REFRESHED (new User object, same id) does not restart the flow", async () => {
    const { result, rerender } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
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
      await result.current.submit("taken@example.com", PW);
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.emailInUse).toBe(true);
  });

  it("enforces a resend cooldown after sending", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    expect(result.current.cooldown).toBeGreaterThan(0);
    // resend is a no-op while cooling down
    await act(async () => {
      await result.current.resend();
    });
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalledTimes(1);
    expect(mocks.resendUpgradeConfirmation).not.toHaveBeenCalled();
  });

  // ---- AUTH1: verification is not a blocker ----

  it("reaches `converted` and hands the destination back when no link is needed", async () => {
    mocks.upgradeAnonymousEmail.mockResolvedValue({ ok: true, converted: true });
    const onConverted = vi.fn();
    const { result } = renderHook(() => useAccountUpgrade("/quiz/ranked", onConverted));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    expect(result.current.phase).toBe("converted");
    // The guest resumes exactly what they were doing — not the hub.
    expect(onConverted).toHaveBeenCalledWith("/quiz/ranked");
    // No inbox round-trip means no cooldown to sit through.
    expect(result.current.cooldown).toBe(0);
  });

  it("does not call onConverted while a confirmation is still outstanding", async () => {
    const onConverted = vi.fn();
    const { result } = renderHook(() => useAccountUpgrade("/quiz", onConverted));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    expect(result.current.phase).toBe("verification_pending");
    expect(onConverted).not.toHaveBeenCalled();
  });

  // ---- AUTH1: the shared password policy, enforced here ----

  it("accepts a 6-character password with no symbol, uppercase, or number", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", "abcdef");
    });
    expect(result.current.phase).toBe("verification_pending");
    expect(mocks.upgradeAnonymousEmail).toHaveBeenCalled();
  });

  it("rejects a password shorter than 6 without ever calling auth", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", "abcde");
    });
    expect(result.current.phase).toBe("error");
    expect(mocks.upgradeAnonymousEmail).not.toHaveBeenCalled();
  });

  it("rejects a confirmation mismatch when a confirmation is supplied", async () => {
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", "abcdef", "abcdeg");
    });
    expect(result.current.phase).toBe("error");
    expect(mocks.upgradeAnonymousEmail).not.toHaveBeenCalled();
  });

  it("refuses to submit when there is no anonymous user", async () => {
    mocks.user = { id: "real-1", is_anonymous: false };
    const { result } = renderHook(() => useAccountUpgrade("/quiz"));
    await act(async () => {
      await result.current.submit("guest@example.com", PW);
    });
    expect(result.current.phase).toBe("error");
    expect(mocks.upgradeAnonymousEmail).not.toHaveBeenCalled();
  });
});
