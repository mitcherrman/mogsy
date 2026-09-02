/**
 * Pro Play hub — the landing page the academy hub's Pro Play book opens.
 * V1 is one card; this pins that the area identifies itself, offers the quiz,
 * and can get back to the academy.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import ProPlayHub, { PRO_PLAY_QUIZ_ROUTE, PRO_PLAY_ROUTE } from "./ProPlayHub";

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

  it("keeps a way back to the academy hub", () => {
    renderHub();
    expect(
      screen.getByRole("link", { name: /Back to the Academy/i }).getAttribute("href"),
    ).toBe("/lol");
  });

  it("does not advertise modules that are not built yet", () => {
    renderHub();
    // One card in v1. A "coming soon" tile for live matches / trends / records
    // would be a promise the hub cannot keep.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.getAllByRole("link").filter((a) =>
      a.getAttribute("href")?.startsWith(PRO_PLAY_ROUTE + "/"),
    )).toHaveLength(1);
  });

  it("is not the subscription page", () => {
    // /lol/pro is the paid-plan upsell; this area must never link there or
    // borrow its language.
    renderHub();
    expect(screen.queryByText(/subscribe|upgrade|per month/i)).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/lol/pro");
    }
  });
});
