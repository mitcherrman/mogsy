/**
 * /admin/academy-updates — who may reach it.
 *
 * The page sits under the `/admin` layout route, whose `AdminRoute` gate
 * resolves membership through the server-side `has_role` RPC. This suite pins
 * the three things that matter about that:
 *
 *   1. a signed-out or ordinary user is refused;
 *   2. nothing from the page renders while the check is in flight, so there is
 *      no flash of admin content for someone who will be turned away;
 *   3. the router and the admin registry agree on where the page lives.
 *
 * None of this is the security boundary — RLS is, and it is asserted in
 * `src/test/security/whatsnew2AcademyUpdates.test.ts`. This gate exists so the
 * UI does not advertise a destination the viewer cannot use.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRoute from "@/components/AdminRoute";
import { ADMIN_TOOLS, ADMIN_AREAS } from "@/lib/admin/admin-registry";
import { ADMIN_ACADEMY_UPDATES_PATH } from "./AdminAcademyUpdates";

let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
let grantedRoles = new Set<string>();
let holdGate = false;

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (_name: string, args: { _role: string }) => {
      if (holdGate) await new Promise(() => {});
      return { data: grantedRoles.has(args._role), error: null };
    }),
  },
}));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={[ADMIN_ACADEMY_UPDATES_PATH]}>
      <Routes>
        <Route
          path={ADMIN_ACADEMY_UPDATES_PATH}
          element={
            <AdminRoute>
              <div data-testid="academy-updates-page">ACADEMY UPDATES ADMIN</div>
            </AdminRoute>
          }
        />
        <Route path="/" element={<div data-testid="home">home</div>} />
        <Route path="/auth" element={<div data-testid="auth">auth</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  grantedRoles = new Set();
  holdGate = false;
  authState = { user: { id: "user-1" }, loading: false };
  vi.clearAllMocks();
});

describe("the route gate", () => {
  it("refuses a signed-out visitor", async () => {
    authState = { user: null, loading: false };
    renderGuarded();
    await waitFor(() => expect(screen.queryByTestId("academy-updates-page")).toBeNull());
  });

  it("refuses a signed-in user who holds no admin role", async () => {
    grantedRoles = new Set();
    renderGuarded();
    await waitFor(() => expect(screen.queryByTestId("academy-updates-page")).toBeNull());
  });

  it("admits an admin", async () => {
    grantedRoles = new Set(["admin"]);
    renderGuarded();
    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-page")).toBeInTheDocument(),
    );
  });

  it("admits a master_admin", async () => {
    // Matching the RLS predicate, where has_role(…, 'admin') is already true
    // for master_admin — the owner cannot be locked out by holding the higher
    // role and not the lower one.
    grantedRoles = new Set(["master_admin"]);
    renderGuarded();
    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-page")).toBeInTheDocument(),
    );
  });

  it("renders nothing from the page while the role check is in flight", () => {
    holdGate = true;
    renderGuarded();
    expect(screen.queryByTestId("academy-updates-page")).toBeNull();
  });
});

describe("the router and the registry agree", () => {
  it("declares the route as a child of the /admin layout", () => {
    // Relative path, no per-page AdminRoute: the layout route carries the gate,
    // and re-adding one inside the shell is the pattern the reorganization
    // removed.
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toMatch(/<Route path="academy-updates" element=/);
    expect(app).not.toMatch(/path="academy-updates"[^\n]*<AdminRoute/);
  });

  it("is listed in the registry, in Studio, at the path the router declares", () => {
    const tool = ADMIN_TOOLS.find((t) => t.id === "academy-updates");
    expect(tool).toBeDefined();
    expect(tool!.path).toBe(ADMIN_ACADEMY_UPDATES_PATH);
    expect(tool!.area).toBe("studio");
  });

  it("has a section in Studio to be listed under", () => {
    const studio = ADMIN_AREAS.find((a) => a.id === "studio")!;
    expect(studio.sections.map((s) => s.id)).toContain("academy-updates");
  });

  it("is labelled as changing what visitors see", () => {
    // Publishing an announcement is a production mutation; the registry test
    // requires a warning for anything above `none`, and this states the real
    // consequence rather than a generic one.
    const tool = ADMIN_TOOLS.find((t) => t.id === "academy-updates")!;
    expect(tool.dangerLevel).toBe("mutates-production");
    expect(tool.warning).toMatch(/visitor/i);
  });
});
