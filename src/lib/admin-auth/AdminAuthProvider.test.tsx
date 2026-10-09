// OWN1.1 — AdminAuthProvider is layered on the ONE shared owner session.
// Railway is consulted only for the authorized owner, an established
// authorization never flips back to "checking", and a 403 re-attests once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminSessionOutcome } from "./types";
import type { OwnerAuthStateResult } from "./ownerAuth";

interface AuthShape {
  user: { id: string; is_anonymous?: boolean } | null;
  session: { access_token: string } | null;
  loading: boolean;
}
let authValue: AuthShape;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authValue }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));

// Server owner state (owner_auth_state) and the trusted-device attestation.
const ownerState = vi.fn<() => Promise<OwnerAuthStateResult>>();
const attest = vi.fn<() => Promise<boolean>>();
vi.mock("./ownerAuth", async (orig) => ({
  ...(await orig<typeof import("./ownerAuth")>()),
  fetchOwnerAuthStateResult: () => ownerState(),
}));
vi.mock("./ownerDevice", () => ({ attestStoredDevice: () => attest() }));

// Railway GET /api/admin/session.
const railway = vi.fn<() => Promise<AdminSessionOutcome>>();
vi.mock("./adminSessionClient", () => ({ fetchAdminSession: () => railway() }));

import { AdminAuthProvider, useAdminAuth } from "./AdminAuthProvider";

const seen: string[] = [];
function Probe() {
  const a = useAdminAuth();
  seen.push(a.status);
  return (
    <div>
      <div data-testid="status">{a.status}</div>
      <div data-testid="method">{a.principal?.authMethod ?? "-"}</div>
      <button data-testid="recheck" onClick={a.recheck} />
    </div>
  );
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const ok = (s: Partial<{ isOwner: boolean; authorized: boolean; aal: "aal1" | "aal2" | null; trustedDevice: boolean; freshAal2: boolean }>): OwnerAuthStateResult => ({
  ok: true,
  state: { isOwner: false, authorized: false, aal: null, trustedDevice: false, freshAal2: false, ...s },
});
const AUTHORIZED_OWNER = ok({ isOwner: true, authorized: true, aal: "aal2" });
const railwayOk = (): AdminSessionOutcome => ({
  kind: "authorized",
  principal: { authMethod: "supabase_owner", userId: OWNER, email: null },
});

beforeEach(() => {
  seen.length = 0;
  ownerState.mockReset();
  attest.mockReset().mockResolvedValue(false);
  railway.mockReset();
  authValue = { user: { id: OWNER, is_anonymous: false }, session: { access_token: "tok" }, loading: false };
});
afterEach(() => {
  cleanup();
});

const tree = () => (
  <AdminAuthProvider>
    <Probe />
  </AdminAuthProvider>
);
const renderProvider = () => render(tree());
const status = () => screen.getByTestId("status").textContent;

describe("AdminAuthProvider — derived from the canonical owner session", () => {
  it("is loading while Supabase auth initializes (no owner check, no Railway)", () => {
    authValue = { user: null, session: null, loading: true };
    renderProvider();
    expect(status()).toBe("loading");
    expect(ownerState).not.toHaveBeenCalled();
    expect(railway).not.toHaveBeenCalled();
  });

  it("signed out → signed_out, no network at all", async () => {
    authValue = { user: null, session: null, loading: false };
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_out"));
    expect(ownerState).not.toHaveBeenCalled();
    expect(railway).not.toHaveBeenCalled();
  });

  it("an anonymous session is signed_out (never asks the server)", async () => {
    authValue = { user: { id: "anon", is_anonymous: true }, session: { access_token: "t" }, loading: false };
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_out"));
    expect(ownerState).not.toHaveBeenCalled();
  });

  it("a non-owner is signed_in_non_admin and Railway is never called", async () => {
    authValue = { user: { id: "someone-else" }, session: { access_token: "t" }, loading: false };
    ownerState.mockResolvedValue(ok({ isOwner: false }));
    renderProvider();
    await waitFor(() => expect(status()).toBe("signed_in_non_admin"));
    expect(railway).not.toHaveBeenCalled();
  });

  it("the owner on an AAL1 session with no trusted device → needs_step_up (not a denial)", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: false, aal: "aal1" }));
    renderProvider();
    await waitFor(() => expect(status()).toBe("needs_step_up"));
    expect(attest).toHaveBeenCalledTimes(1); // tried the stored device once
    expect(railway).not.toHaveBeenCalled();
  });

  it("the authorized owner + Railway supabase_owner → authorized", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    expect(screen.getByTestId("method").textContent).toBe("supabase_owner");
    expect(railway).toHaveBeenCalledTimes(1);
  });

  it("a trusted device restores authorization without MFA", async () => {
    ownerState
      .mockResolvedValueOnce(ok({ isOwner: true, authorized: false, aal: "aal1" }))
      .mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal1", trustedDevice: true }));
    attest.mockResolvedValue(true);
    railway.mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    expect(seen).not.toContain("needs_step_up");
  });

  it("fails closed on a malformed Railway success body", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue({ kind: "malformed" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("malformed_response"));
  });

  it("a Railway 403 re-attests once and retries once — then authorizes", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    attest.mockResolvedValue(true);
    railway.mockResolvedValueOnce({ kind: "forbidden" }).mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    expect(railway).toHaveBeenCalledTimes(2);
  });

  it("a persistent Railway 403 reports owner_denied after exactly one retry (no loop)", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    attest.mockResolvedValue(true);
    railway.mockResolvedValue({ kind: "forbidden" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("owner_denied"));
    await new Promise((r) => setTimeout(r, 50));
    expect(railway).toHaveBeenCalledTimes(2);
  });

  it("a first Railway outage is backend_unavailable (not non-admin)", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue({ kind: "unavailable" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("backend_unavailable"));
  });

  it("a later Railway outage keeps an established owner workspace", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValueOnce(railwayOk()).mockResolvedValue({ kind: "unavailable" });
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    seen.length = 0;
    fireEvent.click(screen.getByTestId("recheck"));
    await waitFor(() => expect(railway).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(status()).toBe("authorized");
    expect(seen.every((s) => s === "authorized")).toBe(true); // never "checking"
  });

  it("a Supabase outage during a background recheck keeps the owner authorized", async () => {
    ownerState.mockResolvedValueOnce(AUTHORIZED_OWNER).mockResolvedValue({ ok: false });
    railway.mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    seen.length = 0;
    fireEvent.click(screen.getByTestId("recheck"));
    await waitFor(() => expect(ownerState).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(status()).toBe("authorized");
    expect(seen.every((s) => s === "authorized")).toBe(true);
  });

  it("an access-token refresh (same user) costs no check and never unmounts", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    const view = renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    seen.length = 0;
    authValue = { user: { id: OWNER, is_anonymous: false }, session: { access_token: "refreshed" }, loading: false };
    view.rerender(tree());
    await new Promise((r) => setTimeout(r, 30));
    expect(seen.every((s) => s === "authorized")).toBe(true);
    expect(ownerState).toHaveBeenCalledTimes(1);
    expect(railway).toHaveBeenCalledTimes(1);
  });

  it("does not loop: a stable authorized state issues exactly one check of each", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    await new Promise((r) => setTimeout(r, 60));
    expect(ownerState).toHaveBeenCalledTimes(1);
    expect(railway).toHaveBeenCalledTimes(1);
  });

  it("retry rechecks exactly once", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    fireEvent.click(screen.getByTestId("recheck"));
    await waitFor(() => expect(railway).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(railway).toHaveBeenCalledTimes(2);
  });

  it("an account switch drops the owner authorization immediately", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    const view = renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    let release!: (v: OwnerAuthStateResult) => void;
    ownerState.mockImplementation(() => new Promise((r) => { release = r; }));
    authValue = { user: { id: "someone-else" }, session: { access_token: "t2" }, loading: false };
    seen.length = 0;
    view.rerender(tree());
    await waitFor(() => expect(status()).toBe("loading"));
    expect(seen).not.toContain("authorized"); // never carried across accounts
    await act(async () => release(ok({ isOwner: false })));
    await waitFor(() => expect(status()).toBe("signed_in_non_admin"));
    expect(railway).toHaveBeenCalledTimes(1);
  });

  it("sign-out clears the authorization", async () => {
    ownerState.mockResolvedValue(AUTHORIZED_OWNER);
    railway.mockResolvedValue(railwayOk());
    const view = renderProvider();
    await waitFor(() => expect(status()).toBe("authorized"));
    authValue = { user: null, session: null, loading: false };
    view.rerender(tree());
    await waitFor(() => expect(status()).toBe("signed_out"));
  });
});
