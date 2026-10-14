/**
 * UX3B — release acceptance for the 15 October Featured switch on a hub that
 * is ALREADY OPEN at midnight in Los Angeles.
 *
 * PW4-B / UX3A pin the calendar boundaries for a page rendered at a given
 * instant. This pins the operational case they leave open: a visitor who
 * opened the hub on 14 Oct and is still on it at 00:00 on 15 Oct (Los
 * Angeles) sees the Featured pill move from DCGI to Worlds without reloading.
 * The hub re-reads its clock each minute (`useMinuteNow`), so the switch lands
 * within one minute. With the Worlds experience flag off or on, the pill's
 * destination is the canonical Worlds URL; the flag is never read by the
 * Featured choice.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import DCGI_PRE_EVENT from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import { WORLDS_PRE } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { featuredTournament } from "@/lib/pro-play/featuredTournament";

import ProPlayHub, { PRO_PLAY_ROUTE } from "./ProPlayHub";

vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/components/pro-play/ProStatsExplorer", () => ({ default: () => <div /> }));

let requests: string[] = [];
function backend(worlds: unknown = WORLDS_PRE) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      requests.push(path);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/tournament/dcgi-2026")) return ok(DCGI_PRE_EVENT);
      if (path.includes("/live-esports/tournament/worlds-2026")) {
        if (worlds === "fail") return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
        return ok(worlds);
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[PRO_PLAY_ROUTE]}>
        <ProPlayHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pillHref = () => screen.getByTestId("tournament-spotlight").getAttribute("href");

beforeEach(() => {
  __resetProPlayMediaCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("UX3B · Featured boundary, one second either side", () => {
  it.each([
    ["2026-10-15T06:59:59Z", "dcgi-2026", "current"],
    ["2026-10-15T07:00:00Z", "worlds-2026", "current"],
    ["2026-10-15T07:00:01Z", "worlds-2026", "current"],
    ["2026-11-15T07:59:59Z", "worlds-2026", "current"],
    ["2026-11-15T08:00:00Z", "worlds-2026", "archive"],
  ])("%s → %s (%s)", (iso, id, status) => {
    const choice = featuredTournament(Date.parse(iso));
    expect(choice.event.contextId).toBe(id);
    expect(choice.status).toBe(status);
  });
});

describe.each([
  ["off", false],
  ["on", true],
])("UX3B · a hub open at midnight in Los Angeles switches without a reload (experience flag %s)", (_l, on) => {
  beforeEach(() => {
    if (on) vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "true");
  });

  it("moves the Featured pill from DCGI to Worlds within one minute of 00:00 LA", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-15T06:59:30Z")); // 23:59:30 on 14 Oct, LA
    backend();
    renderHub();
    await waitFor(() => expect(pillHref()).toBe("/lol/pro-play/tournament/dcgi-2026"));
    expect(requests.some((r) => r.includes("/tournament/worlds-2026"))).toBe(false);

    // The hub's minute clock ticks at 07:00:30Z, half a minute past the switch.
    await act(async () => {
      vi.setSystemTime(new Date("2026-10-15T07:00:30Z"));
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(pillHref()).toBe("/lol/pro-play/tournament/worlds-2026"));
    // The pill is filled from the Worlds read, not the configured fallback.
    await waitFor(() =>
      expect(screen.getByTestId("tournament-spotlight")).toHaveAccessibleName(/League of Legends World Championship 2026/),
    );
    expect(requests.some((r) => r.includes("/tournament/worlds-2026"))).toBe(true);
  }, 15000);

  it("still switches to Worlds when the Worlds read fails at the switch, never back to DCGI", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-15T06:59:30Z"));
    backend("fail");
    renderHub();
    await waitFor(() => expect(pillHref()).toBe("/lol/pro-play/tournament/dcgi-2026"));
    await act(async () => {
      vi.setSystemTime(new Date("2026-10-15T07:00:30Z"));
      vi.advanceTimersByTime(60_000);
    });
    // The Worlds read retries (tournamentQuery: 2 retries) before it is an
    // error; until then the slot shows nothing, then the configured identity.
    const pill = await screen.findByTestId("tournament-spotlight", {}, { timeout: 8000 });
    await waitFor(() => expect(pill.getAttribute("data-state")).toBe("unavailable"), { timeout: 8000 });
    expect(pillHref()).toBe("/lol/pro-play/tournament/worlds-2026");
    expect(screen.getByTestId("tournament-spotlight").textContent).toContain("Worlds");
  }, 15000);
});
