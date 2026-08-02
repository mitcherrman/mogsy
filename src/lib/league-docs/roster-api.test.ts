/**
 * Contract tests for the roster API client: exact identifier round-tripping,
 * the Level A/B/C request surface, and HTTP error mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiStatusError,
  encodeLpPage,
  getRosterCoverage,
  getRosterPlayer,
  getRosterPlayerMemberships,
  getRosterPlayers,
  getRosterTeam,
  getRosterTeamMemberships,
  getRosterTeams,
  playerRoute,
  searchRoster,
  teamRoute,
} from "./roster-api";
import {
  coverageFixture,
  flureFixture,
  m1ngSearchFixture,
  playersFixture,
  teamLevelABFixture,
  teamLevelAFixture,
  teamsFixture,
} from "./roster-fixtures";

let requestedUrls: string[] = [];

function mockFetch(body: unknown, status = 200, statusText = "OK") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json: async () => body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  requestedUrls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** The single URL the client requested, minus the API base. */
function lastPath(): string {
  const url = requestedUrls[requestedUrls.length - 1];
  return url.slice(url.indexOf("/api/"));
}

describe("lpPage encoding", () => {
  it("preserves case exactly — M1nG and M1ng encode differently", () => {
    expect(encodeLpPage("M1nG")).toBe("M1nG");
    expect(encodeLpPage("M1ng")).toBe("M1ng");
    expect(encodeLpPage("M1nG")).not.toBe(encodeLpPage("M1ng"));
  });

  it("escapes spaces, parentheses, slashes and non-ASCII without normalising", () => {
    expect(encodeLpPage("100 Thieves")).toBe("100%20Thieves");
    expect(encodeLpPage("300 (North American Team)")).toBe("300%20(North%20American%20Team)");
    expect(encodeLpPage("24/7 Tower Dive")).toBe("24%2F7%20Tower%20Dive");
    expect(encodeLpPage("0ri (Adam Matěj)")).toBe("0ri%20(Adam%20Mat%C4%9Bj)");
  });

  it("never lowercases, trims or slugifies", () => {
    expect(encodeLpPage("SK Telecom T1")).toBe("SK%20Telecom%20T1");
    expect(encodeLpPage("SK Telecom T1")).not.toContain("sk-telecom");
  });

  it("builds routes from the encoded identifier", () => {
    expect(playerRoute("M1ng")).toBe("/lol/docs/pro/players/M1ng");
    expect(playerRoute("0ri (Adam Matěj)")).toBe(
      "/lol/docs/pro/players/0ri%20(Adam%20Mat%C4%9Bj)",
    );
    expect(teamRoute("100 Thieves")).toBe("/lol/docs/pro/teams/100%20Thieves");
  });
});

describe("directory requests", () => {
  it("sends page and page_size, and omits an empty query", async () => {
    mockFetch(playersFixture);
    await getRosterPlayers({ page: 3 });
    expect(lastPath()).toBe("/api/docs/pro/roster/players?page=3&page_size=25");
  });

  it("passes the search term through with its original casing", async () => {
    mockFetch(playersFixture);
    await getRosterPlayers({ query: "M1nG" });
    expect(lastPath()).toContain("query=M1nG");
    expect(lastPath()).not.toContain("query=m1ng");
  });

  it("sends the teams region filter only when provided", async () => {
    mockFetch(teamsFixture);
    await getRosterTeams({ query: "T1", region: "Korea" });
    expect(lastPath()).toContain("query=T1");
    expect(lastPath()).toContain("region=Korea");
  });

  it("tolerates a malformed payload without throwing", async () => {
    mockFetch({ players: null, pagination: playersFixture.pagination });
    await expect(getRosterPlayers()).resolves.toMatchObject({ players: [] });
  });
});

describe("eligibility request surface", () => {
  it("defaults to Level A only", async () => {
    mockFetch(teamLevelAFixture);
    await getRosterTeam("100 Thieves");
    expect(lastPath()).toContain("eligibility=A");
    expect(lastPath()).not.toContain("eligibility=AB");
    expect(lastPath()).not.toContain("include_warning");
  });

  it("opts into Level B with the backend's AB selector plus include_warning", async () => {
    mockFetch(teamLevelABFixture);
    await getRosterTeam("100 Thieves", "AB");
    expect(lastPath()).toContain("eligibility=AB");
    expect(lastPath()).toContain("include_warning=true");
  });

  it("never requests Level C from any roster endpoint", async () => {
    mockFetch(flureFixture);
    await getRosterPlayer("Flure", "AB");
    await getRosterPlayerMemberships("Flure", { eligibility: "AB" });
    mockFetch(teamLevelABFixture);
    await getRosterTeam("100 Thieves", "AB");
    await getRosterTeamMemberships("100 Thieves", { eligibility: "AB" });
    for (const url of requestedUrls) {
      expect(url).not.toMatch(/eligibility=[^&]*C/);
    }
  });

  it("carries eligibility through to the paginated memberships endpoints", async () => {
    mockFetch({ memberships: [], pagination: { page: 2, page_size: 25, total: 0, total_pages: 0 }, eligibility_shown: ["A"], hidden_count: 0 });
    await getRosterPlayerMemberships("Flure", { page: 2 });
    expect(lastPath()).toBe(
      "/api/docs/pro/roster/players/Flure/memberships?page=2&page_size=25&eligibility=A",
    );
  });
});

describe("responses", () => {
  it("returns coverage with source years intact", async () => {
    mockFetch(coverageFixture);
    const coverage = await getRosterCoverage();
    expect(coverage.total_players).toBe(20624);
    expect(coverage.source_years).toContain(2026);
    expect(coverage.disclosure).toContain("Level A rows are shown by default");
  });

  it("keeps Level B rows labelled with their backend warning code", async () => {
    mockFetch(teamLevelABFixture);
    const team = await getRosterTeam("100 Thieves", "AB");
    const flagged = team.memberships.filter((m) => m.eligibility_level === "B");
    expect(flagged).toHaveLength(1);
    expect(flagged[0].warning_code).toBe("academy_main_overlap");
    expect(team.eligibility_shown).toEqual(["A", "B"]);
  });

  it("separates search results by type without merging identities", async () => {
    mockFetch(m1ngSearchFixture);
    const { results } = await searchRoster("M1nG");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "player", page: "Flure", matched_alias: "M1nG" });
  });
});

describe("HTTP error mapping", () => {
  it("throws ApiStatusError(404) with the backend detail for an unknown page", async () => {
    mockFetch({ detail: "Player not found." }, 404, "Not Found");
    await expect(getRosterPlayer("Nope Does Not Exist")).rejects.toMatchObject({
      name: "ApiStatusError",
      status: 404,
    });
  });

  it("throws ApiStatusError(422) for a rejected parameter", async () => {
    mockFetch({ detail: "eligibility must be 'A' or 'AB'; Level C is not public" }, 422, "Unprocessable Entity");
    const err = await getRosterTeam("100 Thieves").catch((e) => e);
    expect(err).toBeInstanceOf(ApiStatusError);
    expect(err.status).toBe(422);
    expect(err.message).toContain("Level C is not public");
  });

  it("throws ApiStatusError(500) and (503) with the status preserved", async () => {
    mockFetch({}, 500, "Internal Server Error");
    await expect(getRosterCoverage()).rejects.toMatchObject({ status: 500 });
    mockFetch({}, 503, "Service Unavailable");
    await expect(getRosterCoverage()).rejects.toMatchObject({ status: 503 });
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response),
    );
    await expect(getRosterCoverage()).rejects.toMatchObject({ status: 502 });
  });
});
