/**
 * MPE — the discovery CEREMONY: when it plays, when it must not, and that the
 * facts are identical either way.
 *
 * The component tests next door cover what the reveal says. These cover the
 * reward's behaviour as an event: one cue per match under the engine's own id,
 * silence for a refetch, a StrictMode double mount, a reload and a zero
 * result, the card stagger and its cap, Mogzy's plate, and the figures a
 * screen reader and a test can rely on while the visible count is climbing.
 */
import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchDiscoveriesView } from "@/lib/ranked-public/contracts";
import { MOGZY_MASCOT_ASSETS_COMPACT } from "@/components/mascot/mascot-assets";

const play = vi.fn();
// Stable, as the real `useSfx` is (memoised once): a per-render object would
// be a different hook from the one production renders.
const SFX_API = { play, stop: vi.fn(), preload: vi.fn() };
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => SFX_API,
}));
let reduced = false;
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced,
  readReducedMotionPreference: () => reduced,
  APP_REDUCE_MOTION_CLASS: "reduce-motion",
}));

import {
  DISCOVERY_BEATS, DiscoveryReveal, cardDelayMs, discoverySoundEventId,
} from "./DiscoveryReveal";

const entry = (ref: string, prompt: string, round: number | null, category = "Item Costs") => ({
  canonicalQuestionRef: ref,
  firstSeenAt: "2026-09-03T12:00:00Z",
  firstRoundNumber: round,
  metadataStatus: "resolved" as const,
  metadataSource: "frozen_round",
  question: { prompt, category },
});

const view = (over: Partial<MatchDiscoveriesView> = {}): MatchDiscoveriesView => ({
  schemaVersion: "ranked_duel.match_discoveries.v1",
  serverTime: "2026-09-03T12:00:05Z",
  matchId: "rkb_abc",
  scope: "ranked_discoveries",
  includesDefaultLibrary: false,
  newDiscoveries: [
    entry("ranked:a", "What is Flash's base cooldown?", 1, "Summoner Spells"),
    entry("ranked:b", "How much does Doran's Shield cost?", 2),
    {
      canonicalQuestionRef: "ranked:retired",
      firstSeenAt: "2026-09-03T12:00:00Z",
      firstRoundNumber: 5,
      metadataStatus: "unavailable" as const,
      metadataSource: "current_serving_bank",
      question: null,
    },
  ],
  newCount: 3,
  collectionTotal: 423,
  collectionTotalBefore: 420,
  truncated: false,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  play.mockClear();
  reduced = false;
});
afterEach(() => { vi.useRealTimers(); });

describe("the discovery cue", () => {
  it("sounds ONCE, as the first card lands, under the match's own event id", () => {
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    expect(play).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(DISCOVERY_BEATS.cards); });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("ranked.discovery.reveal", {
      eventId: discoverySoundEventId("rkb_abc"),
    });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode's double mount with one cue", () => {
    render(<StrictMode><DiscoveryReveal view={view()} onReview={vi.fn()} /></StrictMode>);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not sound again when the same match's answer is refetched", () => {
    const { rerender } = render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3000); });
    // A new object carrying the same facts — what a refetch produces.
    rerender(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("is silent for a reload or a History visit, and the panel is at rest", () => {
    render(<DiscoveryReveal view={view()} ceremony={false} onReview={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(play).not.toHaveBeenCalled();
    const panel = screen.getByTestId("discovery-reveal");
    expect(panel).toHaveAttribute("data-ceremony", "false");
    expect(panel.querySelector(".reward-sheen")).toBeNull();
    // Every fact is still there.
    expect(screen.getByTestId("discovery-headline"))
      .toHaveTextContent("3 new questions added to your collection");
    expect(screen.getAllByTestId("discovery-entry")).toHaveLength(3);
    expect(screen.getByTestId("discovery-growth")).toHaveTextContent("Your collection grew from 420 to 423");
  });

  it("is silent when nothing was discovered", () => {
    render(<DiscoveryReveal view={view({
      newDiscoveries: [], newCount: 0, collectionTotal: 12, collectionTotalBefore: 12,
    })} onReview={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByTestId("discovery-quiet")).toBeInTheDocument();
  });

  it("is silent while loading and after a failed read", () => {
    render(<DiscoveryReveal view={null} onReview={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(play).not.toHaveBeenCalled();
  });
});

describe("the discovery choreography", () => {
  it("lays the cards down on a stagger, capped so a long list still finishes promptly", () => {
    expect(cardDelayMs(0)).toBe(DISCOVERY_BEATS.cards);
    expect(cardDelayMs(1)).toBe(DISCOVERY_BEATS.cards + DISCOVERY_BEATS.cardStep);
    expect(cardDelayMs(40)).toBe(DISCOVERY_BEATS.cardMaxDelay);
    expect(DISCOVERY_BEATS.cardMaxDelay).toBeLessThanOrEqual(700);
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    const rows = screen.getAllByTestId("discovery-entry");
    expect(rows[0].style.getPropertyValue("--reward-delay")).toBe(`${cardDelayMs(0)}ms`);
    expect(rows[2].style.getPropertyValue("--reward-delay")).toBe(`${cardDelayMs(2)}ms`);
    expect(screen.getByTestId("discovery-reveal")).toHaveAttribute("data-ceremony", "true");
  });

  it("stamps every card as a FIRST-TIME discovery, and keeps a retired question as one", () => {
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    const rows = screen.getAllByTestId("discovery-entry");
    for (const row of rows) expect(row).toHaveTextContent(/New/);
    expect(rows[0]).toHaveAttribute("data-metadata", "resolved");
    expect(rows[0]).toHaveTextContent("R1");
    expect(rows[2]).toHaveAttribute("data-metadata", "unavailable");
    expect(rows[2]).toHaveTextContent("A question that has since left the Ranked bank.");
    expect(rows[2]).toHaveTextContent("R5");
  });

  it("omits the round chip when the server stated no round", () => {
    render(<DiscoveryReveal view={view({
      newDiscoveries: [entry("ranked:x", "One?", null)], newCount: 1,
      collectionTotal: 1, collectionTotalBefore: 0,
    })} onReview={vi.fn()} />);
    expect(screen.getByTestId("discovery-entry")).not.toHaveTextContent(/R\d/);
  });

  it("draws Mogzy holding the book, from the compact plate, as decoration", () => {
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    const mascot = screen.getByTestId("discovery-mascot");
    expect(mascot).toHaveAttribute("src", MOGZY_MASCOT_ASSETS_COMPACT.holdingBook);
    expect(mascot).toHaveAttribute("aria-hidden", "true");
    expect(mascot).toHaveAttribute("alt", "");
  });

  it("carries the final collection figures while the visible count is still climbing", () => {
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    const growth = screen.getByTestId("discovery-growth");
    expect(growth).toHaveAttribute("data-collection-before", "420");
    expect(growth).toHaveAttribute("data-collection-total", "423");
    expect(growth).toHaveTextContent("Your collection grew from 420 to 423 discovered questions.");
    // Before the count begins the visible figure is the TRUE starting point.
    expect(growth.querySelector(".reward-xp-value__figure")).toHaveTextContent("420");
  });

  it("under reduced motion prints the grown collection at once", () => {
    reduced = true;
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    expect(screen.getByTestId("discovery-growth").querySelector(".reward-xp-value__figure"))
      .toHaveTextContent("423");
    // The cue is a sound, not motion: it still plays.
    act(() => { vi.advanceTimersByTime(DISCOVERY_BEATS.cards); });
    expect(play).toHaveBeenCalledTimes(1);
  });
});
