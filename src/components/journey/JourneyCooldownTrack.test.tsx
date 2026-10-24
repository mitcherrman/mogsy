import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { projectCooldownContinuity, SUMMONER_SET_KIND } from "@/lib/journey/cooldownContinuity";
import { JourneyCooldownTrack } from "./JourneyCooldownTrack";

const working = (answer: string, multiplier: number, effective: number,
  sources: Array<[string, "rune" | "item", number]>) => ({
  cooldown_working: {
    contract: "summoner_cooldown_working.v1", spell: "Flash", base_cooldown: 300,
    summoner_spell_haste: sources.reduce((n, s) => n + s[2], 0),
    sources: sources.map(([name, kind, haste]) => ({ name, kind, summoner_spell_haste: haste })),
    cooldown_multiplier: multiplier, effective_cooldown: effective, unit: "seconds", answer,
  },
});
const BASE = working("300s", 1, 300, []);
const IONIAN = working("272.7s", 0.9090909, 272.72727, [["Ionian Boots of Lucidity", "item", 10]]);
const CRIMSON = working("250s", 0.8333333, 250, [["Crimson Lucidity", "item", 20]]);

function track(roundNumber: number, settled: Record<number, object>, revealed: boolean) {
  const c = projectCooldownContinuity({
    linkedSet: { kind: SUMMONER_SET_KIND, position: roundNumber, of: 3 }, roundNumber,
    explanations: new Map(Object.entries(settled).map(([k, v]) => [Number(k), v as Record<string, unknown>])),
    currentRevealed: revealed,
  })!;
  return render(<JourneyCooldownTrack continuity={c} />);
}

describe("JourneyCooldownTrack", () => {
  it("withholds the base on the opening question", () => {
    track(1, {}, false);
    const root = screen.getByTestId("journey-cooldown-track");
    expect(root.dataset.revealed).toBe("false");
    expect(screen.getByTestId("journey-cooldown-track-now").textContent).toContain("?");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/hidden until you answer/);
    expect(root.textContent).not.toMatch(/300/);
  });

  it("carries the settled value into the next question without its answer", () => {
    track(2, { 1: BASE, 2: IONIAN }, false);
    const root = screen.getByTestId("journey-cooldown-track");
    expect(root.textContent).toContain("300s");
    // The current stage's answer is NOT shown before its reveal.
    expect(root.textContent).not.toContain("272.7s");
    expect(screen.queryByTestId("journey-cooldown-track-change")).toBeNull();
    const bar = screen.getByTestId("journey-cooldown-track-bar");
    expect(bar.dataset.from).toBe("1");
    expect(bar.dataset.ratio).toBe("1");
  });

  it("moves the fill to the served share after the reveal and names the change", () => {
    track(2, { 1: BASE, 2: IONIAN }, true);
    const bar = screen.getByTestId("journey-cooldown-track-bar");
    expect(bar.dataset.from).toBe("1");
    expect(bar.dataset.ratio).toBe("0.9090909");
    expect(bar.style.getPropertyValue("--jm-ratio")).toBe("0.9090909");
    expect(screen.getByTestId("journey-cooldown-track-now").textContent).toContain("272.7s");
    expect(screen.getByTestId("journey-cooldown-track-delta").textContent).toBe("≈27.3s shorter");
    const change = screen.getByTestId("journey-cooldown-track-change");
    expect(change.textContent).toBe("+ Ionian Boots of Lucidity · 10 haste");
    expect(change.getAttribute("title")).toBe("+ Ionian Boots of Lucidity (10 summoner spell haste)");
  });

  it("shows path A's boot UPGRADE as a replacement", () => {
    track(3, { 1: BASE, 2: IONIAN, 3: CRIMSON }, true);
    const change = screen.getByTestId("journey-cooldown-track-change");
    expect(change.dataset.changeKind).toBe("upgrade");
    expect(change.textContent).toBe("Crimson Lucidity replaces Ionian Boots of Lucidity · 20 haste");
    expect(screen.getByRole("img").getAttribute("aria-label"))
      .toMatch(/Ionian Boots of Lucidity upgraded to Crimson Lucidity: replaced, not stacked/);
    const bar = screen.getByTestId("journey-cooldown-track-bar");
    expect(bar.dataset.from).toBe("0.9090909");
    expect(bar.dataset.ratio).toBe("0.8333333");
  });

  it("marks the step dots and stays one accessible image plus a live line", () => {
    track(3, { 1: BASE, 2: IONIAN }, false);
    const steps = screen.getByTestId("journey-cooldown-track").querySelectorAll("li");
    expect([...steps].map((s) => s.getAttribute("data-state"))).toEqual(["done", "done", "current"]);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
