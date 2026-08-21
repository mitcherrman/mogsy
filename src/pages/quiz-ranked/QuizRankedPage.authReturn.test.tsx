/**
 * AUTH1 §4 — the originally reported bug, pinned.
 *
 * A visitor starts a Ranked flow, is told an account is required, signs up, and
 * lands in the League hub instead of back in Ranked. The cause was on the
 * SENDER side: this page linked to a bare "/auth", and the Auth page's default
 * destination is LEAGUE_HOME_ROUTE. Auth was doing exactly what it was asked;
 * nobody had asked it to come back here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("./QuizRankedMatch", () => ({ QuizRankedMatch: () => <div /> }));
vi.mock("./useRankedQueue", () => ({
  useRankedQueue: () => ({
    state: "selecting_class",
    status: null,
    matchId: null,
    selectedClass: null,
    unavailableReason: null,
    error: null,
    setSelectedClass: vi.fn(),
    join: vi.fn(),
    joinAs: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: vi.fn().mockResolvedValue(null),
  createBotMatch: vi.fn(),
  getMatchHistory: vi.fn().mockResolvedValue({ entries: [], count: 0 }),
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={["/quiz/ranked"]}>
      <QuizRankedPage />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  h.user = null;
  vi.clearAllMocks();
});

describe("Ranked account gate returns the player to Ranked", () => {
  it("shows the gate to a signed-out visitor", () => {
    renderGate();
    expect(screen.getByTestId("ranked-account-required")).toBeTruthy();
  });

  it("shows the gate to an anonymous guest too", () => {
    h.user = { id: "anon-1", is_anonymous: true };
    renderGate();
    expect(screen.getByTestId("ranked-account-required")).toBeTruthy();
  });

  it("Ranked → sign up returns to Ranked, not the League hub", () => {
    renderGate();
    expect(screen.getByTestId("ranked-signup-link").getAttribute("href")).toBe(
      "/auth?mode=signup&returnTo=%2Fquiz%2Franked",
    );
  });

  it("Ranked → sign in returns to Ranked, not the League hub", () => {
    renderGate();
    expect(screen.getByTestId("ranked-signin-link").getAttribute("href")).toBe(
      "/auth?returnTo=%2Fquiz%2Franked",
    );
  });

  it("never links to a bare /auth, which would fall back to the hub", () => {
    renderGate();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/auth");
    expect(hrefs).not.toContain("/auth?mode=signup");
  });

  it("does not render the gate at all for a real account", () => {
    h.user = { id: "u1", is_anonymous: false };
    renderGate();
    expect(screen.queryByTestId("ranked-account-required")).toBeNull();
  });
});
