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
import { compactCategoryLabel } from "./handCardStats";
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

/** The face each lane's plaque is currently showing, in board order. */
function plaqueStages(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).map(
    (marker) => (marker as HTMLElement).dataset.plaqueStage,
  );
}

/**
 * Each lane's authoritative decisive outcome, read back off the settled
 * plaques (`data-bonus`), so a test never has to re-derive the engine's rules.
 * Only meaningful once the lanes have resolved.
 */
function laneDecisiveFlags(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-bonus]")).map(
    (node) => (node as HTMLElement).dataset.bonus === "1",
  );
}

/**
 * The decisive bonus each lane awarded to `side`, in board order — taken from
 * the lane plaques plus each lane's own winner, which is what the tally must
 * agree with.
 */
function laneBonusAmounts(container: HTMLElement, side: "player" | "bot") {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).map((marker) => {
    const bonus = marker.querySelector<HTMLElement>("[data-bonus]");
    if (!bonus || bonus.dataset.bonus !== "1") return 0;
    // The plaque's accessible label names the winner of its own lane.
    const label = (marker.querySelector(".sr-only")?.textContent ?? "").trim();
    const botWon = /^bot wins/i.test(label);
    return (side === "bot") === botWon ? 1 : 0;
  });
}

/**
 * Advance until the centre presentation reaches `stage`, then stop. Returns the
 * reveal node so a test can assert what was on screen at that exact stage.
 */
function advanceToDamageStage(stage: string, side = "bot") {
  for (let elapsed = 0; elapsed < 45_000; elapsed += 40) {
    act(() => vi.advanceTimersByTime(40));
    const node = screen.queryByTestId("stat-check-damage-reveal");
    if (
      node &&
      node.getAttribute("data-damage-side") === side &&
      node.getAttribute("data-damage-stage") === stage
    ) {
      return node;
    }
  }
  return null;
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

  it("resolves lanes strictly left to right with no overlap", () => {
    const { container } = renderPageAtAuthoredSpeed();
    expect(plaqueStages(container)).toEqual(["category", "category", "category"]);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    /**
     * Walked in small steps rather than jumped to computed offsets: a lane's
     * length now depends on its own authoritative outcome, so the ordering
     * guarantee is asserted from what the board actually does. Every observed
     * frame is recorded and the invariants are checked across all of them.
     */
    const frames: string[][] = [];
    for (let elapsed = 0; elapsed < 40_000; elapsed += 100) {
      act(() => vi.advanceTimersByTime(100));
      frames.push(plaqueStages(container) as string[]);
      if (frames[frames.length - 1].every((stage) => stage === "settled")) break;
    }

    // No overlap, ever: at most one lane is mid-sequence in any frame.
    for (const frame of frames) {
      const inProgress = frame.filter((stage) => stage !== "category" && stage !== "settled");
      expect(inProgress.length, `two lanes ran at once: ${frame.join()}`).toBeLessThanOrEqual(1);
    }

    // Strict left -> middle -> right: a lane may only leave `category` once
    // every lane to its left has already reached `settled`.
    for (const frame of frames) {
      for (let lane = 1; lane < 3; lane += 1) {
        if (frame[lane] !== "category") {
          for (let left = 0; left < lane; left += 1) {
            expect(frame[left], `lane ${lane + 1} started before lane ${left + 1} settled`).toBe("settled");
          }
        }
      }
    }

    // Each lane walked its whole sequence, in order, and never went backwards.
    for (let lane = 0; lane < 3; lane += 1) {
      const seen = frames.map((frame) => frame[lane]).filter((stage, index, all) => stage !== all[index - 1]);
      const order = ["category", "threshold", "values", "winner", "slice", "zero", "transfer", "bonus", "settled"];
      const positions = seen.map((stage) => order.indexOf(stage));
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i], `lane ${lane + 1} went backwards`).toBeGreaterThan(positions[i - 1]);
      }
      expect(seen[0]).toBe("category");
      expect(seen[seen.length - 1]).toBe("settled");
    }

    finishReveal();
    expect(plaqueStages(container)).toEqual(["settled", "settled", "settled"]);
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
    expect(screen.getByTestId("stat-check-damage-player")).toBeInTheDocument();
  });

  it("hands off between lanes with no perceptible idle interval", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    const LANE_1 = REVEAL_TIMELINE.resolveLane1 + REVEAL_TIMELINE.itemRevealShiftMs;
    // Lane 1's own outcome decides its length, read from the settled plaque
    // rather than assumed.
    let elapsed = 0;
    const stepTo = (target: number) => {
      act(() => vi.advanceTimersByTime(target - elapsed));
      elapsed = target;
    };

    // Walk to lane 1's settle, whichever length it turned out to have.
    const decisive = laneDecisiveFlags(container);
    const OFFSETS = lanePlaqueStageOffsets(decisive[0]);
    const LANE_MS = laneRevealTotalMs(decisive[0]);

    // A lane's last scheduled scene is `settled`; the only time after it is the
    // cleanup window the value-emphasis transition needs. That window IS the
    // gap between lanes, and it must not exceed the transition it exists for.
    const cleanupWindow = LANE_MS - OFFSETS.settled;
    expect(cleanupWindow).toBe(LANE_PLAQUE_TIMELINE.settleMs);
    expect(cleanupWindow - LANE_PLAQUE_TIMELINE.valueTransitionMs).toBeLessThanOrEqual(20);

    // Walk the real handoff: lane 1 hits `settled`, then lane 2 leaves
    // `category` exactly one cleanup window later — nothing idles in between.
    stepTo(LANE_1 + OFFSETS.settled + 10);
    expect(plaqueStages(container)).toEqual(["settled", "category", "category"]);
    stepTo(LANE_1 + LANE_MS + lanePlaqueStageOffsets(decisive[1]).threshold + 10);
    expect(plaqueStages(container)[1]).toBe("threshold");
  });

  it("resolves a lane that earns no bonus materially faster than a decisive one", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Record when each lane reached `settled`, then compare the lengths the
    // board actually spent against the authoritative outcome of each lane.
    const settledAt: Array<number | null> = [null, null, null];
    for (let elapsed = 100; elapsed <= 40_000; elapsed += 100) {
      act(() => vi.advanceTimersByTime(100));
      const stages = plaqueStages(container);
      stages.forEach((stage, lane) => {
        if (stage === "settled" && settledAt[lane] === null) settledAt[lane] = elapsed;
      });
      if (settledAt.every((at) => at !== null)) break;
    }

    const decisive = laneDecisiveFlags(container);
    // Lengths of lanes 2 and 3 measured from the previous lane's settle.
    const lengths = [settledAt[1]! - settledAt[0]!, settledAt[2]! - settledAt[1]!];
    lengths.forEach((length, index) => {
      const lane = index + 1;
      const expected = laneRevealTotalMs(decisive[lane]);
      // Within one 100ms sampling step of the authored length for its outcome.
      expect(Math.abs(length - expected), `lane ${lane + 1} length ${length} vs ${expected}`).toBeLessThanOrEqual(150);
    });

    // And the two authored lengths really are materially different.
    expect(laneRevealTotalMs(false)).toBeLessThan(laneRevealTotalMs(true));
  });

  it("tells the round as board result, then the three lane bonuses, then the total", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    const popup = () => screen.queryByTestId("stat-check-damage-reveal");
    const playerHp = () => screen.getByTestId("stat-check-player-hp").textContent;

    /**
     * Poll the presentation rather than jumping to computed offsets: the stage
     * layout depends on which components this round produced. Each distinct
     * stage is recorded once, with what the plate showed at that moment.
     */
    type Frame = {
      stage: string | null;
      shown: string | null;
      board: string | null;
      lanesRevealed: number[];
      sweep: boolean;
      totalReached: string | null;
      totalAnimated: boolean;
      totalLabel: string | null;
      hp: string | null;
    };
    const frames: Frame[] = [];
    for (let elapsed = 0; elapsed < 45_000; elapsed += 60) {
      act(() => vi.advanceTimersByTime(60));
      const node = popup();
      if (!node || node.getAttribute("data-damage-side") !== "bot") continue;
      const stage = node.getAttribute("data-damage-stage");
      if (frames.length > 0 && frames[frames.length - 1].stage === stage) continue;
      frames.push({
        stage,
        shown: node.getAttribute("data-damage-shown"),
        board: node.querySelector("[data-testid='stat-check-damage-board']")?.getAttribute("data-damage-board-shown") ?? null,
        lanesRevealed: Array.from(node.querySelectorAll("[data-damage-lane-revealed='true']")).map((lane) =>
          Number((lane as HTMLElement).dataset.damageLaneAmount),
        ),
        sweep: node.querySelector("[data-testid='stat-check-sweep-notice']") !== null,
        totalReached:
          node.querySelector("[data-testid='stat-check-damage-total']")?.getAttribute("data-damage-total-reached") ??
          null,
        totalAnimated: /animate-damage-(tick|strike)/.test(
          node.querySelector("[data-testid='stat-check-damage-total']")?.className ?? "",
        ),
        totalLabel: node.querySelector("[data-testid='stat-check-damage-total-label']")?.textContent ?? null,
        hp: screen.getByTestId("stat-check-player-hp").textContent,
      });
    }

    // Round 1 of the fixture match: the opponent sweeps the board (3) and takes
    // one lane decisively, for 4 — so the board result IS the sweep number.
    const stages = frames.map((frame) => frame.stage);
    expect(stages).toEqual([
      "enter",
      "board",
      "lane-1",
      "lane-2",
      "lane-3",
      "total",
      "impact",
      "health",
      "settled",
    ]);
    expect(popup()).toBeNull(); // cleared before the round advanced

    const at = (stage: string) => frames.find((frame) => frame.stage === stage)!;
    // The board result is established, and it is the sweep's 3 — not 2 then +1.
    expect(at("board").shown).toBe("3");
    expect(at("board").board).toBe("true");
    // Lanes reveal one at a time, left to right, and ALL THREE appear.
    expect(at("board").lanesRevealed).toHaveLength(0);
    expect(at("lane-1").lanesRevealed).toHaveLength(1);
    expect(at("lane-2").lanesRevealed).toHaveLength(2);
    expect(at("lane-3").lanesRevealed).toHaveLength(3);
    // Displayed lane bonuses match the authoritative lane plaques.
    expect(at("lane-3").lanesRevealed).toEqual(laneBonusAmounts(container, "bot"));
    // The subtotal runs up from the board result and lands on the total.
    expect(Number(at("lane-3").shown)).toBe(4);
    expect(at("total").shown).toBe("4");
    expect(at("total").totalLabel).toMatch(/damage/i);

    /**
     * The total must stay genuinely hidden until it lands. The tick/strike
     * keyframes end on opacity:1 with `both` fill, so mounting them early would
     * override the hidden class and park the answer on screen for the whole
     * count — which is exactly what a capture caught.
     */
    for (const stage of ["enter", "board", "lane-1", "lane-2", "lane-3"]) {
      expect(at(stage).totalReached, `total revealed early at ${stage}`).toBe("false");
      expect(at(stage).totalAnimated, `total animated early at ${stage}`).toBe(false);
    }
    for (const stage of ["total", "impact", "health"]) {
      expect(at(stage).totalReached).toBe("true");
      expect(at(stage).totalAnimated).toBe(true);
    }

    // Health moves at impact's own health stage, and never before it.
    for (const stage of ["enter", "board", "lane-1", "lane-2", "lane-3", "total", "impact"]) {
      expect(at(stage).hp, `health must not move at ${stage}`).toMatch(/^20 \//);
    }
    expect(at("health").hp).toMatch(/^16 \//);

    finishReveal();
    // Authoritative rail total agrees with the number the centre counted to.
    expect(screen.getByTestId("stat-check-damage-bot")).toHaveTextContent(/Total: 4/);
    expect(playerHp()).toMatch(/^16 \//);
  });

  it("heads the tally with the round winner's identity and avatar", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    const identity = advanceToDamageStage("board");
    expect(identity).not.toBeNull();
    const header = screen.getByTestId("stat-check-damage-identity");
    // Bot play: the bot IS the round winner here, named, never "Bot strikes you".
    expect(header).toHaveAttribute("data-damage-label", "WINNER");
    expect(header).toHaveAttribute("data-damage-name", "Bot");
    expect(header.textContent).toContain("WINNER: Bot");
    expect(header.textContent).not.toMatch(/strikes/i);
    // The avatar reads as part of the same header, from the shared component.
    expect(header.querySelector("img, svg.lucide-user")).not.toBeNull();
  });

  it("uses the real usernames and avatars it is given", () => {
    const identities = {
      player: { name: "mogsyfan", avatarUrl: "https://cdn.example/a.png" },
      bot: { name: "Faker2010", avatarUrl: "https://cdn.example/b.png" },
    };
    window.sessionStorage.setItem("stat-check-animation-speed", "1");
    const { container } = render(<StatCheckPage identities={identities} />);
    expect(completeItemChoiceIfPresent()).toBe(true);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    advanceToDamageStage("board");
    const header = screen.getByTestId("stat-check-damage-identity");
    expect(header).toHaveAttribute("data-damage-name", "Faker2010");
    expect(header.textContent).toContain("WINNER: Faker2010");
    const avatar = header.querySelector("img");
    expect(avatar).not.toBeNull();
    expect(avatar!.getAttribute("src")).toBe("https://cdn.example/b.png");
  });

  it("floats a SWEEP notification for a 3-0 board, only while the 3 is up", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Round 1 of the fixture match is an authoritative 3-0 sweep.
    const reveal = advanceToDamageStage("board");
    expect(reveal).toHaveAttribute("data-damage-sweep", "true");
    const notice = screen.getByTestId("stat-check-sweep-notice");
    expect(notice.textContent).toMatch(/sweep/i);
    // Board result on screen at the same time is the sweep's own 3.
    expect(reveal).toHaveAttribute("data-damage-shown", "3");
    // It is a floating notification, not part of the plate.
    expect(notice.closest("[data-testid='stat-check-damage-identity']")).toBeNull();
    expect(notice.className).toContain("absolute");
    // Motion-safe: the float and the glint are the first things reduced motion drops.
    expect(notice.querySelector(".animate-sweep-notice")?.className).toContain("motion-reduce:animate-none");
    expect(notice.querySelector("[data-testid='stat-check-sweep-glint']")?.className).toContain("motion-reduce:hidden");

    // It leaves with the board stage and never returns for the lane bonuses.
    advanceToDamageStage("lane-1");
    expect(screen.queryByTestId("stat-check-sweep-notice")).toBeNull();
    for (const stage of ["lane-2", "lane-3", "total", "impact"] as const) {
      advanceToDamageStage(stage);
      expect(screen.queryByTestId("stat-check-sweep-notice"), `sweep returned at ${stage}`).toBeNull();
    }
  });

  it("ties the SWEEP notification to the authoritative sweep flag across many rounds", () => {
    const { container } = renderPageAtAuthoredSpeed();

    /**
     * The invariant, checked on every frame of several real rounds: the
     * notification is on screen ONLY when the authoritative step says the board
     * was swept AND the board result is the one on screen. A 2-1 board win, a
     * decisive bonus and a retaliation therefore can never produce it. (The
     * 2-1 and bonus-only cases are also pinned directly, without a game, in
     * damageReveal.test.ts.)
     */
    const boardResultsSeen = new Set<string>();
    let noticeFrames = 0;
    for (let round = 0; round < 4; round += 1) {
      if (!screen.queryByTestId("stat-check-lock")) break;
      fillBoard(container);
      fireEvent.click(screen.getByTestId("stat-check-lock"));

      for (let elapsed = 0; elapsed < 45_000; elapsed += 80) {
        act(() => vi.advanceTimersByTime(80));
        const node = screen.queryByTestId("stat-check-damage-reveal");
        const notice = screen.queryByTestId("stat-check-sweep-notice");
        if (!node) {
          expect(notice, "a notification outlived its presentation").toBeNull();
          continue;
        }
        const swept = node.getAttribute("data-damage-sweep") === "true";
        const stage = node.getAttribute("data-damage-stage");
        if (notice) {
          noticeFrames += 1;
          expect(swept, "notification without an authoritative sweep").toBe(true);
          expect(stage, "notification outside the board result").toBe("board");
          // A sweep board result is always 3 — never a bonus-driven number.
          expect(node.getAttribute("data-damage-shown")).toBe("3");
        }
        if (stage === "board") boardResultsSeen.add(node.getAttribute("data-damage-shown") ?? "");
        if (!swept) expect(notice, "notification on a non-swept board").toBeNull();
      }
      if (!screen.queryByTestId("stat-check-next-round")) break;
      fireEvent.click(screen.getByTestId("stat-check-next-round"));
      completeItemChoiceIfPresent();
    }

    // The walk really did exercise the notification at least once.
    expect(noticeFrames).toBeGreaterThan(0);
    // Every board result shown was a legal one: 2 or 3, never anything else.
    expect([...boardResultsSeen].sort()).not.toContain("1");
    for (const board of boardResultsSeen) expect(["2", "3"]).toContain(board);
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
    // No presentation means no floating notification either, swept or not.
    expect(screen.queryByTestId("stat-check-sweep-notice")).toBeNull();
    expect(screen.getByTestId("stat-check-arena").className).not.toContain("animate-arena-jolt");
    // Same authoritative health as the full presentation lands on.
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("16 / 20 HP");
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("20 / 20 HP");
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  });

  it("reduced motion lands every lane on its final plaque immediately", () => {
    reducedMotion(true);
    const { container } = renderPage();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    // Both outcomes collapse to the same instant: no lane is left mid-sequence.
    expect(plaqueStages(container)).toEqual(["settled", "settled", "settled"]);
    // And each plaque rests on its authoritative bonus, decisive or not.
    const bonuses = Array.from(container.querySelectorAll("[data-bonus]")).map((node) =>
      (node as HTMLElement).dataset.bonus,
    );
    expect(bonuses).toHaveLength(3);
    expect(bonuses.every((bonus) => bonus === "0" || bonus === "1")).toBe(true);
  });

  it("restart mid-presentation clears the popup and the revealed health steps", () => {
    const { container } = renderPageAtAuthoredSpeed();
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    advanceToDamageStage("enter");
    expect(screen.getByTestId("stat-check-damage-reveal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(screen.queryByTestId("stat-check-damage-reveal")).toBeNull();
    expect(screen.queryByTestId("stat-check-sweep-notice")).toBeNull();
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

/**
 * Cards in hand answer the live board: exactly the three current lane
 * categories, in lane order. Placing a card collapses it to that one lane's
 * contested value.
 */
describe("StatCheckPage hand cards answer the board", () => {
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

  /** The board's category ids in lane order, read off the lane plaques. */
  function boardCategoryIds(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).map((marker) =>
      (marker.getAttribute("data-testid") ?? "").replace("stat-check-marker-", ""),
    );
  }

  function handCardRows(handIndex: number) {
    const card = screen.getByTestId(`stat-check-hand-${handIndex}`);
    return Array.from(card.querySelectorAll<HTMLElement>("[data-card-category]"));
  }

  function rowSummary(rows: HTMLElement[]) {
    return rows.map((row) => ({
      lane: Number(row.dataset.cardLane),
      category: row.dataset.cardCategory,
      text: (row.textContent ?? "").trim(),
    }));
  }

  function categoryById(id: string | undefined) {
    const found = STAT_CATEGORIES.find((entry) => entry.id === id);
    if (!found) throw new Error(`unknown category ${id}`);
    return found;
  }

  /** The visible values on a placed lane card (excluding the invisible pre-mount). */
  function laneCardValues(container: HTMLElement, laneIndex: number) {
    const lane = lanes(container)[laneIndex];
    const card = Array.from(lane.querySelectorAll<HTMLElement>("[data-card-champion]")).find(
      (element) => !element.closest('[data-board-premount="true"]'),
    );
    return {
      badges: card?.querySelectorAll('[data-testid="stat-check-value"]').length ?? 0,
      rows: card?.querySelectorAll("[data-card-category]").length ?? 0,
      text: (card?.textContent ?? "").trim(),
      className: card?.className ?? "",
    };
  }

  it("shows exactly three rows per hand card, in lane order, matching the board", () => {
    const { container } = renderPage();
    const expected = boardCategoryIds(container);
    expect(expected).toHaveLength(3);

    for (let handIndex = 0; handIndex < 6; handIndex += 1) {
      const rows = rowSummary(handCardRows(handIndex));
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.lane)).toEqual([0, 1, 2]);
      expect(rows.map((row) => row.category)).toEqual(expected);
    }
  });

  it("shows no stat outside the current board", () => {
    const { container } = renderPage();
    const board = boardCategoryIds(container);
    const card = screen.getByTestId("stat-check-hand-0");
    const rows = Array.from(card.querySelectorAll<HTMLElement>("[data-card-category]"));
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(board).toContain(row.dataset.cardCategory);
    });
    // The board-driven row set replaced the generic fixed chip set.
    expect(card.querySelector('[data-testid="stat-check-card-board-rows"]')).not.toBeNull();
  });

  it("uses the same values the lane comparison contests", () => {
    const { container } = renderPage();
    const board = boardCategoryIds(container);
    const champion = screen.getByTestId("stat-check-hand-0").getAttribute("data-card-champion");
    const card = STAT_CHECK_FIXTURE_DECK.find((entry) => entry.name === champion);
    expect(card).toBeTruthy();
    handCardRows(0).forEach((row, index) => {
      const category = categoryById(board[index]);
      const authoritative = category.formatValue(category.getValue(card!));
      expect((row.textContent ?? "").trim()).toBe(`${compactCategoryLabel(category)} ${authoritative}`);
    });
  });

  it("spells out the full categories in the hand card's accessible label", () => {
    const { container } = renderPage();
    const label = screen.getByTestId("stat-check-hand-0").getAttribute("aria-label") ?? "";
    boardCategoryIds(container).forEach((id) => {
      expect(label.toLowerCase()).toContain(categoryById(id).label.toLowerCase());
    });
  });

  it.each([0, 1, 2])("leaves only lane %i's value on a card placed there", (laneIndex) => {
    const { container } = renderPage();
    const board = boardCategoryIds(container);
    place(container, 0, laneIndex);

    const placed = laneCardValues(container, laneIndex);
    // One contested value, and none of the three-row hand presentation.
    expect(placed.badges).toBe(1);
    expect(placed.rows).toBe(0);

    // No other lane's category label survives on the placed card.
    board
      .filter((_, index) => index !== laneIndex)
      .map((id) => compactCategoryLabel(categoryById(id)))
      .forEach((otherLabel) => {
        expect(placed.text).not.toContain(otherLabel);
      });
  });

  it("keeps hand and placed card geometry unchanged by the row change", () => {
    const { container } = renderPage();
    const handCard = screen.getByTestId("stat-check-hand-0");
    // Fixed size classes are the geometry contract; the row change is content-only.
    expect(handCard.className).toContain("h-40 w-28");
    expect(handCard.className).toContain("sm:h-44 sm:w-32");
    place(container, 0, 0);
    expect(laneCardValues(container, 0).className).toContain("w-[clamp(");
  });

  it("updates every remaining hand card to the new round's categories", () => {
    const { container } = renderPage();
    const firstRound = boardCategoryIds(container);
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();
    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    completeItemChoiceIfPresent();
    act(() => vi.advanceTimersByTime(2_000));

    // The round genuinely advanced, so the board comparison below is not vacuous.
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    const secondRound = boardCategoryIds(container);
    expect(secondRound).toHaveLength(3);
    const rows = rowSummary(handCardRows(0));
    expect(rows.map((row) => row.category)).toEqual(secondRound);
    // Consecutive boards share no category id, so every round-1 row is stale
    // and this negative covers the whole previous board.
    const stale = firstRound.filter((id) => !secondRound.includes(id));
    expect(stale).toHaveLength(3);
    rows.forEach((row) => {
      expect(stale).not.toContain(row.category);
    });
  });

  it("keeps the next-round hint limited to the stat family", () => {
    const { container } = renderPage();
    fillBoard(container);
    const hint = nextHintFamilyLabel();
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).not.toMatch(/level|highest|lowest/i);
    expect(boardCategoryIds(container)).toHaveLength(3);
  });

  it("adds no category rows to the opponent's concealed cards", () => {
    const { container } = renderPage();
    fillBoard(container);
    // Hand cards still carry rows, so this is a real negative for the opponent.
    expect(container.querySelectorAll("[data-card-category]").length).toBeGreaterThan(0);
    lanes(container).forEach((lane) => {
      expect(lane.textContent).toContain("Concealed");
      Array.from(lane.querySelectorAll<HTMLElement>("[data-card-champion]")).forEach((face) => {
        expect(face.querySelectorAll("[data-card-category]").length).toBe(0);
      });
    });
  });
});

/**
 * The round-transition discard frame. Outgoing clones used to carry no
 * category, so they fell back to the generic HP/AD/AR/RNG chip set and flashed
 * stats unrelated to the round being cleared.
 */
describe("StatCheckPage discard transition presentation", () => {
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

  /** Every value visible on the resolved board, both sides, in lane order. */
  function resolvedBoardValues(container: HTMLElement) {
    return lanes(container).flatMap((lane) =>
      Array.from(lane.querySelectorAll<HTMLElement>('[data-testid="stat-check-value-badge"]')).map((badge) =>
        (badge.textContent ?? "").trim(),
      ),
    );
  }

  /** Travel clones render through a portal on document.body, not in container. */
  function travelClones() {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-testid^="stat-check-travel-card-"]')).map((clone) => ({
      champion: clone.querySelector("[data-card-champion]")?.getAttribute("data-card-champion") ?? null,
      badges: clone.querySelectorAll('[data-testid="stat-check-value"]').length,
      rows: clone.querySelectorAll("[data-card-category]").length,
      value: (clone.querySelector('[data-testid="stat-check-value-badge"]')?.textContent ?? "").trim(),
      text: (clone.textContent ?? "").trim(),
    }));
  }

  function armItem(itemId: string) {
    fireEvent.click(screen.getByTestId(`stat-check-inventory-${itemId}`));
  }

  /** Drive one full round to the point where Next Round is offered. */
  function playRound(container: HTMLElement) {
    fillBoard(container);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  }

  it("keeps each outgoing card on its own lane value instead of the generic stat chips", () => {
    const { container } = renderPage();
    playRound(container);
    const boardValues = resolvedBoardValues(container);
    expect(boardValues).toHaveLength(6);

    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    // Sample the discard frame while the clones are still in flight.
    act(() => vi.advanceTimersByTime(120));
    const clones = travelClones();
    expect(clones).toHaveLength(6);

    clones.forEach((clone) => {
      // One contested value, no hand rows, and no generic chip anywhere.
      expect(clone.badges).toBe(1);
      expect(clone.rows).toBe(0);
      expect(clone.text).not.toMatch(/HP|AD|AR|RNG/);
      // The number it leaves with is the number it just contested.
      expect(boardValues).toContain(clone.value);
    });
  });

  it("shows no next-round category on an outgoing card", () => {
    const { container } = renderPage();
    playRound(container);
    const previousBoard = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).map((marker) =>
      (marker.getAttribute("data-testid") ?? "").replace("stat-check-marker-", ""),
    );

    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    act(() => vi.advanceTimersByTime(120));

    // Clones carry only the retired lanes' own categories.
    const cloneNodes = Array.from(document.body.querySelectorAll<HTMLElement>('[data-testid^="stat-check-travel-card-"]'));
    expect(cloneNodes).toHaveLength(6);
    expect(cloneNodes.flatMap((clone) => Array.from(clone.querySelectorAll("[data-card-category]")))).toHaveLength(0);

    // Once the transition settles the board has moved on, and consecutive
    // boards share no category id — so nothing in flight could have shown it.
    act(() => vi.advanceTimersByTime(4_000));
    completeItemChoiceIfPresent();
    act(() => vi.advanceTimersByTime(1_000));
    const nextBoard = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).map((marker) =>
      (marker.getAttribute("data-testid") ?? "").replace("stat-check-marker-", ""),
    );
    expect(nextBoard).toHaveLength(3);
    expect(nextBoard.filter((id) => previousBoard.includes(id))).toHaveLength(0);
  });

  it("leaves the hand on the new categories once the transition finishes", () => {
    const { container } = renderPage();
    playRound(container);
    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    act(() => vi.advanceTimersByTime(4_000));
    completeItemChoiceIfPresent();
    act(() => vi.advanceTimersByTime(1_000));

    // No clone survives the transition, and the hand carries exactly the new board.
    expect(document.body.querySelectorAll('[data-testid^="stat-check-travel-card-"]')).toHaveLength(0);
    const board = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).map((marker) =>
      (marker.getAttribute("data-testid") ?? "").replace("stat-check-marker-", ""),
    );
    const rows = Array.from(
      screen.getByTestId("stat-check-hand-0").querySelectorAll<HTMLElement>("[data-card-category]"),
    ).map((row) => row.getAttribute("data-card-category"));
    expect(rows).toEqual(board);
  });

  it("keeps the outgoing card's item-adjusted value, not its natural one", () => {
    const { container } = renderPage(); // opening choice takes ruby-crystal (+150 health)
    fillBoard(container);
    const healthLane = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-marker-"]')).findIndex((marker) =>
      (marker.getAttribute("data-testid") ?? "").includes("hp"),
    );
    if (healthLane < 0) return; // this seed's board has no health lane
    armItem("ruby-crystal");
    fireEvent.click(lanes(container)[healthLane]);
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    finishReveal();

    const boardValues = resolvedBoardValues(container);
    fireEvent.click(screen.getByTestId("stat-check-next-round"));
    act(() => vi.advanceTimersByTime(120));

    // Every clone value is a value the resolved board actually showed, so the
    // equipped lane leaves with its bonus applied rather than a natural value.
    const clones = travelClones();
    expect(clones).toHaveLength(6);
    clones.forEach((clone) => {
      expect(boardValues).toContain(clone.value);
    });
  });
});
