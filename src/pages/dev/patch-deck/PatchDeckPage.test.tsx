/**
 * PHD1 Patch Deck on the real page: the frozen production 26.20 report plus the
 * 26.10–26.19 Impact corpus behind a fake `fetch`; everything else is real
 * (deck model, report structure, Impact loader, history reads, router state).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChartWidth } from "@/components/patch-impact/graph/test-support";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import {
  STATS_PATH,
  callsTo,
  createBackend,
  installFetch,
  reportPath,
  type FakeBackend,
} from "@/lib/patch-impact-loader/test-support";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { queryClient as appQueryClient } from "@/lib/query-client";
import report2620 from "@/lib/patch-deck/fixtures/report-26.20.json";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PatchDeckPage from "./PatchDeckPage";

const detail = report2620 as unknown as PatchReportDetail;
let backend: FakeBackend;

beforeEach(() => {
  backend = createBackend(
    [detail, ...(Object.values(CORPUS_REPORTS) as PatchReportDetail[])],
    CORPUS_STATS,
    ["26.20", ...[...CORPUS_VERSIONS].reverse()],
  );
  installFetch(backend);
  stubChartWidth(320);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

async function renderDeck(search = "") {
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/dev/patch-deck${search}`]}>
        <Routes>
          <Route
            path="/dev/patch-deck"
            element={
              <>
                <PatchDeckPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("patch-deck");
  return utils;
}

const currentCard = () => screen.getByTestId("deck-card");
const location = () => screen.getByTestId("location").textContent ?? "";
const KSANTE = "s-patch-champions__e-champion-k-sante";

describe("Patch Deck page on the real 26.20 report", () => {
  it("opens on the cover with Riot's chapters and Mogzy's recorded data status", async () => {
    await renderDeck();
    expect(currentCard()).toHaveAttribute("data-card-kind", "cover");
    expect(screen.getByRole("heading", { name: "26.20" })).toBeInTheDocument();
    const chapters = screen.getAllByTestId("deck-cover-chapter").map((b) => b.textContent);
    expect(chapters[0]).toContain("Champions");
    expect(chapters[0]).toContain("3 buffs");
    expect(chapters[0]).toContain("13 nerfs");
    // PUBLISHED_NOT_RECONCILED is stated, never dressed up.
    expect(screen.getByTestId("deck-cover-status")).toHaveTextContent("No full Mogzy data update is recorded for this patch");
    expect(location()).toBe("/dev/patch-deck");
  });

  it("advances with the arrow keys, writes the card into the URL and announces it", async () => {
    await renderDeck();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(currentCard()).toHaveAttribute("data-card-kind", "champion"));
    expect(within(currentCard()).getByRole("heading", { level: 2 })).toHaveTextContent("Diana");
    expect(location()).toBe("/dev/patch-deck?patch=26.20&card=s-patch-champions__e-champion-diana");
    expect(screen.getByTestId("deck-live")).toHaveTextContent("Card 1 of 41: Diana. Champions, Buffs.");
    expect(within(currentCard()).getByTestId("deck-direction")).toHaveTextContent("Buff");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(currentCard()).toHaveAttribute("data-card-kind", "cover"));
    fireEvent.keyDown(window, { key: "End" });
    await waitFor(() => expect(screen.getByTestId("deck-position")).toHaveTextContent("Card 41 of 41"));
  });

  it("deep-links to a card and a face, and keeps the backend's published K'Sante classification", async () => {
    await renderDeck(`?patch=26.20&card=${KSANTE}&face=changes`);
    expect(within(currentCard()).getByRole("heading", { level: 2 })).toHaveTextContent("K'Sante");
    expect(screen.getByRole("tab", { name: "Riot changes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("deck-face-changes")).toBeInTheDocument();
    // Published as a buff from Riot's patch text; the deck shows what the backend says.
    const direction = within(currentCard()).getByTestId("deck-direction");
    expect(direction).toHaveTextContent("Buff");
    expect(direction).toHaveAttribute("title", "Buff — Riot's patch text");
    expect(within(currentCard()).getAllByTestId("deck-change")).toHaveLength(2);
    const values = within(currentCard()).getAllByTestId("deck-values").map((v) => v.textContent);
    expect(values[0]).toContain("40 / 45 / 50 / 55 / 60");
    expect(values[0]).toContain("45 / 50 / 55 / 60 / 65");
  });

  it("switches faces through an accessible tablist whose arrow keys never change the card", async () => {
    await renderDeck("?patch=26.20&card=s-patch-champions__e-champion-diana");
    const tablist = screen.getByRole("tablist", { name: "Card views" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Overview", "Riot changes", "Mogzy Impact", "Patch history", "Explore"]);
    tabs[0].focus();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Riot changes" })).toHaveAttribute("aria-selected", "true"));
    expect(within(currentCard()).getByRole("heading", { level: 2 })).toHaveTextContent("Diana");
    expect(location()).toContain("face=changes");
    fireEvent.keyDown(window, { key: "]" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Mogzy Impact" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("deck-impact-none")).toHaveTextContent("Diana's changes this patch do not include a projectable base stat");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Mogzy Impact");
  });

  it("renders a Riot-complete projection for Lucian without any Impact evidence request", async () => {
    await renderDeck("?patch=26.20&card=s-patch-champions__e-champion-lucian&face=impact");
    const panel = await screen.findByTestId("deck-impact-panel");
    expect(panel).toHaveAttribute("data-impact-status", "projected");
    expect(within(panel).getByTestId("deck-impact-dial")).toHaveAttribute("data-level", "18");
    expect(within(panel).getByTestId("deck-impact-fact")).toHaveTextContent("AD growth");
    expect(callsTo(backend, STATS_PATH)).toBe(0);
  });

  it("requests Impact evidence only once the Impact face is opened", async () => {
    await renderDeck("?patch=26.20&card=s-patch-champions__e-champion-swain");
    expect(callsTo(backend, STATS_PATH)).toBe(0);
    expect(screen.getByTestId("deck-insight-available")).toHaveTextContent("Base MR");
    fireEvent.click(screen.getByRole("tab", { name: "Mogzy Impact" }));
    await waitFor(() => expect(callsTo(backend, STATS_PATH)).toBe(1));
    const panels = await screen.findAllByTestId("deck-impact-panel");
    expect(panels).toHaveLength(2);
    await waitFor(() => expect(screen.queryByTestId("deck-impact-loading")).not.toBeInTheDocument());
    // Whatever the evidence proves, nothing is invented: every panel settles to a domain state.
    for (const p of panels) expect(["projected", "parameter_only", "unavailable"]).toContain(p.getAttribute("data-impact-status"));
  });

  it("reads earlier reports for the history face only when it is opened", async () => {
    await renderDeck("?patch=26.20&card=s-patch-champions__e-champion-cassiopeia");
    expect(callsTo(backend, reportPath("26.18"))).toBe(0);
    fireEvent.click(screen.getByRole("tab", { name: "Patch history" }));
    const list = await screen.findByTestId("deck-history-list");
    await waitFor(() => expect(within(list).getAllByTestId("deck-history-entry").length).toBeGreaterThan(0));
    expect(callsTo(backend, reportPath("26.18"))).toBe(1);
    const link = within(list).getByRole("link", { name: "26.18" });
    expect(link).toHaveAttribute("title", "Open Cassiopeia in the Patch 26.18 report");
    expect(link.getAttribute("href")).toMatch(/^\/lol\/patch-reports\?patch=26\.18#s-.*e-champion-cassiopeia$/);
  });

  it("offers Combat Lab, the List View anchor and the related mode card from Explore", async () => {
    await renderDeck(`?patch=26.20&card=${KSANTE}&face=explore`);
    expect(screen.getByTestId("deck-combat-lab")).toHaveAttribute("href", "/combat-lab?attacker=ksante");
    expect(screen.getByTestId("deck-list-view")).toHaveAttribute("href", `/lol/patch-reports?patch=26.20#${KSANTE}`);
    const related = screen.getByTestId("deck-related");
    expect(related).toHaveTextContent("K'Sante · ARAM: Mayhem");
    fireEvent.click(related);
    await waitFor(() => expect(currentCard()).toHaveAttribute("data-card-id", "s-patch-aram-mayhem__e-system-k-sante"));
    expect(screen.getByTestId("deck-position")).toHaveTextContent("ARAM: Mayhem");
  });

  it("jumps to a chapter from the rail and composes items and prose sections differently", async () => {
    await renderDeck();
    fireEvent.click(screen.getByTitle("Items: 3 cards"));
    await waitFor(() => expect(currentCard()).toHaveAttribute("data-card-kind", "item"));
    expect(within(currentCard()).getByRole("heading", { level: 2 })).toHaveTextContent("Experimental Hexplate");
    fireEvent.click(screen.getByTitle("Classic: 5 cards"));
    await waitFor(() => expect(currentCard()).toHaveAttribute("data-card-id", "s-patch-classic__e-system-classic-general"));
    expect(within(currentCard()).getAllByTestId("deck-change")).toHaveLength(56);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("changes patch from the selector and resets to that patch's cover", async () => {
    await renderDeck("?patch=26.20&card=s-patch-champions__e-champion-diana");
    fireEvent.change(screen.getByTestId("deck-patch-select"), { target: { value: "26.19" } });
    await waitFor(() => expect(screen.getByRole("heading", { name: "26.19" })).toBeInTheDocument());
    expect(location()).toBe("/dev/patch-deck?patch=26.19");
    expect(currentCard()).toHaveAttribute("data-card-kind", "cover");
  });
});
