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
  it("links an M1nG alias hit to /players/Flure, never to /players/M1ng", async () => {
    installIdentityBackend();
    const { container } = renderRoute({
      element: <ProRosterLanding />,
      routePath: "/lol/docs/pro/rosters",
      initialPath: "/lol/docs/pro/rosters",
    });

    const input = screen.getByLabelText("Search pro players and teams");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "M1nG" } });

    const playersGroup = await screen.findByRole("region", { name: "Players" });
    const link = await within(playersGroup).findByRole("link", { name: /Flure/ });
    expect(link).toHaveAttribute("href", "/lol/docs/pro/players/Flure");
    expect(link).toHaveTextContent("M1nG");

    // No link anywhere in the result set points at the other player's page.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/lol/docs/pro/players/M1ng");
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
