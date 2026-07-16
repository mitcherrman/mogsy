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
  isAuthorized: status === "authorized" || status === "authorized_via_fallback",
  fallbackActive: status === "authorized_via_fallback",
  recheck: vi.fn(),
  applyFallbackKey: vi.fn(),
  clearFallback: vi.fn(),
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

beforeEach(() => {
  signOut.mockReset();
});
afterEach(cleanup);

describe("AdminAuthGate", () => {
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

  it("signed_out shows a sign-in action, not a raw key form as primary", () => {
    ctx = baseCtx("signed_out");
    renderGate();
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
    // Fallback is a secondary, non-prefilled action — not the primary form.
    expect(screen.getByTestId("admin-auth-open-fallback")).toBeTruthy();
    expect(screen.queryByTestId("admin-auth-fallback-input")).toBeNull();
  });

  it("signed_in_non_admin is distinct (no key-was-wrong / password-wrong implication)", () => {
    ctx = baseCtx("signed_in_non_admin");
    renderGate();
    const text = document.body.textContent ?? "";
    expect(text).toContain("isn't authorized");
    expect(text.toLowerCase()).not.toContain("incorrect password");
    expect(screen.queryByTestId("protected")).toBeNull();
  });

  it("backend_unavailable is distinct from non-admin and offers retry", () => {
    ctx = baseCtx("backend_unavailable");
    renderGate();
    expect(document.body.textContent).toContain("backend unavailable");
    expect(screen.getByTestId("admin-auth-retry")).toBeTruthy();
  });

  it("malformed_response fails closed with a retry", () => {
    ctx = baseCtx("malformed_response");
    renderGate();
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(document.body.textContent).toContain("Unexpected response");
  });

  it("fallback dialog uses a password-masked, non-prefilled input", () => {
    ctx = baseCtx("signed_out");
    renderGate();
    fireEvent.click(screen.getByTestId("admin-auth-open-fallback"));
    const input = screen.getByTestId("admin-auth-fallback-input") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("");
  });

  it("submitting the fallback key calls applyFallbackKey and never renders the key", () => {
    ctx = baseCtx("signed_out");
    renderGate();
    fireEvent.click(screen.getByTestId("admin-auth-open-fallback"));
    fireEvent.change(screen.getByTestId("admin-auth-fallback-input"), {
      target: { value: "super-secret-key" },
    });
    fireEvent.click(screen.getByTestId("admin-auth-fallback-submit"));
    expect(ctx.applyFallbackKey).toHaveBeenCalledWith("super-secret-key");
    // The key must not be left rendered anywhere in the DOM.
    expect(document.body.textContent).not.toContain("super-secret-key");
  });

  it("authorized_via_fallback shows a banner + clear, but never the key", () => {
    ctx = baseCtx("authorized_via_fallback");
    renderGate();
    expect(screen.getByTestId("protected")).toBeTruthy();
    expect(screen.getByTestId("admin-auth-fallback-banner")).toBeTruthy();
    fireEvent.click(screen.getByTestId("admin-auth-clear-fallback"));
    expect(ctx.clearFallback).toHaveBeenCalled();
  });

  it("signed_in_non_admin offers sign-out", () => {
    ctx = baseCtx("signed_in_non_admin");
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
