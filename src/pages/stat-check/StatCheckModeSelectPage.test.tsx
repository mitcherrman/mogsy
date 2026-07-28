/**
 * Stat Check entrance: the three modes render, the two active ones route to
 * their own public routes, and Online Queue is inert (no navigation, no room,
 * no network) while still announcing itself as coming soon.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import StatCheckModeSelectPage from "./StatCheckModeSelectPage";

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  getRoom: vi.fn(),
  getActiveRoom: vi.fn(),
  setReady: vi.fn(),
  cancelRoom: vi.fn(),
}));

vi.mock("@/lib/stat-check-online/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stat-check-online/client")>();
  return { ...original, statCheckOnlineApi: { ...original.statCheckOnlineApi, ...api } };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderModeSelect() {
  return render(
    <MemoryRouter initialEntries={["/quiz/stat-check"]}>
      <LocationProbe />
      <Routes>
        <Route path="/quiz/stat-check" element={<StatCheckModeSelectPage />} />
        <Route path="/quiz/stat-check/bot" element={<div data-testid="bot-route" />} />
        <Route path="/quiz/stat-check/private" element={<div data-testid="private-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StatCheckModeSelectPage", () => {
  it("renders all three modes", () => {
    renderModeSelect();
    expect(screen.getByTestId("sc-mode-bot")).toHaveTextContent(/Play vs Bot/i);
    expect(screen.getByTestId("sc-mode-private")).toHaveTextContent(/Private Match/i);
    expect(screen.getByTestId("sc-mode-queue")).toHaveTextContent(/Online Queue/i);
  });

  it("routes Play vs Bot to the public bot route", () => {
    renderModeSelect();
    fireEvent.click(screen.getByTestId("sc-mode-bot"));
    expect(screen.getByTestId("bot-route")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/quiz/stat-check/bot");
  });

  it("routes Private Match into the private-room flow", () => {
    renderModeSelect();
    fireEvent.click(screen.getByTestId("sc-mode-private"));
    expect(screen.getByTestId("private-route")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/quiz/stat-check/private");
  });

  it("keeps the active modes focusable and keyboard-activatable", () => {
    renderModeSelect();
    for (const id of ["sc-mode-bot", "sc-mode-private"]) {
      const card = screen.getByTestId(id);
      // Anchors with an href are natively reachable and Enter-activatable; the
      // cards must not have opted out of that with a negative tabindex.
      expect(card.tagName).toBe("A");
      expect(card).toHaveAttribute("href");
      expect(card.getAttribute("tabindex")).not.toBe("-1");
      card.focus();
      expect(card).toHaveFocus();
    }
  });

  it("marks Online Queue disabled and coming soon, with an accessible explanation", () => {
    renderModeSelect();
    const queue = screen.getByTestId("sc-mode-queue");
    expect(queue).toBeDisabled();
    expect(queue).toHaveAttribute("aria-disabled", "true");
    expect(queue).toHaveTextContent(/coming soon/i);
    expect(
      screen.getByText(/Online matchmaking is not available yet/i),
    ).toBeInTheDocument();
    // The explanation is wired to the control, not merely nearby.
    expect(queue.getAttribute("aria-describedby")).toBe(
      screen.getByText(/Online matchmaking is not available yet/i).id,
    );
  });

  it("does not show fabricated queue status", () => {
    renderModeSelect();
    const queue = screen.getByTestId("sc-mode-queue");
    expect(queue.textContent ?? "").not.toMatch(/players?\s+(online|waiting|in queue)|estimated wait|\d+\s*(s|sec|min)\b/i);
  });

  it("Online Queue never navigates, creates a room, or calls the API", () => {
    renderModeSelect();
    const queue = screen.getByTestId("sc-mode-queue");

    fireEvent.click(queue);
    fireEvent.keyDown(queue, { key: "Enter" });
    fireEvent.keyDown(queue, { key: " " });
    // A native disabled button is excluded from keyboard activation entirely:
    // it is skipped by tab order and cannot even take focus.
    queue.focus();
    expect(queue).not.toHaveFocus();
    // It is a button, not a link — there is no href to follow.
    expect(queue.tagName).toBe("BUTTON");
    expect(queue).not.toHaveAttribute("href");

    expect(screen.getByTestId("location")).toHaveTextContent("/quiz/stat-check");
    expect(screen.getByTestId("sc-mode-queue")).toBeInTheDocument();
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });
});
