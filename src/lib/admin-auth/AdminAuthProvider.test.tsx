import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminSessionOutcome } from "./types";

// Controllable auth + session-check mocks.
interface AuthShape {
  user: { id: string; is_anonymous?: boolean } | null;
  session: { access_token: string } | null;
  loading: boolean;
}
let authValue: AuthShape;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authValue }));

const fetchMock = vi.fn<() => Promise<AdminSessionOutcome>>();
vi.mock("./adminSessionClient", () => ({ fetchAdminSession: () => fetchMock() }));

import { AdminAuthProvider, useAdminAuth } from "./AdminAuthProvider";
import { activateFallbackKey, clearFallbackKey } from "./adminCredentials";

function Probe() {
  const a = useAdminAuth();
  return (
    <div>
      <div data-testid="status">{a.status}</div>
      <div data-testid="method">{a.principal?.authMethod ?? "-"}</div>
      <button data-testid="recheck" onClick={a.recheck} />
    </div>
  );
}

const authorized = (): AdminSessionOutcome => ({
  kind: "authorized",
  principal: { authMethod: "supabase_user", userId: "u1", email: null },
});

beforeEach(() => {
  clearFallbackKey();
  fetchMock.mockReset();
  authValue = { user: { id: "u1", is_anonymous: false }, session: { access_token: "tok" }, loading: false };
});
afterEach(() => {
  cleanup();
  clearFallbackKey();
});

const renderProvider = () =>
  render(
    <AdminAuthProvider>
      <Probe />
    </AdminAuthProvider>,
  );
const status = () => screen.getByTestId("status").textContent;

describe("AdminAuthProvider state machine", () => {
  it("is loading while Supabase auth initializes (no check yet)", async () => {
    authValue = { user: null, session: null, loading: true };
    renderProvider();
    expect(status()).toBe("loading");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is signed_out with no user and no fallback (no network)", async () => {
    authValue = { user: null, session: null, loading: false };
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_out"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("authorizes a signed-in allowlisted account via the session check", async () => {
    fetchMock.mockResolvedValue(authorized());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    expect(screen.getByTestId("method").textContent).toBe("supabase_user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks fallback authorization distinctly (admin_key)", async () => {
    fetchMock.mockResolvedValue({
      kind: "authorized",
      principal: { authMethod: "admin_key", userId: null, email: null },
    });
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized_via_fallback"));
  });

  it("shows signed_in_non_admin on 403 for a real account (not a key prompt)", async () => {
    fetchMock.mockResolvedValue({ kind: "forbidden" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_in_non_admin"));
  });

  it("shows fallback_rejected when a fallback key is present but 403", async () => {
    authValue = { user: null, session: null, loading: false };
    activateFallbackKey("bad-key");
    fetchMock.mockResolvedValue({ kind: "forbidden" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("fallback_rejected"));
  });

  it("distinguishes backend_unavailable from non-admin", async () => {
    fetchMock.mockResolvedValue({ kind: "unavailable" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("backend_unavailable"));
  });

  it("fails closed to malformed_response", async () => {
    fetchMock.mockResolvedValue({ kind: "malformed" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("malformed_response"));
  });

  it("shows expired_session for a real user with no live token (one cycle, no fetch)", async () => {
    authValue = { user: { id: "u1", is_anonymous: false }, session: null, loading: false };
    renderProvider();
    await waitFor(() => expect(status()).toBe("expired_session"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an anonymous user as signed_out (never non-admin)", async () => {
    authValue = { user: { id: "anon", is_anonymous: true }, session: { access_token: "t" }, loading: false };
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_out"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechecks exactly once on explicit retry", async () => {
    fetchMock.mockResolvedValue(authorized());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("recheck"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("does not loop: a stable authorized state issues exactly one check", async () => {
    fetchMock.mockResolvedValue(authorized());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks on account switch (user id change)", async () => {
    fetchMock.mockResolvedValue(authorized());
    const view = renderProvider();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Switch account: new user id + token → provider must re-authorize.
    authValue = { user: { id: "u2", is_anonymous: false }, session: { access_token: "tok2" }, loading: false };
    fetchMock.mockResolvedValue({ kind: "forbidden" });
    view.rerender(
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(status()).toBe("signed_in_non_admin"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears authorized state on sign-out", async () => {
    fetchMock.mockResolvedValue(authorized());
    const view = renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    authValue = { user: null, session: null, loading: false };
    view.rerender(
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(status()).toBe("signed_out"));
  });
});
