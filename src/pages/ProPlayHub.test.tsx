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
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
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
    // Every tile is a module that exists. A "coming soon" tile for live
    // matches / trends / records would be a promise the hub cannot keep.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    const modules = screen.getAllByRole("link").filter((a) =>
      a.getAttribute("href")?.startsWith(PRO_PLAY_ROUTE + "/"),
    );
    expect(modules.map((a) => a.getAttribute("href")).sort()).toEqual(
      [PRO_PLAY_GRAPHS_ROUTE, PRO_PLAY_QUIZ_ROUTE].sort(),
    );
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
