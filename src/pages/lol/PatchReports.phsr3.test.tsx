/**
 * PHSR3 on the real Patch Hub page: the condensed Summoner's Rift navigator
 * beside the full section nav, over the real loader. Two data sets: a
 * synthetic SR patch (every kind of section, so every destination exists) and
 * the frozen real corpus (26.10–26.19) for deep links and Catch Up.
 *
 * jsdom cannot scroll or lay out, so what is asserted here is contract:
 * destinations resolve to real ids, filters never leave dead links, the
 * router/deep-link landing (PH4-A) still works with the navigator mounted, and
 * Catch Up inherits nothing. Geometry and native fragment/Back behaviour are
 * certified in a real browser (see the PHSR3 handoff).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { createBackend, installFetch, type FakeBackend } from "@/lib/patch-impact-loader/test-support";
import { CORPUS_RAW, corpusReports } from "@/lib/patch-catchup/test-support";
import {
  createBackend as createCatchUpBackend,
  installFetch as installCatchUpFetch,
} from "@/lib/patch-catchup-loader/test-support";
import { queryClient as appQueryClient } from "@/lib/query-client";
import { SR_CARDS, srDetail } from "@/lib/patch-reports/sr-test-fixtures";
import type { PatchReportCard } from "@/lib/patch-reports/api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import PatchReports from "./PatchReports";

const VI = "s-patch-champions__e-champion-vi";
const VI_AD = `${VI}__g-base-stats__c-attack-damage`;
const DRAVEN = "s-patch-champions__e-champion-draven";
const DRAVEN_AD = `${DRAVEN}__g-base-stats__c-attack-damage`;

const scrolled: string[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.id);
  };
});

const padding = () => document.documentElement.style.getPropertyValue("scroll-padding-top");
const stickyNav = () => screen.queryByTestId("patch-hub-sticky-nav");
const stickyLinks = () => [...(stickyNav()?.querySelectorAll("a") ?? [])];
const stickyHrefs = () => stickyLinks().map((a) => a.getAttribute("href"));
const labelOf = (a: Element) => a.getAttribute("aria-label") ?? a.textContent;

type Probe = { location?: Location; navigate?: NavigateFunction };
const LocationProbe = ({ probe }: { probe: Probe }) => {
  probe.location = useLocation();
  probe.navigate = useNavigate();
  return null;
};

function renderHub(entry: string, backend: FakeBackend) {
  installFetch(backend);
  return mountHub(entry);
}

function mountHub(entry: string) {
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const probe: Probe = {};
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
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
  return { probe, ...utils };
}

const srBackend = (cards: PatchReportCard[] = SR_CARDS) =>
  createBackend([srDetail(cards)], [], ["26.19"]);
const corpusBackend = () => createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());

beforeEach(() => {
  scrolled.length = 0;
  localStorage.clear();
  toast.success.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the navigator on the report page", () => {
  it("is mounted next to the full section nav and lists the SR destinations (Champions, Buffs, Nerfs, Adjustments, Items, Runes, Systems, Top)", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    expect(screen.getByTestId("patch-hub-section-nav")).toBeInTheDocument();
    expect(stickyLinks().map(labelOf)).toEqual(["Champions", "Buffs1", "Nerfs2", "Adjustments1", "Items", "Runes", "Systems", "Back to top"]);
  });

  it("Arena and ARAM: Mayhem stay in the full nav only", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    const full = within(screen.getByTestId("patch-hub-section-nav"));
    expect(full.getByRole("link", { name: /Arena/ })).toBeInTheDocument();
    expect(full.getByRole("link", { name: /ARAM/ })).toBeInTheDocument();
    expect(stickyNav()!.textContent).not.toMatch(/Arena|ARAM/);
  });

  it("every destination resolves to exactly one element on the page, and Top lands on the masthead", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    for (const href of stickyHrefs()) {
      const id = href!.slice(1);
      expect(document.querySelectorAll(`[id="${id}"]`), id).toHaveLength(1);
    }
    expect(stickyHrefs().at(-1)).toBe("#patch-hub");
    expect(document.getElementById("patch-hub")).toBe(screen.getByTestId("patch-hub-masthead"));
  });

  it("each destination is the same anchor the full nav uses (sticky and full nav never disagree)", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    const full = new Set(
      [...screen.getByTestId("patch-hub-section-nav").querySelectorAll("a")].map((a) => a.getAttribute("href")),
    );
    for (const href of stickyHrefs().filter((h) => h !== "#patch-hub")) expect(full.has(href), href!).toBe(true);
  });

  it("introduces no duplicate DOM ids (masthead, sentinel, holder included)", async () => {
    const { container } = renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts hidden at the top of the page", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    expect(stickyNav()).toHaveAttribute("data-state", "hidden");
    expect(screen.queryByRole("navigation", { name: "Main game sections" })).toBeNull();
  });

  it("is not mounted before the report has loaded", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    expect(stickyNav()).toBeNull();
    await screen.findAllByTestId("patch-hub-section");
    expect(stickyNav()).not.toBeNull();
  });
});

describe("search and filters (spec 14)", () => {
  const search = (value: string) => fireEvent.change(screen.getByLabelText("Search changes"), { target: { value } });
  const resolve = () => stickyHrefs().forEach((h) => expect(document.getElementById(h!.slice(1)), h!).not.toBeNull());

  it("search 'Zed' leaves Champions › Nerfs only: no Items / Runes / Systems / Buffs / Adjustments links", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    search("Zed");
    expect(stickyLinks().map(labelOf)).toEqual(["Champions", "Nerfs1", "Back to top"]);
    resolve();
  });

  it("search for a system entity leaves Systems only", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    search("Baron");
    expect(stickyLinks().map(labelOf)).toEqual(["Systems", "Back to top"]);
    resolve();
  });

  it("the entity-type filter narrows the strip the same way", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.change(screen.getByLabelText("Filter by entity type"), { target: { value: "item" } });
    expect(stickyLinks().map(labelOf)).toEqual(["Items", "Back to top"]);
    resolve();
    fireEvent.change(screen.getByLabelText("Filter by entity type"), { target: { value: "champion" } });
    expect(stickyLinks().map(labelOf)).toEqual(["Champions", "Buffs1", "Nerfs2", "Adjustments1", "Back to top"]);
    resolve();
  });

  it("the status filter narrows the strip too", async () => {
    const cards = SR_CARDS.map((c) => ({ ...c, aggregate_status: c.entity_name === "Doran's Blade" ? ("pending" as const) : c.aggregate_status }));
    renderHub("/lol/patch-reports?patch=26.19", srBackend(cards));
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.change(screen.getByLabelText("Filter by Mogzy status"), { target: { value: "pending" } });
    expect(stickyLinks().map(labelOf)).toEqual(["Items", "Back to top"]);
    resolve();
  });

  it("when only an Arena entity matches there is no sticky strip, no sentinel and no scroll-padding", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    expect(padding()).not.toBe("");
    search("Augment");
    expect(stickyNav()).toBeNull();
    expect(screen.queryByTestId("patch-hub-sticky-sentinel")).toBeNull();
    expect(padding()).toBe("");
    expect(screen.getByTestId("patch-hub-section-nav")).toBeInTheDocument();
  });

  it("clearing the search restores every destination and the scroll-padding", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    search("Augment");
    search("");
    expect(stickyLinks()).toHaveLength(8);
    expect(padding()).not.toBe("");
  });

  it("no matches at all: no strip", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    search("zzzz-no-such-entity");
    expect(stickyNav()).toBeNull();
    expect(screen.getByText("No changes match the current filters.")).toBeInTheDocument();
  });
});

describe("report-only scroll offset (specs 9, 20)", () => {
  it("is applied while a report is shown and removed when the page unmounts", async () => {
    expect(padding()).toBe("");
    const { unmount } = renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    expect(padding()).toContain("--app-header-h");
    unmount();
    expect(padding()).toBe("");
  });

  it("anchored page chrome carries its own scroll margin (masthead and the status notice)", async () => {
    renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    expect(screen.getByTestId("patch-hub-masthead")).toHaveClass("scroll-mt-24");
    expect(document.getElementById("patch-data-status")).toHaveClass("scroll-mt-24");
  });
});

describe("deep links with the navigator mounted (PH4-A, specs 10–12)", () => {
  it("cold load lands on the exact line once the report arrives", async () => {
    renderHub(`/lol/patch-reports?patch=26.19#${VI_AD}`, corpusBackend());
    await waitFor(() => expect(scrolled[0]).toBe(VI_AD));
    expect(stickyNav()).not.toBeNull();
  });

  it("a cached report follows a new hash, and Back returns to the previous one", async () => {
    const backend = corpusBackend();
    const { probe } = renderHub(`/lol/patch-reports?patch=26.19#${VI}`, backend);
    await waitFor(() => expect(scrolled[0]).toBe(VI));
    const requests = () => [...backend.calls.values()].reduce((a, b) => a + b, 0);
    const before = requests();

    scrolled.length = 0;
    await act(async () => probe.navigate!(`/lol/patch-reports?patch=26.19#${DRAVEN}`));
    await waitFor(() => expect(scrolled.at(-1)).toBe(DRAVEN));
    await act(async () => probe.navigate!(`/lol/patch-reports?patch=26.19#${DRAVEN_AD}`));
    await waitFor(() => expect(scrolled.at(-1)).toBe(DRAVEN_AD));

    scrolled.length = 0;
    await act(async () => probe.navigate!(-1));
    expect(probe.location!.hash).toBe(`#${DRAVEN}`);
    await waitFor(() => expect(scrolled.at(-1)).toBe(DRAVEN));
    await act(async () => probe.navigate!(-1));
    expect(probe.location!.hash).toBe(`#${VI}`);
    await waitFor(() => expect(scrolled.at(-1)).toBe(VI));
    expect(requests()).toBe(before);
    expect(stickyNav()).not.toBeNull();
  });

  it("the navigator's own destinations land through the same router path (section, bucket and Top hashes)", async () => {
    const backend = srBackend();
    const { probe } = renderHub("/lol/patch-reports?patch=26.19", backend);
    await screen.findAllByTestId("patch-hub-section");
    for (const href of stickyHrefs()) {
      scrolled.length = 0;
      await act(async () => probe.navigate!({ search: "?patch=26.19", hash: href! }));
      await waitFor(() => expect(scrolled.at(-1)).toBe(href!.slice(1)));
      expect(probe.location!.hash).toBe(href);
    }
  });

  it("an exact line that is gone falls back to its group, then the entity; the URL is never rewritten", async () => {
    const { probe } = renderHub(`/lol/patch-reports?patch=26.19#${VI}__g-base-stats__c-renamed-by-riot`, corpusBackend());
    await waitFor(() => expect(scrolled[0]).toBe(`${VI}__g-base-stats`));
    expect(probe.location!.hash).toBe(`#${VI}__g-base-stats__c-renamed-by-riot`);
    scrolled.length = 0;
    await act(async () => probe.navigate!(`/lol/patch-reports?patch=26.19#${VI}__g-q__c-damage`));
    await waitFor(() => expect(scrolled[0]).toBe(VI));
  });

  it("an unknown entity still scrolls nowhere", async () => {
    renderHub("/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-nobody__g-x__c-y", corpusBackend());
    await screen.findAllByTestId("patch-hub-section");
    await act(async () => {});
    expect(scrolled).toEqual([]);
  });

  it("the navigator never writes to the URL on its own", async () => {
    const { probe } = renderHub("/lol/patch-reports?patch=26.19", srBackend());
    await screen.findAllByTestId("patch-hub-section");
    act(() => {
      fireEvent.scroll(window);
    });
    expect(probe.location!.hash).toBe("");
    expect(probe.location!.search).toBe("?patch=26.19");
  });
});

describe("Catch Up is unaffected (spec 13)", () => {
  beforeEach(() => {
    installCatchUpFetch(createCatchUpBackend(corpusReports(), CORPUS_RAW.listedVersions));
  });
  const ready = () => screen.findByTestId("catchup-totals", undefined, { timeout: 5000 });
  /** Entering Catch Up with no baseline idles on the picker: the view is up, there are no totals yet. */
  const inCatchUp = () => screen.findByTestId("patch-catchup-view");

  it("a direct Catch Up entry has no sticky navigator, no sentinel and no scroll-padding", async () => {
    mountHub("/lol/patch-reports?since=26.14");
    await ready();
    expect(stickyNav()).toBeNull();
    expect(screen.queryByTestId("patch-hub-sticky-sentinel")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Main game sections" })).toBeNull();
    expect(padding()).toBe("");
  });

  it("switching Report → Catch Up removes the navigator and its scroll-padding; switching back restores both", async () => {
    mountHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    expect(stickyNav()).not.toBeNull();
    expect(padding()).not.toBe("");

    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    await inCatchUp();
    expect(stickyNav()).toBeNull();
    expect(padding()).toBe("");

    fireEvent.click(screen.getByRole("link", { name: "Patch Report" }));
    await screen.findAllByTestId("patch-hub-section");
    expect(stickyNav()).not.toBeNull();
    expect(padding()).not.toBe("");
  });

  it("Back from Catch Up to the report restores the navigator; Back again leaves Catch Up clean", async () => {
    const { probe } = mountHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.click(screen.getByRole("link", { name: "Catch Up" }));
    await inCatchUp();
    await act(async () => probe.navigate!(-1));
    await screen.findAllByTestId("patch-hub-section");
    expect(stickyNav()).not.toBeNull();
    await act(async () => probe.navigate!(1));
    await inCatchUp();
    expect(stickyNav()).toBeNull();
    expect(padding()).toBe("");
  });

  it("changing the baseline inside Catch Up keeps it clean", async () => {
    const { probe } = mountHub("/lol/patch-reports?since=26.14");
    await ready();
    await act(async () => probe.navigate!("/lol/patch-reports?since=26.16"));
    await ready();
    expect(stickyNav()).toBeNull();
    expect(padding()).toBe("");
  });

  it("a shared Catch Up deep link (since + #cu- anchor) stays clean and still lands", async () => {
    mountHub("/lol/patch-reports?since=26.14#cu-sr-champions-bel-veth");
    await ready();
    await waitFor(() => expect(scrolled).toContain("cu-sr-champions-bel-veth"));
    expect(stickyNav()).toBeNull();
    expect(padding()).toBe("");
  });
});
