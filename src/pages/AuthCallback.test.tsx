import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.authLoading = false;
  mocks.getUser.mockResolvedValue({ data: { user: convertedUser }, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

const setPending = (userId: string) =>
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ userId, email: "guest@example.com", returnTo: "/quiz" }),
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
