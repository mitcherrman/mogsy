/**
 * PH3-D Catch-Up page tests: routing/history, loader gating, rendering over the
 * production corpus, coverage/retry, search/disclosure, deep links and the
 * cached-report hash-scroll fix. The REAL loader and accessors run against a
 * fake backend that stubs `fetch`, so every count below is an HTTP request.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type Location,
  type NavigateFunction,
  type To,
} from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCatchUpReport, type CatchUpReport } from "@/lib/patch-catchup";
import { CORPUS_RAW, corpusReports } from "@/lib/patch-catchup/test-support";
import { createBackend, deferred, installFetch, type FakeBackend } from "@/lib/patch-catchup-loader/test-support";
import { hasExactValues } from "@/lib/patch-reports/report-structure";
import { queryClient as appQueryClient } from "@/lib/query-client";
import { REMEMBERED_BASELINE_KEY } from "@/components/patch-catchup/remembered-baseline";

const loaderSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/hooks/usePatchCatchUpLoader", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/usePatchCatchUpLoader")>();
  return {
    ...real,
    usePatchCatchUpLoader: (...args: Parameters<typeof real.usePatchCatchUpLoader>) => {
      loaderSpy.calls += 1;
      return real.usePatchCatchUpLoader(...args);
    },
  };
});

import PatchReports from "./PatchReports";

const LISTED = CORPUS_RAW.listedVersions; // newest first, as /api/patch-reports returns it
const REPORTS = corpusReports();
const RANGE_14 = ["26.15", "26.16", "26.17", "26.18", "26.19"];

function domain(since: string, reports = REPORTS): CatchUpReport {
  const r = buildCatchUpReport({ reports, sincePatch: since, throughPatch: "26.19", listedVersions: LISTED });
  if (r.ok === false) throw new Error(r.detail);
  return r.report;
}

const scrolled: string[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.id);
  };
});

let backend: FakeBackend;
beforeEach(() => {
  backend = createBackend(REPORTS, LISTED);
  installFetch(backend);
  scrolled.length = 0;
  loaderSpy.calls = 0;
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Probe = { location?: Location; action?: string; navigate?: NavigateFunction };

/** Records the router location and the last history action (PUSH / REPLACE / POP). */
const LocationProbe = ({ probe }: { probe: Probe }) => {
  probe.location = useLocation();
  probe.action = useNavigationType();
  probe.navigate = useNavigate();
  return null;
};

function renderHub(url: string) {
  // The app's own QueryClient defaults (60 s freshness, no focus refetch).
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const probe: Probe = {};
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/lol/patch-reports"
            element={
              <>
                <PatchReports />
                <LocationProbe probe={probe} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const router = {
    state: {
      get location() {
        return probe.location as Location;
      },
      get historyAction() {
        return probe.action;
      },
    },
    navigate: async (to: To | number) => {
      if (typeof to === "number") probe.navigate!(to);
      else probe.navigate!(to);
    },
  };
  return { router, client, ...utils };
}

const loc = (router: ReturnType<typeof renderHub>["router"]) => router.state.location;
const requests = () => backend.log.filter((l) => l.startsWith("GET "));
const reportRequests = () => requests().filter((l) => l !== "GET /api/patch-reports");

async function ready() {
  return screen.findByTestId("catchup-totals", undefined, { timeout: 5000 });
}

function section(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-testid="catchup-section"][data-section-key="${key}"]`);
  if (!el) throw new Error(`no section ${key}`);
  return el;
}

function openAllCollapsed() {
  for (const details of document.querySelectorAll<HTMLDetailsElement>('[data-testid="catchup-section-disclosure"]')) {
    if (!details.open) {
      act(() => {
        details.open = true;
        details.dispatchEvent(new Event("toggle"));
      });
    }
  }
}

const headingLevels = () => [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
const expectNoSkips = () => {
  const levels = headingLevels();
  levels.forEach((level, i) => {
    if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
  });
};

/* -------------------------------------------------------------------------- */

describe("normal Patch Report is unchanged", () => {
  it("makes exactly the pre-PH3-D requests and never mounts the Catch-Up loader", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    expect(requests()).toEqual(["GET /api/patch-reports", "GET /api/patch-reports/26.19"]);
    expect(loaderSpy.calls).toBe(0);
    expect(screen.queryByTestId("patch-catchup-view")).toBeNull();
    expect(screen.getByRole("button", { name: "26.19" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: /Patch Report/ })).toBeTruthy();
  });

  it("does not auto-enter Catch Up because a baseline is remembered", async () => {
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "26.14");
    const { router } = renderHub("/lol/patch-reports");
    await screen.findAllByTestId("patch-hub-section");
    expect(loc(router).search).toBe("");
    expect(loaderSpy.calls).toBe(0);
    expect(reportRequests()).toEqual(["GET /api/patch-reports/26.19"]);
  });

  it("shows the compact view switch with the current view marked", async () => {
    renderHub("/lol/patch-reports?patch=26.18");
    const nav = await screen.findByRole("navigation", { name: "Patch Hub views" });
    expect(within(nav).getByRole("link", { name: "Patch Report" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Catch Up" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("entering and leaving Catch Up (history)", () => {
  it("enters with push, drops patch, idles without a baseline and fetches nothing new", async () => {
    const { router } = renderHub("/lol/patch-reports?patch=26.17");
    await screen.findAllByTestId("patch-hub-section");
    const before = requests().length;
    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    await screen.findByTestId("patch-catchup-view");
    expect(loc(router).search).toBe("?view=catchup");
    expect(router.state.historyAction).toBe("PUSH");
    expect(requests().length).toBe(before);
    const select = screen.getByLabelText("I last knew patch");
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect((select as HTMLSelectElement).value).toBe("");
    // Patch Report chrome is gone; one control set only.
    expect(screen.queryByRole("navigation", { name: "Patch selector" })).toBeNull();
    expect(screen.queryByLabelText("Search changes")).toBeNull();
  });

  it("changing the baseline replaces history, stores it, and loads exactly (X, latest]", async () => {
    const { router } = renderHub("/lol/patch-reports?patch=26.17");
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    const select = await screen.findByLabelText("I last knew patch");
    const logBefore = backend.log.length;
    fireEvent.change(select, { target: { value: "26.14" } });
    await ready();
    expect(loc(router).search).toBe("?since=26.14");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(localStorage.getItem(REMEMBERED_BASELINE_KEY)).toBe("26.14");
    // 26.17 was already cached by the report view; X (26.14) is never requested.
    expect(backend.log.slice(logBefore).sort()).toEqual(
      ["26.15", "26.16", "26.18", "26.19"].map((v) => `GET /api/patch-reports/${v}`),
    );

    // Leaving returns to the report the reader came from (push), without `since`.
    fireEvent.click(screen.getByRole("link", { name: "Patch Report" }));
    await screen.findAllByTestId("patch-hub-section");
    expect(loc(router).search).toBe("?patch=26.17");
    expect(router.state.historyAction).toBe("PUSH");
    await waitFor(() => expect(document.activeElement?.id).toBe("patch-report-heading"));

    // Back returns to Catch Up at the same baseline (the idle entry was replaced).
    await act(() => router.navigate(-1));
    expect(loc(router).search).toBe("?since=26.14");
    await ready();
  });

  it("enters straight at a remembered baseline and can forget it", async () => {
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "26.14");
    const { router } = renderHub("/lol/patch-reports?patch=26.18");
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    await ready();
    expect(loc(router).search).toBe("?since=26.14");
    expect(router.state.historyAction).toBe("PUSH");
    expect(screen.getByTestId("catchup-remembered")).toHaveTextContent("Remembered from your last catch-up");
    fireEvent.click(screen.getByRole("button", { name: "Forget" }));
    expect(localStorage.getItem(REMEMBERED_BASELINE_KEY)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("catchup-remembered")).toBeNull());
    expect(loc(router).search).toBe("?since=26.14");
  });

  it("ignores an unlisted remembered baseline", async () => {
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "26.02");
    const { router } = renderHub("/lol/patch-reports");
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    await screen.findByTestId("patch-catchup-view");
    expect(loc(router).search).toBe("?view=catchup");
  });

  it("URL since wins over the remembered baseline and is not written by opening a link", async () => {
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "26.10");
    const { router } = renderHub("/lol/patch-reports?since=26.17");
    await ready();
    expect(loc(router).search).toBe("?since=26.17");
    expect(localStorage.getItem(REMEMBERED_BASELINE_KEY)).toBe("26.10");
    expect(screen.queryByTestId("catchup-remembered")).toBeNull();
  });

  it("removes patch and through when they come with since (replace)", async () => {
    const { router } = renderHub("/lol/patch-reports?patch=26.19&since=26.14&through=26.16");
    await ready();
    expect(loc(router).search).toBe("?since=26.14");
    expect(router.state.historyAction).toBe("REPLACE");
    // through is reserved: the range still ends at the latest patch.
    expect(screen.getByText(/Showing changes in 26.15 – 26.19/)).toBeTruthy();
  });
});

describe("Catch Up states", () => {
  it("idle: picker only, no report requests", async () => {
    renderHub("/lol/patch-reports?view=catchup");
    await screen.findByTestId("patch-catchup-view");
    await waitFor(() => expect(requests()).toEqual(["GET /api/patch-reports"]));
    expect(screen.getByText(/Pick the last patch you know/)).toBeTruthy();
  });

  it("loading: progress text and aria-busy while a report is pending", async () => {
    const gate = deferred();
    backend.gates.set("26.17", gate);
    renderHub("/lol/patch-reports?since=26.14");
    await screen.findByText("Loading 4 of 5 patches…", { selector: "p:not([aria-live])" });
    expect(screen.getByTestId("catchup-results").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("catchup-section")).toBeNull();
    gate.release();
    await ready();
    expect(screen.getByTestId("catchup-results").getAttribute("aria-busy")).toBe("false");
  });

  it("X excluded, latest implicit: range line, totals and network accounting", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    expect(screen.getByText(/Showing changes in 26.15 – 26.19/)).toBeTruthy();
    expect(screen.getByText(/26.14 itself is not included\./)).toBeTruthy();
    expect(requests().sort()).toEqual(
      ["GET /api/patch-reports", ...RANGE_14.map((v) => `GET /api/patch-reports/${v}`)].sort(),
    );
    expect(document.querySelector('[data-testid="catchup-step"][data-patch="26.14"]')).toBeNull();
    expect(screen.getByLabelText("I last knew patch")).toHaveValue("26.14");
  });

  it("up to date: since = latest says no later patches", async () => {
    renderHub("/lol/patch-reports?since=26.19");
    expect(await screen.findByText("No later patches are available yet.")).toBeTruthy();
    expect(reportRequests()).toEqual([]);
  });

  it("invalid baseline: names it, renders nothing misleading", async () => {
    renderHub("/lol/patch-reports?since=banana");
    expect(await screen.findByTestId("catchup-failure")).toHaveTextContent("Mogzy doesn't have a report called “banana”.");
    expect(screen.getByLabelText("I last knew patch")).toHaveValue("");
    expect(screen.queryByTestId("catchup-section")).toBeNull();
  });

  it("all reports failed: loader failure with Retry, never an empty report", async () => {
    RANGE_14.forEach((v) => backend.failing.add(v));
    renderHub("/lol/patch-reports?since=26.14");
    const failure = await screen.findByTestId("catchup-failure");
    expect(failure).toHaveTextContent("Couldn't load patches 26.15 – 26.19.");
    expect(failure).toHaveTextContent("This isn't “nothing changed”");
    expect(within(failure).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByTestId("catchup-section")).toBeNull();
    expect(screen.queryByText(/No Catch-Up changes/)).toBeNull();
  });
});

describe("complete render over the production corpus (since 26.14)", () => {
  it("renders every Riot line exactly once with Riot's exact values", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    openAllCollapsed();
    const report = domain("26.14");
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="catchup-line"]')];
    const ids = rows.map((r) => r.dataset.lineId);
    expect(ids.length).toBe(report.lines.length);
    expect(new Set(ids)).toEqual(new Set(report.lines.map((l) => l.id)));
    const byId = new Map(rows.map((r) => [r.dataset.lineId, r]));
    for (const line of report.lines) {
      const text = byId.get(line.id)!.textContent ?? "";
      const { change } = line;
      if (hasExactValues(change)) {
        if (change.before_raw?.trim()) expect(text).toContain(change.before_raw.trim());
        if (change.after_raw?.trim()) expect(text).toContain(change.after_raw.trim());
      } else if (change.detail_text?.trim()) {
        expect(text).toContain(change.detail_text.trim());
      }
      if (change.property_name?.trim()) expect(text).toContain(change.property_name.trim());
    }
  });

  it("orders sections (SR first, then Riot order) and entries alphabetically with chronological steps", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const keys = [...document.querySelectorAll<HTMLElement>('[data-testid="catchup-section"]')].map((s) => s.dataset.sectionKey);
    expect(keys).toEqual([
      "patch-champions",
      "patch-items",
      "patch-runes",
      "patch-aegis-of-valor",
      "patch-apex-duo-restrictions",
      "patch-hall-of-legends",
      "patch-systems",
      "patch-classic",
      "patch-aram-mayhem",
      "patch-arena",
    ]);
    const names = within(section("patch-champions"))
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent ?? "");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
    const belveth = document.getElementById("cu-sr-champions-bel-veth")!;
    expect([...belveth.querySelectorAll<HTMLElement>('[data-testid="catchup-step"]')].map((s) => s.dataset.patch)).toEqual([
      "26.15",
      "26.16",
    ]);
  });

  it("shows Mogzy notes only on the PH3-B chains, on the final step", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const notes = screen.getAllByTestId("catchup-continuity-note");
    expect(notes.map((n) => n.querySelector("p")!.textContent)).toEqual([
      "Mogzy note: MogzyBack to 105, its value before 26.15",
      "Mogzy note: MogzyBack to 400, its value before 26.16",
    ]);
    const report = domain("26.14");
    for (const chain of report.continuity.chains) {
      const last = chain.steps[chain.steps.length - 1].line.id;
      const row = document.querySelector(`[data-line-id="${CSS.escape(last)}"]`)!;
      expect(within(row as HTMLElement).getByTestId("catchup-continuity-note").dataset.chainId).toBe(chain.id);
      const first = document.querySelector(`[data-line-id="${CSS.escape(chain.steps[0].line.id)}"]`)!;
      expect(within(first as HTMLElement).getByTestId("catchup-trail-dot")).toBeTruthy();
    }
    expect(screen.getAllByTestId("catchup-continuity-chip").map((c) => c.textContent)).toEqual([
      "◆Mogzy: Health Growth back to 105",
      "◆Mogzy: Health back to 400",
    ]);
    expect(screen.getAllByTestId("catchup-trail-dot")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/\b(revert\w*|undone|rolled back)\b/i);
    // Alias/exact provenance only inside How?.
    expect(document.body.textContent?.match(/Same parameter in every step/g)).toHaveLength(2);
    expect(screen.getAllByTestId("catchup-continuity-how").every((d) => !(d as HTMLDetailsElement).open)).toBe(true);
  });

  it("no notes anywhere for one-patch ranges, and no 'no trends' copy", async () => {
    renderHub("/lol/patch-reports?since=26.18");
    await ready();
    expect(screen.queryAllByTestId("catchup-continuity-note")).toHaveLength(0);
    expect(screen.queryAllByTestId("catchup-continuity-chip")).toHaveLength(0);
    // Only the footer explainer may mention trends, and only to say a missing note is NOT "no trend".
    const view = screen.getByTestId("patch-catchup-view").cloneNode(true) as HTMLElement;
    view.querySelector("footer")!.remove();
    expect(view.textContent).not.toMatch(/trend/i);
    expect(screen.getByText(/This is patch 26.19 grouped by entry/)).toBeTruthy();
  });

  it("collapses >40-line non-chainable sections (body unmounted) and keeps ≤40 sections open", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    for (const key of ["patch-classic", "patch-aram-mayhem", "patch-arena"]) {
      const s = section(key);
      expect(s.dataset.collapsible).toBe("true");
      const details = s.querySelector("details")!;
      expect(details.open).toBe(false);
      expect(s.querySelector('[data-testid="catchup-entry"]')).toBeNull();
      // The summary keeps Riot's name and count and says Show.
      const summary = s.querySelector("summary")!;
      expect(within(summary).getByRole("heading", { level: 3 })).toBeTruthy();
      expect(summary.textContent).toMatch(/changes in \d+ entries/);
      expect(summary.textContent).toMatch(/Show/);
    }
    for (const key of ["patch-systems", "patch-hall-of-legends", "patch-runes", "patch-champions"]) {
      expect(section(key).dataset.collapsible).toBe("false");
      expect(section(key).querySelector('[data-testid="catchup-entry"]')).not.toBeNull();
    }
    expect(within(section("patch-arena")).getByRole("heading", { level: 3 }).textContent).toMatch(/^Arena/);
  });

  it("opening/collapsing sections and searching make 0 requests", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const before = backend.log.length;
    openAllCollapsed();
    fireEvent.change(screen.getByLabelText("Search this catch-up"), { target: { value: "Locke" } });
    fireEvent.change(screen.getByLabelText("Search this catch-up"), { target: { value: "" } });
    expect(backend.log.length).toBe(before);
  }, 30_000);

  it("search auto-opens collapsed sections with matches; SR and mode Locke stay separate", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    fireEvent.change(screen.getByLabelText("Search this catch-up"), { target: { value: "Locke" } });
    await waitFor(() => expect(section("patch-arena").querySelector("details")!.open).toBe(true));
    const hits = [...document.querySelectorAll<HTMLElement>('[data-testid="catchup-entry"]')].map(
      (e) => `${e.closest<HTMLElement>('[data-testid="catchup-section"]')!.dataset.sectionKey}:${e.querySelector("h4")!.textContent}`,
    );
    expect(hits).toEqual([
      "patch-champions:Locke",
      "patch-classic:Innervating Locket",
      "patch-aram-mayhem:Locke",
      "patch-arena:Locke",
    ]);
    expect(screen.getByTestId("catchup-announcement")).toHaveTextContent("4 entries match");
    expectNoSkips();
    // Clearing restores the default collapse state.
    fireEvent.change(screen.getByLabelText("Search this catch-up"), { target: { value: "" } });
    await waitFor(() => expect(section("patch-arena").querySelector("details")!.open).toBe(false));
  });

  it("search with no matches says so", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    fireEvent.change(screen.getByLabelText("Search this catch-up"), { target: { value: "zzzz-nothing" } });
    expect(await screen.findByText("No Catch-Up changes match your search.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(screen.getAllByTestId("catchup-section").length).toBe(10));
  });

  it("has a valid heading outline, labelled controls, and unique ids", async () => {
    const { container } = renderHub("/lol/patch-reports?since=26.14");
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Patch Hub" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Catch Up" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 5, name: "Patch 26.15" }).length).toBeGreaterThan(1);
    expectNoSkips();
    expect(screen.getByRole("combobox", { name: "I last knew patch" }).tagName).toBe("SELECT");
    expect(screen.getByRole("searchbox", { name: "Search this catch-up" })).toBeTruthy();
    openAllCollapsed();
    expectNoSkips();
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Line links carry meaningful names.
    const link = screen.getAllByTestId("catchup-line-link")[0];
    expect(link.getAttribute("aria-label")).toMatch(/^View Patch 26\.\d+ change: /);
  });

  it("uses wrap-safe, non-scrolling markup for mobile", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    openAllCollapsed();
    const view = screen.getByTestId("patch-catchup-view");
    expect(view.querySelector('[class*="overflow-x"]')).toBeNull();
    expect(view.querySelector('[class*="min-w-["]')).toBeNull();
    // Entry names and values break anywhere instead of overflowing.
    for (const h of view.querySelectorAll("h4")) expect(h.className).toContain("[overflow-wrap:anywhere]");
    for (const v of view.querySelectorAll('[data-testid="patch-report-values"]')) {
      expect(v.className).toContain("flex-wrap");
      expect(v.className).toContain("[overflow-wrap:anywhere]");
    }
    // Steps stack vertically (a list), never a horizontal timeline.
    for (const list of view.querySelectorAll('[data-testid="catchup-entry"] > ol')) {
      expect(list.className).toContain("space-y-4");
    }
  });
});

describe("incomplete coverage and retry", () => {
  it("names the failed patch, keeps loaded lines, hides every Mogzy note, and retries only it", async () => {
    backend.failing.add("26.17");
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const banner = screen.getByTestId("catchup-coverage");
    expect(banner).toHaveTextContent("Patch 26.17 didn't load.");
    expect(banner).not.toHaveTextContent(/nothing changed/i);
    expect(screen.queryAllByTestId("catchup-continuity-note")).toHaveLength(0);
    expect(screen.queryAllByTestId("catchup-continuity-chip")).toHaveLength(0);
    expect(screen.queryAllByTestId("catchup-trail-dot")).toHaveLength(0);
    openAllCollapsed();
    const loaded = domain("26.14", REPORTS.filter((r) => r.patch_version !== "26.17"));
    expect(screen.getAllByTestId("catchup-line")).toHaveLength(loaded.lines.length);
    expect(document.querySelector('[data-testid="catchup-step"][data-patch="26.17"]')).toBeNull();

    backend.failing.delete("26.17");
    const before = backend.log.length;
    fireEvent.click(within(banner).getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(screen.queryByTestId("catchup-coverage")).toBeNull());
    expect(backend.log.slice(before)).toEqual(["GET /api/patch-reports/26.17"]);
    expect(screen.getAllByTestId("catchup-continuity-note")).toHaveLength(2);
  });
});

describe("deep links and the cached-report scroll fix", () => {
  const sunderedSky17 = () =>
    domain("26.14").lines.find((l) => l.entityName === "Sundered Sky" && l.patch === "26.17" && l.change.property_name === "Health")!;

  it("links every line to its canonical Patch Report anchor", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const line = sunderedSky17();
    const row = document.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(line.id)}"]`)!;
    expect(within(row).getByTestId("catchup-line-link").getAttribute("href")).toBe(
      `/lol/patch-reports?patch=26.17#${line.target.change}`,
    );
    const entry = document.getElementById("cu-sr-items-sundered-sky")!;
    const appearances = domain("26.14").entities.find((e) => e.name === "Sundered Sky")!.appearances;
    expect(within(entry).getAllByTestId("catchup-step-link").map((a) => a.getAttribute("href"))).toEqual(
      appearances.map((a) => `/lol/patch-reports?patch=${a.patch}#${a.entityAnchor}`),
    );
    expect(appearances.map((a) => a.patch)).toEqual(["26.16", "26.17"]);
  });

  it("navigates to an already-cached report, scrolls with 0 requests, and Back restores Catch Up", async () => {
    const { router } = renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const line = sunderedSky17();
    const row = document.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(line.id)}"]`)!;
    const before = backend.log.length;
    fireEvent.click(within(row).getByTestId("catchup-line-link"), { button: 0 });
    await screen.findAllByTestId("patch-hub-section");
    expect(loc(router).search).toBe("?patch=26.17");
    expect(loc(router).hash).toBe(`#${line.target.change}`);
    expect(router.state.historyAction).toBe("PUSH");
    await waitFor(() => expect(scrolled).toContain(line.target.change));
    expect(document.getElementById(line.target.change)).not.toBeNull();
    expect(backend.log.length).toBe(before); // fresh in the shared cache: no refetch

    scrolled.length = 0;
    await act(() => router.navigate(-1));
    expect(loc(router).search).toBe("?since=26.14");
    expect(loc(router).hash).toBe("#cu-sr-items-sundered-sky");
    await waitFor(() => expect(scrolled).toContain("cu-sr-items-sundered-sky"));
    expect(backend.log.length).toBe(before);
  });

  it("Back to an entry inside a collapsed section opens that section", async () => {
    const { router } = renderHub("/lol/patch-reports?since=26.14");
    await ready();
    openAllCollapsed();
    const arenaEntry = section("patch-arena").querySelector<HTMLElement>('[data-testid="catchup-entry"]')!;
    fireEvent.click(within(arenaEntry).getAllByTestId("catchup-line-link")[0], { button: 0 });
    await screen.findAllByTestId("patch-hub-section");
    scrolled.length = 0;
    await act(() => router.navigate(-1));
    await waitFor(() => expect(scrolled).toContain(arenaEntry.id));
    expect(section("patch-arena").querySelector("details")!.open).toBe(true);
  });

  it("cold load ?patch=26.19#anchor scrolls once the report arrives", async () => {
    const target = domain("26.18").lines[0].target.change;
    const gate = deferred();
    backend.gates.set("26.19", gate);
    renderHub(`/lol/patch-reports?patch=26.19#${target}`);
    await screen.findByText("Loading patch 26.19…");
    expect(scrolled).toEqual([]);
    gate.release();
    await waitFor(() => expect(scrolled).toEqual([target]));
  });

  it("a new hash on the same cached report follows the new target", async () => {
    const lines = domain("26.18").lines;
    const { router } = renderHub(`/lol/patch-reports?patch=26.19#${lines[0].target.change}`);
    await waitFor(() => expect(scrolled).toEqual([lines[0].target.change]));
    const before = backend.log.length;
    await act(() => router.navigate(`/lol/patch-reports?patch=26.19#${lines[5].target.change}`));
    await waitFor(() => expect(scrolled).toEqual([lines[0].target.change, lines[5].target.change]));
    // The same hash again (a new navigation) scrolls again.
    await act(() => router.navigate(`/lol/patch-reports?patch=26.19#${lines[5].target.change}`));
    await waitFor(() => expect(scrolled).toHaveLength(3));
    expect(backend.log.length).toBe(before);
  });

  it("missing or malformed anchors fail harmlessly", async () => {
    renderHub("/lol/patch-reports?patch=26.19#no-such-anchor");
    await screen.findAllByTestId("patch-hub-section");
    expect(scrolled).toEqual([]);
    const { unmount } = renderHub("/lol/patch-reports?patch=26.19#%E0%A4%A");
    await waitFor(() => expect(screen.getAllByTestId("patch-hub-masthead").length).toBe(2));
    unmount();
  });
});
