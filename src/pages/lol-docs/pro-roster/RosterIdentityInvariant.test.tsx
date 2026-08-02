/**
 * THE identity invariant, end to end.
 *
 *   M1nG  — an alias of the canonical Thai player "Flure". Not a page itself.
 *   M1ng  — a SEPARATE canonical player from Taiwan, with his own page.
 *
 * These two must never be merged, case-folded together, linked to the same
 * profile, or made indistinguishable. This file covers all three surfaces the
 * confusion could happen on: the API request layer, routing, and rendering.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import ProRosterPlayerProfile from "./ProRosterPlayerProfile";
import ProRosterLanding from "./ProRosterLanding";
import {
  installFetch,
  renderRoute,
  requestLog,
} from "./roster-test-utils";
import {
  coverageFixture,
  flureFixture,
  m1ngFixture,
  m1ngSearchFixture,
} from "@/lib/league-docs/roster-fixtures";

const PLAYER_ROUTE = "/lol/docs/pro/players/:lpPage";

/**
 * Case-sensitive endpoint routing that mirrors production exactly:
 * /players/Flure and /players/M1ng resolve; /players/M1nG is a 404 because
 * the alias has no page of its own.
 */
function installIdentityBackend() {
  installFetch([
    [(u) => u.includes("/roster/players/Flure"), { body: flureFixture }],
    [(u) => u.includes("/roster/players/M1ng?"), { body: m1ngFixture }],
    [
      (u) => u.includes("/roster/players/M1nG?"),
      { status: 404, body: { detail: "Player not found." } },
    ],
    [(u) => u.includes("/roster/search"), { body: m1ngSearchFixture }],
    [(u) => u.includes("/roster/coverage"), { body: coverageFixture }],
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("routing keeps M1nG and M1ng apart", () => {
  it("requests the exact identifier M1ng, never a case-folded variant", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/M1ng",
    });

    await screen.findByRole("heading", { name: "M1ng" });
    const playerRequests = requestLog.filter((u) => u.includes("/roster/players/"));
    expect(playerRequests).toHaveLength(1);
    expect(playerRequests[0]).toContain("/roster/players/M1ng?");
    expect(playerRequests[0]).not.toContain("/roster/players/M1nG");
    expect(playerRequests[0]).not.toContain("/roster/players/m1ng");
  });

  it("requests the exact identifier M1nG and honours its 404", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/M1nG",
    });

    expect(await screen.findByText(/No player page named/)).toBeInTheDocument();
    const playerRequests = requestLog.filter((u) => u.includes("/roster/players/"));
    expect(playerRequests[0]).toContain("/roster/players/M1nG?");
  });

  it("does not silently redirect the M1nG alias onto Flure or onto M1ng", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/M1nG",
    });

    await screen.findByText(/No player page named/);
    // The 404 offers Flure as a labelled suggestion, but never as the page itself.
    expect(screen.queryByRole("heading", { name: "Flure" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "M1ng" })).toBeNull();
    expect(requestLog.some((u) => u.includes("/roster/players/Flure"))).toBe(false);
  });
});

describe("profile rendering keeps the two identities distinct", () => {
  it("renders M1ng as a Taiwanese player with no Flure aliases", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/M1ng",
    });

    await screen.findByRole("heading", { name: "M1ng" });
    expect(screen.getByText("Taiwan")).toBeInTheDocument();
    expect(screen.queryByText("Thailand")).toBeNull();
    expect(screen.queryByText("Also known as")).toBeNull();
    expect(screen.queryByText(/Bangkok Titans/)).toBeNull();
  });

  it("renders Flure as a Thai player whose aliases include M1nG but not M1ng", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/Flure",
    });

    await screen.findByRole("heading", { name: "Flure" });
    expect(screen.getByText("Thailand")).toBeInTheDocument();

    const aliases = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(aliases).toContain("M1nG");
    // The separate Taiwanese player's page id must not appear as an alias.
    expect(aliases).not.toContain("M1ng");
  });

  it("offers Flure only as an explicitly labelled alias suggestion on the M1nG 404", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterPlayerProfile />,
      routePath: PLAYER_ROUTE,
      initialPath: "/lol/docs/pro/players/M1nG",
    });

    await screen.findByText(/No player page named/);
    const suggestion = await screen.findByRole("link", { name: /Flure/ });
    expect(suggestion).toHaveAttribute("href", "/lol/docs/pro/players/Flure");
    expect(suggestion).toHaveTextContent(/matched via alias/i);
    expect(suggestion).toHaveTextContent("M1nG");
    // …and it does NOT point at the unrelated M1ng page.
    expect(suggestion).not.toHaveAttribute("href", "/lol/docs/pro/players/M1ng");
  });
});

describe("search resolves the alias to its canonical page only", () => {
  it("lists the M1nG alias hit and the canonical M1ng as two separate links", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterLanding />,
      routePath: "/lol/docs/pro/rosters",
      initialPath: "/lol/docs/pro/rosters",
    });

    const input = screen.getByLabelText("Search pro players and teams");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "M1nG" } });

    const playersGroup = await screen.findByRole("region", { name: "Players" });

    // The alias hit resolves to its owner, and says which alias matched.
    const flure = await within(playersGroup).findByRole("link", { name: /Flure/ });
    expect(flure).toHaveAttribute("href", "/lol/docs/pro/players/Flure");
    expect(flure).toHaveTextContent("M1nG");

    // The unrelated canonical player is offered in its own right — its own row,
    // its own page, credited to no alias. Its PRESENCE is the point here:
    // omitting it is exactly what let Flure stand in for it in production.
    const m1ng = await within(playersGroup).findByRole("link", { name: /^M1ng/ });
    expect(m1ng).toHaveAttribute("href", "/lol/docs/pro/players/M1ng");
    expect(m1ng).not.toHaveTextContent(/matched via alias/i);

    // Two rows, two destinations — never collapsed into one.
    expect(flure.getAttribute("href")).not.toBe(m1ng.getAttribute("href"));
  });

  it("sends the search term with its original casing", async () => {
    installIdentityBackend();
    renderRoute({
      element: <ProRosterLanding />,
      routePath: "/lol/docs/pro/rosters",
      initialPath: "/lol/docs/pro/rosters",
    });

    const input = screen.getByLabelText("Search pro players and teams");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "M1nG" } });

    await waitFor(() => {
      expect(requestLog.some((u) => u.includes("q=M1nG"))).toBe(true);
    });
    expect(requestLog.some((u) => u.includes("q=m1ng"))).toBe(false);
  });
});

describe("React Query caches the three spellings separately", () => {
  it("keeps M1ng, M1nG and m1ng in separate cache entries", async () => {
    installIdentityBackend();
    // One cache shared across all three renders — if the query keys folded
    // case, the later renders would read the first one's data instead of
    // fetching, and M1nG would silently render as the Taiwanese player.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const at = (initialPath: string) =>
      renderRoute({ element: <ProRosterPlayerProfile />, routePath: PLAYER_ROUTE, initialPath, client });

    at("/lol/docs/pro/players/M1ng");
    await screen.findByRole("heading", { name: "M1ng" });

    at("/lol/docs/pro/players/M1nG");
    await screen.findAllByText(/No player page named/);

    at("/lol/docs/pro/players/m1ng");
    await waitFor(() => {
      expect(requestLog.some((u) => u.includes("/roster/players/m1ng?"))).toBe(true);
    });

    // Three identifiers, three distinct keys, exact casing preserved in each.
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .filter((k) => k[0] === "pro-roster" && k[1] === "player");
    expect(keys).toContainEqual(["pro-roster", "player", "M1ng", "A"]);
    expect(keys).toContainEqual(["pro-roster", "player", "M1nG", "A"]);
    expect(keys).toContainEqual(["pro-roster", "player", "m1ng", "A"]);

    // …and each one actually went to the network rather than reusing a sibling.
    for (const id of ["M1ng", "M1nG", "m1ng"]) {
      expect(requestLog.filter((u) => u.includes(`/roster/players/${id}?`))).toHaveLength(1);
    }
  });
});
