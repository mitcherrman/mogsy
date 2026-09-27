import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import QuizRankedPage from "./QuizRankedPage";
import { QuizRankedMatch } from "./QuizRankedMatch";
import { RankedRouteHeader } from "./RankedRouteHeader";
import { rankedTerminalResponse } from "@/test/fixtures/rankedTerminal";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA" } }) }));
vi.mock("@/hooks/useProfileIdentity", () => ({ useProfileIdentity: () => ({ displayName: "Tester" }) }));
vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: async () => ({}) }));

afterEach(() => { vi.unstubAllGlobals(); });

function transport(newDiscoveries = true) {
  const fetcher = vi.fn(async (url: string) => new Response(
    JSON.stringify(rankedTerminalResponse(new URL(String(url)).pathname, newDiscoveries)),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  const action = useNavigationType();
  return <>
    <output data-testid="location">{location.pathname + location.search + location.hash}</output>
    <output data-testid="action">{action}</output>
    <button onClick={() => navigate(-1)}>Browser Back</button>
    <button onClick={() => navigate(1)}>Browser Forward</button>
  </>;
}

describe("standalone terminal history through the real route, controller and result UI", () => {
  it.each([
    ["result-primary", "/quiz?play=1"],
    ["result-secondary", "/quiz#history"],
    ["result-tertiary", "/quiz"],
    ["discovery-cta", "/quiz#review"],
    ["discovery-quiet-cta", "/quiz#review"],
    ["ranked-back-to-quiz", "/quiz"],
  ])("%s replaces the result with %s and Back skips the old match", async (control, destination) => {
    transport(control !== "discovery-quiet-cta");
    render(<MemoryRouter initialEntries={["/lol?origin=ranked#academy", { pathname: "/quiz/ranked", state: { matchId: "m1" } }]}>
      <HistoryProbe />
      <Routes><Route path="/quiz/ranked" element={<QuizRankedPage />} />
        <Route path="*" element={<div>Destination</div>} /></Routes>
    </MemoryRouter>);
    await screen.findByTestId("ranked-match-over");
    fireEvent.click(await screen.findByTestId(control));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(destination));
    expect(screen.getByTestId("action")).toHaveTextContent("REPLACE");
    expect(screen.queryByTestId("ranked-match-over")).toBeNull();
    fireEvent.click(screen.getByText("Browser Back"));
    expect(screen.getByTestId("location").textContent).toBe("/lol?origin=ranked#academy");
    fireEvent.click(screen.getByText("Browser Forward"));
    expect(screen.getByTestId("location").textContent).toBe(destination);
  });

  it("hosted completion hands back once without calling standalone navigation", async () => {
    transport();
    const onMatchSettled = vi.fn();
    const onTerminalNavigate = vi.fn();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" onTerminalNavigate={onTerminalNavigate}
      host={{ eyebrow: "Daily Challenge", settlingMessage: "Scoring stage…", onMatchSettled }} />);
    await waitFor(() => expect(onMatchSettled).toHaveBeenCalledTimes(1));
    expect(onTerminalNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ranked-match-over")).toBeNull();
    expect(screen.queryByTestId("result-primary")).toBeNull();
  });

  it("the active/default header still pushes its structural parent", () => {
    render(<MemoryRouter initialEntries={["/quiz/ranked"]}>
      <HistoryProbe /><RankedRouteHeader />
    </MemoryRouter>);
    fireEvent.click(screen.getByTestId("ranked-back-to-quiz"));
    expect(screen.getByTestId("action")).toHaveTextContent("PUSH");
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("legacy session Continue stays local and calls its preset owner once", async () => {
    transport();
    const onSessionComplete = vi.fn();
    const onTerminalNavigate = vi.fn();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA"
      onSessionComplete={onSessionComplete} onTerminalNavigate={onTerminalNavigate} />);
    fireEvent.click(await screen.findByText("Continue"));
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
    expect(onTerminalNavigate).not.toHaveBeenCalled();
  });
});
