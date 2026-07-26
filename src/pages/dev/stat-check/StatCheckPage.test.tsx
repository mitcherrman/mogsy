import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatCheckPage, { CategoryMarker, CategoryValueBadge, LanePlaque, laneValueEmphasis } from "./StatCheckPage";
import {
  DAMAGE_REVEAL_TIMELINE,
  LANE_PLAQUE_TIMELINE,
  REVEAL_TIMELINE,
  STAT_CHECK_DEFAULT_ANIMATION_SPEED,
  lanePlaqueStageOffsets,
  laneRevealTotalMs,
  type StatCheckAnimationSpeed,
} from "./animationConfig";
import type { LanePlaqueStage } from "./animationState";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import { STAT_CATEGORIES, createMatch, generateCategoryBoard, type CategoryResult, type StatCategory, type StatCheckCard } from "./statCheckEngine";

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

/**
 * The next-round hint renders no visible wording, so the written family is read
 * back from the socket's accessible label.
 */
function nextHintFamilyLabel() {
  const label = screen.getByTestId("stat-check-next-hint").getAttribute("aria-label") ?? "";
  return label.replace(/^Next-round hint:\s*/, "");
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
  // Lanes resolve strictly one after another (8,870ms each at 1x) and the
  // centre damage presentation follows them, so the longest round settles at
  // ~33.4s at 1x. Gameplay runs this at 1.5x (~22.3s).
  act(() => vi.advanceTimersByTime(45_000));
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
function renderPage(options: { skipItemChoice?: boolean; item?: string; speed?: StatCheckAnimationSpeed } = {}) {
  // Seeding the stored speed BEFORE render is the same path a returning player
  // takes: an explicit preference is read on mount and overrides the default.
  if (options.speed != null) window.sessionStorage.setItem("stat-check-animation-speed", String(options.speed));
  const view = render(<StatCheckPage />);
  if (!options.skipItemChoice) {
    expect(completeItemChoiceIfPresent(options.item)).toBe(true);
  }
  return view;
}

/**
 * Render pinned to 1x so a test can assert the AUTHORED durations directly.
 * Gameplay defaults to 1.5x, which would otherwise divide every one of them.
 */
function renderPageAtAuthoredSpeed(options: { skipItemChoice?: boolean; item?: string } = {}) {
  return renderPage({ ...options, speed: 1 });
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

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId(/^stat-check-hand-/)).toHaveLength(6);
  });

  it("shows no instructional sentence beneath the hand in any selection state", () => {
    const { container } = renderPage();
    // Idle, card selected, and item armed all used to print a hint line.
    expect(screen.queryByTestId("stat-check-instruction")).toBeNull();
    expect(container.textContent).not.toMatch(/click a champion/i);

    fireEvent.click(screen.getByTestId("stat-check-hand-0"));
    expect(screen.queryByTestId("stat-check-instruction")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });

    fireEvent.click(screen.getByTestId("stat-check-inventory-ruby-crystal"));
    expect(screen.queryByTestId("stat-check-instruction")).toBeNull();
    expect(container.textContent).not.toMatch(/then click a lane/i);
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
    const { container } = renderPageAtAuthoredSpeed();
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
    const { container } = renderPageAtAuthoredSpeed();
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
    const { container } = renderPageAtAuthoredSpeed();
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
    const { container } = renderPageAtAuthoredSpeed();
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

  it("starts a fresh session at the 1.5x gameplay default", () => {
    expect(STAT_CHECK_DEFAULT_ANIMATION_SPEED).toBe(1.5);
    // Nothing stored: this is a brand-new session.
    expect(window.sessionStorage.getItem("stat-check-animation-speed")).toBeNull();
    renderPage();
    expect((screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).value).toBe("1.5");
  });

  it("keeps every slower speed available from the default", () => {
    renderPage();
    const options = Array.from(
      (screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).options,
      (option) => option.value,
    );
    expect(options).toEqual(["0.25", "0.5", "1", "1.5"]);
  });

  it("falls back to the default when the stored speed is not one we offer", () => {
    window.sessionStorage.setItem("stat-check-animation-speed", "0.75");
    renderPage();
    expect((screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).value).toBe("1.5");
  });

  it("persists and applies slow-motion animation speed over the default", () => {
    const { container, unmount } = renderPage();
    const speed = screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement;

    expect(speed.value).toBe("1.5");
    fireEvent.change(speed, { target: { value: "0.5" } });
    expect(window.sessionStorage.getItem("stat-check-animation-speed")).toBe("0.5");

    placeWithoutSettling(container, 0, 0);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getAllByTestId(/^stat-check-travel-card-/)).toHaveLength(1);

    // An explicit choice survives a remount: the default never overwrites it.
    unmount();
    renderPage();
    expect((screen.getByTestId("stat-check-animation-speed") as HTMLSelectElement).value).toBe("0.5");
  });

  it("scales the whole reveal from the centralized timeline at the default speed", () => {
    const { container } = renderPage();
    const stages = () =>
      Array.from(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).map(
        (marker) => (marker as HTMLElement).dataset.plaqueStage,
      );
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Lane 1 starts at (1,220 + 520 item shift) / 1.5 = 1,160ms and reaches its
    // threshold scene 1,000/1.5 = 667ms later. At 1x that beat is 1,050ms away,
    // so arriving early is proof the timeline itself is divided by the speed.
    act(() => vi.advanceTimersByTime(1_160 + 700));
    expect(stages()[0]).toBe("threshold");
    expect(stages()[1]).toBe("category");
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
    // Each plaque rests on +1/+0; the old expanding text panel is gone, so the
    // value comparison and "Decisive at" wording no longer live in the lane.
    expect(results.every((text) => /\+[01]/.test(text))).toBe(true);
    expect(results.some((text) => /Decisive at [\d.]+%/.test(text))).toBe(false);
    expect(results.every((text) => / vs /.test(text))).toBe(false);
  });

  it("resolves lanes strictly left to right with no overlap", () => {
    const { container } = renderPageAtAuthoredSpeed();
    const stages = () =>
      Array.from(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).map(
        (marker) => (marker as HTMLElement).dataset.plaqueStage,
      );

    expect(stages()).toEqual(["category", "category", "category"]);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Every offset is read from the centralized timeline, so retuning a scene
    // moves this test with the implementation instead of breaking it.
    const LANE_1 = REVEAL_TIMELINE.resolveLane1 + REVEAL_TIMELINE.itemRevealShiftMs; // this round carries an item
    const LANE_MS = laneRevealTotalMs();
    const OFFSETS = lanePlaqueStageOffsets();

    // Step to just inside each of lane 1's scenes and assert the other two
    // lanes have not begun.
    let elapsed = 0;
    const stepTo = (target: number) => {
      act(() => vi.advanceTimersByTime(target - elapsed));
      elapsed = target;
    };
    for (const stage of ["threshold", "values", "winner", "slice", "zero", "transfer", "bonus", "settled"] as const) {
      stepTo(LANE_1 + OFFSETS[stage] + 50);
      expect(stages()[0], `lane 1 at ${stage}`).toBe(stage);
      expect(stages()[1], `lane 2 must not start at ${stage}`).toBe("category");
      expect(stages()[2], `lane 3 must not start at ${stage}`).toBe("category");
    }

    // Lane 2 only begins once lane 1 has fully settled — and begins IMMEDIATELY
    // afterwards: one frame past the handoff it is already on its own category
    // face, with no configured idle interval in between.
    stepTo(LANE_1 + LANE_MS - 50);
    expect(stages()).toEqual(["settled", "category", "category"]);
    stepTo(LANE_1 + LANE_MS + OFFSETS.threshold + 50);
    expect(stages()[0]).toBe("settled");
    expect(stages()[1]).toBe("threshold");
    expect(stages()[2]).toBe("category");

    // Lane 3 only begins once lane 2 has fully settled.
    stepTo(LANE_1 + LANE_MS * 2 + OFFSETS.threshold + 50);
    expect(stages()[1]).toBe("settled");
    expect(stages()[2]).toBe("threshold");

    // The round does not complete until all three lanes have settled.
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    finishReveal();
    expect(stages()).toEqual(["settled", "settled", "settled"]);
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-player")).toBeInTheDocument();
  });

  it("hands off between lanes with no perceptible idle interval", () => {
    const { container } = renderPageAtAuthoredSpeed();
    const stages = () =>
      Array.from(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).map(
        (marker) => (marker as HTMLElement).dataset.plaqueStage,
      );
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    const LANE_1 = REVEAL_TIMELINE.resolveLane1 + REVEAL_TIMELINE.itemRevealShiftMs;
    const LANE_MS = laneRevealTotalMs();
    const OFFSETS = lanePlaqueStageOffsets();

    // A lane's last scheduled scene is `settled`; the only time after it is the
    // cleanup window the value-emphasis transition needs. That window IS the
    // gap between lanes, and it must not exceed the transition it exists for.
    const cleanupWindow = LANE_MS - OFFSETS.settled;
    expect(cleanupWindow).toBe(LANE_PLAQUE_TIMELINE.settleMs);
    expect(cleanupWindow - LANE_PLAQUE_TIMELINE.valueTransitionMs).toBeLessThanOrEqual(20);

    // Walk the real handoff: lane 1 hits `settled`, then lane 2 leaves
    // `category` exactly one cleanup window later — nothing idles in between.
    act(() => vi.advanceTimersByTime(LANE_1 + OFFSETS.settled + 10));
    expect(stages()).toEqual(["settled", "category", "category"]);
    act(() => vi.advanceTimersByTime(cleanupWindow + OFFSETS.threshold - 10 + 10));
    expect(stages()[1]).toBe("threshold");
  });

  it("regroups the plaque as level, then arrow with the stat icon", () => {
    const { container } = renderPage();
    const marker = container.querySelector<HTMLElement>('[data-testid^="stat-check-marker-"]');
    const categoryId = marker!.getAttribute("data-testid")!.replace("stat-check-marker-", "");
    const level = container.querySelector<HTMLElement>(`[data-testid="stat-check-category-level-${categoryId}"]`);
    const statGroup = container.querySelector<HTMLElement>(`[data-testid="stat-check-category-stat-${categoryId}"]`);
    const icon = container.querySelector<HTMLElement>(`[data-testid="stat-check-category-icon-${categoryId}"]`);
    expect(statGroup).not.toBeNull();
    expect(icon).not.toBeNull();

    // The arrow lives INSIDE the stat group with the icon, not beside the level.
    const arrow = statGroup!.querySelector("svg.lucide-arrow-up, svg.lucide-arrow-down");
    expect(arrow).not.toBeNull();
    expect(statGroup!.contains(icon!)).toBe(true);
    if (level) {
      expect(level.contains(arrow!)).toBe(false);
      // Semantic order is still level -> arrow -> icon.
      expect(level.compareDocumentPosition(statGroup!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // A real gap separates the two groups, while the arrow/icon pair is pulled
    // tight by a negative kern that cancels the PNG's transparent left padding.
    const outer = statGroup!.parentElement!;
    expect(outer.className).toContain("gap-[7px]");
    expect(outer.className).toContain("md:gap-2.5");
    expect(icon!.className).toContain("-ml-1.5");
    expect(icon!.className).toContain("md:-ml-2.5");
    expect(icon!.className).toContain("min-[1210px]:-ml-3.5");
    // Both groups centre on the icon's own box, never on the level's baseline.
    expect(outer.className).toContain("items-center");
    expect(statGroup!.className).toContain("items-center");
  });

  it("consolidates the round's damage sources into one centre total before health moves", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    const t = DAMAGE_REVEAL_TIMELINE;
    // This round carries an item, so everything after the item beat shifts.
    const DAMAGE_START = REVEAL_TIMELINE.boardResult + REVEAL_TIMELINE.itemRevealShiftMs;
    const popup = () => screen.queryByTestId("stat-check-damage-reveal");
    const playerHp = () => screen.getByTestId("stat-check-player-hp").textContent;

    let elapsed = 0;
    const stepTo = (target: number) => {
      act(() => vi.advanceTimersByTime(target - elapsed));
      elapsed = target;
    };

    // Nothing before the third lane has finished: the board owns the screen.
    stepTo(DAMAGE_START - 100);
    expect(popup()).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).map(
        (marker) => (marker as HTMLElement).dataset.plaqueStage,
      ),
    ).toEqual(["settled", "settled", "settled"]);

    // Establish, then add each real source into a running total: 2 -> 3 -> 4.
    // (Round 1 of the fixture match: the opponent sweeps for 2 + 1, plus one
    // decisive lane.) Zero-damage components are never staged.
    const seen: Array<[string | null, string | null]> = [];
    for (const [stage, at] of [
      ["enter", 0],
      ["board", t.enterMs],
      ["sweep", t.enterMs + t.componentMs],
      ["decisive", t.enterMs + t.componentMs * 2],
      ["total", t.enterMs + t.componentMs * 3],
    ] as const) {
      stepTo(DAMAGE_START + at + 60);
      const node = popup();
      expect(node, `stage ${stage}`).not.toBeNull();
      expect(node).toHaveAttribute("data-damage-stage", stage);
      seen.push([
        node!.getAttribute("data-damage-shown"),
        node!.querySelector("[data-damage-component]")?.getAttribute("data-damage-component") ?? null,
      ]);
      // Health has NOT moved yet, at any stage before impact.
      expect(playerHp(), `health must not move at ${stage}`).toMatch(/^20 \//);
    }
    expect(seen).toEqual([
      ["0", null],
      ["2", "board"],
      ["3", "sweep"],
      ["4", "decisive"],
      ["4", null],
    ]);
    expect(screen.getByTestId("stat-check-damage-total-label")).toHaveTextContent(/damage/i);

    // The opponent is the one dealing it, so the player's bar is the target.
    expect(popup()).toHaveAttribute("data-damage-side", "bot");
    expect(popup()).toHaveAttribute("data-damage-target", "player");

    // Impact frame: the arena jolts, and health STILL has not changed.
    const impactAt = t.enterMs + t.componentMs * 3 + t.totalHoldMs;
    stepTo(DAMAGE_START + impactAt + 60);
    expect(popup()).toHaveAttribute("data-damage-stage", "impact");
    expect(screen.getByTestId("stat-check-arena").className).toContain("animate-arena-jolt");
    expect(playerHp()).toMatch(/^20 \//);

    // Health stage: the authoritative post-round value becomes visible, the
    // struck bar is flagged, and the total matches the authoritative breakdown.
    stepTo(DAMAGE_START + impactAt + t.impactMs + 60);
    expect(popup()).toHaveAttribute("data-damage-stage", "health");
    expect(playerHp()).toMatch(/^16 \//);
    expect(screen.getByTestId("stat-check-player-hp-panel")).toHaveAttribute("data-hp-impacting", "true");
    expect(screen.getByTestId("stat-check-bot-hp-panel")).not.toHaveAttribute("data-hp-impacting");

    // The round does not advance until the presentation has finished.
    expect(screen.queryByTestId("stat-check-next-round")).toBeNull();
    finishReveal();
    expect(screen.queryByTestId("stat-check-damage-reveal")).toBeNull();
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    // Authoritative rail total agrees with the number the centre counted to.
    expect(screen.getByTestId("stat-check-damage-bot")).toHaveTextContent(/Total: 4/);
    expect(playerHp()).toMatch(/^16 \//);
  });

  it("shows no damage popup for a side that dealt nothing", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Round 1: the opponent deals 4, the player deals 0.
    const sidesSeen = new Set<string>();
    for (let elapsed = 0; elapsed < 40_000; elapsed += 200) {
      act(() => vi.advanceTimersByTime(200));
      const node = screen.queryByTestId("stat-check-damage-reveal");
      if (node) sidesSeen.add(node.getAttribute("data-damage-side") ?? "");
    }
    expect([...sidesSeen]).toEqual(["bot"]);
    expect(screen.getByTestId("stat-check-damage-player")).toHaveTextContent(/Total: 0/);
    // A zero-damage side also never lights a health bar.
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("20 / 20 HP");
  });

  it("reduced motion reaches the same health with no popup, jolt, or count-up", () => {
    reducedMotion(true);
    const { container } = renderPage();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    expect(screen.queryByTestId("stat-check-damage-reveal")).toBeNull();
    expect(screen.getByTestId("stat-check-arena").className).not.toContain("animate-arena-jolt");
    // Same authoritative health as the full presentation lands on.
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("16 / 20 HP");
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("20 / 20 HP");
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  });

  it("restart mid-presentation clears the popup and the revealed health steps", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    const DAMAGE_START = REVEAL_TIMELINE.boardResult + REVEAL_TIMELINE.itemRevealShiftMs;
    act(() => vi.advanceTimersByTime(DAMAGE_START + DAMAGE_REVEAL_TIMELINE.enterMs + 60));
    expect(screen.getByTestId("stat-check-damage-reveal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(screen.queryByTestId("stat-check-damage-reveal")).toBeNull();
    finishReveal();
    completeItemChoiceIfPresent();
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("20 / 20 HP");
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
    // Plaques have finished their staged blink and rest on +1/+0.
    expect(lanes(container).every((lane) => /\+[01]/.test(lane.textContent ?? ""))).toBe(true);
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
    // The hint is now a single icon-only board socket: the family lives in the
    // accessible label, and no direction or level leaks through it.
    const firstIntel = nextHintFamilyLabel();
    const hint = screen.getByTestId("stat-check-next-hint");
    expect(hint.textContent).toBe("");
    expect(hint.getAttribute("aria-label")).not.toMatch(/Highest|Lowest|Level \d/i);
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
    const firstIntel = nextHintFamilyLabel();
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
    // The plaque is icon-only: the short label no longer renders anywhere.
    expect(marker?.textContent).not.toContain("L18 HP");
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

describe("LanePlaque staged reveal", () => {
  /** Visible text only: sr-only stage descriptions are not on the board. */
  function visible(container: HTMLElement) {
    const clone = container.cloneNode(true) as HTMLElement;
    for (const node of Array.from(clone.querySelectorAll(".sr-only"))) node.remove();
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  const at = (result: CategoryResult, stage: LanePlaqueStage) =>
    render(<LanePlaque category={result.category} result={result} stage={stage} reducedMotion />);

  const ALL_STAGES = [
    "category",
    "threshold",
    "values",
    "winner",
    "slice",
    "zero",
    "transfer",
    "bonus",
    "settled",
  ] as const;

  it("shows no winner wording at any scene", () => {
    for (const stage of ALL_STAGES) {
      const text = visible(at(sampleResult({ decisive: true }), stage).container);
      expect(text).not.toMatch(/YOU WIN|THEY WIN|\bTIE\b|BOT WINS|OPPONENT WINS|DECISIVE|NO BONUS/i);
    }
  });

  it("orders the category scene as level, direction, icon", () => {
    const { container } = at(sampleResult({}), "category");
    const level = container.querySelector('[data-testid="stat-check-category-level-highest-hp-18"]');
    const arrow = container.querySelector("svg.lucide-arrow-up");
    const icon = container.querySelector('[data-testid="stat-check-category-icon-highest-hp-18"]');
    expect(level).not.toBeNull();
    expect(arrow).not.toBeNull();
    expect(icon).not.toBeNull();
    // Document order must read level -> arrow -> icon.
    expect(level.compareDocumentPosition(arrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(arrow.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(visible(container)).toContain("lv.");
    expect(visible(container)).toContain("18");
  });

  it("omits lv. entirely for level-independent categories", () => {
    for (const id of ["highest-move-speed", "highest-attack-range"] as const) {
      const category = STAT_CATEGORIES.find((entry) => entry.id === id);
      expect(category, `missing category ${id}`).toBeDefined();
      const { container } = render(<LanePlaque category={category} />);
      expect(visible(container)).not.toMatch(/lv\.|base/i);
      expect(container.querySelector(`[data-testid="stat-check-category-level-${id}"]`)).toBeNull();
      // Move speed and attack range read as "↑ [icon]": the direction/icon
      // group is still there, it is simply the whole plaque.
      const statGroup = container.querySelector<HTMLElement>(`[data-testid="stat-check-category-stat-${id}"]`);
      expect(statGroup).not.toBeNull();
      expect(statGroup!.querySelector("svg.lucide-arrow-up, svg.lucide-arrow-down")).not.toBeNull();
      expect(statGroup!.querySelector(`[data-testid="stat-check-category-icon-${id}"]`)).not.toBeNull();
    }
  });

  it("groups the arrow with the stat icon, apart from the level", () => {
    const { container } = at(sampleResult({}), "category");
    const level = container.querySelector<HTMLElement>('[data-testid="stat-check-category-level-highest-hp-18"]');
    const statGroup = container.querySelector<HTMLElement>('[data-testid="stat-check-category-stat-highest-hp-18"]');
    const arrow = container.querySelector("svg.lucide-arrow-up");
    const icon = container.querySelector('[data-testid="stat-check-category-icon-highest-hp-18"]');

    // Order is still level -> arrow -> icon...
    expect(level!.compareDocumentPosition(arrow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(arrow!.compareDocumentPosition(icon!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ...but the arrow now belongs to the icon's group, not the level's.
    expect(statGroup!.contains(arrow!)).toBe(true);
    expect(statGroup!.contains(icon!)).toBe(true);
    expect(level!.contains(arrow!)).toBe(false);
    // The two groups are separated by a real gap; the arrow/icon pair is closed
    // up by a negative kern sized to the art's own transparent padding.
    expect(statGroup!.parentElement!.className).toMatch(/gap-\[7px\].*md:gap-2\.5/);
    expect(icon!.className).toMatch(/-ml-1\.5.*md:-ml-2\.5.*min-\[1210px\]:-ml-3\.5/);
  });

  it("keeps category and threshold as separate scenes", () => {
    // The category scene carries no scale icon or percentage...
    const category = at(sampleResult({}), "category");
    expect(visible(category.container)).not.toContain("7.5%");
    // ...and the threshold scene shows the requirement only, never the gap.
    const threshold = at(sampleResult({ margin: 0.097, decisive: true }), "threshold");
    expect(visible(threshold.container)).toContain("7.5%");
    expect(visible(threshold.container)).not.toContain("9.7");
  });

  it("reaches +0 before impact and only shows +1 once the packet lands", () => {
    const decisive = sampleResult({ decisive: true });
    expect(visible(at(decisive, "zero").container)).toContain("+0");
    expect(visible(at(decisive, "transfer").container)).toContain("+0");
    expect(visible(at(decisive, "bonus").container)).toContain("+1");
    expect(visible(at(decisive, "settled").container)).toContain("+1");
  });

  it("remains +0 for a failed threshold and for a tie", () => {
    for (const result of [
      sampleResult({ decisive: false }),
      sampleResult({ winner: "tie", margin: 0, decisive: false }),
    ]) {
      for (const stage of ["zero", "transfer", "bonus", "settled"] as const) {
        const text = visible(at(result, stage).container);
        expect(text).toContain("+0");
        expect(text).not.toContain("+1");
      }
    }
  });

  it("renders one identically-sized plaque viewport at every scene", () => {
    const result = sampleResult({ decisive: true });
    const classes = ALL_STAGES.map((stage) => {
      const box = at(result, stage).container.querySelector<HTMLElement>(
        '[data-testid="stat-check-plaque-viewport-highest-hp-18"]',
      );
      expect(box, `stage ${stage} has no fixed viewport`).not.toBeNull();
      return box.className;
    });
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toContain("h-[46px]");
    expect(classes[0]).toContain("w-[57px]");
    expect(classes[0]).toContain("md:h-[76px]");
    expect(classes[0]).toContain("md:w-[115px]");
    expect(classes[0]).toContain("min-[1210px]:w-[123px]");
    expect(classes[0]).toContain("overflow-hidden");
  });

  it("blinks only when the plaque face actually changes", () => {
    // Three faces: category, threshold, bonus. The shutter is keyed to the
    // face, so values/winner/slice reuse the threshold plate without
    // re-blinking, and +0 -> +1 is driven by the packet, not a shutter.
    const result = sampleResult({ decisive: true });
    const keyFor = (stage: LanePlaqueStage) => {
      const shutter = at(result, stage).container.querySelector<HTMLElement>(
        '[data-testid="stat-check-plaque-shutter-highest-hp-18"]',
      );
      return shutter === null ? "none" : "present";
    };
    // The category face carries no shutter at all.
    expect(keyFor("category")).toBe("none");
    for (const stage of ["threshold", "values", "winner", "slice", "zero", "transfer", "bonus", "settled"] as const) {
      expect(keyFor(stage), `stage ${stage}`).toBe("present");
    }
  });

  it("applies responsive icon-size classes to the stat art", () => {
    const stat = at(sampleResult({}), "category").container.querySelector<HTMLElement>(
      '[data-testid="stat-check-category-icon-highest-hp-18"]',
    );
    expect(stat.className).toContain("h-6");
    expect(stat.className).toContain("md:h-10");
    expect(stat.className).toContain("min-[1210px]:h-12");
    // Height-driven with a width cap, so 1:1 and 3:2 art read at equal weight.
    expect(stat.className).toContain("w-auto");
    expect(stat.className).toContain("object-contain");
  });
});

describe("lane value emphasis", () => {
  const decisive = sampleResult({ decisive: true }); // player wins decisively
  const plain = sampleResult({ decisive: false }); // player wins, misses threshold
  const tied = sampleResult({ winner: "tie", margin: 0, decisive: false });

  it("does not touch values before the values scene", () => {
    for (const stage of ["category", "threshold"] as const) {
      expect(laneValueEmphasis(stage, decisive, "player")).toBe("none");
      expect(laneValueEmphasis(stage, decisive, "bot")).toBe("none");
    }
  });

  it("enlarges both sides equally at the values scene", () => {
    expect(laneValueEmphasis("values", decisive, "player")).toBe("enlarged");
    expect(laneValueEmphasis("values", decisive, "bot")).toBe("enlarged");
  });

  it("emphasises the winner and subordinates the loser", () => {
    expect(laneValueEmphasis("winner", decisive, "player")).toBe("winner");
    expect(laneValueEmphasis("winner", decisive, "bot")).toBe("loser");
  });

  it("slices only the losing number, and only on a decisive pass", () => {
    expect(laneValueEmphasis("slice", decisive, "bot")).toBe("sliced");
    expect(laneValueEmphasis("slice", decisive, "player")).toBe("winner");
    // A win that misses the threshold never slices.
    expect(laneValueEmphasis("slice", plain, "bot")).toBe("loser");
    expect(laneValueEmphasis("bonus", plain, "bot")).toBe("loser");
  });

  it("keeps ties symmetrical and never sliced", () => {
    for (const stage of ["values", "winner", "slice", "zero", "transfer", "bonus"] as const) {
      expect(laneValueEmphasis(stage, tied, "player")).toBe("tie");
      expect(laneValueEmphasis(stage, tied, "bot")).toBe("tie");
    }
  });

  it("clears every value effect once the lane settles", () => {
    for (const result of [decisive, plain, tied]) {
      expect(laneValueEmphasis("settled", result, "player")).toBe("none");
      expect(laneValueEmphasis("settled", result, "bot")).toBe("none");
    }
  });

  it("scales the badge with a transform so its layout box never grows", () => {
    const { container } = render(
      <CategoryValueBadge value={625} emphasis="winner" />,
    );
    const badge = container.querySelector<HTMLElement>('[data-testid="stat-check-value-badge"]');
    expect(badge.className).toContain("scale-[1.55]");
    // No width/height utility is applied, so the box itself is untouched.
    expect(badge.className).not.toMatch(/\b(w-\[|h-\[|min-w-|min-h-)/);
  });

  it("slices only the glyphs, in an absolutely positioned overlay", () => {
    const { container } = render(<CategoryValueBadge value={604} emphasis="sliced" />);
    const overlay = container.querySelector<HTMLElement>('[data-testid="stat-check-value-slice"]');
    expect(overlay).not.toBeNull();
    expect(overlay.className).toContain("absolute");
    expect(overlay.className).toContain("pointer-events-none");
    // The real badge is hidden, not removed, so the row keeps its box.
    const badge = container.querySelector<HTMLElement>('[data-testid="stat-check-value-badge"]');
    expect(badge.className).toContain("opacity-0");
  });

  it("does not slice for any non-decisive emphasis", () => {
    for (const emphasis of ["none", "enlarged", "winner", "loser", "tie"] as const) {
      const { container } = render(<CategoryValueBadge value={610} emphasis={emphasis} />);
      expect(container.querySelector('[data-testid="stat-check-value-slice"]')).toBeNull();
    }
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
    const { container } = renderPageAtAuthoredSpeed(); // ruby-crystal, authored 1x beats
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

    // Lane winners now land at lane 1's start (1,740ms) plus the winner scene
    // offset (4,100ms) — the slow deliberate sequence.
    act(() => vi.advanceTimersByTime(4_700));
    expect(lanes(container)[0].textContent).toMatch(/You win|Bot wins|Lane tied/i);

    finishReveal();
    // The bonus stays on the champion card, not duplicated inside the plaque:
    // the item chip names it and the card carries the final value.
    expect(screen.getByTestId("stat-check-reveal-item-player")).toHaveTextContent(/Ruby Crystal \+150/);
    expect(lanes(container)[0].textContent).toContain(final);
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

  it("mounts one vertical dock with no horizontal compact variant", () => {
    renderPage();
    const dock = screen.getByTestId("stat-check-inventory");
    // A single column at every width: no breakpoint turns it back into a row.
    expect(dock.className).toContain("flex-col");
    expect(dock.className).not.toMatch(/flex-row/);
    expect(dock.className).not.toMatch(/min-\[1210px\]:/);
    // Four wells, fixed order, rendered top to bottom.
    const wells = Array.from(dock.querySelectorAll<HTMLElement>('[data-testid^="stat-check-inventory-"]'));
    expect(wells.map((well) => well.dataset.testid)).toEqual([
      "stat-check-inventory-long-sword",
      "stat-check-inventory-cloth-armor",
      "stat-check-inventory-ruby-crystal",
      "stat-check-inventory-mogzy-snack",
    ]);
    // The dock is the hand tray's sibling column, mounted on the board.
    expect(dock.parentElement).toBe(screen.getByTestId("stat-check-hand").parentElement);
    expect(dock.parentElement?.className).toContain("flex");
  });

  function dockWells() {
    return Array.from(
      screen.getByTestId("stat-check-inventory").querySelectorAll<HTMLElement>('[data-testid^="stat-check-inventory-"]'),
    );
  }

  it("collapses and expands the vertical dock, keeping the lever and hint mounted", () => {
    renderPage();
    const dock = screen.getByTestId("stat-check-inventory");
    expect(dock).toHaveAttribute("data-collapsed", "false");
    expect(dockWells()).toHaveLength(4);

    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));

    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "true");
    expect(dockWells()).toHaveLength(0);
    // The lever and the next-round hint survive the collapse...
    expect(screen.getByTestId("stat-check-dock-lever")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-next-hint")).toBeInTheDocument();
    // ...and the dock stays a vertical column mounted on the board.
    expect(screen.getByTestId("stat-check-inventory").className).toContain("flex-col");

    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "false");
    expect(dockWells()).toHaveLength(4);
  });

  it("labels the lever without rendering any text on it", () => {
    renderPage();
    const lever = screen.getByTestId("stat-check-dock-lever");
    expect(lever.textContent).toBe("");
    expect(lever).toHaveAttribute("aria-label", "Collapse items");
    expect(lever).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(lever);
    const collapsed = screen.getByTestId("stat-check-dock-lever");
    expect(collapsed).toHaveAttribute("aria-label", "Expand items");
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the next-round hint as a single icon with no visible direction or level", () => {
    renderPage();
    const hint = screen.getByTestId("stat-check-next-hint");
    // Exactly one stat icon, and nothing readable.
    expect(hint.querySelectorAll("img")).toHaveLength(1);
    expect(hint.textContent).toBe("");
    expect(hint.getAttribute("aria-label")).toMatch(/^Next-round hint: /);
    expect(hint.getAttribute("aria-label")).not.toMatch(/highest|lowest|level \d/i);
    // It is not an item well, so it can never be armed as one.
    expect(hint.dataset.testid).not.toMatch(/^stat-check-inventory-/);
  });

  it("keeps an armed item visible by refusing to hide the wells", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "true");

    // Arming while collapsed must bring the wells back so the armed item stays
    // visibly represented while it waits for a lane.
    fireEvent.click(screen.getByTestId("stat-check-dock-lever")); // expand to reach the well
    armItem("ruby-crystal");
    expect(screen.getByTestId("stat-check-inventory-ruby-crystal")).toHaveAttribute("aria-pressed", "true");

    // The lever cannot hide an armed item.
    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "false");
    expect(dockWells()).toHaveLength(4);
    expect(screen.getByTestId("stat-check-inventory-ruby-crystal")).toHaveAttribute("aria-pressed", "true");
  });

  it("auto-expands the dock when a new item is acquired", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "true");

    // Play to the round-3 item cadence and take an item.
    for (let round = 1; round <= 2; round++) {
      playRound(container);
      fireEvent.click(screen.getByTestId("stat-check-next-round"));
      act(() => vi.advanceTimersByTime(2_000));
    }
    playRound(container);
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "true");

    fireEvent.click(screen.getByTestId("stat-check-item-option-mogzy-snack"));
    fireEvent.click(screen.getByTestId("stat-check-item-confirm"));

    // Acquiring pops the dock open so the new well is never hidden.
    expect(screen.getByTestId("stat-check-inventory")).toHaveAttribute("data-collapsed", "false");
    expect(inventoryCountText("mogzy-snack")).toBe("1");
  });

  it("keeps dock collapse out of authoritative match state", () => {
    const { container } = renderPage();
    const before = {
      ruby: inventoryCountText("ruby-crystal"),
      lockDisabled: (screen.getByTestId("stat-check-lock") as HTMLButtonElement).disabled,
      markers: container.querySelectorAll('[data-testid^="stat-check-marker-"]').length,
    };

    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));

    // Collapsing is pure presentation: nothing the engine owns moves.
    expect((screen.getByTestId("stat-check-lock") as HTMLButtonElement).disabled).toBe(before.lockDisabled);
    expect(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).toHaveLength(before.markers);

    // Re-expanding restores the identical inventory: the count survived a
    // round-trip through collapse untouched.
    fireEvent.click(screen.getByTestId("stat-check-dock-lever"));
    expect(inventoryCountText("ruby-crystal")).toBe(before.ruby);

    // And the match state itself carries no collapse concept at all.
    const state = createMatch(STAT_CHECK_FIXTURE_DECK, "collapse-state-check", { items: true });
    expect(Object.keys(state).some((key) => /collapse|dock|inventoryOpen/i.test(key))).toBe(false);
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
