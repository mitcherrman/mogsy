/**
 * PHSR4 on the real Patch Report page (real loader and accessors over the
 * frozen production corpus; only `fetch`, the clipboard and the chart width are
 * faked): the polished champion card keeps its structure across every real 26.19
 * card, and the passive art comes from the canonical store on real data.
 */
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChartWidth } from "@/components/patch-impact/graph/test-support";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { createBackend, installFetch } from "@/lib/patch-impact-loader/test-support";
import { queryClient as appQueryClient } from "@/lib/query-client";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PatchReports from "./PatchReports";

beforeEach(() => {
  installFetch(createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse()));
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

async function renderPatch(patch: string) {
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/lol/patch-reports?patch=${patch}`]}>
        <Routes>
          <Route path="/lol/patch-reports" element={<PatchReports />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findAllByTestId("patch-hub-section");
  return utils;
}

const cardOf = (name: string) =>
  screen.getByRole("heading", { name }).closest<HTMLElement>('[data-testid="patch-report-card"]')!;
const passiveGroup = (card: HTMLElement) =>
  within(card).getAllByTestId("patch-report-ability-group").find((g) => g.getAttribute("data-ability-slot") === "P")!;

describe("26.19 champion cards on the real page", () => {
  it("Vi and Elise passives use the canonical stored passive art", async () => {
    await renderPatch("26.19");
    for (const name of ["Vi", "Elise"]) {
      const group = passiveGroup(cardOf(name));
      const expected = getAbilityIconUrl(name, "P");
      expect(expected).toBeTruthy();
      expect(group.querySelector("img")).toHaveAttribute("src", expected!);
      expect(within(group).getByTestId("patch-report-ability-icon")).toHaveTextContent("P");
    }
  });

  it("the six reviewed cards each keep one Combat Lab action, the share link, and their change count", async () => {
    await renderPatch("26.19");
    const expectedChanges: Record<string, number> = { Aatrox: 2, Aphelios: 5, Aurora: 2, Draven: 1, Elise: 2, Vi: 2 };
    for (const [name, changes] of Object.entries(expectedChanges)) {
      const card = cardOf(name);
      expect(within(card).getAllByTestId("patch-report-combat-lab")).toHaveLength(1);
      expect(within(card).getAllByTestId("patch-report-entity-actions")).toHaveLength(1);
      expect(within(card).getAllByTestId("patch-report-entity-share")).toHaveLength(1);
      expect(within(card).getAllByTestId("patch-report-change").length).toBeGreaterThanOrEqual(changes);
      expect(within(card).getByTestId("patch-report-combat-lab")).toHaveAccessibleName(`Open ${name} in Combat Lab`);
    }
  });

  it("Aphelios renders its five change groups, one heading each, below the entity heading", async () => {
    await renderPatch("26.19");
    const card = cardOf("Aphelios");
    const entityLevel = Number(within(card).getByRole("heading", { name: "Aphelios" }).tagName.slice(1));
    const groups = within(card).getAllByTestId("patch-report-ability-group");
    expect(groups).toHaveLength(5);
    for (const group of groups) {
      const heading = within(group).getAllByRole("heading")[0];
      expect(Number(heading.tagName.slice(1))).toBe(entityLevel + 1);
    }
  });

  it("every card: action wrapper iff a handoff, commentary before changes, ability headings one level under the entity", async () => {
    await renderPatch("26.19");
    const cards = screen.getAllByTestId("patch-report-card");
    // Every corpus card is on the page (sections are collapsed into view, not paged).
    expect(cards).toHaveLength(CORPUS_REPORTS.find((r) => r.patch_version === "26.19")!.cards.length);
    for (const card of cards) {
      const handoffs = within(card).queryAllByTestId("patch-report-combat-lab");
      const wrappers = within(card).queryAllByTestId("patch-report-entity-actions");
      expect(wrappers.length).toBe(handoffs.length);
      expect(handoffs.length).toBeLessThanOrEqual(1);

      const entityHeading = card.querySelector("header h2, header h3, header h4, header h5")!;
      const level = Number(entityHeading.tagName.slice(1));
      for (const group of within(card).queryAllByTestId("patch-report-ability-group")) {
        const heading = group.querySelector("h2, h3, h4, h5, h6");
        if (heading) expect(Number(heading.tagName.slice(1))).toBe(level + 1);
      }

      const rationale = within(card).queryByTestId("patch-report-rationale");
      const firstGroup = within(card).queryAllByTestId("patch-report-ability-group")[0];
      if (rationale && firstGroup) {
        expect(rationale.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  });

  it("the page has no duplicate element ids", async () => {
    const { container } = await renderPatch("26.19");
    const seen = new Map<string, number>();
    for (const el of container.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes).toEqual([]);
  });
});
