import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PatchReportCard, PatchReportChange, PatchReportDetail } from "@/lib/patch-reports/api";

const api = vi.hoisted(() => ({ fetchPatchReports: vi.fn(), fetchPatchReport: vi.fn() }));
vi.mock("@/lib/patch-reports/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/patch-reports/api")>()),
  ...api,
}));

import PatchReports from "./PatchReports";

const base = (over: Partial<PatchReportCard>): PatchReportCard => ({
  id: 1,
  entity_type: "champion",
  entity_name: "Ahri",
  entity_slug: "Ahri",
  section_id: "patch-champions",
  section_title: "Champions",
  official_image_url: null,
  mogzy_image_path: null,
  mogzy_entity_ref: "Ahri",
  context_text: null,
  aggregate_status: "matches",
  changes: [],
  ...over,
});

const change = (over: Partial<PatchReportChange>): PatchReportChange => ({
  group_title: "",
  ability_slot: null,
  ability_icon_url: null,
  property_name: "",
  change_kind: "numeric",
  is_new: false,
  before_raw: "1",
  after_raw: "2",
  detail_text: null,
  mogzy_property: null,
  mogzy_current_raw: null,
  mogzy_status: "matches",
  proposal_id: null,
  proposal_status: null,
  ...over,
});

const detail: PatchReportDetail = {
  patch_version: "26.18",
  source_url: "https://riot.example/26-18",
  built_at: "2026-09-01T00:00:00Z",
  section_titles: ["Champions", "Arena"],
  skipped_sections: [],
  cards: [
    base({
      id: 1,
      entity_name: "Ahri",
      editorial_direction: "buff",
      editorial_direction_source: "riot_patch_highlights",
      context_text: "Ahri has been struggling in solo queue.",
      changes: [
        change({ group_title: "Q - Orb of Deception", ability_slot: "Q", property_name: "Magic Damage", before_raw: "40 / 65 / 90 / 115 / 140 (+45% AP)", after_raw: "45 / 70 / 95 / 120 / 145 (+45% AP)" }),
      ],
    }),
    base({
      id: 2,
      entity_name: "Zed",
      entity_slug: "Zed",
      editorial_direction: "nerf",
      editorial_direction_source: "riot_patch_highlights",
      changes: [change({ group_title: "Base Stats", property_name: "Base Armor", before_raw: "32", after_raw: "30" })],
    }),
    base({
      id: 5,
      entity_name: "Kayle",
      entity_slug: "Kayle",
      editorial_direction: null,
      editorial_direction_source: null,
      changes: [change({ group_title: "Bugfixes", property_name: "", change_kind: "mechanical", before_raw: null, after_raw: null, detail_text: "Fixed a bug." })],
    }),
    base({ id: 3, entity_type: "system", entity_name: "Augments", entity_slug: null, section_id: "arena", section_title: "Arena", context_text: "Arena shared intro.", changes: [change({ property_name: "Augment A" })] }),
    base({ id: 4, entity_type: "system", entity_name: "Anvils", entity_slug: null, section_id: "arena", section_title: "Arena", context_text: "Arena shared intro.", changes: [change({ property_name: "Anvil B" })] }),
  ],
};

const summary = (v: string) => ({
  patch_version: v,
  source_url: "",
  built_at: "",
  section_titles: [],
  card_count: 0,
  change_count: 0,
  cards_by_type: {},
  cards_by_status: {},
});

const renderPage = (url = "/lol/patch-reports") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <PatchReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.fetchPatchReports.mockResolvedValue({ patches: [summary("26.18"), summary("26.17")] });
  api.fetchPatchReport.mockResolvedValue(detail);
});

describe("Patch Hub page", () => {
  it("names the product Patch Hub with Patch Report as the module", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Patch Hub" })).toBeTruthy();
    expect(await screen.findByRole("heading", { level: 2, name: /Patch Report/ })).toBeTruthy();
  });

  it("organizes by official section with backend-driven direction groups", async () => {
    renderPage();
    const sections = await screen.findAllByTestId("patch-hub-section");
    expect(sections).toHaveLength(2);
    const champions = within(sections[0]);
    expect(champions.getByRole("heading", { name: /Buffs/ })).toBeTruthy();
    expect(champions.getByRole("heading", { name: /Nerfs/ })).toBeTruthy();
    expect(
      within(screen.getByTestId("patch-hub-section-nav")).getByRole("link", { name: /Arena/ }),
    ).toBeTruthy();
  });

  it("renders shared section context exactly once", async () => {
    renderPage();
    await screen.findAllByTestId("patch-hub-section");
    expect(screen.getAllByText("Arena shared intro.")).toHaveLength(1);
  });

  it("keeps the selected patch from the URL and the reconciliation notice visible", async () => {
    renderPage("/lol/patch-reports?patch=26.17");
    await screen.findByTestId("patch-data-status");
    expect(api.fetchPatchReport).toHaveBeenCalledWith("26.17");
    expect(screen.getByRole("button", { name: "26.17" }).getAttribute("aria-current")).toBe("true");
  });

  it("search narrows sections", async () => {
    renderPage();
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.change(screen.getByLabelText("Search changes"), { target: { value: "zed" } });
    expect(screen.getAllByTestId("patch-hub-section")).toHaveLength(1);
  });

  it("links the Riot source", async () => {
    renderPage();
    const links = await screen.findAllByRole("link", { name: /Riot patch 26.18 notes/ });
    expect(links[0].getAttribute("href")).toBe("https://riot.example/26-18");
  });
  it("shows the first champion numeric change without any interaction", async () => {
    renderPage();
    const values = await screen.findAllByTestId("patch-report-values");
    expect(values[0]).toHaveTextContent("40 / 65 / 90 / 115 / 140 (+45% AP)");
    expect(values[0]).toHaveTextContent("45 / 70 / 95 / 120 / 145 (+45% AP)");
    expect(screen.getByText("Ahri has been struggling in solo queue.")).toBeVisible();
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });

  it("keeps a null backend direction under Other changes and never classifies it locally", async () => {
    renderPage();
    const [champions] = await screen.findAllByTestId("patch-hub-section");
    const other = within(champions).getByRole("heading", { name: /Other changes/ }).parentElement!;
    expect(within(other).getByRole("heading", { name: "Kayle" })).toBeTruthy();
  });

  it("keeps a valid heading outline: h1 › h2 › h3 section › h4 direction › h5 entity › h6 ability", async () => {
    renderPage();
    await screen.findAllByTestId("patch-hub-section");
    expect(screen.getByRole("heading", { level: 3, name: /Champions/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: /Buffs/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 5, name: "Ahri" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 6, name: /Orb of Deception/ })).toBeTruthy();
    // Flat sections put entities directly under the section heading.
    expect(screen.getByRole("heading", { level: 4, name: "Augments" })).toBeTruthy();
    const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
    });
  });

  it("emits unique, card-id-free DOM ids", async () => {
    const { container } = renderPage();
    await screen.findAllByTestId("patch-hub-section");
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(container.querySelector("#s-patch-champions__e-champion-ahri__g-q__c-magic-damage")).not.toBeNull();
  });

  it("keeps the section intro once while search narrows to one entry", async () => {
    renderPage();
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.change(screen.getByLabelText("Search changes"), { target: { value: "anvil" } });
    expect(screen.getAllByTestId("patch-hub-section")).toHaveLength(1);
    expect(screen.getAllByText("Arena shared intro.")).toHaveLength(1);
    expect(screen.queryByTestId("patch-report-rationale")).toBeNull();
  });
});
