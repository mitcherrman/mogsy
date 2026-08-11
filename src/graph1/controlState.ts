/**
 * Race control state and its URL representation.
 *
 * A race view is reproducible from its URL: dataset, top-N, year window,
 * region and league selections, and any display toggle that differs from the
 * dataset's declared default. Defaults are omitted from the query string, so
 * the common case stays a clean `/dev/graph1` and a shared link carries only
 * what the sharer actually changed.
 *
 * Parsing is total: every malformed, out-of-range or unknown value falls back
 * to the default rather than throwing. A hand-edited URL degrades to a valid
 * race, never to a blank page.
 *
 * Nothing here reads the clock or mutates its inputs, so serialize → parse →
 * serialize is a fixed point (tested).
 */
import {
  GRAPH1_TOGGLE_KEYS,
  type Graph1ControlSchema,
  type Graph1DisplayToggles,
} from "./contract";
import { EMPTY_FILTERS, type Graph1FilterState } from "./filters";

export const DEFAULT_TOP_N = 10;
export const FALLBACK_TOP_N_OPTIONS = [5, 10, 15, 20];
export const FALLBACK_SPEED_OPTIONS = [0.5, 1, 2, 4, 8, 10];

export interface Graph1ControlState {
  datasetKey: string;
  topN: number;
  filters: Graph1FilterState;
  toggles: Graph1DisplayToggles;
}

/** URL parameter names, kept short and stable — they are a shared surface. */
const PARAM = {
  dataset: "d",
  topN: "top",
  yearFrom: "from",
  yearTo: "to",
  regions: "region",
  leagues: "league",
  toggleOff: "off",
} as const;

export function topNOptions(controls?: Graph1ControlSchema): number[] {
  const options = controls?.topN?.options;
  return options && options.length ? options : FALLBACK_TOP_N_OPTIONS;
}

export function defaultTopN(controls?: Graph1ControlSchema): number {
  const declared = controls?.topN?.default;
  const options = topNOptions(controls);
  return declared !== undefined && options.includes(declared)
    ? declared
    : options.includes(DEFAULT_TOP_N)
      ? DEFAULT_TOP_N
      : options[0];
}

export function speedOptions(controls?: Graph1ControlSchema): number[] {
  const options = controls?.speed?.options;
  return options && options.length ? options : FALLBACK_SPEED_OPTIONS;
}

export function defaultSpeed(controls?: Graph1ControlSchema): number {
  const declared = controls?.speed?.default;
  const options = speedOptions(controls);
  return declared !== undefined && options.includes(declared) ? declared : 1;
}

// ---------------------------------------------------------------------------
// parsing

function parseYear(raw: string | null): number | null {
  if (!raw) return null;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 1900 && year <= 2999 ? year : null;
}

function parseList(params: URLSearchParams, key: string): string[] {
  const values = params
    .getAll(key)
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  // de-duplicate, preserving first-seen order so round-trips are stable
  return [...new Set(values)];
}

function parseTopN(raw: string | null, controls?: Graph1ControlSchema): number {
  const options = topNOptions(controls);
  const value = Number(raw);
  return options.includes(value) ? value : defaultTopN(controls);
}

/**
 * Read control state out of a query string.
 *
 * `defaults` supplies the dataset's declared toggle defaults, so `off=` only
 * ever has to name the toggles the user actually turned off.
 */
export function parseControlState(
  params: URLSearchParams,
  defaults: Graph1DisplayToggles,
  options: { datasetKey: string; controls?: Graph1ControlSchema },
): Graph1ControlState {
  const off = new Set(parseList(params, PARAM.toggleOff));
  const toggles = { ...defaults };
  for (const key of GRAPH1_TOGGLE_KEYS) {
    if (off.has(key)) toggles[key] = false;
  }

  const yearFrom = parseYear(params.get(PARAM.yearFrom));
  const yearTo = parseYear(params.get(PARAM.yearTo));

  return {
    datasetKey: params.get(PARAM.dataset) || options.datasetKey,
    topN: parseTopN(params.get(PARAM.topN), options.controls),
    filters: {
      ...EMPTY_FILTERS,
      // an inverted window is repaired rather than yielding an empty race
      yearFrom:
        yearFrom !== null && yearTo !== null && yearFrom > yearTo
          ? yearTo
          : yearFrom,
      yearTo,
      regions: parseList(params, PARAM.regions),
      leagues: parseList(params, PARAM.leagues),
    },
    toggles,
  };
}

// ---------------------------------------------------------------------------
// serialization

/**
 * Query string for a control state. Only non-default values are written, and
 * keys are emitted in a fixed order so equal state always yields an identical
 * string.
 */
export function serializeControlState(
  state: Graph1ControlState,
  defaults: Graph1DisplayToggles,
  options: { controls?: Graph1ControlSchema; preserve?: URLSearchParams } = {},
): URLSearchParams {
  const params = new URLSearchParams();

  // carry through params this module does not own (e.g. ?api=)
  if (options.preserve) {
    const owned = new Set<string>(Object.values(PARAM));
    for (const [key, value] of options.preserve.entries()) {
      if (!owned.has(key)) params.append(key, value);
    }
  }

  params.set(PARAM.dataset, state.datasetKey);
  if (state.topN !== defaultTopN(options.controls)) {
    params.set(PARAM.topN, String(state.topN));
  }
  if (state.filters.yearFrom !== null) {
    params.set(PARAM.yearFrom, String(state.filters.yearFrom));
  }
  if (state.filters.yearTo !== null) {
    params.set(PARAM.yearTo, String(state.filters.yearTo));
  }
  if (state.filters.regions.length) {
    params.set(PARAM.regions, state.filters.regions.join(","));
  }
  if (state.filters.leagues.length) {
    params.set(PARAM.leagues, state.filters.leagues.join(","));
  }
  const off = GRAPH1_TOGGLE_KEYS.filter(
    (key) => state.toggles[key] !== defaults[key] && !state.toggles[key],
  );
  if (off.length) params.set(PARAM.toggleOff, off.join(","));

  return params;
}

/** Initial state for a dataset, before any URL is applied. */
export function initialControlState(
  datasetKey: string,
  defaults: Graph1DisplayToggles,
  controls?: Graph1ControlSchema,
): Graph1ControlState {
  return {
    datasetKey,
    topN: defaultTopN(controls),
    filters: EMPTY_FILTERS,
    toggles: { ...defaults },
  };
}
