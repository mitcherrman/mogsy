/**
 * PH4-C: the champion-only "Open {Champion} in Combat Lab" handoff on the real
 * Patch Report page (real loader and accessors over the frozen production
 * corpus; only `fetch`, the clipboard and the chart width are faked). Items,
 * runes, Arena and system cards the corpus lacks are added as a synthetic
 * report so the page, not just the helper, is shown to fail closed.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChartWidth } from "@/components/patch-impact/graph/test-support";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { report } from "@/lib/patch-impact/fixtures/builders";
import { createBackend, installFetch, type FakeBackend } from "@/lib/patch-impact-loader/test-support";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import { mkCard } from "@/lib/patch-reports/test-fixtures";
import { queryClient as appQueryClient } from "@/lib/query-client";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PatchReports from "./PatchReports";

const MIXED = "26.99";
const mixedCards: PatchReportCard[] = [
  mkCard("Vi", { section_id: "patch-champions" }),
  mkCard("Sundered Sky", { entity_type: "item", section_id: "patch-items", section_title: "Items" }),
  mkCard("Conqueror", { entity_type: "rune", section_id: "patch-runes", section_title: "Runes" }),
  mkCard("Heimerdinger", {
    entity_type: "system",
    section_id: "patch-classic",
    section_title: "Classic",
    mogzy_entity_ref: null,
  }),
  mkCard("Ahri", { entity_type: "system", section_id: "patch-arena", section_title: "Arena" }),
  mkCard("Locke", { mogzy_entity_ref: null }),
];
const mixedReport = { ...report(MIXED, mixedCards), section_titles: ["Champions", "Items", "Runes", "Classic", "Arena"] };

let backend: FakeBackend;
beforeEach(() => {
  backend = createBackend([...CORPUS_REPORTS, mixedReport], CORPUS_STATS, [MIXED, ...[...CORPUS_VERSIONS].reverse()]);
  installFetch(backend);
  stubChartWidth(320);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Probe = { location?: Location };
const LocationProbe = ({ probe }: { probe: Probe }) => {
  probe.location = useLocation();
  return null;
};
const CombatLabStub = () => <div data-testid="combat-lab-stub" />;

function renderHub(entry: string) {
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
          <Route
            path="/combat-lab"
            element={
              <>
                <CombatLabStub />
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

/** The report card an entity's heading belongs to. */
const cardOf = (name: string) =>
  screen.getByRole("heading", { name }).closest<HTMLElement>('[data-testid="patch-report-card"]')!;
const handoffIn = (el: HTMLElement) => within(el).queryAllByTestId("patch-report-combat-lab");

describe("champions: Vi, Draven 26.19; Bel'Veth 26.15", () => {
  it("Vi 26.19 shows 'Open Vi in Combat Lab' once, as the canonical champion-only link", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const links = handoffIn(cardOf("Vi"));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Open Vi in Combat Lab");
    expect(links[0]).toHaveAccessibleName("Open Vi in Combat Lab");
    expect(links[0]).toHaveAttribute("href", "/combat-lab?attacker=vi");
  });

  it("Draven 26.19", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const [link] = handoffIn(cardOf("Draven"));
    expect(link).toHaveTextContent("Open Draven in Combat Lab");
    expect(link).toHaveAttribute("href", "/combat-lab?attacker=draven");
  });

  it("Bel'Veth 26.15", async () => {
    renderHub("/lol/patch-reports?patch=26.15");
    await screen.findAllByTestId("patch-hub-section");
    const [link] = handoffIn(cardOf("Bel'Veth"));
    expect(link).toHaveTextContent("Open Bel'Veth in Combat Lab");
    expect(link).toHaveAttribute("href", "/combat-lab?attacker=belveth");
  });

  it("the page URL is never in the link: no patch, version, level or hash", async () => {
    renderHub("/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage");
    await screen.findAllByTestId("patch-hub-section");
    for (const link of screen.getAllByTestId("patch-report-combat-lab")) {
      expect([...new URL(link.getAttribute("href")!, "https://mogzy.lol").searchParams.keys()]).toEqual(["attacker"]);
      expect(link.getAttribute("href")).toMatch(/^\/combat-lab\?attacker=[a-z0-9-]+$/);
    }
  });
});

describe("once per entity, never per change", () => {
  it("Vi has many change lines (including Passive Shield) but one action; the page has one per eligible entity", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const vi = cardOf("Vi");
    const lines = within(vi).getAllByTestId("patch-report-change");
    expect(lines.length).toBeGreaterThan(1);
    expect(within(vi).getAllByText(/Shield/i).length).toBeGreaterThan(0); // Passive Shield is on this card
    expect(handoffIn(vi)).toHaveLength(1);
    for (const line of lines) expect(within(line).queryByTestId("patch-report-combat-lab")).toBeNull();

    const eligible = CORPUS_REPORTS.find((r) => r.patch_version === "26.19")!.cards.filter(
      (c) => c.entity_type === "champion" && c.section_title === "Champions" && c.mogzy_entity_ref,
    );
    expect(screen.getAllByTestId("patch-report-combat-lab")).toHaveLength(eligible.length);
  });
});

describe("ineligible entities fail closed on the real page", () => {
  it("item, rune, system, Arena and an unmapped champion get no action; the mapped champion in the same report does", async () => {
    renderHub(`/lol/patch-reports?patch=${MIXED}`);
    await screen.findAllByTestId("patch-hub-section");
    expect(handoffIn(cardOf("Vi"))).toHaveLength(1);
    for (const name of ["Sundered Sky", "Conqueror", "Heimerdinger", "Ahri", "Locke"]) {
      expect(handoffIn(cardOf(name)), name).toHaveLength(0);
    }
    expect(screen.getAllByTestId("patch-report-combat-lab")).toHaveLength(1);
  });

  it("an ineligible entity's header carries no empty action wrapper", async () => {
    renderHub(`/lol/patch-reports?patch=${MIXED}`);
    await screen.findAllByTestId("patch-hub-section");
    const header = cardOf("Sundered Sky").querySelector("header")!;
    expect(header.querySelectorAll(".sm\\:w-auto")).toHaveLength(0);
  });
});

describe("coexists with PH4-A and PH4-B", () => {
  it("keeps the entity copy-link beside the action", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const vi = cardOf("Vi");
    const share = within(vi).getByTestId("patch-report-entity-share");
    expect(share).toHaveAccessibleName("Copy link to Vi changes");
    expect(share).toHaveAttribute("href", "/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi");
    expect(handoffIn(vi)).toHaveLength(1);
    fireEvent.click(share, { button: 0 });
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
        "https://mogzy.lol/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi",
      ),
    );
  });

  it.each(["Vi", "Draven"])("%s: Explore still shows the PH4-B graph and the PH4-A change copy-link", async (name) => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const line = within(cardOf(name))
      .getAllByTestId("patch-report-change")
      .find((li) => within(li).queryAllByText("Attack Damage").length > 0)!;
    fireEvent.click(within(line).getByTestId("patch-impact-explore-toggle"));
    await within(line).findByTestId("patch-impact-graph-canvas");
    expect(within(line).getByTestId("patch-impact-graph")).toBeInTheDocument();
    const share = await within(line).findByTestId("patch-impact-share");
    fireEvent.click(share);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
        `https://mogzy.lol/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-${name.toLowerCase()}__g-base-stats__c-attack-damage`,
      ),
    );
    expect(handoffIn(cardOf(name))).toHaveLength(1);
  });
});

describe("the click", () => {
  it("navigates to /combat-lab?attacker=vi with nothing else, and makes no Patch Hub request", async () => {
    const { probe } = renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const before = new Map(backend.calls);
    const fetchMock = vi.mocked(globalThis.fetch);
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(within(cardOf("Vi")).getByTestId("patch-report-combat-lab"), { button: 0 });
    await screen.findByTestId("combat-lab-stub");
    expect(probe.location!.pathname).toBe("/combat-lab");
    expect(probe.location!.search).toBe("?attacker=vi");
    expect(probe.location!.hash).toBe("");
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(new Map(backend.calls)).toEqual(before);
    // Only reads ever happen on this page: no mutating verb was used.
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    }
  });
});
