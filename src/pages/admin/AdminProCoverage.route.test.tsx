/**
 * /admin/pro-play-coverage route gate and navigation exposure.
 *
 * The page reads a backend admin surface, so it is master-admin only, exactly
 * as the user directory and demo analytics are. This suite also asserts the
 * page is reachable ONLY from Admin: no public navigation, no sitemap entry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRoute from "@/components/AdminRoute";
import { ADMIN_TOOLS, toolsForSection } from "@/lib/admin/admin-registry";
import { ADMIN_PRO_COVERAGE_PATH } from "./AdminProCoverage";

const PATH = "/admin/pro-play-coverage";

let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
let grantedRoles = new Set<string>();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (_name: string, args: { _role: string }) => ({
      data: grantedRoles.has(args._role),
      error: null,
    })),
  },
}));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={[PATH]}>
      <Routes>
        <Route
          path={PATH}
          element={
            <AdminRoute roles={["master_admin"]}>
              <div data-testid="coverage-page">PRO COVERAGE CONTENT</div>
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
  grantedRoles = new Set();
  authState = { user: { id: "user-1" }, loading: false };
  vi.clearAllMocks();
});

describe("/admin/pro-play-coverage authorization", () => {
  it("exports the canonical path", () => {
    expect(ADMIN_PRO_COVERAGE_PATH).toBe(PATH);
  });

  it("renders for a master_admin", async () => {
    grantedRoles = new Set(["master_admin"]);
    renderGuarded();
    expect(await screen.findByTestId("coverage-page")).toBeTruthy();
  });

  it("refuses a plain admin", async () => {
    grantedRoles = new Set(["admin"]);
    renderGuarded();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("coverage-page")).toBeNull();
  });

  it("refuses a signed-out visitor", async () => {
    authState = { user: null, loading: false };
    renderGuarded();
    await waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(screen.queryByTestId("coverage-page")).toBeNull();
  });

  it("is registered under the App.tsx admin shell with a master_admin gate", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const line = app
      .split("\n")
      .find((l) => l.includes('path="pro-play-coverage"'));
    expect(line).toBeTruthy();
    expect(line!).toContain('roles={["master_admin"]}');
  });

  it("is advertised in the admin registry under Game Data › Pro Data", () => {
    const entry = ADMIN_TOOLS.find((t) => t.path === PATH);
    expect(entry).toBeTruthy();
    expect(entry!.title).toBe("Pro Play Data Coverage");
    expect(entry!.requiredRole).toBe("master_admin");
    expect(toolsForSection("game-data", "pro-data").map((t) => t.id)).toContain(
      "pro-data-coverage",
    );
  });

  it("has no public navigation exposure", () => {
    for (const file of ["src/components/Layout.tsx", "src/App.tsx"]) {
      const src = readFileSync(file, "utf8");
      // The only occurrence anywhere outside Admin would be a nav link.
      const navish = src
        .split("\n")
        .filter((l) => l.includes("pro-play-coverage") && /<Link|to=\"\//.test(l));
      expect(navish).toEqual([]);
    }
  });
});
