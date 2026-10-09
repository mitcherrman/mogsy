/**
 * PHSR2: the closed Explore names what it opens, from PH2 state only.
 *
 * Real 26.19 lines go through the production wiring (report structure →
 * PatchImpactChangeAnalysis → loader → PatchImpact) over the frozen corpus;
 * only `fetch`, the clipboard and the toast are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import { createBackend, installFetch, totalCalls, type FakeBackend } from "@/lib/patch-impact-loader/test-support";
import { PatchImpact } from "./PatchImpact";
import { PatchImpactChangeAnalysis } from "./PatchImpactChangeAnalysis";
import { impactExploreCta } from "./cta";
import { corpusAnalysis, stubChartWidth } from "./graph/test-support";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

let backend: FakeBackend;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stubChartWidth(320);
  backend = createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
  installFetch(backend);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** One real 26.19 line through the page's wiring. */
function renderLine(entityName: string, propertyName: string, patchVersion = "26.19") {
  const rep = CORPUS_REPORTS.find((r) => r.patch_version === patchVersion)!;
  for (const section of buildPatchReportStructure(rep).sections) {
    for (const entity of section.entities) {
      if (entity.card.entity_name !== entityName) continue;
      for (const group of entity.groups) {
        for (const node of group.changes) {
          if (node.change.property_name !== propertyName) continue;
          const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
          return render(
            <QueryClientProvider client={client}>
              <div data-testid="line">
                <PatchImpactChangeAnalysis ctx={{ entity, group, node, change: node.change }} patchVersion={patchVersion} />
              </div>
            </QueryClientProvider>,
          );
        }
      }
    }
  }
  throw new Error(`no ${patchVersion} line ${entityName} ${propertyName}`);
}

const toggle = () => screen.getByTestId("patch-impact-explore-toggle");
/** The accessible name of a <summary> is its text content, sr-only included. */
const accessibleName = (el: HTMLElement) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * A candidate exactly as the page first holds it: parameter-only with the
 * projection waiting on evidence (what the loader resolves on open).
 */
function loadableAnalysis(): PatchImpactAnalysis {
  const projected = corpusAnalysis("26.19", "Draven", "Attack Damage");
  if (projected.status !== "projected") throw new Error("expected projected");
  return {
    status: "parameter_only",
    family: projected.projection.family,
    facts: projected.facts,
    projectionUnavailable: "history_incomplete",
  } as PatchImpactAnalysis;
}

/* ------------------------------ pure CTA choice ----------------------------- */

describe("impactExploreCta reads PH2 state", () => {
  it("projected with a crossover: names the crossover level", () => {
    expect(impactExploreCta(corpusAnalysis("26.19", "Vi", "Attack Damage"))).toMatchObject({
      kind: "crossover",
      text: "View crossover at level 8",
    });
  });

  it("uses the domain's crossoverLevel verbatim, never a level of its own", () => {
    const vi8 = corpusAnalysis("26.19", "Vi", "Attack Damage");
    if (vi8.status !== "projected") throw new Error("Vi must be projected");
    const moved: PatchImpactAnalysis = { ...vi8, projection: { ...vi8.projection, crossoverLevel: 13 } };
    expect(impactExploreCta(moved)?.text).toBe("View crossover at level 13");
    const none: PatchImpactAnalysis = { ...vi8, projection: { ...vi8.projection, crossoverLevel: null } };
    expect(impactExploreCta(none)?.kind).toBe("levels");
  });

  it.each([
    ["Draven", "Attack Damage", "base AD"],
    ["Fiora", "Health Growth", "base health"],
    ["Lillia", "Armor", "base armor"],
    ["Ryze", "Armor Growth", "base armor"],
  ])("%s %s confirmed projection without a crossover: View level 1–18, no crossover claim", (champion, property, stat) => {
    const analysis = corpusAnalysis("26.19", champion, property);
    expect(analysis.status).toBe("projected");
    const cta = impactExploreCta(analysis)!;
    expect(cta.kind).toBe("levels");
    expect(cta.text).toBe("View level 1–18 impact");
    expect(cta.opens).toContain(stat);
    expect(`${cta.text}${cta.opens}`).not.toMatch(/cross|sign/i);
  });

  it("an unresolved candidate (loadable, evidence not loaded): Check, never View", () => {
    const analysis = loadableAnalysis();
    const cta = impactExploreCta(analysis)!;
    expect(cta.kind).toBe("check");
    expect(cta.text).toBe("Check level 1–18 impact");
    expect(cta.text).not.toMatch(/^View/);
    expect(`${cta.text}${cta.opens}`).not.toMatch(/cross|sign/i);
  });

  it("parameter-only (settled, no projection): impact details", () => {
    const leblanc = corpusAnalysis("26.17", "LeBlanc", "Attack Speed Growth");
    expect(leblanc.status).toBe("parameter_only");
    expect(impactExploreCta(leblanc)).toMatchObject({ kind: "details", text: "View impact details" });
  });

  it("no analysis or unavailable: no CTA", () => {
    expect(impactExploreCta(null)).toBeNull();
    expect(impactExploreCta({ status: "unavailable", reason: "out_of_scope" })).toBeNull();
  });
});

/* --------------------------- real lines, closed ---------------------------- */

describe("closed Explore on real 26.19 lines", () => {
  it("Vi AD: advertises the crossover from PH2 state, closed, with no request", () => {
    renderLine("Vi", "Attack Damage");
    const impact = screen.getByTestId("patch-impact");
    expect(impact).toHaveAttribute("data-impact-status", "projected");
    expect(toggle()).toHaveAttribute("data-cta", "crossover");
    expect(toggle()).toHaveTextContent("View crossover at level 8");
    expect(screen.getByTestId("patch-impact-explore")).not.toHaveAttribute("open");
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(totalCalls(backend)).toBe(0);
  });

  it("Draven AD: a candidate while closed (Check), confirmed (View) once the evidence loads, never a crossover", async () => {
    renderLine("Draven", "Attack Damage");
    expect(toggle()).toHaveAttribute("data-cta", "check");
    expect(toggle()).toHaveTextContent("Check level 1–18 impact");
    expect(toggle()).not.toHaveTextContent(/^View/);
    expect(accessibleName(toggle())).not.toMatch(/cross|sign/i);
    expect(totalCalls(backend)).toBe(0);

    fireEvent.click(toggle());
    await screen.findByTestId("patch-impact-graph");
    // Loaded projection: confirmed, no crossover.
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "projected");
    expect(toggle()).toHaveAttribute("data-cta", "levels");
    expect(toggle()).toHaveTextContent("View level 1–18 impact");
    expect(screen.queryByTestId("patch-impact-crossover")).toBeNull();
    expect(screen.queryAllByTestId(/patch-impact-tick-/).filter((t) => t.dataset.crossover)).toHaveLength(0);
  });

  it.each([
    ["Fiora", "Health Growth"],
    ["Lillia", "Armor"],
    ["Ryze", "Armor Growth"],
  ])("%s %s: Check level 1–18 while closed, no network; View once loaded", async (champion, property) => {
    renderLine(champion, property);
    expect(toggle()).toHaveAttribute("data-cta", "check");
    expect(toggle()).toHaveTextContent("Check level 1–18 impact");
    expect(screen.getByTestId("patch-impact-explore")).not.toHaveAttribute("open");
    expect(totalCalls(backend)).toBe(0);

    fireEvent.click(toggle());
    await screen.findByTestId("patch-impact-graph");
    expect(toggle()).toHaveAttribute("data-cta", "levels");
    expect(toggle()).toHaveTextContent("View level 1–18 impact");
  });

  it("Bel'Veth 26.15 AD: non-promissory while closed; settles to impact details when the evidence confirms no projection", async () => {
    renderLine("Bel'Veth", "Attack Damage", "26.15");
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "parameter_only");
    expect(toggle()).toHaveAttribute("data-cta", "check");
    expect(toggle()).toHaveTextContent("Check level 1–18 impact");
    expect(toggle()).not.toHaveTextContent(/View/);
    expect(accessibleName(toggle())).toMatch(/if a projection is available/);
    // Choosing the closed label costs nothing: no request until the user opens.
    expect(totalCalls(backend)).toBe(0);

    fireEvent.click(toggle());
    await waitFor(() => expect(toggle()).toHaveAttribute("data-cta", "details"));
    expect(toggle()).toHaveTextContent("View impact details");
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "parameter_only");
  });

  it("Vi Passive Shield: no Impact and no fake CTA", () => {
    renderLine("Vi", "Shield");
    expect(within(screen.getByTestId("line")).queryByTestId("patch-impact")).toBeNull();
    expect(screen.queryByTestId("patch-impact-explore-toggle")).toBeNull();
  });

  it("a deferred parameter-only change offers no CTA at all", () => {
    render(<PatchImpact analysis={corpusAnalysis("26.17", "LeBlanc", "Attack Speed Growth")} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "parameter_only");
    expect(screen.queryByTestId("patch-impact-explore-toggle")).toBeNull();
  });
});

/* ------------------------------- accessibility ------------------------------ */

describe("the CTA says what opens", () => {
  it("Vi: the accessible name covers the level range and the sign change", () => {
    renderLine("Vi", "Attack Damage");
    expect(toggle().tagName).toBe("SUMMARY");
    expect(accessibleName(toggle())).toBe(
      "View crossover at level 8: base AD before and after the patch at every level from 1 to 18, and where the difference changes sign",
    );
  });

  it("Draven before loading: candidate wording, says opening loads the evidence first", () => {
    renderLine("Draven", "Attack Damage");
    expect(accessibleName(toggle())).toBe(
      "Check level 1–18 impact: loads the evidence first, then shows base AD before and after the patch at every level from 1 to 18 if a projection is available",
    );
  });

  it("after the evidence confirms the projection, the accessible name is the confirmed one", async () => {
    renderLine("Draven", "Attack Damage");
    fireEvent.click(toggle());
    await screen.findByTestId("patch-impact-graph");
    expect(accessibleName(toggle())).toBe(
      "View level 1–18 impact: base AD before and after the patch at every level from 1 to 18",
    );
  });

  it("after the evidence confirms nothing is available, the accessible name stops promising levels", async () => {
    renderLine("Bel'Veth", "Attack Damage", "26.15");
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle()).toHaveAttribute("data-cta", "details"));
    expect(accessibleName(toggle())).toBe("View impact details: what Mogzy can and cannot project for this change");
  });

  it("the copy obeys the Impact vocabulary rule", () => {
    const ctas = [
      ...([["Vi", "Attack Damage"], ["Draven", "Attack Damage"], ["Fiora", "Health Growth"]] as const).map(
        ([c, p]) => impactExploreCta(corpusAnalysis("26.19", c, p))!,
      ),
      impactExploreCta(loadableAnalysis())!,
      impactExploreCta(corpusAnalysis("26.17", "LeBlanc", "Attack Speed Growth"))!,
    ];
    for (const cta of ctas) {
      expect(`${cta.text}${cta.opens}`).not.toMatch(/\bpower\b|stronger|weaker|\bbuff|\bnerf/i);
    }
  });
});

/* -------------------------------- opened ----------------------------------- */

describe("opening is unchanged", () => {
  it("Vi: graph, slider, readout, provenance and the PH4-A copy link", async () => {
    renderLine("Vi", "Attack Damage");
    fireEvent.click(toggle());
    expect(screen.getByTestId("patch-impact-explore")).toHaveAttribute("open");
    await screen.findByTestId("patch-impact-graph-canvas");
    expect(screen.getByTestId("patch-impact-level")).toHaveValue("18");
    expect(screen.getByTestId("patch-impact-tick-8")).toHaveAttribute("data-crossover", "true");
    expect(screen.getByTestId("patch-impact-crossover")).toHaveTextContent("changes sign at level 8");
    expect(screen.getByTestId("patch-impact-readout")).toBeInTheDocument();
    expect(screen.getByTestId("patch-impact-provenance")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("patch-impact-level"), { target: { value: "8" } });
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "8");

    const share = screen.getByTestId("patch-impact-share");
    expect(share).toHaveTextContent("Copy link to this change");
    expect(share).toHaveAccessibleName("Copy link to Vi Attack Damage change in Patch 26.19");
    fireEvent.click(share);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0][0])).toContain("?patch=26.19#");
    // Vi's projection is Riot-only: opening fetched nothing.
    expect(totalCalls(backend)).toBe(0);
  });

  it("the explore label reads as the resulting stat", async () => {
    renderLine("Fiora", "Health Growth");
    fireEvent.click(toggle());
    await screen.findByTestId("patch-impact-graph");
    expect(screen.getByLabelText("Resulting base health · champion level")).toBe(screen.getByTestId("patch-impact-level"));
  });
});
