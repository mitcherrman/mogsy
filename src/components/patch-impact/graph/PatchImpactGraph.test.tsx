/**
 * PH4-B: the Impact level graph inside Explore, against PH2's real output.
 * Real analyses come from the frozen production corpus (26.10–26.19); jsdom has
 * no layout, so the canvas is given a width by `stubChartWidth`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { canonicalRow, championCard, statLine } from "@/lib/patch-impact/fixtures/builders";
import { analyzeChampionStatChange } from "@/lib/patch-impact/analyze";
import type { LevelPoint, PatchImpactAnalysis } from "@/lib/patch-impact/types";
import * as statCurve from "@/lib/league-docs/api";
import { LIST_PATH, STATS_PATH, createBackend, installFetch, reportPath } from "@/lib/patch-impact-loader/test-support";
import { PatchImpact } from "../PatchImpact";
import { PatchImpactExplore } from "../PatchImpactExplore";
import { PatchImpactChangeAnalysis } from "../PatchImpactChangeAnalysis";
import * as chartModel from "./chart-model";
import { ImpactChartTooltip } from "./PatchImpactLevelChart";
import { corpusAnalysis, corpusProjection, corpusRow, pointerOn, stubChartWidth } from "./test-support";

vi.mock("@/lib/league-docs/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/league-docs/api")>();
  return {
    ...actual,
    statAtLevel: vi.fn(actual.statAtLevel),
    riotLevelMultiplier: vi.fn(actual.riotLevelMultiplier),
  };
});

vi.mock("./chart-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chart-model")>();
  return { ...actual, buildImpactChartModel: vi.fn(actual.buildImpactChartModel) };
});

beforeEach(() => {
  stubChartWidth(320);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(chartModel.buildImpactChartModel).mockClear();
  vi.mocked(statCurve.statAtLevel).mockClear();
  vi.mocked(statCurve.riotLevelMultiplier).mockClear();
});

const Vi = () => corpusAnalysis("26.19", "Vi", "Attack Damage");
const Draven = () => corpusAnalysis("26.19", "Draven", "Attack Damage");

const openExplore = () => fireEvent.click(screen.getByTestId("patch-impact-explore-toggle"));
const canvas = () => screen.findByTestId("patch-impact-graph-canvas");
const range = () => screen.getByTestId("patch-impact-level") as HTMLInputElement;
const dots = (series?: "before" | "after") =>
  [...document.querySelectorAll<SVGCircleElement>(`[data-testid="impact-chart-point"]${series ? `[data-series="${series}"]` : ""}`)];

function renderOpen(analysis: PatchImpactAnalysis, props: Partial<React.ComponentProps<typeof PatchImpact>> = {}) {
  return render(<PatchImpact analysis={analysis} {...props} />);
}

describe("when PH2 projects the change", () => {
  it("Vi 26.19 renders a graph with all 18 levels on both lines", async () => {
    renderOpen(Vi());
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    openExplore();
    expect(screen.getByTestId("patch-impact-graph")).toBeInTheDocument();
    await canvas();
    expect(dots("before")).toHaveLength(18);
    expect(dots("after")).toHaveLength(18);
    expect(dots("after").map((d) => Number(d.dataset.level))).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("plots exactly PH2's supplied values (Vi)", async () => {
    const projection = corpusProjection("26.19", "Vi", "Attack Damage");
    renderOpen(Vi());
    openExplore();
    await canvas();
    for (const series of ["before", "after"] as const) {
      dots(series).forEach((dot, i) => expect(dot.dataset.value).toBe(String(projection.levels[i][series])));
    }
  });

  it("authority mutation test: values that follow no stat curve are drawn as supplied", async () => {
    const real = corpusProjection("26.19", "Vi", "Attack Damage");
    const levels: LevelPoint[] = real.levels.map((p, i) => ({
      ...p,
      before: 100 + i * 1.5,
      after: 90 + i * 2.25,
      absDelta: 500 + i, // inconsistent on purpose: a chart that derived `after` from `before + absDelta` would fail
    }));
    renderOpen({ status: "projected", family: "ad", facts: [], projection: { ...real, levels, crossoverLevel: null } });
    openExplore();
    await canvas();
    dots("before").forEach((dot, i) => expect(dot.dataset.value).toBe(String(100 + i * 1.5)));
    dots("after").forEach((dot, i) => expect(dot.dataset.value).toBe(String(90 + i * 2.25)));
  });

  it("never calls the stat curve helpers while drawing or interacting", async () => {
    const analysis = Vi(); // PH2's own work happens here
    vi.mocked(statCurve.statAtLevel).mockClear();
    vi.mocked(statCurve.riotLevelMultiplier).mockClear();
    renderOpen(analysis);
    openExplore();
    await canvas();
    fireEvent.change(range(), { target: { value: "4" } });
    fireEvent.change(range(), { target: { value: "15" } });
    expect(statCurve.statAtLevel).not.toHaveBeenCalled();
    expect(statCurve.riotLevelMultiplier).not.toHaveBeenCalled();
  });

  it("Draven 26.19 draws two parallel lines, 2 AD apart at every level, with no crossover", async () => {
    const projection = corpusProjection("26.19", "Draven", "Attack Damage");
    renderOpen(Draven());
    openExplore();
    await canvas();
    const before = dots("before");
    const after = dots("after");
    expect(before).toHaveLength(18);
    before.forEach((dot, i) => {
      expect(Number(after[i].dataset.value) - Number(dot.dataset.value)).toBeCloseTo(2, 9);
      expect(dot.dataset.value).toBe(String(projection.levels[i].before));
      // Same x, and the after line sits a constant number of pixels above the before line.
      expect(after[i].getAttribute("cx")).toBe(dot.getAttribute("cx"));
    });
    const gaps = before.map((dot, i) => Number(dot.getAttribute("cy")) - Number(after[i].getAttribute("cy")));
    gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0], 6));
    expect(gaps[0]).toBeGreaterThan(0);
    // Honest scale: +2 on a ~60–125 curve stays a small gap against the plot height.
    expect(gaps[0]).toBeLessThan(0.06 * 176);
    expect(document.querySelector(".impact-chart-crossover")).toBeNull();
  });
});

describe("when PH2 does not project the change", () => {
  it("shows no graph for a parameter-only change (LeBlanc attack-speed growth)", () => {
    const analysis = corpusAnalysis("26.17", "LeBlanc", "Attack Speed Growth");
    expect(analysis.status).toBe("parameter_only");
    renderOpen(analysis);
    expect(screen.queryByTestId("patch-impact-explore")).toBeNull();
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    expect(document.querySelector("svg.recharts-surface")).toBeNull();
  });

  it("shows no graph for a parameter-only change that could still load, even if Explore is open", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const analysis = analyzeChampionStatChange({
      card: championCard("Lee Sin", [change]),
      change,
      patchVersion: "26.12",
      canonical: null,
      laterReports: null,
      laterVersionsExpected: null,
    });
    renderOpen(analysis, { onRequestProjection: vi.fn(), defaultOpen: true });
    expect(screen.getByTestId("patch-impact-state")).toBeInTheDocument();
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
  });

  it("shows no graph for an unavailable Impact (Vi Passive Shield 12% → 10%)", () => {
    const analysis = corpusAnalysis("26.19", "Vi", "Shield");
    expect(analysis.status).toBe("unavailable");
    const { container } = renderOpen(analysis);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no graph for a Jhin-shaped attack-speed line: PH2 projects none, and the graph never builds one", () => {
    const change = statLine("attack_speed_growth", "Attack Speed Growth", "2.5%", "2%");
    const analysis = analyzeChampionStatChange({
      card: championCard("Jhin", [change]),
      change,
      patchVersion: "26.12",
      canonical: [canonicalRow("Jhin")],
      laterReports: [],
      laterVersionsExpected: [],
    });
    renderOpen(analysis);
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    expect(screen.queryByTestId("patch-impact-explore")).toBeNull();
    expect(vi.mocked(chartModel.buildImpactChartModel)).not.toHaveBeenCalled();
  });

  it("renders no empty chart shell when the projection is not plottable", () => {
    const real = corpusProjection("26.19", "Vi", "Attack Damage");
    render(<PatchImpactExplore projection={{ ...real, levels: real.levels.slice(0, 17) }} level={9} onLevelChange={vi.fn()} />);
    expect(screen.getByTestId("patch-impact-explore-body")).toBeInTheDocument();
    expect(screen.queryByTestId("patch-impact-graph")).toBeNull();
    expect(screen.queryByTestId("patch-impact-graph-loading")).toBeNull();
    expect(screen.queryByTestId("patch-impact-graph-canvas")).toBeNull();
  });
});

describe("crossover marker", () => {
  it("Vi: marks PH2's level 8, labelled, and keeps the text note outside the chart", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const marker = document.querySelector(".impact-chart-crossover");
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toContain("crosses at 8");
    expect(screen.getByTestId("patch-impact-crossover")).toHaveTextContent("The difference changes sign at level 8.");
    // The marker sits at the same x as the level-8 points.
    const x = Number(marker!.querySelector("line")!.getAttribute("x1"));
    expect(Number(dots("after")[7].getAttribute("cx"))).toBeCloseTo(x, 3);
  });

  it("follows PH2: a different crossover moves the marker, and none removes it", async () => {
    const vi = corpusProjection("26.19", "Vi", "Attack Damage");
    const wrap = (crossoverLevel: number | null): PatchImpactAnalysis => ({
      status: "projected",
      family: "ad",
      facts: [],
      projection: { ...vi, crossoverLevel },
    });
    const { rerender } = render(<PatchImpact analysis={wrap(12)} defaultOpen />);
    await canvas();
    const at12 = Number(document.querySelector(".impact-chart-crossover line")!.getAttribute("x1"));
    expect(Number(dots("after")[11].getAttribute("cx"))).toBeCloseTo(at12, 3);
    expect(document.querySelector(".impact-chart-crossover")!.textContent).toContain("crosses at 12");

    rerender(<PatchImpact analysis={wrap(null)} defaultOpen />);
    expect(document.querySelector(".impact-chart-crossover")).toBeNull();
    expect(screen.queryByTestId("patch-impact-crossover")).toBeNull();
  });

  it("is not invented for Draven, even though PH2's delta is the same sign everywhere", async () => {
    renderOpen(Draven(), { defaultOpen: true });
    await canvas();
    expect(document.querySelector(".impact-chart-crossover")).toBeNull();
  });
});

describe("selected level stays in sync with the existing control", () => {
  const selectedLevels = () => [...new Set(dots().filter((d) => d.dataset.selected === "true").map((d) => d.dataset.level))];
  const selectedLineX = () => Number(document.querySelector(".impact-chart-selected line")!.getAttribute("x1"));

  it("starts at the scrubber's level (default 18) and follows it without rebuilding the chart data", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    expect(selectedLevels()).toEqual(["18"]);
    const builds = vi.mocked(chartModel.buildImpactChartModel).mock.calls.length;
    const pointsBefore = dots().map((d) => `${d.dataset.series}${d.dataset.level}=${d.dataset.value}`);

    fireEvent.change(range(), { target: { value: "7" } });
    expect(selectedLevels()).toEqual(["7"]);
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "7");
    expect(screen.getByTestId("patch-impact-graph")).toHaveAttribute("data-level", "7");
    expect(selectedLineX()).toBeCloseTo(Number(dots("after")[6].getAttribute("cx")), 3);

    fireEvent.keyDown(range(), { key: "ArrowRight" });
    expect(selectedLevels()).toEqual(["8"]);
    fireEvent.click(screen.getByTestId("patch-impact-tick-1"));
    expect(selectedLevels()).toEqual(["1"]);

    expect(vi.mocked(chartModel.buildImpactChartModel).mock.calls.length).toBe(builds);
    expect(dots().map((d) => `${d.dataset.series}${d.dataset.level}=${d.dataset.value}`)).toEqual(pointsBefore);
  });

  it("honours defaultLevel", async () => {
    renderOpen(Vi(), { defaultOpen: true, defaultLevel: 11 });
    await canvas();
    expect(selectedLevels()).toEqual(["11"]);
  });

  it("clicking or tapping the plot moves the scrubber (and so the readout and the marker)", async () => {
    const onLevelChange = vi.fn();
    renderOpen(Vi(), { defaultOpen: true, onLevelChange });
    await canvas();
    const wrapper = document.querySelector(".recharts-wrapper") as HTMLElement;
    const targetX = Number(dots("after")[4].getAttribute("cx"));
    pointerOn(wrapper, "mousemove", targetX, 60);
    pointerOn(wrapper, "click", targetX, 60);
    expect(onLevelChange).toHaveBeenLastCalledWith(5);
    expect(range().value).toBe("5");
    expect(selectedLevels()).toEqual(["5"]);
  });
});

describe("tooltip", () => {
  it("shows PH2's before / after / delta for the level, formatted like the readout", () => {
    const projection = corpusProjection("26.19", "Vi", "Attack Damage");
    const point = chartModel.buildImpactChartModel(projection)!.points[7];
    render(<ImpactChartTooltip active payload={[{ payload: point }]} />);
    const tip = screen.getByTestId("impact-chart-tooltip");
    expect(tip).toHaveTextContent("Level 8");
    expect(tip).toHaveTextContent(`Before: ${Number(point.before.toFixed(1))}`);
    expect(tip).toHaveTextContent(`After: ${Number(point.after.toFixed(1))}`);
    expect(tip.textContent).toContain("Delta: ");
  });

  it("formats exactly like Explore: one decimal at most, a real minus sign, no fake precision", () => {
    const point = { level: 8, before: 85.2345, after: 85.0, absDelta: -0.2345 };
    render(<ImpactChartTooltip active payload={[{ payload: point }]} />);
    const tip = screen.getByTestId("impact-chart-tooltip");
    expect(tip).toHaveTextContent("Level 8");
    expect(tip).toHaveTextContent("Before: 85.2");
    expect(tip).toHaveTextContent("After: 85");
    expect(tip).toHaveTextContent("Delta: −0.2");
  });

  it("renders nothing when inactive or empty", () => {
    const { container, rerender } = render(<ImpactChartTooltip active={false} payload={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ImpactChartTooltip active payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears on hover over the real chart with the hovered level's PH2 values", async () => {
    const projection = corpusProjection("26.19", "Vi", "Attack Damage");
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const wrapper = document.querySelector(".recharts-wrapper") as HTMLElement;
    const x = Number(dots("after")[5].getAttribute("cx"));
    pointerOn(wrapper, "mousemove", x, 60);
    const tip = await screen.findByTestId("impact-chart-tooltip");
    expect(tip).toHaveTextContent("Level 6");
    expect(tip).toHaveTextContent(`Before: ${Number(projection.levels[5].before.toFixed(1))}`);
  });
});

describe("accessibility and layout", () => {
  it("keeps a textual equivalent outside the chart: caption, an 18-row table, the crossover note", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const figure = screen.getByTestId("patch-impact-graph");
    expect(within(figure).getByText(/Base AD by champion level, before and after/, { selector: "figcaption" })).toBeInTheDocument();
    const table = screen.getByTestId("patch-impact-graph-table");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(18);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Level", "Before", "After", "Difference"]);
    const row8 = table.querySelector('tr[data-level="8"]')!;
    expect(row8.textContent).toContain("the difference changes sign here");
    expect(table.querySelector('tr[data-level="9"]')!.textContent).not.toContain("changes sign");
    expect(table.className).toContain("sr-only");
    // The values in the text table are the Explore readout's own formatting for that level.
    fireEvent.change(range(), { target: { value: "8" } });
    const cells = [...row8.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells[0]).toBe(screen.getByTestId("patch-impact-before").textContent);
    expect(cells[1]).toBe(screen.getByTestId("patch-impact-after").textContent);
    expect(cells[2]).toBe(screen.getByTestId("patch-impact-difference").textContent);
  });

  it("hides the picture from assistive tech (the scrubber, readout and table are the equivalent)", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    const el = await canvas();
    expect(el.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByTestId("patch-impact-graph-key").getAttribute("aria-hidden")).toBe("true");
    // Interactive controls stay outside the hidden region.
    expect(range().closest("[aria-hidden='true']")).toBeNull();
  });

  it("does not rely on colour alone: dashed vs solid lines, hollow vs filled markers, a text key", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const [beforeLine, afterLine] = [...document.querySelectorAll<SVGPathElement>(".recharts-line-curve")];
    expect(beforeLine.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(afterLine.getAttribute("stroke-dasharray")).toBeFalsy();
    expect(dots("before")[0].getAttribute("fill")).not.toBe(dots("after")[0].getAttribute("fill"));
    const key = screen.getByTestId("patch-impact-graph-key");
    expect(key.textContent).toContain("Before");
    expect(key.textContent).toContain("After");
    expect(key.querySelectorAll("line[stroke-dasharray]")).toHaveLength(1);
  });

  it("fits a 320px column: the SVG is exactly the container width and nothing is wider", async () => {
    stubChartWidth(320);
    renderOpen(Vi(), { defaultOpen: true });
    const el = await canvas();
    const svg = el.querySelector("svg.recharts-surface")!;
    expect(svg.getAttribute("width")).toBe("320");
    expect(el.className).toMatch(/\bw-full\b/);
    expect(el.className).toMatch(/\bmin-w-0\b/);
    expect(el.className).toMatch(/overflow-hidden/);
    const cx = dots().map((d) => Number(d.getAttribute("cx")));
    expect(Math.max(...cx)).toBeLessThanOrEqual(320);
    expect(Math.min(...cx)).toBeGreaterThanOrEqual(0);
    expect(Number(el.style.height.replace("px", ""))).toBeLessThanOrEqual(208);
  });

  it("uses the roomier height only on wide containers", async () => {
    cleanup();
    vi.restoreAllMocks();
    stubChartWidth(640);
    renderOpen(Vi(), { defaultOpen: true });
    const el = await canvas();
    expect(el.style.height).toBe("208px");
  });

  it("discloses a cropped axis in text, and the note matches the axis the chart uses", async () => {
    const model = chartModel.buildImpactChartModel(corpusProjection("26.19", "Vi", "Attack Damage"))!;
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const note = screen.queryByTestId("patch-impact-graph-axis-note");
    if (model.y.fromZero) expect(note).toBeNull();
    else expect(note).toHaveTextContent(`starts at ${model.y.domain[0]}, not 0`);
  });

  it("reserves the chart's height while the chunk loads and then swaps it out (no layout jump, no empty chart)", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    // Either the reserved block or the finished chart is present, never neither.
    expect(screen.queryByTestId("patch-impact-graph-loading") ?? screen.queryByTestId("patch-impact-graph-canvas")).not.toBeNull();
    await canvas();
    expect(screen.queryByTestId("patch-impact-graph-loading")).toBeNull();
  });

  it("uses no animation (nothing to disable for reduced motion)", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    expect(document.querySelector(".recharts-line-curve")!.getAttribute("class")).not.toMatch(/animat/);
    expect(document.querySelectorAll(".recharts-curve.recharts-line-curve")).toHaveLength(2);
  });
});

/* --------------------------- network and wiring ---------------------------- */

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const PH2_PATHS = new Set([LIST_PATH, STATS_PATH, ...CORPUS_VERSIONS.map(reportPath)]);

function renderRow(version: string, entity: string, property: string) {
  const row = corpusRow(version, entity, property);
  const backend = createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
  const fetchMock = installFetch(backend);
  const xhr = vi.fn();
  vi.stubGlobal("XMLHttpRequest", xhr);
  const beacon = vi.fn();
  Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  render(
    <QueryClientProvider client={queryClient()}>
      <PatchImpactChangeAnalysis ctx={row.ctx} patchVersion={row.patchVersion} />
    </QueryClientProvider>,
  );
  return { backend, fetchMock, xhr, beacon };
}

describe("no network beyond PH2's own Explore", () => {
  it("Vi (all inputs Riot's): opening Explore, drawing the graph and moving the level make zero requests", async () => {
    const { backend, xhr, beacon } = renderRow("26.19", "Vi", "Attack Damage");
    expect(backend.calls.size).toBe(0);
    openExplore();
    await canvas();
    fireEvent.change(range(), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("patch-impact-tick-11"));
    fireEvent.keyDown(range(), { key: "End" });
    const wrapper = document.querySelector(".recharts-wrapper") as HTMLElement;
    pointerOn(wrapper, "mousemove", 100, 50);
    pointerOn(wrapper, "click", 100, 50);
    expect(backend.calls.size).toBe(0);
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("Draven (needs Mogzy's canonical stat): only PH2's evidence requests happen, once, before the graph; none after", async () => {
    const { backend, fetchMock } = renderRow("26.19", "Draven", "Attack Damage");
    expect(backend.calls.size).toBe(0);
    openExplore();
    await canvas();
    await waitFor(() => expect(screen.getByTestId("patch-impact-readout")).toBeInTheDocument());
    const settled = new Map(backend.calls);
    const fetchCount = fetchMock.mock.calls.length;
    // Every request is one PH2 already makes, each at most once.
    for (const [path, count] of settled) {
      expect(PH2_PATHS.has(path), path).toBe(true);
      expect(count).toBeLessThanOrEqual(1);
    }
    expect(settled.get(LIST_PATH)).toBe(1);
    expect(settled.get(STATS_PATH)).toBe(1);

    // Interact with the scrubber, the ticks, the keyboard and the plot.
    for (const value of ["2", "9", "16"]) fireEvent.change(range(), { target: { value } });
    fireEvent.click(screen.getByTestId("patch-impact-tick-6"));
    const wrapper = document.querySelector(".recharts-wrapper") as HTMLElement;
    pointerOn(wrapper, "click", 150, 60);
    await act(async () => {});
    expect(fetchMock.mock.calls.length).toBe(fetchCount);
    expect(new Map(backend.calls)).toEqual(settled);
  });

  it("the graph shows up on the SAME projection the readout shows (no second source)", async () => {
    renderRow("26.19", "Draven", "Attack Damage");
    openExplore();
    await canvas();
    const projection = corpusProjection("26.19", "Draven", "Attack Damage");
    fireEvent.change(range(), { target: { value: "12" } });
    const readoutBefore = screen.getByTestId("patch-impact-before").textContent;
    const dot = dots("before").find((d) => d.dataset.level === "12")!;
    expect(dot.dataset.value).toBe(String(projection.levels[11].before));
    expect(readoutBefore).toBe(String(Number(projection.levels[11].before.toFixed(1))));
  });
});

describe("PH4-A and existing Explore behaviour are intact", () => {
  it("keeps 'Copy link to this change' beside the graph and it still copies the canonical URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderRow("26.19", "Vi", "Attack Damage");
    openExplore();
    await canvas();
    const share = screen.getByTestId("patch-impact-share");
    expect(share).toHaveTextContent("Copy link to this change");
    expect(share.getAttribute("aria-label")).toBe("Copy link to Vi Attack Damage change in Patch 26.19");
    // Order: level control, graph, readout, provenance, share.
    const body = screen.getByTestId("patch-impact-explore-body");
    const order = ["patch-impact-level", "patch-impact-graph", "patch-impact-readout", "patch-impact-provenance", "patch-impact-share"].map(
      (id) => body.querySelector(`[data-testid="${id}"]`)!,
    );
    order.forEach((node, i) => {
      if (i > 0) expect(order[i - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    fireEvent.click(share);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      "https://mogzy.lol/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage",
    );
  });

  it("keeps the scrubber's keyboard model: arrows, Page keys, Home and End", async () => {
    renderOpen(Vi(), { defaultOpen: true, defaultLevel: 9 });
    await canvas();
    fireEvent.keyDown(range(), { key: "ArrowLeft" });
    expect(range().value).toBe("8");
    fireEvent.keyDown(range(), { key: "PageUp" });
    expect(range().value).toBe("11");
    fireEvent.keyDown(range(), { key: "Home" });
    expect(range().value).toBe("1");
    fireEvent.keyDown(range(), { key: "End" });
    expect(range().value).toBe("18");
  });

  it("keeps the readout, provenance and tick buttons, and the graph adds no focusable elements", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    expect(screen.getByTestId("patch-impact-readout")).toBeInTheDocument();
    expect(screen.getByTestId("patch-impact-provenance")).toBeInTheDocument();
    expect(screen.getByTestId("patch-impact-tick-8")).toHaveAttribute("data-crossover", "true");
    const figure = screen.getByTestId("patch-impact-graph");
    expect(figure.querySelectorAll("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])")).toHaveLength(0);
  });

  it("avoids the Impact copy rules' banned words in the graph's own text", async () => {
    renderOpen(Vi(), { defaultOpen: true });
    await canvas();
    const textContent = screen.getByTestId("patch-impact-graph").textContent ?? "";
    expect(textContent).not.toMatch(/\b(power|stronger|weaker|buff|nerf|win rate|tier|Pro Play|Combat Lab)\b/i);
  });
});
