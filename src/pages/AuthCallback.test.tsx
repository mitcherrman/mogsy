import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

// This suite reads and writes the pending-upgrade record, so it opts into the
// shared Storage stub (jsdom 20 + vitest 3 ship no working Storage — see the
// stub's header). Without it every case fails on `localStorage.clear`.
const resetStorage = installLocalStorageStub();
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const PENDING_KEY = "mogzy.account-upgrade.pending.v1";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  authLoading: false,
  getUser: vi.fn(),
  updateUser: vi.fn(),
  profileRow: {
    is_anonymous: false,
    onboarding_completed: false,
    ranked_tutorial_completed_at: "2026-07-19T00:00:00Z",
    ranked_tutorial_version: 1,
  } as Record<string, unknown>,
  profileUpdate: vi.fn(),
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: mocks.authLoading }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
    from: () => ({
      update: (payload: unknown) => {
        mocks.profileUpdate(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: cols.includes("ranked_tutorial")
                ? mocks.profileRow
                : { is_anonymous: false },
              error: null,
            }),
        }),
      }),
    }),
  },
}));

import AuthCallback from "./AuthCallback";

const convertedUser = {
  id: "anon-1",
  is_anonymous: false,
  email: "guest@example.com",
  identities: [{ provider: "email" }],
};

const renderAt = (search = "?returnTo=%2Fquiz") =>
  render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <AuthCallback />
    </MemoryRouter>,
  );

/** Default: a completed guest, so tutorial eligibility never interferes. */
const COMPLETED_PROFILE = {
  is_anonymous: false,
  onboarding_completed: false,
  ranked_tutorial_completed_at: "2026-07-19T00:00:00Z",
  ranked_tutorial_version: 1,
};

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
  // Restored explicitly: cases below mutate profileRow to exercise the
  // tutorial branch, and a leaked mutation would silently change what the
  // NEXT test is actually asserting.
  mocks.profileRow = { ...COMPLETED_PROFILE };
  mocks.authLoading = false;
  mocks.getUser.mockResolvedValue({ data: { user: convertedUser }, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);
afterAll(() => resetStorage());

/**
 * A LEGACY (pre-AUTH1) pending record: no `passwordSet`, so the callback must
 * still collect a password. This is deliberately the default for the existing
 * cases below — the old flow's records survive in real browsers and must keep
 * working.
 */
const setPending = (userId: string) =>
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ userId, email: "guest@example.com", returnTo: "/quiz" }),
  );

/** An AUTH1 pending record: the password was set before the email went out. */
const setPendingWithPassword = (userId: string, returnTo = "/quiz") =>
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ userId, email: "guest@example.com", returnTo, passwordSet: true }),
  );

describe("AuthCallback", () => {
  it("valid conversion with pending record → asks for a password (email-first)", async () => {
    setPending("anon-1");
    renderAt();
    await waitFor(() => expect(screen.getByTestId("callback-set-password")).toBeTruthy());
    // No password was set yet, no profile synced yet.
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("setting a valid password updates auth, syncs the profile, and routes", async () => {
    setPending("anon-1");
    renderAt();
    await waitFor(() => screen.getByTestId("callback-set-password"));
    fireEvent.change(screen.getByTestId("callback-password"), { target: { value: "hunter2secret" } });
    fireEvent.change(screen.getByTestId("callback-confirm"), { target: { value: "hunter2secret" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("callback-set-password"));
    });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "hunter2secret" });
    // Profile permanence synced only AFTER verified auth.
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ is_anonymous: false });
    // Completed-guest profile → routed to returnTo (no tutorial replay).
    expect(mocks.navigate).toHaveBeenCalledWith("/quiz", { replace: true });
  });

  it("password mismatch is rejected before any auth write", async () => {
    setPending("anon-1");
    renderAt();
    await waitFor(() => screen.getByTestId("callback-set-password"));
    fireEvent.change(screen.getByTestId("callback-password"), { target: { value: "abcdef1" } });
    fireEvent.change(screen.getByTestId("callback-confirm"), { target: { value: "different" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("callback-set-password"));
    });
    expect(screen.getByTestId("callback-password-error")).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("blocks profile sync on a user-id mismatch", async () => {
    setPending("someone-else"); // pending for a different guest than the verified user
    renderAt();
    await waitFor(() => expect(screen.getByTestId("callback-mismatch")).toBeTruthy());
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("shows recovery UI when the callback has no valid session", async () => {
    setPending("anon-1");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    renderAt();
    await waitFor(() => expect(screen.getByTestId("callback-error")).toBeTruthy());
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("shows an error for an expired/invalid link (error in URL)", async () => {
    renderAt("?returnTo=%2Fquiz&error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    await waitFor(() => expect(screen.getByTestId("callback-error")).toBeTruthy());
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("is idempotent with no pending record: syncs then routes (duplicate/cross-context callback)", async () => {
    // No pending set → treat as already-permanent; sync + route without asking password.
    renderAt();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/quiz", { replace: true }));
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ is_anonymous: false });
  });

  // ---- AUTH1: the password is set before the email is sent ----

  it("skips the password step entirely for an AUTH1 pending record", async () => {
    setPendingWithPassword("anon-1");
    renderAt();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/quiz", { replace: true }));
    // Nothing was asked for and nothing was re-written: confirming the email
    // was the whole remaining job.
    expect(screen.queryByTestId("callback-set-password")).toBeNull();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ is_anonymous: false });
  });

  it("still guards a user-id mismatch even when the password is already set", async () => {
    setPendingWithPassword("someone-else");
    renderAt();
    await waitFor(() => expect(screen.getByTestId("callback-mismatch")).toBeTruthy());
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("accepts a 6-character password with no symbol, uppercase, or number", async () => {
    setPending("anon-1");
    renderAt();
    await waitFor(() => screen.getByTestId("callback-set-password"));
    fireEvent.change(screen.getByTestId("callback-password"), { target: { value: "abcdef" } });
    fireEvent.change(screen.getByTestId("callback-confirm"), { target: { value: "abcdef" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("callback-set-password"));
    });
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: "abcdef" }));
  });

  it("rejects a 5-character password before any auth write", async () => {
    setPending("anon-1");
    renderAt();
    await waitFor(() => screen.getByTestId("callback-set-password"));
    fireEvent.change(screen.getByTestId("callback-password"), { target: { value: "abcde" } });
    fireEvent.change(screen.getByTestId("callback-confirm"), { target: { value: "abcde" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("callback-set-password"));
    });
    expect(screen.getByTestId("callback-password-error")).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  // ---- AUTH1: onboarding must not steal an explicit destination ----

  it("returns an explicit destination even when the tutorial is still owed", async () => {
    mocks.profileRow = {
      is_anonymous: false,
      onboarding_completed: false,
      ranked_tutorial_completed_at: null, // tutorial required
      ranked_tutorial_version: null,
    };
    setPendingWithPassword("anon-1", "/quiz/ranked");
    renderAt("?returnTo=%2Fquiz%2Franked");
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true }),
    );
  });

  it("falls back to the tutorial when NO destination was preserved", async () => {
    mocks.profileRow = {
      is_anonymous: false,
      onboarding_completed: false,
      ranked_tutorial_completed_at: null,
      ranked_tutorial_version: null,
    };
    setPendingWithPassword("anon-1");
    renderAt(""); // no returnTo at all
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith("/onboarding/ranked-tutorial", { replace: true }),
    );
  });

  it("rejects an unsafe returnTo and falls back to a safe path", async () => {
    setPending("anon-1");
    renderAt("?returnTo=%2F%2Fevil.com");
    await waitFor(() => screen.getByTestId("callback-set-password"));
    fireEvent.change(screen.getByTestId("callback-password"), { target: { value: "hunter2secret" } });
    fireEvent.change(screen.getByTestId("callback-confirm"), { target: { value: "hunter2secret" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("callback-set-password"));
    });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    // "//evil.com" must never be a navigation target.
    const dest = mocks.navigate.mock.calls[0][0];
    expect(dest).toBe("/quiz");
  });
});
