import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatCheckPage, { CategoryMarker, LaneResult } from "./StatCheckPage";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import { generateCategoryBoard, type CategoryResult, type StatCategory, type StatCheckCard } from "./statCheckEngine";

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
  resolveAssetUrl: () => null,
}));

function lanes(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
}

function laneChampions(lane: HTMLElement) {
  // The destination board card pre-mounts invisibly (visibility: hidden) while
  // its travel clone is in flight so the champion image is decoded before the
  // handoff; only cards outside that hidden pre-mount are visibly on the board.
  return Array.from(lane.querySelectorAll<HTMLElement>("[data-card-champion]"))
    .filter((element) => !element.closest('[data-board-premount="true"]'))
    .map((element) => element.getAttribute("data-card-champion"));
}

// Full hero-play choreography at 1x is ~1.72s (1,635ms clone + 80ms handoff);
// 3s settles placement plus hand reflow.
const PLACEMENT_SETTLE_MS = 3_000;

function place(container: HTMLElement, handIndex: number, laneIndex: number) {
  placeWithoutSettling(container, handIndex, laneIndex);
  act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
}

function animPhase(container: HTMLElement) {
  return container.querySelector("main")?.getAttribute("data-anim-phase");
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

/** Complete an open item-choice phase (opening or post-cadence), if present. */
function completeItemChoiceIfPresent(itemId = "ruby-crystal") {
  const option = screen.queryByTestId(`stat-check-item-option-${itemId}`);
  if (!option) return false;
  fireEvent.click(option);
  fireEvent.click(screen.getByTestId("stat-check-item-confirm"));
  return true;
}

/**
 * Render the page and complete the mandatory pre-Round-1 item choice so the
 * classic placement flow tests start from the selecting phase, exactly as
 * before the item system existed.
 */
function renderPage(options: { skipItemChoice?: boolean; item?: string } = {}) {
  const view = render(<StatCheckPage />);
  if (!options.skipItemChoice) {
    expect(completeItemChoiceIfPresent(options.item)).toBe(true);
  }
  return view;
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

const markerCategoryBase = {
  active: true,
  explanation: "",
  getValue: (card: StatCheckCard) => card.stats.hp,
  formatValue: (value: number) => String(Math.round(value)),
};

const higherHp18Category: StatCategory = {
  ...markerCategoryBase,
  id: "highest-hp-18",
  label: "Highest level-18 health",
  shortLabel: "L18 HP",
  family: "health",
  level: 18,
  direction: "higher",
  decisiveThreshold: 0.075,
};

const lowerArmorCategory: StatCategory = {
  ...markerCategoryBase,
  id: "lowest-armor-1",
  label: "Lowest level-1 armor",
  shortLabel: "Low armor",
  family: "armor",
  level: 1,
  direction: "lower",
  decisiveThreshold: 0.25,
};

const sampleCard = (name: string): StatCheckCard => ({
  id: name.toLowerCase(),
  name,
  stats: {
    hp: 600,
    hpPerLevel: 90,
    ad: 60,
    adPerLevel: 3,
    armor: 30,
    armorPerLevel: 4,
    magicResist: 32,
    moveSpeed: 340,
    attackRange: 175,
    attackSpeed: 0.65,
    attackSpeedPerLevel: 2,
  },
});

function sampleResult(overrides: Partial<CategoryResult>): CategoryResult {
  return {
    category: higherHp18Category,
    playerCard: sampleCard("Garen"),
    botCard: sampleCard("Lux"),
    playerNaturalValue: 625,
    botNaturalValue: 604,
    playerItem: null,
    botItem: null,
    playerBonus: 0,
    botBonus: 0,
    playerValue: 625,
    botValue: 604,
    winner: "player",
    margin: 0.034,
    decisive: false,
    ...overrides,
  };
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

  it("plays a full fixture match and shows a resettable playtest summary", () => {
    const { container } = renderPage();
    expect(screen.getByTestId("stat-check-rules-note")).toHaveTextContent(/Win 2 of 3 lanes/i);
    expect(screen.getByTestId("stat-check-rules-note")).toHaveTextContent(/discarded for the whole match/i);

    const fillFirstEmptyLanes = () => {
      for (let i = 0; i < 3; i++) {
        const empty = lanes(container).find((lane) => within(lane).queryByText(/Place champion/i));
        if (!empty) break;
        fireEvent.click(screen.getByTestId("stat-check-hand-0"));
        fireEvent.click(empty);
        act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
      }
    };
    for (let round = 0; round < 5 && !screen.queryByTestId("stat-check-match-over"); round++) {
      fillFirstEmptyLanes();
      fireEvent.click(screen.getByTestId("stat-check-lock"));
      finishReveal();
      // Cadence rounds open an item choice before Next Round becomes available.
      completeItemChoiceIfPresent();
      const next = screen.queryByTestId("stat-check-next-round");
      if (next) {
        fireEvent.click(next);
        act(() => vi.advanceTimersByTime(12_000));
      }
    }

    expect(screen.getByTestId("stat-check-match-over")).toBeInTheDocument();
    const summary = screen.getByTestId("stat-check-summary");
    expect(summary).toHaveTextContent(/Playtest summary/i);
    expect(summary).toHaveTextContent(/Rounds4/);
    expect(summary).toHaveTextContent(/Shared pool remaining0/);
    expect(summary).toHaveTextContent(/Discards \(you \/ bot\)12 \/ 12/);
    expect(summary).toHaveTextContent(/Clues shown:/);

    fireEvent.click(within(screen.getByTestId("stat-check-match-over")).getByRole("button", { name: /restart/i }));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByTestId("stat-check-summary")).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent(/20 \/ 20 HP/);
  });

  it("selects, deselects, and switches hand-card selection with clicks", () => {
    renderPage();
    const first = screen.getByTestId("stat-check-hand-0");
    const second = screen.getByTestId("stat-check-hand-1");

    expect(first).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("stat-check-instruction")).toHaveTextContent(/Click a lane to play/i);

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("stat-check-instruction")).toHaveTextContent(/Click a champion/i);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("Escape clears the current selection", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    expect(screen.getByTestId("stat-check-hand-0")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("stat-check-hand-0")).toHaveAttribute("aria-pressed", "false");
  });

  it("marks empty lanes as active placement targets only while a card is selected", () => {
    const { container } = renderPage();
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
    expect(screen.queryByText(/Place here/i)).toBeNull();

    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    expect(screen.getAllByText(/Place here/i)).toHaveLength(3);

    fireEvent.click(lanes(container)[0]);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(2);
    expect(screen.queryByText(/Place here/i)).toBeNull();
  });

  it("does not place anything when a lane is clicked with no selection", () => {
    const { container } = renderPage();
    fireEvent.click(lanes(container)[0]);

    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
  });

  it("keeps the same physical champion card from hand to board", () => {
    const { container } = renderPage();
    const champion = screen.getByTestId("stat-check-hand-0").getAttribute("data-card-champion");
    expect(champion).toBeTruthy();

    place(container, 0, 0);

    const lane = lanes(container)[0];
    expect(laneChampions(lane)).toEqual([champion]);
    expect(screen.getAllByTestId(/^stat-check-hand-/).map((card) => card.getAttribute("data-card-champion"))).not.toContain(champion);
  });

  it("holds the fan slot open and defers the board card while the clone travels", () => {
    const { container } = renderPage();
    const champion = screen.getByTestId("stat-check-hand-0").getAttribute("data-card-champion");

    placeWithoutSettling(container, 0, 0);

    // During pickup/hold: an invisible placeholder keeps the hand gap open, exactly
    // one travel clone exists, and the destination card has not appeared in the lane.
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(1);
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    expect(laneChampions(lanes(container)[0])).toHaveLength(0);
    expect(within(lanes(container)[0]).queryByText(/Place champion|Place here/i)).toBeNull();

    // Through the anticipation hold (gap releases at 920ms: pickup+hold+launch+40% travel).
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(1);

    // Mid-flight: the gap has released for reflow while the clone is still airborne
    // and the destination is still deferred.
    act(() => vi.advanceTimersByTime(1_000));
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(0);
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    expect(laneChampions(lanes(container)[0])).toHaveLength(0);

    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));

    // After settlement: placeholder gone, clone gone, the same champion is on the board.
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(0);
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(laneChampions(lanes(container)[0])).toEqual([champion]);
  });

  it("steps through every hero-play phase in order at 1x", () => {
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);

    expect(animPhase(container)).toBe("placement-pickup");
    act(() => vi.advanceTimersByTime(250)); // > pickup 180
    expect(animPhase(container)).toBe("placement-hold");
    act(() => vi.advanceTimersByTime(150)); // 400 > pickup+hold 330
    expect(animPhase(container)).toBe("placement-launch");
    act(() => vi.advanceTimersByTime(100)); // 500 > +launch 460
    expect(animPhase(container)).toBe("placement-travel");
    act(() => vi.advanceTimersByTime(600)); // 1100 > +travel 1035
    expect(animPhase(container)).toBe("placement-approach");
    act(() => vi.advanceTimersByTime(150)); // 1250 > +approach 1215
    expect(animPhase(container)).toBe("placement-impact");
    expect(screen.getByTestId("stat-check-impact-ring")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(150)); // 1400 > +impact 1345
    expect(animPhase(container)).toBe("placement-rebound");
    act(() => vi.advanceTimersByTime(100)); // 1500 > +rebound 1465
    expect(animPhase(container)).toBe("placement-settle");
    act(() => vi.advanceTimersByTime(150)); // 1650 > +settle 1635
    expect(animPhase(container)).toBe("placement-accepted");
    act(() => vi.advanceTimersByTime(150)); // > 1715 clone handoff
    expect(animPhase(container)).toBe("selecting");
    expect(screen.queryByTestId("stat-check-impact-ring")).toBeNull();
  });

  it("scales every placement phase with the ANIM speed control", () => {
    const { container, unmount } = renderPage();
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "0.25" } });
    placeWithoutSettling(container, 0, 0);

    // At 0.25x the whole choreography is 4x longer (~8.9s): still airborne where
    // the 1x flight would long be finished, and still pre-hold at 4x pickup.
    act(() => vi.advanceTimersByTime(700));
    expect(animPhase(container)).toBe("placement-pickup");
    act(() => vi.advanceTimersByTime(2_300));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    expect(laneChampions(lanes(container)[0])).toHaveLength(0);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(laneChampions(lanes(container)[0])).toHaveLength(1);
    unmount();

    // At 1.5x the flight compresses to ~1.5s.
    window.sessionStorage.clear();
    const second = renderPage();
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "1.5" } });
    placeWithoutSettling(second.container, 0, 0);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(laneChampions(lanes(second.container)[0])).toHaveLength(1);
  });

  it("scales the hand reflow transition with the ANIM speed control", () => {
    const { container } = renderPage();
    const wrapper = () => container.querySelector<HTMLElement>("[data-fan-index]");
    expect(wrapper()?.style.transitionDuration).toBe("370ms");
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "0.25" } });
    expect(wrapper()?.style.transitionDuration).toBe("1480ms");
  });

  it("scales the return flight with the ANIM speed control", () => {
    const { container } = renderPage();
    place(container, 0, 0);
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "0.25" } });
    fireEvent.click(lanes(container)[0]);

    // Return total at 0.25x is ~4s; still traveling after the 1x duration.
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("uses a compact communicating slide (not a teleport) under reduced motion", () => {
    reducedMotion(true);
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);

    // Reduced motion still shows a short lift/slide/settle (~240ms): a clone
    // exists briefly instead of the card teleporting to the board.
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(0);
    expect(laneChampions(lanes(container)[0])).toHaveLength(1);
    expect(animPhase(container)).toBe("selecting");
  });

  it("dev-only forceMotion override restores the full choreography despite reduced motion", () => {
    reducedMotion(true);
    window.history.pushState({}, "", "/?forceMotion=1");
    try {
      const { container } = renderPage();
      placeWithoutSettling(container, 0, 0);

      // Full hero play: placeholder held, clone still airborne after the
      // compact reduced-motion flight would long be finished.
      expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(1);
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
      expect(laneChampions(lanes(container)[0])).toHaveLength(0);

      act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
      expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
      expect(laneChampions(lanes(container)[0])).toHaveLength(1);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("keeps the travel clone as one persistent DOM node across every phase", () => {
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);
    const node = screen.getAllByTestId(/^stat-check-travel-card-/)[0];

    // Sample through hold, travel, approach, impact, rebound: same element,
    // never remounted or recreated by phase re-renders.
    for (const step of [250, 300, 500, 300, 200]) {
      act(() => vi.advanceTimersByTime(step));
      expect(screen.getAllByTestId(/^stat-check-travel-card-/)[0]).toBe(node);
    }
    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("hides a returning card in the fan until its travel clone arrives", () => {
    const { container } = renderPage();
    place(container, 0, 0);

    fireEvent.click(lanes(container)[0]);

    expect(container.querySelectorAll('[data-hand-returning="true"]')).toHaveLength(1);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);

    act(() => vi.advanceTimersByTime(1_500));
    expect(container.querySelectorAll('[data-hand-returning="true"]')).toHaveLength(0);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("restart during flight clears placeholders and receiving slots", () => {
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);
    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    act(() => vi.advanceTimersByTime(2_000));

    expect(container.querySelectorAll('[data-hand-placeholder="true"]')).toHaveLength(0);
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
    expect(screen.getAllByText(/Place champion/i)).toHaveLength(3);
  });

  it("rapid repeated lane clicks place exactly one card and do not bounce it back", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(lanes(container)[0]);
    fireEvent.click(lanes(container)[0]);
    fireEvent.click(lanes(container)[0]);
    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));

    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
    expect(laneChampions(lanes(container)[0])).toHaveLength(1);
    expect(within(lanes(container)[0]).queryByText(/Place champion/i)).toBeNull();
  });

  it("swaps the placed card when an occupied lane is clicked with a new selection", () => {
    const { container } = renderPage();
    const firstChampion = screen.getByTestId("stat-check-hand-0").getAttribute("data-card-champion");
    place(container, 0, 0);
    const secondChampion = screen.getByTestId("stat-check-hand-0").getAttribute("data-card-champion");
    expect(secondChampion).not.toBe(firstChampion);

    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(lanes(container)[0]);
    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));

    expect(laneChampions(lanes(container)[0])).toEqual([secondChampion]);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
    expect(screen.getAllByTestId(/^stat-check-hand-/).map((card) => card.getAttribute("data-card-champion"))).toContain(firstChampion);
  });

  it("moves cards between lanes before lock-in without duplicate visual assignment", () => {
    const { container } = renderPage();
    const [firstLane, secondLane] = lanes(container);

    expect(screen.getByText(/Shared pool/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your deck/i)).toBeNull();
    expect(screen.queryByText(/Bot deck/i)).toBeNull();

    placeWithoutSettling(container, 0, 0);
    expect(within(firstLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.queryByText(/On table/i)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);

    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
    fireEvent.click(firstLane);
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(secondLane);

    expect(within(firstLane).getByText(/Place champion/i)).toBeInTheDocument();
    expect(within(secondLane).queryByText(/Place champion/i)).toBeNull();
    expect(screen.queryByText(/On table/i)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
  });

  it("returns a placed card to the normalized hand fan", () => {
    const { container } = renderPage();
    const [firstLane] = lanes(container);

    place(container, 0, 0);
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);

    fireEvent.click(firstLane);

    expect(within(firstLane).getByText(/Place champion/i)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("pointer movement between press and release does not cancel click placement", () => {
    const { container } = renderPage();
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 170, clientY: 300 });
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 170, clientY: 300 });
    fireEvent.click(card);
    fireEvent.click(lanes(container)[0]);
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(5);
    expect(within(lanes(container)[0]).queryByText(/Place champion/i)).toBeNull();
  });

  it("does not render a drag ghost or instruct users to drag", () => {
    const { container } = renderPage();
    const card = screen.getByTestId("stat-check-hand-0");

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 540, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 300, clientY: 200 });

    expect(screen.queryByTestId(/^stat-check-drag-card-/)).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain("drag");

    fireEvent.pointerUp(card, { pointerId: 1, clientX: 300, clientY: 200 });
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("starts and completes placement overlay travel without stale cards", () => {
    const { container } = renderPage();

    placeWithoutSettling(container, 0, 0);

    expect(screen.getByTestId("stat-check-motion-overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    // Still airborne mid-choreography, gone after full settlement.
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(PLACEMENT_SETTLE_MS));
    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("persists and applies slow-motion animation speed", () => {
    const { container, unmount } = renderPage();
    const speed = screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement;

    expect(speed.value).toBe("1");
    fireEvent.change(speed, { target: { value: "0.5" } });
    expect(window.sessionStorage.getItem("stat-check-animation-speed")).toBe("0.5");

    placeWithoutSettling(container, 0, 0);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    unmount();
    renderPage();
    expect((screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).value).toBe("0.5");
  });

  it("changing speed during active placement clears transient overlays", () => {
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);

    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);
    fireEvent.change(screen.getByTestId("stat-check-animation-speed"), { target: { value: "0.25" } });

    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
  });

  it("restart cancels active overlay travel", () => {
    const { container } = renderPage();
    placeWithoutSettling(container, 0, 0);

    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));

    expect(screen.queryByTestId(/^stat-check-travel-card-/)).toBeNull();
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("shows a comparison marker per lane with direction, family, and decisive threshold", () => {
    const { container } = renderPage();
    const markers = container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]');
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(["higher", "lower"]).toContain(marker.getAttribute("data-direction"));
      expect(marker.textContent).toMatch(/Decisive [\d.]+%/);
      expect(marker.textContent).toMatch(/value wins/i);
    }
    for (const lane of lanes(container)) {
      expect(within(lane).getByText(/Concealed/i)).toBeInTheDocument();
    }
  });

  it("conceals bot identity until the reveal flip and resolves lanes only afterwards", () => {
    const { container } = renderPage();
    fillBoard(container);
    const placedChampions = lanes(container).flatMap(laneChampions).sort();
    expect(placedChampions).toHaveLength(3);

    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Locked but before any opponent flip fires: still only the player's cards.
    expect(lanes(container).flatMap(laneChampions).sort()).toEqual(placedChampions);
    expect(screen.getAllByText(/Concealed/i).length).toBeGreaterThanOrEqual(3);

    // After all flips but before lane resolution: six physical cards, no results yet.
    act(() => vi.advanceTimersByTime(1_000));
    expect(lanes(container).flatMap(laneChampions)).toHaveLength(6);
    expect(screen.queryByText(/You win|Bot wins|Lane tied/i)).toBeNull();

    finishReveal();
    const results = lanes(container).map((lane) => lane.textContent ?? "");
    expect(results.every((text) => /You win|Bot wins|Lane tied/i.test(text))).toBe(true);
    expect(results.some((text) => /Decisive at [\d.]+%/.test(text))).toBe(true);
    expect(results.every((text) => / vs /.test(text))).toBe(true);
  });

  it("prevents reassignment after lock-in and reaches resolved reveal state", () => {
    const { container } = renderPage();
    expect(lanes(container).some((lane) => /Decisive [\d.]+%/.test(lane.textContent ?? ""))).toBe(true);
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));
    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    fireEvent.click(lanes(container)[0]);

    finishReveal();

    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-board-result")).toHaveTextContent(/board/i);
    expect(screen.getByTestId("stat-check-damage-player")).toHaveTextContent(/Total:/);
    expect(screen.getByTestId("stat-check-damage-bot")).toHaveTextContent(/Total:/);
    expect(lanes(container).some((lane) => /Decisive at [\d.]+%/.test(lane.textContent ?? ""))).toBe(true);
  });

  it("uses the reduced-motion path without waiting through the staged reveal", () => {
    reducedMotion(true);
    const { container } = renderPage();
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));

    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.queryByText(/Concealed/i)).toBeNull();
  });

  it("restart clears pending reveal state", () => {
    const { container } = renderPage();
    fillBoard(container);

    fireEvent.click(screen.getByTestId("stat-check-lock"));
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    finishReveal();

    // A restarted match re-enters the opening item choice before selecting.
    expect(screen.getByTestId("stat-check-item-choice")).toBeInTheDocument();
    completeItemChoiceIfPresent();

    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    expect(screen.getByText(/Bot cards stay face-down/i)).toBeInTheDocument();
  });

  it("updates discards after next round and keeps visible intel continuous", () => {
    const { container } = renderPage();
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
    const { container } = renderPage();
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
    const { container } = renderPage();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();

    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    finishReveal();
    // The restarted match owes its opening item choice again.
    completeItemChoiceIfPresent();

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

describe("CategoryMarker", () => {
  it("renders higher-wins direction with level and fractional decisive threshold", () => {
    const { container } = render(<CategoryMarker category={higherHp18Category} />);
    const marker = container.querySelector('[data-testid="stat-check-marker-highest-hp-18"]');
    expect(marker).toHaveAttribute("data-direction", "higher");
    expect(marker).toHaveTextContent("L18 HP");
    expect(marker).toHaveTextContent("7.5%");
    expect(marker).toHaveTextContent(/Highest level-18 health/i);
    expect(marker).toHaveTextContent(/Health/);
    expect(marker).toHaveTextContent(/Level 18/);
    expect(marker).toHaveTextContent(/Higher value wins/i);
    expect(marker).toHaveTextContent(/Decisive 7.5% for bonus damage/i);
  });

  it("renders lower-wins direction accessibly for lower-is-better categories", () => {
    const { container } = render(<CategoryMarker category={lowerArmorCategory} />);
    const marker = container.querySelector('[data-testid="stat-check-marker-lowest-armor-1"]');
    expect(marker).toHaveAttribute("data-direction", "lower");
    expect(marker).toHaveTextContent(/Lower value wins/i);
    expect(marker).toHaveTextContent("25%");
    expect(marker).toHaveTextContent(/Armor/);
  });
});

describe("LaneResult", () => {
  it("shows a player win with both values", () => {
    render(<LaneResult result={sampleResult({})} />);
    expect(screen.getByText(/You win/i)).toBeInTheDocument();
    expect(screen.getByText(/625 vs 604/)).toBeInTheDocument();
    expect(screen.queryByText(/Decisive \+1/i)).toBeNull();
  });

  it("shows a decisive bot win", () => {
    render(<LaneResult result={sampleResult({ winner: "bot", playerValue: 480, botValue: 620, margin: 0.29, decisive: true })} />);
    expect(screen.getByText(/Bot wins/i)).toBeInTheDocument();
    expect(screen.getByText(/480 vs 620/)).toBeInTheDocument();
    expect(screen.getByText(/Decisive \+1/i)).toBeInTheDocument();
  });

  it("shows a tie", () => {
    render(<LaneResult result={sampleResult({ winner: "tie", playerValue: 550, botValue: 550, margin: 0 })} />);
    expect(screen.getByText(/Lane tied/i)).toBeInTheDocument();
    expect(screen.getByText(/550 vs 550/)).toBeInTheDocument();
  });
});

describe("StatCheckPage item system UI", () => {
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

  // Deterministic Round 1 board for the page seed (verified via the engine):
  // lane 0 = highest-hp-1 (health), lane 1 = lowest-armor-1 (armor),
  // lane 2 = lowest-ad-1 (attack damage).
  const round1Board = () => generateCategoryBoard("stat-check-tabletop-v2:0", 1);

  function armItem(itemId: string) {
    fireEvent.click(screen.getByTestId(`stat-check-inventory-${itemId}`));
  }

  function inventoryCountText(itemId: string) {
    const chip = screen.getByTestId(`stat-check-inventory-${itemId}`);
    return chip.textContent?.trim().slice(-1);
  }

  function playRound(container: HTMLElement) {
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();
  }

  it("conceals the full Round 1 board during the opening item choice and reveals it after", () => {
    const { container } = renderPage({ skipItemChoice: true });

    // Choice surface: four fixed options, confirm gated on a selection.
    expect(screen.getByTestId("stat-check-item-choice")).toBeInTheDocument();
    for (const id of ["long-sword", "cloth-armor", "ruby-crystal", "mogzy-snack"]) {
      expect(screen.getByTestId(`stat-check-item-option-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("stat-check-item-confirm")).toBeDisabled();

    // The full three-category board stays hidden: no category plaques, three
    // concealed stand-ins, and locking is unavailable.
    expect(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).toHaveLength(0);
    expect(screen.getAllByTestId(/^stat-check-hidden-category-/)).toHaveLength(3);
    // Lock In does not exist during item-choice phases — it never competes
    // with the item confirmation control.
    expect(screen.queryByTestId("stat-check-lock")).toBeNull();

    // Only the single-family hint shows, matching the real Round 1 board.
    expect(screen.getByText(/Round 1 Intel/i)).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-next-intel-label")).toHaveTextContent(/^Health$/);

    // Confirming reveals the complete Round 1 categories.
    fireEvent.click(screen.getByTestId("stat-check-item-option-ruby-crystal"));
    fireEvent.click(screen.getByTestId("stat-check-item-confirm"));
    expect(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).toHaveLength(3);
    expect(screen.queryAllByTestId(/^stat-check-hidden-category-/)).toHaveLength(0);
    expect(inventoryCountText("ruby-crystal")).toBe("1");
  });

  it("after round 3 keeps the resolved board visible, hides the next full board, and blocks Next Round until the pick", () => {
    const { container } = renderPage();
    for (let round = 1; round <= 2; round++) {
      playRound(container);
      fireEvent.click(screen.getByTestId("stat-check-next-round"));
      act(() => vi.advanceTimersByTime(2_000));
    }
    playRound(container);

    // Third completed round: the item choice opens automatically...
    expect(screen.getByTestId("stat-check-item-choice")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    // ...while every piece of resolved-round feedback stays mounted.
    expect(screen.getByTestId("stat-check-board-result")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-player")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-bot")).toBeInTheDocument();
    const results = lanes(container).map((lane) => lane.textContent ?? "");
    expect(results.every((text) => /You win|Bot wins|Lane tied/i.test(text))).toBe(true);
    // The next-round hint stays: exactly one family label plus hidden slots.
    const intel = screen.getByTestId("stat-check-next-intel");
    expect(intel).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-next-intel-label").textContent).toMatch(/\w/);

    fireEvent.click(screen.getByTestId("stat-check-item-option-mogzy-snack"));
    fireEvent.click(screen.getByTestId("stat-check-item-confirm"));
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText(/Round 4/i)).toBeInTheDocument();
  });

  it("arms an item, previews natural to final values, keeps one pending equip, and supports change and removal", () => {
    const { container } = renderPage({ item: "mogzy-snack" });
    fillBoard(container);

    armItem("mogzy-snack");
    expect(screen.getByTestId("stat-check-inventory-mogzy-snack")).toHaveAttribute("aria-pressed", "true");
    // All three Round 1 lanes are snack-compatible and occupied: every preview
    // is ready and spells out natural → final plus the winning direction.
    const board = round1Board();
    for (const [index, category] of board.entries()) {
      const preview = screen.getByTestId(`stat-check-item-preview-${category.id}`);
      expect(preview).toHaveAttribute("data-preview-state", "ready");
      expect(preview.textContent).toMatch(/→/);
      expect(preview.textContent).toMatch(category.direction === "higher" ? /Highest value wins/i : /Lowest value wins/i);
      expect(lanes(container)[index]).toHaveAttribute("data-armed-item", "compatible");
    }
    // Lowest lanes accept the positive bonus (intentionally self-harmful).
    expect(board.some((category) => category.direction === "lower")).toBe(true);

    // Attach to lane 0, then change to lane 1: exactly one pending equip.
    fireEvent.click(lanes(container)[0]);
    expect(screen.getAllByTestId("stat-check-pending-item")).toHaveLength(1);
    expect(inventoryCountText("mogzy-snack")).toBe("1"); // pending, not consumed
    armItem("mogzy-snack");
    fireEvent.click(lanes(container)[1]);
    const pendings = screen.getAllByTestId("stat-check-pending-item");
    expect(pendings).toHaveLength(1);
    expect(lanes(container)[1].contains(pendings[0])).toBe(true);

    // Removing the pending item returns it without consumption.
    fireEvent.click(pendings[0]);
    expect(screen.queryByTestId("stat-check-pending-item")).toBeNull();
    expect(inventoryCountText("mogzy-snack")).toBe("1");
  });

  it("blocks incompatible lanes with an explanatory tooltip and never wastes the item", () => {
    const { container } = renderPage(); // ruby-crystal: health only
    fillBoard(container);
    armItem("ruby-crystal");

    // Lane 1 (armor) and lane 2 (attack damage) are stat-family mismatches.
    expect(lanes(container)[0]).toHaveAttribute("data-armed-item", "compatible");
    for (const index of [1, 2]) {
      expect(lanes(container)[index]).toHaveAttribute("data-armed-item", "blocked");
    }
    const armorPreview = screen.getByTestId("stat-check-item-preview-lowest-armor-1");
    expect(armorPreview).toHaveAttribute("data-preview-state", "incompatible");
    expect(armorPreview.textContent).toMatch(/Can't be used on Armor/i);

    fireEvent.click(lanes(container)[1]);
    expect(screen.queryByTestId("stat-check-pending-item")).toBeNull();
    expect(inventoryCountText("ruby-crystal")).toBe("1");
  });

  it("rejects equipping to an empty lane", () => {
    const { container } = renderPage();
    armItem("ruby-crystal");
    const preview = screen.getByTestId("stat-check-item-preview-highest-hp-1");
    expect(preview).toHaveAttribute("data-preview-state", "empty");
    expect(preview.textContent).toMatch(/Place a champion here first/i);
    fireEvent.click(lanes(container)[0]);
    expect(screen.queryByTestId("stat-check-pending-item")).toBeNull();
  });

  it("reveals natural values, then items and bonuses, then finals and winners; consumes exactly once", () => {
    const { container } = renderPage(); // ruby-crystal
    fillBoard(container);

    const laneZeroChampion = laneChampions(lanes(container)[0])[0];
    const placedCard = STAT_CHECK_FIXTURE_DECK.find((card) => card.name === laneZeroChampion)!;
    const natural = Math.round(placedCard.stats.hp).toLocaleString();
    const final = Math.round(placedCard.stats.hp + 150).toLocaleString();

    armItem("ruby-crystal");
    fireEvent.click(lanes(container)[0]);
    expect(screen.getByTestId("stat-check-pending-item")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // All opponent flips done (820ms), before the item beat (1,140ms):
    // natural value only, no item chips anywhere, no lane winners.
    act(() => vi.advanceTimersByTime(1_000));
    expect(lanes(container)[0].textContent).toContain(natural);
    expect(lanes(container)[0].textContent).not.toContain(final);
    expect(screen.queryByTestId("stat-check-reveal-item-player")).toBeNull();
    expect(screen.queryByTestId("stat-check-reveal-item-bot")).toBeNull();
    expect(screen.queryByText(/You win|Bot wins|Lane tied/i)).toBeNull();

    // Item beat (1,140ms): the equipped item and its bonus appear, the final
    // value replaces the natural one, and winners still have not resolved.
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("stat-check-reveal-item-player")).toHaveTextContent(/Ruby Crystal \+150/);
    expect(lanes(container)[0].textContent).toContain(final);
    expect(screen.queryByText(/You win|Bot wins|Lane tied/i)).toBeNull();

    // Lane winners resolve only after the shifted resolve beat (1,740ms+).
    act(() => vi.advanceTimersByTime(700));
    expect(lanes(container)[0].textContent).toMatch(/You win|Bot wins|Lane tied/i);

    finishReveal();
    // The lane plaque shows the natural + bonus → final breakdown.
    expect(screen.getByTestId("stat-check-result-item-player")).toHaveTextContent(
      new RegExp(`${natural} \\+ 150 → ${final}`),
    );
    // Consumed exactly once: the inventory copy is gone and stays gone.
    expect(inventoryCountText("ruby-crystal")).toBe("0");
    expect(screen.queryByTestId("stat-check-pending-item")).toBeNull();
  });

  it("presents item acquisition in a modal overlay at every cadence point, never alongside Lock In", () => {
    const { container } = renderPage({ skipItemChoice: true });

    // Opening choice: overlay dialog open above the (still visible) board.
    const overlay = screen.getByTestId("stat-check-item-overlay");
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(screen.queryByTestId("stat-check-lock")).toBeNull();
    expect(screen.getByTestId("stat-check-hand")).toBeInTheDocument();

    // Confirming closes the overlay and restores the selecting controls.
    fireEvent.click(screen.getByTestId("stat-check-item-option-ruby-crystal"));
    fireEvent.click(screen.getByTestId("stat-check-item-confirm"));
    expect(screen.queryByTestId("stat-check-item-overlay")).toBeNull();
    expect(screen.getByTestId("stat-check-lock")).toBeInTheDocument();

    // Post-cadence (3 completed rounds): the overlay returns, Lock In and
    // Next Round both stay out of the way until the pick is confirmed.
    for (let round = 1; round <= 2; round++) {
      playRound(container);
      fireEvent.click(screen.getByTestId("stat-check-next-round"));
      act(() => vi.advanceTimersByTime(2_000));
    }
    playRound(container);
    expect(screen.getByTestId("stat-check-item-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-check-lock")).toBeNull();
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
  });

  it("hides Lock In outside the selecting phase (reveal and resolved states)", () => {
    const { container } = renderPage();
    fillBoard(container);
    expect(screen.getByTestId("stat-check-lock")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    // From the lock onward the phase is no longer "selecting": the control
    // is unmounted for the whole reveal and resolved presentation.
    expect(screen.queryByTestId("stat-check-lock")).toBeNull();
    finishReveal();
    expect(screen.queryByTestId("stat-check-lock")).toBeNull();
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  });

  it("renders the board dock with icon wells, counts, and empty/owned/armed states", () => {
    renderPage(); // ruby-crystal taken at the opening choice
    expect(inventoryCountText("ruby-crystal")).toBe("1");
    expect(inventoryCountText("long-sword")).toBe("0");
    // Owned wells are armable; zero-count wells stay visible but disabled.
    const owned = screen.getByTestId("stat-check-inventory-ruby-crystal");
    const empty = screen.getByTestId("stat-check-inventory-long-sword");
    expect(owned).toBeEnabled();
    expect(owned).toHaveAttribute("data-dock-state", "owned");
    expect(empty).toBeDisabled();
    expect(empty).toHaveAttribute("data-dock-state", "empty");
    // The dock is icon-only: no "Items"/"Inventory" text label anywhere.
    expect(screen.getByTestId("stat-check-inventory").textContent).not.toMatch(/item|inventory/i);

    // Arming lights the well; disarming returns it to owned.
    armItem("ruby-crystal");
    expect(owned).toHaveAttribute("data-dock-state", "armed");
    expect(owned).toHaveAttribute("aria-pressed", "true");
    armItem("ruby-crystal");
    expect(owned).toHaveAttribute("data-dock-state", "owned");
  });

  it("keeps the armed dock state through lane assignment and consumes on equip", () => {
    const { container } = renderPage(); // ruby-crystal
    fillBoard(container);
    armItem("ruby-crystal");
    // Compatible occupied lane highlighted (data attr drives the socket ring).
    expect(lanes(container)[0]).toHaveAttribute("data-armed-item", "compatible");
    fireEvent.click(lanes(container)[0]);
    // Assignment disarms the dock (pending badge owns the state now).
    expect(screen.getByTestId("stat-check-inventory-ruby-crystal")).toHaveAttribute("data-dock-state", "owned");
    expect(screen.getByTestId("stat-check-pending-item")).toBeInTheDocument();
    expect(inventoryCountText("ruby-crystal")).toBe("1"); // pending, not consumed
  });
});
