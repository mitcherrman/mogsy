/**
 * The Worlds experience's navigation state (UX1): where the reader is (from
 * the URL, via `navigation.ts`), which way the last move went, and the
 * actions that move them. Every move is a router navigation, so the browser's
 * back / forward and a pasted link go through exactly the same path.
 *
 * HISTORY RULES
 * - A screen or stage change is a new history entry (back returns to it).
 * - Opening a detail (a match on Stages or Schedule, a team on Teams) is a
 *   new entry, so back (or the phone's back gesture) closes it; switching
 *   between matches or teams while it is open replaces that entry, and
 *   closing pops it, so the detail never piles up history. A detail that was
 *   deep-linked (no entry of its own to pop) closes in place.
 * - View settings replace the entry: a Swiss round, the phone Play-In round,
 *   the Schedule's day and stage filter, the Teams region. Each is in the URL
 *   (refresh and links keep it) without being a place to go back to.
 * - Selecting a match on the Schedule moves the board to that match's day.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import type { TournamentContextV2, TournamentMatchV2, TournamentStateV2 } from "@/lib/pro-play/tournamentApi";
import { defaultStageKey } from "@/lib/pro-play/worldsExperience/experienceView";
import { matchDay } from "@/lib/pro-play/worldsExperience/scheduleView";
import {
  buildHref,
  navDirection,
  parseLocation,
  stageKeyFromSlug,
  type Direction,
  type ExperienceLocation,
  type NavPosition,
  type Target,
} from "@/lib/pro-play/worldsExperience/navigation";

/** Desktop = the side-panel workspace; below it, the stacked phone layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

export function useMediaQuery(query: string) {
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return matches;
}

interface PanelState {
  ux1Panel?: boolean;
}

export interface Experience {
  base: string;
  loc: ExperienceLocation;
  /** The resolved stage on the Stages screen (the path's, else the default). */
  stageKey: string | null;
  stageKeys: string[];
  move: { level: "screen" | "stage" | "none"; dir: Direction };
  desktop: boolean;
  reduced: boolean;
  /** The Schedule's stage filter as a stage key (null: all stages). */
  filterKey: string | null;
  /** The data is a simulation (the prototype's scenarios), not real results. */
  simulated: boolean;
  hrefFor: (target: Target) => string;
  /** The URL for this screen with some of its selections changed. */
  hereHref: (patch: Partial<Target>) => string;
  go: (target: Target) => void;
  /** Select a match for the detail (toggles off when it is already selected).
   *  On the Stages and Schedule screens it stays on the screen; elsewhere it
   *  opens the match in the Schedule. */
  selectMatch: (matchId: string | null) => void;
  /** Select a team on the Teams screen (toggles off when already selected). */
  selectTeam: (code: string | null) => void;
  selectRound: (round: number) => void;
  selectStep: (step: string) => void;
  setDay: (day: string) => void;
  setFilter: (stageKey: string | null) => void;
  setRegion: (region: string | null) => void;
}

const ExperienceCtx = createContext<Experience | null>(null);

export function useExperience(): Experience {
  const x = useContext(ExperienceCtx);
  if (!x) throw new Error("useExperience outside ExperienceProvider");
  return x;
}

export function ExperienceProvider({ base, ctx, state, desktop: forcedDesktop, simulated = false, children }: {
  base: string;
  ctx: Pick<TournamentContextV2, "stages">;
  state: Pick<TournamentStateV2, "phase" | "phase_detail"> & { matches: readonly TournamentMatchV2[] };
  /** Tests pin the layout; the page reads the viewport. */
  desktop?: boolean;
  simulated?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const measured = useMediaQuery(DESKTOP_QUERY);
  const desktop = forcedDesktop ?? measured;
  const reduced = useReducedMotion() === true;
  const stageKeys = useMemo(() => ctx.stages.map((s) => s.key), [ctx.stages]);

  const loc = useMemo(() => parseLocation(base, location.pathname, location.search), [base, location.pathname, location.search]);
  const pathStage = stageKeyFromSlug(loc.stageSlug ?? undefined, stageKeys);
  const fallbackStage = defaultStageKey(state, ctx);
  const stageKey = loc.screen === "stages" ? (pathStage ?? fallbackStage) : null;
  const filterKey = loc.screen === "schedule" ? stageKeyFromSlug(loc.filter ?? undefined, stageKeys) : null;

  // Direction of the move that produced this entry, read against the last one.
  const pos: NavPosition = { screen: loc.screen, stageKey };
  const last = useRef<{ key: string; pos: NavPosition; move: Experience["move"] } | null>(null);
  if (!last.current || last.current.key !== location.key) {
    last.current = { key: location.key, pos, move: navDirection(last.current?.pos ?? null, pos, stageKeys) };
  }
  const move = last.current.move;

  // A path this build has no screen for, or a stage the event does not have,
  // is corrected in place (replace), never left half-drawn.
  useEffect(() => {
    if (loc.unresolved) navigate(buildHref(base, { screen: "overview" }, location.search), { replace: true });
    else if (loc.screen === "stages" && loc.stageSlug && !pathStage && fallbackStage) {
      navigate(buildHref(base, { screen: "stages", stageKey: fallbackStage, matchId: loc.matchId, round: loc.round, step: loc.step }, location.search), { replace: true });
    }
  }, [loc, pathStage, fallbackStage, base, location.search, navigate]);

  const hrefFor = useCallback((target: Target) => buildHref(base, target, location.search), [base, location.search]);

  /** This screen, as it is, with `patch` applied. */
  const here = useCallback(
    (patch: Partial<Target>): Target => ({
      screen: loc.screen,
      stageKey,
      matchId: loc.matchId,
      round: loc.round,
      step: loc.step,
      team: loc.team,
      region: loc.region,
      day: loc.day,
      filterKey,
      ...patch,
    }),
    [loc, stageKey, filterKey],
  );
  const hereHref = useCallback((patch: Partial<Target>) => buildHref(base, here(patch), location.search), [base, here, location.search]);
  /** A view setting: same entry, same history state (an open detail stays poppable). */
  const replaceHere = useCallback(
    (patch: Partial<Target>) => navigate(buildHref(base, here(patch), location.search), { replace: true, state: location.state }),
    [base, here, location.search, location.state, navigate],
  );
  /**
   * Opens, switches or closes a detail selection with the history rules
   * above. `key` is the selection's field; `patch` adds what must move with it.
   */
  const detail = useCallback(
    (key: "matchId" | "team", value: string | null, patch: Partial<Target> = {}) => {
      const open = key === "matchId" ? loc.matchId : loc.team;
      if (!value || value === open) {
        if (!open) return;
        if ((location.state as PanelState | null)?.ux1Panel) navigate(-1);
        else navigate(buildHref(base, here({ [key]: null }), location.search), { replace: true });
        return;
      }
      const href = buildHref(base, here({ [key]: value, ...patch }), location.search);
      if (open) navigate(href, { replace: true, state: location.state });
      else navigate(href, { state: { ux1Panel: true } satisfies PanelState });
    },
    [loc.matchId, loc.team, base, here, location.search, location.state, navigate],
  );

  const go = useCallback(
    (target: Target) => {
      const href = buildHref(base, target, location.search);
      // Opening a match or team from elsewhere (the Overview's "View in
      // bracket", a team's fixture) is the same history entry as opening it
      // in place: back closes it.
      navigate(href, target.matchId || target.team ? { state: { ux1Panel: true } satisfies PanelState } : undefined);
    },
    [base, location.search, navigate],
  );

  const matches = state.matches;
  const selectMatch = useCallback(
    (matchId: string | null) => {
      const m = matchId ? matches.find((x) => x.match_id === matchId) : null;
      if (loc.screen === "schedule") {
        // The board follows the match to its day (and out of a filter that hides it).
        const patch: Partial<Target> = m ? { day: matchDay(m) ?? loc.day, filterKey: filterKey && m.stage !== filterKey ? null : filterKey } : {};
        detail("matchId", matchId, patch);
      } else if (loc.screen === "stages") {
        detail("matchId", matchId);
      } else if (m) {
        go({ screen: "schedule", day: matchDay(m), matchId: m.match_id });
      }
    },
    [matches, loc.screen, loc.day, filterKey, detail, go],
  );

  const selectTeam = useCallback(
    (code: string | null) => {
      if (loc.screen === "teams") detail("team", code ? code.toUpperCase() : null);
      else if (code) go({ screen: "teams", team: code.toUpperCase() });
    },
    [loc.screen, detail, go],
  );

  const selectRound = useCallback((round: number) => replaceHere({ round }), [replaceHere]);
  const selectStep = useCallback((step: string) => replaceHere({ step }), [replaceHere]);
  const setDay = useCallback((day: string) => replaceHere({ day }), [replaceHere]);
  const setFilter = useCallback((key: string | null) => replaceHere({ filterKey: key }), [replaceHere]);
  const setRegion = useCallback((region: string | null) => replaceHere({ region }), [replaceHere]);

  const value = useMemo<Experience>(
    () => ({
      base,
      loc,
      stageKey,
      stageKeys,
      move,
      desktop,
      reduced,
      filterKey,
      simulated,
      hrefFor,
      hereHref,
      go,
      selectMatch,
      selectTeam,
      selectRound,
      selectStep,
      setDay,
      setFilter,
      setRegion,
    }),
    [base, loc, stageKey, stageKeys, move, desktop, reduced, filterKey, simulated, hrefFor, hereHref, go, selectMatch, selectTeam, selectRound, selectStep, setDay, setFilter, setRegion],
  );
  return <ExperienceCtx.Provider value={value}>{children}</ExperienceCtx.Provider>;
}
