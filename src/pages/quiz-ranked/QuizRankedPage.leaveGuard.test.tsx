import { useEffect, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { MatchPhase } from "./useRankedMatch";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

beforeAll(() => {
  globalThis.Request = RouterTestRequest as unknown as typeof Request;
});
afterAll(() => {
  globalThis.Request = NativeRequest;
});

const h = vi.hoisted(() => ({ forfeit: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "userA", is_anonymous: false } }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ displayName: "Tester" }),
}));
vi.mock("@/lib/ranked-public/client", () => ({ getActiveMatch: vi.fn() }));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({
    chrome,
    onPhaseChange,
  }: {
    chrome?: ReactNode;
    onPhaseChange?: (phase: MatchPhase) => void;
  }) => {
    useEffect(() => onPhaseChange?.("active"), [onPhaseChange]);
    return <>
      {chrome}
      <div data-testid="match-view">same match</div>
      <button onClick={() => onPhaseChange?.("match_outro")}>Become terminal</button>
      <button onClick={h.forfeit}>Forfeit Match</button>
    </>;
  },
}));

import QuizRankedPage from "./QuizRankedPage";

afterEach(() => vi.clearAllMocks());

function Destination() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname}</div>;
}

function Controls() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate(-1)}>Browser Back</button>
    <Link to="/lol">HUD Home</Link>
  </>;
}

function mount() {
  const router = createMemoryRouter([
    { path: "/quiz/ranked", element: <><Controls /><QuizRankedPage /></> },
    { path: "*", element: <Destination /> },
  ], {
    initialEntries: ["/quiz", { pathname: "/quiz/ranked", state: { matchId: "m1" } }],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("standalone Ranked route leave guard", () => {
  it("resets the exact blocked POP on Stay and proceeds it on Leave", async () => {
    const router = mount();
    await screen.findByText("Leave Match");

    fireEvent.click(screen.getByText("Browser Back"));
    expect(await screen.findByText("Leave this Ranked match?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Stay in Match"));
    await waitFor(() => expect(screen.queryByText("Leave this Ranked match?")).toBeNull());
    expect(router.state.location.pathname).toBe("/quiz/ranked");
    expect(screen.getByTestId("match-view")).toHaveTextContent("same match");
    expect(h.forfeit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Browser Back"));
    fireEvent.click(await screen.findByText("Leave Match", { selector: "button" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz"));
    expect(h.forfeit).not.toHaveBeenCalled();
  });

  it("guards the active header and HUD Home with the same ordinary navigation", async () => {
    const router = mount();
    fireEvent.click(await screen.findByTestId("ranked-back-to-quiz"));
    fireEvent.click(await screen.findByText("Stay in Match"));
    expect(router.state.location.pathname).toBe("/quiz/ranked");

    fireEvent.click(screen.getByText("HUD Home"));
    fireEvent.click(await screen.findByText("Leave Match", { selector: "button" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
    expect(h.forfeit).not.toHaveBeenCalled();
  });

  it("terminal authority resets a pending leave and never replays its stale destination", async () => {
    const router = mount();
    fireEvent.click(await screen.findByText("Browser Back"));
    expect(await screen.findByText("Leave this Ranked match?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Become terminal"));
    await waitFor(() => expect(screen.queryByText("Leave this Ranked match?")).toBeNull());
    expect(router.state.location.pathname).toBe("/quiz/ranked");
    expect(screen.getByTestId("match-view")).toBeInTheDocument();
    expect(h.forfeit).not.toHaveBeenCalled();
  });
});
