/**
 * UX4 — the Schedule and Teams pages, with a measured layout: a linked match
 * opens on its day AND its page; paging away from it closes its detail; the
 * last fixture and the last team are reachable through the visible controls.
 *
 * jsdom has no layout, so the list regions and rows are given browser-like
 * heights (two rows per page here), as the real layout would measure them.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionGlobalConfig } from "framer-motion";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import { WORLDS_PRE } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { scheduleDays } from "@/lib/pro-play/worldsExperience/scheduleView";

import WorldsExperience from "./WorldsExperience";

const BASE = "/lol/dev/worlds-experience";
const NOW = Date.parse("2026-10-13T00:10:00Z");
const ROW = 60;
const REGION = 130; // two rows

let loc = { pathname: "", search: "" };
function Probe() {
  const l = useLocation();
  useEffect(() => {
    loc = { pathname: l.pathname, search: l.search };
  });
  return null;
}
const params = () => new URLSearchParams(loc.search);

function renderAt(path: string, desktop = true) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={WORLDS_PRE} now={NOW} base={BASE} desktop={desktop} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saved: [string, PropertyDescriptor | undefined][] = [];
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // Every paged list region holds two rows of 60 px; nothing else measures.
  for (const k of ["clientHeight", "offsetHeight", "offsetTop"] as const) {
    saved.push([k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)]);
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get(this: HTMLElement) {
        if (k === "clientHeight") return this.hasAttribute("data-fit-region") ? REGION : 0;
        const list = this.parentElement?.hasAttribute("data-fit-list") ? this.parentElement : null;
        if (!list) return 0;
        return k === "offsetHeight" ? ROW : [...list.children].indexOf(this) * ROW;
      },
    });
  }
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  for (const [k, d] of saved) if (d) Object.defineProperty(HTMLElement.prototype, k, d);
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

const busiest = () => [...scheduleDays(WORLDS_PRE.state, null)].sort((a, b) => b.matches.length - a.matches.length)[0];
const shownRows = () => within(screen.getByTestId("day-fixtures")).getAllByTestId("fixture-row").map((r) => r.getAttribute("data-match-id"));

describe("Schedule pages (UX4)", () => {
  it("a linked match opens on its day and on its page, selected", async () => {
    const day = busiest();
    expect(day.matches.length).toBeGreaterThanOrEqual(4);
    const target = day.matches[3].match_id;
    renderAt(`${BASE}/schedule?match=${target}`);
    expect(screen.getByTestId("day-board")).toHaveAttribute("data-day", day.day);
    expect(shownRows()).toEqual([day.matches[2].match_id, target]);
    expect(screen.getByTestId("pager-range")).toHaveTextContent(`Matches 3–4 of ${day.matches.length}`);
    expect(document.querySelector(`[data-testid="fixture-row"][data-match-id="${target}"]`)).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("match-detail")).toHaveAttribute("data-match-id", target));
  });

  it("paging away from the selected match closes its detail; every fixture is reachable", async () => {
    const day = busiest();
    const target = day.matches[1].match_id;
    renderAt(`${BASE}/schedule?match=${target}`);
    expect(shownRows()).toEqual([day.matches[0].match_id, target]);
    fireEvent.click(screen.getByTestId("pager-next"));
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(shownRows()).toEqual([day.matches[2].match_id, day.matches[3].match_id]);
    expect(screen.queryByTestId("match-detail")).toBeNull();
    // Walk to the last page: the day's last fixture is there.
    const pages = Math.ceil(day.matches.length / 2);
    for (let p = 2; p < pages; p += 1) fireEvent.click(screen.getByTestId("pager-next"));
    expect(shownRows()).toContain(day.matches[day.matches.length - 1].match_id);
    expect(screen.getByTestId("pager-next")).toBeDisabled();
  });

  it("a new day starts on its first page", async () => {
    const day = busiest();
    renderAt(`${BASE}/schedule?day=${day.day}`);
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(shownRows()[0]).toBe(day.matches[2].match_id);
    fireEvent.click(screen.getByTestId("day-next"));
    const next = scheduleDays(WORLDS_PRE.state, null).find((d) => d.day > day.day)!;
    // The outgoing board leaves first.
    await waitFor(() => expect(screen.getAllByTestId("day-board")).toHaveLength(1));
    expect(screen.getByTestId("day-board")).toHaveAttribute("data-day", next.day);
    expect(shownRows()[0]).toBe(next.matches[0].match_id);
  });
});

describe("Teams pages (UX4)", () => {
  it("the phone grid pages every team, and a linked team opens on its page", async () => {
    renderAt(`${BASE}/teams?team=FUR`, false);
    const pager = screen.getByTestId("team-pages");
    // Two rows of the grid per page; FUR is the last team of the field.
    expect(within(pager).getAllByTestId("team-tile").map((t) => t.getAttribute("data-team"))).toContain("FUR");
    expect(within(pager).getByTestId("pager-next")).toBeDisabled();
    fireEvent.click(within(pager).getByTestId("pager-prev"));
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(within(screen.getByTestId("team-pages")).queryAllByTestId("team-tile").map((t) => t.getAttribute("data-team"))).not.toContain("FUR");
  });
});
