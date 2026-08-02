/**
 * Roster landing page: coverage summary, entry points, honesty about what is
 * not yet loaded, SEO metadata, and the search surface's behaviour
 * (separation, debouncing, staleness, keyboard access).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import ProRosterLanding from "./ProRosterLanding";
import {
  installFetch,
  installPendingFetch,
  neverRequestedLevelC,
  renderRoute,
  requestLog,
} from "./roster-test-utils";
import {
  coverageFixture,
  mixedSearchFixture,
} from "@/lib/league-docs/roster-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.head.querySelectorAll("meta, link[rel=canonical]").forEach((n) => n.remove());
});

const renderLanding = () =>
  renderRoute({
    element: <ProRosterLanding />,
    routePath: "/lol/docs/pro/rosters",
    initialPath: "/lol/docs/pro/rosters",
  });

function installLandingBackend() {
  installFetch([
    [(u) => u.includes("/roster/coverage"), { body: coverageFixture }],
    [(u) => u.includes("/roster/search"), { body: mixedSearchFixture }],
  ]);
}

describe("roster landing", () => {
  it("summarises coverage from the production endpoint", async () => {
    installLandingBackend();
    renderLanding();

    expect(await screen.findByText("20,624")).toBeInTheDocument(); // players
    expect(screen.getByText("3,523")).toBeInTheDocument(); // teams
    // 71,170 is both the "public memberships" card and the Level A figure.
    expect(screen.getAllByText("71,170").length).toBeGreaterThan(0);
    expect(screen.getByText("2010–2026")).toBeInTheDocument(); // source year span
  });

  it("renders the backend's disclosure text verbatim rather than paraphrasing it", async () => {
    installLandingBackend();
    renderLanding();

    expect(await screen.findByText(coverageFixture.disclosure)).toBeInTheDocument();
  });

  it("breaks out Level A, Level B and withheld counts", async () => {
    installLandingBackend();
    renderLanding();

    await screen.findByText("20,624");
    expect(screen.getByText("Level A — public by default")).toBeInTheDocument();
    expect(screen.getByText("Level B — shown on request, with warnings")).toBeInTheDocument();
    expect(screen.getByText("Held for internal review (not published)")).toBeInTheDocument();
    expect(screen.getByText("6,303")).toBeInTheDocument();
  });

  it("links into both directories", async () => {
    installLandingBackend();
    renderLanding();

    await screen.findByText("20,624");
    const playerLinks = screen.getAllByRole("link", { name: /players/i });
    expect(playerLinks.some((l) => l.getAttribute("href") === "/lol/docs/pro/players")).toBe(true);
    const teamLinks = screen.getAllByRole("link", { name: /teams/i });
    expect(teamLinks.some((l) => l.getAttribute("href") === "/lol/docs/pro/teams")).toBe(true);
  });

  it("does not claim every historical year is deployed", async () => {
    installLandingBackend();
    renderLanding();

    await screen.findByText("20,624");
    expect(
      screen.getByText(/historical years there are still being imported/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Roster history is not match/)).toBeInTheDocument();
  });

  it("shows a loading state, then an error state with a retry", async () => {
    installPendingFetch();
    const { unmount } = renderLanding();
    expect(screen.getByLabelText("Loading roster coverage")).toBeInTheDocument();
    unmount();

    vi.unstubAllGlobals();
    installFetch([[(u) => u.includes("/roster/coverage"), { status: 503, body: {} }]]);
    renderLanding();
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(within(alert).getByText(/Roster data is temporarily unavailable/)).toBeInTheDocument();
  });

  it("never requests Level C", async () => {
    installLandingBackend();
    renderLanding();
    await screen.findByText("20,624");
    expect(neverRequestedLevelC()).toBe(true);
  });
});

describe("roster landing SEO metadata", () => {
  it("sets an indexable title, description and canonical for the static route", async () => {
    installLandingBackend();
    renderLanding();
    await screen.findByText("20,624");

    await waitFor(() =>
      expect(document.title).toBe(
        "Pro Rosters — Player and Team History — League Docs | Mogzy",
      ),
    );
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toMatch(/roster history/i);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://mogzy.lol/lol/docs/pro/rosters",
    );
    // Public documentation: not excluded from indexing.
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe("search separates players from teams", () => {
  it("groups results by type and never merges them into one list", async () => {
    installLandingBackend();
    renderLanding();

    fireEvent.change(screen.getByLabelText("Search pro players and teams"), {
      target: { value: "T1" },
    });

    const teams = await screen.findByRole("region", { name: "Teams" });
    const players = await screen.findByRole("region", { name: "Players" });

    const teamHrefs = within(teams)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    const playerHrefs = within(players)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));

    expect(teamHrefs).toEqual([
      "/lol/docs/pro/teams/T1",
      "/lol/docs/pro/teams/T1%20Esports%20Academy",
    ]);
    expect(playerHrefs).toEqual([
      "/lol/docs/pro/players/T1en",
      "/lol/docs/pro/players/Tiger1",
    ]);

    // The team "T1" and the player "T1en" are similarly spelled and stay in
    // separate groups pointing at separate routes — never one merged entry.
    expect(teamHrefs.some((h) => h?.startsWith("/lol/docs/pro/players/"))).toBe(false);
    expect(playerHrefs.some((h) => h?.startsWith("/lol/docs/pro/teams/"))).toBe(false);
    expect(within(players).queryByText("T1 Esports Academy")).toBeNull();
  });

  it("shows which alias a result matched, without renaming the canonical page", async () => {
    installLandingBackend();
    renderLanding();

    fireEvent.change(screen.getByLabelText("Search pro players and teams"), {
      target: { value: "T1" },
    });

    const players = await screen.findByRole("region", { name: "Players" });
    const aliasHit = within(players).getByRole("link", { name: /Tiger1/ });
    expect(aliasHit).toHaveTextContent("matched via alias");
    expect(aliasHit).toHaveTextContent("T1ger");
    expect(aliasHit).toHaveAttribute("href", "/lol/docs/pro/players/Tiger1");
  });

  it("debounces: typing several characters issues one search, for the final term", async () => {
    installLandingBackend();
    renderLanding();

    const input = screen.getByLabelText("Search pro players and teams");
    fireEvent.change(input, { target: { value: "T" } });
    fireEvent.change(input, { target: { value: "T1" } });

    await screen.findByRole("region", { name: "Teams" });
    const searches = requestLog.filter((u) => u.includes("/roster/search"));
    expect(searches).toHaveLength(1);
    expect(searches[0]).toContain("q=T1");
  });

  it("issues no request for an empty or whitespace-only term", async () => {
    installLandingBackend();
    renderLanding();
    await screen.findByText("20,624");

    const input = screen.getByLabelText("Search pro players and teams");
    fireEvent.change(input, { target: { value: "   " } });

    await new Promise((r) => setTimeout(r, 350));
    expect(requestLog.filter((u) => u.includes("/roster/search"))).toHaveLength(0);
  });

  it("reports an empty result set without inventing a suggestion", async () => {
    installFetch([
      [(u) => u.includes("/roster/coverage"), { body: coverageFixture }],
      [(u) => u.includes("/roster/search"), { body: { query: "zzzz", results: [] } }],
    ]);
    renderLanding();

    fireEvent.change(screen.getByLabelText("Search pro players and teams"), {
      target: { value: "zzzz" },
    });
    expect(
      await screen.findByText(/No players or teams match “zzzz”/),
    ).toBeInTheDocument();
  });

  it("a slow earlier search cannot overwrite a newer one", async () => {
    // "Tig" resolves late with a stale result; "T1" resolves immediately.
    let releaseStale: (() => void) | null = null;
    const stalePayload = {
      query: "Tig",
      results: [
        { type: "player", page: "STALE", display_name: "STALE", matched_alias: null, region: null },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestLog.push(url);
        const json = async () => {
          if (url.includes("/roster/coverage")) return coverageFixture;
          if (url.includes("q=Tig")) return stalePayload;
          return mixedSearchFixture;
        };
        if (url.includes("q=Tig")) {
          await new Promise<void>((resolve) => {
            releaseStale = resolve;
          });
        }
        return { ok: true, status: 200, statusText: "OK", json } as Response;
      }),
    );

    renderLanding();
    const input = screen.getByLabelText("Search pro players and teams");

    fireEvent.change(input, { target: { value: "Tig" } });
    await waitFor(() => expect(requestLog.some((u) => u.includes("q=Tig"))).toBe(true));

    fireEvent.change(input, { target: { value: "T1" } });
    await screen.findByRole("region", { name: "Teams" });

    // Let the stale response land only now — it belongs to a different query
    // key and is discarded rather than replacing what is on screen.
    releaseStale?.();
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText("STALE")).toBeNull();
    expect(screen.getByRole("region", { name: "Teams" })).toHaveTextContent("T1");
  });

  it("passes an AbortSignal so superseded requests are cancelled", async () => {
    installLandingBackend();
    renderLanding();

    fireEvent.change(screen.getByLabelText("Search pro players and teams"), {
      target: { value: "T1" },
    });
    await screen.findByRole("region", { name: "Teams" });

    const searchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => String(url).includes("/roster/search"),
    );
    expect(searchCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("results are reachable by keyboard from the input", async () => {
    installLandingBackend();
    renderLanding();

    const input = screen.getByLabelText("Search pro players and teams");
    fireEvent.change(input, { target: { value: "T1" } });
    await screen.findByRole("region", { name: "Teams" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = document.querySelector("a[data-result]");
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first as Element, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(first);
    expect((document.activeElement as HTMLElement).matches("a[data-result]")).toBe(true);

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(document.activeElement).toBe(input);
  });
});
