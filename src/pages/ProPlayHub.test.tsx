/**
 * Pro Play hub — the landing page the academy hub's Pro Play book opens.
 * This pins that the area identifies itself, offers every module it has built,
 * and can get back to the academy.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import ProPlayHub, {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "./ProPlayHub";

afterEach(cleanup);

const renderHub = () =>
  render(
    <MemoryRouter initialEntries={[PRO_PLAY_ROUTE]}>
      <ProPlayHub />
    </MemoryRouter>,
  );

describe("ProPlayHub", () => {
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
        PRO_PLAY_SEARCH_ROUTE,
      ].sort(),
    );
  });

  it("offers Matchup Explorer, pointing at the matchup route", () => {
    renderHub();
    const link = screen.getByRole("link", { name: /Matchup Explorer/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_MATCHUP_ROUTE);
  });

  it("offers Search Pro Play, pointing at the search route", () => {
    renderHub();
    const link = screen.getByRole("link", { name: /Search Pro Play/i });
    expect(link.getAttribute("href")).toBe(PRO_PLAY_SEARCH_ROUTE);
  });

  it("puts the research surfaces above the quiz, and Matchup Explorer first", () => {
    // The order is the product hierarchy: what is happening now, then the
    // deep pre-match surface, then the two ways to browse, then the game.
    // Matchup Explorer must never sit below the exploratory graphs again.
    renderHub();
    const order = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith(PRO_PLAY_ROUTE + "/"));
    expect(order).toEqual([
      PRO_PLAY_LIVE_ROUTE,
      PRO_PLAY_MATCHUP_ROUTE,
      PRO_PLAY_SEARCH_ROUTE,
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
