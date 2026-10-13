/**
 * UX3A — the 15 October automatic Featured switch (PW4-B's calendar policy,
 * unchanged) against both presentations of the Worlds page.
 *
 * The Featured choice is by calendar only; the Worlds experience's flag is a
 * presentation choice behind the same URL. So, with the flag off or on:
 *   - the switch happens at 00:00 on 15 Oct in Los Angeles, and Worlds stays
 *     featured through and after the event;
 *   - the featured destination is the canonical Worlds URL, and it resolves to
 *     a registered tournament route that draws the right renderer;
 *   - a failed tournament read neither hands the slot back to DCGI nor breaks
 *     the link.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import TournamentSpotlight from "@/components/pro-play/hub/TournamentSpotlight";
import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import DCGI from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import { WORLDS_PRE } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { featuredTournament } from "@/lib/pro-play/featuredTournament";
import { PRO_PLAY_TOURNAMENT_ROUTE, proPlayTournamentUrl } from "@/lib/pro-play/routes";
import { WORLDS_EXPERIENCE_BASE, WORLDS_EXPERIENCE_ROUTE, isWorldsExperienceEnabled } from "@/lib/pro-play/worldsExperience/productionGate";

import ProPlayTournament from "./ProPlayTournament";

const FLAG = "VITE_WORLDS_EXPERIENCE_ENABLED";

let reads = 0;
function backend(worlds: unknown) {
  reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/tournament/worlds-2026")) {
        reads += 1;
        if (worlds === "network") throw new TypeError("Failed to fetch");
        return ok(worlds);
      }
      if (path.includes("/live-esports/tournament/dcgi-2026")) return ok(DCGI);
      if (path.includes("/media/resolve")) return ok({ ok: true, identity_available: true, results: [] });
      return ok({});
    }),
  );
}

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  return Date.parse(iso);
};

/** The hub's pill (as ProPlayHub mounts it) and App.tsx's tournament routes. */
function Hub() {
  const featured = featuredTournament(Date.now());
  return <TournamentSpotlight contextId={featured.event.contextId} fallback={featured.event} label="Featured" />;
}
function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/lol/pro-play"]}>
        <Routes>
          <Route path="/lol/pro-play" element={<Hub />} />
          <Route path={PRO_PLAY_TOURNAMENT_ROUTE} element={<ProPlayTournament />} />
          {isWorldsExperienceEnabled() ? <Route path={WORLDS_EXPERIENCE_ROUTE} element={<ProPlayTournament />} /> : null}
          <Route path="*" element={<p data-testid="not-found" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const routesFor = (on: boolean) => [
  { path: PRO_PLAY_TOURNAMENT_ROUTE },
  ...(on ? [{ path: WORLDS_EXPERIENCE_ROUTE }] : []),
  { path: "*" },
];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  __resetProPlayMediaCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  ["off", false],
  ["on", true],
])("Featured switch with the experience flag %s", (_label, on) => {
  beforeEach(() => {
    if (on) vi.stubEnv(FLAG, "true");
  });

  it.each([
    ["14 Oct 23:59:59 in Los Angeles", "2026-10-15T06:59:59Z", "dcgi-2026", "current"],
    ["15 Oct 00:00 in Los Angeles", "2026-10-15T07:00:00Z", "worlds-2026", "current"],
    ["during Worlds", "2026-10-30T12:00:00Z", "worlds-2026", "current"],
    ["14 Nov, the last day", "2026-11-15T07:59:59Z", "worlds-2026", "current"],
    ["15 Nov, after Worlds", "2026-11-15T08:00:00Z", "worlds-2026", "archive"],
  ])("%s features %s (%s), and its URL resolves to a tournament route", (_when, iso, id, status) => {
    const choice = featuredTournament(Date.parse(iso));
    expect(choice.event.contextId).toBe(id);
    expect(choice.status).toBe(status);
    const winner = matchRoutes(routesFor(on), proPlayTournamentUrl(id))?.[0].route.path;
    expect(winner).toBe(on && id === "worlds-2026" ? WORLDS_EXPERIENCE_ROUTE : PRO_PLAY_TOURNAMENT_ROUTE);
  });

  it("the featured Worlds pill opens the Worlds page in the presentation the flag selects", async () => {
    at("2026-10-15T07:00:00Z");
    backend(WORLDS_PRE);
    renderHub();
    const pill = await screen.findByTestId("tournament-spotlight");
    expect(pill).toHaveAttribute("href", WORLDS_EXPERIENCE_BASE);
    fireEvent.click(pill);
    if (on) expect(await screen.findByTestId("worlds-experience")).toBeTruthy();
    else expect(await screen.findByTestId("tournament-v2")).toBeTruthy();
    expect(screen.queryByTestId("not-found")).toBeNull();
  });

  it("before the switch the pill still opens DCGI's v1 page", async () => {
    at("2026-10-14T20:00:00Z");
    backend(WORLDS_PRE);
    renderHub();
    const pill = await screen.findByTestId("tournament-spotlight");
    expect(pill).toHaveAttribute("href", "/lol/pro-play/tournament/dcgi-2026");
    fireEvent.click(pill);
    expect(await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" })).toBeTruthy();
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
    expect(reads).toBe(0);
  });

  it("a failed Worlds read at the switch keeps Worlds featured, with a working link", async () => {
    at("2026-10-15T07:00:30Z");
    backend("network");
    renderHub();
    const pill = await screen.findByTestId("tournament-spotlight", undefined, { timeout: 8000 });
    expect(pill).toHaveAttribute("data-state", "unavailable");
    expect(pill).toHaveAttribute("href", WORLDS_EXPERIENCE_BASE);
    expect(pill).toHaveTextContent("Worlds");
    fireEvent.click(pill);
    expect(await screen.findByText("This tournament could not be loaded.", undefined, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByTestId("not-found")).toBeNull();
    expect(screen.queryByTestId("worlds-experience")).toBeNull();
  }, 20_000);
});
