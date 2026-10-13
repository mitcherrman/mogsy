// ---------------------------------------------------------------------------
// The Worlds experience's navigation model (UX1).
//
// FIVE PRIMARY SCREENS, TWO BUILT. Overview / Stages / Teams / Schedule /
// Discover is the experience's final shape; only Overview and Stages are
// implemented, and the other three are carried here (so the shell can show
// the structure) with `ready: false` so nothing can route to them.
//
// THE URL IS THE STATE. Screen and stage live in the path
// (`<base>/stages/swiss`), the selected match and Swiss round in the query
// (`?match=<id>&round=3`). Every other query key (the dev page's
// `scenario` / `now`) is carried through untouched, so a link built here never
// drops context it did not create. Browser back / forward and a pasted link
// are therefore the same code path as a click.
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
  { key: "teams", label: "Teams", segment: "teams", ready: false },
  { key: "schedule", label: "Schedule", segment: "schedule", ready: false },
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

export interface ExperienceLocation {
  screen: ScreenKey;
  /** The stage on the Stages screen; null elsewhere, or when the path names none. */
  stageSlug: string | null;
  matchId: string | null;
  round: number | null;
  /** The path asked for a screen this build does not have (or an unknown one). */
  unresolved: boolean;
}

function trimSlashes(p: string) {
  return p.replace(/^\/+|\/+$/g, "");
}

/** Reads a location under `base` ("/lol/dev/worlds-experience"). */
export function parseLocation(base: string, pathname: string, search: string): ExperienceLocation {
  const rest = trimSlashes(pathname.startsWith(base) ? pathname.slice(base.length) : pathname);
  const [first = "", second] = rest ? rest.split("/") : [];
  const params = new URLSearchParams(search);
  const matchId = params.get(MATCH_PARAM) || null;
  const roundRaw = Number(params.get(ROUND_PARAM));
  const round = Number.isInteger(roundRaw) && roundRaw > 0 ? roundRaw : null;
  const def = SCREENS.find((s) => s.segment === first.toLowerCase());
  if (!def || !def.ready) {
    return { screen: "overview", stageSlug: null, matchId: null, round: null, unresolved: first !== "" };
  }
  if (def.key === "stages") {
    return { screen: "stages", stageSlug: second ? second.toLowerCase() : null, matchId, round, unresolved: false };
  }
  // The Overview has no selection of its own: a stray `match` is not shown.
  return { screen: def.key, stageSlug: null, matchId: null, round: null, unresolved: false };
}

export interface Target {
  screen: ScreenKey;
  stageKey?: string | null;
  matchId?: string | null;
  round?: number | null;
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
  params.delete(MATCH_PARAM);
  params.delete(ROUND_PARAM);
  if (def.key === "stages") {
    if (target.matchId) params.set(MATCH_PARAM, target.matchId);
    if (target.round) params.set(ROUND_PARAM, String(target.round));
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
