// ---------------------------------------------------------------------------
// The Worlds experience's navigation model (UX1).
//
// FIVE PRIMARY SCREENS, FOUR BUILT. Overview / Stages / Teams / Schedule /
// Discover is the experience's final shape. Discover is carried here (so the
// shell can show the structure) with `ready: false` until verified
// intelligence content exists, so nothing can route to it.
//
// THE URL IS THE STATE. Screen and stage live in the path
// (`<base>/stages/swiss`, `<base>/schedule`), each screen's selections in
// the query, and each screen owns its own keys:
//   stages    ?match=<id>&round=<n>&step=<play-in cell slug>
//   teams     ?team=<code>&region=<region>
//   schedule  ?day=<YYYY-MM-DD>&stage=<stage slug>&match=<id>
// Moving to another screen drops the keys of the one left behind (no orphaned
// selection), and every other key (the dev page's `scenario` / `now`) is
// carried through untouched. Browser back / forward and a pasted link are
// therefore the same code path as a click.
//
// Pure: no React, no router. `WorldsExperience.tsx` wires it to the router.
// ---------------------------------------------------------------------------

export type ScreenKey = "overview" | "stages" | "teams" | "schedule" | "discover";

export interface ScreenDef {
  key: ScreenKey;
  label: string;
  /** Path segment under the experience base ("" for the landing screen). */
  segment: string;
  /** Implemented in this build. A screen that is not is shown, never routed to. */
  ready: boolean;
}

export const SCREENS: readonly ScreenDef[] = [
  { key: "overview", label: "Overview", segment: "", ready: true },
  { key: "stages", label: "Stages", segment: "stages", ready: true },
  { key: "teams", label: "Teams", segment: "teams", ready: true },
  { key: "schedule", label: "Schedule", segment: "schedule", ready: true },
  { key: "discover", label: "Discover", segment: "discover", ready: false },
];

export const READY_SCREENS = SCREENS.filter((s) => s.ready);

export const screenIndex = (key: ScreenKey) => SCREENS.findIndex((s) => s.key === key);

/** URL slugs for the stages the experience knows by name. A stage the registry
 *  adds later keeps its own key as its slug. */
const STAGE_SLUG: Record<string, string> = { play_in: "play-in", swiss: "swiss", knockout: "knockouts" };

/** Reader-facing names. "Knockouts" is what the stage is called in the nav;
 *  the registry writes "Knockout Stage". */
const STAGE_LABEL: Record<string, string> = { play_in: "Play-In", swiss: "Swiss", knockout: "Knockouts" };

export const stageSlug = (key: string) => STAGE_SLUG[key] ?? key;

export function stageLabel(stage: { key: string; name?: string }) {
  return STAGE_LABEL[stage.key] ?? (stage.name ?? stage.key).replace(/\s+stage$/i, "");
}

export function stageKeyFromSlug(slug: string | undefined, stageKeys: readonly string[]): string | null {
  if (!slug) return null;
  const key = stageKeys.find((k) => stageSlug(k) === slug.toLowerCase());
  return key ?? null;
}

/** The experience's own query keys. Anything else is carried through. */
export const MATCH_PARAM = "match";
export const ROUND_PARAM = "round";
/** The phone Play-In round (an upstream cell slug), independent of `round`. */
export const STEP_PARAM = "step";
export const TEAM_PARAM = "team";
export const REGION_PARAM = "region";
/** A local calendar day, `YYYY-MM-DD`, in the viewer's timezone. */
export const DAY_PARAM = "day";
/** The Schedule's stage filter, as a stage slug. */
export const FILTER_PARAM = "stage";

const OWNED = [MATCH_PARAM, ROUND_PARAM, STEP_PARAM, TEAM_PARAM, REGION_PARAM, DAY_PARAM, FILTER_PARAM];

export interface ExperienceLocation {
  screen: ScreenKey;
  /** The stage on the Stages screen; null elsewhere, or when the path names none. */
  stageSlug: string | null;
  /** The selected match (Stages and Schedule). */
  matchId: string | null;
  round: number | null;
  step: string | null;
  team: string | null;
  region: string | null;
  day: string | null;
  /** The Schedule's stage filter (a slug), null for all stages. */
  filter: string | null;
  /** The path asked for a screen this build does not have (or an unknown one). */
  unresolved: boolean;
}

const EMPTY = { stageSlug: null, matchId: null, round: null, step: null, team: null, region: null, day: null, filter: null };

const isDay = (v: string | null) => (v && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) ? v : null);
const isCode = (v: string | null) => (v && /^[A-Za-z0-9]{1,8}$/.test(v) ? v.toUpperCase() : null);
const isToken = (v: string | null) => (v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);

function trimSlashes(p: string) {
  return p.replace(/^\/+|\/+$/g, "");
}

/** Reads a location under `base` ("/lol/dev/worlds-experience"). */
export function parseLocation(base: string, pathname: string, search: string): ExperienceLocation {
  const rest = trimSlashes(pathname.startsWith(base) ? pathname.slice(base.length) : pathname);
  const [first = "", second] = rest ? rest.split("/") : [];
  const params = new URLSearchParams(search);
  const matchId = isToken(params.get(MATCH_PARAM));
  const roundRaw = Number(params.get(ROUND_PARAM));
  const round = Number.isInteger(roundRaw) && roundRaw > 0 ? roundRaw : null;
  const def = SCREENS.find((s) => s.segment === first.toLowerCase());
  if (!def || !def.ready) {
    return { screen: "overview", ...EMPTY, unresolved: first !== "" };
  }
  // Each screen reads only its own keys: a stray one is not shown.
  switch (def.key) {
    case "stages":
      return {
        screen: "stages",
        ...EMPTY,
        stageSlug: second ? second.toLowerCase() : null,
        matchId,
        round,
        step: isToken(params.get(STEP_PARAM)),
        unresolved: false,
      };
    case "teams":
      return { screen: "teams", ...EMPTY, team: isCode(params.get(TEAM_PARAM)), region: isToken(params.get(REGION_PARAM)), unresolved: false };
    case "schedule":
      return {
        screen: "schedule",
        ...EMPTY,
        matchId,
        day: isDay(params.get(DAY_PARAM)),
        filter: isToken(params.get(FILTER_PARAM))?.toLowerCase() ?? null,
        unresolved: false,
      };
    default:
      return { screen: def.key, ...EMPTY, unresolved: false };
  }
}

export interface Target {
  screen: ScreenKey;
  stageKey?: string | null;
  matchId?: string | null;
  round?: number | null;
  step?: string | null;
  team?: string | null;
  region?: string | null;
  day?: string | null;
  /** The Schedule filter, as a stage KEY ("play_in"); written as its slug. */
  filterKey?: string | null;
}

/**
 * The URL for a target, keeping every query key the experience does not own
 * (the dev page's scenario and clock, a tracking param) exactly as it was.
 */
export function buildHref(base: string, target: Target, currentSearch = ""): string {
  const def = SCREENS.find((s) => s.key === target.screen);
  if (!def || !def.ready) throw new Error(`screen not available: ${target.screen}`);
  const segs = [trimSlashes(base)];
  if (def.segment) segs.push(def.segment);
  if (def.key === "stages" && target.stageKey) segs.push(stageSlug(target.stageKey));
  const params = new URLSearchParams(currentSearch);
  for (const k of OWNED) params.delete(k);
  const set = (k: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
  };
  if (def.key === "stages") {
    set(MATCH_PARAM, target.matchId);
    set(ROUND_PARAM, target.round);
    set(STEP_PARAM, target.step);
  } else if (def.key === "teams") {
    set(REGION_PARAM, target.region);
    set(TEAM_PARAM, target.team);
  } else if (def.key === "schedule") {
    set(DAY_PARAM, target.day);
    set(FILTER_PARAM, target.filterKey ? stageSlug(target.filterKey) : null);
    set(MATCH_PARAM, target.matchId);
  }
  const qs = params.toString();
  return `/${segs.join("/")}${qs ? `?${qs}` : ""}`;
}

/* ── direction ──────────────────────────────────────────────────────────── */

export type Direction = -1 | 0 | 1;

export interface NavPosition {
  screen: ScreenKey;
  stageKey: string | null;
}

/**
 * Which way the workspace moves between two positions: by screen order
 * between screens, by stage order between stages of the Stages screen, and
 * not at all otherwise. Back / forward through history gets the same answer
 * as the click that made the entry, read from the other end — so returning
 * from Stages slides the Overview back in from the left.
 */
export function navDirection(from: NavPosition | null, to: NavPosition, stageKeys: readonly string[]): { level: "screen" | "stage" | "none"; dir: Direction } {
  if (!from) return { level: "none", dir: 0 };
  if (from.screen !== to.screen) {
    return { level: "screen", dir: Math.sign(screenIndex(to.screen) - screenIndex(from.screen)) as Direction };
  }
  if (to.screen === "stages" && from.stageKey && to.stageKey && from.stageKey !== to.stageKey) {
    const a = stageKeys.indexOf(from.stageKey);
    const b = stageKeys.indexOf(to.stageKey);
    return { level: "stage", dir: (a < 0 || b < 0 ? 0 : Math.sign(b - a)) as Direction };
  }
  return { level: "none", dir: 0 };
}

/** The neighbouring READY screen in a direction, or null at the edge. */
export function adjacentScreen(current: ScreenKey, dir: 1 | -1): ScreenKey | null {
  const i = READY_SCREENS.findIndex((s) => s.key === current);
  const next = READY_SCREENS[i + dir];
  return next ? next.key : null;
}
