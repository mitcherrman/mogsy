/**
 * Scope: URL round-trip, backend query construction, and the two guarantees
 * that keep the product honest — no raw universe, and exact canonical values.
 */
import { describe, expect, it } from "vitest";

import {
  ALL_PRO_SCOPE,
  describeScope,
  isScoped,
  parseScope,
  scopeQuery,
  SCOPE_PARAM_NAMES,
  writeScope,
  type Graph1Scope,
} from "./scope";

const parse = (search: string) => parseScope(new URLSearchParams(search));

function roundTrip(scope: Graph1Scope): Graph1Scope {
  const params = new URLSearchParams();
  writeScope(params, scope);
  return parseScope(params);
}

describe("scope round-trip", () => {
  it("survives every dimension, composed", () => {
    const scope: Graph1Scope = {
      major: true,
      league: "LoL Champions Korea",
      tournament: "Worlds 2024 Main Event",
      region: "Korea",
      patch: "16.15",
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
    };
    expect(roundTrip(scope)).toEqual(scope);
  });

  it("writes nothing at all for an unscoped graph", () => {
    const params = new URLSearchParams();
    writeScope(params, ALL_PRO_SCOPE);
    expect(params.toString()).toBe("");
    expect(isScoped(ALL_PRO_SCOPE)).toBe(false);
  });

  it("clears a previous scope rather than merging into it", () => {
    const params = new URLSearchParams("league=LCK&patch=16.1&major=1");
    writeScope(params, { major: false, region: "Korea" });
    expect(params.get("league")).toBeNull();
    expect(params.get("patch")).toBeNull();
    expect(params.get("major")).toBeNull();
    expect(params.get("region")).toBe("Korea");
  });

  it("carries the EXACT canonical value, never a friendly label", () => {
    // `league=LCK` matches nothing in the backend; the canonical identity does.
    const scope = parse("league=LoL+Champions+Korea");
    expect(scope.league).toBe("LoL Champions Korea");
    expect(scopeQuery(scope).league).toBe("LoL Champions Korea");
  });
});

describe("parsing is total", () => {
  it("drops a malformed date instead of sending a 400", () => {
    expect(parse("from=last-tuesday").dateFrom).toBeUndefined();
    expect(parse("to=2024-13").dateTo).toBeUndefined();
  });

  it("repairs an inverted window", () => {
    const scope = parse("from=2024-12-31&to=2024-01-01");
    expect(scope.dateFrom).toBe("2024-01-01");
    expect(scope.dateTo).toBe("2024-01-01");
  });

  it("treats anything but major=1 as not major", () => {
    expect(parse("major=1").major).toBe(true);
    expect(parse("major=true").major).toBe(false);
    expect(parse("").major).toBe(false);
  });
});

describe("backend query", () => {
  it("sends nothing for the broad professional universe", () => {
    // The unscoped request must stay byte-identical to the pre-Phase-E one, so
    // every existing deep link resolves to exactly the payload it always did.
    expect(scopeQuery(ALL_PRO_SCOPE)).toEqual({});
  });

  it("maps the public URL names onto the API's", () => {
    expect(
      scopeQuery({
        major: true,
        league: "LoL Champions Korea",
        tournament: "MSI 2024",
        region: "Korea",
        patch: "16.15",
        dateFrom: "2024-01-01",
        dateTo: "2024-06-30",
      }),
    ).toEqual({
      major: "true",
      league: "LoL Champions Korea",
      tournament: "MSI 2024",
      region: "Korea",
      patch: "16.15",
      date_from: "2024-01-01",
      date_to: "2024-06-30",
    });
  });
});

describe("no raw universe exists", () => {
  it("has no field, parameter or query that can ask for unfiltered data", () => {
    // The backend readers accept `apply_policy=False`, but Graph1Scope has no
    // field that can express it and neither does this. The TYPE is the
    // guarantee: "All Pro Play" is already a filtered professional universe.
    const keys = Object.keys(roundTrip({ major: false })).concat(
      SCOPE_PARAM_NAMES as string[],
      Object.keys(scopeQuery({ major: true })),
    );
    for (const key of keys) {
      expect(key).not.toMatch(/raw|unfiltered|policy|apply_policy|universe/i);
    }
  });

  it("never spells the highlight with its internal name", () => {
    const params = new URLSearchParams();
    writeScope(params, { major: true });
    expect(params.toString()).toBe("major=1");
    expect(params.toString()).not.toMatch(/MAJOR_PRO|pro_broad|PRO_TEAM/);
  });
});

describe("describeScope", () => {
  it("names the broad universe as a product, not a policy", () => {
    expect(describeScope(ALL_PRO_SCOPE)).toBe("All Pro Play");
    expect(describeScope({ major: true })).toBe("Major Pro");
  });

  it("prefers the friendly label when discovery supplies one", () => {
    expect(
      describeScope({ major: false, league: "LoL Champions Korea" }, {
        league: "LCK",
      }),
    ).toBe("LCK");
  });

  it("prints an unknown value rather than dropping it", () => {
    expect(describeScope({ major: false, league: "Some League" })).toBe(
      "Some League",
    );
  });

  it("lets the tournament speak for its league, and composes the rest", () => {
    expect(
      describeScope({
        major: false,
        league: "World Championship",
        tournament: "Worlds 2024 Main Event",
        patch: "14.18",
      }),
    ).toBe("Worlds 2024 Main Event · Patch 14.18");
  });
});
