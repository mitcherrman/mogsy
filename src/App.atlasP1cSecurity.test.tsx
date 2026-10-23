/**
 * ATL-P1-C-002 — the Atlas prototype is reachable by the owner only.
 *
 * `App.atlasP1cRoute.test.ts` reads the route table as text. That proves what
 * App.tsx says, not what it does, so this file exercises the REAL route
 * objects from `appRouter`:
 *
 *   1. Ancestry: `/admin/atlas-p1c` matches through the `/admin` route whose
 *      element is the real `<AdminRoute>`, so the child cannot render without
 *      passing the owner check (route-level proof).
 *   2. Rendering: with the real `/admin` route object mounted in a memory
 *      router, a signed-out visitor, a non-owner and an owner at aal1 on an
 *      untrusted device never mount the page module; only an authorized owner
 *      does (content-level proof). The owner check is the same mocked RPC the
 *      AdminRoute suites use; nothing here talks to a backend.
 *   3. Production build: with `import.meta.env.DEV` stubbed to the literal
 *      `false` a production bundle sees, a fresh App module registers no
 *      `/lol/dev/atlas-p1c` route at all (the path falls through to `*`),
 *      while `/admin/atlas-p1c` still exists behind its gate.
 *   4. Exposure: nothing links to, prefetches, or sitemaps the prototype.
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
vi.mock("./pages/dev/atlas-p1c/AtlasP1CPage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./pages/dev/atlas-p1c/AtlasP1CPage")>();
  return {
    default: function SpiedAtlasPage(props: ComponentProps<typeof mod.default>) {
      pageMounts();
      return createElement(mod.default, props);
    },
  };
});

import AdminRoute from "./components/AdminRoute";
import { appRouter } from "./App";

// The data router builds a Request for every navigation (the AdminRoute
// redirect included) and Node's undici rejects jsdom's AbortSignal. Same shim
// as App.dataRouter.test.tsx.
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

const ADMIN_PATH = "/admin/atlas-p1c";
const DEV_PATH = "/lol/dev/atlas-p1c";

function findRoute(routes: RouteObject[], path: string): RouteObject | undefined {
  for (const route of routes) {
    if (route.path === path) return route;
    const nested = route.children && findRoute(route.children, path);
    if (nested) return nested;
  }
  return undefined;
}

function lastMatchedPath(routes: RouteObject[], url: string): string | undefined {
  return matchRoutes(routes, url)?.at(-1)?.route.path;
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

describe("ATL-P1-C route ancestry (real route objects)", () => {
  it("/admin/atlas-p1c resolves only through the AdminRoute-wrapped /admin parent", () => {
    const matches = matchRoutes(appRouter.routes, ADMIN_PATH);
    expect(matches).not.toBeNull();
    const chain = matches!.map((m) => m.route.path);
    expect(chain).toContain("/admin");
    expect(chain.at(-1)).toBe("atlas-p1c");
    const admin = matches!.find((m) => m.route.path === "/admin")!.route as RouteObject;
    const element = admin.element as ReactElement;
    expect(element.type).toBe(AdminRoute);
    // Nothing between the gate and the page: the child is a direct child of /admin.
    expect(chain.indexOf("/admin")).toBe(chain.length - 2);
  });

  it("the development twin exists in this (DEV) test build", () => {
    expect(lastMatchedPath(appRouter.routes, DEV_PATH)).toBe(DEV_PATH);
  });
});

describe("ATL-P1-C rendered-content gate", () => {
  const adminRoute = findRoute(appRouter.routes, "/admin")!;

  function mountAdminAt(path: string) {
    const router = createMemoryRouter(
      [adminRoute, { path: "/", element: <div data-testid="home">home</div> }],
      { initialEntries: [path] },
    );
    return render(<RouterProvider router={router} />);
  }

  it("redirects a signed-out visitor without mounting the page or calling the backend", async () => {
    authState = { user: null, loading: false };
    mountAdminAt(ADMIN_PATH);
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(pageMounts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("atlas-root")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("redirects a signed-in non-owner without mounting the page", async () => {
    authState = { user: { id: "u-visitor" }, loading: false };
    rpcAnswer = { is_owner: false, authorized: false };
    mountAdminAt(ADMIN_PATH);
    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("owner_auth_state");
    expect(pageMounts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("atlas-root")).toBeNull();
  });

  it("holds the owner at the MFA step-up on an untrusted device, page unmounted", async () => {
    authState = { user: { id: "u-owner" }, loading: false };
    rpcAnswer = { is_owner: true, authorized: false, aal: "aal1", trusted_device: false };
    mountAdminAt(ADMIN_PATH);
    expect(await screen.findByTestId("owner-step-up")).toBeInTheDocument();
    expect(pageMounts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("atlas-root")).toBeNull();
  });

  it("mounts the prototype for an authorized owner, still marked DEMO DATA", async () => {
    authState = { user: { id: "u-owner" }, loading: false };
    rpcAnswer = { is_owner: true, authorized: true, aal: "aal2" };
    mountAdminAt(ADMIN_PATH);
    expect(await screen.findByTestId("atlas-root", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(pageMounts).toHaveBeenCalled();
    expect(screen.getAllByText("DEMO DATA").length).toBeGreaterThan(0);
  }, 10000);
});

describe("ATL-P1-C production build (DEV = false)", () => {
  it("registers no /lol/dev twin and keeps the admin child behind the gate", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const prod = await import("./App");
    const routes = prod.appRouter.routes;
    expect(findRoute(routes, DEV_PATH)).toBeUndefined();
    expect(lastMatchedPath(routes, DEV_PATH)).toBe("*");
    const matches = matchRoutes(routes, ADMIN_PATH);
    expect(matches?.at(-1)?.route.path).toBe("atlas-p1c");
    expect(matches?.some((m) => m.route.path === "/admin")).toBe(true);
    vi.resetModules();
  });
});

describe("ATL-P1-C public exposure", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

  it("is linked from no navigation, hub, prefetch table or sitemap", () => {
    for (const file of [
      "src/components/hud/GlobalHud.tsx",
      "src/components/Footer.tsx",
      "src/pages/LolHub.tsx",
      "src/lib/route-prefetch.ts",
      "src/lib/admin/admin-registry.ts",
      "scripts/generate-sitemap.ts",
    ]) {
      expect(read(file), `${file} must not reference the Atlas prototype`).not.toMatch(/atlas-p1c/);
    }
  });

  it("robots already disallows the admin tree the preview lives under", () => {
    expect(read("public/robots.txt")).toMatch(/^Disallow: \/admin\/?$/m);
  });
});
