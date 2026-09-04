// Navigation, deep linking and resilience for the Archives mechanics shelf.
// The API is stubbed at `fetch` so the page exercises its real data client.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FOUNTAIN,
  INDEX_FIXTURE,
  KILL_GOLD,
  STRUCTURE_STATS,
  XP_BY_WAVE,
} from "@/lib/mechanics-tables/fixtures";

import MechanicsReferencePage from "./MechanicsReferencePage";

const TABLES_BY_ID: Record<string, unknown> = {
  "base_systems.study.fountain": FOUNTAIN,
  "takedown_economy.study.kill_gold": KILL_GOLD,
  "structures.study.stats": STRUCTURE_STATS,
  "wave_economy.study.xp_by_wave": XP_BY_WAVE,
};

/** Any table id the fixtures do not cover resolves to a minimal stand-in, so
 *  a category page can render every one of its tables. */
function tableFor(tableId: string) {
  if (TABLES_BY_ID[tableId]) return TABLES_BY_ID[tableId];
  const ref = INDEX_FIXTURE.categories
    .flatMap((category) => category.study_tables)
    .find((table) => table.table_id === tableId);
  return {
    table_id: tableId,
    category: tableId.split(".")[0],
    title: ref?.title ?? tableId,
    subtitle: ref?.subtitle ?? "",
    patch: "26.15",
    verified_through: "26.15",
    source_table_ids: [tableId],
    columns: [{ key: "detail", label: "Detail", unit: "", kind: "text" }],
    sections: [],
    rows: [{ row_id: "r1", label: "Stand-in row", section: "", values: { detail: "value" }, fact_ids: ["x"] }],
    notes: [],
  };
}

function stubApi(options: { indexFails?: boolean; tableFails?: string } = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith("/api/mechanics/tables")) {
      if (options.indexFails) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ detail: "backend unavailable" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INDEX_FIXTURE) });
    }
    const match = /\/api\/mechanics\/tables\/study\/(.+)$/.exec(url);
    if (match) {
      const tableId = decodeURIComponent(match[1]);
      if (options.tableFails === tableId) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ detail: "table build failed" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(tableFor(tableId)) });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lol/docs/mechanics" element={<MechanicsReferencePage />} />
          <Route path="/lol/docs/mechanics/:categorySlug" element={<MechanicsReferencePage />} />
          <Route
            path="/lol/docs/mechanics/:categorySlug/:tableSlug"
            element={<MechanicsReferencePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mechanics Reference — the shelf", () => {
  it("lists every published category as a link into it", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics");
    expect(await screen.findByRole("link", { name: /Minion waves/ })).toHaveAttribute(
      "href",
      "/lol/docs/mechanics/minion-waves",
    );
    for (const label of [
      "Minion stats",
      "Minion behaviour",
      "Wave XP & gold",
      "Jungle & objectives",
      "Structures",
      "Base & respawn",
      "Takedown gold",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("shows the certified patch without implying it is the current patch", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics");
    expect(await screen.findByText(/Verified through patch 26\.15/)).toBeInTheDocument();
  });

  it("fetches the index once, not per category card", async () => {
    const fetchMock = stubApi();
    renderAt("/lol/docs/mechanics");
    await screen.findByRole("link", { name: /Structures/ });
    const indexCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/mechanics/tables"),
    );
    expect(indexCalls).toHaveLength(1);
  });

  it("keeps the shelf usable while showing a loading state first", () => {
    stubApi();
    renderAt("/lol/docs/mechanics");
    expect(screen.getByTestId("mechanics-reference-loading")).toBeInTheDocument();
  });
});

describe("Mechanics Reference — a category", () => {
  it("renders every table in the category through the shared renderer", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/structures");
    await waitFor(() =>
      expect(screen.getAllByTestId("study-table")).toHaveLength(
        INDEX_FIXTURE.categories.find((category) => category.category === "structures")!
          .study_tables.length,
      ),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Structures" })).toBeInTheDocument();
  });

  it("offers the sibling tables as deep links", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/structures");
    const nav = await screen.findByRole("navigation", { name: /Structures tables/ });
    expect(within(nav).getByRole("link", { name: "Structure stats" })).toHaveAttribute(
      "href",
      "/lol/docs/mechanics/structures/stats",
    );
  });

  it("breadcrumbs back to Archives", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/structures");
    const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Archives" })).toHaveAttribute(
      "href",
      "/lol/docs",
    );
    expect(within(crumbs).getByRole("link", { name: "Mechanics reference" })).toHaveAttribute(
      "href",
      "/lol/docs/mechanics",
    );
  });

  it("says so plainly when the URL names no published subject", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/does-not-exist");
    expect(await screen.findByText(/no mechanics subject called/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All mechanics tables/ })).toBeInTheDocument();
  });
});

describe("Mechanics Reference — one table deep link", () => {
  it("restores a single table from its URL alone", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/base-systems/fountain");
    expect(await screen.findByRole("heading", { level: 1, name: "The fountain" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("study-table")).toHaveLength(1));
    expect(screen.getByTestId("study-table")).toHaveAttribute(
      "data-table-id",
      "base_systems.study.fountain",
    );
  });

  it("marks the current table in the sibling navigation", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/base-systems/fountain");
    const nav = await screen.findByRole("navigation", { name: /Base & respawn tables/ });
    expect(within(nav).getByRole("link", { name: "The fountain" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("only fetches the table the URL names", async () => {
    const fetchMock = stubApi();
    renderAt("/lol/docs/mechanics/base-systems/fountain");
    await waitFor(() => expect(screen.getAllByTestId("study-table")).toHaveLength(1));
    const studyCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/study/"),
    );
    expect(studyCalls).toHaveLength(1);
    expect(String(studyCalls[0][0])).toContain("base_systems.study.fountain");
  });

  it("says so when the category has no table by that name", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/structures/not-a-table");
    expect(await screen.findByText(/has no table called/i)).toBeInTheDocument();
  });

  it("renders a table from a different category through the same renderer", async () => {
    stubApi();
    renderAt("/lol/docs/mechanics/takedown-economy/kill-gold");
    await waitFor(() => expect(screen.getAllByTestId("study-table")).toHaveLength(1));
    // Same generic renderer, table layout rather than the prose list layout.
    expect(screen.getByTestId("study-table")).toHaveAttribute("data-layout", "table");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("Mechanics Reference — resilience", () => {
  it("shows a retry affordance when the index cannot be loaded", async () => {
    stubApi({ indexFails: true });
    renderAt("/lol/docs/mechanics");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/backend unavailable/);
    expect(within(alert).getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("recovers when the reader retries a failed index", async () => {
    const fetchMock = stubApi({ indexFails: true });
    renderAt("/lol/docs/mechanics");
    const alert = await screen.findByRole("alert");
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INDEX_FIXTURE) }),
    );
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("link", { name: /Structures/ })).toBeInTheDocument();
  });

  it("keeps the rest of a category readable when one table fails", async () => {
    stubApi({ tableFails: "structures.study.stats" });
    renderAt("/lol/docs/mechanics/structures");
    await screen.findByRole("alert");
    // The four healthy tables still render.
    await waitFor(() => expect(screen.getAllByTestId("study-table").length).toBeGreaterThan(0));
    expect(screen.getByRole("alert")).toHaveTextContent(/table build failed/);
  });

  it("does not crash the page when nothing is published", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ patch: "26.15", categories: [] }),
      }),
    );
    renderAt("/lol/docs/mechanics");
    expect(await screen.findByText(/No mechanics tables are published yet/)).toBeInTheDocument();
  });
});
