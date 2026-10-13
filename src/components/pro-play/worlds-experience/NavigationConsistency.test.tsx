/**
 * UX2A: the Schedule's date and stage filter and the Teams region never leave
 * the interface showing a selection that contradicts the view. The URL, the
 * board and the detail agree, and the history rules (a detail is one entry;
 * view settings replace) keep holding when a view change clears a detail.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionGlobalConfig } from "framer-motion";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import { KO, PI, WORLDS_PRE, clone, partialSchedule, playInDay1, unknownPhase } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { localDayKey } from "@/lib/pro-play/tournamentView";
import { matchDay, pickDay, scheduleDays } from "@/lib/pro-play/worldsExperience/scheduleView";

import WorldsExperience from "./WorldsExperience";

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => false };
});

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

function renderAt(path: string, opts: { data?: TournamentResponseV2; desktop?: boolean; now?: number } = {}) {
  const { data = WORLDS_PRE, desktop = true, now = NOW } = opts;
  return render(
    <QueryClientProvider client={qc()}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={data} now={now} base={BASE} desktop={desktop} />} />
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
const cell = (day: string) => document.querySelector(`[data-testid="day-cell"][data-day="${day}"]`) as HTMLElement;
const chip = (stage: string) => document.querySelector(`[data-testid="schedule-filter-chip"][data-stage="${stage}"]`) as HTMLElement;
const region = (r: string) => document.querySelector(`[data-testid="region-chip"][data-region="${r}"]`) as HTMLElement;
async function single(testId: string) {
  await waitFor(() => expect(screen.getAllByTestId(testId)).toHaveLength(1));
  return screen.getByTestId(testId);
}
const boardDay = async () => (await single("day-board")).getAttribute("data-day");
const panelMode = () => screen.getByTestId("context-panel").getAttribute("data-mode");
const days = (filter: string | null = null, d: TournamentResponseV2 = WORLDS_PRE) => scheduleDays(d.state, filter);
const dayOf = (id: string, d: TournamentResponseV2 = WORLDS_PRE) => matchDay(d.state.matches.find((m) => m.match_id === id)!)!;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  __resetProPlayMediaCache();
  window.sessionStorage.clear();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, identity_available: true, results: [] }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A day other than `not`, from the filtered calendar. */
const otherDay = (not: string, filter: string | null = null) => days(filter).find((d) => d.day !== not)!.day;

/* ── A. the date ─────────────────────────────────────────────────────────── */

describe("Schedule: selecting a date", () => {
  it("clears a match that is not played on that date: URL, board and detail agree", async () => {
    renderAt(`${BASE}/schedule?scenario=x`);
    const matchDayKey = dayOf(PI.ubsf1);
    fireEvent.click(row(PI.ubsf1));
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    const next = otherDay(matchDayKey);
    fireEvent.click(cell(next));
    expect(params().get("day")).toBe(next);
    expect(params().get("match")).toBeNull();
    expect(params().get("scenario")).toBe("x");
    expect(await boardDay()).toBe(next);
    expect(panelMode()).not.toBe("match");
    expect(screen.queryByTestId("match-detail")).toBeNull();
    expect(document.querySelectorAll('[data-testid="fixture-row"][aria-pressed="true"]')).toHaveLength(0);
  });

  it("keeps the match when the chosen date is the match's own", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(cell(dayOf(PI.ubsf1)));
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(params().get("day")).toBe(dayOf(PI.ubsf1));
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
  });

  it("previous / next day clear the match the same way", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(screen.getByTestId("day-next"));
    expect(params().get("match")).toBeNull();
    expect(params().get("day")).toBe(days()[days().findIndex((d) => d.day === dayOf(PI.ubsf1)) + 1].day);
    expect(panelMode()).not.toBe("match");
  });

  it("a linked match with a different day in the URL shows the match's day, not a contradiction", async () => {
    const wrong = otherDay(dayOf(PI.ubsf1));
    renderAt(`${BASE}/schedule?day=${wrong}&match=${PI.ubsf1}`);
    expect(await boardDay()).toBe(dayOf(PI.ubsf1));
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    expect(row(PI.ubsf1)).toHaveAttribute("aria-pressed", "true");
  });

  it("a linked match with no day opens on that match's day", async () => {
    const d = playInDay1();
    renderAt(`${BASE}/schedule?match=${KO.sf1}`, { data: d, now: Date.parse("2026-10-15T23:30:00Z") });
    expect(await boardDay()).toBe(dayOf(KO.sf1));
    expect(row(KO.sf1)).toHaveAttribute("aria-pressed", "true");
  });

  it("a direct link with a matching day and match survives a reload", async () => {
    const d = dayOf(PI.ubsf1);
    const first = renderAt(`${BASE}/schedule?day=${d}&match=${PI.ubsf1}`);
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    first.unmount();
    renderAt(`${loc.pathname}${loc.search}`);
    expect(await boardDay()).toBe(d);
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
  });
});

/* ── B. the stage filter ─────────────────────────────────────────────────── */

describe("Schedule: selecting a stage", () => {
  it("keeps a match that belongs to the new filter, on its own day", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(chip("play_in"));
    expect(params().get("stage")).toBe("play-in");
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(params().get("day")).toBe(dayOf(PI.ubsf1));
    expect(await boardDay()).toBe(dayOf(PI.ubsf1));
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
  });

  it("clears a match the new filter excludes, and shows a day that has fixtures", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(chip("knockout"));
    const ko = days("knockout").map((d) => d.day);
    expect(params().get("stage")).toBe("knockouts");
    expect(params().get("match")).toBeNull();
    expect(params().get("day")).toBe(ko[0]);
    expect(await boardDay()).toBe(ko[0]);
    expect(within(await single("day-board")).getAllByTestId("fixture-row").length).toBeGreaterThan(0);
    expect(panelMode()).not.toBe("match");
    expect(screen.queryByTestId("match-detail")).toBeNull();
  });

  it("moves a day the new filter has no fixtures on to a valid one, and writes it to the URL", async () => {
    const swissDay = days("swiss")[0].day;
    renderAt(`${BASE}/schedule?day=${swissDay}`);
    expect(await boardDay()).toBe(swissDay);
    fireEvent.click(chip("play_in"));
    const shown = await boardDay();
    expect(days("play_in").map((d) => d.day)).toContain(shown);
    expect(params().get("day")).toBe(shown);
    expect(shown).toBe(pickDay(days("play_in"), swissDay, NOW));
  });

  it("keeps the day when the new filter has fixtures on it", async () => {
    const piDay = days("play_in")[1].day;
    renderAt(`${BASE}/schedule?day=${piDay}`);
    fireEvent.click(chip("play_in"));
    expect(params().get("day")).toBe(piDay);
    fireEvent.click(chip("all"));
    expect(params().get("stage")).toBeNull();
    expect(params().get("day")).toBe(piDay);
    expect(await boardDay()).toBe(piDay);
  });

  it("a link whose stage excludes its match shows the match with the filter lifted", async () => {
    renderAt(`${BASE}/schedule?stage=swiss&match=${PI.ubsf1}`);
    expect(await boardDay()).toBe(dayOf(PI.ubsf1));
    expect(await single("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    expect(chip("all")).toHaveAttribute("aria-pressed", "true");
  });

  it("a partial schedule filters only what was read, and invents no day", async () => {
    const d = partialSchedule();
    renderAt(`${BASE}/schedule?day=${dayOf(PI.ubsf1, d)}`, { data: d });
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(chip("knockout"));
    expect(params().get("match")).toBeNull();
    expect(params().get("day")).toBe(dayOf(KO.qf1, d));
    // The outgoing day's board leaves with its exit animation; the one left is the new day's.
    await waitFor(() => expect(screen.getAllByTestId("fixture-row").map((r) => r.getAttribute("data-match-id"))).toEqual([KO.qf1]));
    expect(screen.getByTestId("schedule-partial")).toBeInTheDocument();
  });

  it("an unavailable schedule has no board, no rail and no selection to keep", async () => {
    renderAt(`${BASE}/schedule?day=2026-10-20&stage=swiss&match=${PI.ubsf1}`, { data: unknownPhase() });
    expect(screen.getByTestId("schedule-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("date-rail")).toBeNull();
    expect(screen.queryByTestId("match-detail")).toBeNull();
  });
});

/* ── C. the Teams region ─────────────────────────────────────────────────── */

describe("Teams: selecting a region", () => {
  it("keeps a team that belongs to the region", async () => {
    renderAt(`${BASE}/teams?team=TLAW&scenario=x`);
    fireEvent.click(region("LCS"));
    expect(params().get("region")).toBe("LCS");
    expect(params().get("team")).toBe("TLAW");
    expect(params().get("scenario")).toBe("x");
    expect(screen.getByTestId("team-focus")).toHaveAttribute("data-team", "TLAW");
    expect(tile("TLAW")).toHaveAttribute("aria-pressed", "true");
  });

  it("clears a team outside the region: filter, selector and workspace agree", async () => {
    renderAt(`${BASE}/teams?team=TLAW&scenario=x`);
    fireEvent.click(region("LCK"));
    expect(params().get("region")).toBe("LCK");
    expect(params().get("team")).toBeNull();
    expect(params().get("scenario")).toBe("x");
    expect(screen.getAllByTestId("team-tile").map((t) => t.getAttribute("data-team"))).toEqual(["GEN", "HLE", "T1", "DK"]);
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
    await waitFor(() => expect(screen.queryByTestId("team-focus")).toBeNull());
  });

  it("All keeps the team", async () => {
    renderAt(`${BASE}/teams?team=TLAW&region=LCS`);
    fireEvent.click(region("all"));
    expect(params().get("region")).toBeNull();
    expect(params().get("team")).toBe("TLAW");
  });

  it("a team link wins over a contradicting region in the same link", async () => {
    renderAt(`${BASE}/teams?team=TLAW&region=LCK`);
    expect(screen.getByTestId("team-focus")).toHaveAttribute("data-team", "TLAW");
    expect(region("all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("team-tile")).toHaveLength(19);
  });

  it("an unknown team code is no selection (Escape has nothing invisible to close)", async () => {
    renderAt(`${BASE}/teams?team=ZZZ`);
    expect(screen.getByTestId("team-workspace")).toHaveAttribute("data-mode", "field");
    const before = loc.search;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(loc.search).toBe(before);
  });
});

/* ── history ─────────────────────────────────────────────────────────────── */

describe("history after a view change", () => {
  it("a day change that clears a match leaves no stale panel marker", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    expect(loc.state).toEqual({ ux1Panel: true });
    fireEvent.click(cell(otherDay(dayOf(PI.ubsf1))));
    expect(params().get("match")).toBeNull();
    expect(loc.state).toBeNull();
  });

  it("Back after a clearing view change returns to the schedule as it was before the match, and the match stays closed", async () => {
    renderAt(`${BASE}/schedule?scenario=x`);
    const first = await boardDay();
    fireEvent.click(row(PI.ubsf1));
    fireEvent.click(chip("knockout"));
    expect(params().get("match")).toBeNull();
    back();
    await waitFor(() => expect(params().get("stage")).toBeNull());
    expect(currentScreen()).toBe("schedule");
    expect(params().get("match")).toBeNull();
    expect(await boardDay()).toBe(first);
    expect(loc.pathname).toBe(`${BASE}/schedule`);
  });

  it("opening another match after a clearing change is one new entry that Back closes", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    fireEvent.click(cell(otherDay(dayOf(PI.ubsf1))));
    const target = screen.getAllByTestId("fixture-row")[0].getAttribute("data-match-id")!;
    fireEvent.click(row(target));
    expect(params().get("match")).toBe(target);
    expect(loc.state).toEqual({ ux1Panel: true });
    back();
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(currentScreen()).toBe("schedule");
    expect(params().get("day")).toBe(otherDay(dayOf(PI.ubsf1)));
  });

  it("closing a detail after a filter that kept it stays on the new filter (no snap-back)", async () => {
    renderAt(`${BASE}/schedule`);
    fireEvent.click(row(PI.ubsf1));
    await single("match-detail");
    fireEvent.click(chip("play_in"));
    expect(params().get("match")).toBe(PI.ubsf1);
    fireEvent.click(within(await single("match-detail")).getByTestId("detail-close"));
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(params().get("stage")).toBe("play-in");
    expect(currentScreen()).toBe("schedule");
  });

  it("closing an untouched detail still pops its own entry (Back and the close button agree)", async () => {
    renderAt(`${BASE}/schedule?stage=play-in`);
    fireEvent.click(row(PI.ubsf1));
    fireEvent.click(within(await single("match-detail")).getByTestId("detail-close"));
    await waitFor(() => expect(params().get("match")).toBeNull());
    // The entry was popped, not stacked: Forward has the detail to re-open.
    forward();
    await waitFor(() => expect(params().get("match")).toBe(PI.ubsf1));
  });

  it("a deep-linked match still closes in place after a filter change", async () => {
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`);
    fireEvent.click(chip("play_in"));
    expect(params().get("match")).toBe(PI.ubsf1);
    fireEvent.click(within(await single("match-detail")).getByTestId("detail-close"));
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(params().get("stage")).toBe("play-in");
    expect(currentScreen()).toBe("schedule");
  });

  it("Teams: a region that clears the team leaves no marker; the region survives Back/Forward", async () => {
    renderAt(`${BASE}/teams`);
    fireEvent.click(tile("TLAW"));
    expect(loc.state).toEqual({ ux1Panel: true });
    fireEvent.click(region("LCK"));
    expect(params().get("team")).toBeNull();
    expect(loc.state).toBeNull();
    fireEvent.click(tile("GEN"));
    expect(loc.state).toEqual({ ux1Panel: true });
    back();
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(params().get("region")).toBe("LCK");
    forward();
    await waitFor(() => expect(params().get("team")).toBe("GEN"));
  });

  it("Teams: closing a team after a region that kept it stays in that region", async () => {
    renderAt(`${BASE}/teams`);
    fireEvent.click(tile("TLAW"));
    fireEvent.click(region("LCS"));
    expect(params().get("team")).toBe("TLAW");
    fireEvent.click(within(await single("team-focus")).getByTestId("team-close"));
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(params().get("region")).toBe("LCS");
    expect(currentScreen()).toBe("teams");
  });
});

/* ── phone ───────────────────────────────────────────────────────────────── */

describe("phone sheets", () => {
  it("a match sheet stays closed after the date it belonged to is left", async () => {
    renderAt(`${BASE}/schedule`, { desktop: false });
    fireEvent.click(screen.getAllByTestId("fixture-row")[0]);
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByTestId("detail-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(cell(days()[1].day));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(params().get("match")).toBeNull();
    expect(params().get("day")).toBe(days()[1].day);
  });

  it("a linked match whose day was changed by the link shows its day and its sheet", async () => {
    renderAt(`${BASE}/schedule?day=${otherDay(dayOf(PI.ubsf1))}&match=${PI.ubsf1}`, { desktop: false });
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    expect(await boardDay()).toBe(dayOf(PI.ubsf1));
  });

  it("a team sheet closes with Back and a region change afterwards does not reopen it", async () => {
    renderAt(`${BASE}/teams?region=LCS`, { desktop: false });
    fireEvent.click(tile("TLAW"));
    await screen.findByRole("dialog");
    back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(region("LCK"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(params().get("team")).toBeNull();
    expect(params().get("region")).toBe("LCK");
  });

  it("a linked team in another region opens its sheet with the whole field behind it", async () => {
    renderAt(`${BASE}/teams?team=TLAW&region=LCK`, { desktop: false });
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("team-focus")).toHaveAttribute("data-team", "TLAW");
    expect(region("all")).toHaveAttribute("aria-pressed", "true");
  });
});

/* sanity: the helper the tests lean on */
it("test helper: the local day of a fixture is the calendar's", () => {
  expect(localDayKey(WORLDS_PRE.state.matches.find((m) => m.match_id === PI.ubsf1)!.scheduled_start)).toBe(dayOf(PI.ubsf1));
  expect(clone().state.matches.length).toBe(46);
});
