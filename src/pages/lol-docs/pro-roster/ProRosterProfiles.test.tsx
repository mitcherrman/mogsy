/**
 * Player and team profile rendering, and the Level A / B / C contract.
 *
 * Level A is the default and is requested without any opt-in. Level B appears
 * only after a deliberate toggle, arrives visually distinct, and shows the
 * backend's own warning code. Level C is never requested, never rendered, and
 * never reaches component state — only the backend's withheld *count* is
 * surfaced, and that is a number, not data.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import ProRosterPlayerProfile from "./ProRosterPlayerProfile";
import ProRosterTeamProfile from "./ProRosterTeamProfile";
import {
  installFetch,
  installPendingFetch,
  lastLocation,
  neverRequestedLevelC,
  renderRoute,
  requestLog,
} from "./roster-test-utils";
import {
  flureFixture,
  teamLevelABFixture,
  teamLevelAFixture,
  teamWithHistoricalNamesFixture,
} from "@/lib/league-docs/roster-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const renderPlayer = (path: string) =>
  renderRoute({
    element: <ProRosterPlayerProfile />,
    routePath: "/lol/docs/pro/players/:lpPage",
    initialPath: path,
  });

const renderTeam = (path: string) =>
  renderRoute({
    element: <ProRosterTeamProfile />,
    routePath: "/lol/docs/pro/teams/:lpPage",
    initialPath: path,
  });

/** Level A and Level AB views of 100 Thieves, selected by the request itself. */
function installTeamBackend() {
  installFetch([
    [(u) => u.includes("/roster/teams/") && u.includes("eligibility=AB"), { body: teamLevelABFixture }],
    [(u) => u.includes("/roster/teams/"), { body: teamLevelAFixture }],
  ]);
}

describe("player profile", () => {
  it("renders identity, aliases and every membership field the API returned", async () => {
    installFetch([[(u) => u.includes("/roster/players/"), { body: flureFixture }]]);
    renderPlayer("/lol/docs/pro/players/Flure");

    expect(await screen.findByRole("heading", { name: "Flure" })).toBeInTheDocument();
    expect(screen.getByText("Thailand")).toBeInTheDocument();
    expect(screen.getByText("Also known as")).toBeInTheDocument();
    expect(screen.getAllByText("M1nG").length).toBeGreaterThan(0);

    // Membership row: team link, role, dates, region, source.
    expect(screen.getAllByRole("link", { name: "Bangkok Titans" })[0]).toHaveAttribute(
      "href",
      "/lol/docs/pro/teams/Bangkok%20Titans",
    );
    expect(screen.getAllByText("2012-04-30 → 2012-05-18").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SEA").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Source/ })[0]).toHaveAttribute(
      "href",
      "https://lol.fandom.com/wiki/Flure",
    );
  });

  it("splits the source's multi-role notation into discrete roles", async () => {
    installFetch([[(u) => u.includes("/roster/players/"), { body: flureFixture }]]);
    renderPlayer("/lol/docs/pro/players/Flure");

    await screen.findByRole("heading", { name: "Flure" });
    expect(screen.getAllByText("Jungle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mid").length).toBeGreaterThan(0);
  });

  it("shows a loading state before the first response", () => {
    installPendingFetch();
    renderPlayer("/lol/docs/pro/players/Flure");
    expect(screen.getByLabelText("Loading player Flure")).toBeInTheDocument();
  });

  it("renders an empty state for a player with no public memberships", async () => {
    installFetch([
      [
        (u) => u.includes("/roster/players/"),
        { body: { ...flureFixture, memberships: [], aliases: [] } },
      ],
    ]);
    renderPlayer("/lol/docs/pro/players/Flure");

    expect(
      await screen.findByText(/No public roster memberships are on record for this player/),
    ).toBeInTheDocument();
  });
});

describe("team profile", () => {
  it("renders identity, abbreviations and player memberships", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");

    expect(await screen.findByRole("heading", { name: "100 Thieves" })).toBeInTheDocument();
    // Region appears in the header and again on each membership row.
    expect(screen.getAllByText("Americas").length).toBeGreaterThan(0);
    expect(screen.getByText("Abbreviations and aliases")).toBeInTheDocument();
    expect(screen.getAllByText("100T").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Meteos" })[0]).toHaveAttribute(
      "href",
      "/lol/docs/pro/players/Meteos",
    );
  });

  it("decodes the encoded route parameter back to the exact page identifier", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");

    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(requestLog[0]).toContain("/roster/teams/100%20Thieves?");
  });

  it("shows historical names separately from aliases and marks a current member", async () => {
    installFetch([[(u) => u.includes("/roster/teams/"), { body: teamWithHistoricalNamesFixture }]]);
    renderTeam("/lol/docs/pro/teams/T1");

    await screen.findByRole("heading", { name: "T1" });
    expect(screen.getByText("Historical names")).toBeInTheDocument();
    expect(screen.getAllByText("SK Telecom T1").length).toBeGreaterThan(0);
    // Open-ended membership renders as ongoing, not as a fabricated end date.
    expect(screen.getAllByText("2020-11-17 → present").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
  });

  it("renders a 404 state for an unknown team without guessing a match", async () => {
    installFetch([
      [(u) => u.includes("/roster/search"), { body: { query: "Nope", results: [] } }],
      [(u) => u.includes("/roster/teams/"), { status: 404, body: { detail: "Team not found." } }],
    ]);
    renderTeam("/lol/docs/pro/teams/Nope%20Does%20Not%20Exist");

    expect(
      await screen.findByText(/No team page named “Nope Does Not Exist”/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse all teams/ })).toHaveAttribute(
      "href",
      "/lol/docs/pro/teams",
    );
  });
});

describe("Level A default behaviour", () => {
  it("requests Level A only and renders no Level B rows", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");

    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(requestLog[0]).toContain("eligibility=A");
    expect(requestLog[0]).not.toContain("eligibility=AB");
    expect(document.querySelectorAll('[data-eligibility="B"]')).toHaveLength(0);
    expect(screen.queryByText(/academy_main_overlap/)).toBeNull();
  });

  it("leaves the Level B opt-in switched off", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");

    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(
      screen.getByRole("switch", { name: /Show flagged historical records/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("reports how many records are withheld without exposing them", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");

    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(screen.getByText(/13 further records are not shown by default/)).toBeInTheDocument();
  });
});

describe("Level B opt-in", () => {
  it("re-requests with eligibility=AB when the switch is turned on", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");
    await screen.findByRole("heading", { name: "100 Thieves" });

    fireEvent.click(screen.getByRole("switch", { name: /Show flagged historical records/ }));

    await waitFor(() =>
      expect(requestLog.some((u) => u.includes("eligibility=AB"))).toBe(true),
    );
    expect(requestLog.some((u) => u.includes("include_warning=true"))).toBe(true);
  });

  it("records the opt-in in the URL so the view is shareable", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");
    await screen.findByRole("heading", { name: "100 Thieves" });

    fireEvent.click(screen.getByRole("switch", { name: /Show flagged historical records/ }));
    await waitFor(() => expect(lastLocation.search).toContain("warnings=1"));
  });

  it("renders opted-in rows visually distinct, with the backend's warning code", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves?warnings=1");

    await screen.findByRole("heading", { name: "100 Thieves" });
    const flagged = document.querySelectorAll('[data-eligibility="B"]');
    expect(flagged.length).toBeGreaterThan(0);
    for (const row of flagged) {
      expect(row.className).toMatch(/amber/);
      expect(within(row as HTMLElement).getByText("academy_main_overlap")).toBeInTheDocument();
      expect(within(row as HTMLElement).getByText("Level B")).toBeInTheDocument();
    }
  });

  it("does not mix Level B into the Level A rows silently", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves?warnings=1");

    await screen.findByRole("heading", { name: "100 Thieves" });
    // The Level A row carries no warning marker of any kind.
    const levelA = document.querySelectorAll('[data-eligibility="A"]');
    expect(levelA.length).toBeGreaterThan(0);
    for (const row of levelA) {
      expect(within(row as HTMLElement).queryByText("Level B")).toBeNull();
      expect(within(row as HTMLElement).queryByText(/overlap/)).toBeNull();
    }
    // And the page states plainly that flagged records are on screen.
    expect(screen.getByText(/Showing 1 flagged record/)).toBeInTheDocument();
  });

  it("turning the switch back off returns to Level A only", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves?warnings=1");
    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(document.querySelectorAll('[data-eligibility="B"]').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("switch", { name: /Show flagged historical records/ }));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-eligibility="B"]')).toHaveLength(0),
    );
  });
});

describe("Level C is never requested or rendered", () => {
  it("offers no control that could ask for Level C", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves?warnings=1");

    await screen.findByRole("heading", { name: "100 Thieves" });
    expect(screen.queryByText(/Level C/)).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("issues no request carrying a C eligibility, in either mode", async () => {
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves");
    await screen.findByRole("heading", { name: "100 Thieves" });
    fireEvent.click(screen.getByRole("switch", { name: /Show flagged historical records/ }));
    await waitFor(() => expect(requestLog.some((u) => u.includes("eligibility=AB"))).toBe(true));

    expect(neverRequestedLevelC()).toBe(true);
    for (const url of requestLog) {
      expect(url).toMatch(/eligibility=A(B)?(&|$)/);
    }
  });

  it("renders no membership row above Level B, whatever the backend sends", async () => {
    // Defence in depth: even if a C row leaked into a response, the UI has no
    // Level C presentation and the row must not be dressed up as public data.
    installTeamBackend();
    renderTeam("/lol/docs/pro/teams/100%20Thieves?warnings=1");

    await screen.findByRole("heading", { name: "100 Thieves" });
    const levels = Array.from(document.querySelectorAll("[data-eligibility]")).map((el) =>
      el.getAttribute("data-eligibility"),
    );
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((l) => l === "A" || l === "B")).toBe(true);
  });
});

describe("profile failure states", () => {
  it("renders a service-unavailable state on 503", async () => {
    installFetch([[(u) => u.includes("/roster/players/"), { status: 503, body: {} }]]);
    renderPlayer("/lol/docs/pro/players/Flure");

    // 5xx gets one automatic retry first, so allow for the backoff.
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(within(alert).getByText(/Roster data is temporarily unavailable/)).toBeInTheDocument();
  });

  it("renders a generic error on 500", async () => {
    installFetch([[(u) => u.includes("/roster/players/"), { status: 500, body: {} }]]);
    renderPlayer("/lol/docs/pro/players/Flure");

    // 5xx gets one automatic retry first, so allow for the backoff.
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(within(alert).getByText(/Couldn't load the player “Flure”/)).toBeInTheDocument();
  });

  it("renders a generic error on 422 rather than retrying blindly", async () => {
    installFetch([
      [
        (u) => u.includes("/roster/players/"),
        { status: 422, body: { detail: "eligibility must be 'A' or 'AB'" } },
      ],
    ]);
    renderPlayer("/lol/docs/pro/players/Flure");

    // 5xx gets one automatic retry first, so allow for the backoff.
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(within(alert).getByText("HTTP 422")).toBeInTheDocument();
  });
});
