/**
 * /admin/users route gate.
 *
 * The directory is master-admin only. AdminRoute resolves that through the
 * server-side `has_role` RPC, so this suite asserts three things:
 *   1. a plain `admin` is refused — master_admin is NOT satisfied by has_role
 *      being permissive about the admin role;
 *   2. nothing from the page renders while the check is in flight (no flash);
 *   3. the registry entry advertises the same requirement the router enforces.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRoute from "@/components/AdminRoute";
import { ADMIN_DIRECTORY_ITEMS } from "@/lib/admin/admin-directory";

let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
/** Roles the mocked has_role RPC will answer true for. */
let grantedRoles = new Set<string>();
let resolveGate: (() => void) | null = null;

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (_name: string, args: { _role: string }) => {
      if (resolveGate) await new Promise<void>((r) => (resolveGate = r));
      return { data: grantedRoles.has(args._role), error: null };
    }),
  },
}));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route
          path="/admin/users"
          element={
            <AdminRoute roles={["master_admin"]}>
              <div data-testid="users-page">USER DIRECTORY CONTENT</div>
            </AdminRoute>
          }
        />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  resolveGate = null;
  grantedRoles = new Set();
  authState = { user: { id: "user-1" }, loading: false };
  vi.clearAllMocks();
});

describe("/admin/users authorization", () => {
  it("renders for a master_admin", async () => {
    grantedRoles = new Set(["master_admin"]);
    renderGuarded();
    expect(await screen.findByTestId("users-page")).toBeTruthy();
  });

  it("refuses a plain admin", async () => {
    grantedRoles = new Set(["admin"]);
    renderGuarded();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("users-page")).toBeNull();
  });

  it("refuses a signed-out visitor", async () => {
    authState = { user: null, loading: false };
    renderGuarded();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("users-page")).toBeNull();
  });

  it("renders no page content while the role check is in flight", async () => {
    grantedRoles = new Set(["master_admin"]);
    resolveGate = () => {};
    const { container } = renderGuarded();
    // The check is held open: neither the page nor the redirect target exists.
    expect(screen.queryByTestId("users-page")).toBeNull();
    expect(screen.queryByTestId("home")).toBeNull();
    expect(container.textContent).not.toContain("USER DIRECTORY CONTENT");
  });

  it("is advertised in the admin directory registry as master_admin only", () => {
    const entry = ADMIN_DIRECTORY_ITEMS.find((i) => i.path === "/admin/users");
    expect(entry).toBeTruthy();
    expect(entry!.requiredRole).toBe("master_admin");
    expect(entry!.dangerLevel).not.toBe("none");
    expect(entry!.warning).toBeTruthy();
  });
});
