import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { fixtureV5Run, V5_ELIGIBLE_DAY } from "@/lib/daily-challenge/run/fixtures";
import { DailyStageChrome } from "./DailyStageChrome";

const run = fixtureV5Run(V5_ELIGIBLE_DAY);

function mount(index: number | null) {
  const stage = index === null ? null : run.stages[index];
  return render(<MemoryRouter><DailyStageChrome run={run} stage={stage} /></MemoryRouter>);
}

describe("Daily compact mobile header", () => {
  it("places back, challenge, mode, and screenshot CTA in one non-wrapping row", () => {
    mount(0);
    const header = screen.getByTestId("daily-stage-chrome");
    expect(header.className).toContain("!flex-nowrap");
    expect(within(header).getByRole("heading", { name: "Daily Challenge" })).toBeInTheDocument();
    const back = within(header).getByRole("link", { name: "Exit Daily Challenge" });
    expect(back).toHaveAttribute("href", "/quiz");
    expect(back).toHaveAttribute("title", "Exit Daily Challenge");
    expect(back).not.toHaveTextContent("Exit Daily Challenge");
    expect(within(header).getByTestId("daily-stage-tag")).toHaveTextContent("Standard");
    const cta = within(header).getByTestId("daily-screenshot-cta");
    expect(cta).toHaveAttribute("href", "https://mogzy.lol");
    expect(cta).toHaveTextContent("mogzy.lol");
    expect(cta).toHaveTextContent("PLAY NOW");
    expect(cta.className).toContain("whitespace-nowrap");
    // Section and server content remain available to assistive technology,
    // while the visible phone row has exactly one mode name.
    expect(within(header).getByTestId("daily-stage-position")).toHaveClass("sr-only");
    expect(within(header).getByTestId("daily-stage-tag")).toHaveAttribute("data-stage-kind", "standard");
    expect(within(header).queryByTestId("daily-stage-content")).not.toBeInTheDocument();
  });

  it("keeps distinctive modes and their readouts; hides no live ruleset number", () => {
    mount(1);
    const header = screen.getByTestId("daily-stage-chrome");
    expect(within(header).getByTestId("daily-stage-tag")).toHaveTextContent("Time Trial");
    expect(within(header).getByTestId("daily-screenshot-cta")).toHaveTextContent("PLAY NOW");
  });

  it("preserves Time Trial's authoritative time-bank readout", () => {
    const stage = { ...run.stages[1], live: {
      timeBank: {
        totalMs: 90_000, remainingMs: 45_000, asOf: new Date().toISOString(),
        draining: false, answerableAt: null, deadline: null, answered: false,
      }, strikes: null,
    } };
    render(<MemoryRouter><DailyStageChrome run={run} stage={stage} /></MemoryRouter>);
    expect(screen.getByRole("timer", { name: /Time bank/ })).toBeInTheDocument();
    expect(screen.getByTestId("daily-time-bank")).toHaveAttribute("data-bank-ms", "45000");
    expect(screen.getByTestId("daily-screenshot-cta")).toHaveTextContent("PLAY NOW");
  });

  it("preserves Survival's authoritative mistake count", () => {
    const stage = { ...run.stages[2], live: {
      timeBank: null, strikes: { used: 1, max: 3 },
    } };
    render(<MemoryRouter><DailyStageChrome run={run} stage={stage} /></MemoryRouter>);
    expect(screen.getByTestId("daily-strikes-count")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("daily-stage-tag")).toHaveTextContent("Survival");
  });

  it("has the same back and CTA when between stages", () => {
    mount(null);
    expect(screen.getByRole("link", { name: "Exit Daily Challenge" })).toHaveAttribute("href", "/quiz");
    expect(screen.getByTestId("daily-screenshot-cta")).toHaveTextContent("mogzy.lol");
    expect(screen.queryByTestId("daily-stage-tag")).not.toBeInTheDocument();
  });
});
