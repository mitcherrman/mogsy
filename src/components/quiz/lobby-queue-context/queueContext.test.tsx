/** RL2 — the two centre areas that flank the PLAY seal. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RoleQueueRecord from "./RoleQueueRecord";
import RoleChampionKnowledge from "./RoleChampionKnowledge";
import { productionChampionKnowledge } from "@/lib/quiz/championKnowledge";
import type { RoleMastery } from "@/lib/ranked-public/roleRecords";

const mastery = (over: Partial<RoleMastery> = {}): RoleMastery => ({
  wins: 12, losses: 7, draws: 1, games: 20,
  winRatePercent: 60, netRating: 24, lastPlayedAt: "2026-09-01T00:00:00Z",
  ...over,
});

describe("RoleQueueRecord", () => {
  it("states wins over games, and the win rate", () => {
    render(<RoleQueueRecord role="jungle" mastery={mastery()} />);
    expect(screen.getByTestId("role-queue-record-figure").textContent).toContain("12");
    expect(screen.getByTestId("role-queue-record-figure").textContent).toContain("20");
    expect(screen.getByTestId("role-queue-record-rate").textContent).toBe("60% win rate");
  });

  it("names the window on the label's face and never claims a career record", () => {
    const { container } = render(<RoleQueueRecord role="jungle" mastery={mastery()} />);
    expect(container.textContent).toMatch(/Recent/);
    expect(container.textContent).not.toMatch(/lifetime|all[- ]time|career|total/i);
    // The footnote the owner removed from the left ledger must not come back
    // on a second surface.
    expect(container.textContent).not.toMatch(/Last \d+ ranked matches/i);
  });

  it("invents nothing for a role with no rows — an em dash, not 0/0 or 0%", () => {
    const { container } = render(<RoleQueueRecord role="support" />);
    expect(screen.getByTestId("role-queue-record-figure").textContent?.trim()).toBe("—");
    expect(container.textContent).not.toMatch(/\d+%/);
    expect(screen.getByTestId("role-queue-record").getAttribute("data-state")).toBe("empty");
  });

  it("does not print a stale figure while the history is still loading", () => {
    render(<RoleQueueRecord role="mid" mastery={mastery()} loading />);
    expect(screen.getByTestId("role-queue-record-figure").textContent?.trim()).toBe("—");
  });
});

describe("RoleChampionKnowledge", () => {
  it("draws three medallions and the champions' names, ordered by correct answers", () => {
    render(
      <RoleChampionKnowledge
        role="adc"
        result={{
          state: "ready",
          entries: [
            { champion: "Ezreal", correct: 26, attempts: 40 },
            { champion: "Ashe", correct: 52, attempts: 64 },
            { champion: "Jhin", correct: 44, attempts: 58 },
          ],
        }}
      />,
    );
    const icons = screen.getAllByTestId("champion-knowledge-icon");
    expect(icons.map((i) => i.getAttribute("data-champion"))).toEqual(["Ashe", "Jhin", "Ezreal"]);
  });

  it("renders the ABSENT state in production, which is not an empty record", () => {
    render(<RoleChampionKnowledge role="top" result={productionChampionKnowledge("top")} />);
    const root = screen.getByTestId("role-champion-knowledge");
    expect(root.getAttribute("data-state")).toBe("absent");
    expect(screen.queryAllByTestId("champion-knowledge-icon")).toHaveLength(0);
    expect(screen.getByTestId("role-champion-knowledge-note").textContent).toBe("Not tracked yet");
  });

  it("distinguishes 'nothing answered yet' from 'not tracked'", () => {
    render(<RoleChampionKnowledge role="top" result={{ state: "ready", entries: [] }} />);
    expect(screen.getByTestId("role-champion-knowledge").getAttribute("data-state")).toBe("empty");
    expect(screen.getByTestId("role-champion-knowledge-note").textContent).toBe("No answers yet");
  });

  it("keeps the three slots at full size when empty, so the row does not resize", () => {
    render(<RoleChampionKnowledge role="top" result={{ state: "absent" }} />);
    expect(screen.getAllByTestId("champion-knowledge-slot")).toHaveLength(3);
  });
});
