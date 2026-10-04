import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { analyzeChampionStatChange } from "@/lib/patch-impact/analyze";
import { canonicalRow, championCard, statLine } from "@/lib/patch-impact/fixtures/builders";
import { parameterFact, projectFlatLevels } from "@/lib/patch-impact/math";
import type { PatchImpactAnalysis, StatProjection, StatValue } from "@/lib/patch-impact/types";
import { buildReportEntityNode } from "@/lib/patch-reports/report-structure";
import { PatchReportEntityCard } from "@/components/patch-reports/PatchReportEntityCard";
import { PatchImpact, type PatchImpactProps } from "./PatchImpact";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

/* ------------------------------ real analyses ----------------------------- */

const analyze = (
  card: ReturnType<typeof championCard>,
  change: ReturnType<typeof statLine>,
  over: Partial<Parameters<typeof analyzeChampionStatChange>[0]> = {},
): PatchImpactAnalysis =>
  analyzeChampionStatChange({
    card,
    change,
    patchVersion: "26.12",
    canonical: [canonicalRow(card.mogzy_entity_ref ?? "Nobody")],
    laterReports: [],
    laterVersionsExpected: [],
    ...over,
  });

/** Lee Sin 26.12 AD Growth 3.7 → 3.4; base AD 66 comes from Mogzy's canonical row. */
function leeSin(): PatchImpactAnalysis {
  const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
  return analyze(championCard("Lee Sin", [change]), change, {
    canonical: [canonicalRow("Lee Sin", { ad: 66, ad_per_level: 3.4 })],
  });
}

/** Vi 26.19 `63 + 3.5/Level → 61 + 3.9/Level`: all four numbers are Riot's; crosses over at L8. */
function viCompound(): PatchImpactAnalysis {
  const change = statLine("base_ad", "Attack Damage", "63 + 3.5/Level", "61 + 3.9/Level");
  return analyze(championCard("Vi", [change]), change, {
    canonical: null,
    laterReports: null,
    laterVersionsExpected: null,
  });
}

/** Fiora 26.19 Health Growth 99 → 105 on base health 620. */
function fiora(): PatchImpactAnalysis {
  const change = statLine("health_growth", "Health Growth", "99", "105");
  return analyze(championCard("Fiora", [change]), change, {
    canonical: [canonicalRow("Fiora", { hp: 620 })],
  });
}

/** LeBlanc 26.17 Attack Speed Growth 2.35% → 1.5%: parameter facts only, permanently. */
function leblancAttackSpeed(): PatchImpactAnalysis {
  const change = statLine("attack_speed_growth", "Attack Speed Growth", "2.35%", "1.5%");
  return analyze(championCard("LeBlanc", [change]), change);
}

/** Lee Sin before canonical stats / later reports have been loaded. */
function leeSinNotLoaded(): PatchImpactAnalysis {
  const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
  return analyze(championCard("Lee Sin", [change]), change, {
    canonical: null,
    laterReports: null,
    laterVersionsExpected: null,
  });
}

function projectedOf(a: PatchImpactAnalysis) {
  if (a.status !== "projected") throw new Error(`expected projected, got ${a.status}`);
  return a;
}

const sv = (value: number, provenance: StatValue["provenance"], patch?: string): StatValue => ({
  value,
  provenance,
  ...(patch ? { patch } : {}),
});

/** A hand-built projected analysis, for shapes the real corpus has no line for. */
function handBuilt(inputs: StatProjection["inputs"], usesMogzyData: boolean): PatchImpactAnalysis {
  const levels = projectFlatLevels(inputs);
  return {
    status: "projected",
    family: "armor",
    facts: [parameterFact({ property: "armor_growth", before: 4.5, after: 4.1 })],
    projection: {
      family: "armor",
      inputs,
      trust: { usesMogzyData, canonicalEntity: null, laterVersionsChecked: [] },
      levels,
      checkpoints: [1, 6, 11, 18],
      crossoverLevel: null,
    },
  };
}

/** Accessible text: what a screen reader gets (decorative aria-hidden marks removed). */
const text = (el: HTMLElement) => {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true']").forEach((node) => node.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
};
const toggle = () => screen.getByTestId("patch-impact-explore-toggle");
const open = () => fireEvent.click(toggle());
const range = () => screen.getByTestId("patch-impact-level") as HTMLInputElement;

/* --------------------------------- compact -------------------------------- */

describe("compact summary", () => {
  it("parameter-only: shows the parameter fact and offers no Explore and no slider", () => {
    render(<PatchImpact analysis={leblancAttackSpeed()} />);
    const root = screen.getByTestId("patch-impact");
    expect(root).toHaveAttribute("data-impact-status", "parameter_only");
    expect(root).toHaveAttribute("data-impact-provenance", "riot_parameter");
    expect(root).toHaveAttribute("data-impact-reason", "projection_deferred");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("Attack speed growth");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("from 2.35% to 1.5%");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("−0.85 pts · −36.2%");
    // A deferred family is not an error: no disclosure, no slider, no apology.
    expect(screen.queryByTestId("patch-impact-explore")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByTestId("patch-impact-projection")).toBeNull();
    expect(root.textContent).not.toMatch(/unavailable|error|failed|missing/i);
  });

  it("parameter-only stays clean even if the wrapper offers callbacks", () => {
    const onRequestProjection = vi.fn();
    render(<PatchImpact analysis={leblancAttackSpeed()} onRequestProjection={onRequestProjection} />);
    expect(screen.queryByTestId("patch-impact-explore")).toBeNull();
    expect(onRequestProjection).not.toHaveBeenCalled();
  });

  it("full projected analysis: parameter change and projected stat impact are separate", () => {
    render(<PatchImpact analysis={leeSin()} />);
    const root = screen.getByTestId("patch-impact");
    expect(root).toHaveAttribute("data-impact-status", "projected");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("AD growth");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("from 3.7 to 3.4");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("−0.3 · −8.1%");
    // The projection is headlined at level 18 and labelled as a base stat.
    const projection = text(screen.getByTestId("patch-impact-projection"));
    expect(projection).toContain("Base AD at level 18");
    expect(projection).toContain("from 128.9 to 123.8");
    expect(projection).toContain("−5.1 · −4%");
    expect(screen.getByText("Parameter change")).toBeInTheDocument();
    expect(screen.getByText("Projected stat impact")).toBeInTheDocument();
    // Collapsed by default: the slider is not in the page until Explore opens.
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByTestId("patch-impact-explore")).not.toHaveAttribute("open");
  });

  it("a compound line shows both halves as parameter facts", () => {
    render(<PatchImpact analysis={viCompound()} />);
    const facts = screen.getAllByTestId("patch-impact-fact");
    expect(facts.map((f) => f.getAttribute("data-property"))).toEqual(["base_ad", "ad_growth"]);
    expect(text(facts[0])).toContain("Base AD from 63 to 61 −2 · −3.2%");
    expect(text(facts[1])).toContain("AD growth from 3.5 to 3.9 +0.4 · +11.4%");
  });

  it("zero before value: shows the absolute difference and never an infinite percentage", () => {
    const analysis: PatchImpactAnalysis = {
      status: "parameter_only",
      family: "mana",
      facts: [parameterFact({ property: "base_mana", before: 0, after: 50 })],
      projectionUnavailable: "projection_deferred",
    };
    render(<PatchImpact analysis={analysis} />);
    const fact = text(screen.getByTestId("patch-impact-fact"));
    expect(fact).toContain("+50");
    expect(fact).not.toMatch(/%|Infinity|NaN|∞/);
    expect(fact).toContain("relative change not defined");
  });

  it("unavailable analyses render nothing at all", () => {
    const { container, rerender } = render(
      <PatchImpact analysis={{ status: "unavailable", reason: "out_of_scope" }} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<PatchImpact analysis={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PatchImpact analysis={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* --------------------------------- explore -------------------------------- */

describe("Explore", () => {
  it("opens and closes, and reports the open once per open", () => {
    const onExplore = vi.fn();
    render(<PatchImpact analysis={leeSin()} onExplore={onExplore} />);
    const details = screen.getByTestId("patch-impact-explore");
    // A native <summary> is in the tab order and activates on Enter/Space.
    expect(toggle().tagName).toBe("SUMMARY");
    expect(details.tagName).toBe("DETAILS");
    open();
    expect(details).toHaveAttribute("open");
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(range()).toBeInTheDocument();
    open();
    expect(details).not.toHaveAttribute("open");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(onExplore).toHaveBeenCalledTimes(1);
    open();
    expect(onExplore).toHaveBeenCalledTimes(2);
  });

  it("the level control is a named slider with an explicit current value", () => {
    render(<PatchImpact analysis={leeSin()} />);
    open();
    const slider = screen.getByRole("slider", { name: /champion level/i });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "18");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("18");
    expect(slider).toHaveAttribute("aria-valuetext", "Level 18: 128.9 → 123.8 base AD");
  });

  it("shows level, before, after, absolute and relative difference", () => {
    render(<PatchImpact analysis={fiora()} />);
    open();
    const readout = screen.getByTestId("patch-impact-readout");
    expect(readout).toHaveAttribute("data-level", "18");
    expect(text(screen.getByTestId("patch-impact-before"))).toContain("2303");
    expect(text(screen.getByTestId("patch-impact-after"))).toContain("2405");
    expect(text(screen.getByTestId("patch-impact-difference"))).toContain("+102");
    expect(text(screen.getByTestId("patch-impact-relative"))).toContain("+4.4%");
  });

  it("level 1: a growth-only change has no difference yet, and says why", () => {
    render(<PatchImpact analysis={fiora()} />);
    open();
    fireEvent.click(screen.getByTestId("patch-impact-tick-1"));
    expect(range()).toHaveValue("1");
    expect(text(screen.getByTestId("patch-impact-before"))).toContain("620");
    expect(text(screen.getByTestId("patch-impact-after"))).toContain("620");
    expect(text(screen.getByTestId("patch-impact-difference"))).toContain("0");
    expect(text(screen.getByTestId("patch-impact-difference"))).not.toMatch(/[+−]/);
    expect(screen.getByText(/no difference at level 1/i)).toBeInTheDocument();
  });

  it("level 18 via its marker", () => {
    render(<PatchImpact analysis={leeSin()} defaultLevel={1} />);
    open();
    expect(range()).toHaveValue("1");
    fireEvent.click(screen.getByTestId("patch-impact-tick-18"));
    expect(range()).toHaveValue("18");
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "18");
    expect(text(screen.getByTestId("patch-impact-difference"))).toContain("−5.1");
  });

  it("has markers at 1, 6, 11 and 18 that are real, pressable buttons", () => {
    render(<PatchImpact analysis={fiora()} />);
    open();
    for (const level of [1, 6, 11, 18]) {
      const tick = screen.getByRole("button", { name: `Level ${level}` });
      expect(tick.tagName).toBe("BUTTON");
      expect(tick).toHaveAttribute("type", "button");
    }
    fireEvent.click(screen.getByRole("button", { name: "Level 6" }));
    expect(screen.getByRole("button", { name: "Level 6" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Level 18" })).toHaveAttribute("aria-pressed", "false");
    expect(range()).toHaveValue("6");
    // No crossover tick when the domain reports none.
    expect(screen.queryByTestId("patch-impact-crossover")).toBeNull();
    expect(document.querySelector("[data-crossover]")).toBeNull();
  });

  it("surfaces the domain's crossover level (and invents none)", () => {
    const a = projectedOf(viCompound());
    expect(a.projection.crossoverLevel).toBe(8);
    render(<PatchImpact analysis={a} />);
    open();
    expect(text(screen.getByTestId("patch-impact-crossover"))).toBe("The difference changes sign at level 8.");
    const tick = screen.getByTestId("patch-impact-tick-8");
    expect(tick).toHaveAttribute("data-crossover", "true");
    expect(tick).toHaveTextContent("Crosses at 8");
    fireEvent.click(tick);
    expect(range()).toHaveValue("8");
    expect(text(screen.getByTestId("patch-impact-difference"))).toMatch(/^\+/);
  });

  it("a crossover on a checkpoint level reuses the checkpoint button", () => {
    const base = projectedOf(viCompound());
    render(<PatchImpact analysis={{ ...base, projection: { ...base.projection, crossoverLevel: 11 } }} />);
    open();
    expect(screen.getAllByTestId("patch-impact-tick-11")).toHaveLength(1);
    expect(screen.getByTestId("patch-impact-tick-11")).toHaveTextContent("11 · crosses");
  });

  it("undefined relative percentage (zero denominator) is shown as not defined, never Infinity", () => {
    const analysis = handBuilt(
      {
        baseBefore: sv(0, "riot_same_card"),
        baseAfter: sv(5, "riot_same_card"),
        growthBefore: sv(0, "riot_same_card"),
        growthAfter: sv(0, "riot_same_card"),
      },
      false,
    );
    render(<PatchImpact analysis={analysis} />);
    open();
    const relative = text(screen.getByTestId("patch-impact-relative"));
    expect(relative).toContain("Not defined");
    expect(relative).not.toMatch(/Infinity|NaN|∞|%/);
    expect(text(screen.getByTestId("patch-impact-difference"))).toBe("+5");
    expect(screen.getByText(/not defined when the before value is 0/i)).toBeInTheDocument();
    // The compact projection line is also safe.
    expect(text(screen.getByTestId("patch-impact-projected-summary"))).not.toMatch(/Infinity|NaN|∞/);
  });
});

/* --------------------------------- slider --------------------------------- */

describe("slider keyboard interaction", () => {
  const press = (key: string) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    act(() => {
      range().dispatchEvent(event);
    });
    return event;
  };

  it("arrows step one level, Home/End jump to the ends, Page keys step three", () => {
    const onLevelChange = vi.fn();
    render(<PatchImpact analysis={leeSin()} onLevelChange={onLevelChange} />);
    open();
    expect(range()).toHaveValue("18");

    expect(press("ArrowLeft").defaultPrevented).toBe(true);
    expect(range()).toHaveValue("17");
    press("ArrowDown");
    expect(range()).toHaveValue("16");
    press("ArrowRight");
    press("ArrowUp");
    expect(range()).toHaveValue("18");
    press("PageDown");
    expect(range()).toHaveValue("15");
    press("PageUp");
    expect(range()).toHaveValue("18");
    press("Home");
    expect(range()).toHaveValue("1");
    press("End");
    expect(range()).toHaveValue("18");
    expect(onLevelChange).toHaveBeenLastCalledWith(18);
  });

  it("never leaves 1–18", () => {
    render(<PatchImpact analysis={leeSin()} defaultLevel={1} />);
    open();
    press("ArrowLeft");
    press("PageDown");
    expect(range()).toHaveValue("1");
    press("End");
    press("ArrowRight");
    press("PageUp");
    expect(range()).toHaveValue("18");
  });

  it("other keys are left alone (Tab must still move focus)", () => {
    render(<PatchImpact analysis={leeSin()} />);
    open();
    expect(press("Tab").defaultPrevented).toBe(false);
    expect(range()).toHaveValue("18");
  });

  it("aria-valuetext and the readout follow every step", () => {
    render(<PatchImpact analysis={leeSin()} />);
    open();
    press("Home");
    expect(range()).toHaveAttribute("aria-valuetext", "Level 1: 66 → 66 base AD");
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "1");
    fireEvent.change(range(), { target: { value: "11" } });
    expect(range()).toHaveValue("11");
    expect(range()).toHaveAttribute("aria-valuetext", "Level 11: 98.5 → 95.8 base AD");
  });

  it("a parameter-only analysis never shows a slider", () => {
    render(<PatchImpact analysis={leblancAttackSpeed()} defaultOpen />);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByTestId("patch-impact-readout")).toBeNull();
  });
});

/* ------------------------------- provenance ------------------------------- */

describe("provenance", () => {
  it("Riot-only parameter fact", () => {
    render(<PatchImpact analysis={leblancAttackSpeed()} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "riot_parameter");
  });

  it("Riot-only projection: every number from Riot, no Mogzy data named", () => {
    render(<PatchImpact analysis={viCompound()} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "riot_projection");
    open();
    const footer = screen.getByTestId("patch-impact-provenance");
    expect(footer).toHaveAttribute("data-provenance", "riot_projection");
    expect(text(footer)).toContain("Projection built entirely from Riot's patch notes.");
    expect(text(footer)).not.toMatch(/Mogzy/);
    expect(screen.getByTestId("patch-impact-source-base")).toHaveAttribute("data-mogzy-data", "false");
    expect(screen.getByTestId("patch-impact-source-growth")).toHaveAttribute("data-mogzy-data", "false");
  });

  it("same-card Riot lines are Riot-only too", () => {
    const base = statLine("base_armor", "Base Armor", "21", "19");
    const growth = statLine("armor_growth", "Armor Growth", "4.5", "4.1");
    const analysis = analyze(championCard("Anivia", [base, growth]), base, { canonical: null });
    render(<PatchImpact analysis={analysis} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "riot_projection");
    open();
    expect(text(screen.getByTestId("patch-impact-source-growth"))).toContain("another line in this entry");
  });

  it("Mogzy companion: the held value is named, quietly, in the footer", () => {
    render(<PatchImpact analysis={leeSin()} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "mogzy_companion_projection");
    open();
    const footer = screen.getByTestId("patch-impact-provenance");
    expect(footer).toHaveAttribute("data-provenance", "mogzy_companion_projection");
    const companion = screen.getByTestId("patch-impact-source-base");
    expect(companion).toHaveAttribute("data-mogzy-data", "true");
    expect(text(companion)).toContain("Base AD 66");
    expect(text(companion)).toContain("Mogzy's current champion data, held the same before and after this patch");
    // The changed half is still Riot's own number.
    expect(screen.getByTestId("patch-impact-source-growth")).toHaveAttribute("data-mogzy-data", "false");
    expect(text(footer)).toContain("uses Mogzy's current champion data for the value this patch did not change");
  });

  it("a companion taken from a later Riot line names that patch", () => {
    const analysis = handBuilt(
      {
        baseBefore: sv(30, "riot_later_before", "26.14"),
        baseAfter: sv(30, "riot_later_before", "26.14"),
        growthBefore: sv(4.5, "riot_line"),
        growthAfter: sv(4.1, "riot_line"),
      },
      true,
    );
    render(<PatchImpact analysis={analysis} />);
    open();
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "mogzy_companion_projection");
    expect(text(screen.getByTestId("patch-impact-source-base"))).toContain("patch 26.14");
  });

  it("does not trust the usesMogzyData flag alone: a canonical input still reads as Mogzy data", () => {
    const analysis = handBuilt(
      {
        baseBefore: sv(30, "canonical_current"),
        baseAfter: sv(30, "canonical_current"),
        growthBefore: sv(4.5, "riot_line"),
        growthAfter: sv(4.1, "riot_line"),
      },
      false,
    );
    render(<PatchImpact analysis={analysis} />);
    expect(screen.getByTestId("patch-impact")).toHaveAttribute("data-impact-provenance", "mogzy_companion_projection");
  });
});

/* ----------------------------- loading contract ---------------------------- */

describe("loading contract", () => {
  const props = (over: Partial<PatchImpactProps> = {}): PatchImpactProps => ({
    analysis: leeSinNotLoaded(),
    ...over,
  });

  it("the not-loaded analysis is parameter-only with a requestable projection", () => {
    const a = leeSinNotLoaded();
    expect(a).toMatchObject({ status: "parameter_only", projectionUnavailable: "history_incomplete" });
  });

  it("initial render shows the parameter change only, with no Explore when nothing can load it", () => {
    render(<PatchImpact {...props()} />);
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("AD growth");
    expect(screen.queryByTestId("patch-impact-projection")).toBeNull();
    expect(screen.queryByTestId("patch-impact-explore")).toBeNull();
  });

  it("opening Explore requests the projection once, then shows loading, then the richer view, in one instance", () => {
    const onRequestProjection = vi.fn();
    const onExplore = vi.fn();
    const { rerender } = render(
      <PatchImpact {...props({ onRequestProjection, onExplore })} />,
    );
    expect(screen.getByTestId("patch-impact-explore")).toBeInTheDocument();
    expect(onRequestProjection).not.toHaveBeenCalled();

    const rootBefore = screen.getByTestId("patch-impact");
    open();
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(onRequestProjection).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("patch-impact-state")).toHaveAttribute("data-state", "idle");

    // The wrapper starts fetching.
    rerender(<PatchImpact {...props({ onRequestProjection, onExplore, projectionStatus: "loading" })} />);
    const loading = screen.getByTestId("patch-impact-state");
    expect(loading).toHaveAttribute("data-state", "loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(onRequestProjection).toHaveBeenCalledTimes(1);

    // The richer analysis arrives on the same instance.
    rerender(
      <PatchImpact {...props({ analysis: leeSin(), onRequestProjection, onExplore, projectionStatus: "idle" })} />,
    );
    expect(screen.getByTestId("patch-impact")).toBe(rootBefore);
    expect(screen.getByTestId("patch-impact-explore")).toHaveAttribute("open");
    expect(range()).toHaveValue("18");
    expect(screen.getByTestId("patch-impact-projection")).toBeInTheDocument();
    expect(onRequestProjection).toHaveBeenCalledTimes(1);
    expect(onExplore).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected level (and the open state) across loading and projected updates", () => {
    const onRequestProjection = vi.fn();
    const { rerender } = render(<PatchImpact analysis={leeSin()} onRequestProjection={onRequestProjection} />);
    open();
    fireEvent.click(screen.getByTestId("patch-impact-tick-6"));
    expect(range()).toHaveValue("6");

    // A refresh: the wrapper drops back to the not-loaded analysis, then returns.
    rerender(
      <PatchImpact analysis={leeSinNotLoaded()} projectionStatus="loading" onRequestProjection={onRequestProjection} />,
    );
    expect(screen.getByTestId("patch-impact-state")).toHaveAttribute("data-state", "loading");
    expect(screen.getByTestId("patch-impact-explore")).toHaveAttribute("open");

    rerender(<PatchImpact analysis={leeSin()} onRequestProjection={onRequestProjection} />);
    expect(range()).toHaveValue("6");
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "6");
    // A refresh that is already "loading" never asks again.
    expect(onRequestProjection).not.toHaveBeenCalled();
  });

  it("an upgraded projection with different numbers updates the readout at the same level", () => {
    const { rerender } = render(<PatchImpact analysis={leeSin()} />);
    open();
    fireEvent.click(screen.getByTestId("patch-impact-tick-11"));
    const before = text(screen.getByTestId("patch-impact-before"));
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const richer = analyze(championCard("Lee Sin", [change]), change, {
      canonical: [canonicalRow("Lee Sin", { ad: 70, ad_per_level: 3.4 })],
    });
    rerender(<PatchImpact analysis={richer} />);
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "11");
    expect(text(screen.getByTestId("patch-impact-before"))).not.toBe(before);
  });

  it("error: a quiet message, the parameter change intact, and a retry", () => {
    const onRequestProjection = vi.fn();
    render(
      <PatchImpact {...props({ onRequestProjection, projectionStatus: "error", defaultOpen: true })} />,
    );
    const state = screen.getByTestId("patch-impact-state");
    expect(state).toHaveAttribute("data-state", "error");
    expect(state).toHaveAttribute("role", "status");
    expect(state).not.toHaveAttribute("role", "alert");
    expect(text(state)).toContain("The parameter change above is unaffected.");
    expect(text(screen.getByTestId("patch-impact-parameter"))).toContain("AD growth");
    // An error never auto-retries.
    expect(onRequestProjection).not.toHaveBeenCalled();
    fireEvent.click(within(state).getByRole("button", { name: "Try again" }));
    expect(onRequestProjection).toHaveBeenCalledTimes(1);
  });

  it("an open Explore that settles with no projection says so quietly", () => {
    const { rerender } = render(
      <PatchImpact {...props({ onRequestProjection: vi.fn(), projectionStatus: "loading", defaultOpen: true })} />,
    );
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const settled = analyze(championCard("Lee Sin", [change]), change, { canonical: [] });
    expect(settled).toMatchObject({ status: "parameter_only", projectionUnavailable: "identity_unresolved" });
    rerender(<PatchImpact analysis={settled} onRequestProjection={vi.fn()} />);
    expect(screen.getByTestId("patch-impact-state")).toHaveAttribute("data-state", "none");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByTestId("patch-impact").textContent).not.toMatch(/error|failed|could not/i);
  });

  it("an analysis that becomes unavailable after loading renders nothing", () => {
    const { container, rerender } = render(<PatchImpact analysis={leeSin()} />);
    rerender(<PatchImpact analysis={{ status: "unavailable", reason: "out_of_scope" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* ------------------------------ motion / layout ----------------------------- */

describe("reduced motion", () => {
  it("every transition class is switched off under prefers-reduced-motion", () => {
    render(<PatchImpact analysis={viCompound()} defaultOpen />);
    const transitioned = Array.from(document.querySelectorAll("[class]")).filter((el) =>
      /(^|\s)transition(-|\s|$)/.test(el.getAttribute("class") ?? ""),
    );
    expect(transitioned.length).toBeGreaterThan(0);
    for (const el of transitioned) {
      expect(el.getAttribute("class")).toContain("motion-reduce:transition-none");
    }
    // No keyframe animation anywhere, so there is nothing to tween.
    expect(document.body.innerHTML).not.toMatch(/animate-|animation/);
  });

  it("values change immediately, with or without the app's reduce-motion setting", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<PatchImpact analysis={leeSin()} />);
    open();
    fireEvent.click(screen.getByTestId("patch-impact-tick-1"));
    // No timers, no tween: the very next read already shows the new level.
    expect(screen.getByTestId("patch-impact-readout")).toHaveAttribute("data-level", "1");
    expect(text(screen.getByTestId("patch-impact-difference"))).toBe("0");
  });
});

describe("mobile-safe layout", () => {
  it("wraps instead of overflowing: no fixed widths, no nowrap, full-width slider", () => {
    render(
      <PatchImpact
        analysis={handBuilt(
          {
            baseBefore: sv(123456789.123, "canonical_current"),
            baseAfter: sv(123456789.123, "canonical_current"),
            growthBefore: sv(4.5, "riot_line"),
            growthAfter: sv(4.1, "riot_line"),
          },
          true,
        )}
        defaultOpen
      />,
    );
    const root = screen.getByTestId("patch-impact");
    expect(root.className).toContain("min-w-0");
    expect(root.className).toContain("max-w-full");
    expect(root.className).toContain("[overflow-wrap:anywhere]");
    expect(range().className).toContain("w-full");
    expect(range().className).toContain("min-w-0");
    const classes = Array.from(root.querySelectorAll("[class]"))
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");
    expect(classes).not.toMatch(/whitespace-nowrap|(^|\s)w-\[|min-w-\[|(^|\s)w-\d{2,}(\s|$)|overflow-x-/);
    // Touch targets: summary, tick buttons and slider are at least 40px tall.
    expect(toggle().className).toContain("min-h-10");
    expect(screen.getByTestId("patch-impact-tick-18").className).toContain("min-h-10");
    expect(range().className).toContain("h-11");
    // The long number is rendered whole (it wraps by CSS, it is not truncated).
    expect(text(screen.getByTestId("patch-impact-source-base"))).toContain("123456789.1");
  });
});

/* ------------------------------ copy and guards ----------------------------- */

describe("copy and trust guards", () => {
  const BANNED = /\bpower\b|overall|stronger|weaker|\bbuff|\bnerf|win[- ]?rate|damage impact|\btier\b|rankings?\b|pro play|combat lab/i;

  it("never uses banned terms in any state", () => {
    const states: PatchImpactProps[] = [
      { analysis: leeSin(), defaultOpen: true },
      { analysis: viCompound(), defaultOpen: true },
      { analysis: leblancAttackSpeed(), defaultOpen: true },
      { analysis: leeSinNotLoaded(), projectionStatus: "error", onRequestProjection: vi.fn(), defaultOpen: true },
      { analysis: leeSinNotLoaded(), projectionStatus: "loading", onRequestProjection: vi.fn(), defaultOpen: true },
      { analysis: leeSinNotLoaded(), onRequestProjection: vi.fn(), defaultOpen: true },
    ];
    for (const state of states) {
      const { container, unmount } = render(<PatchImpact {...state} />);
      expect(container.textContent ?? "").not.toMatch(BANNED);
      unmount();
    }
  });

  it("is presentation only: no fetching, no analyzer, no Mogzy status as authority", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const);
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const [file, source] of sources) {
      expect(source, file).not.toMatch(/mogzy_status|mogzy_current_raw|MogzyStatus/);
      expect(source, file).not.toMatch(/\bfetch\(|react-query|useQuery|axios|supabase/);
      expect(source, file).not.toMatch(/patch-impact\/analyze|from "@\/lib\/patch-impact"/);
      expect(source, file).not.toMatch(/statAtLevel|riotLevelMultiplier/);
    }
  });
});

/* ------------------------------ slot integration ---------------------------- */

describe("fits the Patch Report changeAnalysis slot", () => {
  it("renders after Riot's exact line and leaves it untouched", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const card = championCard("Lee Sin", [change], { entity_type: "champion" });
    const analysis = leeSin();
    render(
      <PatchReportEntityCard
        entity={buildReportEntityNode(card)}
        slots={{ changeAnalysis: () => <PatchImpact analysis={analysis} /> }}
      />,
    );
    const riot = screen.getByTestId("patch-report-values");
    const impact = screen.getByTestId("patch-impact");
    expect(riot.compareDocumentPosition(impact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(riot)).toContain("3.7");
    expect(text(riot)).toContain("3.4");
    expect(riot.closest("li")).toBe(impact.closest("li"));
    // Secondary: smaller type than Riot's 15px line.
    expect(riot.className).toContain("text-[15px]");
    expect(impact.className).toContain("text-xs");
  });
});
