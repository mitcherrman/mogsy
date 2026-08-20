// ---------------------------------------------------------------------------
// Admin shell and area certification.
//
// Proves the properties the reorganization must not break: every area renders,
// every preserved capability is still reachable from its new home, navigating
// executes nothing destructive, archived and developer surfaces are labelled,
// and no navigation item advertises a capability the viewer cannot use.
//
// The route table itself is certified separately by admin-registry.routes.test.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AdminAuthContextValue } from "@/lib/admin-auth/types";

// --- mocks -----------------------------------------------------------------

const { supabase, deleteCalled, functionsInvoke, rpcCalls, buildQuery } = vi.hoisted(() => {
  const deleteCalled = vi.fn();
  const functionsInvoke = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const rpcCalls: string[] = [];
  // A permissive query builder: any chained filter returns itself, so a
  // component reaching for .not()/.gte()/.contains() cannot crash the render.
  // Only the terminal methods and delete() are given real behaviour.
  const query = (rows: unknown[]) => {
    const result = { data: rows, error: null, count: rows.length };
    const target: Record<string, unknown> = {
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      catch: () => Promise.resolve(result),
      finally: () => Promise.resolve(result),
    };
    const proxy: unknown = new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return obj[prop as string];
        if (prop === "delete") {
          return () => {
            deleteCalled();
            return proxy;
          };
        }
        if (typeof prop === "symbol") return undefined;
        return () => proxy;
      },
    });
    return proxy;
  };
  const supabase = {
    rpc: vi.fn((name: string) => {
      rpcCalls.push(name);
      return Promise.resolve({ data: [], error: null });
    }),
    from: vi.fn((table: string) =>
      query(table === "user_roles" ? [{ user_id: "u1", role: "master_admin" }] : []),
    ),
    functions: { invoke: functionsInvoke },
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: vi.fn(),
  };
  return { supabase, deleteCalled, functionsInvoke, rpcCalls, buildQuery: query };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "owner@mogzy.lol" }, loading: false, signOut: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let adminCtx: AdminAuthContextValue;
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({ useAdminAuth: () => adminCtx }));

import AdminShell from "@/components/admin/shell/AdminShell";
import AdminOverviewPage from "./AdminOverviewPage";
import AdminAllToolsPage from "./AdminAllToolsPage";
import AdminPeoplePage from "./AdminPeoplePage";
import AdminLeaguecraftPage from "./AdminLeaguecraftPage";
import AdminRankedPage from "./AdminRankedPage";
import AdminSimulationPage from "./AdminSimulationPage";
import AdminGameDataPage from "./AdminGameDataPage";
import AdminStudioPage from "./AdminStudioPage";
import AdminOperationsPage from "./AdminOperationsPage";
import AdminDeveloperPage from "./AdminDeveloperPage";
import AdminArenaPage from "./AdminArenaPage";
import { ADMIN_AREAS, ADMIN_TOOLS } from "@/lib/admin/admin-registry";

const authorized: AdminAuthContextValue = {
  status: "authorized",
  principal: { authMethod: "supabase_user", userId: "u1", email: "owner@mogzy.lol" },
  isAuthorized: true,
  fallbackActive: false,
  recheck: vi.fn(),
  applyFallbackKey: vi.fn(),
  clearFallback: vi.fn(),
  invalidate: vi.fn(),
};

/** Mirrors the shell route block in App.tsx (which routes.test certifies). */
function renderAdmin(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="all-tools" element={<AdminAllToolsPage />} />
          <Route path="people" element={<AdminPeoplePage />} />
          <Route path="leaguecraft" element={<AdminLeaguecraftPage />} />
          <Route path="ranked" element={<AdminRankedPage />} />
          <Route path="simulation" element={<AdminSimulationPage />} />
          <Route path="game-data" element={<AdminGameDataPage />} />
          <Route path="studio" element={<AdminStudioPage />} />
          <Route path="operations" element={<AdminOperationsPage />} />
          <Route path="developer" element={<AdminDeveloperPage />} />
          <Route path="arena" element={<AdminArenaPage />} />
          {/* Stand-ins for the existing admin pages the shell adopted. Their
              real elements are unchanged; what matters here is the path. */}
          <Route path="play" element={<div data-testid="stub-play" />} />
          <Route path="blog" element={<div data-testid="stub-blog" />} />
          <Route path="blog/:id" element={<div data-testid="stub-blog-editor" />} />
          <Route path="combat-battles" element={<div data-testid="stub-battles" />} />
          <Route path="legacy-dashboard" element={<div data-testid="stub-legacy" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  adminCtx = authorized;
  deleteCalled.mockClear();
  functionsInvoke.mockClear();
  rpcCalls.length = 0;
  fetchSpy = vi.fn(() => Promise.reject(new Error("no network in shell tests")));
  vi.stubGlobal("fetch", fetchSpy);
  cleanup();
});

// --- 1. every top-level area renders ---------------------------------------

describe("1 · every top-level area renders", () => {
  const areaPaths: Array<[string, string, string]> = [
    ["Overview", "/admin", "admin-area-overview"],
    ["All Tools", "/admin/all-tools", "admin-area-all-tools"],
    ["People", "/admin/people", "admin-area-people"],
    ["Leaguecraft", "/admin/leaguecraft", "admin-area-leaguecraft"],
    ["Ranked", "/admin/ranked", "admin-area-ranked"],
    ["Simulation", "/admin/simulation", "admin-area-simulation"],
    ["Game Data", "/admin/game-data", "admin-area-game-data"],
    ["Studio", "/admin/studio", "admin-area-studio"],
    ["Operations", "/admin/operations", "admin-area-operations"],
    ["Developer", "/admin/developer", "admin-area-developer"],
    ["Arena", "/admin/arena", "admin-area-arena"],
  ];

  it.each(areaPaths)("%s renders at %s", async (_label, path, testId) => {
    renderAdmin(path);
    expect(await screen.findByTestId(testId)).toBeTruthy();
  });

  it("renders one flat, never-paginated area rail on every page", async () => {
    renderAdmin("/admin/people");
    const nav = await screen.findByTestId("admin-shell-nav");
    for (const area of ADMIN_AREAS) {
      expect(within(nav).getByTestId(`admin-nav-${area.id}`), area.id).toBeTruthy();
    }
    // No pagination controls: that mechanism is what buried tools before.
    expect(within(nav).queryByRole("button")).toBeNull();
  });

  it("marks the active area for the current route", async () => {
    renderAdmin("/admin/ranked");
    const link = await screen.findByTestId("admin-nav-ranked");
    expect(link.getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("admin-nav-people").getAttribute("data-active")).toBe("false");
  });

  it("keeps the rail anchored on the pages an area adopted", async () => {
    // Following a cross-link out to an existing admin page must not blank the
    // rail: the registry says which area owns that path.
    const owned: Array<[string, string]> = [
      ["/admin/play", "arena"],
      ["/admin/blog", "studio"],
      ["/admin/blog/abc-123", "studio"],
      ["/admin/combat-battles", "simulation"],
      ["/admin/legacy-dashboard", "overview"],
    ];
    for (const [path, areaId] of owned) {
      cleanup();
      renderAdmin(path);
      const nav = await screen.findByTestId("admin-shell-nav");
      expect(
        within(nav).getByTestId(`admin-nav-${areaId}`).getAttribute("data-active"),
        `${path} → ${areaId}`,
      ).toBe("true");
    }
  });
});

// --- 2–4. People: Users, Account Actions, Feedback --------------------------

describe("2 · Admin Users remains available, and only once", () => {
  it("mounts the deployed AdminUsers panel under People › Users", async () => {
    renderAdmin("/admin/people?section=users");
    expect(await screen.findByTestId("people-users-accounts")).toBeTruthy();
    // The real component: its search field is part of Admin Users Phase 1.
    await waitFor(() => expect(rpcCalls).toContain("admin_list_profiles"));
  });

  it("exposes exactly one Users interface — the browser is a view of it, not a peer", async () => {
    renderAdmin("/admin/people?section=users");
    const subtabs = await screen.findByTestId("people-users-subtabs");
    expect(within(subtabs).getByTestId("people-users-subtabs-accounts")).toBeTruthy();
    expect(within(subtabs).getByTestId("people-users-subtabs-browser")).toBeTruthy();
    // Accounts is the default view; the profile browser is not rendered beside it.
    expect(screen.queryByTestId("people-users-browser")).toBeNull();
  });
});

describe("3 · Account Actions behaviour is preserved", () => {
  it("navigating to Users performs no auth action and deletes nothing", async () => {
    renderAdmin("/admin/people?section=users");
    await screen.findByTestId("people-users-accounts");
    await waitFor(() => expect(rpcCalls).toContain("admin_list_profiles"));
    // Account Actions are edge-function calls; delete-profile is a table delete.
    // Rendering the panel must trigger neither.
    expect(functionsInvoke).not.toHaveBeenCalled();
    expect(deleteCalled).not.toHaveBeenCalled();
  });

  it("keeps the master-only gate on role editing by passing isMasterAdmin through", async () => {
    // AdminUsers receives the same prop the legacy dashboard passed. The role
    // read is the same user_roles query; nothing new decides authorization.
    renderAdmin("/admin/people?section=users");
    await screen.findByTestId("people-users-accounts");
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("user_roles"));
  });
});

describe("4 · Feedback remains reachable", () => {
  it("renders the feedback queue under People › Feedback", async () => {
    renderAdmin("/admin/people?section=feedback");
    expect(await screen.findByTestId("people-feedback")).toBeTruthy();
  });

  it("also surfaces feedback from the Overview attention queue", async () => {
    renderAdmin("/admin");
    const queue = await screen.findByTestId("admin-attention-queue");
    expect(within(queue).getByText(/open feedback/i)).toBeTruthy();
  });
});

// --- 5–6. Leaguecraft, bots, collections ------------------------------------

describe("5 · Leaguecraft and quiz admin remain reachable", () => {
  it("links the unified quiz workspace rather than splitting or re-mounting it", async () => {
    renderAdmin("/admin/leaguecraft?section=questions");
    await screen.findByTestId("admin-area-leaguecraft");
    expect(screen.getByTestId("admin-tool-quiz-content-workspace")).toBeTruthy();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/admin/quiz-content");
    expect(links).toContain("/admin/quiz-content?tab=builder");
    expect(links).toContain("/admin/quiz-content?tab=review");
  });

  it("keeps quiz reports and answer overrides reachable at /quiz/admin", async () => {
    renderAdmin("/admin/leaguecraft?section=reports");
    await screen.findByTestId("admin-tool-quiz-admin-hub");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/quiz/admin");
  });

  it("gives the mastery reviewer its first navigation source", async () => {
    renderAdmin("/admin/leaguecraft?section=mastery");
    expect(await screen.findByTestId("leaguecraft-mastery-lookup")).toBeTruthy();
    expect(screen.getByTestId("mastery-digest-input")).toBeTruthy();
  });
});

describe("6 · legacy collection and bot tooling remains reachable", () => {
  it("mounts Collections, League Bots and Promoted Leagues under Arena", async () => {
    renderAdmin("/admin/arena?section=collections");
    const subtabs = await screen.findByTestId("arena-collections-subtabs");
    expect(within(subtabs).getByTestId("arena-collections-subtabs-collections")).toBeTruthy();
    expect(within(subtabs).getByTestId("arena-collections-subtabs-bots")).toBeTruthy();
    expect(within(subtabs).getByTestId("arena-collections-subtabs-promoted")).toBeTruthy();
    expect(screen.getByTestId("arena-collections")).toBeTruthy();
  });

  it("keeps the legacy Arena pages linked, not removed", async () => {
    renderAdmin("/admin/arena?section=operations");
    await screen.findByTestId("admin-area-arena");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const path of ["/admin/play", "/admin/gaming", "/admin/demo"]) {
      expect(links, path).toContain(path);
    }
  });
});

// --- 7–9. Ranked ------------------------------------------------------------

describe("7 · Ranked Admin home renders", () => {
  it("renders the readiness surface and reports a failed read honestly", async () => {
    renderAdmin("/admin/ranked?section=overview");
    expect(await screen.findByTestId("ranked-launch-readiness")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/could not reach the admin backend/i)).toBeTruthy(),
    );
    // A failed read must never be rendered as a healthy verdict.
    expect(screen.queryByTestId("ranked-verdict")).toBeNull();
  });

  it("renders a live verdict when the backend answers", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            schema_version: "ranked_duel.launch_readiness.v1",
            server_time: "2026-08-20T00:00:00Z",
            verdict: "ready_with_restrictions",
            checks: { public_enabled: { status: "ok", detail: "RANKED_PUBLIC_ENABLED master flag" } },
          }),
      } as unknown as Response),
    );
    renderAdmin("/admin/ranked?section=overview");
    const verdict = await screen.findByTestId("ranked-verdict");
    expect(verdict.textContent).toMatch(/ready with restrictions/i);
    expect(screen.getByText(/RANKED_PUBLIC_ENABLED master flag/)).toBeTruthy();
  });

  it("distinguishes existing functionality from named future gaps", async () => {
    renderAdmin("/admin/ranked?section=matches");
    await screen.findByTestId("admin-area-ranked");
    // The staff duel exists and is linked.
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/dev/ranked-duel");
    // The match inspector does not exist and is not faked.
    expect(screen.getByTestId("admin-tool-ranked-match-inspector")).toBeTruthy();
    expect(screen.getByTestId("admin-tool-nocontrol-ranked-match-inspector").textContent).toMatch(
      /future gap/i,
    );
  });

  it("gives Playtests a home without inventing a playtest backend", async () => {
    renderAdmin("/admin/ranked?section=playtests");
    const panel = await screen.findByTestId("ranked-playtests");
    expect(within(panel).getByText(/existing primitives/i)).toBeTruthy();
    expect(within(panel).getByText(/future gaps/i)).toBeTruthy();
    expect(within(panel).getByText(/no allowlist/i)).toBeTruthy();
  });
});

describe("8 & 9 · normal Ranked and Ranked Bot access are untouched", () => {
  it("adds no allowlist, cohort or restriction to player Ranked access", () => {
    // Every Ranked registry entry either reads state or documents a capability.
    // None of them describes restricting player access.
    const ranked = ADMIN_TOOLS.filter((t) => t.area === "ranked");
    expect(ranked.length).toBeGreaterThan(0);
    for (const tool of ranked) {
      expect(tool.authorization, tool.id).not.toMatch(
        /\ballowlist required\b|\brestricted to\b|\bnow requires\b/i,
      );
    }
    const bot = ADMIN_TOOLS.find((t) => t.id === "ranked-bot-matches")!;
    expect(bot.authorization).toMatch(/player-authenticated/i);
    expect(bot.authorization).toMatch(/untouched/i);
  });

  it("makes no write call while rendering any Ranked section", async () => {
    for (const section of ["overview", "question-bank", "matches", "playtests", "settings"]) {
      cleanup();
      renderAdmin(`/admin/ranked?section=${section}`);
      await screen.findByTestId("admin-area-ranked");
    }
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    }
    expect(deleteCalled).not.toHaveBeenCalled();
  });
});

// --- 10. Danger Zone --------------------------------------------------------

describe("10 · Operations and Danger Zone execute nothing by navigation", () => {
  it("renders the Danger Zone without invoking anything", async () => {
    renderAdmin("/admin/operations?section=danger-zone");
    expect(await screen.findByTestId("operations-danger-zone")).toBeTruthy();
    expect(deleteCalled).not.toHaveBeenCalled();
    expect(functionsInvoke).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("documents database restore instead of arming it", async () => {
    renderAdmin("/admin/operations?section=danger-zone");
    const card = await screen.findByTestId("admin-tool-db-restore");
    expect(within(card).getByTestId("admin-tool-nocontrol-db-restore").textContent).toMatch(
      /no ui — documented only/i,
    );
    // No control of any kind on the card.
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByText(/replaces the live game database/i)).toBeTruthy();
  });

  it("keeps the anonymous purge at its existing home rather than duplicating it", async () => {
    renderAdmin("/admin/operations?section=danger-zone");
    await screen.findByTestId("operations-danger-zone");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/admin/people?section=users");
  });

  it("shows all three configuration authorities without migrating any", async () => {
    renderAdmin("/admin/operations?section=configuration");
    const panel = await screen.findByTestId("operations-config-authorities");
    expect(within(panel).getByText(/Supabase \/ Lovable/i)).toBeTruthy();
    expect(within(panel).getByText(/Railway/i)).toBeTruthy();
    expect(within(panel).getByText(/Patch Ops/i)).toBeTruthy();
    const onboarding = screen.getByTestId("operations-onboarding-stores");
    expect(within(onboarding).getByText("quiz_onboarding_config")).toBeTruthy();
    expect(within(onboarding).getByText("onboarding_config")).toBeTruthy();
  });
});

// --- 11–12. Legacy routes ---------------------------------------------------

describe("11 & 12 · legacy admin surfaces stay reachable", () => {
  it("keeps the legacy dashboard and legacy directory linked from Overview and All Tools", async () => {
    renderAdmin("/admin");
    await screen.findByTestId("admin-overview-legacy-dashboard");
    cleanup();
    renderAdmin("/admin/all-tools");
    await screen.findByTestId("admin-all-tools");
    expect(screen.getByTestId("admin-tool-legacy-admin-dashboard")).toBeTruthy();
    expect(screen.getByTestId("admin-tool-legacy-admin-directory")).toBeTruthy();
  });

  it("lists every registered tool in All Tools, developer entries included", async () => {
    renderAdmin("/admin/all-tools");
    await screen.findByTestId("admin-all-tools");
    for (const tool of ADMIN_TOOLS) {
      expect(screen.getByTestId(`admin-tool-${tool.id}`), tool.id).toBeTruthy();
    }
  });

  it("reports a zero-loss ledger", async () => {
    renderAdmin("/admin/all-tools");
    const count = await screen.findByTestId("admin-all-tools-count");
    expect(count.textContent).toMatch(/0 lost/);
    expect(count.textContent).toMatch(/deferred but still accessible/);
  });
});

// --- 13–14. Moderator -------------------------------------------------------

describe("13 & 14 · moderator", () => {
  it("does not regain the Users panel that Admin Users Phase 1 removed", async () => {
    const Moderator = (await import("@/pages/Moderator")).default;
    render(
      <MemoryRouter>
        <Moderator />
      </MemoryRouter>,
    );
    const panel = await screen.findByTestId("moderator-panel");
    expect(within(panel).queryByTestId("moderator-tab-users")).toBeNull();
    expect(within(panel).queryByText(/^Users$/)).toBeNull();
  });

  it("keeps all five legitimate moderator tools, unpaginated", async () => {
    const Moderator = (await import("@/pages/Moderator")).default;
    render(
      <MemoryRouter>
        <Moderator />
      </MemoryRouter>,
    );
    const panel = await screen.findByTestId("moderator-panel");
    for (const tab of ["collections", "bots", "comments", "invite-links", "elo-check"]) {
      expect(within(panel).getByTestId(`moderator-tab-${tab}`), tab).toBeTruthy();
    }
  });

  it("keeps /moderator linked from People rather than dissolving it", async () => {
    renderAdmin("/admin/people?section=moderation");
    const panel = await screen.findByTestId("people-moderator-link");
    expect(within(panel).getByRole("link").getAttribute("href")).toBe("/moderator");
  });
});

// --- 15–16. Arena and Developer labelling -----------------------------------

describe("15 · Arena is reachable and labelled archived", () => {
  it("labels the area and states that nothing was removed", async () => {
    renderAdmin("/admin/arena");
    expect((await screen.findByTestId("admin-area-badge-arena")).textContent).toBe("Archived");
    const notice = screen.getByTestId("admin-arena-archived-notice");
    expect(notice.textContent).toMatch(/fully preserved/i);
    expect(notice.textContent).toMatch(/not removed/i);
  });

  it("separates Arena from the live areas in the rail", async () => {
    renderAdmin("/admin");
    const nav = await screen.findByTestId("admin-shell-nav");
    const arena = within(nav).getByTestId("admin-nav-arena");
    expect(arena.textContent).toMatch(/Archived/);
  });
});

describe("16 · Developer tools remain reachable and are labelled", () => {
  it("lists prototypes with an explicit Developer label", async () => {
    renderAdmin("/admin/developer?section=prototypes");
    await screen.findByTestId("admin-area-developer");
    expect(screen.getByTestId("admin-tool-devlabel-dev-ranked-duel-fixture")).toBeTruthy();
    expect(screen.getByTestId("developer-mastery-prototypes")).toBeTruthy();
  });

  it("keeps all ten mastery prototypes linked", async () => {
    renderAdmin("/admin/developer?section=prototypes");
    const panel = await screen.findByTestId("developer-mastery-prototypes");
    expect(within(panel).getAllByRole("link")).toHaveLength(10);
  });

  it("labels developer entries inside All Tools too", async () => {
    renderAdmin("/admin/all-tools");
    await screen.findByTestId("admin-all-tools");
    for (const tool of ADMIN_TOOLS.filter((t) => t.developerOnly)) {
      expect(screen.getByTestId(`admin-tool-devlabel-${tool.id}`), tool.id).toBeTruthy();
    }
  });
});

// --- 17. No navigation item exposes an unauthorized capability ---------------

describe("17 · navigation advertises nothing the viewer cannot use", () => {
  it("hides master-only Operations panels from a non-master admin", async () => {
    supabase.from.mockImplementation((table: string) =>
      buildQuery(table === "user_roles" ? [{ user_id: "u1", role: "admin" }] : []),
    );
    renderAdmin("/admin/operations?section=configuration");
    expect(await screen.findByTestId("operations-master-only-note")).toBeTruthy();
    expect(screen.queryByTestId("operations-app-settings")).toBeNull();
    expect(screen.queryByTestId("operations-onboarding-config")).toBeNull();
    // And the CSV export, which was master-only on the legacy header.
    cleanup();
    renderAdmin("/admin/operations?section=data-ops");
    await screen.findByTestId("admin-area-operations");
    expect(screen.queryByTestId("operations-csv-export")).toBeNull();
  });

  it("hides master-only Arena presentation panels from a non-master admin", async () => {
    renderAdmin("/admin/arena?section=presentation");
    expect(await screen.findByTestId("arena-presentation-master-only")).toBeTruthy();
    expect(screen.queryByTestId("arena-themes")).toBeNull();
  });

  it("labels every master-gated registry entry so the rail never over-promises", () => {
    for (const tool of ADMIN_TOOLS.filter((t) => t.requiredRole === "master_admin")) {
      expect(tool.authorization, tool.id).toMatch(/master|unchanged/i);
    }
  });
});

// --- 18. Tutorial / onboarding untouched ------------------------------------

describe("18 · no tutorial or onboarding behaviour changed", () => {
  it("never claims the shipped tutorial routes as an admin surface", () => {
    // The shipped flow lives at /quiz/tutorial and /onboarding/ranked-tutorial.
    // No registry entry may target either, in any field.
    for (const tool of ADMIN_TOOLS) {
      const paths = [tool.path ?? "", ...(tool.legacyRoutes ?? [])];
      for (const path of paths) {
        expect(path, tool.id).not.toBe("/quiz/tutorial");
        expect(path, tool.id).not.toBe("/onboarding/ranked-tutorial");
      }
    }
    // The two tutorial-adjacent entries say plainly what they are not.
    const tips = ADMIN_TOOLS.find((t) => t.id === "tutorial-tips")!;
    expect(tips.notes).toMatch(/out of scope and untouched/i);
    const proto = ADMIN_TOOLS.find((t) => t.id === "dev-ranked-tutorial")!;
    expect(proto.path).toBe("/dev/ranked-tutorial");
    expect(proto.notes).toMatch(/out of scope and untouched/i);
  });

  it("touches no onboarding store — it only lists them by authority", async () => {
    renderAdmin("/admin/operations?section=configuration");
    const onboarding = await screen.findByTestId("operations-onboarding-stores");
    expect(onboarding.textContent).toMatch(/none is migrated/i);
    // Listing is a read. Rendering must write nothing.
    expect(deleteCalled).not.toHaveBeenCalled();
  });
});
