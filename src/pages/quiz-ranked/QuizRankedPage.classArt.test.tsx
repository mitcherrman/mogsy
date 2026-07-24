/**
 * Ranked class art (M1): each class-selection card shows its Ranked class
 * character decoratively, and the matchmaking wait panel shows the queued
 * class. Art never replaces the text labels that carry meaning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MOGZY_CLASS_ASSETS } from "@/components/mascot/mascot-assets";

const h = vi.hoisted(() => ({
  queue: {
    state: "selecting_class" as string,
    status: null as { classId: string } | null,
    matchId: null,
    selectedClass: "tank" as string | null,
    unavailableReason: null,
    error: null,
    setSelectedClass: vi.fn(),
    join: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: () => <div data-testid="match-view" />,
}));
vi.mock("./useRankedQueue", () => ({
  useRankedQueue: () => h.queue,
}));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: vi.fn().mockResolvedValue(null),
  createBotMatch: vi.fn(),
  getMatchHistory: vi.fn().mockResolvedValue({ entries: [], count: 0 }),
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

beforeEach(() => {
  h.queue.state = "selecting_class";
  h.queue.status = null;
  h.queue.selectedClass = "tank";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);

describe("Ranked class-selection art", () => {
  it("shows each class character decoratively inside its own card", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-select")).toBeInTheDocument());

    for (const classId of ["tank", "mage", "marksman"] as const) {
      const card = screen.getByTestId(`ranked-class-${classId}`);
      const art = card.querySelector('[data-mogzy-art-category="class"]');
      expect(art).not.toBeNull();
      expect(art).toHaveAttribute("data-mogzy-art-name", classId);
      expect(art).toHaveAttribute("src", MOGZY_CLASS_ASSETS[classId]);
      // Decorative: the card's text label names the class.
      expect(art).toHaveAttribute("alt", "");
      expect(art).toHaveAttribute("aria-hidden", "true");
      // The label text still carries the meaning.
      expect(card.textContent).toMatch(new RegExp(classId, "i"));
    }
  });

  it("shows the queued class character on the matchmaking wait panel", async () => {
    h.queue.state = "waiting";
    h.queue.status = { classId: "mage" };
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-waiting")).toBeInTheDocument());
    const art = screen
      .getByTestId("ranked-waiting")
      .querySelector('[data-mogzy-art-category="class"]');
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute("data-mogzy-art-name", "mage");
    expect(art).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no class art when the queued class is unknown", async () => {
    h.queue.state = "waiting";
    h.queue.status = { classId: "boss_experimental" };
    h.queue.selectedClass = null;
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-waiting")).toBeInTheDocument());
    expect(
      screen
        .getByTestId("ranked-waiting")
        .querySelector("[data-mogzy-art-category]"),
    ).toBeNull();
  });
});
