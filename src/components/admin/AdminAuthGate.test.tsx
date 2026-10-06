import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuthContextValue, AdminAuthStatus } from "@/lib/admin-auth/types";

let ctx: AdminAuthContextValue;
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => ctx,
}));
const signOut = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signOut }) }));

import { AdminAuthGate } from "./AdminAuthGate";

const baseCtx = (status: AdminAuthStatus): AdminAuthContextValue => ({
  status,
  principal: null,
  isAuthorized: status === "authorized",
  recheck: vi.fn(),
  invalidate: vi.fn(),
});

const renderGate = () =>
  render(
    <MemoryRouter>
      <AdminAuthGate>
        <div data-testid="protected">SECRET ADMIN CONTENT</div>
      </AdminAuthGate>
    </MemoryRouter>,
  );

beforeEach(() => signOut.mockReset());
afterEach(cleanup);

describe("AdminAuthGate (OWN1)", () => {
  it("renders protected children only when authorized", () => {
    ctx = baseCtx("authorized");
    renderGate();
    expect(screen.getByTestId("protected")).toBeTruthy();
  });

  it("does NOT render protected children while checking", () => {
    ctx = baseCtx("checking");
    renderGate();
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(screen.getByLabelText("Checking admin access")).toBeTruthy();
  });

  it("signed_out offers sign-in and NO admin-key fallback", () => {
    ctx = baseCtx("signed_out");
    renderGate();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByTestId("admin-auth-open-fallback")).toBeNull();
    expect(document.body.textContent).not.toContain("X-Admin-Key");
  });

  it("signed_in_non_admin is distinct and has no key fallback", () => {
    ctx = baseCtx("signed_in_non_admin");
    renderGate();
    expect(document.body.textContent).toContain("isn't authorized");
    expect(screen.queryByTestId("admin-auth-open-fallback")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it("backend_unavailable offers retry", () => {
    ctx = baseCtx("backend_unavailable");
    renderGate();
    expect(screen.getByTestId("admin-auth-retry")).toBeTruthy();
  });

  it("malformed_response fails closed", () => {
    ctx = baseCtx("malformed_response");
    renderGate();
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(document.body.textContent).toContain("Unexpected response");
  });
});
