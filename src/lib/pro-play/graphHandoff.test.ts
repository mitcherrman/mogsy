/**
 * The stats -> graph hand-off.
 *
 * Two kinds of assertion here, and the second kind is the point:
 *  - a supported filter reaches the graph URL, and
 *  - an unsupported one is REPORTED, never quietly dropped and never
 *    reinterpreted into a graph concept that means something else.
 *
 * The round-trip suite runs generated hrefs back through the graph page's own
 * `parseSelection` and `parseScope`, so this module cannot drift away from the
 * destination it is naming — which is what lets the parameter names live here
 * instead of being imported from the page bundle.
 */
import { describe, expect, it } from "vitest";

import { graphHandoff, GRAPH_ROUTE, type ProStatsScope } from "./graphHandoff";
import { parseScope } from "@/graph1/scope";
import { parseSelection } from "@/pages/lol/ProPlayGraphs";

const EMPTY: ProStatsScope = {
  view: "players",
  year: null,
  league: null,
  patch: null,
  role: null,
  player: null,
  team: null,
  champion: null,
  minGames: null,
};

const scope = (over: Partial<ProStatsScope>): ProStatsScope => ({ ...EMPTY, ...over });

/** The query the graph page would actually see. */
function params(over: Partial<ProStatsScope>) {
  const handoff = graphHandoff(scope(over));
  if (!handoff) throw new Error("expected a hand-off");
  expect(handoff.href.startsWith(`${GRAPH_ROUTE}?`)).toBe(true);
  return new URLSearchParams(handoff.href.split("?")[1]);
}

describe("when the action exists at all", () => {
  it("withholds itself when the scope names no subject to graph", () => {
    // A ranking of every player in 2026 is not a graph of anything; pointing
    // at the graph page's default entity would be a different question.
    expect(graphHandoff(scope({ year: 2026, league: "LoL Champions Korea" }))).toBeNull();
    expect(graphHandoff(scope({ view: "teams", year: 2026 }))).toBeNull();
    expect(graphHandoff(scope({ view: "champions", year: 2026, role: "Mid" }))).toBeNull();
  });

  it("appears as soon as one entity filter names a subject", () => {
    expect(graphHandoff(scope({ player: "Faker" }))).not.toBeNull();
    expect(graphHandoff(scope({ view: "teams", team: "Gen.G" }))).not.toBeNull();
    expect(graphHandoff(scope({ view: "champions", champion: "Azir" }))).not.toBeNull();
  });
});

describe("supported scope transfers", () => {
  it("carries the year as the date window it already is", () => {
    const p = params({ player: "Faker", year: 2026 });
    expect(p.get("from")).toBe("2026-01-01");
    expect(p.get("to")).toBe("2026-12-31");
    expect(parseScope(p)).toMatchObject({ dateFrom: "2026-01-01", dateTo: "2026-12-31" });
  });

  it("carries the league verbatim -- both layers key on league_slug", () => {
    const p = params({ player: "Faker", league: "LoL Champions Korea" });
    expect(parseScope(p).league).toBe("LoL Champions Korea");
  });

  it("carries the patch", () => {
    expect(parseScope(params({ player: "Faker", patch: "26.18" })).patch).toBe("26.18");
  });

  it("carries a player as the graph's player focus", () => {
    const p = params({ player: "Faker" });
    expect(parseSelection(p)).toMatchObject({
      focus: "player",
      entityId: "Faker",
    });
    expect(parseSelection(p).combination.compare).toBe("champions");
  });

  it("carries a team as the graph's team focus", () => {
    const p = params({ view: "teams", team: "Gen.G" });
    expect(parseSelection(p)).toMatchObject({ focus: "team", entityId: "Gen.G" });
    expect(parseSelection(p).combination.compare).toBe("champions");
  });

  it("carries a champion as a slug, which is the graph's champion identity", () => {
    const p = params({ view: "champions", champion: "Lee Sin" });
    expect(parseSelection(p)).toMatchObject({ focus: "champion", entityId: "lee-sin" });
  });

  it("never narrows the universe beyond what the table asked for", () => {
    // `major` is a graph-only narrowing with no table equivalent; sending it
    // would hand back a smaller corpus than the rows the reader came from.
    expect(parseScope(params({ player: "Faker", year: 2026 })).major).toBe(false);
  });
});

describe("filters that do not transfer", () => {
  it("leaves min_games with the table and says so", () => {
    const handoff = graphHandoff(scope({ player: "Faker", minGames: 20 }))!;
    expect(handoff.href).not.toContain("min_games");
    expect(handoff.href).not.toContain("20");
    expect(handoff.dropped).toContain("Min games 20");
  });

  it("leaves role with the table and says so", () => {
    const handoff = graphHandoff(scope({ view: "champions", champion: "Azir", role: "Mid" }))!;
    expect(handoff.href).not.toContain("role");
    expect(handoff.dropped).toContain("Role Mid");
  });

  it("reports the entity filter that could not also be the focus", () => {
    // "Faker + Azir" graphs Faker's champions -- Azir is one of the bars --
    // but the graph is not restricted to Azir, and the reader is told.
    const handoff = graphHandoff(scope({ player: "Faker", champion: "Azir" }))!;
    expect(handoff.entityLabel).toBe("Faker");
    expect(handoff.dropped).toContain("Champion Azir");
  });

  it("names every transferred filter, so the two lists together are the scope", () => {
    const handoff = graphHandoff(
      scope({
        view: "players",
        year: 2026,
        league: "LoL Champions Korea",
        patch: "26.18",
        role: "Mid",
        player: "Faker",
        minGames: 20,
      }),
    )!;
    expect(handoff.transferred).toEqual([
      "Player",
      "Year 2026",
      "LoL Champions Korea",
      "Patch 26.18",
    ]);
    expect(handoff.dropped).toEqual(["Role Mid", "Min games 20"]);
  });

  it("carries no table presentation state at all", () => {
    const href = graphHandoff(scope({ player: "Faker", year: 2026 }))!.href;
    for (const owned of ["page", "page_size", "sort", "dir", "view"]) {
      expect(new URLSearchParams(href.split("?")[1]).has(owned)).toBe(false);
    }
  });
});

describe("each view follows the graph's actual capability", () => {
  it("graphs a champion against PLAYERS from the players table", () => {
    const p = params({ view: "players", champion: "Azir" });
    expect(parseSelection(p).combination.compare).toBe("players");
  });

  it("graphs a champion against TEAMS from the teams table", () => {
    const p = params({ view: "teams", champion: "Azir" });
    expect(parseSelection(p).combination.compare).toBe("teams");
  });

  it("cannot graph a player or a team from the champions table", () => {
    // There is no family whose focus is a player and whose bars are champion
    // rates, so a champions ranking filtered only to Faker has nowhere to go.
    expect(graphHandoff(scope({ view: "champions", player: "Faker" }))).toBeNull();
    expect(graphHandoff(scope({ view: "champions", team: "Gen.G" }))).toBeNull();
  });

  it("prefers the subject the table is ranking when both are set", () => {
    expect(graphHandoff(scope({ view: "teams", team: "Gen.G", champion: "Azir" }))!.focus)
      .toBe("team");
  });
});
