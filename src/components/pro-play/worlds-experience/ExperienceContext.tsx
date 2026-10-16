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
 *
 * SELECTIONS NEVER CONTRADICT THE VIEW (UX2A)
 * - A view setting that a selected match or team does not fit clears that
 *   selection (a date the match is not played on, a stage filter that excludes
 *   it, a region the team is not in); one it fits keeps it. A stage filter
 *   that leaves the shown day without fixtures moves to the day the board
 *   would open on, and writes it, so the URL says what is shown.
 * - A link read the other way round lets the detail lead (`reconcile*`): the
 *   match's day and stage, the team's region. `loc` is that reconciled
 *   reading, so every consumer sees one answer.
 * - A detail's own history entry is popped to close it only while the
 *   workspace beneath it is the one on screen. Once a view setting has moved
 *   (or has cleared the detail), the entry has no marker and closes in place:
 *   closing never snaps a filter back.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import type { TournamentContextV2, TournamentMatchV2, TournamentStateV2 } from "@/lib/pro-play/tournamentApi";
import { defaultStageKey } from "@/lib/pro-play/worldsExperience/experienceView";
import { matchDay, pickDay, reconcileSchedule, scheduleDays } from "@/lib/pro-play/worldsExperience/scheduleView";
import { participantByCode, reconcileTeams } from "@/lib/pro-play/worldsExperience/teamsView";
import {
  buildHref,
  navDirection,
  parseLocation,
  stageKeyFromSlug,
  stageSlug,
  type Direction,
  type ExperienceLocation,
  type NavPosition,
  type Target,
} from "@/lib/pro-play/worldsExperience/navigation";

/** Desktop = the side-panel workspace; below it, the stacked phone layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
/**
 * UX5 — a phone turned sideways (844 × 390, 740 × 360): wide and short. The
 * portrait compositions stack controls above content and run out of height
 * there, so below the desktop width a landscape screen this short lays its
 * screens out side by side instead (controls beside content, one-row bar).
 */
export const LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 560px)";

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

/** `ux1Panel`: this entry was pushed to open the detail in its URL, so popping it closes it. */
interface PanelState {
  ux1Panel?: boolean;
}

/** The history state of an entry that no longer sits on top of the workspace it was pushed from. */
function withoutPanel(state: unknown): PanelState | undefined {
  const { ux1Panel: _panel, ...rest } = (state ?? {}) as PanelState;
  return Object.keys(rest).length ? rest : undefined;
}

export interface Experience {
  base: string;
  loc: ExperienceLocation;
  /** The resolved stage on the Stages screen (the path's, else the default). */
  stageKey: string | null;
  stageKeys: string[];
  move: { level: "screen" | "stage" | "none"; dir: Direction };
  desktop: boolean;
  /** A short landscape phone (never true with `desktop`): side-by-side compositions. */
  landscape: boolean;
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

export function ExperienceProvider({ base, ctx, state, now, desktop: forcedDesktop, landscape: forcedLandscape, simulated = false, children }: {
  base: string;
  ctx: Pick<TournamentContextV2, "stages" | "participants">;
  state: Pick<TournamentStateV2, "phase" | "phase_detail"> & { matches: readonly TournamentMatchV2[] };
  /** The page's clock: the day the Schedule opens on can depend on it. */
  now: number;
  /** Tests pin the layout; the page reads the viewport. */
  desktop?: boolean;
  /** Tests pin the landscape-phone layout; the page reads the viewport. */
  landscape?: boolean;
  simulated?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const measured = useMediaQuery(DESKTOP_QUERY);
  const desktop = forcedDesktop ?? measured;
  const measuredLandscape = useMediaQuery(LANDSCAPE_QUERY);
  const landscape = !desktop && (forcedLandscape ?? measuredLandscape);
  const reduced = useReducedMotion() === true;
  const stageKeys = useMemo(() => ctx.stages.map((s) => s.key), [ctx.stages]);

  const parsed = useMemo(() => parseLocation(base, location.pathname, location.search), [base, location.pathname, location.search]);
  // The URL as read, made consistent with what was served: the Schedule's
  // match, day and filter agree, and the Teams' team and region agree.
  const loc = useMemo(() => {
    if (parsed.screen === "schedule") {
      const sel = reconcileSchedule(state, { matchId: parsed.matchId, day: parsed.day, filterKey: stageKeyFromSlug(parsed.filter ?? undefined, stageKeys) });
      return { ...parsed, matchId: sel.matchId, day: sel.day, filter: sel.filterKey ? stageSlug(sel.filterKey) : null };
    }
    if (parsed.screen === "teams") return { ...parsed, ...reconcileTeams(ctx, parsed) };
    return parsed;
  }, [parsed, state, ctx, stageKeys]);
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
  /**
   * A view setting: same entry. The entry that opened a detail keeps its
   * marker only while nothing it sits on has moved; a setting that changed
   * (or that cleared the detail) makes it an ordinary entry, so closing the
   * detail afterwards happens in place instead of popping back to the
   * workspace as it was before the setting.
   */
  const replaceHere = useCallback(
    (patch: Partial<Target>) => {
      const next = here(patch);
      const current = here({});
      const moved = (Object.keys(next) as (keyof Target)[]).some((k) => (next[k] ?? null) !== (current[k] ?? null));
      navigate(buildHref(base, next, location.search), { replace: true, state: moved ? withoutPanel(location.state) : location.state });
    },
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

  // The match on screen (already reconciled with the day and filter), if any.
  const shownMatch = loc.screen === "schedule" && loc.matchId ? matches.find((m) => m.match_id === loc.matchId) : undefined;

  /** A date keeps the match only if it is played that day. */
  const setDay = useCallback(
    (day: string) => replaceHere({ day, matchId: shownMatch && matchDay(shownMatch) === day ? shownMatch.match_id : null }),
    [replaceHere, shownMatch],
  );

  /**
   * A stage filter keeps the match only if it belongs to the stage, and the
   * day is the one the board will show (the same day when it has fixtures
   * under the new filter, else `pickDay`'s choice) so the URL says what is
   * shown. No fixtures under the filter: no day, nothing invented.
   */
  const setFilter = useCallback(
    (key: string | null) => {
      const shownDay = pickDay(scheduleDays({ matches }, filterKey), loc.day, now);
      const day = pickDay(scheduleDays({ matches }, key), shownDay, now);
      replaceHere({ filterKey: key, day, matchId: shownMatch && (!key || shownMatch.stage === key) ? shownMatch.match_id : null });
    },
    [matches, filterKey, loc.day, now, replaceHere, shownMatch],
  );

  /** A region keeps the team only if it plays in it. */
  const setRegion = useCallback(
    (region: string | null) => {
      const p = participantByCode(ctx, loc.team);
      replaceHere({ region, team: p && region && p.region !== region ? null : loc.team });
    },
    [ctx, loc.team, replaceHere],
  );

  const value = useMemo<Experience>(
    () => ({
      base,
      loc,
      stageKey,
      stageKeys,
      move,
      desktop,
      landscape,
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
    [base, loc, stageKey, stageKeys, move, desktop, landscape, reduced, filterKey, simulated, hrefFor, hereHref, go, selectMatch, selectTeam, selectRound, selectStep, setDay, setFilter, setRegion],
  );
  return <ExperienceCtx.Provider value={value}>{children}</ExperienceCtx.Provider>;
}
