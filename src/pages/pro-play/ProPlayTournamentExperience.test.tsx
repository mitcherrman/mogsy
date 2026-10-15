/**
 * UX3A — the Worlds experience mounted at the production Worlds URL behind
 * `VITE_WORLDS_EXPERIENCE_ENABLED`.
 *
 * The router here is App.tsx's: the published tournament route, the flag's
 * route only while the flag is on, and a catch-all (App.ux3aRoutes.test.ts
 * holds App.tsx to exactly this shape). The data is the real production body
 * (13 Oct) and the PW4-B scenarios, served through `fetch` like production.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import DCGI from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import { WORLDS_PRE, clone, partialSchedule, staleSchedule, unknownPhase } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { PRO_PLAY_TOURNAMENT_ROUTE } from "@/lib/pro-play/routes";
import {
  WORLDS_EXPERIENCE_BASE,
  WORLDS_EXPERIENCE_ROUTE,
  WORLDS_ROLLBACK_SCREEN_PATHS,
  isWorldsExperienceEnabled,
  isWorldsExperiencePath,
  isWorldsExperienceSurface,
  usesWorldsExperience,
} from "@/lib/pro-play/worldsExperience/productionGate";

import ProPlayTournament from "./ProPlayTournament";

const mocks = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mocks.reduced };
});

const BASE = WORLDS_EXPERIENCE_BASE;
const C9_KC = "115660588583171786";
const FLAG = "VITE_WORLDS_EXPERIENCE_ENABLED";

let requests: string[] = [];
function backend(...bodies: unknown[]) {
  requests = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      requests.push(path);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/tournament/")) {
        if (!/\/tournament\/(worlds-2026|dcgi-2026)(\?|$)/.test(path)) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        const body = bodies[Math.min(i++, bodies.length - 1)];
        if (body === "network") throw new TypeError("Failed to fetch");
        return ok(body);
      }
      if (path.includes("/media/resolve")) return ok({ ok: true, identity_available: true, results: [] });
      return ok({});
    }),
  );
}
const tournamentReads = () => requests.filter((r) => r.includes("/live-esports/tournament/"));

/** App.tsx's tournament routes, evaluated now (the flag is read per call). */
function AppRoutes() {
  return (
    <Routes>
      <Route path={PRO_PLAY_TOURNAMENT_ROUTE} element={<ProPlayTournament />} />
      {isWorldsExperienceEnabled()
        ? <Route path={WORLDS_EXPERIENCE_ROUTE} element={<ProPlayTournament />} />
        : WORLDS_ROLLBACK_SCREEN_PATHS.map((path) => (
            <Route key={path} path={path} element={<Navigate to={BASE} replace />} />
          ))}
      <Route path="*" element={<p data-testid="not-found">Not found</p>} />
    </Routes>
  );
}

interface RouterHandle {
  state: { location: Location };
  navigate: NavigateFunction;
}

function Probe({ handle }: { handle: RouterHandle }) {
  handle.state.location = useLocation();
  handle.navigate = useNavigate();
  return null;
}

function open(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = { state: {} } as RouterHandle;
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Probe handle={router} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { router, client, view };
}

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
const description = () => document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
const workspace = () => screen.getByTestId("workspace");
const navTo = (key: string) => screen.getAllByTestId("nav-screen").find((el) => el.getAttribute("data-screen") === key)!;

function desktopViewport(reducedMotion = false) {
  mocks.reduced = reducedMotion;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  window.matchMedia = globalThis.matchMedia;
}

const originalMatchMedia = window.matchMedia;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  mocks.reduced = false;
  __resetProPlayMediaCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.title = "";
  document.head.querySelector('link[rel="canonical"]')?.remove();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* ── the gate ───────────────────────────────────────────────────────────── */

describe("the production gate", () => {
  it("is off unless the build sets an explicit true value", () => {
    expect(isWorldsExperienceEnabled()).toBe(false);
    for (const v of ["", "false", "0", "off", "no", "ture", "enabled"]) {
      vi.stubEnv(FLAG, v);
      expect(isWorldsExperienceEnabled(), v).toBe(false);
    }
    for (const v of ["true", "1", "yes", "on", " TRUE "]) {
      vi.stubEnv(FLAG, v);
      expect(isWorldsExperienceEnabled(), v).toBe(true);
    }
  });

  it("applies to worlds-2026 and its screen paths only", () => {
    vi.stubEnv(FLAG, "true");
    expect(usesWorldsExperience("worlds-2026")).toBe(true);
    for (const id of ["dcgi-2026", "worlds-2025", "WORLDS-2026", undefined]) expect(usesWorldsExperience(id)).toBe(false);
    expect(isWorldsExperiencePath(BASE)).toBe(true);
    expect(isWorldsExperiencePath(`${BASE}/teams`)).toBe(true);
    expect(isWorldsExperiencePath(`${BASE}-extra`)).toBe(false);
    expect(isWorldsExperiencePath("/lol/pro-play/tournament/dcgi-2026")).toBe(false);
    expect(isWorldsExperienceSurface(`${BASE}/schedule`)).toBe(true);
    vi.stubEnv(FLAG, "false");
    expect(isWorldsExperienceSurface(`${BASE}/schedule`)).toBe(false);
    expect(usesWorldsExperience("worlds-2026")).toBe(false);
  });

  it("is not controlled by the URL", async () => {
    backend(WORLDS_PRE);
    open(`${BASE}?experience=1&ux=on&${FLAG}=true&scenario=complete`);
    await screen.findByTestId("tournament-v2");
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
  });
});

/* ── flag OFF: the published page, exactly ──────────────────────────────── */

describe("flag OFF (default)", () => {
  it("renders the published Worlds page at the Worlds URL, with its own metadata", async () => {
    backend(WORLDS_PRE);
    open(BASE);
    await screen.findByTestId("tournament-v2");
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
    expect(screen.queryByTestId("tournament-experience")).toBeNull();
    await waitFor(() => expect(document.title).toBe("Worlds — League of Legends World Championship 2026 | Mogzy"));
    expect(canonical().endsWith(BASE)).toBe(true);
  });

  it("redirects every shared screen link to the canonical Worlds page (replace, query dropped)", async () => {
    backend(WORLDS_PRE);
    for (const p of [
      "/stages/play-in",
      "/stages/swiss",
      "/stages/knockouts",
      "/teams?team=KC",
      "/schedule",
      `/schedule?match=${C9_KC}`,
      `/schedule/`,
    ]) {
      const { router, view } = open(`${BASE}${p}`);
      await screen.findByTestId("tournament-v2");
      expect(router.state.location.pathname, p).toBe(BASE);
      expect(router.state.location.search, p).toBe("");
      expect(screen.queryByTestId("worlds-experience")).toBeNull();
      view.unmount();
    }
  });

  it("Back after a redirect leaves the Worlds page rather than looping", async () => {
    backend(WORLDS_PRE);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const router = { state: {} } as RouterHandle;
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/lol/pro-play", `${BASE}/schedule?match=${C9_KC}`]} initialIndex={1}>
          <AppRoutes />
          <Probe handle={router} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("tournament-v2");
    expect(router.state.location.pathname).toBe(BASE);
    act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol/pro-play"));
  });

  it("does not loop on the canonical URL and keeps unknown paths as 404s", async () => {
    backend(WORLDS_PRE);
    const { router, view } = open(BASE);
    await screen.findByTestId("tournament-v2");
    expect(router.state.location.pathname).toBe(BASE);
    view.unmount();
    for (const p of ["/discover", "/stages/swiss/extra", "/stages", "/stages/knockout", "/teams/KC"]) {
      const { view: v } = open(`${BASE}${p}`);
      expect(screen.getByTestId("not-found"), p).toBeTruthy();
      v.unmount();
    }
    const { view: dcgi } = open("/lol/pro-play/tournament/dcgi-2026/teams");
    expect(screen.getByTestId("not-found")).toBeTruthy();
    dcgi.unmount();
  });

  it("draws nothing of the experience, loading state included", async () => {
    backend(WORLDS_PRE);
    open(BASE);
    expect(document.querySelector("[data-experience='worlds']")).toBeNull();
    await screen.findByTestId("tournament-v2");
    expect(document.querySelector("[data-experience='worlds']")).toBeNull();
  });

  it("keeps DCGI on its v1 page", async () => {
    backend(DCGI);
    open("/lol/pro-play/tournament/dcgi-2026");
    await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" });
    expect(screen.queryByTestId("tournament-v2")).toBeNull();
  });
});

/* ── flag ON: the experience at the production URL ──────────────────────── */

describe("flag ON — screens at the production URL", () => {
  beforeEach(() => vi.stubEnv(FLAG, "true"));

  it("renders the Overview at the Worlds URL with the published page's identity", async () => {
    backend(WORLDS_PRE);
    open(BASE);
    expect(await screen.findByTestId("worlds-experience")).toHaveAttribute("data-phase", "pre_event");
    expect(screen.queryByTestId("tournament-v2")).toBeNull();
    expect(workspace()).toHaveAttribute("data-screen", "overview");
    await waitFor(() => expect(document.title).toBe("Worlds — League of Legends World Championship 2026 | Mogzy"));
    expect(description()).toBe(
      "League of Legends World Championship 2026: the 19-team field, the Play-In, Swiss, Knockout stages, the full schedule and results.",
    );
    expect(canonical().endsWith(BASE)).toBe(true);
    // One page title: the experience's bar carries the only h1.
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    // No development-only data or controls.
    expect(screen.queryByTestId("simulated-badge")).toBeNull();
    expect(screen.queryByTestId("scenario-picker")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Simulated|Prototype data/);
    expect(tournamentReads()).toHaveLength(1);
    expect(tournamentReads()[0]).toContain("/live-esports/tournament/worlds-2026");
  });

  it.each([
    [`${BASE}/stages/swiss`, "stages", "Swiss — Worlds 2026 | Mogzy", `${BASE}/stages/swiss`],
    // A bare /stages shows the stage in play or next: its canonical names that stage.
    [`${BASE}/stages`, "stages", "Play-In — Worlds 2026 | Mogzy", `${BASE}/stages/play-in`],
    [`${BASE}/stages/play-in?round=2`, "stages", "Play-In — Worlds 2026 | Mogzy", `${BASE}/stages/play-in`],
    [`${BASE}/teams`, "teams", "Teams — Worlds 2026 | Mogzy", `${BASE}/teams`],
    [`${BASE}/schedule?day=2026-10-15&stage=play-in`, "schedule", "Schedule — Worlds 2026 | Mogzy", `${BASE}/schedule`],
  ])("deep link %s opens its screen, titled, with a query-free canonical", async (path, screenKey, title, canon) => {
    backend(WORLDS_PRE);
    open(path);
    await screen.findByTestId("worlds-experience");
    expect(workspace()).toHaveAttribute("data-screen", screenKey);
    await waitFor(() => expect(document.title).toBe(title));
    expect(canonical().endsWith(canon)).toBe(true);
    expect(canonical()).not.toContain("?");
  });

  it("titles a shared selection, and folds it into its screen's canonical", async () => {
    backend(WORLDS_PRE);
    const kc = WORLDS_PRE.context.participants.find((p) => p.code === "KC")!;
    const { view } = open(`${BASE}/teams?team=KC`);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.title).toBe(`${kc.name} — Worlds 2026 Teams | Mogzy`));
    expect(canonical().endsWith(`${BASE}/teams`)).toBe(true);
    view.unmount();

    open(`${BASE}/schedule?match=${C9_KC}`);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.title).toBe("C9 vs KC — Worlds 2026 Schedule | Mogzy"));
    expect(canonical().endsWith(`${BASE}/schedule`)).toBe(true);
  });

  it("an unknown team or match is no selection in the title either", async () => {
    backend(WORLDS_PRE);
    open(`${BASE}/teams?team=ZZZ`);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.title).toBe("Teams — Worlds 2026 | Mogzy"));
  });

  it("corrects Discover and unknown screens to the Overview at the Worlds URL", async () => {
    backend(WORLDS_PRE);
    for (const p of ["/discover", "/nope", "/stages/nope"]) {
      const { router, view } = open(`${BASE}${p}`);
      await screen.findByTestId("worlds-experience");
      if (p === "/stages/nope") {
        await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^${BASE}/stages/[a-z-]+$`)));
        expect(router.state.location.pathname).not.toBe(`${BASE}/stages/nope`);
      } else {
        await waitFor(() => expect(router.state.location.pathname).toBe(BASE));
        expect(canonical().endsWith(BASE)).toBe(true);
      }
      view.unmount();
    }
  });

  it("moves Overview → Stages → Teams → Schedule and back on one page, with one tournament read", async () => {
    desktopViewport();
    backend(WORLDS_PRE);
    const { router } = open(BASE);
    const frame = await screen.findByTestId("worlds-experience");
    expect(frame).toHaveAttribute("data-layout", "wide");
    for (const [key, path, title] of [
      ["stages", `${BASE}/stages`, /^Play-In — Worlds 2026/],
      ["teams", `${BASE}/teams`, /^Teams — /],
      ["schedule", `${BASE}/schedule`, /^Schedule — /],
    ] as const) {
      fireEvent.click(navTo(key));
      await waitFor(() => expect(workspace()).toHaveAttribute("data-screen", key));
      expect(router.state.location.pathname).toBe(path);
      await waitFor(() => expect(document.title).toMatch(title));
    }
    // The same frame throughout: the page never remounted between screens.
    expect(screen.getByTestId("worlds-experience")).toBe(frame);
    for (const key of ["teams", "stages", "overview"]) {
      act(() => router.navigate(-1));
      await waitFor(() => expect(workspace()).toHaveAttribute("data-screen", key));
    }
    act(() => router.navigate(1));
    await waitFor(() => expect(workspace()).toHaveAttribute("data-screen", "stages"));
    expect(screen.getByTestId("worlds-experience")).toBe(frame);
    expect(tournamentReads()).toHaveLength(1);
  });

  it("restores a selected match and day on refresh of a schedule deep link", async () => {
    desktopViewport();
    backend(WORLDS_PRE);
    const link = `${BASE}/schedule?day=2026-10-15&match=${C9_KC}`;
    const first = open(link);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.querySelector(`[data-testid='match-detail']`)).toBeTruthy());
    first.view.unmount();
    // A refresh is a fresh router and a fresh cache at the same URL.
    const again = open(link);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.querySelector(`[data-testid='match-detail']`)).toBeTruthy());
    expect(again.router.state.location.search).toContain(`match=${C9_KC}`);
    expect(again.router.state.location.search).toContain("day=2026-10-15");
  });

  it("a date that does not hold the open match clears it (UX2A reconciliation, production route)", async () => {
    desktopViewport();
    backend(WORLDS_PRE);
    const { router } = open(`${BASE}/schedule?day=2026-10-15&match=${C9_KC}`);
    await screen.findByTestId("worlds-experience");
    await waitFor(() => expect(document.querySelector("[data-testid='match-detail']")).toBeTruthy());
    const other = [...document.querySelectorAll<HTMLElement>("[data-testid='day-cell']")].find(
      (el) => el.getAttribute("data-day") && el.getAttribute("data-day") !== "2026-10-15",
    );
    expect(other).toBeTruthy();
    fireEvent.click(other!);
    await waitFor(() => expect(router.state.location.search).not.toContain("match="));
    expect(router.state.location.pathname).toBe(`${BASE}/schedule`);
  });

  it("honours reduced motion", async () => {
    desktopViewport(true);
    backend(WORLDS_PRE);
    open(`${BASE}/teams`);
    await screen.findByTestId("worlds-experience");
    expect(workspace()).toHaveAttribute("data-motion", "reduced");
  });

  it("uses the compact frame on a phone", async () => {
    backend(WORLDS_PRE);
    open(`${BASE}/schedule`);
    expect(await screen.findByTestId("worlds-experience")).toHaveAttribute("data-layout", "compact");
    expect(screen.getByTestId("command-bar")).toHaveAttribute("data-layout", "compact");
  });
});

/* ── flag ON: data states through the page ──────────────────────────────── */

describe("flag ON — loading, errors and degraded data keep the page's handling", () => {
  beforeEach(() => vi.stubEnv(FLAG, "true"));

  it("holds the frame open while loading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/live-esports/tournament/")) await gate;
        return { ok: true, status: 200, json: async () => (String(url).includes("/live-esports/tournament/") ? WORLDS_PRE : {}) } as unknown as Response;
      }),
    );
    open(`${BASE}/teams`);
    expect(screen.getByTestId("tournament-loading")).toHaveAttribute("data-experience", "worlds");
    release();
    await screen.findByTestId("worlds-experience");
    expect(screen.queryByTestId("tournament-loading")).toBeNull();
  });

  it("says the service did not answer, on any screen path", async () => {
    backend("network");
    open(`${BASE}/schedule`);
    // The hook retries a network failure twice before it gives up.
    expect(await screen.findByText("This tournament could not be loaded.", undefined, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText(/did not answer/)).toBeTruthy();
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
  }, 15_000);

  it("refuses an unsupported or malformed contract plainly", async () => {
    backend({ ...clone(), contract_version: "tournament_context_v9" });
    const { view } = open(BASE);
    expect(await screen.findByText("This tournament can't be shown on this version of the page.")).toBeTruthy();
    expect(screen.getByTestId("tournament-contract-error")).toHaveTextContent("tournament_context_v9");
    view.unmount();
    backend({ contract_version: "tournament_context_v2", context: { name: "x" } });
    open(`${BASE}/teams`);
    expect(await screen.findByTestId("tournament-contract-error")).toBeTruthy();
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
  });

  it("names an unknown context as missing, and the flag does not reach it", async () => {
    backend(WORLDS_PRE);
    open("/lol/pro-play/tournament/worlds-2099");
    expect(await screen.findByText("No such tournament.")).toBeTruthy();
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
  });

  it("carries stale, partial and unavailable states into the experience's status strip", async () => {
    for (const [body, line] of [
      [staleSchedule(), "status-stale"],
      [partialSchedule(), "status-partial"],
      [unknownPhase(), "status-unknown"],
    ] as const) {
      backend(body);
      const { view } = open(BASE);
      await screen.findByTestId("worlds-experience");
      expect(screen.getByTestId(line)).toBeTruthy();
      view.unmount();
    }
  });

  it("says a failed refresh kept the last good response", async () => {
    backend(WORLDS_PRE, "network");
    const { client } = open(BASE);
    await screen.findByTestId("worlds-experience");
    await act(async () => {
      await client.refetchQueries({ queryKey: ["live-esports", "tournament", "worlds-2026"] });
    });
    expect(await screen.findByTestId("status-refresh")).toBeTruthy();
    expect(screen.getByTestId("worlds-experience")).toBeTruthy();
  });

  it("draws a v1 body served for Worlds with the published renderer at the Worlds URL", async () => {
    backend({ ...DCGI, context: { ...DCGI.context, context_id: "worlds-2026" } });
    const { router } = open(`${BASE}/teams`);
    await waitFor(() => expect(router.state.location.pathname).toBe(BASE));
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
    await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" });
  });
});

/* ── flag ON: everything else is untouched ──────────────────────────────── */

describe("flag ON — other contexts", () => {
  beforeEach(() => vi.stubEnv(FLAG, "true"));

  it("keeps DCGI on its v1 page, and its screen-like paths still 404", async () => {
    backend(DCGI);
    const { view } = open("/lol/pro-play/tournament/dcgi-2026");
    await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" });
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
    await waitFor(() => expect(canonical().endsWith("/lol/pro-play/tournament/dcgi-2026")).toBe(true));
    view.unmount();
    open("/lol/pro-play/tournament/dcgi-2026/teams");
    expect(screen.getByTestId("not-found")).toBeTruthy();
  });
});
