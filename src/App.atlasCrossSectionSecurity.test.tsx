/**
 * ATL-CS-UX-001 — the cross-section table is owner-only, proven on the real
 * route objects (same method as App.atlasP1cSecurity.test.tsx):
 *
 *   1. `/admin/atlas-cross-section` resolves only through the `/admin` route
 *      whose element is the real `<AdminRoute>`.
 *   2. Rendering the real `/admin` route object: signed-out, non-owner and
 *      owner-at-aal1 never mount the page module; an authorized owner does.
 *   3. With DEV stubbed false, a fresh App registers no `/lol/dev` twin.
 *   4. Nothing links, prefetches or sitemaps the prototype; the baseline
 *      `/admin/atlas-p1c` route is untouched.
 */
import { createElement, type ComponentProps, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider, type RouteObject } from "react-router-dom";

let authState: { user: { id: string; is_anonymous?: boolean } | null; loading: boolean } = { user: null, loading: false };
let rpcAnswer: unknown = null;
const rpc = vi.fn(async (_name: string) => ({ data: rpcAnswer, error: null }));
const pageMounts = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (n: string) => rpc(n) } }));
vi.mock("./pages/dev/atlas-cross-section/AtlasCrossSectionPage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./pages/dev/atlas-cross-section/AtlasCrossSectionPage")>();
  return {
    default: function SpiedPage(props: ComponentProps<typeof mod.default>) {
      pageMounts();
      return createElement(mod.default, props);
    },
  };
});

import AdminRoute from "./components/AdminRoute";
import { appRouter } from "./App";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}
beforeAll(() => {
  globalThis.Request = RouterTestRequest as unknown as typeof Request;
});
afterAll(() => {
  globalThis.Request = NativeRequest;
});

const ADMIN_PATH = "/admin/atlas-cross-section";
const DEV_PATH = "/lol/dev/atlas-cross-section";

function findRoute(routes: RouteObject[], path: string): RouteObject | undefined {
  for (const route of routes) {
    if (route.path === path) return route;
    const nested = route.children && findRoute(route.children, path);
    if (nested) return nested;
  }
  return undefined;
}

beforeEach(() => {
  authState = { user: null, loading: false };
  rpcAnswer = null;
  rpc.mockClear();
  pageMounts.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("ATL-CS route ancestry", () => {
  it("/admin/atlas-cross-section resolves only through the AdminRoute-wrapped /admin parent", () => {
    const matches = matchRoutes(appRouter.routes, ADMIN_PATH);
    expect(matches).not.toBeNull();
    const chain = matches!.map((m) => m.route.path);
    expect(chain.at(-1)).toBe("atlas-cross-section");
    expect(chain.indexOf("/admin")).toBe(chain.length - 2);
    const admin = matches!.find((m) => m.route.path === "/admin")!.route as RouteObject;
    expect((admin.element as ReactElement).type).toBe(AdminRoute);
  });

  it("keeps the baseline /admin/atlas-p1c child alongside, under the same gate", () => {
    const chain = matchRoutes(appRouter.routes, "/admin/atlas-p1c")!.map((m) => m.route.path);
    expect(chain).toContain("/admin");
    expect(chain.at(-1)).toBe("atlas-p1c");
  });

  it("registers the dev twin in this DEV test build", () => {
    expect(matchRoutes(appRouter.routes, DEV_PATH)?.at(-1)?.route.path).toBe(DEV_PATH);
  });
});

describe("ATL-CS rendered-content gate", () => {
  const adminRoute = findRoute(appRouter.routes, "/admin")!;
  const mountAdminAt = (path: string) =>
    render(<RouterProvider router={createMemoryRouter([adminRoute, { path: "/", element: <div data-testid="home">home</div> }], { initialEntries: [path] })} />);

  it("redirects a signed-out visitor without mounting the page or calling the backend", async () => {
    mountAdminAt(ADMIN_PATH);
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(pageMounts).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("redirects a signed-in non-owner without mounting the page", async () => {
    authState = { user: { id: "u-visitor" }, loading: false };
    rpcAnswer = { is_owner: false, authorized: false };
    mountAdminAt(ADMIN_PATH);
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("owner_auth_state");
    expect(pageMounts).not.toHaveBeenCalled();
  });

  it("holds the owner at MFA step-up on an untrusted device, page unmounted", async () => {
    authState = { user: { id: "u-owner" }, loading: false };
    rpcAnswer = { is_owner: true, authorized: false, aal: "aal1", trusted_device: false };
    mountAdminAt(ADMIN_PATH);
    expect(await screen.findByTestId("owner-step-up")).toBeInTheDocument();
    expect(pageMounts).not.toHaveBeenCalled();
  });

  it("mounts the table for an authorized owner, marked DEMO DATA", async () => {
    authState = { user: { id: "u-owner" }, loading: false };
    rpcAnswer = { is_owner: true, authorized: true, aal: "aal2" };
    mountAdminAt(ADMIN_PATH);
    expect(await screen.findByTestId("acs-root", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(pageMounts).toHaveBeenCalled();
    expect(screen.getAllByText("DEMO DATA").length).toBeGreaterThan(0);
  }, 10000);
});

describe("ATL-CS production build (DEV = false)", () => {
  it("registers no /lol/dev twin and keeps the admin child behind the gate", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const prod = await import("./App");
    const routes = prod.appRouter.routes;
    expect(findRoute(routes, DEV_PATH)).toBeUndefined();
    expect(matchRoutes(routes, DEV_PATH)?.at(-1)?.route.path).toBe("*");
    const matches = matchRoutes(routes, ADMIN_PATH);
    expect(matches?.at(-1)?.route.path).toBe("atlas-cross-section");
    expect(matches?.some((m) => m.route.path === "/admin")).toBe(true);
    vi.resetModules();
  });
});

describe("ATL-CS public exposure", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

  it("is linked from no navigation, hub, prefetch table, admin registry or sitemap", () => {
    for (const file of ["src/components/hud/GlobalHud.tsx", "src/components/Footer.tsx", "src/pages/LolHub.tsx", "src/lib/route-prefetch.ts", "src/lib/admin/admin-registry.ts", "scripts/generate-sitemap.ts"]) {
      expect(read(file), `${file} must not reference the cross-section prototype`).not.toMatch(/atlas-cross-section/);
    }
  });

  it("lazy-loads the page exactly once from App.tsx", () => {
    const app = read("src/App.tsx");
    expect(app.match(/import\("\.\/pages\/dev\/atlas-cross-section\/AtlasCrossSectionPage"\)/g) ?? []).toHaveLength(1);
    expect(app).toMatch(/const AtlasCrossSectionDev = import\.meta\.env\.DEV \? AtlasCrossSectionAdmin : null;/);
  });
});
