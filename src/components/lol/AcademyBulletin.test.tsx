/**
 * The Academy Bulletin — the Commons' large parchment noticeboard.
 *
 * V1 is one static notice, and these assertions are about what that notice is
 * allowed to claim: a real destination, no invented statistic, and no overlap
 * with the surfaces that already own product news and patch content.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import AcademyBulletin from "./AcademyBulletin";

function renderBulletin() {
  return render(
    <MemoryRouter>
      <AcademyBulletin />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("AcademyBulletin", () => {
  it("renders one pinned notice with a heading, a body and one action", () => {
    const { container } = renderBulletin();
    const board = screen.getByTestId("academy-bulletin");
    expect(board).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The numbers behind the game" })).toBeTruthy();
    // Exactly one action: a board with two CTAs is a card grid, not a notice.
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("deep-links to a route that exists, and not to the Record's own", () => {
    renderBulletin();
    const link = screen.getByTestId("academy-bulletin-cta");
    expect(link.getAttribute("href")).toBe("/lol/mechanics");
    // The Academy Record's primary action already goes to /quiz; the board
    // must not simply repeat the panel beside it.
    expect(link.getAttribute("href")).not.toBe("/quiz");
  });

  it("claims no live statistic it cannot prove", () => {
    const { container } = renderBulletin();
    const text = container.textContent ?? "";
    // No score, no record, no "live now" — V1 has no feed behind it.
    expect(text).not.toMatch(/\d+\s*-\s*\d+/);
    expect(text).not.toMatch(/live now|right now, /i);
    expect(text).not.toMatch(/\b\d+%/);
  });

  it("does not duplicate Screen 1's product news or Patch Brief", () => {
    const { container } = renderBulletin();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/what'?s new/i);
    expect(text).not.toMatch(/patch \d|patch report|patch brief/i);
  });

  it("is still structurally the noticeboard, so the painted mount finds it", () => {
    const { container } = renderBulletin();
    // index.css positions the Bulletin through `.academy-commons-board` and
    // sizes its type through the `-bill-*` hooks. Losing one drops the notice
    // into the corner of the room.
    expect(container.querySelector(".academy-commons-board")).not.toBeNull();
    expect(container.querySelector(".academy-commons-bill")).not.toBeNull();
    expect(container.querySelector(".academy-commons-bill-title")).not.toBeNull();
    expect(container.querySelector(".academy-commons-bill-cta")).not.toBeNull();
  });
});
