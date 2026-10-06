// OWN1 — AdminRoute is owner-only and asks for MFA on an untrusted session.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let authState: { user: { id: string } | null; loading: boolean } = { user: { id: "u1" }, loading: false };
let rpcAnswer: unknown = null;
let rpcError: unknown = null;
const rpc = vi.fn(async (_name: string) => ({ data: rpcAnswer, error: rpcError }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (n: string) => rpc(n) } }));

import AdminRoute from "./AdminRoute";

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminRoute><div data-testid="admin">ADMIN</div></AdminRoute>} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  rpcAnswer = null;
  rpcError = null;
  authState = { user: { id: "u1" }, loading: false };
  rpc.mockClear();
});

describe("AdminRoute (OWN1 owner-only)", () => {
  it("renders for the owner on a trusted session", async () => {
    rpcAnswer = { is_owner: true, authorized: true, aal: "aal2" };
    renderAt();
    expect(await screen.findByTestId("admin")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("owner_auth_state");
  });

  it("redirects a non-owner (legacy admin/master_admin/moderator rows are irrelevant)", async () => {
    rpcAnswer = { is_owner: false, authorized: false };
    renderAt();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("admin")).toBeNull();
  });

  it("asks the owner for MFA at aal1 on an untrusted device", async () => {
    rpcAnswer = { is_owner: true, authorized: false, aal: "aal1", trusted_device: false };
    renderAt();
    expect(await screen.findByTestId("owner-step-up")).toBeTruthy();
    expect(screen.queryByTestId("admin")).toBeNull();
  });

  it("fails closed on an RPC error or malformed payload", async () => {
    rpcError = { message: "boom" };
    renderAt();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    cleanup();
    rpcError = null;
    rpcAnswer = true; // the legacy has_role shape is NOT accepted
    renderAt();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
  });

  it("redirects a signed-out visitor without calling the backend", async () => {
    authState = { user: null, loading: false };
    renderAt();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(rpc).not.toHaveBeenCalled();
  });
});
