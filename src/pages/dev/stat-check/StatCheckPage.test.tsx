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
  placeWithoutSettling(container, handIndex, laneIndex);
  act(() => vi.advanceTimersByTime(1_000));
}

function placeWithoutSettling(container: HTMLElement, handIndex: number, laneIndex: number) {
  fireEvent.click(screen.getByTestId(`stat-check-hand-${handIndex}`));
  fireEvent.click(lanes(container)[laneIndex]);
}

function fillBoard(container: HTMLElement) {
  place(container, 0, 0);
  place(container, 1, 1);
  place(container, 2, 2);
}

function laneTextIncludesFamily(container: HTMLElement, family: string) {
  return lanes(container).some((lane) => lane.textContent?.toLowerCase().includes(family.toLowerCase()));
}

function finishReveal() {
  act(() => vi.advanceTimersByTime(4_000));
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

function mockGeometry() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    const testId = this.getAttribute("data-testid") ?? "";
    if (testId.startsWith("stat-check-hand-")) return domRect(80, 520, 120, 160);
    if (testId.startsWith("stat-check-lane-")) {
      const index = testId.includes("highest-hp") ? 0 : testId.includes("movement-speed") ? 1 : 2;
      return domRect(120 + index * 240, 140, 210, 280);
    }
    if (this.textContent?.includes("Place champion")) return domRect(120, 360, 180, 96);
    return domRect(0, 0, 120, 160);
  });
}

function domRect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) } as DOMRect;
}

describe("StatCheckPage tabletop presentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    reducedMotion(false);
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("moves cards between lanes before lock-in without duplicate visual assignment", () => {
    const { container } = render(<StatCheckPage />);
    const [firstLane, secondLane] = lanes(container);

    expect(screen.getByText(/Shared pool/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your deck/i)).toBeNull();
    expect(screen.queryByText(/Bot deck/i)).toBeNull();

    placeWithoutSettling(container, 0, 0);
    expect(within(firstLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.queryByText(/On table/i)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);

    fireEvent.click(firstLane);
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(secondLane);

    expect(within(firstLane).getByText(/Place champion/i)).toBeInTheDocument();
    expect(within(secondLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.queryByText(/On table/i)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
  });

  it("returns a placed card to the normalized hand fan", () => {
    const { container } = render(<StatCheckPage />);
    const [firstLane] = lanes(container);

    placeWithoutSettling(container, 0, 0);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);

    fireEvent.click(firstLane);

    expect(within(firstLane).getByText(/Place champion/i)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("starts and completes placement overlay travel without stale cards", () => {
    const { container } = render(<StatCheckPage />);

    placeWithoutSettling(container, 0, 0);

    expect(screen.getByTestId("stat-check-motion-overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("persists and applies slow-motion animation speed", () => {
    const { container, unmount } = render(<StatCheckPage />);
    const speed = screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement;

    expect(speed.value).toBe("1");
    fireEvent.change(speed, { target: { value: "0.5" } });
    expect(window.sessionStorage.getItem("stat-check-animation-speed")).toBe("0.5");

    placeWithoutSettling(container, 0, 0);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    unmount();
    render(<StatCheckPage />);
    expect((screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).value).toBe("0.5");
  });

  it("changing speed during active placement clears transient overlays", () => {
    const { container } = render(<StatCheckPage />);
    placeWithoutSettling(container, 0, 0);

    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "0.25" } });

    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("does not leave a pending drag after an ordinary card click", () => {
    const { container } = render(<StatCheckPage />);
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.click(card);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 101, clientY: 541 });
    fireEvent.click(lanes(container)[0]);

    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
    expect(within(lanes(container)[0]).queryByText(/Place champion/i)).toBeNull();
  });

  it("activates pointer drag after threshold and commits once over a valid lane", () => {
    mockGeometry();
    render(<StatCheckPage />);
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 170, clientY: 180 });

    expect(screen.getAllByTestId(/^stat-check-drag-card-/)).toHaveLength(1);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 170, clientY: 180 });
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByTestId(/^stat-check-drag-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("returns a dragged card when released outside valid lanes", () => {
    mockGeometry();
    render(<StatCheckPage />);
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 350, clientY: 700 });
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 350, clientY: 700 });

    expect(screen.queryByTestId(/^stat-check-drag-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
  });

  it("pointercancel and Escape cancel active drags without assignment", () => {
    mockGeometry();
    const { unmount } = render(<StatCheckPage />);
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 170, clientY: 180 });
    fireEvent.pointerCancel(card, { pointerId: 1 });

    expect(screen.queryByTestId(/^stat-check-drag-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);

    unmount();
    render(<StatCheckPage />);
    const nextCard = screen.getByTestId("stat-check-hand-0");
    fireEvent.pointerDown(nextCard, { pointerId: 2, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(nextCard, { pointerId: 2, clientX: 170, clientY: 180 });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId(/^stat-check-drag-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("restart cancels active overlay travel", () => {
    const { container } = render(<StatCheckPage />);
    placeWithoutSettling(container, 0, 0);

    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));

    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("prevents reassignment after lock-in and reaches resolved reveal state", () => {
    const { container } = render(<StatCheckPage />);
    expect(lanes(container).some((lane) => /Decisive \d+%/.test(lane.textContent ?? ""))).toBe(true);
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(lanes(container)[0]);

    finishReveal();

    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-board-result")).toHaveTextContent(/board/i);
    expect(screen.getByTestId("stat-check-damage-player")).toHaveTextContent(/Total:/);
    expect(screen.getByTestId("stat-check-damage-bot")).toHaveTextContent(/Total:/);
    expect(lanes(container).some((lane) => /Decisive at \d+%/.test(lane.textContent ?? ""))).toBe(true);
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
    finishReveal();

    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    expect(screen.getByText(/Bot cards stay face-down/i)).toBeInTheDocument();
  });

  it("updates discards after next round and keeps visible intel continuous", () => {
    const { container } = render(<StatCheckPage />);
    const firstIntel = screen.getByTestId("stat-check-next-intel-label").textContent ?? "";
    expect(screen.getByTestId("stat-check-next-intel")).toHaveTextContent(/One upcoming stat family/i);
    expect(screen.getByTestId("stat-check-next-intel")).not.toHaveTextContent(/Higher wins|Lower wins|Level 1|Level 18/i);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();

    fireEvent.click(screen.getByTestId("stat-check-next-round"));

    expect(screen.getByTestId("stat-check-player-discard")).toHaveTextContent(/3/);
    expect(screen.getByTestId("stat-check-bot-discard")).toHaveTextContent(/3/);
    expect(laneTextIncludesFamily(container, firstIntel)).toBe(true);
  });

  it("clears resolved presentation state when advancing to the next round", () => {
    const { container } = render(<StatCheckPage />);
    const firstIntel = screen.getByTestId("stat-check-next-intel-label").textContent ?? "";
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();

    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-player")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    act(() => vi.advanceTimersByTime(1_000));

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
    expect(laneTextIncludesFamily(container, firstIntel)).toBe(true);
  });

  it("restart after resolution clears cached results, pending timers, and staged UI", () => {
    const { container } = render(<StatCheckPage />);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();

    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    finishReveal();

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
