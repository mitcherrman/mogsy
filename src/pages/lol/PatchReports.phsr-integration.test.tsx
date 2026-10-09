/**
 * SR launch integration (PHSR1 + PHSR2 + PHSR3 + PHSR4 on one page).
 *
 * The four workstreams were certified separately. These tests pin the seams
 * between them on the real Patch Report page: the real loader, structure and
 * accessors over the frozen production corpus, with 26.19 carrying the verbatim
 * production reconciliation and the PHSR1 production card excerpts (Draven,
 * Aurora, Aphelios, Elise, Vi) so per-line Mogzy evidence is real. Only `fetch`,
 * the clipboard, the toast and the chart width are faked.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChartWidth } from "@/components/patch-impact/graph/test-support";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import {
  STATS_PATH,
  callsTo,
  createBackend,
  installFetch,
  totalCalls,
  type FakeBackend,
} from "@/lib/patch-impact-loader/test-support";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { MOGZY_STATUS_LABEL, summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";
import {
  RECONCILIATION_26_19,
  SR_APHELIOS,
  SR_AURORA,
  SR_DRAVEN,
  SR_ELISE,
  SR_VI,
} from "@/lib/patch-reports/phsr1-sr-fixtures";
import { PATCH_HUB_TOP_ANCHOR } from "@/lib/patch-reports/sr-navigation";
import { queryClient as appQueryClient } from "@/lib/query-client";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PatchReports from "./PatchReports";

const PROD_CARDS = new Map([SR_DRAVEN, SR_AURORA, SR_APHELIOS, SR_ELISE, SR_VI].map((c) => [c.entity_name, c]));

/** 26.19 as production serves it: real reconciliation, real per-line evidence on the reviewed cards. */
const REPORTS: PatchReportDetail[] = CORPUS_REPORTS.map((report) =>
  report.patch_version !== "26.19"
    ? report
    : {
        ...report,
        reconciliation: RECONCILIATION_26_19,
        cards: report.cards.map((card) => PROD_CARDS.get(card.entity_name) ?? card),
      },
);

/** Labels the page used before PHSR1 / this integration. None may reach a reader. */
const STALE =
  /\b(Mismatch|Not represented|Needs interpretation|Unresolved)\b|not reconciled|partly current|Mogzy:/;

const VI = "s-patch-champions__e-champion-vi";
const VI_AD = `${VI}__g-base-stats__c-attack-damage`;

let backend: FakeBackend;

beforeEach(() => {
  backend = createBackend(REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
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
const lineOf = (card: HTMLElement, property: string) =>
  within(card)
    .getAllByTestId("patch-report-change")
    .find((li) => within(li).queryByText(property, { exact: true }))!;
/** Text before any disclosure is opened: closed <details> bodies and sr-only text removed. */
const visibleText = (el: HTMLElement) => {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  clone.querySelectorAll("details:not([open])").forEach((d) => {
    [...d.children].forEach((child) => child.tagName !== "SUMMARY" && child.remove());
  });
  return (clone.textContent ?? "").replace(/\s+/g, " ");
};
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("one status vocabulary across the page (seam 2)", () => {
  it("the masthead pill says what the notice it links to says, from the same summary", async () => {
    await renderPatch("26.19");
    const masthead = screen.getByTestId("patch-hub-masthead");
    const pill = within(masthead).getByRole("link", { name: "Mogzy data partly updated" });
    expect(pill).toHaveAttribute("href", "#patch-data-status");
    expect(pill.textContent).toBe(summarizeReconciliation(RECONCILIATION_26_19).shortLabel);
    expect(screen.getByTestId("patch-data-status")).toHaveTextContent(
      "Mogzy's gameplay data is partly updated for this patch",
    );
  });

  it("an unreconciled patch reads as not recorded in both places, never as current", async () => {
    await renderPatch("26.15");
    const pill = within(screen.getByTestId("patch-hub-masthead")).getByRole("link", {
      name: "No Mogzy data update recorded",
    });
    expect(pill).toBeInTheDocument();
    expect(screen.getByTestId("patch-data-status")).toHaveTextContent(
      "No full Mogzy data update is recorded for this patch",
    );
  });

  it("the status filter offers the card headers' vocabulary, and still filters by the raw enum", async () => {
    await renderPatch("26.19");
    const select = screen.getByLabelText("Filter by Mogzy status") as HTMLSelectElement;
    const options = [...select.options];
    expect(options.map((o) => o.textContent)).toEqual(["All Mogzy statuses", ...Object.values(MOGZY_STATUS_LABEL)]);
    expect(options.map((o) => o.value)).toEqual(["all", ...Object.keys(MOGZY_STATUS_LABEL)]);

    fireEvent.change(select, { target: { value: "not_represented" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Draven" })).toBeNull());
    expect(cardOf("Aphelios")).toBeInTheDocument();
    // Every card left says, in its header, the status the filter offered.
    for (const mark of screen.getAllByTestId("patch-report-status-mark")) {
      if (mark.closest("header")) expect(mark).toHaveTextContent(MOGZY_STATUS_LABEL.not_represented);
    }
  });

  it("no stale internal wording anywhere on the public page, disclosures and screen-reader text included", async () => {
    await renderPatch("26.19");
    expect(document.body.textContent).not.toMatch(STALE);
  });
});

describe("reconciliation arithmetic (seam 3)", () => {
  it("the first layer counts checks only; the no-consumer count and the units caveat stay technical", async () => {
    await renderPatch("26.19");
    const notice = screen.getByTestId("patch-data-status");
    const first = visibleText(notice);
    expect(first).toContain("42 gameplay-data checks: 11 now up to date · 24 not modeled yet · 7 need review.");
    expect(first).toContain("Most other Riot notes do not map directly to a Mogzy gameplay-data field.");
    expect(first).not.toMatch(/\b(173|214|215)\b/);
    // The masthead counts report changes; nothing near it states a second count to add to the checks.
    expect(screen.getByTestId("patch-hub-masthead")).toHaveTextContent(/\d+ changes/);
    expect(within(notice).getByTestId("patch-data-status-technical")).toHaveTextContent(
      /One Riot change line can produce more than one gameplay-data check/,
    );
  });
});

describe("PHSR3 scroll contract under PHSR4 layout (seam 4)", () => {
  it("keeps the top anchor, report anchors and their scroll margins; ids stay unique", async () => {
    await renderPatch("26.19");
    const masthead = screen.getByTestId("patch-hub-masthead");
    expect(masthead.id).toBe(PATCH_HUB_TOP_ANCHOR);
    expect(masthead.id).toBe("patch-hub");
    expect(masthead).toHaveClass("scroll-mt-24");

    const nav = screen.getByTestId("patch-hub-sticky-nav");
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("#patch-hub");
    for (const href of hrefs) expect(document.getElementById(href!.slice(1))).not.toBeNull();

    const vi = document.getElementById(VI)!;
    expect(vi).toBe(cardOf("Vi"));
    expect(vi).toHaveClass("scroll-mt-24");
    expect(document.getElementById(VI_AD)).not.toBeNull();
    for (const group of within(vi).getAllByTestId("patch-report-ability-group")) expect(group).toHaveClass("scroll-mt-24");
    expect(document.getElementById("patch-data-status")).toHaveClass("scroll-mt-24");

    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe("Draven 26.19: Riot, Impact and the build-time note stay distinct (seam 5)", () => {
  it("Riot's 62 → 64 leads, Impact analyzes it, and Mogzy's 62 is only a note about report build time", async () => {
    await renderPatch("26.19");
    const card = cardOf("Draven");
    const line = lineOf(card, "Attack Damage");
    const values = within(line).getByTestId("patch-report-values");
    const impact = within(line).getByTestId("patch-impact");
    const evidence = within(line).getByTestId("patch-report-evidence") as HTMLDetailsElement;
    expect(values).toHaveTextContent("From 62→ to 64");
    expect(impact).toHaveTextContent(/Base AD from 62 → to 64/);
    // Hierarchy: Riot values, then Impact, then Mogzy's own data status.
    expect(before(values, impact)).toBe(true);
    expect(before(impact, evidence)).toBe(true);

    // Closed: the CTA is a candidate (PHSR2), the status names Mogzy (PHSR1), and nothing has been fetched.
    const toggle = within(line).getByTestId("patch-impact-explore-toggle");
    expect(toggle).toHaveAttribute("data-cta", "check");
    expect(toggle).toHaveTextContent("Check level 1–18 impact");
    expect(evidence.open).toBe(false);
    expect(within(evidence).getByText(MOGZY_STATUS_LABEL.mismatch)).toBeInTheDocument();
    expect(visibleText(line)).not.toMatch(/62 here|currently|pending|disput|wrong/i);
    expect(callsTo(backend, STATS_PATH)).toBe(0);

    // The build-time note, when asked for, cannot be read as Riot's value, a dispute or a pending update.
    const explanation = within(evidence).getByTestId("patch-report-evidence-explanation");
    expect(explanation).toHaveTextContent("When this report was built, Mogzy's data still had 62 here");
    expect(explanation).toHaveTextContent("This is about Mogzy's own data, not Riot's patch note.");
    expect(explanation).toHaveTextContent("Mogzy Impact works from Riot's published numbers.");
    expect(explanation.textContent).not.toMatch(/currently|pending|disput/i);
    expect(screen.getByTestId("patch-data-status")).toHaveTextContent(
      "Mogzy notes on individual changes were recorded when this report was built, before this update ran.",
    );

    // Opening Impact: the evidence confirms a projection; the label moves to View; the data note is untouched.
    fireEvent.click(toggle);
    await within(line).findByTestId("patch-impact-graph");
    expect(within(line).getByTestId("patch-impact-explore-toggle")).toHaveAttribute("data-cta", "levels");
    expect(within(line).getByTestId("patch-impact-explore-toggle")).toHaveTextContent("View level 1–18 impact");
    expect(within(line).queryByTestId("patch-impact-crossover")).toBeNull();
    expect(within(line).getByTestId("patch-report-evidence-value")).toHaveTextContent(
      "Mogzy's value when this report was built: 62",
    );

    // Secondary action stays the quiet one.
    const lab = within(card).getByTestId("patch-report-combat-lab");
    expect(lab).toHaveAccessibleName("Open Draven in Combat Lab");
    expect(lab).toHaveAttribute("href", "/combat-lab?attacker=draven");
  });
});

describe("Vi 26.19: the full stack on one card", () => {
  it("inferred direction, stored passive art, crossover CTA, lazy graph, share and a quiet Combat Lab", async () => {
    await renderPatch("26.19");
    const card = cardOf("Vi");
    const header = card.querySelector("header")!;
    expect(header).toHaveTextContent(/Adjustment/);
    expect(header).toHaveTextContent(/inferred/);

    const passive = within(card)
      .getAllByTestId("patch-report-ability-group")
      .find((g) => g.getAttribute("data-ability-slot") === "P")!;
    expect(passive.querySelector("img")).toHaveAttribute("src", getAbilityIconUrl("Vi", "P")!);

    const line = lineOf(card, "Attack Damage");
    const toggle = within(line).getByTestId("patch-impact-explore-toggle");
    expect(toggle).toHaveAttribute("data-cta", "crossover");
    expect(toggle).toHaveTextContent("View crossover at level 8");
    expect(within(line).queryByTestId("patch-impact-graph")).toBeNull();
    // Vi's line keeps its own status row: build-time evidence differs from the header.
    expect(within(line).getByTestId("patch-report-evidence")).toHaveTextContent(MOGZY_STATUS_LABEL.needs_interpretation);

    const calls = totalCalls(backend);
    fireEvent.click(toggle);
    await within(line).findByTestId("patch-impact-graph");
    // Vi's projection is confirmed from the report itself: opening fetched nothing.
    expect(totalCalls(backend)).toBe(calls);

    expect(within(header).getByRole("link", { name: /Copy link to Vi changes/ })).toBeInTheDocument();
    const labs = within(card).getAllByTestId("patch-report-combat-lab");
    expect(labs).toHaveLength(1);
    expect(labs[0]).toHaveTextContent(/^Open Vi in Combat Lab$/);
    expect(labs[0].className).not.toMatch(/border-\[#c9a84c\]|text-\[#c9a84c\]/);
  });
});

describe("dense and mixed cards", () => {
  it("Aphelios: five Riot changes, the status stated once in the header, no repeated rows", async () => {
    await renderPatch("26.19");
    const card = cardOf("Aphelios");
    expect(within(card).getAllByTestId("patch-report-ability-group")).toHaveLength(5);
    expect(within(card).queryAllByTestId("patch-report-evidence")).toHaveLength(0);
    expect(within(card).getAllByTestId("patch-report-status-mark")).toHaveLength(1);
    expect(within(card).queryAllByTestId("patch-impact")).toHaveLength(0);
  });

  it("Aurora: E and R keep their own truthful statuses; the formula stays technical", async () => {
    await renderPatch("26.19");
    const card = cardOf("Aurora");
    const marks = within(card)
      .getAllByTestId("patch-report-evidence")
      .map((d) => d.querySelector('[data-testid="patch-report-status-mark"]')!.getAttribute("data-mogzy-status"));
    expect(marks).toEqual(["mismatch", "not_represented"]);
    expect(visibleText(card)).not.toMatch(/_formula|ability_damage/);
  });

  it("Elise: real passive art on the passive, W keeps its own icon path", async () => {
    await renderPatch("26.19");
    const card = cardOf("Elise");
    const groups = within(card).getAllByTestId("patch-report-ability-group");
    expect(groups).toHaveLength(2);
    const passive = groups.find((g) => g.getAttribute("data-ability-slot") === "P")!;
    expect(passive.querySelector("img")).toHaveAttribute("src", getAbilityIconUrl("Elise", "P")!);
    const other = groups.find((g) => g !== passive)!;
    expect(other.querySelector("img")?.getAttribute("src") ?? null).not.toBe(getAbilityIconUrl("Elise", "P"));
  });
});

describe("Bel'Veth 26.15: the corrected honesty contract on the page (seam 6)", () => {
  it("closed says Check with no request; settles to View impact details once the evidence says unavailable", async () => {
    await renderPatch("26.15");
    const card = cardOf("Bel'Veth");
    const line = lineOf(card, "Attack Damage");
    const toggle = within(line).getByTestId("patch-impact-explore-toggle");
    expect(toggle).toHaveAttribute("data-cta", "check");
    expect(toggle).toHaveTextContent("Check level 1–18 impact");
    expect(toggle).not.toHaveTextContent(/View/);
    expect(callsTo(backend, STATS_PATH)).toBe(0);

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(within(line).getByTestId("patch-impact-explore-toggle")).toHaveAttribute("data-cta", "details"),
    );
    expect(within(line).getByTestId("patch-impact-explore-toggle")).toHaveTextContent("View impact details");
    expect(within(line).queryByTestId("patch-impact-graph")).toBeNull();
  });
});
