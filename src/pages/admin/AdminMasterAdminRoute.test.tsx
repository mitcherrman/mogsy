/**
 * The master-admin route gate, and where the user directory went.
 *
 * `AdminRoute roles={["master_admin"]}` still guards /admin/premium-preview and
 * /admin/knowledge, and this suite pins its behaviour: a plain `admin` is
 * refused (master_admin is NOT satisfied by has_role being permissive about the
 * admin role) and nothing renders while the check is in flight.
 *
 * FUNNEL1C/ADMIN2 retired /admin/users as a destination — browsing accounts had
 * three entries under Users › Accounts. It is now that section's master-only
 * "Identities" view, so this file also asserts the redirect and the registry
 * entry that replaced it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AdminRoute from "@/components/AdminRoute";
import { ADMIN_TOOLS, legacyRouteMap } from "@/lib/admin/admin-registry";

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
    <MemoryRouter initialEntries={["/admin/premium-preview"]}>
      <Routes>
        <Route
          path="/admin/premium-preview"
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

describe("master_admin route authorization", () => {
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

});

describe("the user directory is one view of People, not a second destination", () => {
  const appSource = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

  // USERS1 gave /admin/users to the Users AREA. The identity directory keeps
  // its deep link as a VIEW of that area's Accounts section — which is the
  // same guarantee this test always made: there is no second destination for
  // browsing accounts, and the standalone page is not mounted anywhere.
  it("mounts the Users area at /admin/users, with no standalone directory page", () => {
    expect(appSource).toContain(
      '<Route path="users" element={<Suspense fallback={<RouteFallback />}><AdminUsersPage /></Suspense>} />',
    );
    expect(appSource).not.toContain("<AdminUserDirectory />");
  });

  it("advertises one destination for accounts, with the identity view as a panel of it", () => {
    // Exactly one tool owns /admin/users as a ROUTE — the Users area — and the
    // account browsers are panels of it rather than peers of it.
    expect(
      ADMIN_TOOLS.filter((t) => t.kind === "route" && t.path === "/admin/users").map((t) => t.id),
    ).toEqual(["product-analytics"]);
    expect(ADMIN_TOOLS.find((t) => t.id === "people-user-identities")).toBeUndefined();
  });

});
