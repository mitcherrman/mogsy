/**
 * PT1.3 — the post-match discovery ceremony's presentation.
 *
 * Three things are worth testing here and they are all product rules rather
 * than markup: a real reward is celebrated with the SERVER's numbers, a
 * zero-discovery match is never dressed up as an event, and nothing on this
 * surface can reveal an answer.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MatchDiscoveriesView } from "@/lib/ranked-public/contracts";
import { DiscoveryReveal, discoveryRevealHasContent } from "./DiscoveryReveal";

const entry = (ref: string, prompt: string, round: number, category = "Item Costs") => ({
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
    entry("ranked:c", "How much armour does Trundle start with?", 3, "Champion Stats"),
  ],
  newCount: 3,
  collectionTotal: 423,
  collectionTotalBefore: 420,
  truncated: false,
  ...over,
});

describe("DiscoveryReveal — a match with new discoveries", () => {
  it("names what was earned, in the order it was played", () => {
    render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    expect(screen.getByTestId("discovery-headline"))
      .toHaveTextContent("3 new questions added to your collection");
    const rows = screen.getAllByTestId("discovery-entry");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("What is Flash's base cooldown?");
    expect(rows[0]).toHaveTextContent("R1");
    expect(rows[2]).toHaveTextContent("R3");
  });

  it("prints growth from the server's own before/after, never from the list", () => {
    // `newCount` deliberately disagrees with the row count here: the collection
    // arithmetic must follow the authoritative count, not what fit on screen.
    render(<DiscoveryReveal
      view={view({ newCount: 4, collectionTotalBefore: 419, truncated: true })}
      onReview={vi.fn()} />);
    const growth = screen.getByTestId("discovery-growth");
    expect(growth).toHaveTextContent("419");
    expect(growth).toHaveTextContent("423");
    expect(screen.getByTestId("discovery-headline")).toHaveTextContent("4 new questions");
  });

  it("says 'question' for exactly one discovery", () => {
    render(<DiscoveryReveal
      view={view({ newDiscoveries: [entry("ranked:a", "One?", 1)], newCount: 1,
        collectionTotal: 1, collectionTotalBefore: 0 })}
      onReview={vi.fn()} />);
    expect(screen.getByTestId("discovery-headline"))
      .toHaveTextContent("1 new question added to your collection");
    expect(screen.getByTestId("discovery-growth")).toHaveTextContent("0");
    expect(screen.getByTestId("discovery-growth")).toHaveTextContent("1");
  });

  it("offers the CTA into the collection and calls it exactly once", () => {
    const onReview = vi.fn();
    render(<DiscoveryReveal view={view()} onReview={onReview} />);
    const cta = screen.getByTestId("discovery-cta");
    expect(cta).toHaveTextContent("Review New Discoveries");
    fireEvent.click(cta);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("keeps an unresolvable discovery as a counted entry", () => {
    render(<DiscoveryReveal view={view({
      newDiscoveries: [{
        canonicalQuestionRef: "ranked:retired",
        firstSeenAt: "2026-09-03T12:00:00Z",
        firstRoundNumber: 1,
        metadataStatus: "unavailable",
        metadataSource: "current_serving_bank",
        question: null,
      }],
      newCount: 1, collectionTotal: 1, collectionTotalBefore: 0,
    })} onReview={vi.fn()} />);
    expect(screen.getAllByTestId("discovery-entry")).toHaveLength(1);
    expect(screen.getByTestId("discovery-headline")).toHaveTextContent("1 new question");
  });

  it("shows no answer, option or explanation anywhere in the DOM", () => {
    const { container } = render(<DiscoveryReveal view={view()} onReview={vi.fn()} />);
    const text = container.textContent ?? "";
    for (const forbidden of ["Correct", "correct answer", "Explanation", "2400"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("DiscoveryReveal — a match with no new discoveries", () => {
  const none = (collectionTotal: number) => view({
    newDiscoveries: [], newCount: 0, collectionTotal,
    collectionTotalBefore: collectionTotal,
  });

  it("never celebrates, and never prints a zero", () => {
    const { container } = render(
      <DiscoveryReveal view={none(12)} onReview={vi.fn()} />);
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
    expect(screen.queryByTestId("discovery-headline")).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("leaves one quiet, non-celebratory collection status with a way in", () => {
    const onReview = vi.fn();
    render(<DiscoveryReveal view={none(12)} onReview={onReview} />);
    const quiet = screen.getByTestId("discovery-quiet");
    expect(quiet).toHaveTextContent("No new questions this match");
    expect(quiet).toHaveTextContent("12");
    fireEvent.click(screen.getByTestId("discovery-quiet-cta"));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("renders NOTHING when the account has no collection either", () => {
    const { container } = render(
      <DiscoveryReveal view={none(0)} onReview={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading, and nothing after a failed read", () => {
    const { container } = render(<DiscoveryReveal view={null} onReview={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("discoveryRevealHasContent", () => {
  it("agrees with what the component actually renders", () => {
    const cases: Array<[MatchDiscoveriesView | null, boolean]> = [
      [null, false],
      [view(), true],
      [view({ newDiscoveries: [], newCount: 0, collectionTotal: 12 }), true],
      [view({ newDiscoveries: [], newCount: 0, collectionTotal: 0,
        collectionTotalBefore: 0 }), false],
    ];
    for (const [candidate, expected] of cases) {
      expect(discoveryRevealHasContent(candidate)).toBe(expected);
      const { container, unmount } = render(
        <DiscoveryReveal view={candidate} onReview={vi.fn()} />);
      expect(container.childNodes.length > 0).toBe(expected);
      unmount();
    }
  });
});
