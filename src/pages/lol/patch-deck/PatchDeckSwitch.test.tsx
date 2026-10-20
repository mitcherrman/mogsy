/**
 * PHD-RELEASE: the List | Deck switch between /lol/patch-reports and
 * /lol/patch-deck on the real 26.20 report. Patch and entity carry both ways,
 * Back returns to the List View, Catch Up has no layout switch, and deep links
 * to cards the patch does not have settle safely.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChartWidth } from "@/components/patch-impact/graph/test-support";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { createBackend, installFetch } from "@/lib/patch-impact-loader/test-support";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { queryClient as appQueryClient } from "@/lib/query-client";
import report2620 from "@/lib/patch-deck/fixtures/report-26.20.json";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PatchReports from "../PatchReports";
import PatchDeckPage from "./PatchDeckPage";

const detail = report2620 as unknown as PatchReportDetail;
const KSANTE = "s-patch-champions__e-champion-k-sante";
const ENTITY_ID = /^s-[a-z0-9-]+__e-[a-z0-9-]+$/;

beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});
beforeEach(() => {
  installFetch(
    createBackend(
      [detail, ...(Object.values(CORPUS_REPORTS) as PatchReportDetail[])],
      CORPUS_STATS,
      ["26.20", ...[...CORPUS_VERSIONS].reverse()],
    ),
  );
  stubChartWidth(320);
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let back: () => void = () => {};
const Probe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  back = () => navigate(-1);
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
};
const location = () => screen.getByTestId("location").textContent ?? "";

function renderHub(entry: string) {
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/lol/patch-reports" element={<PatchReports />} />
          <Route path="/lol/patch-deck" element={<PatchDeckPage />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Lay the List View's entity cards out in document order, `target` at the reading line. */
function layOutEntitiesAround(target: string) {
  const ids = Array.from(document.querySelectorAll("[id]"))
    .map((el) => el.id)
    .filter((id) => ENTITY_ID.test(id));
  const at = ids.indexOf(target);
  expect(at).toBeGreaterThan(0);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const i = ids.indexOf(this.id);
    const top = i < 0 ? 0 : (i - at) * 600 + 100;
    return { top, bottom: top + 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

describe("List | Deck switch", () => {
  it("is offered on the Patch Report and carries the patch and the URL's entity", async () => {
    renderHub(`/lol/patch-reports?patch=26.20#${KSANTE}`);
    const group = await screen.findByTestId("patch-hub-layout-switch");
    expect(within(group).getByTestId("patch-hub-layout-list")).toHaveAttribute("aria-current", "page");
    expect(within(group).getByTestId("patch-hub-layout-deck")).toHaveAttribute(
      "href",
      `/lol/patch-deck?patch=26.20&card=${encodeURIComponent(KSANTE)}`,
    );
  });

  it("opens the deck at the entity being read, and the deck's List link and Back return", async () => {
    renderHub("/lol/patch-reports?patch=26.20");
    await waitFor(() => expect(document.getElementById(KSANTE)).not.toBeNull());
    layOutEntitiesAround(KSANTE);

    fireEvent.click(screen.getByTestId("patch-hub-layout-deck"));
    await waitFor(() => expect(location()).toBe(`/lol/patch-deck?patch=26.20&card=${KSANTE}`));
    const card = await screen.findByTestId("deck-card");
    expect(card).toHaveAttribute("data-card-id", KSANTE);
    expect(screen.getByTestId("deck-layout-current")).toHaveAttribute("aria-current", "page");

    // Deck → List names the same entity on the same patch.
    expect(screen.getByTestId("deck-list-link")).toHaveAttribute("href", `/lol/patch-reports?patch=26.20#${KSANTE}`);

    // Card steps replace the entry, so Back leaves the deck for the List View.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    back();
    await waitFor(() => expect(location()).toBe("/lol/patch-reports?patch=26.20"));
  });

  it("falls back to the URL's entity (or the cover) when the reader is above the first entity", async () => {
    renderHub("/lol/patch-reports?patch=26.20");
    await waitFor(() => expect(document.getElementById(KSANTE)).not.toBeNull());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 5000 } as DOMRect);
    fireEvent.click(screen.getByTestId("patch-hub-layout-deck"));
    await waitFor(() => expect(location()).toBe("/lol/patch-deck?patch=26.20"));
    expect(await screen.findByTestId("deck-card")).toHaveAttribute("data-card-kind", "cover");
  });

  it("is not part of Catch Up", async () => {
    renderHub("/lol/patch-reports?view=catchup");
    await screen.findByTestId("patch-hub-view-switch");
    expect(screen.queryByTestId("patch-hub-layout-switch")).toBeNull();
    expect(screen.queryByTestId("patch-hub-layout-deck")).toBeNull();
  });
});

describe("deck deep links", () => {
  it("settles a card this patch does not have on the cover, dropping the face", async () => {
    renderHub("/lol/patch-deck?patch=26.20&card=s-patch-champions__e-champion-nobody&face=impact");
    expect(await screen.findByTestId("deck-card")).toHaveAttribute("data-card-kind", "cover");
    await waitFor(() => expect(location()).toBe("/lol/patch-deck?patch=26.20"));
  });

  it("resolves a List View line anchor to its entity's card and keeps the face", async () => {
    renderHub(`/lol/patch-deck?patch=26.20&card=${KSANTE}__g-q-turbulent-dance__c-damage&face=changes`);
    await waitFor(() => expect(screen.getByTestId("deck-card")).toHaveAttribute("data-card-id", KSANTE));
    await waitFor(() => expect(location()).toBe(`/lol/patch-deck?patch=26.20&card=${KSANTE}&face=changes`));
  });

  it("offers the latest patch when the asked-for patch cannot be loaded", async () => {
    renderHub("/lol/patch-deck?patch=9.99");
    // The detail query retries once before it reports the error.
    const alert = await screen.findByText(/Could not load patch 9\.99/, undefined, { timeout: 5000 });
    expect(within(alert).getByRole("link", { name: "Open Patch 26.20" })).toHaveAttribute("href", "/lol/patch-deck?patch=26.20");
  });
});
