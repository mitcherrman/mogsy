/**
 * UX2: the Teams and Schedule workspaces, their selection contracts, and
 * navigation across all four screens. Real production body (13 Oct) and
 * simulated phases built on it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionGlobalConfig } from "framer-motion";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import {
  KO,
  PI,
  WORLDS_PRE,
  clone,
  partialSchedule,
  playInDay1,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { localDayKey } from "@/lib/pro-play/tournamentView";
import { scheduleDays } from "@/lib/pro-play/worldsExperience/scheduleView";

import WorldsExperience from "./WorldsExperience";

const mocks = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mocks.reduced };
});

/** A fresh query cache per render (the Match Centre check reads the hub's schedule). */
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

const BASE = "/lol/dev/worlds-experience";
const NOW = Date.parse("2026-10-13T00:10:00Z");

let loc = { pathname: "", search: "", state: null as unknown };
let nav: NavigateFunction = () => {};
function Probe() {
  const l = useLocation();
  const n = useNavigate();
  useEffect(() => {
    loc = { pathname: l.pathname, search: l.search, state: l.state };
    nav = n;
  });
  return null;
}

function renderAt(path: string, opts: { data?: TournamentResponseV2; desktop?: boolean; now?: number; simulated?: boolean } = {}) {
  const { data = WORLDS_PRE, desktop = true, now = NOW, simulated = false } = opts;
  return render(
    <QueryClientProvider client={qc()}>
      <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path={`${BASE}/*`} element={<WorldsExperience data={data} now={now} base={BASE} desktop={desktop} simulated={simulated} />} />
      </Routes>
    </MemoryRouter>
      </QueryClientProvider>,
  );
}

const params = () => new URLSearchParams(loc.search);
const back = () => act(() => nav(-1));
const forward = () => act(() => nav(1));
const currentScreen = () => screen.getByTestId("workspace").getAttribute("data-screen");
const tile = (code: string) => document.querySelector(`[data-testid="team-tile"][data-team="${code}"]`) as HTMLElement;
const row = (id: string) => document.querySelector(`[data-testid="fixture-row"][data-match-id="${id}"]`) as HTMLElement;
/** The day board on screen once an outgoing one has left. */
const boardDay = async () => (await single("day-board")).getAttribute("data-day");
async function single(testId: string) {
  await waitFor(() => expect(screen.getAllByTestId(testId)).toHaveLength(1));
  return screen.getByTestId(testId);
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  __resetProPlayMediaCache();
  mocks.reduced = false;
  window.sessionStorage.clear();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, identity_available: true, results: [] }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ── Teams ──────────────────────────────────────────────────────────────── */

describe("Teams", () => {
  it("opens on the field: all 19 participants, and the shape of the event", () => {
    renderAt(`${BASE}/teams`);
    expect(screen.getAllByTestId("team-tile")).toHaveLength(19);
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
    expect(screen.getAllByTestId("field-tier")).toHaveLength(4);
    expect(screen.getAllByTestId("field-team")).toHaveLength(19);
  });

  it("filters by region in the URL (a view setting); the team stays only if it is in the region (UX2A)", () => {
    renderAt(`${BASE}/teams?team=TLAW&scenario=x`);
    fireEvent.click(document.querySelector('[data-testid="region-chip"][data-region="LCS"]')!);
    expect(params().get("region")).toBe("LCS");
    expect(params().get("team")).toBe("TLAW");
    expect(screen.getByTestId("team-focus")).toHaveAttribute("data-team", "TLAW");
    fireEvent.click(document.querySelector('[data-testid="region-chip"][data-region="LCK"]')!);
    expect(params().get("region")).toBe("LCK");
    expect(params().get("team")).toBeNull();
    expect(params().get("scenario")).toBe("x");
    expect(screen.getAllByTestId("team-tile").map((t) => t.getAttribute("data-team"))).toEqual(["GEN", "HLE", "T1", "DK"]);
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
    fireEvent.click(document.querySelector('[data-testid="region-chip"][data-region="all"]')!);
    expect(params().get("region")).toBeNull();
    expect(screen.getAllByTestId("team-tile")).toHaveLength(19);
  });

  it("selects, switches and deselects with the detail history rules", async () => {
    renderAt(`${BASE}/teams`);
    fireEvent.click(tile("TLAW"));
    expect(params().get("team")).toBe("TLAW");
    expect(loc.state).toEqual({ ux1Panel: true });
    expect(tile("TLAW")).toHaveAttribute("aria-pressed", "true");
    const focus = await single("team-focus");
    expect(within(focus).getByRole("heading", { name: "Team Liquid Alienware" })).toBeInTheDocument();
    expect(within(focus).getByTestId("team-identity")).toHaveTextContent(/TLAW.*LCS.*Swiss · Tier 1/);
    // Switching replaces: one Back leaves the team entirely.
    fireEvent.click(tile("GEN"));
    expect(params().get("team")).toBe("GEN");
    back();
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
    // Close and re-click both deselect.
    fireEvent.click(tile("G2"));
    fireEvent.click(within(await single("team-focus")).getByTestId("team-close"));
    await waitFor(() => expect(params().get("team")).toBeNull());
    fireEvent.click(tile("G2"));
    fireEvent.click(tile("G2"));
    await waitFor(() => expect(params().get("team")).toBeNull());
    fireEvent.click(tile("G2"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(params().get("team")).toBeNull());
  });

  it("a direct link opens the team (any case); an unknown code shows the field", () => {
    renderAt(`${BASE}/teams?team=kc`);
    expect(screen.getByTestId("team-focus")).toHaveAttribute("data-team", "KC");
    cleanup();
    renderAt(`${BASE}/teams?team=ZZZ`);
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
  });

  it("maps to the canonical profile by team_key, never by display name", () => {
    renderAt(`${BASE}/teams?team=TLAW`);
    expect(screen.getByTestId("team-profile-link")).toHaveAttribute("href", "/lol/pro-play/team/Team%20Liquid");
    cleanup();
    renderAt(`${BASE}/teams?team=C9`);
    expect(screen.getByTestId("team-profile-link")).toHaveAttribute("href", "/lol/pro-play/team/Cloud9");
    expect(screen.getByRole("heading", { name: "Cloud9 Kia" })).toBeInTheDocument();
  });

  it("an uncertified lineup is said honestly, with roster history on the profile", () => {
    renderAt(`${BASE}/teams?team=GEN`);
    const lineup = screen.getByTestId("lineup");
    expect(lineup).toHaveAttribute("data-certified", "false");
    expect(lineup).toHaveTextContent(/hasn't certified/);
    expect(lineup).toHaveTextContent(/not whether the team has registered/);
    expect(screen.getByTestId("lineup-profile-link")).toHaveAttribute("href", "/lol/pro-play/team/Gen.G");
    expect(document.querySelectorAll('a[href^="/lol/pro-play/player/"]')).toHaveLength(0);
  });

  it("a certified lineup lists its players and links their profiles", () => {
    const d = clone();
    const gen = d.context.participants.find((p) => p.code === "GEN")!;
    gen.lineup_status = "registered";
    gen.lineup = [
      { role: "top", player_key: "Kiin", handle: "Kiin", change: null },
      { role: "jungle", player_key: "Canyon", handle: "Canyon", change: null },
    ];
    renderAt(`${BASE}/teams?team=GEN`, { data: d });
    expect(screen.getByTestId("lineup")).toHaveAttribute("data-certified", "true");
    expect(within(screen.getByTestId("lineup")).getByRole("link", { name: "Kiin" })).toHaveAttribute("href", "/lol/pro-play/player/Kiin");
  });

  it("status only from served standing: none before the event, a record, the champion", () => {
    renderAt(`${BASE}/teams?team=GEN`);
    expect(screen.getByTestId("team-status-none")).toBeInTheDocument();
    expect(screen.getByTestId("team-no-matches")).toHaveTextContent(/published by the official draw/);
    cleanup();
    const d = swissThrough(2.5);
    const rec = d.state.swiss.records.find((r) => r.code === "KC")!;
    renderAt(`${BASE}/teams?team=KC`, { data: d });
    expect(screen.getByTestId("team-status")).toHaveTextContent(`${rec.wins}–${rec.losses}`);
    expect(screen.getByTestId("team-path").querySelector('[data-stage="play_in"]')).toHaveAttribute("data-state", "entered");
    cleanup();
    const done = worldsComplete();
    renderAt(`${BASE}/teams?team=${done.state.knockout.champion_code}`, { data: done });
    expect(screen.getByTestId("team-status")).toHaveAttribute("data-kind", "champion");
  });

  it("a team's matches open in the Schedule on their day", async () => {
    renderAt(`${BASE}/teams?team=C9`, { data: playInDay1() });
    const m = screen.getAllByTestId("team-match")[0];
    expect(m).toHaveAttribute("data-match-id", PI.ubsf1);
    fireEvent.click(m);
    expect(loc.pathname).toBe(`${BASE}/schedule`);
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(params().get("team")).toBeNull();
    expect(params().get("day")).toBe(localDayKey(WORLDS_PRE.state.matches.find((x) => x.match_id === PI.ubsf1)!.scheduled_start));
    expect((await single("match-detail"))).toHaveAttribute("data-match-id", PI.ubsf1);
    back();
    await waitFor(() => expect(currentScreen()).toBe("teams"));
    expect(params().get("team")).toBe("C9");
  });

  it("phone: region chips, a crest grid, and the team in a dismissible sheet", async () => {
    renderAt(`${BASE}/teams`, { desktop: false });
    expect(screen.queryByTestId("team-workspace")).toBeNull();
    fireEvent.click(document.querySelector('[data-testid="region-chip"][data-region="CBLOL"]')!);
    expect(screen.getAllByTestId("team-tile").map((t) => t.getAttribute("data-team"))).toEqual(["LOS", "FUR"]);
    fireEvent.click(tile("LOS"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("team-focus")).toHaveAttribute("data-team", "LOS");
    fireEvent.click(within(sheet).getByTestId("team-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(tile("FUR"));
    await screen.findByRole("dialog");
    back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(params().get("region")).toBe("CBLOL");
  });
});

/* ── Schedule ───────────────────────────────────────────────────────────── */

describe("Schedule", () => {
  const localDays = (d: TournamentResponseV2, filter: string | null = null) => scheduleDays(d.state, filter).map((x) => x.day);

  it("opens on the next match day before the event, with every served day on the rail", () => {
    renderAt(`${BASE}/schedule`);
    const days = localDays(WORLDS_PRE);
    expect(screen.getAllByTestId("day-cell").map((c) => c.getAttribute("data-day"))).toEqual(days);
    expect(screen.getByTestId("day-board")).toHaveAttribute("data-day", days[0]);
    expect(screen.getAllByTestId("day-gap").length).toBeGreaterThan(0);
    const fixtures = within(screen.getByTestId("day-fixtures")).getAllByTestId("fixture-row");
    expect(fixtures.length).toBe(scheduleDays(WORLDS_PRE.state, null)[0].matches.length);
  });

  it("moves between days by cell and by previous / next (view setting: replace)", async () => {
    renderAt(`${BASE}/schedule?scenario=x`);
    const days = localDays(WORLDS_PRE);
    fireEvent.click(screen.getByTestId("day-next"));
    expect(params().get("day")).toBe(days[1]);
    expect(await boardDay()).toBe(days[1]);
    fireEvent.click(document.querySelector(`[data-testid="day-cell"][data-day="${days[5]}"]`)!);
    expect(params().get("day")).toBe(days[5]);
    fireEvent.click(screen.getByTestId("day-prev"));
    expect(params().get("day")).toBe(days[4]);
    expect(params().get("scenario")).toBe("x");
    expect(screen.getByTestId("day-prev")).not.toBeDisabled();
  });

  it("filters by stage: the rail and the board follow", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(document.querySelector('[data-testid="schedule-filter-chip"][data-stage="knockout"]')!);
    expect(params().get("stage")).toBe("knockouts");
    const ko = localDays(WORLDS_PRE, "knockout");
    expect(screen.getAllByTestId("day-cell").map((c) => c.getAttribute("data-day"))).toEqual(ko);
    expect(await boardDay()).toBe(ko[0]);
    expect(within(screen.getByTestId("day-board")).getAllByTestId("fixture-row").every((r) => Object.values(KO).includes(r.getAttribute("data-match-id") as never))).toBe(true);
  });

  it("a linked day and filter restore on load; a day without fixtures falls back", () => {
    const swiss = localDays(WORLDS_PRE, "swiss");
    renderAt(`${BASE}/schedule?stage=swiss&day=${swiss[2]}`);
    expect(screen.getByTestId("day-board")).toHaveAttribute("data-day", swiss[2]);
    cleanup();
    renderAt(`${BASE}/schedule?day=2026-10-20`);
    expect(screen.getByTestId("day-board")).toHaveAttribute("data-day", localDays(WORLDS_PRE)[0]);
  });

  it("rows show served states: live and completed with scores, upcoming without", () => {
    const d = playInDay1();
    renderAt(`${BASE}/schedule`, { data: d, now: Date.parse("2026-10-15T23:30:00Z") });
    expect(row(PI.ubsf1)).toHaveAttribute("data-state", "completed");
    expect(within(row(PI.ubsf1)).getByTestId("row-score")).toHaveTextContent("3–1");
    expect(row(PI.ubsf2)).toHaveAttribute("data-state", "live");
    expect(within(row(PI.ubsf2)).getByTestId("row-score")).toHaveTextContent("1–1");
    expect(screen.getByTestId("day-counts")).toHaveTextContent(/1 live/);
  });

  it("unnamed pairings say where their teams come from, or that the draw decides", () => {
    renderAt(`${BASE}/schedule?day=${localDays(WORLDS_PRE)[1]}`);
    const pending = screen.getAllByTestId("row-pending").map((p) => p.textContent);
    expect(pending.some((t) => /Winner of FUR v MVK v Winner of C9 v KC/.test(t ?? ""))).toBe(true);
    cleanup();
    renderAt(`${BASE}/schedule?stage=swiss`);
    expect(screen.getAllByTestId("row-pending")[0]).toHaveTextContent("Pairing published by the official draw");
  });

  it("partial and unavailable schedules are said, and nothing is invented", () => {
    renderAt(`${BASE}/schedule?stage=knockouts`, { data: partialSchedule() });
    expect(screen.getByTestId("schedule-partial")).toHaveTextContent("40 of 46");
    expect(screen.getAllByTestId("fixture-row").map((r) => r.getAttribute("data-match-id"))).toEqual([KO.qf1]);
    cleanup();
    renderAt(`${BASE}/schedule`, { data: unknownPhase() });
    expect(screen.getByTestId("schedule-empty")).toHaveTextContent(/couldn't be read/);
    expect(screen.queryByTestId("date-rail")).toBeNull();
    expect(screen.getByTestId("status-unknown")).toBeInTheDocument();
  });

  it("selects a match into the context column without leaving the Schedule", async () => {
    renderAt(`${BASE}/schedule`);
    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "collapsed");
    fireEvent.click(row(PI.ubsf1));
    expect(loc.pathname).toBe(`${BASE}/schedule`);
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(loc.state).toEqual({ ux1Panel: true });
    expect(row(PI.ubsf1)).toHaveAttribute("aria-pressed", "true");
    expect((await single("match-detail"))).toHaveAttribute("data-match-id", PI.ubsf1);
    // Switching replaces; Back closes in one step.
    fireEvent.click(row(PI.ubsf2));
    expect(params().get("match")).toBe(PI.ubsf2);
    back();
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(currentScreen()).toBe("schedule");
    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "collapsed");
  });

  it("following an edge in the detail moves the board to that match's day", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    const detail = await single("match-detail");
    fireEvent.click(within(detail).getAllByTestId("route-link")[0]);
    expect(params().get("match")).toBe(PI.ubf);
    expect(await boardDay()).toBe(localDayKey(WORLDS_PRE.state.matches.find((m) => m.match_id === PI.ubf)!.scheduled_start));
  });

  it("opens a selected match in its stage, deliberately (a new entry)", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    fireEvent.click(within(await single("match-detail")).getByTestId("detail-open-stage"));
    expect(loc.pathname).toBe(`${BASE}/stages/play-in`);
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(params().get("day")).toBeNull();
    back();
    await waitFor(() => expect(currentScreen()).toBe("schedule"));
    expect(params().get("match")).toBe(PI.ubsf1);
  });

  it("a match detail on Stages offers its day in the Schedule", async () => {
    renderAt(`${BASE}/stages/play-in?match=${PI.ubf}`);
    fireEvent.click(screen.getByTestId("detail-open-schedule"));
    expect(loc.pathname).toBe(`${BASE}/schedule`);
    expect(params().get("match")).toBe(PI.ubf);
    expect(screen.getByTestId("day-board").querySelector(`[data-match-id="${PI.ubf}"]`)).not.toBeNull();
  });

  it("a team's code in the detail opens it in Teams", async () => {
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`);
    fireEvent.click(within(await single("match-detail")).getAllByTestId("detail-team-link")[0]);
    expect(loc.pathname).toBe(`${BASE}/teams`);
    expect(params().get("team")).toBe("C9");
  });

  it("phone: date rail, fixtures, and the detail in a sheet", async () => {
    renderAt(`${BASE}/schedule`, { desktop: false });
    expect(screen.queryByTestId("context-panel")).toBeNull();
    fireEvent.click(screen.getAllByTestId("day-cell")[1]);
    expect(params().get("day")).toBe(localDays(WORLDS_PRE)[1]);
    fireEvent.click(screen.getAllByTestId("fixture-row")[0]);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("match-detail")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByTestId("detail-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

/* ── Match Centre boundary ──────────────────────────────────────────────── */

describe("Match Centre link", () => {
  /** The hub's schedule reads answer with these match ids (both reads honoured). */
  function upcomingFeed(ids: string[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
        if (u.includes("/live-esports/upcoming")) {
          const worlds = u.includes("league=worlds");
          return ok({
            source_ok: true,
            stale: false,
            limit: 12,
            horizon_days: 14,
            ...(worlds ? { league: "worlds" } : {}),
            matches: ids.map((id) => ({
              match_id: id,
              scheduled_start: "2026-10-15T18:00:00Z",
              league: { slug: "worlds", name: "Worlds" },
              block_name: "Play-Ins",
              best_of: 5,
              teams: { a: { code: "C9", tbd: false }, b: { code: "KC", tbd: false } },
            })),
          });
        }
        return ok({ ok: true, identity_available: true, results: [] });
      }),
    );
  }

  it("offers ?next= only when the hub's schedule lists the fixture", async () => {
    upcomingFeed([PI.ubsf1]);
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`);
    await waitFor(() => expect(screen.getByTestId("detail-match-centre")).toHaveAttribute("href", `/lol/pro-play?next=${PI.ubsf1}`));
    expect(screen.getByTestId("detail-footer")).toHaveAttribute("data-match-centre", "listed");
  });

  it("a named fixture outside the hub's schedule gets a note, not a link to the wrong match", async () => {
    upcomingFeed([]);
    renderAt(`${BASE}/schedule?match=${PI.ubsf2}`);
    await waitFor(() => expect(screen.getByTestId("match-centre-note")).toHaveAttribute("data-state", "not_listed"));
    expect(screen.queryByTestId("detail-match-centre")).toBeNull();
  });

  it("an all-TBD fixture has no Match Centre entry at all; a played game always links", async () => {
    upcomingFeed([]);
    renderAt(`${BASE}/schedule?match=${KO.final}`);
    await waitFor(() => expect(screen.getAllByTestId("match-detail")).toHaveLength(1));
    expect(screen.queryByTestId("match-centre-note")).toBeNull();
    expect(screen.queryByTestId("detail-match-centre")).toBeNull();
    cleanup();
    const d = playInDay1();
    d.state.matches.find((m) => m.match_id === PI.ubsf1)!.live1_game_ids = ["game-1"];
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`, { data: d });
    await waitFor(() => expect(screen.getByTestId("detail-match-centre")).toHaveAttribute("href", "/lol/pro-play?game=game-1"));
  });
});

/* ── detail wording and the simulated mark ──────────────────────────────── */

describe("match detail", () => {
  it("states consequences before a result, verdicts after it", async () => {
    renderAt(`${BASE}/schedule?match=${PI.lbsf}`);
    const d = await single("match-detail");
    expect(within(d).getByTestId("onward-loser")).toHaveAttribute("data-kind", "eliminated");
    expect(within(within(d).getByTestId("onward-loser")).getByTestId("onward-label")).toHaveTextContent("If they lose");
    cleanup();
    const done = worldsComplete();
    renderAt(`${BASE}/schedule?match=${KO.final}`, { data: done });
    const f = await single("match-detail");
    expect(within(within(f).getByTestId("onward-loser")).getByTestId("onward-label")).toHaveTextContent("Loser");
  });

  it("marks simulated results in the detail, and only then", async () => {
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`, { data: playInDay1(), simulated: true });
    expect(within(await single("match-detail")).getByTestId("detail-simulated")).toBeInTheDocument();
    cleanup();
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`, { data: playInDay1() });
    expect(within(await single("match-detail")).queryByTestId("detail-simulated")).toBeNull();
  });
});

/* ── across screens ─────────────────────────────────────────────────────── */

describe("navigation across all four screens", () => {
  it("Overview → Teams → Schedule → Stages, then back and forward, with directions", async () => {
    renderAt(`${BASE}?scenario=snapshot`);
    const go = (key: string) => fireEvent.click(document.querySelector(`[data-testid="nav-screen"][data-screen="${key}"]`)!);
    const dir = () => screen.getByTestId("workspace").getAttribute("data-direction");
    go("teams");
    expect([currentScreen(), dir()]).toEqual(["teams", "1"]);
    go("schedule");
    expect([currentScreen(), dir()]).toEqual(["schedule", "1"]);
    go("stages");
    expect([currentScreen(), dir()]).toEqual(["stages", "-1"]);
    back();
    await waitFor(() => expect(currentScreen()).toBe("schedule"));
    expect(dir()).toBe("1");
    back();
    await waitFor(() => expect(currentScreen()).toBe("teams"));
    expect(dir()).toBe("-1");
    back();
    await waitFor(() => expect(currentScreen()).toBe("overview"));
    forward();
    await waitFor(() => expect(currentScreen()).toBe("teams"));
    expect(params().get("scenario")).toBe("snapshot");
  });

  it("leaving a screen drops its selection, and coming back by history restores it", async () => {
    renderAt(`${BASE}/teams?team=KC&region=LEC`);
    fireEvent.click(document.querySelector('[data-testid="nav-screen"][data-screen="schedule"]')!);
    expect(params().get("team")).toBeNull();
    expect(params().get("region")).toBeNull();
    back();
    await waitFor(() => expect(currentScreen()).toBe("teams"));
    expect(params().get("team")).toBe("KC");
    expect(params().get("region")).toBe("LEC");
  });

  it("the Overview's Coming up opens a fixture in the Stage Explorer as before", () => {
    renderAt(BASE);
    fireEvent.click(screen.getAllByTestId("fixture")[0]);
    expect(loc.pathname.startsWith(`${BASE}/stages/`)).toBe(true);
  });

  it("reduced motion: every screen still navigates, with no travel", async () => {
    mocks.reduced = true;
    renderAt(`${BASE}/teams`);
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-motion", "reduced");
    fireEvent.click(document.querySelector('[data-testid="nav-screen"][data-screen="schedule"]')!);
    await waitFor(() => expect(currentScreen()).toBe("schedule"));
  });
});
