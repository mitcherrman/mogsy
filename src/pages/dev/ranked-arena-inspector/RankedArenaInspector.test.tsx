import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedArenaInspector from "./RankedArenaInspector";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

const select = (key: string) => fireEvent.click(screen.getByTestId(`inspector-state-${key}`));

describe("RankedArenaInspector", () => {
  it("renders the canonical arena from fixtures (no crash, default state)", () => {
    render(<RankedArenaInspector />);
    expect(screen.getByTestId("ranked-arena-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-stage")).toBeInTheDocument();
    // Default "Level 1" state renders canonical combatant panels (hp-<id>).
    expect(screen.getByTestId("hp-you")).toBeInTheDocument();
    expect(screen.getByTestId("hp-opp")).toBeInTheDocument();
  });

  it("replays the discovery ceremony without a match or persistence, under a fresh fixture id", () => {
    render(<RankedArenaInspector />);
    select("discovery-reveal");
    const first = screen.getByTestId("discovery-reveal");
    expect(first).toHaveAttribute("data-new-count", "3");
    expect(first).toHaveAttribute("data-ceremony", "true");
    const firstStage = screen.getByTestId("inspector-replay-stage");
    fireEvent.click(screen.getByTestId("inspector-replay"));
    expect(screen.getByTestId("inspector-replay-stage")).not.toBe(firstStage);
    const second = screen.getByTestId("discovery-reveal");
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute("data-new-count", "3");
  });

  it("covers one, many, metadata-unavailable and none", () => {
    render(<RankedArenaInspector />);
    select("discovery-one");
    expect(screen.getByTestId("discovery-reveal")).toHaveAttribute("data-new-count", "1");
    expect(screen.getByTestId("discovery-headline")).toHaveTextContent("1 new question added");
    select("discovery-many");
    expect(screen.getAllByTestId("discovery-entry")).toHaveLength(7);
    select("discovery-unavailable");
    expect(screen.getAllByTestId("discovery-entry")).toHaveLength(1);
    expect(screen.getByTestId("discovery-entry")).toHaveAttribute("data-metadata", "unavailable");
    select("discovery-none");
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
    expect(screen.getByTestId("discovery-quiet")).toHaveTextContent("No new questions this match");
  });

  it("composes the Ranked end screen the way production does: compact body, reward in the open flow", () => {
    render(<RankedArenaInspector />);
    select("results-full-rated");
    expect(screen.getByTestId("match-over-frame")).toHaveAttribute("data-density", "compact");
    expect(screen.getByTestId("ranked-result-duel")).toBeInTheDocument();
    expect(screen.getByTestId("game-results-body")).toHaveAttribute("data-variant", "compact");
    const reveal = screen.getByTestId("discovery-reveal");
    expect(screen.getByTestId("result-review")).toContainElement(reveal);
    expect(screen.getByTestId("result-details")).not.toContainElement(reveal);
    expect(reveal).toHaveAttribute("data-ceremony", "true");
    // The strip's own discovery count comes from the SAME fixture through the
    // production adapter, so the two never disagree.
    expect(within(screen.getByTestId("result-summary-strip")).getByTestId("result-progress-discoveries"))
      .toHaveTextContent("+3");
  });

  it("previews a reload / History visit as the same screen at rest", () => {
    render(<RankedArenaInspector />);
    select("results-reload");
    expect(screen.getByTestId("discovery-reveal")).toHaveAttribute("data-ceremony", "false");
  });

  it("previews earned Academy XP through the production adapter, and the no-XP run beside it", () => {
    render(<RankedArenaInspector />);
    select("results-earned-xp");
    expect(screen.getByTestId("result-progress-xp-earned")).toHaveTextContent("+80 XP");
    expect(screen.getByTestId("result-progress-xp-earned").querySelector("[data-earned-xp=true]"))
      .toBeInTheDocument();
    // The account total beside it is a record, not a gain.
    expect(screen.getByTestId("result-progress-xp")).toHaveTextContent("4,820");
    expect(screen.getByTestId("result-progress-xp").querySelector("[data-earned-xp]")).toBeNull();
    const firstStage = screen.getByTestId("inspector-replay-stage");
    fireEvent.click(screen.getByTestId("inspector-replay"));
    expect(screen.getByTestId("inspector-replay-stage")).not.toBe(firstStage);
    expect(screen.getByTestId("result-progress-xp-earned")).toHaveTextContent("+80 XP");
    select("results-practice");
    expect(screen.queryByTestId("result-progress-xp-earned")).toBeNull();
    expect(screen.getByTestId("result-progress-xp")).toHaveTextContent("4,820");
  });

  it("previews the Daily's main result from the pending frame to the settled reveal, replayable", () => {
    vi.useFakeTimers();
    try {
      render(<RankedArenaInspector />);
      select("results-daily-main");
      expect(screen.getByTestId("daily-main-result-scene")).toHaveAttribute("data-settled", "false");
      expect(screen.getByTestId("daily-main-result")).toHaveAttribute("data-pending", "true");
      expect(screen.getByTestId("result-mascot")).toHaveAttribute("data-pose", "thinking");
      act(() => { vi.advanceTimersByTime(1400); });
      expect(screen.getByTestId("daily-main-result")).toHaveAttribute("data-settled", "true");
      expect(screen.getByTestId("result-mascot")).toHaveAttribute("data-pose", "cheering");
      expect(screen.getByTestId("daily-main-score-reveal").querySelector(".sr-only"))
        .toHaveTextContent("1,234");
      const firstStage = screen.getByTestId("inspector-replay-stage");
      fireEvent.click(screen.getByTestId("inspector-replay"));
      expect(screen.getByTestId("inspector-replay-stage")).not.toBe(firstStage);
      expect(screen.getByTestId("daily-main-result")).toHaveAttribute("data-pending", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles the app's own Reduce Motion for the page, and takes it off again on unmount", () => {
    const { unmount } = render(<RankedArenaInspector />);
    const toggle = screen.getByTestId("inspector-reduced-motion");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    fireEvent.click(toggle);
    unmount();
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });

  it("leaves a Reduce Motion the user already had alone", () => {
    document.documentElement.classList.add("reduce-motion");
    const { unmount } = render(<RankedArenaInspector />);
    fireEvent.click(screen.getByTestId("inspector-reduced-motion"));
    fireEvent.click(screen.getByTestId("inspector-reduced-motion"));
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });

  it("reports the audio engine's state so a silent preview is explainable", () => {
    render(<RankedArenaInspector />);
    const status = screen.getByTestId("inspector-audio-status");
    expect(status).toHaveTextContent(/Audio:/);
    expect(status.dataset.contextState).toBeDefined();
  });

  it("imports no gameplay engine / controller / client / service", () => {
    const src = readFileSync(resolve(__dirname, "RankedArenaInspector.tsx"), "utf-8");
    const importLines = src.split("\n").filter((l) => l.trimStart().startsWith("import"));
    const joined = importLines.join("\n");
    // Legit imports: ranked-arena components + ranked-core view types/adapters.
    // Anything below would make this a second implementation of the game.
    for (const forbidden of [
      "useRankedMatch", "useRankedQueue", "ranked-public/client",
      "ranked_public", "/service", "/worker", "duel_round", "duel_match",
      "duel_combat", "createBotMatch",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
    // Positive: it DOES render through the canonical arena components.
    expect(joined).toContain("@/components/ranked-arena/CombatantPanel");
  });
});
