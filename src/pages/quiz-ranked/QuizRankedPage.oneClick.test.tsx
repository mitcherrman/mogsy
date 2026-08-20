/**
 * R3 class selection: picking a class IS joining the Ranked queue.
 *
 * The separate "Join Ranked queue" confirmation is gone. The bot playtest keeps
 * its own explicit button because it is a different DESTINATION, not a
 * confirmation of the class — so it also carries its own class picker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  queue: {
    state: "selecting_class" as string,
    status: null as { classId: string } | null,
    matchId: null,
    selectedClass: "tank" as string | null,
    unavailableReason: null,
    error: null as string | null,
    setSelectedClass: vi.fn(),
    join: vi.fn(),
    joinAs: vi.fn(),
    cancel: vi.fn(),
  },
  createBotMatch: vi.fn().mockResolvedValue({ matchId: "bm1" }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: () => <div data-testid="match-view" />,
}));
vi.mock("./useRankedQueue", () => ({ useRankedQueue: () => h.queue }));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: vi.fn().mockResolvedValue(null),
  createBotMatch: h.createBotMatch,
  getMatchHistory: vi.fn().mockResolvedValue({ entries: [], count: 0 }),
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

beforeEach(() => {
  h.queue.state = "selecting_class";
  h.queue.status = null;
  h.queue.selectedClass = "tank";
  h.queue.error = null;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderPage = async () => {
  const view = render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
  await screen.findByTestId("ranked-class-select");
  return view;
};

describe("R3 class selection is one click", () => {
  it("has no separate join/confirm button", async () => {
    await renderPage();
    expect(screen.queryByTestId("ranked-join")).toBeNull();
    expect(document.body.textContent).not.toMatch(/join ranked queue/i);
  });

  it("joins the queue as the clicked class immediately", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-class-marksman"));
    expect(h.queue.joinAs).toHaveBeenCalledExactlyOnceWith("marksman");
  });

  it("is safe against a double activation", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-class-mage"));
    fireEvent.click(screen.getByTestId("ranked-class-tank"));
    expect(h.queue.joinAs).toHaveBeenCalledTimes(1);
    expect(h.queue.joinAs).toHaveBeenCalledWith("mage");
  });

  it("marks the in-flight card and disables the rest", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-class-mage"));
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-mage")).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByTestId("ranked-class-tank")).toBeDisabled();
    expect(screen.getByTestId("ranked-class-mage")).toHaveTextContent(/joining queue/i);
  });

  it("returns to a selectable state with the error when the join fails", async () => {
    const view = await renderPage();
    fireEvent.click(screen.getByTestId("ranked-class-mage"));
    // The real controller flips to `joining` synchronously...
    h.queue.state = "joining";
    view.rerender(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
    expect(screen.getByTestId("ranked-class-tank")).toBeDisabled();
    // ...and reports a failure by leaving it, which releases the guard.
    h.queue.state = "selecting_class";
    h.queue.error = "Ranked needs a full (non-guest) account.";
    view.rerender(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-tank")).toBeEnabled());
    expect(screen.getByText(/full \(non-guest\) account/i)).toBeInTheDocument();
  });

  it("keeps every class card keyboard reachable", async () => {
    await renderPage();
    for (const id of ["tank", "mage", "marksman"]) {
      expect(screen.getByTestId(`ranked-class-${id}`).tagName).toBe("BUTTON");
    }
  });
});

describe("R3 keeps the bot playtest a distinct action", () => {
  it("carries its own class picker so the path stays reachable", async () => {
    await renderPage();
    for (const id of ["tank", "mage", "marksman"]) {
      expect(screen.getByTestId(`ranked-bot-class-${id}`)).toBeInTheDocument();
    }
  });

  it("starts the bot match with the class chosen in its own panel", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-bot-class-marksman"));
    fireEvent.click(screen.getByTestId("ranked-play-vs-bot"));
    await waitFor(() =>
      expect(h.createBotMatch).toHaveBeenCalledWith("marksman", "standard"));
    // ...and it never queued the player as a side effect.
    expect(h.queue.joinAs).not.toHaveBeenCalled();
  });
});
