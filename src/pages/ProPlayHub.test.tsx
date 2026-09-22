/**
 * Pro Play hub — the landing page the academy hub's Pro Play book opens.
 * This pins that the area identifies itself, offers every module it has built,
 * and can get back to the academy.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProPlayHub, {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "./ProPlayHub";

const { sfx } = vi.hoisted(() => ({ sfx: { play: vi.fn() } }));

vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/components/pro-play/ProStatsExplorer", () => ({
  default: () => <div data-testid="pro-stats-explorer" />,
}));

beforeEach(() => sfx.play.mockReset());

afterEach(cleanup);

const renderHub = () =>
  render(
    <MemoryRouter initialEntries={[PRO_PLAY_ROUTE]}>
      <ProPlayHub />
    </MemoryRouter>,
  );

describe("ProPlayHub", () => {
  it("sounds one analytical handoff for Matchup Explorer", () => {
    renderHub();
    fireEvent.click(screen.getByRole("link", { name: /Matchup Explorer/i }));
    expect(sfx.play).toHaveBeenCalledOnce();
    expect(sfx.play).toHaveBeenCalledWith("pro-play.analysis.open");
  });

  it("keeps ordinary Pro Play navigation silent", () => {
    renderHub();
    fireEvent.click(screen.getByRole("link", { name: /Live & Recent Matches/i }));
    expect(sfx.play).not.toHaveBeenCalled();
  });

  it("identifies the area as Pro Play", () => {
    renderHub();
    expect(screen.getByRole("heading", { level: 1, name: "Pro Play" })).toBeTruthy();
  });

  it("offers the Pro Play Quiz, pointing at the quiz route", () => {
    renderHub();
    const link = screen.getByRole("link", { name: /Pro Play Quiz/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_QUIZ_ROUTE);
  });

  it("offers Explore Pro Data, pointing at the graphs route", () => {
    renderHub();
    const link = screen.getByRole("link", { name: /Explore Pro Data/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_GRAPHS_ROUTE);
  });

  it("offers Live & Recent Matches, pointing at the match-centre route", () => {
    // The LIVE1 match centre existed at /esports/live for months, linked from
    // nowhere. This tile is the entire reason anyone will find it.
    renderHub();
    const link = screen.getByRole("link", { name: /Live & Recent Matches/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_LIVE_ROUTE);
  });

  it("does not promise that a game is always live", () => {
    // The poller runs continuously but most of the day nothing is playing.
    // The tile must read as "live when there is live", not as a guarantee.
    renderHub();
    const tile = screen.getByRole("link", { name: /Live & Recent Matches/i });
    expect(tile.textContent).toMatch(/just finished/i);
  });

  it("keeps the quiz intact alongside the new module", () => {
    // Adding a capability must never cost the one that was already here.
    renderHub();
    expect(screen.getByRole("link", { name: /Pro Play Quiz/i })).toBeTruthy();
  });

  it("keeps a way back to the academy hub", () => {
    renderHub();
    expect(
      screen.getByRole("link", { name: /Back to the Academy/i }).getAttribute("href"),
    ).toBe("/lol");
  });

  it("does not advertise modules that are not built yet", () => {
    renderHub();
    // Every tile is a module that exists. Live matches earned its tile by
    // being built and served; a "coming soon" tile for trends / records
    // would still be a promise the hub cannot keep.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    const modules = screen.getAllByRole("link").filter((a) =>
      a.getAttribute("href")?.startsWith(PRO_PLAY_ROUTE + "/"),
    );
    expect(modules.map((a) => a.getAttribute("href")).sort()).toEqual(
      [
        PRO_PLAY_GRAPHS_ROUTE,
        PRO_PLAY_LIVE_ROUTE,
        PRO_PLAY_MATCHUP_ROUTE,
        PRO_PLAY_QUIZ_ROUTE,
      ].sort(),
    );
  });

  it("offers Matchup Explorer, pointing at the matchup route", () => {
    renderHub();
    const link = screen.getByRole("link", { name: /Matchup Explorer/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_MATCHUP_ROUTE);
  });

  it("has no separate Search tile — the explorer's universal search replaces it", () => {
    // PSE-UNIFY: the Stats Explorer on this page opens with one search over
    // players, teams, champions, leagues and events. A second search entrance
    // asked the same question twice. The ROUTE is kept (profile breadcrumbs,
    // shared ?q= links, the explorer search's "All results") — only the tile
    // is gone.
    renderHub();
    expect(screen.queryByRole("link", { name: /Search Pro Play/i })).toBeNull();
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === PRO_PLAY_SEARCH_ROUTE),
    ).toBe(false);
    expect(PRO_PLAY_SEARCH_ROUTE).toBe("/lol/pro-play/search");
    expect(screen.getByTestId("pro-stats-explorer")).toBeTruthy();
  });

  it("puts the research surfaces above the quiz, and Matchup Explorer first", () => {
    // The order is the product hierarchy: what is happening now, then the
    // deep pre-match surface, then the graphs, then the game. (Search now
    // lives in the Stats Explorer below the tiles.)
    // Matchup Explorer must never sit below the exploratory graphs again.
    renderHub();
    const order = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith(PRO_PLAY_ROUTE + "/"));
    expect(order).toEqual([
      PRO_PLAY_LIVE_ROUTE,
      PRO_PLAY_MATCHUP_ROUTE,
      PRO_PLAY_GRAPHS_ROUTE,
      PRO_PLAY_QUIZ_ROUTE,
    ]);
  });

  it("says what the Matchup Explorer is for, not merely that it exists", () => {
    // A card titled "Matchup Explorer" alone does not distinguish it from the
    // graphs page; the description is what separates "investigate this
    // matchup" from "explore the data".
    renderHub();
    const tile = screen.getByRole("link", { name: /Matchup Explorer/i });
    expect(tile.textContent).toMatch(/lanes/i);
    expect(tile.textContent).toMatch(/champion pools/i);
  });

  it("is not the subscription page", () => {
    // /lol/premium is the paid-plan upsell; this area must never link there or
    // borrow its language.
    renderHub();
    expect(screen.queryByText(/subscribe|upgrade|per month/i)).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/lol/premium");
      expect(link.getAttribute("href")).not.toBe("/lol/pro");
    }
  });
});
