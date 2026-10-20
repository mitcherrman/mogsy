/**
 * PGM1 — Leaguecraft's way back to More Challenges, for returning players.
 *
 * One quiet section below the first screen (after Quick Study, before the
 * History record), holding a plain link: the hub still fetches nothing, and
 * the catalog page owns every mode and action.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));

import LeaguecraftHub from "./LeaguecraftHub";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function CatalogProbe() {
  const l = useLocation();
  return <pre data-testid="catalog-route">{l.pathname + JSON.stringify(l.state)}</pre>;
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <Routes>
        <Route path="/quiz" element={
          <LeaguecraftHub
            initialCentreMode="ranked"
            progress={null}
            ranked={{ placementMatchesRemaining: 0, isPlaced: true, estimatedGain: 25, estimatedLoss: 15 }}
            onPlayRanked={() => true}
            onCommitRole={() => true}
            onEnterMatch={() => {}}
            onPlayDailyChallenge={() => {}}
            playModes={{ ranked: true, daily: true, invite: true }}
            sets={[]}
            onSelectSet={() => {}}
            history={null}
            historyLoading={false}
            historyError={null}
          />} />
        <Route path="/quiz/more-challenges" element={<CatalogProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LeaguecraftHub — More Challenges (PGM1)", () => {
  it("sits after Quick Study and before the History record", () => {
    const { container } = renderHub();
    const rail = container.querySelector('[data-testid="hub-quick-study"]')!;
    const more = container.querySelector('[data-testid="hub-more-challenges"]')!;
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    expect(more).not.toBeNull();
    expect(rail.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more.textContent).toMatch(/none of them change your daily score or ranked rating/i);
  });

  it("links to the catalog, naming Leaguecraft as the way in, and fetches nothing", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderHub();
    const link = screen.getByTestId("hub-more-challenges-link");
    expect(link).toHaveAttribute("href", "/quiz/more-challenges");
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(screen.getByTestId("catalog-route"))
      .toHaveTextContent('/quiz/more-challenges{"moreChallengesSource":"leaguecraft"}');
  });

  it("PM1: is one substantial invitation — a single door, decorative art, unrated, never a queue", () => {
    renderHub();
    const section = screen.getByTestId("hub-more-challenges");
    expect(section.getAttribute("aria-labelledby")).toBe("hub-more-challenges-heading");
    expect(within(section).getByRole("heading", { name: "More Challenges" }).id)
      .toBe("hub-more-challenges-heading");
    // Exactly one interactive control: the catalog link.
    expect(within(section).getAllByRole("link")).toHaveLength(1);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    // The catalog's own art, decorative — never a list of doors.
    const art = within(section).getByTestId("hub-more-challenges-art");
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.querySelectorAll('[data-testid="mode-card-art"]').length).toBe(3);
    expect(art.querySelectorAll("a, button").length).toBe(0);
    // Unrated, in words; and nothing that reads as Ranked matchmaking.
    expect(within(section).getByTestId("hub-more-challenges-unrated").textContent)
      .toMatch(/unrated/i);
    expect(section.textContent).not.toMatch(/queue|find match|matchmaking|LP/i);
  });

  it("PM1: sits in the same activity area as Quick Study, visually distinct from it", () => {
    const { container } = renderHub();
    const quick = container.querySelector('[data-testid="hub-quick-study"]')!;
    const more = container.querySelector('[data-testid="hub-more-challenges"]')!;
    expect(quick.getAttribute("data-activity-area")).toBe("study");
    expect(more.getAttribute("data-activity-area")).toBe("play");
    expect(within(quick as HTMLElement).getByRole("heading", { name: /Quick Study/ })).toBeTruthy();
  });
});
