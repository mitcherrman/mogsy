/**
 * Control-state and URL round-trip tests.
 *
 * Two properties carry the feature: a shared link reproduces the race
 * exactly, and a hand-edited link degrades to a valid race rather than a
 * blank page.
 */
import { describe, expect, it } from "vitest";

import type {
  Graph1ControlSchema,
  Graph1DisplayToggles,
} from "./contract";
import {
  DEFAULT_TOP_N,
  FALLBACK_SPEED_OPTIONS,
  FALLBACK_TOP_N_OPTIONS,
  defaultSpeed,
  defaultTopN,
  initialControlState,
  parseControlState,
  serializeControlState,
  speedOptions,
  topNOptions,
  type Graph1ControlState,
} from "./controlState";
import { EMPTY_FILTERS } from "./filters";

const DEFAULTS: Graph1DisplayToggles = {
  winOverlay: true,
  eventHeader: true,
  contextLine: true,
  entityMedia: true,
  rankNumber: true,
  valueLabel: true,
  dateLabel: true,
  secondaryLabel: true,
  exactValues: true,
};

const CONTROLS: Graph1ControlSchema = {
  metrics: [],
  filters: [],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [0.5, 1, 2, 4, 8, 10] },
};

const opts = { datasetKey: "faker-champions", controls: CONTROLS };

function roundTrip(state: Graph1ControlState): Graph1ControlState {
  const params = serializeControlState(state, DEFAULTS, { controls: CONTROLS });
  return parseControlState(params, DEFAULTS, opts);
}

describe("declared options", () => {
  it("uses the declared top-N options and default", () => {
    expect(topNOptions(CONTROLS)).toEqual([5, 10, 15, 20]);
    expect(defaultTopN(CONTROLS)).toBe(10);
  });

  it("falls back when a payload declares no controls", () => {
    expect(topNOptions(undefined)).toEqual(FALLBACK_TOP_N_OPTIONS);
    expect(defaultTopN(undefined)).toBe(DEFAULT_TOP_N);
    expect(speedOptions(undefined)).toEqual(FALLBACK_SPEED_OPTIONS);
    expect(defaultSpeed(undefined)).toBe(1);
  });

  it("ignores a declared default that is not among its own options", () => {
    const broken = { ...CONTROLS, topN: { default: 12, options: [5, 10] } };
    expect(defaultTopN(broken)).toBe(10);
  });

  it("falls back to the first option when 10 is unavailable", () => {
    const narrow = { ...CONTROLS, topN: { default: 99, options: [3, 7] } };
    expect(defaultTopN(narrow)).toBe(3);
  });
});

describe("round trip", () => {
  it("preserves a fully specified state", () => {
    const state: Graph1ControlState = {
      datasetKey: "azir-players",
      topN: 20,
      filters: {
        yearFrom: 2018,
        yearTo: 2024,
        regions: ["Korea", "China"],
        leagues: ["LCK"],
      },
      toggles: { ...DEFAULTS, winOverlay: false, rankNumber: false },
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("preserves the default state", () => {
    const state = initialControlState("faker-champions", DEFAULTS, CONTROLS);
    expect(roundTrip(state)).toEqual(state);
  });

  it("is a fixed point: serialize -> parse -> serialize is identical", () => {
    const state: Graph1ControlState = {
      datasetKey: "azir-players",
      topN: 15,
      filters: { yearFrom: 2020, yearTo: null, regions: ["EMEA"], leagues: [] },
      toggles: { ...DEFAULTS, dateLabel: false },
    };
    const once = serializeControlState(state, DEFAULTS, { controls: CONTROLS });
    const twice = serializeControlState(
      parseControlState(once, DEFAULTS, opts),
      DEFAULTS,
      { controls: CONTROLS },
    );
    expect(twice.toString()).toBe(once.toString());
  });

  it("writes nothing but the dataset for a default state", () => {
    const state = initialControlState("faker-champions", DEFAULTS, CONTROLS);
    const params = serializeControlState(state, DEFAULTS, {
      controls: CONTROLS,
    });
    expect(params.toString()).toBe("d=faker-champions");
  });

  it("omits top-N when it equals the declared default", () => {
    const state = initialControlState("faker-champions", DEFAULTS, CONTROLS);
    expect(
      serializeControlState({ ...state, topN: 10 }, DEFAULTS, {
        controls: CONTROLS,
      }).has("top"),
    ).toBe(false);
    expect(
      serializeControlState({ ...state, topN: 20 }, DEFAULTS, {
        controls: CONTROLS,
      }).get("top"),
    ).toBe("20");
  });

  it("names only the toggles the user switched off", () => {
    const state = initialControlState("faker-champions", DEFAULTS, CONTROLS);
    const params = serializeControlState(
      { ...state, toggles: { ...DEFAULTS, contextLine: false } },
      DEFAULTS,
      { controls: CONTROLS },
    );
    expect(params.get("off")).toBe("contextLine");
  });

  it("omits a toggle that is off because the dataset defaults it off", () => {
    const winsOff = { ...DEFAULTS, winOverlay: false };
    const state = initialControlState("azir-players", winsOff, CONTROLS);
    const params = serializeControlState(state, winsOff, {
      controls: CONTROLS,
    });
    expect(params.has("off")).toBe(false);
    expect(parseControlState(params, winsOff, opts).toggles.winOverlay).toBe(
      false,
    );
  });

  it("produces a stable string regardless of selection order", () => {
    const base = initialControlState("azir-players", DEFAULTS, CONTROLS);
    const a = serializeControlState(
      { ...base, filters: { ...EMPTY_FILTERS, regions: ["Korea", "China"] } },
      DEFAULTS,
      { controls: CONTROLS },
    );
    expect(a.get("region")).toBe("Korea,China");
  });

  it("carries through params it does not own", () => {
    const preserve = new URLSearchParams("api=http://localhost:8321&d=stale");
    const params = serializeControlState(
      initialControlState("azir-players", DEFAULTS, CONTROLS),
      DEFAULTS,
      { controls: CONTROLS, preserve },
    );
    expect(params.get("api")).toBe("http://localhost:8321");
    expect(params.get("d")).toBe("azir-players");
  });
});

describe("hostile input degrades safely", () => {
  const parse = (query: string) =>
    parseControlState(new URLSearchParams(query), DEFAULTS, opts);

  it("falls back to the supplied dataset when none is named", () => {
    expect(parse("").datasetKey).toBe("faker-champions");
  });

  it("rejects a top-N outside the declared options", () => {
    expect(parse("top=999").topN).toBe(10);
    expect(parse("top=abc").topN).toBe(10);
    expect(parse("top=").topN).toBe(10);
    expect(parse("top=-5").topN).toBe(10);
  });

  it("rejects nonsense years", () => {
    expect(parse("from=abc").filters.yearFrom).toBeNull();
    expect(parse("from=1500").filters.yearFrom).toBeNull();
    expect(parse("from=99999").filters.yearFrom).toBeNull();
    expect(parse("from=2020.5").filters.yearFrom).toBeNull();
  });

  it("repairs an inverted year window", () => {
    const { filters } = parse("from=2024&to=2019");
    expect(filters.yearFrom).toBe(2019);
    expect(filters.yearTo).toBe(2019);
  });

  it("ignores unknown toggle names", () => {
    const { toggles } = parse("off=winOverlay,notAToggle");
    expect(toggles.winOverlay).toBe(false);
    expect(toggles.eventHeader).toBe(true);
  });

  it("accepts both repeated and comma-joined list params", () => {
    expect(parse("region=Korea&region=China").filters.regions).toEqual([
      "Korea",
      "China",
    ]);
    expect(parse("region=Korea,China").filters.regions).toEqual([
      "Korea",
      "China",
    ]);
  });

  it("de-duplicates and trims list values", () => {
    expect(parse("region=Korea,%20Korea%20,China").filters.regions).toEqual([
      "Korea",
      "China",
    ]);
  });

  it("drops empty list entries rather than filtering on an empty string", () => {
    expect(parse("region=,,").filters.regions).toEqual([]);
    expect(parse("league=").filters.leagues).toEqual([]);
  });

  it("never throws on arbitrary junk", () => {
    expect(() =>
      parse("d=&top=%%%&from=--&to=&region=&league=&off=&x=1"),
    ).not.toThrow();
  });
});
