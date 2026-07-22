import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatCheckPage from "./StatCheckPage";

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
}));

function lanes(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
}

function place(container: HTMLElement, handIndex: number, laneIndex: number) {
  fireEvent.click(screen.getByTestId(`stat-check-hand-${handIndex}`));
  fireEvent.click(lanes(container)[laneIndex]);
}

function fillBoard(container: HTMLElement) {
  place(container, 0, 0);
  place(container, 1, 1);
  place(container, 2, 2);
}

function reducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("StatCheckPage tabletop presentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotion(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("moves cards between lanes before lock-in without duplicate visual assignment", () => {
    const { container } = render(<StatCheckPage />);
    const [firstLane, secondLane] = lanes(container);

    place(container, 0, 0);
    expect(within(firstLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.getByText(/On table/i)).toBeInTheDocument();

    fireEvent.click(firstLane);
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(secondLane);

    expect(within(firstLane).getByText(/Place champion/i)).toBeInTheDocument();
    expect(within(secondLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.getAllByText(/On table/i)).toHaveLength(1);
  });

  it("prevents reassignment after lock-in and reaches resolved reveal state", () => {
    const { container } = render(<StatCheckPage />);
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));
    fireEvent.click(screen.getByTestId("stat-check-hand-3"));
    fireEvent.click(lanes(container)[0]);

    act(() => vi.advanceTimersByTime(2_200));

    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-board-result")).toHaveTextContent(/board/i);
    expect(screen.getByTestId("stat-check-damage-player")).toHaveTextContent(/Total:/);
    expect(screen.getByTestId("stat-check-damage-bot")).toHaveTextContent(/Total:/);
  });

  it("uses the reduced-motion path without waiting through the staged reveal", () => {
    reducedMotion(true);
    const { container } = render(<StatCheckPage />);
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));

    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  });

  it("restart clears pending reveal state", () => {
    const { container } = render(<StatCheckPage />);
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    act(() => vi.advanceTimersByTime(2_200));

    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    expect(screen.getByText(/Bot cards stay face-down/i)).toBeInTheDocument();
  });

  it("updates discards after next round and keeps visible intel continuous", () => {
    const { container } = render(<StatCheckPage />);
    const firstIntel = screen.getByTestId("stat-check-next-intel-label").textContent ?? "";
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    act(() => vi.advanceTimersByTime(2_200));

    fireEvent.click(screen.getByTestId("stat-check-next-round"));

    expect(screen.getByTestId("stat-check-player-discard")).toHaveTextContent(/3/);
    expect(screen.getByTestId("stat-check-bot-discard")).toHaveTextContent(/3/);
    expect(lanes(container).some((lane) => lane.textContent?.includes(firstIntel))).toBe(true);
  });

  it("clears resolved presentation state when advancing to the next round", () => {
    const { container } = render(<StatCheckPage />);
    const firstIntel = screen.getByTestId("stat-check-next-intel-label").textContent ?? "";
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    act(() => vi.advanceTimersByTime(2_200));

    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-player")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stat-check-next-round"));

    expect(screen.getByText(/Round 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Selecting/i)).toBeInTheDocument();
    expect(screen.queryByTestId("stat-check-board-result")).toBeNull();
    expect(screen.queryByTestId("stat-check-damage-player")).toBeNull();
    expect(screen.queryByTestId("stat-check-damage-bot")).toBeNull();
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    expect(screen.getByText(/Bot cards stay face-down until lock-in/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Concealed/i)).toHaveLength(3);
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
    expect(screen.queryByText(/Decisive \+1/i)).toBeNull();
    expect(lanes(container).some((lane) => lane.textContent?.includes("margin"))).toBe(false);
    expect(lanes(container).some((lane) => lane.textContent?.includes("Decisive +1"))).toBe(false);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
    expect(screen.getByTestId("stat-check-player-discard")).toHaveTextContent(/3/);
    expect(screen.getByTestId("stat-check-bot-discard")).toHaveTextContent(/3/);
    expect(lanes(container).some((lane) => lane.textContent?.includes(firstIntel))).toBe(true);
  });

  it("restart after resolution clears cached results, pending timers, and staged UI", () => {
    const { container } = render(<StatCheckPage />);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    act(() => vi.advanceTimersByTime(2_200));

    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    act(() => vi.advanceTimersByTime(2_200));

    expect(screen.getByText(/Round 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Selecting/i)).toBeInTheDocument();
    expect(screen.queryByTestId("stat-check-board-result")).toBeNull();
    expect(screen.queryByTestId("stat-check-damage-player")).toBeNull();
    expect(screen.queryByTestId("stat-check-damage-bot")).toBeNull();
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    expect(screen.getAllByText(/Concealed/i)).toHaveLength(3);
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });
});
