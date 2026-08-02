/**
 * Player and team directory rendering: rows, links, pagination, search
 * plumbing, and every load state (loading / empty / 422 / 500 / 503).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import ProRosterPlayers from "./ProRosterPlayers";
import ProRosterTeams from "./ProRosterTeams";
import {
  installFetch,
  installPendingFetch,
  neverRequestedLevelC,
  renderRoute,
  requestLog,
} from "./roster-test-utils";
import { playersFixture, teamsFixture } from "@/lib/league-docs/roster-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const renderPlayers = (path = "/lol/docs/pro/players") =>
  renderRoute({
    element: <ProRosterPlayers />,
    routePath: "/lol/docs/pro/players",
    initialPath: path,
  });

const renderTeams = (path = "/lol/docs/pro/teams") =>
  renderRoute({
    element: <ProRosterTeams />,
    routePath: "/lol/docs/pro/teams",
    initialPath: path,
  });

describe("player directory", () => {
  it("renders each player with country, role and membership count", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    renderPlayers();

    expect(await screen.findByRole("link", { name: /^Flure$/ })).toHaveAttribute(
      "href",
      "/lol/docs/pro/players/Flure",
    );
    expect(screen.getAllByText("Thailand").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jungle").length).toBeGreaterThan(0);
    // 18,287 total is reported by the pager, not invented.
    expect(screen.getByText(/18,287 players/)).toBeInTheDocument();
  });

  it("encodes unusual page identifiers in the profile link", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    renderPlayers();

    // Both the desktop table and the mobile list are in the DOM; the link must
    // be identically encoded in each.
    const links = await screen.findAllByRole("link", { name: /0ri \(Adam Matěj\)/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/lol/docs/pro/players/0ri%20(Adam%20Mat%C4%9Bj)");
    }
  });

  it("shows a skeleton while the first page is in flight", () => {
    installPendingFetch();
    renderPlayers();
    expect(screen.getByLabelText("Loading players")).toBeInTheDocument();
  });

  it("shows an empty state naming the term when a search matches nothing", async () => {
    installFetch([
      [
        (u) => u.includes("/roster/players"),
        { body: { players: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 0 } } },
      ],
    ]);
    renderPlayers("/lol/docs/pro/players?q=zzzznope");

    expect(await screen.findByText(/No players match “zzzznope”/)).toBeInTheDocument();
  });

  it("passes the typed term to the backend as a server-side query", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    renderPlayers();
    await screen.findByRole("link", { name: /^Flure$/ });

    fireEvent.change(screen.getByLabelText("Search pro players"), {
      target: { value: "Fla" },
    });
    await waitFor(() => expect(requestLog.some((u) => u.includes("query=Fla"))).toBe(true));
  });

  it("advances a page through the API's page parameter", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    renderPlayers();
    await screen.findByRole("link", { name: /^Flure$/ });

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(requestLog.some((u) => u.includes("page=2"))).toBe(true));
  });

  it("never asks for Level C data", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    renderPlayers();
    await screen.findByRole("link", { name: /^Flure$/ });
    expect(neverRequestedLevelC()).toBe(true);
  });
});

describe("team directory", () => {
  it("renders each team with region and membership count", async () => {
    installFetch([[(u) => u.includes("/roster/teams"), { body: teamsFixture }]]);
    renderTeams();

    const links = await screen.findAllByRole("link", { name: /100 Thieves/ });
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/lol/docs/pro/teams/100%20Thieves");
    }
    expect(screen.getAllByText("Korea").length).toBeGreaterThan(0);
    expect(screen.getByText(/3,460 teams/)).toBeInTheDocument();
  });

  it("shows the canonical page id when it differs from the display name", async () => {
    installFetch([[(u) => u.includes("/roster/teams"), { body: teamsFixture }]]);
    renderTeams();

    // Display "300", canonical page "300 (North American Team)".
    const links = await screen.findAllByRole("link", { name: /^300$/ });
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/lol/docs/pro/teams/300%20(North%20American%20Team)");
    }
    expect(screen.getAllByText("300 (North American Team)").length).toBeGreaterThan(0);
  });

  it("shows a skeleton while loading", () => {
    installPendingFetch();
    renderTeams();
    expect(screen.getByLabelText("Loading teams")).toBeInTheDocument();
  });
});

/**
 * The directories ship two presentations of the same rows: a table for desktop
 * (`hidden md:block`) and cards for narrow screens (`md:hidden`). jsdom applies
 * no CSS, so both are in the tree — which is what lets us assert the mobile
 * layout exists at all and is not an empty stub.
 */
describe("responsive presentation", () => {
  it("renders a desktop table and a mobile card list for players", async () => {
    installFetch([[(u) => u.includes("/roster/players"), { body: playersFixture }]]);
    const { container } = renderPlayers();
    await screen.findAllByRole("link", { name: /^Flure$/ });

    const desktop = container.querySelector(".hidden.md\\:block table");
    expect(desktop).not.toBeNull();
    expect(within(desktop as HTMLElement).getAllByRole("row")).toHaveLength(
      playersFixture.players.length + 1, // + header row
    );

    const mobile = container.querySelector("ul.md\\:hidden");
    expect(mobile).not.toBeNull();
    expect(within(mobile as HTMLElement).getAllByRole("listitem")).toHaveLength(
      playersFixture.players.length,
    );
  });

  it("renders a desktop table and a mobile card list for teams", async () => {
    installFetch([[(u) => u.includes("/roster/teams"), { body: teamsFixture }]]);
    const { container } = renderTeams();
    await screen.findAllByRole("link", { name: /^T1$/ });

    expect(container.querySelector(".hidden.md\\:block table")).not.toBeNull();
    const mobile = container.querySelector("ul.md\\:hidden");
    expect(within(mobile as HTMLElement).getAllByRole("listitem")).toHaveLength(
      teamsFixture.teams.length,
    );
  });
});

describe("directory failure states", () => {
  const cases: Array<[number, RegExp]> = [
    [422, /Couldn't load the player directory/],
    [500, /Couldn't load the player directory/],
    [503, /Roster data is temporarily unavailable/],
  ];

  it.each(cases)("renders a distinct state for HTTP %i", async (status, matcher) => {
    installFetch([
      [(u) => u.includes("/roster/players"), { status, body: { detail: "boom" } }],
    ]);
    renderPlayers();

    // 5xx gets one automatic retry first, so allow for the backoff.
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(within(alert).getByText(matcher)).toBeInTheDocument();
    expect(within(alert).getByText(`HTTP ${status}`)).toBeInTheDocument();
  });

  it("offers a retry that re-requests the directory", async () => {
    installFetch([[(u) => u.includes("/roster/teams"), { status: 503, body: {} }]]);
    renderTeams();

    await screen.findByRole("alert", {}, { timeout: 5000 });
    const before = requestLog.length;
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(requestLog.length).toBeGreaterThan(before));
  });
});
